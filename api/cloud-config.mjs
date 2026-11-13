import { cloudConfig, databaseConfig } from '../src/cloud/config.mjs';
export default function cloudSettings(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.statusCode = 405; res.end('{}'); return; }
  let available = false, emailEnabled = false;
  try { const config = cloudConfig(process.env); databaseConfig(process.env); available = true; emailEnabled = config.emailEnabled; } catch { /* No secrets in public configuration. */ }
  res.end(JSON.stringify({ available, emailEnabled }));
}
