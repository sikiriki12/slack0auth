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

    const { error: updateError } = await supabase
      .from('agent_setups')
      .update({
        current_step: 5,
        step_data: {
          ...setup.step_data,
          slack_app: { ...setup.step_data.slack_app, distributionConfirmed: true },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      throw new Error('Failed to save Slack completion');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Complete Slack error:', error);
    return res.status(500).json({ error: error.message || 'Failed to complete Slack setup' });
  }
}
