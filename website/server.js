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
  const account = ACCOUNTS.find(a => a.user === user);
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
app.get("/api/blogs", safe(async (req, res) => {
  const { data } = check(
    await supabase.from(BLOGS)
      .select("id, title, slug, excerpt, cover_url, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
  );
  res.json({ blogs: data });
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

function validBlog(body) {
  const title = clean(body.title, 160);
  const excerpt = clean(body.excerpt, 300);
  const content = String(body.content ?? "").trim().slice(0, 50_000);
  const cover_url = clean(body.cover_url, 500);
  if (title.length < 3) return { error: "Title must be at least 3 characters." };
  if (content.length < 20) return { error: "Content is too short." };
  if (cover_url && !/^(https:\/\/|\/uploads\/)/.test(cover_url))
    return { error: "Cover image must be an https:// URL or an uploaded image." };
  const status = body.status === "draft" ? "draft" : "published";
  return { title, excerpt, content, cover_url, status };
}

app.post("/api/admin/blogs", requireAuth, safe(async (req, res) => {
  const v = validBlog(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let slug = slugify(v.title) || "post";
  // guarantee unique slug
  let i = 1, base = slug;
  for (;;) {
    const { data } = check(await supabase.from(BLOGS).select("id").eq("slug", slug).maybeSingle());
    if (!data) break;
    slug = `${base}-${++i}`;
  }
  check(await supabase.from(BLOGS).insert({ ...v, slug }));
  res.status(201).json({ ok: true, slug });
}));

/* Admin: full list including drafts, with content stats */
app.get("/api/admin/blogs", requireAuth, safe(async (req, res) => {
  const { data } = check(
    await supabase.from(BLOGS)
      .select("id, title, slug, excerpt, cover_url, status, created_at, updated_at, content")
      .order("created_at", { ascending: false })
  );
  const blogs = data.map(({ content, ...b }) => ({ ...b, content_len: (content || "").length }));
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
  const { count } = check(
    await supabase.from(BLOGS)
      .update({ ...v, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id)
  );
  if (!count) return res.status(404).json({ error: "Post not found" });
  res.json({ ok: true });
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
