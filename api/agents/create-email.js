import { supabase } from '../../lib/supabase.js';
import { getGoogleAccessToken } from '../../lib/google-auth.js';

const DOMAIN = 'saint.work';
const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
];

async function userExists(token, email) {
  const res = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.status === 200;
}

function generatePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 20; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { setupId } = req.body;

  if (!setupId) {
    return res.status(400).json({ error: 'setupId is required' });
  }

  try {
    // Fetch the setup record
    const { data: setup, error: fetchError } = await supabase
      .from('agent_setups')
      .select('*')
      .eq('id', setupId)
      .single();

    if (fetchError || !setup) {
      return res.status(404).json({ error: 'Setup not found' });
    }

    const token = await getGoogleAccessToken(SCOPES);

    // Determine available email
    const baseName = setup.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let email = `${baseName}@${DOMAIN}`;
    let suffix = 2;

    while (await userExists(token, email)) {
      email = `${baseName}${suffix}@${DOMAIN}`;
      suffix++;
    }

    // Create the user
    const password = generatePassword();
    const createRes = await fetch(
      'https://admin.googleapis.com/admin/directory/v1/users',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryEmail: email,
          name: {
            givenName: setup.name,
            familyName: 'Saint',
          },
          password,
          changePasswordAtNextLogin: false,
        }),
      }
    );

    const createData = await createRes.json();

    if (!createRes.ok) {
      throw new Error(createData.error?.message || 'Failed to create Google user');
    }

    // Set profile photo if avatar exists
    if (setup.avatar_url) {
      try {
        // Download the avatar image
        const imgRes = await fetch(setup.avatar_url);
        const imgBuffer = await imgRes.arrayBuffer();
        const photoBase64 = Buffer.from(imgBuffer)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        await fetch(
          `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}/photos/thumbnail`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              photoData: photoBase64,
              mimeType: 'image/png',
            }),
          }
        );
      } catch (photoErr) {
        console.error('Photo upload failed (non-fatal):', photoErr.message);
      }
    }

    // Update agent_setups
    await supabase
      .from('agent_setups')
      .update({
        current_step: 2,
        step_data: {
          ...setup.step_data,
          email,
          email_password: password,
          email_created_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    return res.status(200).json({ email, setupId });
  } catch (error) {
    console.error('Create email error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create email' });
  }
}
