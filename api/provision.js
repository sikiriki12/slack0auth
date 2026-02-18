import { kv } from '@vercel/kv';
import { getConfigToken } from '../lib/config-token.js';
import { createManifest, SCOPES } from '../lib/manifest.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const configToken = await getConfigToken();

  const baseUrl = process.env.BASE_URL || `https://${process.env.VERCEL_URL}`;
  const redirectUrl = `${baseUrl}/api/callback`;
  const manifest = createManifest(name, description, redirectUrl);

  // Create the app
  const createRes = await fetch('https://slack.com/api/apps.manifest.create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${configToken}`,
    },
    body: JSON.stringify({ manifest }),
  });

  const createData = await createRes.json();

  if (!createData.ok) {
    return res.status(400).json({ error: createData.error, details: createData.errors });
  }

  const { app_id, credentials } = createData;

  const installUrl = `https://slack.com/oauth/v2/authorize?client_id=${credentials.client_id}&scope=${SCOPES.join(',')}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${app_id}`;

  const appData = {
    appId: app_id,
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    signingSecret: credentials.signing_secret,
    installUrl,
    name,
    createdAt: new Date().toISOString(),
  };

  await kv.set(`app:${app_id}`, appData);

  console.log(`Provisioned app: ${name} (${app_id})`);

  return res.status(200).json(appData);
}
