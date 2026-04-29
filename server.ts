import express from "express";
import path from "path";
import fs from "fs";
import { Dropbox } from "dropbox";

async function configureServer() {
  const app = express();
  
  // Basic settings
  app.set('trust proxy', true);
  
  // --- 1. LOGGING MIDDLEWARE ---
  app.use((req, res, next) => {
    // Immediate log for every request to /api
    if (req.url.startsWith('/api')) {
      console.log(`[SERVE] ${req.method} ${req.url}`);
    }
    next();
  });

  // --- 2. CORS & PARSING ---
  try {
    const cors = (await import("cors")).default;
    app.use(cors());
  } catch (err) {
    console.warn("CORS module not available, skipping...");
  }
  
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // --- 3. API ROUTES ---
  const apiRouter = express.Router();

  const healthReply = (req: any, res: any) => {
    res.json({ 
      status: "ok", 
      v: "213.0", 
      env: process.env.NODE_ENV,
      vercel: !!process.env.VERCEL,
      path: req.path,
      url: req.url,
      host: req.headers.host
    });
  };

  // SMARTSHEET PROXY
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

  apiRouter.get("/ping", healthReply);
  apiRouter.get("/health", healthReply);
  apiRouter.all("/smartsheet-api-proxy", handleSmartsheetProxy);
  apiRouter.all("/smartsheet-api-proxy/:sheetId", handleSmartsheetProxy);

  // DROPBOX UPLOAD
  apiRouter.post("/upload-to-dropbox", async (req: any, res: any) => {
    const { pdfBase64, fileName, accessToken } = req.body;
    if (!pdfBase64 || !fileName) return res.status(400).json({ error: "Missing data" });
    const token = accessToken || process.env.DROPBOX_ACCESS_TOKEN;
    if (!token) return res.status(401).json({ error: "Missing token" });

    try {
      const dbx = new Dropbox({ accessToken: token });
      const buffer = Buffer.from(pdfBase64, 'base64');
      await dbx.filesUpload({ path: `/${fileName}`, contents: buffer, mode: { '.tag': 'overwrite' } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Dropbox failed", details: error.message });
    }
  });

  // SITE DATA PROXY
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

  // Mount API router
  app.use("/api", apiRouter);

  // Fallback for missing API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: "API Route Not Found", path: req.path, url: req.url });
  });

  // --- 4. STATIC FILES & SPA FALLBACK (FOR NON-VERCEL DEPLOYMENTS) ---
  if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

    if (process.env.NODE_ENV === "production" && hasDist) {
      app.use(express.static(distPath, { index: false }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }
  }

  return app;
}

// Singleton pattern for the server instance
let serverInstance: any = null;
async function getInstance() {
  if (!serverInstance) serverInstance = await configureServer();
  return serverInstance;
}

// Development server start
if (!process.env.VERCEL) {
  getInstance().then(app => {
    const port = process.env.PORT || 3000;
    app.listen(port, "0.0.0.0", () => {
      console.log(`[SERVER] Running on http://localhost:${port}`);
    });
  });
}

// Vercel entry point
export default async (req: any, res: any) => {
  if (process.env.VERCEL) {
    console.log(`[VERCEL] Incoming ${req.method} ${req.url}`);
  }
  const app = await getInstance();
  return app(req, res);
};

