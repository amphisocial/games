# Archive contents

## Application

- `server.js` — Express server, secure cookie session, Google token verification, protected routes, CSP, health endpoint
- `public/login.html` — Google Sign-In landing page
- `public/login.js` — Google Identity Services initialization and login handling
- `public/game.html` — game HUD, overlays, controls, pause and ending UI
- `public/game.js` — procedural maze, cabins, collision, movement, stamina, enemy pathfinding, creature, audio, exit and death logic
- `public/styles.css` — responsive horror UI and overlays
- `public/favicon.svg` — Verity icon

## Configuration and deployment

- `.env.example`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `ecosystem.config.cjs`
- `scripts/deploy-ec2.sh`
- `scripts/install-post-merge-hook.sh`
- `nginx/verity.conf.example`
- `DEPLOYMENT-EC2.md`

## Quality checks

- `scripts/smoke-browser.cjs`
- `npm run check`
- `npm run smoke:browser`
