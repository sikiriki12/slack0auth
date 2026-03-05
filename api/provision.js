import { supabase } from '../lib/supabase.js';
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
    app_id,
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    signing_secret: credentials.signing_secret,
    install_url: installUrl,
    name,
  };

  const { error: insertError } = await supabase
    .from('slack_apps')
    .insert(appData);

  if (insertError) {
    console.error('Failed to store Slack app:', insertError);
    return res.status(500).json({ error: 'Failed to store app data' });
  }

  console.log(`Provisioned app: ${name} (${app_id})`);

  // Return camelCase for API consumers
  return res.status(200).json({
    appId: app_id,
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    signingSecret: credentials.signing_secret,
    installUrl,
    name,
    createdAt: new Date().toISOString(),
  });
}
