import { supabase } from '../../lib/supabase.js';

export const config = { maxDuration: 600 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { setupId } = req.body;

  if (!setupId) {
    return res.status(400).json({ error: 'setupId is required' });
  }

  const openclawUrl = process.env.OPENCLAW_URL;
  const openclawToken = process.env.OPENCLAW_TOKEN;
  const discordEmail = process.env.DISCORD_EMAIL;
  const discordPassword = process.env.DISCORD_PASSWORD;

  if (!openclawUrl || !openclawToken || !discordEmail || !discordPassword) {
    return res.status(500).json({ error: 'Missing OpenClaw or Discord credentials in environment' });
  }

  try {
    const { data: setup, error: fetchError } = await supabase
      .from('agent_setups')
      .select('name')
      .eq('id', setupId)
      .single();

    if (fetchError || !setup) {
      return res.status(404).json({ error: 'Setup not found' });
    }

    const agentName = setup.name || 'Agent';
    const botName = `${agentName} Saint`;

    const systemPrompt = "You are a bot setup automation agent. After completing the task, return the credentials as a JSON code block with keys: applicationId, clientId, clientSecret, botToken.";

    const userPrompt = `Log into Discord Developer Portal (https://discord.com/developers/applications) with email: ${discordEmail}, password: ${discordPassword}. Create a new application named '${botName}'. Go to the Bot tab and add a bot. Under Privileged Gateway Intents, enable: Presence Intent, Server Members Intent, Message Content Intent. Under Bot section > Authorization Flow, ensure 'Public Bot' is checked. Then collect and return as a JSON code block: applicationId (from General Information page), clientId (from OAuth2 page), clientSecret (click Reset Secret on OAuth2 page), botToken (click Reset Token on Bot page).

Steps:
Step 1: Navigate to https://discord.com/developers/applications
Step 2: If login page appears, fill email and password, click Log In
Step 3: If hCaptcha appears, click the checkbox
Step 4: Click "New Application"
Step 5: Type the bot name in the name field
Step 6: Check the TOS/agreement checkbox
Step 7: Click "Create"
Step 8: If hCaptcha appears again, solve it
Step 9: Note the Application ID from General Information page
Step 10: Click "Bot" in the left sidebar
Step 11: If there's an "Add Bot" button, click it and confirm
Step 12: Verify "Public Bot" is checked under Authorization Flow
Step 13: Scroll down to Privileged Gateway Intents
Step 14: Enable Presence Intent
Step 15: Enable Server Members Intent
Step 16: Enable Message Content Intent
Step 17: Click "Save Changes"
Step 18: Click "Reset Token"
Step 19: If MFA password dialog appears, enter the password and submit
Step 20: Copy the bot token
Step 21: Click "OAuth2" in the left sidebar
Step 22: Note the Client ID
Step 23: Click "Reset Secret"
Step 24: If confirmation dialog appears, click "Yes, do it!"
Step 25: If MFA password dialog appears, enter the password and submit
Step 26: Copy the client secret
Step 27: Return ONLY a JSON code block: {"applicationId":"...","clientId":"...","clientSecret":"...","botToken":"..."}`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const openclawRes = await fetch(openclawUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openclawToken}`,
      },
      body: JSON.stringify({
        model: 'openclaw',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!openclawRes.ok) {
      res.write(`data: ${JSON.stringify({ error: `OpenClaw error: ${openclawRes.status}` })}\n\n`);
      res.end();
      return;
    }

    // Pipe SSE stream from OpenClaw to client with keepalive
    const reader = openclawRes.body.getReader();
    const decoder = new TextDecoder();

    // Send SSE comment every 10s to keep Vercel/browser connection alive
    const keepalive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 10_000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } finally {
      clearInterval(keepalive);
    }

    res.end();
  } catch (error) {
    console.error('Discord bot agent error:', error);
    // If headers already sent, end the stream
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({ error: error.message || 'Failed to run Discord bot agent' });
    }
  }
}
