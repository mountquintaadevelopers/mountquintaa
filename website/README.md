# Mount Quintaa — Website + Lead Admin Panel

Premium managed-farmland website (4 pages) with a secure admin panel for lead enquiries.

## Tech stack
- **Frontend:** HTML5, modern CSS (custom properties, grid), vanilla ES2022 JavaScript — no framework, loads fast
- **Backend:** Node.js 22.13+ or 24 · Express · built-in node:sqlite (file database, zero setup, no compiler needed) · JWT auth · bcrypt · helmet · rate limiting
- **Excel export:** SheetJS (real .xlsx) in the admin panel + server-side CSV endpoint

## Folder structure
```
mount-quintaa/
├── public/               ← the website (what visitors see)
│   ├── index.html        ← Home
│   ├── about.html        ← About Us
│   ├── projects.html     ← Projects (Quintaa Greens)
│   ├── contact.html      ← Contact + main enquiry form
│   ├── admin/            ← Admin panel (login + dashboard)
│   ├── css/style.css     ← Design system (colors, type, components)
│   ├── js/main.js        ← Shared behaviour + form submission
│   └── assets/           ← Logos
├── server.js             ← Backend API + static file server
├── scripts/make-password.js
├── data/                 ← leads.db is created here automatically
├── .env.example          ← copy to .env and fill in
└── package.json
```

## Run it locally (VS Code)
```bash
npm install
npm run make-password     # choose an admin password → copies hash into .env
# create .env from .env.example, paste the hash + a random JWT_SECRET
npm run dev               # http://localhost:3000  |  admin at /admin
```

## Environment variables (.env)
| Variable | What it is |
|---|---|
| `PORT` | Server port (hosting providers set this automatically) |
| `ADMIN_USER` | Admin login username |
| `ADMIN_PASSWORD_HASH` | bcrypt hash from `npm run make-password` — never the plain password |
| `JWT_SECRET` | 32+ random characters for signing login tokens |
| `ALLOWED_ORIGIN` | Your live domain(s), comma-separated, in production |

## Security built in
- No secrets in code — everything in `.env` (git-ignored)
- Admin password stored as bcrypt hash only; JWT sessions expire in 8 h
- Rate limiting: 5 form submissions/min and 5 login attempts/min per IP
- All DB access via prepared statements (no SQL injection)
- All lead data HTML-escaped in the admin table (no XSS)
- helmet security headers + CSP; CORS restricted via `ALLOWED_ORIGIN`
- No PII in server logs; leads deletable from the panel (privacy requests)
- Client errors show a reference ID only — details stay in server logs

## Deploying
The backend needs Node.js. GoDaddy **shared/website hosting cannot run Node**, so pick one:
1. **GoDaddy VPS** — run the whole folder with `npm start` behind Nginx + PM2
2. **Split (easiest):** upload `public/` to GoDaddy as the website, host `server.js` free on Render/Railway, and point `API_BASE` in `public/js/main.js` and `public/admin/admin.js` to that URL
