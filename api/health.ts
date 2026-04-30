export default function handler(req: any, res: any) {
  res.status(200).json({ 
    status: "ok", 
    v: "simple-219.6", 
    vercel: true,
    node: process.version,
    env: process.env.NODE_ENV,
    path: req.query.path || "direct-api"
  });
}
