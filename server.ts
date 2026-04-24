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

  // Essential settings
  app.set('trust proxy', true);
  app.set('strict routing', false);
  app.set('case sensitive routing', false);

  // --- 1. GLOBAL LOGGING & RESILIENCE ---
  app.use((req, res, next) => {
    const isApi = req.url.startsWith('/api') || ['/ping', '/status', '/healthz'].includes(req.path);
    if (isApi) {
      console.log(`[REQ] ${req.method} ${req.url} (from: ${req.ip})`);
    }
    next();
  });

  // --- 2. CORE HEALTH CHECKS (TOP PRIORITY) ---
  const healthHandler = (req: any, res: any) => {
    console.log(`[HEALTH] Responding to ${req.path}`);
    res.status(200).json({ 
      status: "ok", 
      v: "13.0", 
      env: process.env.NODE_ENV,
      p: req.path
    });
  };

  app.get('/ping', healthHandler);
  app.get('/api/ping', healthHandler);
  app.get('/api/health', healthHandler);
  app.get('/status', healthHandler);
  app.get('/healthz', healthHandler);

  // --- 3. MIDDLEWARE ---
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // --- 4. API PROXY ROUTES ---
  // Registered individually for maximum compatibility
  app.get("/api/smartsheet-api-proxy", handleSmartsheetProxy);
  app.post("/api/smartsheet-api-proxy", handleSmartsheetProxy);
  
  async function handleSmartsheetProxy(req: any, res: any) {
    console.log(`[PROXY] Handling Smartsheet Sync: ${req.method}`);
    const sheetId = req.method === 'POST' ? req.body.sheetId : req.query.sheetId;
    const token = req.method === 'POST' ? req.body.token : req.query.token;

    if (!sheetId || !token) {
      console.warn("[PROXY] Missing params", { sheetId: !!sheetId, token: !!token });
      return res.status(400).json({ error: "Missing Sheet ID or Authorization Token" });
    }

    try {
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("[PROXY] Failed:", error.message);
      res.status(500).json({ error: "Sync failed", details: error.message });
    }
  }

  app.post("/api/upload-to-dropbox", async (req, res) => {
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
      res.status(500).json({ error: "Upload failed", details: error.message });
    }
  });

  app.get("/api/proxy-site-data", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: "Missing URL" });
    try {
      const response = await fetch(url);
      const data = await response.text();
      res.setHeader('Content-Type', 'text/csv');
      res.send(data);
    } catch (error: any) {
      res.status(500).json({ error: "CSV failed", details: error.message });
    }
  });

  // --- 5. STATIC FILES & SPA FALLBACK ---

  const publicPath = path.join(process.cwd(), 'public');

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // Serve static files from dist/ (production build)
    app.use(express.static(distPath, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
        if (filePath.endsWith('.gif')) res.setHeader('Content-Type', 'image/gif');
      }
    }));

    // Fallback to public/ for non-built assets
    app.use(express.static(publicPath));

    app.get('*', (req, res) => {
      // API check to ensure we don't serve HTML for /api errors
      if (req.path.startsWith('/api') || req.path === '/ping' || req.path === '/status' || req.path === '/healthz') {
        return res.status(404).json({ error: "API route not found", path: req.path });
      }

      // Remove query string for file check
      const cleanPath = req.path.split('?')[0];
      const distFilePath = path.join(distPath, cleanPath);
      const publicFilePath = path.join(publicPath, cleanPath);
      
      if (fs.existsSync(distFilePath) && fs.lstatSync(distFilePath).isFile()) {
        const ext = path.extname(cleanPath).toLowerCase();
        if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
        if (ext === '.gif') res.setHeader('Content-Type', 'image/gif');
        if (ext === '.jpg' || ext === '.jpeg') res.setHeader('Content-Type', 'image/jpeg');
        
        // Add streaming headers
        res.setHeader('Accept-Ranges', 'bytes');
        return res.sendFile(distFilePath);
      }

      if (fs.existsSync(publicFilePath) && fs.lstatSync(publicFilePath).isFile()) {
        const ext = path.extname(cleanPath).toLowerCase();
        if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
        if (ext === '.gif') res.setHeader('Content-Type', 'image/gif');
        if (ext === '.jpg' || ext === '.jpeg') res.setHeader('Content-Type', 'image/jpeg');
        
        // Add streaming headers
        res.setHeader('Accept-Ranges', 'bytes');
        return res.sendFile(publicFilePath);
      }

      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
