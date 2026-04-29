import https from 'https';

// Standalone Vercel function for Smartsheet Proxy
export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sheetId = req.query.sheetId || req.body?.sheetId;
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token || req.body?.token;

  if (!sheetId || !token) {
    return res.status(400).json({ error: "Missing sheetId or token" });
  }

  const options = {
    hostname: 'api.smartsheet.com',
    port: 443,
    path: `/2.0/sheets/${sheetId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    },
    timeout: 9000
  };

  const smartRequest = https.request(options, (smartRes) => {
    let data = '';
    smartRes.on('data', (chunk) => { data += chunk; });
    smartRes.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        res.status(smartRes.statusCode || 200).json(jsonData);
      } catch (e) {
        res.status(200).send(data); // Return as text if not JSON
      }
    });
  });

  smartRequest.on('error', (e) => {
    console.error("[SMARTSHEET-PROXY-ERROR]", e);
    res.status(500).json({ error: "Native Proxy Error", details: e.message });
  });

  smartRequest.end();
}
