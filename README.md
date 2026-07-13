# Verity

A browser-based first-person horror game built with Node.js, Express, Google Identity Services, and Three.js.

The player is trapped inside a large procedural timber maze containing small enterable wooden cabins. Verity—a humanoid entity with distorted proportions—continuously pathfinds toward the player. The run ends only when the player falls through the exit hole or Verity catches and consumes the player.

## Included gameplay

- Fresh, difficult procedural maze on every page load
- Enterable wooden cabins placed throughout dead ends
- First-person mouse look and WASD movement
- `W + Shift` sprinting with exactly 10 seconds of stamina
- Stamina exhaustion and regeneration
- Continuously pursuing pathfinding enemy
- Procedural creature model, animation, lighting, textures, ambience, footsteps, heartbeat, and screech audio
- Flashlight, fog, screen effects, chase warnings, and death sequence
- Void exit and the final message: **YOU SURVIVED VERITY.**
- Pause overlay using `Esc`, `P`, or the visible pause control
- Google Sign-In with server-side ID-token verification
- Protected game page and protected Three.js modules
- EC2/PM2 deployment scripts

## Requirements

- Node.js 20 or newer
- A Google OAuth 2.0 **Web application** client ID
- HTTPS for the production domain
- Git and, for the recommended EC2 setup, PM2

## Run locally on the Dell laptop

From PowerShell or Git Bash:

```bash
cp .env.example .env
npm ci
npm run dev
```

Open:

```text
http://localhost:3000
```

Update `.env` with your real Google client ID and a random session secret. For a local gameplay-only test, set `DEV_BYPASS_AUTH=true`; this option is automatically unavailable when `NODE_ENV=production`.

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Google Sign-In setup

In Google Cloud Console:

1. Create or select a project.
2. Configure the OAuth consent screen.
3. Create an OAuth client ID with application type **Web application**.
4. Add these Authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://YOUR-GAME-DOMAIN`
5. Put the generated client ID in `.env` as `GOOGLE_CLIENT_ID`.

This project uses the Google Identity Services JavaScript callback flow. It sends the returned ID token to `/api/auth/google`, where the Node server verifies its signature, issuer, expiration, and audience using `google-auth-library`. A Google client secret is not used by this sign-in flow.

## Environment variables

```dotenv
NODE_ENV=production
PORT=3000
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
SESSION_SECRET=long-random-value
ALLOWED_GOOGLE_DOMAINS=
DEV_BYPASS_AUTH=false
```

`ALLOWED_GOOGLE_DOMAINS` is optional. Example:

```dotenv
ALLOWED_GOOGLE_DOMAINS=example.com,anothercompany.com
```

## Git workflow from the Dell laptop

Unzip this archive over the root of the target repository, then:

```bash
git status
git add .
git commit -m "Add Verity horror maze game"
git push origin YOUR-BRANCH
```

Because no existing repository was supplied when this package was generated, the ZIP contains the complete standalone application rather than a repository-specific patch.

## EC2 deployment

See [DEPLOYMENT-EC2.md](./DEPLOYMENT-EC2.md).

## Validation commands

```bash
npm run check
npm run smoke:browser
```

The browser smoke test requires Chromium and Xvfb and is intended mainly for Linux/CI. Normal Windows development does not require the smoke-test dependencies to run the game.
