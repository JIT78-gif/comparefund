# FIDC Intel

## Local Setup (Pure PostgreSQL + Express)

### Prerequisites
- Node.js 18+
- Docker (for PostgreSQL)

---

### 1. Start PostgreSQL
```bash
docker-compose up -d
```

---

### 2. Start the Backend
```bash
cd server
npm install
npm run dev
```

On first run, the server automatically:
- Applies the database schema (`server/schema.sql`)
- Seeds the initial competitor data (Atena, Multiplica, Red, Sifra) if the database is empty

No manual seed step required. Admin changes to competitors persist across restarts.

`server/.env` file:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fidc_intel
JWT_SECRET=your-secret-key-here
N8N_WEBHOOK_URL=your-n8n-webhook-url  # Required for the Regulations chat
PORT=3001
```

---

### 3. Start the Frontend
```bash
# from the root folder
npm install
npm run dev
```

Root `.env` file:
```
VITE_API_URL=http://localhost:3001
```

---

### 4. Grant Admin Access

#### Grant admin to an existing or new user:
```bash
cd server
npm run grant-admin -- email@example.com
```

#### Grant admin with a custom default password:
```bash
npm run grant-admin -- email@example.com MyPassword123
```

- If the user **already exists**, it just grants them the admin role.
- If the user **does not exist**, it creates their account with the provided password (default: `Admin@123`) and grants admin.

> Change the password after first login.

---

### If Docker was started before a schema update
If your local database was initialized with an older schema, reset it once:

```bash
docker compose down -v
docker compose up -d
```

The backend auto-applies `server/schema.sql` on every startup, so tables are always up to date.

---

## Server Scripts Reference

All scripts are run from the `server/` directory:

| Script | Command | Description |
|--------|---------|-------------|
| Start dev server | `npm run dev` | Starts backend with hot reload, auto-seeds on first run |
| Start server | `npm run start` | Starts backend without hot reload, auto-seeds on first run |
| Grant admin | `npm run grant-admin -- email [password]` | Grants admin role to a user (creates if needed) |

---

## Tech Stack
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, PostgreSQL (pg), JWT auth
- **Data**: CVM public datasets (FIDC monthly reports)
