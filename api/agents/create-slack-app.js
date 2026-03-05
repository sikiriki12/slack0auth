import { supabase } from '../../lib/supabase.js';
import { getConfigToken } from '../../lib/config-token.js';
import { createManifest, SCOPES } from '../../lib/manifest.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { setupId } = req.body;

  if (!setupId) {
    return res.status(400).json({ error: 'setupId is required' });
  }

  try {
    const { data: setup, error: fetchError } = await supabase
      .from('agent_setups')
      .select('*')
      .eq('id', setupId)
      .single();

    if (fetchError || !setup) {
      return res.status(404).json({ error: 'Setup not found' });
    }

    // Idempotent: skip if already provisioned
    if (setup.step_data?.slack_app) {
      return res.status(200).json({ ok: true, skipped: true, slack_app: setup.step_data.slack_app });
    }

    const agentName = setup.name || 'Agent';
    const appName = `${agentName} Saint`;

    const configToken = await getConfigToken();
    const baseUrl = process.env.BASE_URL || `https://${process.env.VERCEL_URL}`;
    const redirectUrl = `${baseUrl}/api/callback`;
    const manifest = createManifest(appName, `${appName} - AI Employee`, redirectUrl);

    // Create the Slack app
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
      throw new Error(createData.error || 'Slack app creation failed');
    }

    const { app_id, credentials } = createData;

    const installUrl = `https://slack.com/oauth/v2/authorize?client_id=${credentials.client_id}&scope=${SCOPES.join(',')}&redirect_uri=${encodeURIComponent(redirectUrl)}&state=${app_id}`;

    // Store in slack_apps table
    await supabase.from('slack_apps').insert({
      app_id,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      signing_secret: credentials.signing_secret,
      install_url: installUrl,
      name: appName,
    });

    const slackApp = {
      appId: app_id,
      clientId: credentials.client_id,
      installUrl,
      name: appName,
      createdAt: new Date().toISOString(),
    };

    // Store in agent setup
    const { error: updateError } = await supabase
      .from('agent_setups')
      .update({
        current_step: 5,
        step_data: {
          ...setup.step_data,
          slack_app: slackApp,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      throw new Error('Failed to save Slack app to setup');
    }

    return res.status(200).json({ ok: true, slack_app: slackApp });
  } catch (error) {
    console.error('Create Slack app error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create Slack app' });
  }
}
