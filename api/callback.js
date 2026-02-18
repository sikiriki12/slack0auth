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

  console.log(`New install: ${data.team.name} | Token: ${data.access_token}`);

  res.send('Installed! You can close this tab.');
}
