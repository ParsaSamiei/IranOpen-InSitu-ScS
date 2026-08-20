# Deploying IranOpen-InSitu-ScS-App to your own server

This replaces Vercel + Neon entirely: Postgres runs on your server, in Docker,
and GitHub Actions builds + deploys the app on every push to `main`.

---

## Part A — Edit two files in the repo

**1. `api/index.js`** — add static-serving for the built client. Paste this
right before the existing `if (process.env.VERCEL !== '1') { ... }` block near
the bottom of the file:

```js
// ---------- Serve the built client (only relevant when running outside Vercel) ----------
app.use(express.static(path.join(__dirname, "../client/dist")));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});
```

(`path` is already imported at the top of the file.)

**2. `api/db.js`** — fix the SSL check so it also recognizes your Docker Postgres:

```js
// change this line:
ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },

// to this:
ssl: /localhost|sslmode=disable/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
```

**3. Add the new files** from the zip to your repo, keeping this layout:

```
IranOpen-InSitu-ScS-App/
├── Dockerfile
├── .dockerignore
├── .github/workflows/ci.yml
├── .github/workflows/cd.yml
└── deploy/
    ├── docker-compose.yml
    ├── .env.example
    └── nginx-IranOpen-InSitu.conf
```

`deploy/` is just a reference copy kept in git — the real `docker-compose.yml`
and `.env` that matter will live on the server itself (Part B).

Commit all of this, but **don't push to `main` yet** — do the server setup
first so the first CD run has something to deploy to.

```bash
git checkout -b docker-deploy
git add .
git commit -m "Add Docker deployment + CI/CD"
git push -u origin docker-deploy
```

---

## Part B — Prepare the server

**1. SSH in and check/install Docker** (skip if already installed):

```bash
docker --version
docker compose version
```

If missing:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to apply
```

**2. Create a dedicated deploy user** (keeps this isolated from whatever else
runs on the box — it only needs Docker access, nothing else):

```bash
sudo adduser --disabled-password --gecos "" IranOpen-InSitu-deploy
sudo usermod -aG docker IranOpen-InSitu-deploy
```

**3. Generate an SSH keypair for GitHub Actions to use** (run as your own user,
not as `IranOpen-InSitu-deploy`):

```bash
ssh-keygen -t ed25519 -f ~/IranOpen-InSitu_deploy_key -C "github-actions-IranOpen-InSitu" -N ""
sudo mkdir -p /home/IranOpen-InSitu-deploy/.ssh
sudo cp ~/IranOpen-InSitu_deploy_key.pub /home/IranOpen-InSitu-deploy/.ssh/authorized_keys
sudo chown -R IranOpen-InSitu-deploy:IranOpen-InSitu-deploy /home/IranOpen-InSitu-deploy/.ssh
sudo chmod 700 /home/IranOpen-InSitu-deploy/.ssh
sudo chmod 600 /home/IranOpen-InSitu-deploy/.ssh/authorized_keys
cat ~/IranOpen-InSitu_deploy_key       # this is SSH_PRIVATE_KEY — copy it, you'll need it in Part C
```

**4. Create the deploy directory and env file:**

```bash
sudo mkdir -p /opt/IranOpen-InSitu
sudo chown IranOpen-InSitu-deploy:IranOpen-InSitu-deploy /opt/IranOpen-InSitu
```

Copy `deploy/docker-compose.yml` from the zip to `/opt/IranOpen-InSitu/docker-compose.yml`
on the server (e.g. `scp deploy/docker-compose.yml IranOpen-InSitu-deploy@yourserver:/opt/IranOpen-InSitu/`).

Copy `deploy/.env.example` to `/opt/IranOpen-InSitu/.env` and fill in real values:

```bash
sudo -u IranOpen-InSitu-deploy nano /opt/IranOpen-InSitu/.env
```

```
POSTGRES_USER=IranOpen-InSitu
POSTGRES_PASSWORD=<generate a long random password>
POSTGRES_DB=IranOpen-InSitu
AUTH_SECRET=<a long random string, used to sign login tokens>
BOOTSTRAP_SUPERADMIN_USERNAME=admin
BOOTSTRAP_SUPERADMIN_PASSWORD=<a strong password for the first Super Admin account>
```

`.env` never gets committed to git — it only lives on the server.

---

## Part C — nginx + domain (doesn't touch your other sites)

**1. Point DNS** — add an A record for e.g. `IranOpen-InSitu.yourdomain.com` to your
server's IP.

**2. Add the nginx site**, edit the domain in `nginx-IranOpen-InSitu.conf` first:

```bash
sudo cp deploy/nginx-IranOpen-InSitu.conf /etc/nginx/sites-available/IranOpen-InSitu.yourdomain.com
sudo ln -s /etc/nginx/sites-available/IranOpen-InSitu.yourdomain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**3. Add TLS** (after DNS has propagated):

