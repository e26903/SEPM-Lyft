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

  // --- 1. GLOBAL LOGGING & EARLY INTERCEPTORS ---
  app.use((req, res, next) => {
    const lowUrl = req.url.toLowerCase();
    
    // Aggressive Catch-All for Health/Ping/Status
    if (lowUrl.includes('health') || lowUrl.includes('ping') || lowUrl.includes('status') || lowUrl.includes('debug-ping')) {
      console.log(`[TOP-PRIORITY-HEALTH] ${req.method} ${req.url}`);
      return res.status(200).json({ 
        status: "ok", 
        v: "90.0", 
        time: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        path: req.path,
        originalUrl: req.originalUrl
      });
    }

    // Early Intercept for Smartsheet Proxy to avoid middleware issues
    if (lowUrl.startsWith('/api/smartsheet-api-proxy')) {
       console.log(`[TOP-PRIORITY-PROXY] ${req.method} ${req.url}`);
       return next(); // Continue to the specific handler, but logging we caught it early
    }

    console.log(`[REQ] ${req.method} ${req.url} (IP: ${req.ip})`);
    next();
  });

  // --- 2. MIDDLEWARE ---
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Proxy Routes - explicitly handled
  const handleSmartsheetProxy = async (req: any, res: any) => {
    console.log(`[API-PROXY] Smartsheet: ${req.method} ${req.url}`);
    const sheetId = (req.method === 'POST' ? req.body.sheetId : req.query.sheetId) || req.params.sheetId;
    const token = (req.method === 'POST' ? req.body.token : req.query.token) || req.headers['authorization']?.replace('Bearer ', '');

    if (!sheetId || !token) {
      console.warn("[API-PROXY] Missing Credentials", { sheetId: !!sheetId, token: !!token });
      return res.status(400).json({ error: "Missing Credentials (SheetId/Token)" });
    }

    try {
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Smartsheet API: ${response.status}`, details: text });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("[API-PROXY-ERROR]", error);
      res.status(500).json({ error: "Proxy failed", details: error.message });
    }
  };

  app.all("/api/smartsheet-api-proxy", handleSmartsheetProxy);
  app.all("/api/smartsheet-api-proxy/:sheetId", handleSmartsheetProxy);

  app.post("/api/upload-to-dropbox", async (req: any, res: any) => {
    console.log("[API] Dropbox Upload requested");
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
      console.error("[API-DROPBOX-ERROR]", error);
      res.status(500).json({ error: "Dropbox failed", details: error.message });
    }
  });

  app.get("/api/proxy-site-data", async (req: any, res: any) => {
    console.log("[API] Proxy Site Data requested");
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: "Missing URL" });
    try {
      const response = await fetch(url);
      const data = await response.text();
      res.setHeader('Content-Type', 'text/csv');
      res.send(data);
    } catch (error: any) {
      console.error("[API-SITE-ERROR]", error);
      res.status(500).json({ error: "Proxy failed", details: error.message });
    }
  });

  // --- 5. STATIC FILES & PRODUCTION SERVING ---
  const publicPath = path.join(process.cwd(), 'public');
  const distPath = path.join(process.cwd(), 'dist');
  const indexPath = path.join(distPath, 'index.html');

  // Priority Mode Check: Only use production if dist/index.html is actually present
  const hasDist = fs.existsSync(indexPath);
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
