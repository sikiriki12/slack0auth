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

    if (!setup.step_data?.whatsapp_gw?.connectedAt) {
      return res.status(400).json({ error: 'WhatsApp GW step has not been completed yet' });
    }

    if (setup.status === 'completed') {
      return res.status(400).json({ error: 'Setup is already completed' });
    }

    const { error: insertError } = await supabase
      .from('employees')
      .insert({
        name: setup.name,
        surname: 'Saint',
        email: setup.step_data.email,
        avatar_url: setup.avatar_url,
        personality: setup.personality,
        tier: setup.tier,
        gender: setup.gender,
        status: 'available',
      });

    if (insertError) {
      throw new Error('Failed to create employee: ' + insertError.message);
    }

    const { error: updateError } = await supabase
      .from('agent_setups')
      .update({
        status: 'completed',
        current_step: 9,
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      throw new Error('Failed to update setup status');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Register agent error:', error);
    return res.status(500).json({ error: error.message || 'Failed to register agent' });
  }
}
