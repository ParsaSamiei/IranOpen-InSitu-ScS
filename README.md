<div align="center">

# 🏆 IranOpen-InSitu-ScS-App

### Scoring & Standings System for IranOpen InSitu

**Built for [IranOpen-InSitu](https://github.com/ParsaSamiei), the RoboCup-style robotics competition hosted by Pishanam Robotics Academy**

[![Made with React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Made with Node](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Deploy-Docker%20%2B%20Nginx-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](https://github.com/features/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

<div align="center">

| 🟢 مقدماتی (Preliminary) | 🔴 پیشرفته (Advanced) |
| :----------------------: | :-------------------: |

</div>

**IranOpen-InSitu-ScS-App** ("ScS" = Scoring System) is the official judging platform for the event — replacing paper scoresheets with a fast, accurate, and judge-friendly digital workflow, from the first round to the final standings.

---

## ✨ Features

- 🧾 **Rule-builder scoring forms** — a Super Admin defines each round's sections and items (checkbox / multi-option / single-choice / numeric scale / counter) from the admin panel — no code changes or redeploys needed to change the rules
- 👥 **Role-based accounts** — Admin (score entry, day-to-day judging) and Super Admin (teams, rule builder, users, competition branding) log in with their own username/password
- 🌐 **Public read-only site** — anyone can view live standings and round-by-round history at the site's root, no login required
- 🕋 **Native RTL Persian UI** — built with the Vazirmatn font for a natural experience for Persian-speaking judges
- 🧮 **Automatic, rule-driven scoring** for every item type a round's rules define
- 📈 **Live standings** — ranked automatically by each team's best round
- 📊 **One-click Excel export** — a sheet per round (one column per rule item) plus a standings sheet per league
- ⏱️ **Custom RTL time-input widget**, toggle-able per round from the rule builder
- ✍️ **Optional captain sign-off**, toggle-able per round from the rule builder
- ⚙️ **DB-backed competition branding** — name/subtitle/logo editable from the Settings tab, shown on both the public site and the admin panel
- ☁️ **Cloud-ready** — same codebase deploys to a self-hosted server or a serverless cloud stack

---

## 🧱 Architecture

<div align="center">

```
┌─────────────────────┐        ┌──────────────────────┐        ┌─────────────────┐
│   client (React)     │  ───▶  │   api (Express)       │  ───▶  │   PostgreSQL     │
│   Vite · RTL UI       │        │   Rule-driven engine  │        │   (Neon / Docker)│
└─────────────────────┘        └──────────────────────┘        └─────────────────┘
```

</div>

| Layer                 | Technology                                                  |
| --------------------- | ----------------------------------------------------------- |
| 🎨 Frontend           | React + Vite + React Router                                 |
| ⚙️ Backend            | Node.js + Express                                           |
| 🗄️ Database           | PostgreSQL                                                  |
| 🔐 Auth               | Per-user accounts (bcrypt) with `admin`/`super_admin` roles |
| 📤 Excel export       | SheetJS (`xlsx`)                                            |
| ☁️ Cloud deploy       | Vercel (serverless) + Neon (managed Postgres)               |
| 🐳 Self-hosted deploy | Docker + Docker Compose + Nginx                             |
| 🔁 CI/CD              | GitHub Actions → GitHub Container Registry (GHCR)           |

### Repository Structure

```
IranOpen-InSitu-ScS-App/
├── client/   🎨 React + Vite frontend — public site, judging UI, rule builder, admin screens
└── api/      ⚙️ Node.js + Express API — rules engine, auth/roles, PostgreSQL access
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- Node.js **18+**
- A PostgreSQL instance (local, or managed like Neon)

### 1️⃣ Configure the database & auth

Create `.env` in the repo root (see `.env.example`):

```env
DATABASE_URL=postgres://user:password@localhost:5432/IranOpen-InSitu
AUTH_SECRET=<a long random string, used to sign login tokens>
BOOTSTRAP_SUPERADMIN_USERNAME=admin
BOOTSTRAP_SUPERADMIN_PASSWORD=<a strong password>
```

The first time the API starts with no `super_admin` account in the database, it creates one from `BOOTSTRAP_SUPERADMIN_USERNAME`/`BOOTSTRAP_SUPERADMIN_PASSWORD` — after that, manage further accounts from the Users tab.

### 2️⃣ Start the backend

```bash
npm install
npm start
```

➡️ API live at `http://localhost:4000`

### 3️⃣ Start the frontend

```bash
cd client
npm install
npm run dev
```

➡️ Open `http://localhost:5173` — the dev server proxies API calls to the backend.

---

## 🐳 Deployment

### Option A — Self-hosted (Docker + Nginx)

```bash
docker compose up -d --build
```

| Service  | Role                                       |
| -------- | ------------------------------------------ |
| `client` | Production build served behind Nginx       |
| `server` | Express API on the internal Docker network |
| `nginx`  | Reverse proxy / HTTP(S) termination        |

**CI/CD pipeline:** every push to `main` triggers a GitHub Actions workflow that builds Docker images and publishes them to **GHCR**. The server pulls the new images and restarts the stack — zero manual steps.

### Option B — Serverless (Vercel + Neon)

Set in your Vercel project's Environment Variables:

```env
DATABASE_URL=<Neon connection string>
AUTH_SECRET=<a long random string>
BOOTSTRAP_SUPERADMIN_USERNAME=admin
BOOTSTRAP_SUPERADMIN_PASSWORD=<a strong password>
```

> ⚠️ `vercel.json` must use the modern config format (`rewrites`, or `builds`/`routes`) for API routes to resolve correctly.

See [`DEPLOY.md`](./DEPLOY.md) for the full walkthrough of either option.

---

## 📐 Scoring Rules

Rules are no longer hardcoded — a **Super Admin** defines them per round from the **Rules** tab in the admin panel (rounds → sections → items), stored in the database. Changing a round's rules (or adding a new round) takes effect immediately for judges entering scores, with no code change or redeploy.

| Item type | Rule                                                       |
| --------- | ---------------------------------------------------------- |
| `binary`  | full score when checked, 0 otherwise                       |
| `multi`   | score = per-option value × options checked                 |
| `choice`  | pick exactly one option; each option carries its own value |
| `scale`   | judge enters a number from 0 up to the item's max points   |
| `counter` | score = per-unit value × count entered                     |

Each round can also independently require (or not require) a round timer and a captain's signature, set from the same Rules tab.

---

## 📊 Excel Export

Generate a full results workbook on demand from the Export tab — one sheet per round (with a column per that round's rule item, since rule sets can differ round to round), plus a standings sheet per league.

---

## 💾 Backups

| Setup      | How to back up |
| ---------- | -------------- |
| PostgreSQL | `pg_dump`      |

---

## 🤝 Contributing

Built and maintained for **IranOpen-InSitu**, by **Pishanam Robotics Academy**. Found a bug or have an idea? Open an issue — contributions are welcome.

## 📄 License

This project is licensed under the **MIT License** — see [`LICENSE`](./LICENSE) for details.

---

<div align="center">

Made with 🤖 for **IranOpen-InSitu**

</div>
