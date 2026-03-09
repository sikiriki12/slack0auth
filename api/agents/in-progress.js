import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('agent_setups')
      .select('id, name, avatar_url, current_step, tier')
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (error) {
    console.error('In-progress error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch in-progress setups' });
  }
}
