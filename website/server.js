/* ============================================================
   MOUNT QUINTAA — Backend API
   Node.js 22+ · Express 4 · Supabase (Postgres + Storage) · JWT admin auth
   ------------------------------------------------------------
   Endpoints
     POST /api/leads          public   — save a form submission
     POST /api/admin/login    public   — admin or blog writer login → JWT
     GET  /api/admin/leads    admin    — list leads (sort/filter)
     GET  /api/admin/leads.csv admin   — CSV download (Excel)
     DELETE /api/admin/leads/:id admin — delete a lead
     /api/admin/blogs, /api/admin/upload  admin or blog writer
     GET  /api/blogs, /api/blogs/:slug    public — published posts
   Runs locally with `npm run dev`, and on Vercel through api/index.js.
   ============================================================ */
"use strict";

require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

/* ---------- Fail fast if critical env vars are missing ---------- */
const REQUIRED_ENV = ["JWT_SECRET", "ADMIN_USER", "ADMIN_PASSWORD_HASH", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error("FATAL: missing environment variables: " + missing.join(", "));
  console.error("Copy .env.example to .env and fill it in. See README.md.");
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET must be at least 32 characters.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

/* ---------- Database (Supabase) ----------
   The service-role key is used only here on the server; it never reaches the browser.
   Tables: leads, blogs (see supabase/schema.sql). Images: public Storage bucket. */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const LEADS = process.env.SUPABASE_LEADS_TABLE || "leads";
const BLOGS = process.env.SUPABASE_BLOGS_TABLE || "blogs";
const BUCKET = process.env.SUPABASE_BUCKET || "blog-images";

/* Who can sign in. The blog writer is optional: without BLOG_USER and
   BLOG_PASSWORD_HASH only the admin account exists. */
const ACCOUNTS = [
  { role: "admin", user: process.env.ADMIN_USER, hash: process.env.ADMIN_PASSWORD_HASH },
  { role: "blogger", user: process.env.BLOG_USER, hash: process.env.BLOG_PASSWORD_HASH }
].filter(a => a.user && a.hash);

/* Throw on a Supabase error so every route reports it the same way */
function check({ data, error, count }) {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return { data, count };
}

/* ---------- Security middleware ---------- */
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.sheetjs.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://api.fontshare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.fontshare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        frameSrc: ["https://www.google.com"],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(",") : true,
    methods: ["GET", "POST", "PUT", "DELETE"]
  })
);
// Blog posts are stored as blocks, so a long article needs more room than a form
app.use("/api/admin/blogs", express.json({ limit: "512kb" }));
app.use(express.json({ limit: "64kb" }));

/* Rate limits: lead form 5/min per IP; login 5/min per IP */
const leadLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

/* ---------- Helpers ---------- */
const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const errorId = () => crypto.randomBytes(4).toString("hex");

/* Wrap async routes so errors reach the error handler with a reference ID */
const safe = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired — please sign in again" });
  }
}

/* Enquiries are admin-only: use after requireAuth */
function requireAdmin(req, res, next) {
  if (req.admin.role !== "admin") return res.status(403).json({ error: "Admin access only" });
  next();
}

/* ============================================================
   PUBLIC: save a lead
   ============================================================ */
app.post("/api/leads", leadLimiter, safe(async (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 150);
  const phone = clean(req.body.phone, 20);
  const message = clean(req.body.message, 1000);
  const source = clean(req.body.source, 100);

  if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
  if (!/^[+\d][\d\s\-()]{6,19}$/.test(phone))
    return res.status(400).json({ error: "Please enter a valid phone number." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Please enter a valid email address." });

  check(await supabase.from(LEADS).insert({ name, email, phone, message, source }));

  // PII is never logged.
  console.log("[lead] new enquiry saved");
  res.status(201).json({ ok: true });
}));

/* ============================================================
   ADMIN / BLOG WRITER: login → JWT (8-hour expiry)
   ============================================================ */
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const user = clean(req.body.username, 50);
  const pass = String(req.body.password ?? "");
  // The login page sends which account was picked (Admin or Blog Writer)
  const role = req.body.role;
  const account = ACCOUNTS.find(a => a.user === user && (!role || a.role === role));
  // Compare even for an unknown username, so both failures take the same time
  const validPass = await bcrypt.compare(pass, (account || ACCOUNTS[0]).hash);
  if (!account || !validPass)
    return res.status(401).json({ error: "Wrong username or password." });
  const token = jwt.sign({ role: account.role, user }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, role: account.role });
});

/* ============================================================
   ADMIN: list leads  ?sort=asc|desc &from=YYYY-MM-DD &to=YYYY-MM-DD
   ============================================================ */
const LEAD_COLUMNS = "id, name, email, phone, message, source, created_at";

