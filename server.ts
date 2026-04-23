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

  // Request Logger for Debugging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
    next();
  });

  // Dedicated API Router
  const apiRouter = express.Router();

  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), env: process.env.NODE_ENV });
  });

  apiRouter.post("/upload-to-dropbox", async (req, res) => {
    const { pdfBase64, fileName, accessToken } = req.body;

    if (!pdfBase64 || !fileName) {
      return res.status(400).json({ error: "Missing file data" });
    }

    const token = accessToken || process.env.VITE_DROPBOX_ACCESS_TOKEN || process.env.DROPBOX_ACCESS_TOKEN;

    if (!token) {
      return res.status(401).json({ error: "Dropbox Access Token not configured" });
    }

    try {
      const dbx = new Dropbox({ accessToken: token });
      const buffer = Buffer.from(pdfBase64, 'base64');

      const response = await dbx.filesUpload({
        path: `/${fileName}`,
        contents: buffer,
        mode: { '.tag': 'overwrite' },
        autorename: true,
        mute: false,
        strict_conflict: false
      });

      res.json({ success: true, link: response.result.path_display });
    } catch (error: any) {
      console.error("Dropbox Upload Error:", error);
      res.status(500).json({ 
        error: "Failed to upload to Dropbox", 
        details: error?.error?.error_summary || error.message 
      });
    }
  });

  apiRouter.get("/proxy-site-data", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "Missing or invalid URL parameter" });
    }

    try {
      console.log(`Proxy: Fetching from ${url}`);
      const response = await fetch(url, {
        headers: {
          'Accept': 'text/csv, text/plain, */*'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Remote Source returned HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const data = await response.text();
      
      if (data.includes('<!DOCTYPE html>') || data.includes('<html')) {
        res.status(422).json({ 
          error: "Invalid Source Format", 
          details: "The URL returned an HTML page instead of a CSV. Please ensure your SmartSheet is 'Published to the Web' as a CSV."
        });
        return;
      }

      res.setHeader('Content-Type', 'text/csv');
      res.send(data);
    } catch (error: any) {
      console.error("Proxy Fetch Error:", error);
      res.status(500).json({ error: "Failed to fetch remote data", details: error.message });
    }
  });

  apiRouter.get("/smartsheet-api-proxy", async (req, res) => {
    const { sheetId, token } = req.query;
    if (!sheetId || typeof sheetId !== 'string' || !token || typeof token !== 'string') {
      return res.status(400).json({ error: "Missing Sheet ID or Authorization Token" });
    }

    try {
      console.log(`Smartsheet API: Fetching Sheet ${sheetId}`);
      const response = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Smartsheet API returned HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Smartsheet API Error:", error);
      res.status(500).json({ error: "Failed to fetch Smartsheet data", details: error.message });
    }
  });

  // Mount API Router before everything else
  app.use("/api", apiRouter);

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
