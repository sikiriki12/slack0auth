import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, personality, tier, gender, image } = req.body;

  if (!name || !personality || !tier || !gender) {
    return res.status(400).json({ error: 'name, personality, tier, and gender are required' });
  }

  if (!['junior', 'senior', 'director'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  if (!['male', 'female'].includes(gender)) {
    return res.status(400).json({ error: 'Invalid gender' });
  }

  try {
    // Check name uniqueness against both tables (case-insensitive)
    const [employeesRes, setupsRes] = await Promise.all([
      supabase.from('employees').select('name').ilike('name', name),
      supabase
        .from('agent_setups')
        .select('name')
        .ilike('name', name)
        .eq('status', 'in_progress'),
    ]);

    if ((employeesRes.data?.length || 0) > 0 || (setupsRes.data?.length || 0) > 0) {
      return res.status(409).json({ error: 'Name is already taken' });
    }

    // Upload image to Supabase Storage if provided
    let avatarUrl = null;
    if (image) {
      const fileName = `${name.toLowerCase().replace(/\s+/g, '-')}.png`;
      const buffer = Buffer.from(image, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, buffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      avatarUrl = urlData.publicUrl;
    }

    // Insert into agent_setups only
    const { data, error } = await supabase
      .from('agent_setups')
      .insert({
        name,
        personality,
        tier,
        gender,
        avatar_url: avatarUrl,
        current_step: 1,
        step_data: { step1_completed_at: new Date().toISOString() },
        status: 'in_progress',
      })
      .select('id')
      .single();

    if (error) throw error;

    return res.status(200).json({
      setupId: data.id,
      name,
      avatarUrl,
    });
  } catch (error) {
    console.error('Create error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create agent' });
  }
}
