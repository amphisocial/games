'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const SESSION_SECRET = (process.env.SESSION_SECRET || '').trim();
const DEV_BYPASS_AUTH = !IS_PRODUCTION && process.env.DEV_BYPASS_AUTH === 'true';
const ALLOWED_GOOGLE_DOMAINS = (process.env.ALLOWED_GOOGLE_DOMAINS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (IS_PRODUCTION && !SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required when NODE_ENV=production.');
}
if (IS_PRODUCTION && !GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID is required when NODE_ENV=production.');
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
        frameSrc: ['https://accounts.google.com'],
        connectSrc: ["'self'", 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com', 'https://*.googleusercontent.com'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://accounts.google.com'],
      },
    },
  }),
);
app.use(express.json({ limit: '32kb' }));
app.use(
  cookieSession({
    name: 'verity_session',
    keys: [SESSION_SECRET || 'local-development-only-change-me'],
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: 12 * 60 * 60 * 1000,
  }),
);

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const publicDir = path.join(__dirname, 'public');
const threeRoot = path.resolve(path.dirname(require.resolve('three')), '..');

function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }
  if (req.accepts('html')) {
    return res.redirect('/');
  }
  return res.status(401).json({ error: 'Authentication required.' });
}

function sanitizeUser(payload) {
  return {
    sub: payload.sub,
    name: payload.name || payload.given_name || 'Player',
    givenName: payload.given_name || '',
    email: payload.email,
    picture: payload.picture || '',
  };
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'verity-horror-game' });
});

app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    devBypassAuth: DEV_BYPASS_AUTH,
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ authenticated: false });
  }
  return res.json({ authenticated: true, user: req.session.user });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: 'Google Sign-In is not configured on this server.' });
    }

    const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return res.status(401).json({ error: 'Google account could not be verified.' });
    }

    if (ALLOWED_GOOGLE_DOMAINS.length > 0) {
      const emailDomain = payload.email.split('@').pop().toLowerCase();
      if (!ALLOWED_GOOGLE_DOMAINS.includes(emailDomain)) {
        return res.status(403).json({ error: 'This Google account is not permitted.' });
      }
    }

    req.session.user = sanitizeUser(payload);
    return res.json({ ok: true, user: req.session.user });
  } catch (error) {
    console.error('Google authentication failed:', error.message);
    return res.status(401).json({ error: 'Google Sign-In failed. Please try again.' });
  }
});

app.post('/api/auth/dev', (req, res) => {
  if (!DEV_BYPASS_AUTH) {
    return res.status(404).json({ error: 'Not found.' });
  }
  req.session.user = {
    sub: 'local-developer',
    name: 'Local Developer',
    givenName: 'Developer',
    email: 'local@verity.invalid',
    picture: '',
  };
  return res.json({ ok: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  if (req.session?.user) {
    return res.redirect('/game');
  }
  return res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/styles.css', (_req, res) => res.sendFile(path.join(publicDir, 'styles.css')));
app.get('/login.js', (_req, res) => res.sendFile(path.join(publicDir, 'login.js')));
app.get('/favicon.svg', (_req, res) => res.sendFile(path.join(publicDir, 'favicon.svg')));

app.get('/game', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'game.html')));
app.get('/campaign.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'campaign.js')));
app.get('/level/1', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'level1.html')));
app.get('/level1.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'level1.js')));
app.get('/level/2', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'level2.html')));
app.get('/level2.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'level2.js')));
app.get('/level/3', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'level3.html')));
app.get('/level3.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'level3.js')));
app.get('/mode/bossfight', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'bossfight.html')));
app.get('/bossfight.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'bossfight.js')));
app.get('/mode/be-the-monster', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'be-the-monster.html')));
app.get('/be-the-monster.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'be-the-monster.js')));
app.get('/mode/dark-onslaught', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'dark-onslaught.html')));
app.get('/dark-onslaught.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'dark-onslaught.js')));
// Backward-compatible route for older bookmarks/builds.
app.get('/game.js', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'level1.js')));

app.use(
  '/vendor/three/addons',
  requireAuth,
  express.static(path.join(threeRoot, 'examples', 'jsm'), { immutable: true, maxAge: '7d' }),
);
app.use(
  '/vendor/three',
  requireAuth,
  express.static(path.join(threeRoot, 'build'), { immutable: true, maxAge: '7d' }),
);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`The Timber Figure campaign is listening on port ${PORT} (${NODE_ENV}).`);
});
