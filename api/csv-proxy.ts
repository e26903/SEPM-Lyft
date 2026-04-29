import https from 'https';
import http from 'http';

// Standalone Vercel function for Site Data (CSV) Proxy
export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: "Missing URL param" });
  }

  console.log(`[VERCEL-CSV-PROXY] Fetching: ${url}`);

  const protocol = url.startsWith('https') ? https : http;

  const externalReq = protocol.get(url, (externalRes) => {
    res.setHeader('Content-Type', externalRes.headers['content-type'] || 'text/csv');
    res.status(externalRes.statusCode || 200);
    externalRes.pipe(res);
  });

  externalReq.on('error', (e) => {
    res.status(500).json({ error: "CSV Native Proxy Error", details: e.message });
  });

  externalReq.setTimeout(10000, () => {
    externalReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: "CSV Proxy Timeout" });
    }
  });
}
