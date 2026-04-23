import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { Dropbox } from "dropbox";
import bodyParser from "body-parser";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for PDF binary data
  app.use(bodyParser.json({ limit: '50mb' }));

  // GLOBAL LOGGER - SEE EVERY REQUEST TO DEBUG 404s
  app.use((req, res, next) => {
    console.log(`[REQ] ${new Date().toISOString()} | ${req.method} ${req.url} | UA: ${req.headers['user-agent']}`);
    next();
  });

  // API ROUTES FIRST - NO ROUTER PREFIXING FOR MAX RELIABILITY
  app.get("/api/health", (req, res) => {
    console.log(`[API MATCH] Health Check`);
    res.json({ 
      status: "ok", 
      time: new Date().toISOString(), 
      env: process.env.NODE_ENV || 'production',
      platform: 'express',
      v: '4.0'
    });
  });

  // Dual-method Smartsheet Proxy for maximum compatibility
  app.all("/api/smartsheet-api-proxy", async (req, res) => {
    console.log(`[API MATCH] Smartsheet Sync (${req.method})`);
    
    // Support both GET (query) and POST (body)
    const sheetId = req.method === 'POST' ? req.body.sheetId : req.query.sheetId;
    const token = req.method === 'POST' ? req.body.token : req.query.token;

    if (!sheetId || !token) {
      console.warn("[API FAIL] Missing Auth/ID in Sync", { sheetId: !!sheetId, token: !!token });
      return res.status(400).json({ error: "Missing Sheet ID or Authorization Token" });
    }

    try {
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[API FAIL] Smartsheet Response Error", response.status, errText);
        throw new Error(`Smartsheet API returned ${response.status}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("[API FAIL] Smartsheet Sync Exception", error.message);
      res.status(500).json({ error: "Smartsheet API failed", details: error.message });
    }
  });

  app.post("/api/upload-to-dropbox", async (req, res) => {
    console.log("[API MATCH] Dropbox Upload");
    const { pdfBase64, fileName, accessToken } = req.body;
    if (!pdfBase64 || !fileName) return res.status(400).json({ error: "Missing file data" });
    const token = accessToken || process.env.VITE_DROPBOX_ACCESS_TOKEN || process.env.DROPBOX_ACCESS_TOKEN;
    if (!token) return res.status(401).json({ error: "Dropbox Access Token not configured" });

    try {
      const dbx = new Dropbox({ accessToken: token });
      const buffer = Buffer.from(pdfBase64, 'base64');
      const response = await dbx.filesUpload({
        path: `/${fileName}`,
        contents: buffer,
        mode: { '.tag': 'overwrite' },
        autorename: true
      });
      res.json({ success: true, link: response.result.path_display });
    } catch (error: any) {
      console.error("[API FAIL] Dropbox Error:", error);
      res.status(500).json({ error: "Dropbox upload failed", details: error?.error?.error_summary || error.message });
    }
  });

  app.get("/api/proxy-site-data", async (req, res) => {
    console.log(`[API MATCH] CSV Proxy: ${req.query.url}`);
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: "Missing URL" });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.text();
      if (data.includes('<html')) return res.status(422).json({ error: "Invalid Source", details: "HTML received instead of CSV." });
      res.setHeader('Content-Type', 'text/csv');
      res.send(data);
    } catch (error: any) {
      console.error("[API FAIL] Proxy Fetch Error:", error);
      res.status(500).json({ error: "Fetch failed", details: error.message });
    }
  });

  const publicPath = path.join(process.cwd(), 'public');

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
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

  // Final catch-all for any missed API requests to prevent index.html bleed
  app.use('/api', (req, res) => {
    console.error(`[API 404] No handler found for ${req.method} ${req.url}`);
    res.status(404).json({ error: "API Endpoint Not Found", path: req.url });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
