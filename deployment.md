# Production Deployment

Choose the deployment method that matches your server:

- **Shared hosting with PM2 and no root access:** use the first section below.
- **Ubuntu VPS with Docker access:** use the Docker Compose section afterward.

Do not run the Docker commands on shared hosting unless the hosting provider
explicitly gives you Docker access.

## Telegram chat Web App

The chat screen is part of the separate `barter_ethio_web` Next.js repository;
deploy that repository to Netlify as well as deploying this API. Keep using the
existing HTTPS site. For the supplied site URL, set the API server's existing
`.env` value to:

```env
FRONTEND_URL=https://warm-cobbler-1586ce.netlify.app
TELEGRAM_WEB_APP_URL=https://warm-cobbler-1586ce.netlify.app/chat
```

`FRONTEND_URL` is used by the bot's first-time `/start` message to open the
website sign-in page in a browser. Users can sign in with Google, choose their
Google account, then generate a Telegram link code on the dashboard.
`TELEGRAM_WEB_APP_URL` is the chat route base, without a specific offer ID.
When a user receives an offer or message, the bot appends that offer's ID and
opens the chat inside Telegram. Make sure the Netlify frontend's server-side
`API_URL` points to the deployed API. In BotFather, configure the bot's Mini
App/domain to use `warm-cobbler-1586ce.netlify.app`.

The Web App validates Telegram's signed launch data on the API and only permits
the Telegram account already linked to a Barter user. Both chat participants
can open the same offer chat; the normal offer authorization checks still apply.

To link an existing account, sign in to the website and use **Link Telegram**
on the dashboard. Send the displayed `/link CODE` command to the bot within
10 minutes. The code is single-use, stored hashed by the API, and binds the
Telegram identity supplied by the bot to the signed-in account. Deploy the API
and web changes before using this flow; the API deployment applies the new
Prisma migration.

The bot menu also has **Log out** (or `/logout`). This clears the bot session
without unlinking the account. To reconnect, generate a fresh code on the
website dashboard and send `/link CODE` to the bot. When posting a new request
through Telegram, users can optionally share their exact coordinates or skip
location; coordinates are stored with that request.

## Shared hosting with PM2 (no root access)

The existing PM2 app is named `barter-ethio-api` and its ecosystem config uses
`/home/smrestpr/barter-ethio-api` as its working directory. Run these commands
as your hosting account user, without `sudo`. They use the `.env` already on
the server; do not copy this project's local `.env` or replace the server's
environment file.

### Deploy API updates

After pushing API changes to GitHub, SSH into the server and run this as one
block. It stops on the first failure and starts the app whether PM2 currently
has it stopped or running:

```sh
(
  set -e
  cd /home/smrestpr/barter-ethio-api
  git pull --ff-only
  export PNPM_CONFIG_CHILD_CONCURRENCY=1
  export UV_THREADPOOL_SIZE=1
  export RAYON_NUM_THREADS=1
  export TOKIO_WORKER_THREADS=1
  export CARGO_BUILD_JOBS=1
  export NODE_OPTIONS=--v8-pool-size=1
  pnpm install --frozen-lockfile --child-concurrency=1
  pnpm exec prisma generate
  pnpm exec prisma migrate deploy
  pnpm run build
  test -f dist/main.js
  mkdir -p uploads
  pm2 startOrRestart ecosystem.config.js \
    --only barter-ethio-api --update-env
  pm2 save
  pm2 status
)
```

`pnpm install` installs the exact locked dependencies. Prisma Client is
generated, committed database migrations are applied to the database selected
by the server's existing `.env`, and the API is compiled before PM2 starts or
restarts it. `startOrRestart` handles both an existing stopped PM2 entry and a
first start from the ecosystem file. The `.env` file and uploaded files are
not changed by `git pull`. The process/thread limits reduce parallel work for
shared hosting. The commands run in a fail-fast subshell, so an install,
migration, or build error stops before PM2 starts the app.

If an earlier install failed with `failed to spawn thread` or `Resource
temporarily unavailable`, rerun this complete update block after the fix has
been pushed. Do not reload PM2 after a failed install or build.

If `pnpm` is not available in the hosting account's shell, enable the Node.js
version and package-manager environment provided by the host before running
the commands; do not install packages globally or use `sudo`.

### First PM2 start only

