# Mount Quintaa — Website + Lead Admin Panel

Premium managed-farmland website (4 pages) with a secure admin panel for lead enquiries.

## Tech stack
- **Frontend:** HTML5, modern CSS (custom properties, grid), vanilla ES2022 JavaScript — no framework, loads fast
- **Backend:** Node.js 22+ · Express · Supabase (Postgres for enquiries and blogs, Storage for blog images) · JWT auth · bcrypt · helmet · rate limiting
- **Hosting:** Vercel (`public/` served as static files, `api/index.js` runs `server.js`)
- **Excel export:** SheetJS (real .xlsx) in the admin panel + server-side CSV endpoint

## Folder structure
```
website/
├── public/               ← the website (what visitors see)
│   ├── index.html        ← Home
│   ├── about.html        ← About Us
│   ├── projects.html     ← Projects (Quintaa Greens)
│   ├── contact.html      ← Contact + main enquiry form
│   ├── admin/            ← Admin panel (login, dashboard, blog writing screen)
│   ├── css/style.css     ← Design system (colors, type, components)
│   ├── js/main.js        ← Shared behaviour + form submission
│   ├── js/blog-render.js ← Turns a post's blocks into the article (site + admin)
│   └── assets/           ← Logos
├── server.js             ← Backend API + static file server (local)
├── api/index.js          ← Vercel entry point, loads server.js
├── vercel.json           ← Vercel routing (/api/* → api/index.js, clean URLs)
├── supabase/schema.sql   ← run once in Supabase SQL Editor
├── scripts/make-password.js
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
| `PORT` | Local server port (Vercel ignores it) |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key — server only, never in `public/` |
| `ADMIN_USER` | Admin login username |
| `ADMIN_PASSWORD_HASH` | bcrypt hash from `npm run make-password` — never the plain password |
| `BLOG_USER` | Optional: blog writer login username (Blogs section only, no access to leads) |
| `BLOG_PASSWORD_HASH` | Optional: bcrypt hash from `npm run make-password` for the blog writer |
| `JWT_SECRET` | 32+ random characters for signing login tokens |
| `ALLOWED_ORIGIN` | Your live domain(s), comma-separated, in production |

## Security built in
- No secrets in code — everything in `.env` (git-ignored)
- Admin and blog writer passwords stored as bcrypt hashes only; JWT sessions expire in 8 h
- Rate limiting: 5 form submissions/min and 5 login attempts/min per IP
- All DB access via the Supabase client's parameterised queries (no SQL injection)
- Supabase tables use row-level security with no public policies — only the server can read enquiries
- All lead data HTML-escaped in the admin table (no XSS)
- helmet security headers + CSP; CORS restricted via `ALLOWED_ORIGIN`
- No PII in server logs; leads deletable from the panel (privacy requests)
- Client errors show a reference ID only — details stay in server logs

## Deploying
Deployed on **Vercel**: import the GitHub repo, set **Root Directory** to `website`, framework preset
**Other**, no build command, and add the environment variables above (plus `NODE_ENV=production`)
in Project Settings → Environment Variables. See the root README for the full list.
