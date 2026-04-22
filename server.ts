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

  // SPECIAL PROXIED ROUTE FOR BRAND MEDIA - BYPASSES ALL CACHING AND FORCES CORRECT STREAMING
  // Available in both dev and production
  app.get('/brand-stream/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(publicPath, 'brand_assets', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Not Found');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.mp4') contentType = 'video/mp4';
    if (ext === '.gif') contentType = 'image/gif';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  });

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
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
