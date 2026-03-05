import { supabase } from '../../lib/supabase.js';

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

    // Call the existing provision endpoint internally
    const baseUrl = process.env.BASE_URL || `https://${process.env.VERCEL_URL}`;
    const provisionRes = await fetch(`${baseUrl}/api/provision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: req.headers.cookie || '',
      },
      body: JSON.stringify({ name: appName, description: `${appName} - AI Employee` }),
    });

    const provisionData = await provisionRes.json();

    if (!provisionRes.ok) {
      throw new Error(provisionData.error || 'Slack app provisioning failed');
    }

    const slackApp = {
      appId: provisionData.appId,
      clientId: provisionData.clientId,
      installUrl: provisionData.installUrl,
      name: provisionData.name,
      createdAt: provisionData.createdAt,
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