```bash
sudo certbot --nginx -d IranOpen-InSitu.yourdomain.com
```

This only adds a new site block — your existing apps' nginx configs are untouched.

---

## Part D — GitHub repo configuration

**1. Add repo secrets** — GitHub repo → Settings → Secrets and variables →
Actions → New repository secret:

| Secret            | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| `SSH_HOST`        | your server's IP or hostname                             |
| `SSH_USER`        | `IranOpen-InSitu-deploy`                                 |
| `SSH_PRIVATE_KEY` | contents of `~/IranOpen-InSitu_deploy_key` from Part B.3 |
| `SSH_PORT`        | `22` (or your custom SSH port)                           |

**2. Merge `docker-deploy` into `main`** (via PR, so CI runs first, or directly):

```bash
git checkout main
git merge docker-deploy
git push origin main
```

This triggers `cd.yml`: it builds the image, pushes it to
`ghcr.io/parsasamiei/IranOpen-InSitu-scs-app`, then SSHes in and runs
`docker compose pull && up -d`.

**3. Make the GHCR package public** (simplest option, since your repo is
already public — avoids setting up a registry login on the server):
GitHub → your profile → **Packages** → `IranOpen-InSitu-scs-app` → Package settings →
Change visibility → **Public**.

The very first CD run will fail to `pull` on the server since the package
doesn't exist yet before that first push — that's expected. Once step 2's
build finishes and you've made the package public, re-run the failed
**deploy** job from the Actions tab (or just push an empty commit).

---

## Part E — Verify

On the server:

```bash
cd /opt/IranOpen-InSitu
docker compose ps                 # both containers should be "Up"
docker compose logs -f app        # check for "Server running on http://localhost:4000"
curl http://127.0.0.1:4000/api/public/settings
```

Then open `https://IranOpen-InSitu.yourdomain.com` in a browser — you should see the
public site, and logging in at `/admin/login` with the
`BOOTSTRAP_SUPERADMIN_USERNAME`/`BOOTSTRAP_SUPERADMIN_PASSWORD` you set should work.

---

## Part F — Retiring Neon/Vercel

The server's Postgres starts empty — no teams or scores carry over
automatically. If you want your existing data, dump it from Neon and restore
it into the new database:

```bash
# from your machine, using the Neon connection string:
pg_dump "postgresql://USER:PASSWORD@NEON_HOST/DBNAME?sslmode=require" -F c -f IranOpen-InSitu_backup.dump

# copy it to the server, then inside the db container:
docker cp IranOpen-InSitu_backup.dump IranOpen-InSitu_db:/tmp/backup.dump
docker exec IranOpen-InSitu_db pg_restore -U IranOpen-InSitu -d IranOpen-InSitu /tmp/backup.dump
```

Once you're confident the self-hosted version is working, you can delete the
Vercel project (or just leave it — it's independent and won't conflict with
this setup either way, since it points at Neon and this points at your own DB).
