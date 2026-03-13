import { supabase } from './supabase.js';

export async function getConfigToken() {
  const { data: row, error: readError } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'slack_config_refresh_token')
    .single();

  const source = row?.value ? 'supabase' : 'env';
  const refreshToken = row?.value || process.env.SLACK_CONFIG_REFRESH_TOKEN;

  if (readError && !row) {
    console.warn('[config-token] Supabase read failed, falling back to env var:', readError.message);
  }

  if (!refreshToken) {
    console.error('[config-token] No refresh token in Supabase or env');
    throw new Error('No config refresh token available');
  }

  console.log(`[config-token] Rotating token (source: ${source}, prefix: ${refreshToken.slice(0, 8)}...)`);

  const response = await fetch('https://slack.com/api/tooling.tokens.rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken }),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error(`[config-token] Rotation failed: ${data.error} (source: ${source}, prefix: ${refreshToken.slice(0, 8)}...)`);
    throw new Error(`Token rotation failed: ${data.error}`);
  }

  console.log(`[config-token] Rotation succeeded, new refresh token prefix: ${data.refresh_token.slice(0, 8)}...`);

  const { error: writeError } = await supabase
    .from('settings')
    .upsert({ key: 'slack_config_refresh_token', value: data.refresh_token, updated_at: new Date().toISOString() });

  if (writeError) {
    console.error('[config-token] CRITICAL: Failed to store new refresh token — chain will break on next call:', writeError.message);
  }

  return data.token;
}
