import { createHmac, randomBytes } from 'crypto';
import { supabase } from '../../lib/supabase.js';

const SCOPES = [
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
  'profile',
];

const REDIRECT_URI = 'https://slack0auth.vercel.app/api/agents/gcloud-callback';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { setupId } = req.body;

  if (!setupId) {
    return res.status(400).json({ error: 'setupId is required' });
  }

  try {
    const clientJson = JSON.parse(process.env.GOOGLE_OAUTH_CLIENT_JSON);
    const credentials = clientJson.web || clientJson.installed;
    const clientId = credentials.client_id;

    // Fetch setup record
    const { data: setup, error: fetchError } = await supabase
      .from('agent_setups')
      .select('step_data')
      .eq('id', setupId)
      .single();

    if (fetchError || !setup) {
      return res.status(404).json({ error: 'Setup not found' });
    }

    const agentEmail = setup.step_data?.email;
    if (!agentEmail) {
      return res.status(400).json({ error: 'Agent email not found — complete step 2 first' });
    }

    // Build HMAC-signed state
    const nonce = randomBytes(16).toString('hex');
    const payload = JSON.stringify({ setupId, nonce });
    const hmac = createHmac('sha256', process.env.SETUP_PASSWORD).update(payload).digest('base64url');
    const state = Buffer.from(`${hmac}.${payload}`).toString('base64url');

    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
      login_hint: agentEmail,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return res.status(200).json({ authUrl });
  } catch (error) {
    console.error('gcloud-auth-url error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate auth URL' });
  }
}
