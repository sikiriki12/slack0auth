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

    // Idempotent: skip if already sent
    if (setup.step_data?.avatar_email_sent) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const refreshToken = setup.step_data?.google_oauth_token?.refresh_token;
    const clientJson = setup.step_data?.google_oauth_client;
    const email = setup.step_data?.email;
    const avatarUrl = setup.avatar_url;

    if (!refreshToken || !clientJson || !email) {
      return res.status(400).json({ error: 'Missing OAuth credentials or email' });
    }

    if (!avatarUrl) {
      return res.status(400).json({ error: 'No avatar URL found' });
    }

    // Exchange refresh token for access token
    const credentials = clientJson.web || clientJson.installed;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token refresh failed');
    }

    const accessToken = tokenData.access_token;

    // Download avatar image
    const imgRes = await fetch(avatarUrl);
    if (!imgRes.ok) {
      throw new Error('Failed to download avatar image');
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const imgBase64 = imgBuffer.toString('base64');

    // Build MIME message with PNG attachment
    const boundary = 'boundary_' + Date.now();
    const agentName = setup.name || 'Agent';

    const mimeParts = [
      `From: ${email}`,
      `To: ${email}`,
      `Subject: Your profile photo - ${agentName} Saint`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      `Hi ${agentName},\n\nYour profile photo is attached. Save it to your phone and set it as your WhatsApp profile picture.\n\n- Saint Setup`,
      '',
      `--${boundary}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="avatar.png"`,
      '',
      imgBase64,
      '',
      `--${boundary}--`,
    ];

    const rawMessage = mimeParts.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      throw new Error(sendData.error?.message || 'Failed to send email');
    }

    // Mark as sent
    const { error: updateError } = await supabase
      .from('agent_setups')
      .update({
        step_data: {
          ...setup.step_data,
          avatar_email_sent: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      console.error('DB update failed:', updateError);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Send avatar email error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send avatar email' });
  }
}
