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

    const systemPrompt = "You are a bot setup automation agent. Follow the steps exactly. Be concise — do not narrate. After completing all steps, return ONLY a JSON code block.";

    const userPrompt = `Step 1: Navigate to https://discord.com/developers/applications
Step 2: If not logged in, fill email field with ${discordEmail}, password field with ${discordPassword}, click Log In
Step 3: Click "New Application", name it "${botName}", accept TOS, click Create
Step 4: Note the Application ID from the URL or General Information page
Step 5: Click "Bot" in the left sidebar
Step 6: Enable: Presence Intent, Server Members Intent, Message Content Intent
Step 7: Click Save Changes
Step 8: Click Reset Token, confirm, copy the token
Step 9: Click "OAuth2" in the left sidebar
Step 10: Note the Client ID
Step 11: Click Reset Secret, confirm, copy the secret
Step 12: Return ONLY a JSON code block with: applicationId, clientId, clientSecret, botToken`;

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
