import { kv } from '@vercel/kv';

export async function getConfigToken() {
  // Try stored refresh token first, fall back to env var on first run
  let refreshToken = await kv.get('slack_config_refresh_token');

  if (!refreshToken) {
    refreshToken = process.env.SLACK_CONFIG_REFRESH_TOKEN;
    if (!refreshToken) throw new Error('No config refresh token available');
  }

  const response = await fetch('https://slack.com/api/tooling.tokens.rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken }),
  });

  const data = await response.json();

  if (!data.ok) throw new Error(`Token rotation failed: ${data.error}`);

  // Store the new refresh token for next time
  await kv.set('slack_config_refresh_token', data.refresh_token);

  return data.token;
}
