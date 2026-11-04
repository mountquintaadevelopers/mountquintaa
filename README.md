# Mount Quintaa

```
api.mountquintaa.com/
├── package.json        ← "npm run dev" runs the website locally
└── website/            ← website, enquiry form and admin panel
    ├── public/         ← the pages visitors see (admin panel in public/admin/)
    ├── server.js       ← API: enquiry form, admin login, leads, blogs
    ├── api/index.js    ← Vercel entry point (loads server.js)
    ├── vercel.json     ← Vercel routing
    └── supabase/schema.sql ← tables + image bucket to create in Supabase
```

Enquiries, blog posts and blog images are stored in **Supabase**. There is no local database.

## Run it locally

```bash
npm run setup     # first time only
npm run dev       # http://localhost:3000   admin: "Admin Login" on the home page
```

`website/.env` needs the values listed in `website/.env.example`.

## Supabase setup (once)

Supabase dashboard → **SQL Editor** → paste `website/supabase/schema.sql` → **Run**.
It creates the `leads` and `blogs` tables (locked with row-level security) and a public
`blog-images` storage bucket.

## Deploy on Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `website`.
2. Framework preset: **Other**. Leave the build command empty.
3. Add these **Environment Variables**:

| Name | Value |
|---|---|
| `ADMIN_USER` | admin username |
| `ADMIN_PASSWORD_HASH` | output of `npm run make-password` (inside `website/`) |
| `BLOG_USER` | blog writer username (optional) |
| `BLOG_PASSWORD_HASH` | output of `npm run make-password` for the blog writer (optional) |
| `JWT_SECRET` | 32+ random characters |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key |
| `ALLOWED_ORIGIN` | `https://mountquintaa.com,https://www.mountquintaa.com` |
| `NODE_ENV` | `production` |
