import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { setupId, gatewayHost, gatewayIp, agentId, workspace, dataDir } = req.body;

  if (!setupId || !gatewayHost || !gatewayIp || !agentId) {
    return res.status(400).json({ error: 'setupId, gatewayHost, gatewayIp, and agentId are required' });
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
        current_step: 7,
        step_data: {
          ...setup.step_data,
          gateway: {
            host: gatewayHost,
            ip: gatewayIp,
            agentId,
            workspace: workspace || null,
            dataDir: dataDir || null,
            createdAt: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      throw new Error('Failed to save gateway data');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Save gateway error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save gateway' });
  }
}
