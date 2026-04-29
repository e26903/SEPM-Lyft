export default function handler(req: any, res: any) {
  res.status(200).json({ 
    status: "ok", 
    v: "simple-219.1", 
    vercel: true,
    path: req.query.path || "direct-api"
  });
}
