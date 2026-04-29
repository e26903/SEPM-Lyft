import express from "express";
console.log("[SERVER] Bootstrapping...");

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
import path from "path";
import fs from "fs";
import { Dropbox } from "dropbox";
import bodyParser from "body-parser";

const app = express();

async function configureServer() {
  const PORT = 3000;

  app.set('trust proxy', true);
  app.set('strict routing', false);
  app.set('case sensitive routing', false);

  // --- 1. LOGGING MIDDLEWARE ---
  app.use((req, res, next) => {
    // Only log API and main page requests to avoid log noise
    if (req.url.startsWith('/api/') || req.url === '/') {
      console.log(`[REQ] ${req.method} ${req.url}`);
    }
    next();
  });

  // --- 2. API ROUTES ---
  const cors = (await import("cors")).default;
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const apiRouter = express.Router();

  const healthReply = (req: any, res: any) => {
    res.json({ 
      status: "ok", 
      v: "210.0", 
      env: process.env.NODE_ENV,
      p: req.path,
      url: req.originalUrl,
      host: req.headers.host
    });
  };

  const handleSmartsheetProxy = async (req: any, res: any) => {
    let sheetId = req.params.sheetId || req.query.sheetId;
    if (!sheetId && req.body && req.body.sheetId) sheetId = req.body.sheetId;
    let token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token && req.query.token) token = req.query.token;
    if (!token && req.body && req.body.token) token = req.body.token;

    if (!sheetId || !token) {
      return res.status(400).json({ error: "Missing Smartsheet credentials" });
    }

    try {
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Smartsheet API ${response.status}`, details: text });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Smartsheet Proxy Error", details: error.message });
    }
  };

  apiRouter.get("/health", healthReply);
  apiRouter.get("/ping", healthReply);
  apiRouter.all("/smartsheet-api-proxy", handleSmartsheetProxy);
  apiRouter.all("/smartsheet-api-proxy/:sheetId", handleSmartsheetProxy);

  apiRouter.post("/upload-to-dropbox", async (req: any, res: any) => {
    const { pdfBase64, fileName, accessToken } = req.body;
    if (!pdfBase64 || !fileName) return res.status(400).json({ error: "Missing data" });
    const token = accessToken || process.env.DROPBOX_ACCESS_TOKEN;
    if (!token) return res.status(401).json({ error: "No token" });

    try {
      const dbx = new Dropbox({ accessToken: token });
      const buffer = Buffer.from(pdfBase64, 'base64');
      await dbx.filesUpload({ path: `/${fileName}`, contents: buffer, mode: { '.tag': 'overwrite' } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Dropbox failed", details: error.message });
    }
  });

  apiRouter.get("/proxy-site-data", async (req: any, res: any) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: "Missing URL" });
    try {
      const response = await fetch(url);
      const data = await response.text();
      res.setHeader('Content-Type', 'text/csv').send(data);
    } catch (error: any) {
      res.status(500).json({ error: "CSV Proxy failed", details: error.message });
    }
  });

  app.use("/api", apiRouter);

  // Fallback for API
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: "API Route Not Found", path: req.url });
  });

  // --- 3. STATIC FILES & SPA FALLBACK ---
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV === "production" && hasDist) {
    console.log("[BOOT] Production mode: Serving dist/ as static");
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res, next) => {
      // Don't intercept API calls here if they missed the router
      if (req.path.startsWith('/api/')) return next(); 
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else if (!process.env.VERCEL) {
    // In dev or non-Vercel environment where dist is missing
    console.log("[BOOT] Development mode: Starting Vite Middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  return app;
}

// Global instance for reuse
let serverApp: any = null;

async function getServer() {
  if (!serverApp) {
    serverApp = await configureServer();
  }
  return serverApp;
}

// Non-blocking start for dev server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  getServer().then(app => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });
}

// Export for Vercel
export default async (req: any, res: any) => {
  const app = await getServer();
  return app(req, res);
};
