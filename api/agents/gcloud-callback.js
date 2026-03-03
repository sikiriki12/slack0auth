import { createHmac } from 'crypto';
import { supabase } from '../../lib/supabase.js';

const REDIRECT_URI = 'https://slack0auth.vercel.app/api/agents/gcloud-callback';

const GOGCLI_SERVICES = [
  'gmail', 'calendar', 'chat', 'drive', 'docs', 'slides',
  'contacts', 'tasks', 'sheets', 'forms', 'appscript',
  'groups', 'keep', 'people',
];

const GOGCLI_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/chat.spaces',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/chat.memberships',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/script.processes',
  'https://www.googleapis.com/auth/cloud-identity.groups.readonly',
  'https://www.googleapis.com/auth/keep.readonly',
  'profile',
];

function errorPage(message) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Authorization Failed</title>
<style>body{font-family:system-ui;background:#0f1019;color:#f0ede8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;max-width:400px;padding:2rem}.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.25rem;margin-bottom:0.5rem}p{color:#9a96a6;font-size:0.9rem}</style>
</head><body><div class="box"><div class="icon">&#10060;</div><h1>Authorization Failed</h1><p>${message}</p></div></body></html>`;
}

function successPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Authorization Complete</title>
<style>body{font-family:system-ui;background:#0f1019;color:#f0ede8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;max-width:400px;padding:2rem}.icon{font-size:3rem;margin-bottom:1rem}h1{font-size:1.25rem;margin-bottom:0.5rem;color:#feca57}p{color:#9a96a6;font-size:0.9rem}</style>
</head><body><div class="box"><div class="icon">&#9989;</div><h1>Authorization Complete!</h1><p>You can close this window.</p></div>
<script>setTimeout(()=>window.close(),2000)</script></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send(errorPage('Method not allowed'));
  }

  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.status(400).send(errorPage(`Google denied access: ${oauthError}`));
  }

  if (!code || !state) {
    return res.status(400).send(errorPage('Missing code or state parameter'));
  }

  try {
    // Decode and verify state
    const decoded = Buffer.from(state, 'base64url').toString();
    const dotIdx = decoded.indexOf('.');
    if (dotIdx === -1) {
      return res.status(400).send(errorPage('Invalid state format'));
    }

    const receivedHmac = decoded.slice(0, dotIdx);
    const payload = decoded.slice(dotIdx + 1);
    const expectedHmac = createHmac('sha256', process.env.SETUP_PASSWORD).update(payload).digest('base64url');

    if (receivedHmac !== expectedHmac) {
      return res.status(400).send(errorPage('Invalid state signature'));
    }

    const { setupId } = JSON.parse(payload);

    // Fetch setup record
    const { data: setup, error: fetchError } = await supabase
      .from('agent_setups')
      .select('*')
      .eq('id', setupId)
      .single();

    if (fetchError || !setup) {
      return res.status(404).send(errorPage('Setup not found'));
    }

    // Exchange code for tokens
    const clientJson = JSON.parse(process.env.GOOGLE_OAUTH_CLIENT_JSON);
    const credentials = clientJson.web || clientJson.installed;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.refresh_token) {
      const msg = tokenData.error_description || tokenData.error || 'Token exchange failed';
      return res.status(400).send(errorPage(msg));
    }

    // Verify signed-in email matches agent email (fail-closed)
    const agentEmail = setup.step_data?.email;
    if (!agentEmail) {
      return res.status(400).send(errorPage('Agent email not found in setup data'));
    }

    if (!tokenData.id_token) {
      return res.status(400).send(errorPage('No id_token returned — cannot verify account identity'));
    }

    const idParts = tokenData.id_token.split('.');
    if (idParts.length !== 3) {
      return res.status(400).send(errorPage('Malformed id_token — cannot verify account identity'));
    }

    const idPayload = JSON.parse(Buffer.from(idParts[1], 'base64url').toString());
    if (!idPayload.email) {
      return res.status(400).send(errorPage('id_token missing email claim — cannot verify account identity'));
    }

    if (idPayload.email.toLowerCase() !== agentEmail.toLowerCase()) {
      return res.status(400).send(errorPage(
        `Signed in as ${idPayload.email} but expected ${agentEmail}. Please sign in with the correct account.`
      ));
    }

    // Build gogcli-compatible token export
    const googleOAuthToken = {
      email: agentEmail,
      client: 'default',
      services: GOGCLI_SERVICES,
      scopes: GOGCLI_SCOPES,
      refresh_token: tokenData.refresh_token,
      created_at: new Date().toISOString(),
    };

    // Update agent_setups
    const { error: updateError } = await supabase
      .from('agent_setups')
      .update({
        current_step: 3,
        step_data: {
          ...setup.step_data,
          google_oauth_token: googleOAuthToken,
          google_oauth_client: clientJson,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      console.error('DB update failed:', updateError);
      return res.status(500).send(errorPage('Failed to save authorization — please try again'));
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(successPage());
  } catch (error) {
    console.error('gcloud-callback error:', error);
    return res.status(500).send(errorPage('Internal error — please try again'));
  }
}
