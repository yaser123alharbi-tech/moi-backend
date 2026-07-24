# Ministry of Interior — Backend API

Express.js + PostgreSQL backend for the Cyber City RP Ministry of Interior system.
Implements JWT auth, role-based access control, and all the modules from the
frontend: personnel, units, badges, leaves, resignations, circulars, audit logs.

This has been tested end-to-end locally (migration → seed → login → RBAC → promote → audit log).

## 1. Get a PostgreSQL database

Pick one:

- **Supabase** (supabase.com) — free tier, gives you a `DATABASE_URL` instantly.
- **Neon** (neon.tech) — free serverless Postgres, also gives a `DATABASE_URL`.
- **Railway** (railway.app) — one-click Postgres plugin.
- **Your own VPS** — `apt install postgresql` and create a database/user yourself.

Copy the connection string they give you.

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgres://user:password@host:5432/dbname
DATABASE_SSL=true          # true for Supabase/Neon/Render, false for local
JWT_SECRET=<generate a long random string>
PORT=4000
CORS_ORIGIN=https://your-frontend-domain.com
```

Generate a strong `JWT_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Install, migrate, seed

```bash
npm install
npm run migrate   # creates all tables from sql/schema.sql
node src/seed.js  # creates demo accounts + starter units/badges
```

The seed script prints the demo logins (same accounts as the frontend demo panel):
`admin/admin123`, `highcmd/highcmd123`, `hr/hr123`, `recruiter/rec123`,
`badges/badge123`, `commander/cmd123`, `soldier/sol123`.
**Change these passwords (or delete the seeded users) before going live.**

## 4. Run it

```bash
npm start
# MOI backend listening on port 4000
```

Test it:
```bash
curl http://localhost:4000/health
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"hr","password":"hr123"}'
```

## 5. Deploy it somewhere permanent

Any Node host works. Easiest options:

- **Railway** — connect this folder's repo, add the same env vars, it builds and runs `npm start` automatically. Attach its Postgres plugin and use the `DATABASE_URL` it gives you.
- **Render** — "Web Service" from your repo, add env vars, same idea.
- **A VPS** — `pm2 start src/server.js --name moi-backend` behind nginx with a real domain + HTTPS (use certbot).

Whatever you choose, you'll end up with a public URL like `https://api.your-domain.com`.

## 6. Point the frontend at it

In `ministry_of_interior.html`, the frontend currently talks to `window.storage`
(the browser-based demo database). To use this real backend instead, replace the
data-layer functions with `fetch()` calls to this API. The mapping is direct:

| Frontend function          | API call                                      |
|-----------------------------|------------------------------------------------|
| `doLogin(username, password)` | `POST /api/auth/login` → store the returned `token` |
| `loadDB()`                  | `GET /api/users`, `GET /api/units`, `GET /api/badges`, `GET /api/circulars`, `GET /api/leaves`, `GET /api/resignations` |
| Add member                  | `POST /api/users` |
| Promote                     | `POST /api/users/:id/promote` |
| Add penalty                 | `POST /api/users/:id/penalty` |
| Transfer unit                | `POST /api/users/:id/transfer` |
| Terminate                   | `POST /api/users/:id/terminate` |
| Award badge                 | `POST /api/badges/:id/award` |
| Submit leave                | `POST /api/leaves` |
| Approve/reject leave        | `POST /api/leaves/:id/review` with `{status:"approved"}` |
| Submit resignation           | `POST /api/resignations` |
| Approve/reject/suspend resignation | `POST /api/resignations/:id/review` |
| New circular                 | `POST /api/circulars` |
| Audit logs (developer only)   | `GET /api/logs`, `GET /api/logs/export.csv` |

Every authenticated request needs the header:
```
Authorization: Bearer <token from login>
```

Store the token in memory or `sessionStorage` in your own hosting environment
(not inside a Claude artifact, since artifacts can't use browser storage APIs —
that limitation goes away once this is deployed as your own website).

If you'd like, send me the word "connect" and tell me where you're hosting
(Supabase, Railway, your own server, etc.) and I'll rewrite the frontend's data
layer to call this API directly instead of `window.storage`, fully wired up.

## Project structure

```
moi-backend/
├── sql/schema.sql          # full Postgres schema (tables, relations, indexes)
├── src/
│   ├── db.js                # PostgreSQL connection pool
│   ├── migrate.js           # applies schema.sql
│   ├── seed.js               # demo accounts + starter data
│   ├── app.js                 # Express app + route wiring
│   ├── server.js              # entrypoint
│   ├── middleware/auth.js     # JWT verification + role guard
│   ├── utils/audit.js          # writes to audit_logs on every action
│   └── routes/
│       ├── auth.js
│       ├── users.js
│       ├── units.js
│       ├── badges.js
│       ├── leaves.js
│       ├── resignations.js
│       ├── circulars.js
│       └── logs.js
├── package.json
└── .env.example
```

## Security notes

- Passwords are hashed with bcrypt — never stored in plain text.
- All endpoints (except `/health` and `/api/auth/login`) require a valid JWT.
- Role checks happen **server-side** in `middleware/auth.js`, not just in the UI —
  so even if someone bypasses the frontend, the API itself refuses unauthorized actions.
- Every state-changing action writes to `audit_logs` with actor, IP, and before/after data.
- Uses parameterized queries throughout (the `pg` library) — protected against SQL injection.
- Set `CORS_ORIGIN` to your real frontend domain in production (not `*`).
