# EC2 Deployment

## First deployment

Install Node.js 20+, Git, and PM2 on the EC2 instance. Then clone the repository and run:

```bash
cd /opt/apps/verity
cp .env.example .env
nano .env
npm ci --omit=dev
sudo npm install -g pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` once so the game restarts after an EC2 reboot.

Verify the local application port:

```bash
curl http://127.0.0.1:3000/healthz
```

Expected response:

```json
{"status":"ok","service":"verity-horror-game"}
```

## Nginx reverse proxy

Copy `nginx/verity.conf.example` to your Nginx sites directory, replace the domain, enable the site, and obtain an HTTPS certificate. The Node server expects the proxy to terminate HTTPS and forward to port 3000.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

In Google Cloud, add the exact public origin, such as `https://verity.example.com`, to the OAuth client's Authorized JavaScript origins.

## Make future deployment a simple `git pull`

The repository includes a tracked installer for a local Git `post-merge` hook. Run this once on EC2:

```bash
cd /opt/apps/verity
./scripts/install-post-merge-hook.sh
```

After that, this command:

```bash
git pull
```

will automatically run `npm ci --omit=dev` and reload the PM2 process.

Git hooks are intentionally stored inside `.git`, so the installer must be run once for each EC2 clone.

## Manual deployment alternative

Without the hook:

```bash
git pull
./scripts/deploy-ec2.sh
```

## Useful PM2 commands

```bash
pm2 status
pm2 logs verity-game
pm2 restart verity-game
pm2 save
```

## Apache alternative

If the EC2 server already uses Apache, proxy HTTPS traffic to `http://127.0.0.1:3000` with `ProxyPass` and `ProxyPassReverse`. Ensure `proxy`, `proxy_http`, `headers`, and SSL modules are enabled.