For a new clone, set the `cwd` in `ecosystem.config.js` to the actual absolute
clone path. Create and configure the server `.env` before running the deploy
block above. Do not separately start a second copy of this API after that
block has registered the PM2 app.

For this project, set the Telegram Web App URL in the server's existing
`/home/smrestpr/barter-ethio-api/.env`:

```env
FRONTEND_URL=https://warm-cobbler-1586ce.netlify.app
TELEGRAM_WEB_APP_URL=https://warm-cobbler-1586ce.netlify.app/chat
```

Edit that file with `nano .env`; do not replace the rest of the production
environment with a local `.env` or `.env.production.example`. Restart the API
with the deploy block above after changing it.

The server must already have its own `.env` with the production database URL,
JWT secret, Google OAuth client ID, CORS origins, and any enabled integration
settings. Do not copy `.env.production.example` or a local `.env` over it.

Deploy the separate `barter_ethio_web` repository to Netlify as well. Its
server-side `API_URL` must point to the deployed API. Configure
`warm-cobbler-1586ce.netlify.app` as the bot's Mini App domain in BotFather.
Telegram long polling must run in only one process for this bot token. If logs
show `409 Conflict`, find and stop the other PM2 app/server/local process using
the token; restarting this API repeatedly will not resolve a duplicate poller.

## Docker Compose on an Ubuntu VPS

This option deploys the API, PostgreSQL, and Redis with Docker Compose. It
requires Docker permissions and is not suitable for restricted shared hosting.

The production environment file is created on the server at
`/opt/barter-ethio-api/.env.production`. Do **not** copy or upload your local
`.env` file. The server file is ignored by Git and is not replaced when you
pull code updates.

The API listens on `127.0.0.1:3000` by default. Put Nginx or another TLS
reverse proxy in front of it. PostgreSQL and Redis are private to the Docker
network and have no public host ports.

## 1. Install Docker on Ubuntu

Run once on a new server:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin git
sudo systemctl enable --now docker
docker --version
sudo docker compose version
```

## 2. Clone and create the server environment file

```sh
sudo mkdir -p /opt/barter-ethio-api
sudo chown "$USER":"$USER" /opt/barter-ethio-api
git clone https://github.com/yared098/barter-ethio-api.git /opt/barter-ethio-api
cd /opt/barter-ethio-api
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

In the editor, replace the example values:

- `POSTGRES_PASSWORD`: use hex characters only because this value is used in
  the PostgreSQL connection URL.
- `JWT_ACCESS_SECRET`: at least 32 random characters.
- `GOOGLE_CLIENT_ID`: your Google OAuth client ID.
- `CORS_ORIGINS`: your frontend's exact origin(s), comma-separated if there
  are multiple.
- If Telegram is enabled, set `TELEGRAM_BOT_TOKEN` and a private
  `TELEGRAM_INTERNAL_SECRET`.

Generate secret values in another SSH terminal and paste them into the
matching settings:

```sh
openssl rand -hex 24
openssl rand -hex 32
```

Use the first value for `POSTGRES_PASSWORD`, the second for
`JWT_ACCESS_SECRET`. Generate another 32-byte value for
`TELEGRAM_INTERNAL_SECRET` if needed. Save and close the editor. Do not commit
or overwrite `.env.production`.

## 3. Build and start the application

```sh
cd /opt/barter-ethio-api
sudo docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --build
```

The Docker build installs dependencies, generates Prisma Client, and builds
the API. On startup, the API container runs `prisma migrate deploy` before
launching NestJS.

Check containers, logs, and API readiness:

```sh
sudo docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml ps

sudo docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 api

curl --fail http://127.0.0.1:3000/api/v1/health/ready
```

Configure your TLS reverse proxy to forward requests to
`http://127.0.0.1:3000`. If that port is in use, change `API_PORT` in the
server's `.env.production` and use the new port in the proxy configuration.

## 4. Deploy code updates

After pushing changes to GitHub, run on the server:

```sh
cd /opt/barter-ethio-api
git pull --ff-only
sudo docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --build
sudo docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml ps
```

The update uses the existing server `.env.production`; it does not copy an
environment file from Git or from your development machine. Compose rebuilds
the API and migrations run when the new container starts.

Database and uploaded files are stored in named Docker volumes. Do not run
`docker compose down -v` during a normal deployment; `-v` deletes persistent
volumes and their data.
