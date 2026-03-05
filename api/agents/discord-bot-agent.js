import { supabase } from '../../lib/supabase.js';

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

    const userPrompt = `Log into Discord Developer Portal (https://discord.com/developers/applications) with email: ${discordEmail}, password: ${discordPassword}. Create a new application named '${botName}'. Go to the Bot tab and add a bot. Under Privileged Gateway Intents, enable: Presence Intent, Server Members Intent, Message Content Intent. Under Bot section > Authorization Flow, ensure 'Public Bot' is checked. Then collect and return as a JSON code block: applicationId (from General Information page), clientId (from OAuth2 page), clientSecret (click Reset Secret on OAuth2 page), botToken (click Reset Token on Bot page).`;

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

    // Pipe SSE stream from OpenClaw to client
    const reader = openclawRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
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
