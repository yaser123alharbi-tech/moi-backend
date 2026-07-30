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

## 3. Install, migrate, import your real roster

```bash
npm install
npm run migrate          # creates all tables (schema + LSPD field additions)
npm run import:roster    # imports your real 65-person roster + vacant slots from data/lspd_roster.json
node src/seed_badges.js  # creates the starter set of wings/badges
```

`import:roster` is safe to re-run — it skips any badge number already in the database,
so running it twice won't duplicate people or reset passwords.

It prints (and saves to `data/issued_credentials.csv`) a **private** username/password
for every real person on the roster — username = their badge number (e.g. `a2`, `c9`, `t0`),
password = randomly generated. **This file contains real login credentials — never commit
it to a public repo or expose it on the website.** Distribute each person's line to them
individually (Discord DM, etc.) and encourage them to change their password once you build
a "change password" feature, or rotate it yourself via the `provision-access` endpoint.

Vacant badge slots (no name in your schedule) are imported too, so the roster numbers
match your real org chart — they show up as "Vacant" and have no login until an
HR/High Command user fills the seat via **Provision Login Access** in the UI.

Roles were auto-assigned from the admin titles in your sheet (Chief of Police / Assistant
Chief → High Command, Head of Internal Affairs → HR, Deputy Police Academy → Recruiter,
Commander badges → Unit Commander). Everyone else starts as a regular Soldier — High
Command can promote anyone's system role afterward from their profile page
("Assign System Role").

## 4. Run it

```bash
npm start
# MOI backend listening on port 4000
```

Test it:
```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/public/roster   # public — no auth needed
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<a badge-based username from issued_credentials.csv>","password":"<its password>"}'
```

## 5. Deploy it somewhere permanent

Any Node host works. Easiest options:

- **Railway** — connect this folder's repo, add the same env vars, it builds and runs `npm start` automatically. Attach its Postgres plugin and use the `DATABASE_URL` it gives you.
- **Render** — "Web Service" from your repo, add env vars, same idea.
- **A VPS** — `pm2 start src/server.js --name moi-backend` behind nginx with a real domain + HTTPS (use certbot).

Whatever you choose, you'll end up with a public URL like `https://api.your-domain.com`.

## 6. Point the frontend at it

`moi-frontend/index.html` (shipped alongside this backend) is **already fully wired**
to call this API — no manual mapping needed. It uses real `fetch()` calls with a
`Bearer` token, has a public/guest read-only mode, and every management action
(hire, edit, promote, penalize, transfer, terminate, award badge, assign system
role, provision login access, leaves, resignations, circulars) calls a real endpoint
below.

**Set the API URL:** open the site, and on first load it'll ask for your backend's
base URL (e.g. `https://api.your-domain.com/api`) — it's saved in the browser so you
only enter it once per device. You can change it later from the login screen.

Full endpoint reference:

| Action                        | Endpoint                                       | Who can call it |
|-------------------------------|-------------------------------------------------|------------------|
| Public roster / units / circulars (no login) | `GET /api/public/roster`, `/api/public/units`, `/api/public/circulars` | anyone |
| Login                          | `POST /api/auth/login`                          | anyone |
| List/view personnel (full detail) | `GET /api/users`, `GET /api/users/:id`       | any logged-in user |
| Add member                     | `POST /api/users`                               | recruiter, hr, high_command |
| Edit official record (name/rank/unit/badge #) | `PATCH /api/users/:id`           | recruiter, hr, high_command, unit_commander (own unit only) |
| Edit own contact info (Discord/Steam/FiveM)   | `PATCH /api/users/:id/contact`   | the user themself, only |
| Assign system role              | `PATCH /api/users/:id/role`                    | high_command, developer |
| Provision login for a vacant slot | `POST /api/users/:id/provision-access`       | hr, high_command |
| Promote / penalty / transfer / terminate | `POST /api/users/:id/{promote,penalty,transfer,terminate}` | hr, high_command (+ unit_commander for promote/penalty) |
| Award badge                     | `POST /api/badges/:id/award`                   | badges_admin, high_command |
| Submit leave / resignation      | `POST /api/leaves`, `POST /api/resignations`   | any logged-in user |
| Approve/reject leave / resignation | `POST /api/leaves/:id/review`, `/api/resignations/:id/review` | hr, high_command (+ unit_commander scoped for leaves) |
| New circular                    | `POST /api/circulars`                          | hr, high_command, unit_commander |
| Audit logs                      | `GET /api/logs`, `GET /api/logs/export.csv`    | developer only |
| Dashboard stats                 | `GET /api/stats`                               | any logged-in user |


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