app.get("/api/admin/leads", requireAuth, requireAdmin, safe(async (req, res) => {
  const ascending = req.query.sort === "asc";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "") ? req.query.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || "") ? req.query.to : null;

  let query = supabase.from(LEADS).select(LEAD_COLUMNS);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  const { data } = check(await query.order("created_at", { ascending }));

  res.json({ leads: data });
}));

/* ============================================================
   ADMIN: CSV download (opens directly in Excel)
   ============================================================ */
app.get("/api/admin/leads.csv", requireAuth, requireAdmin, safe(async (req, res) => {
  const { data: rows } = check(
    await supabase.from(LEADS).select(LEAD_COLUMNS).order("created_at", { ascending: false })
  );
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "ID,Name,Email,Phone,Message,Source,Date (UTC)";
  const body = rows.map(r => [r.id, r.name, r.email, r.phone, r.message, r.source, r.created_at].map(esc).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="mount-quintaa-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + [header, ...body].join("\r\n")); // BOM so Excel reads UTF-8
}));

/* ============================================================
   ADMIN: delete a lead (data-deletion path for privacy requests)
   ============================================================ */
app.delete("/api/admin/leads/:id", requireAuth, requireAdmin, safe(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const { count } = check(await supabase.from(LEADS).delete({ count: "exact" }).eq("id", id));
  res.json({ ok: true, deleted: count });
}));

/* ============================================================
   BLOGS — public read
   ============================================================ */
/* Posts count from the day they went live, not the day the draft was started */
const postDate = b => new Date(b.published_at || b.created_at).getTime();

app.get("/api/blogs", safe(async (req, res) => {
  const { data } = check(
    await supabase.from(BLOGS)
      .select("id, title, slug, excerpt, cover_url, created_at, published_at, category, tags, author, featured, content")
      .eq("status", "published")
  );
  const blogs = data
    .map(({ content, ...b }) => ({ ...b, content_len: (content || "").length }))
    .sort((a, b) => postDate(b) - postDate(a));
  res.json({ blogs });
}));

app.get("/api/blogs/:slug", safe(async (req, res) => {
  const slug = clean(req.params.slug, 160);
  const { data: post } = check(
    await supabase.from(BLOGS).select("*").eq("slug", slug).eq("status", "published").maybeSingle()
  );
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json({ blog: post });
}));

/* ============================================================
   BLOGS — admin write
   ============================================================ */
const slugify = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

/* Keeps new lines, unlike clean() */
const text = (v, max) => String(v ?? "").slice(0, max);
const validImage = url => /^(https:\/\/|\/uploads\/)/.test(url);

/* Keep only the fields each block type uses */
function cleanBlock(b) {
  const type = b?.type;
  switch (type) {
    case "intro": case "paragraph": case "tip": case "warning": case "quote":
      return { type, text: text(b.text, 20_000) };
    case "h2": case "h3":
      return { type, text: clean(b.text, 200) };
    case "list":
      return { type, text: text(b.text, 20_000), numbered: !!b.numbered };
    case "table": {
      const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 60)
        .map(r => (Array.isArray(r) ? r : []).slice(0, 10).map(c => text(c, 1000)));
      return { type, rows };
    }
    case "image": {
      const url = clean(b.url, 500);
      return { type, url: validImage(url) ? url : "", alt: clean(b.alt, 300), caption: clean(b.caption, 300), credit: clean(b.credit, 200) };
    }
    case "services": {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12)
        .map(i => ({ page: clean(i?.page, 40), why: clean(i?.why, 300) }));
      return { type, items };
    }
    case "cta":
      return { type, text: text(b.text, 1000), label: clean(b.label, 80), link: clean(b.link, 500) };
    default:
      return null;
  }
}

function validBlog(body) {
  const status = body.status === "draft" ? "draft" : "published";
  const title = clean(body.title, 160) || "Untitled post";
  const excerpt = clean(body.excerpt, 300);
  const content = String(body.content ?? "").trim().slice(0, 200_000);
  const cover_url = clean(body.cover_url, 500);
  // Drafts can be half-written; only a published post has to be complete
  if (status === "published") {
    if (title.length < 3 || title === "Untitled post") return { error: "Give the post a title before publishing." };
    if (content.length < 20) return { error: "Content is too short." };
  }
  if (cover_url && !validImage(cover_url))
    return { error: "Cover image must be an https:// URL or an uploaded image." };
  return {
    title, excerpt, content, cover_url, status,
    blocks: (Array.isArray(body.blocks) ? body.blocks : []).slice(0, 400).map(cleanBlock).filter(Boolean),
    faqs: (Array.isArray(body.faqs) ? body.faqs : []).slice(0, 30)
      .map(f => ({ q: clean(f?.q, 300), a: text(f?.a, 3000) })),
    meta_title: clean(body.meta_title, 200),
    meta_description: clean(body.meta_description, 400),
    keyword: clean(body.keyword, 120),
    tags: (Array.isArray(body.tags) ? body.tags : []).slice(0, 15).map(t => clean(t, 50)).filter(Boolean),
    category: clean(body.category, 80),
    featured: !!body.featured,
    author: clean(body.author, 100) || "Mount Quintaa Team"
  };
}

