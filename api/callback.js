import { supabase } from '../lib/supabase.js';

export async function completeOAuth(code, appId) {
  // Look up app credentials from Supabase
  const { data: appData, error } = await supabase
    .from('slack_apps')
    .select('*')
    .eq('app_id', appId)
    .single();

  if (error || !appData) {
    throw new Error(`App ${appId} not found`);
  }

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appData.client_id,
      client_secret: appData.client_secret,
      code,
      redirect_uri: `${(process.env.BASE_URL || `https://${process.env.VERCEL_URL}`).replace(/\/+$/, '')}/api/callback`,
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

  // Update Supabase with install data
  const { error: updateError } = await supabase
    .from('slack_apps')
    .update({
      bot_token: data.access_token,
      team_id: data.team.id,
      team_name: data.team.name,
      installed_by: data.authed_user.id,
      installed_at: new Date().toISOString(),
    })
    .eq('app_id', appId);

  if (updateError) {
    console.error('Failed to update app with install data:', updateError);
  }

  console.log(`New install: ${data.team.name} | App: ${appData.name} | Token: ${data.access_token}`);

  return { ...appData, bot_token: data.access_token, team_id: data.team.id, team_name: data.team.name };
}

export default async function handler(req, res) {
  const { code, state: appId } = req.query;
  await completeOAuth(code, appId);
  res.send('Installed! You can close this tab.');
}
