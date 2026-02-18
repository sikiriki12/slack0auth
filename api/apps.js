import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { appId, appToken } = req.body;

  if (!appId || !appToken) {
    return res.status(400).json({ error: 'appId and appToken are required' });
  }

  const appData = await kv.get(`app:${appId}`);

  if (!appData) {
    return res.status(404).json({ error: 'App not found' });
  }

  const updated = { ...appData, appToken };
  await kv.set(`app:${appId}`, updated);

  return res.status(200).json(updated);
}
