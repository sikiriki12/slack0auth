import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const name = req.query.name;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name query parameter is required' });
  }

  try {
    const [empRes, setupRes] = await Promise.all([
      supabase.from('employees').select('name').ilike('name', name.trim()),
      supabase
        .from('agent_setups')
        .select('name')
        .ilike('name', name.trim())
        .eq('status', 'in_progress'),
    ]);

    if (empRes.error) throw empRes.error;
    if (setupRes.error) throw setupRes.error;

    const taken = (empRes.data?.length || 0) > 0 || (setupRes.data?.length || 0) > 0;

    return res.status(200).json({ available: !taken });
  } catch (error) {
    console.error('Check-name error:', error);
    return res.status(500).json({ error: error.message || 'Failed to check name' });
  }
}
