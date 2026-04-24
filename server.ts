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

  // --- CRITICAL: FAST PATH HEALTH CHECKS ---
  // Guaranteed JSON responses with diagnostic headers
  const healthHandler = (req: express.Request, res: express.Response) => {
    console.log(`[HEALTH] Match on ${req.originalUrl || req.url}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Response-Source', 'Express-Hardened');
    return res.status(200).send(JSON.stringify({ 
      status: "ok", 
      v: "9.0-Final",
      env: process.env.NODE_ENV || 'production',
      time: new Date().toISOString()
    }));
  };

  app.get('/api/health', healthHandler);
  app.get('/status', healthHandler);
  app.get('/healthz', healthHandler);
  app.get('/ping', (req, res) => res.json({ pong: true }));

  // INCREASE PAYLOAD LIMIT
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ROOT LEVEL LOGGING
  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
  });

  // Dedicated API Router
  const apiRouter = express.Router();
  
  // Internal API health check
  apiRouter.get('/health', healthHandler);

  apiRouter.all("/smartsheet-api-proxy", async (req, res) => {
    console.log(`[API] Smartsheet Proxy Match: ${req.method}`);
    const sheetId = req.method === 'POST' ? req.body.sheetId : req.query.sheetId;
    const token = req.method === 'POST' ? req.body.token : req.query.token;

    if (!sheetId || !token) {
      console.warn("[API] Missing Auth/ID", { sheetId: !!sheetId, token: !!token });
      return res.status(400).json({ error: "Missing Sheet ID or Authorization Token" });
    }

    try {
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const text = await response.text();
        console.error("[API] Smartsheet Error", response.status, text);
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("[API] Sync Error", error.message);
      res.status(500).json({ error: "Sync failed", details: error.message });
    }
  });

  apiRouter.post("/upload-to-dropbox", async (req, res) => {
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

  apiRouter.get("/proxy-site-data", async (req, res) => {
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

  // MOUNT API ROUTER FIRST
  app.use("/api", apiRouter);

  // Fallback for /api to avoid index.html bleed
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not Found", path: req.url });
  });

  // --- STATIC FILES NEXT ---

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
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: "API route not found" });
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
