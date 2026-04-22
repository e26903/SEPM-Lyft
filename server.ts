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

  // API Routes
  app.post("/api/upload-to-dropbox", async (req, res) => {
    const { pdfBase64, fileName, accessToken } = req.body;

    if (!pdfBase64 || !fileName) {
      return res.status(400).json({ error: "Missing file data" });
    }

    const token = accessToken || process.env.DROPBOX_ACCESS_TOKEN;

    if (!token) {
      return res.status(401).json({ error: "Dropbox Access Token not configured" });
    }

    try {
      const dbx = new Dropbox({ accessToken: token });
      
      // Convert base64 to Buffer
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
      
      // PRIORITY: Specific Branding Assets v2
      if (cleanPath === '/branding-v2.mp4' || cleanPath === '/branding-v2.gif' || cleanPath === '/branding-v2.jpg') {
        const targetPath = fs.existsSync(distFilePath) ? distFilePath : publicFilePath;
        if (fs.existsSync(targetPath)) {
          if (cleanPath.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
          if (cleanPath.endsWith('.gif')) res.setHeader('Content-Type', 'image/gif');
          if (cleanPath.endsWith('.jpg')) res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
          return res.sendFile(targetPath);
        }
      }

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
