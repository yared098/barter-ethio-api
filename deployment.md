# Production Deployment

This guide deploys the API, PostgreSQL, and Redis with Docker Compose on an
Ubuntu server. PM2 is not used for this deployment.

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
