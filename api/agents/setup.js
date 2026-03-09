import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'id query parameter is required' });
  }

  try {
    const { data, error } = await supabase
      .from('agent_setups')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error) {
    console.error('Setup fetch error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch setup' });
  }
}
