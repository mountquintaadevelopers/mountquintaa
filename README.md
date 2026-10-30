# Mount Quintaa

```
api.mountquintaa.com/
├── package.json   ← "npm run dev" starts everything
├── start.js       ← the runner behind that command
├── api/           ← bookings API (Express + Prisma + MariaDB)  → http://localhost:4231/v1
├── website/       ← website + admin panel (Express + SQLite)   → http://localhost:3000
└── backups/       ← old SQL dumps and duplicate files, not used by the app
```

## Run it

```bash
npm run dev
```

This starts MariaDB (if it isn't already running), the bookings API and the website.
Press **Ctrl+C** to stop all of them.

- Website: http://localhost:3000
- Admin panel: click **Admin Login** at the top of the home page, or go to http://localhost:3000/admin

## First-time setup on a new computer

1. Install Node.js 22.13+ and MariaDB.
2. `npm run setup` installs packages in both folders.
3. Create `api/.env` and `website/.env` (see each folder's README and `.env.example`).
4. `npm run dev`

If MariaDB is installed somewhere other than `C:\Program Files\MariaDB 13.0\bin`,
set the `MARIADB_BIN` environment variable to its `bin` folder.

## Admin logins

| Where | Login |
|---|---|
| Website admin panel (`/admin`) | `ADMIN_USER` and the password whose hash is in `website/.env` |
| Bookings API (`POST /v1/admin/auth/login`) | Admin accounts in the MariaDB `AdminUser` table |

Change the website admin password with `npm run make-password` inside `website/`.
