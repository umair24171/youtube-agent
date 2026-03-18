// get_youtube_token.js — Run ONCE locally to get refresh token
import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import 'dotenv/config';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:3000/callback'
);

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n══════════════════════════════════════════════════');
console.log('  YouTube OAuth2 Token Setup');
console.log('══════════════════════════════════════════════════');
console.log('\n1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Sign in with your YouTube channel Google account');
console.log('3. It will redirect to localhost — token will be captured automatically');
console.log('\nWaiting for authorization...\n');

// Start local server to catch the redirect
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('No code found');
    return;
  }

  res.end('<h1>✅ Success! You can close this tab.</h1><p>Check your terminal for the refresh token.</p>');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ SUCCESS! Add this to your .env and GitHub Secrets:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n⚠️  Keep this token SECRET');
  } catch (err) {
    console.error('\n❌ Failed:', err.message);
  }

  server.close();
  process.exit(0);
});

server.listen(3000, () => {
  console.log('Local server ready on http://localhost:3000');
});