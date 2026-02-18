export default async function handler(req, res) {
  const { code } = req.query;

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
    }),
  });

  const data = await response.json();

  // Send welcome DM to the installer — makes bot appear in sidebar instantly
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.access_token}`,
    },
    body: JSON.stringify({
      channel: data.authed_user.id,
      text: "👋 Hey! I'm Robert. You can DM me here anytime.",
    }),
  });

  console.log(`New install: ${data.team.name} | Token: ${data.access_token}`);

  res.send('Installed! You can close this tab.');
}
