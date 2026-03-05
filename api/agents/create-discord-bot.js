import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { setupId, applicationId, clientId, clientSecret, botToken } = req.body;

  if (!setupId || !applicationId || !clientId || !clientSecret || !botToken) {
    return res.status(400).json({ error: 'setupId, applicationId, clientId, clientSecret, and botToken are required' });
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

    // 1. Validate bot token
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (!userRes.ok) {
      return res.status(400).json({ error: 'Invalid bot token' });
    }

    // 2. Check application settings (intents + public)
    const appRes = await fetch('https://discord.com/api/v10/applications/@me', {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (!appRes.ok) {
      return res.status(400).json({ error: 'Failed to fetch application info' });
    }

    const appData = await appRes.json();

    // Cross-check: verify submitted IDs match the authenticated application
    const verifiedAppId = appData.id;
    if (applicationId !== verifiedAppId) {
      return res.status(400).json({ error: `Application ID mismatch: submitted ${applicationId} but token belongs to ${verifiedAppId}` });
    }

    if (!appData.bot_public) {
      return res.status(400).json({ error: 'Bot is not set to Public. Enable it in Bot > Authorization Flow.' });
    }

    const flags = appData.flags || 0;
    const GATEWAY_PRESENCE_LIMITED = 1 << 13;
    const GATEWAY_GUILD_MEMBERS_LIMITED = 1 << 15;
    const GATEWAY_MESSAGE_CONTENT_LIMITED = 1 << 19;

    if (!(flags & GATEWAY_PRESENCE_LIMITED)) {
      return res.status(400).json({ error: 'Presence Intent not enabled. Enable it in Bot > Privileged Gateway Intents.' });
    }
    if (!(flags & GATEWAY_GUILD_MEMBERS_LIMITED)) {
      return res.status(400).json({ error: 'Server Members Intent not enabled. Enable it in Bot > Privileged Gateway Intents.' });
    }
    if (!(flags & GATEWAY_MESSAGE_CONTENT_LIMITED)) {
      return res.status(400).json({ error: 'Message Content Intent not enabled. Enable it in Bot > Privileged Gateway Intents.' });
    }

    // Use verified app ID for install URL (don't trust user-submitted clientId)
    const verifiedClientId = verifiedAppId;

    // 3. Set bot avatar from agent's avatar in Supabase storage
    if (setup.avatar_url) {
      try {
        const avatarRes = await fetch(setup.avatar_url);
        if (avatarRes.ok) {
          const avatarBuffer = await avatarRes.arrayBuffer();
          const base64 = Buffer.from(avatarBuffer).toString('base64');
          const contentType = avatarRes.headers.get('content-type') || 'image/png';
          const dataUri = `data:${contentType};base64,${base64}`;

          await fetch('https://discord.com/api/v10/applications/@me', {
            method: 'PATCH',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ icon: dataUri }),
          });
        }
      } catch (avatarErr) {
        console.error('Failed to set Discord bot avatar (non-fatal):', avatarErr);
      }
    }

    // 4. Save to discord_bots table
    const agentName = setup.name || 'Agent';
    const botName = `${agentName} Saint`;
    const installUrl = `https://discord.com/oauth2/authorize?client_id=${verifiedClientId}&scope=bot+applications.commands&permissions=8515702592371780`;

    const { error: insertError } = await supabase.from('discord_bots').upsert({
      application_id: verifiedAppId,
      client_id: verifiedClientId,
      client_secret: clientSecret,
      bot_token: botToken,
      install_url: installUrl,
      name: botName,
    }, { onConflict: 'application_id' });

    if (insertError) {
      throw new Error('Failed to save Discord bot to database');
    }

    // 5. Update agent_setups step_data
    const discordBot = {
      applicationId: verifiedAppId,
      clientId: verifiedClientId,
      installUrl,
      name: botName,
      createdAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('agent_setups')
      .update({
        step_data: {
          ...setup.step_data,
          discord_bot: discordBot,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', setupId);

    if (updateError) {
      throw new Error('Failed to save Discord bot to setup');
    }

    return res.status(200).json({ ok: true, discord_bot: discordBot });
  } catch (error) {
    console.error('Create Discord bot error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create Discord bot' });
  }
}
