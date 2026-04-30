import { Dropbox } from 'dropbox';

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pdfBase64, fileName, accessToken } = req.body;

  if (!pdfBase64 || !fileName) {
    return res.status(400).json({ error: "Missing pdfBase64 or fileName" });
  }

  const token = accessToken || process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) {
    return res.status(401).json({ error: "Missing Dropbox access token" });
  }

  console.log(`[VERCEL-DROPBOX] Uploading: ${fileName} (${pdfBase64.length} chars)`);

  try {
    const dbx = new Dropbox({ accessToken: token });
    
    // Clean base64 string if it contains prefix
    const base64Data = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    const response = await dbx.filesUpload({
      path: `/${fileName.startsWith('/') ? fileName.substring(1) : fileName}`,
      contents: buffer,
      mode: { '.tag': 'overwrite' }
    });

    res.status(200).json({ success: true, result: response.result });
  } catch (error: any) {
    console.error(`[VERCEL-DROPBOX-ERROR]`, error);
    
    // Attempt to extract helpful error details from Dropbox SDK
    const details = error.error || error.message || "Unknown error";
    res.status(500).json({ 
      error: "Dropbox Upload Failed", 
      details: details,
      summary: error.toString()
    });
  }
}
