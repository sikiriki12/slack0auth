import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { appId, appToken } = req.body;

  if (!appId || !appToken) {
    return res.status(400).json({ error: 'appId and appToken are required' });
  }

  const { data: appData, error: fetchError } = await supabase
    .from('slack_apps')
    .select('*')
    .eq('app_id', appId)
    .single();

  if (fetchError || !appData) {
    return res.status(404).json({ error: 'App not found' });
  }

  const { error: updateError } = await supabase
    .from('slack_apps')
    .update({ app_token: appToken })
    .eq('app_id', appId);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to update app token' });
  }

  return res.status(200).json({ ...appData, app_token: appToken });
}
