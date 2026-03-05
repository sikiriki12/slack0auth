export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.TAILSCALE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TAILSCALE_API_KEY not configured' });
  }

  try {
    const tsRes = await fetch('https://api.tailscale.com/api/v2/tailnet/-/devices', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!tsRes.ok) {
      const text = await tsRes.text();
      throw new Error(`Tailscale API error (${tsRes.status}): ${text}`);
    }

    const tsData = await tsRes.json();
    const devices = (tsData.devices || [])
      .filter((d) => d.name)
      .map((d) => ({
        hostname: d.hostname || 'unknown',
        fqdn: d.name,
      }));

    return res.status(200).json({ devices });
  } catch (error) {
    console.error('Discover gateways error:', error);
    return res.status(500).json({ error: error.message || 'Failed to discover gateways' });
  }
}
