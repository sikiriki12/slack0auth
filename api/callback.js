import { kv } from '@vercel/kv';

export async function completeOAuth(code, appId) {
  // Look up app credentials from KV
  const appData = await kv.get(`app:${appId}`);

  if (!appData) {
    throw new Error(`App ${appId} not found`);
  }

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appData.clientId,
      client_secret: appData.clientSecret,
      code,
      redirect_uri: process.env.BASE_URL
        ? `${process.env.BASE_URL}/api/callback`
        : `https://${process.env.VERCEL_URL}/api/callback`,
    }),
  });

  const data = await response.json();

  // Send welcome DM to the installer — makes bot appear in sidebar instantly
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.access_token}`,
    },
    body: JSON.stringify({
      channel: data.authed_user.id,
      text: `👋 Hey! I'm ${appData.name}. You can DM me here anytime.`,
    }),
  });

  // Update KV with install data
  const updatedAppData = {
    ...appData,
    botToken: data.access_token,
    teamId: data.team.id,
    teamName: data.team.name,
    installedBy: data.authed_user.id,
    installedAt: new Date().toISOString(),
  };

  await kv.set(`app:${appId}`, updatedAppData);

  console.log(`New install: ${data.team.name} | App: ${appData.name} | Token: ${data.access_token}`);

  return updatedAppData;
}

export default async function handler(req, res) {
  const { code, state: appId } = req.query;
  await completeOAuth(code, appId);
  res.send('Installed! You can close this tab.');
}
