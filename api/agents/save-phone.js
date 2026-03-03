import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { setupId, phoneNumber, phoneGoogleSignedIn } = req.body;

  if (!setupId) {
    return res.status(400).json({ error: 'setupId is required' });
  }

  if (!phoneNumber && !phoneGoogleSignedIn) {
    return res.status(400).json({ error: 'phoneNumber or phoneGoogleSignedIn is required' });
  }

  try {
    const { data: setup, error: fetchError } = await supabase
      .from('agent_setups')
      .select('step_data')
      .eq('id', setupId)
      .single();

    if (fetchError || !setup) {
      return res.status(404).json({ error: 'Setup not found' });
    }

    const { error: updateError } = await supabase
      .from('agent_setups')
      .update({
        step_data: {
          ...setup.step_data,
          ...(phoneNumber ? { phone_number: phoneNumber } : {}),
          ...(phoneGoogleSignedIn ? { phone_google_signed_in: true } : {}),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      throw updateError;
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Save phone error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save phone number' });
  }
}
