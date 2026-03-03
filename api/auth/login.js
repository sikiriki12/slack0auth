import { createHmac } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const expected = process.env.SETUP_PASSWORD;

  if (!expected) {
    return res.status(500).json({ error: 'SETUP_PASSWORD not configured' });
  }

  if (password !== expected) {
    return res.status(401).json({ error: 'Wrong password' });
  }

  // Generate HMAC token (same logic as middleware)
  const token = createHmac('sha256', expected)
    .update('setup-session')
    .digest('hex');

  res.setHeader(
    'Set-Cookie',
    `setup_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure`
  );

  return res.status(200).json({ ok: true });
}