/* Make a slug unique, ignoring the post being edited */
async function uniqueSlug(wanted, ownId) {
  let slug = wanted, i = 1;
  for (;;) {
    const { data } = check(await supabase.from(BLOGS).select("id").eq("slug", slug).maybeSingle());
    if (!data || data.id === ownId) return slug;
    slug = `${wanted}-${++i}`;
  }
}

app.post("/api/admin/blogs", requireAuth, safe(async (req, res) => {
  const v = validBlog(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const named = v.title !== "Untitled post";
  const wanted = slugify(clean(req.body.slug, 160)) || (named && slugify(v.title)) || "draft-" + crypto.randomBytes(4).toString("hex");
  const slug = await uniqueSlug(wanted);
  const published_at = v.status === "published" ? new Date().toISOString() : null;
  const { data } = check(await supabase.from(BLOGS).insert({ ...v, slug, published_at }).select("id, slug").single());
  res.status(201).json({ ok: true, id: data.id, slug: data.slug });
}));

/* Admin: full list including drafts, with content stats */
app.get("/api/admin/blogs", requireAuth, safe(async (req, res) => {
  const { data } = check(
    await supabase.from(BLOGS)
      .select("id, title, slug, excerpt, cover_url, status, created_at, updated_at, published_at, category, featured, content")
  );
  const blogs = data
    .map(({ content, ...b }) => ({ ...b, content_len: (content || "").length }))
    .sort((a, b) => postDate(b) - postDate(a));
  res.json({ blogs });
}));

/* Admin: single post by id (works for drafts too) */
app.get("/api/admin/blogs/:id", requireAuth, safe(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const { data: post } = check(await supabase.from(BLOGS).select("*").eq("id", id).maybeSingle());
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json({ blog: post });
}));

app.put("/api/admin/blogs/:id", requireAuth, safe(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const v = validBlog(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const { data: current } = check(
    await supabase.from(BLOGS).select("id, slug, status, created_at, published_at").eq("id", id).maybeSingle()
  );
  if (!current) return res.status(404).json({ error: "Post not found" });
  const wanted = slugify(clean(req.body.slug, 160));
  const slug = wanted && wanted !== current.slug ? await uniqueSlug(wanted, id) : current.slug;
  const now = new Date().toISOString();
  // Older posts have no published_at, so they keep the date they went live
  const live = current.published_at || (current.status === "published" ? current.created_at : null);
  const published_at = v.status === "published" ? live || now : live;
  check(await supabase.from(BLOGS).update({ ...v, slug, published_at, updated_at: now }).eq("id", id));
  res.json({ ok: true, id, slug });
}));

app.delete("/api/admin/blogs/:id", requireAuth, safe(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const { count } = check(await supabase.from(BLOGS).delete({ count: "exact" }).eq("id", id));
  res.json({ ok: true, deleted: count });
}));

/* ============================================================
   BLOGS — cover image upload (admin)
   Raw binary body; magic-byte verified; saved to Supabase Storage
   ============================================================ */
app.post(
  "/api/admin/upload",
  requireAuth,
  // Vercel rejects request bodies over 4.5 MB
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "4mb" }),
  safe(async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 100)
      return res.status(400).json({ error: "No image received. Choose a PNG, JPG or WebP file (max 4 MB)." });
    // Verify real file type by magic bytes — never trust the header alone
    let ext = null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ext = "png";
    else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = "jpg";
    else if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") ext = "webp";
    if (!ext) return res.status(400).json({ error: "Only PNG, JPG or WebP images are allowed." });
    const name = Date.now().toString(36) + "-" + crypto.randomBytes(6).toString("hex") + "." + ext;
    const contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    check(await supabase.storage.from(BUCKET).upload(name, buf, { contentType }));
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(name);
    res.status(201).json({ url: data.publicUrl });
  })
);

/* ---------- Static site (local only; on Vercel public/ is served directly) ---------- */
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

/* ---------- Generic error handler (no stack traces to client) ---------- */
app.use((err, req, res, _next) => {
  const id = errorId();
  console.error(`[${id}]`, err.message || err);
  res.status(500).json({ error: "Something went wrong. Please try again. (ref " + id + ")" });
});

module.exports = app;

// Start a server only when run directly (`npm run dev`); Vercel imports the app instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mount Quintaa running → http://localhost:${PORT}`);
    console.log(`Admin panel          → http://localhost:${PORT}/admin`);
    if (!isProd) console.log("(development mode)");
  });
}
