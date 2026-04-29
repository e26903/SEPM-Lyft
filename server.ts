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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', true);
  app.set('strict routing', false);
  app.set('case sensitive routing', false);

  // --- 1. LOGGING MIDDLEWARE (TOP) ---
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - User-Agent: ${req.headers['user-agent']}`);
    next();
  });

  // --- 2. API ROUTES (PRIORITY) ---
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check routes
  const healthReply = (req: any, res: any) => {
    console.log(`[API-HEALTH] Request from ${req.ip} to ${req.originalUrl}`);
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      status: "ok", 
      v: "207.0", 
      env: process.env.NODE_ENV,
      p: req.path,
      url: req.originalUrl,
      proto: req.headers['x-forwarded-proto'] || 'unknown'
    });
  };

  const handleSmartsheetProxy = async (req: any, res: any) => {
    console.log(`[PROXY] ${req.method} ${req.originalUrl}`);
    let sheetId = req.params.sheetId || req.query.sheetId;
    if (!sheetId && req.body && req.body.sheetId) sheetId = req.body.sheetId;
    let token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token && req.query.token) token = req.query.token;
    if (!token && req.body && req.body.token) token = req.body.token;

    if (!sheetId || !token) {
      console.warn("[PROXY-ERR] Missing credentials for Smartsheet");
      return res.status(400).json({ error: "Missing Credentials" });
    }

    try {
      console.log(`[PROXY-FETCH] Requesting Smartsheet for ID: ${sheetId}`);
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const text = await response.text();
        console.error(`[PROXY-FETCH-ERR] Remote status: ${response.status}`);
        return res.status(response.status).json({ error: `Smartsheet ${response.status}`, details: text });
      }
      const data = await response.json();
      console.log(`[PROXY-FETCH-SUCCESS] Got ${data.rows?.length} rows`);
      res.json(data);
    } catch (error: any) {
      console.error(`[PROXY-EXCEPTION] ${error.message}`);
      res.status(500).json({ error: "Proxy Exception", details: error.message });
    }
  };

  // Direct mounting instead of router for maximum reliability
  app.get("/api/health", healthReply);
  app.get("/api/ping", healthReply);
  app.get("/api/status", healthReply);
  app.get("/api/v2/test", (req, res) => res.json({ v: 2, env: process.env.NODE_ENV }));

  app.all("/api/smartsheet-api-proxy", handleSmartsheetProxy);
  app.all("/api/smartsheet-api-proxy/:sheetId", handleSmartsheetProxy);

  app.post("/api/upload-to-dropbox", async (req: any, res: any) => {
    console.log("[API-DROPBOX] Upload started");
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
      console.error("[API-DROPBOX-ERR]", error.message);
      res.status(500).json({ error: "Dropbox failed", details: error.message });
    }
  });

  app.get("/api/proxy-site-data", async (req: any, res: any) => {
    console.log("[API-PROXY-CSV] Fetch started");
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: "Missing URL" });
    try {
      const response = await fetch(url);
      const data = await response.text();
      res.setHeader('Content-Type', 'text/csv').send(data);
    } catch (error: any) {
      console.error("[API-PROXY-CSV-ERR]", error.message);
      res.status(500).json({ error: "Proxy failed", details: error.message });
    }
  });

  // Backup root health
  app.get("/api-health", healthReply);
  app.get("/health", healthReply);
  app.get("/ping", healthReply);

  // --- 5. STATIC FILES & PRODUCTION SERVING ---
  const publicPath = path.join(process.cwd(), 'public');
  const distPath = path.join(process.cwd(), 'dist');
  const indexPath = path.join(distPath, 'index.html');

  // Priority Mode Check: Only use production if dist/index.html is actually present
  const hasDist = fs.existsSync(indexPath);
  if (!hasDist && process.env.NODE_ENV === "production") {
    console.error(`[BOOT-CRITICAL] Dist folder missing at ${distPath}! Listing parent:`);
    try {
      console.log(`[BOOT-LS] ${process.cwd()}: ${fs.readdirSync(process.cwd()).join(', ')}`);
    } catch {}
  }
  const isProductionMode = process.env.NODE_ENV === "production" && hasDist;
  
  console.log(`[BOOT] Mode: ${isProductionMode ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  if (!isProductionMode && !hasDist && process.env.NODE_ENV === "production") {
    console.warn("[WARN] NODE_ENV is production but dist/index.html is missing! Falling back to dev/Vite.");
  }

  if (!isProductionMode) {
    console.log("[BOOT] Starting Vite Middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[BOOT] Serving Static Assets...");
    app.use(express.static(distPath, { index: false }));
    if (fs.existsSync(publicPath)) {
      app.use(express.static(publicPath, { index: false }));
    }
    
    app.get('*', (req, res) => {
      // API routes should already be handled, but as a safety for trailing slashes or missed matches:
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: "API Route Not Found", path: req.path });
      }
      
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error("[ERROR] Failed to send index.html:", err);
          res.status(500).send("Server Error: Missing entry point");
        }
      });
    });
  }



  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[SERVER-ERROR]", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
