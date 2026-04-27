// api/token.js
// Handles Zoho OAuth token refresh
// Environment variables required:
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN

let cachedToken = null;
let tokenExpiry = 0;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const token = await getAccessToken();
    res.status(200).json({ access_token: token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token'
  });

  const response = await fetch(
    `https://accounts.zoho.com/oauth/v2/token?${params}`,
    { method: 'POST' }
  );

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('Failed to refresh token: ' + JSON.stringify(data));
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  return cachedToken;
}
