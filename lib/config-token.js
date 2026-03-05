import { supabase } from './supabase.js';

export async function getConfigToken() {
  // Try stored refresh token first, fall back to env var on first run
  const { data: row } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'slack_config_refresh_token')
    .single();

  let refreshToken = row?.value || process.env.SLACK_CONFIG_REFRESH_TOKEN;

  if (!refreshToken) throw new Error('No config refresh token available');

  const response = await fetch('https://slack.com/api/tooling.tokens.rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken }),
  });

  const data = await response.json();

  if (!data.ok) throw new Error(`Token rotation failed: ${data.error}`);

  // Store the new refresh token for next time
  await supabase
    .from('settings')
    .upsert({ key: 'slack_config_refresh_token', value: data.refresh_token, updated_at: new Date().toISOString() });

  return data.token;
}
