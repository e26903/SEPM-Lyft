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

  // --- 1. GLOBAL LOGGING ---
  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
  });

  // --- 2. EMERGENCY ROUTING OVERRIDE (FIX 404s) ---
  // We handle these before ANY other middleware or routers
  app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (p === '/ping' || p === '/healthz' || p === '/health' || p === '/status' || p === '/api/ping' || p === '/api/health') {
      return res.status(200).json({ 
        status: "ok", 
        v: "16.1", 
        env: process.env.NODE_ENV,
        p: req.path,
        timestamp: new Date().toISOString()
      });
    }
    next();
  });

  // --- 3. MIDDLEWARE ---
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // --- 4. API HUB ---
  // Mount directly for maximum visibility
  app.all("/api/smartsheet-api-proxy", async (req, res) => {
    const sheetId = req.method === 'POST' ? req.body.sheetId : req.query.sheetId;
    const token = req.method === 'POST' ? req.body.token : req.query.token;

    if (!sheetId || !token) {
      return res.status(400).json({ error: "Missing Sheet ID or Token" });
    }

    try {
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Smartsheet Error: ${response.status}`, details: text });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: "Proxy failed", details: error.message });
    }
  });

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
      res.status(500).json({ error: "Dropbox failed", details: error.message });
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
      res.status(500).json({ error: "Proxy failed", details: error.message });
    }
  });

  // --- 5. STATIC FILES & PRODUCTION SERVING ---
  const publicPath = path.join(process.cwd(), 'public');

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use(express.static(publicPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: "Not Found" });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }



  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
