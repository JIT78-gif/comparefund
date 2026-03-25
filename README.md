# FIDC Intel

## Local Setup (Pure PostgreSQL + Express)

### Prerequisites
- Node.js 18+
- Docker (for PostgreSQL)

### 1. Start PostgreSQL
```bash
docker-compose up -d
```

### 2. Start the Backend
```bash
cd server
npm install
npm run dev
```

Optional `server/.env` file:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fidc_intel
JWT_SECRET=your-secret-key-here
GEMINI_API_KEY=your-gemini-key  # Optional, for AI chat
N8N_WEBHOOK_URL=               # Optional, for n8n chat proxy
PORT=3001
```

### 3. Start the Frontend
```bash
npm install
npm run dev
```

Create/update `.env`:
```
VITE_API_URL=http://localhost:3001
```

### If Docker was started before this fix
If your local database was initialized with an older broken schema, reset it once:

```bash
docker compose down -v
docker compose up -d
```

The backend now auto-applies `server/schema.sql` on startup, so missing tables like `users` are recreated automatically.

### 4. Create Admin User
Register via the UI, then manually grant admin:
```bash
psql postgresql://postgres:postgres@localhost:5432/fidc_intel -c "
  INSERT INTO user_roles (user_id, role)
  SELECT id, 'admin' FROM users WHERE email = 'your@email.com';
"
```

## Tech Stack
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, PostgreSQL (pg), JWT auth
- **Data**: CVM public datasets (FIDC monthly reports)
