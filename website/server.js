/* ============================================================
   MOUNT QUINTAA — Backend API
   Node.js 22.13+ / 24 · Express 4 · built-in node:sqlite · JWT admin auth
   ------------------------------------------------------------
   Endpoints
     POST /api/leads          public   — save a form submission
     POST /api/admin/login    public   — admin login → JWT
     GET  /api/admin/leads    private  — list leads (sort/filter)
     GET  /api/admin/leads.csv private — CSV download (Excel)
     DELETE /api/admin/leads/:id private — delete a lead
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
const { DatabaseSync } = require("node:sqlite"); // built into Node — no compiler needed

/* ---------- Fail fast if critical env vars are missing ---------- */
const REQUIRED_ENV = ["JWT_SECRET", "ADMIN_USER", "ADMIN_PASSWORD_HASH"];
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

/* ---------- Database (file-based SQLite, prepared statements only) ---------- */
const fs = require("fs");
fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
const db = new DatabaseSync(path.join(__dirname, "data", "leads.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT DEFAULT '',
    phone      TEXT NOT NULL,
    message    TEXT DEFAULT '',
    source     TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
  CREATE TABLE IF NOT EXISTS blogs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    excerpt    TEXT DEFAULT '',
    content    TEXT NOT NULL,
    cover_url  TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_blogs_created ON blogs(created_at);
`);
/* Migration: add draft/published status to blogs created by older versions */
try { db.exec("ALTER TABLE blogs ADD COLUMN status TEXT NOT NULL DEFAULT 'published'"); }
catch { /* column already exists */ }

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
    methods: ["GET", "POST", "DELETE"]
  })
);
app.use(express.json({ limit: "10kb" }));

/* Rate limits: lead form 5/min per IP; login 5/min per IP */
const leadLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

/* ---------- Helpers ---------- */
const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const errorId = () => crypto.randomBytes(4).toString("hex");

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

/* ============================================================
   PUBLIC: save a lead
   ============================================================ */
app.post("/api/leads", leadLimiter, (req, res) => {
  try {
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

    db.prepare(
      "INSERT INTO leads (name, email, phone, message, source) VALUES (?, ?, ?, ?, ?)"
    ).run(name, email, phone, message, source);

    // PII is never logged — only a count.
    console.log(`[lead] new enquiry saved (total: ${db.prepare("SELECT COUNT(*) c FROM leads").get().c})`);
    res.status(201).json({ ok: true });
  } catch (err) {
    const id = errorId();
    console.error(`[${id}]`, err.message);
    res.status(500).json({ error: "Something went wrong. Please try again. (ref " + id + ")" });
  }
});

/* ============================================================
   ADMIN: login → JWT (8-hour expiry)
   ============================================================ */
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const user = clean(req.body.username, 50);
  const pass = String(req.body.password ?? "");
  const validUser = user === process.env.ADMIN_USER;
  const validPass = await bcrypt.compare(pass, process.env.ADMIN_PASSWORD_HASH);
  if (!validUser || !validPass)
    return res.status(401).json({ error: "Wrong username or password." });
  const token = jwt.sign({ role: "admin", user }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

/* ============================================================
   ADMIN: list leads  ?sort=asc|desc &from=YYYY-MM-DD &to=YYYY-MM-DD
   ============================================================ */
app.get("/api/admin/leads", requireAuth, (req, res) => {
  const sort = req.query.sort === "asc" ? "ASC" : "DESC";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || "") ? req.query.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || "") ? req.query.to : null;

  let sql = "SELECT id, name, email, phone, message, source, created_at FROM leads";
  const where = [], params = [];
  if (from) { where.push("date(created_at) >= date(?)"); params.push(from); }
  if (to)   { where.push("date(created_at) <= date(?)"); params.push(to); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += ` ORDER BY created_at ${sort}`;

  res.json({ leads: db.prepare(sql).all(...params) });
});

/* ============================================================
   ADMIN: CSV download (opens directly in Excel)
   ============================================================ */
app.get("/api/admin/leads.csv", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, name, email, phone, message, source, created_at FROM leads ORDER BY created_at DESC").all();
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "ID,Name,Email,Phone,Message,Source,Date (UTC)";
  const body = rows.map(r => [r.id, r.name, r.email, r.phone, r.message, r.source, r.created_at].map(esc).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="mount-quintaa-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("\uFEFF" + [header, ...body].join("\r\n")); // BOM so Excel reads UTF-8
});

/* ============================================================
   ADMIN: delete a lead (data-deletion path for privacy requests)
   ============================================================ */
app.delete("/api/admin/leads/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const info = db.prepare("DELETE FROM leads WHERE id = ?").run(id);
  res.json({ ok: true, deleted: info.changes });
});

/* ============================================================
   BLOGS — public read
   ============================================================ */
app.get("/api/blogs", (req, res) => {
  const rows = db.prepare(
    "SELECT id, title, slug, excerpt, cover_url, created_at FROM blogs WHERE status = 'published' ORDER BY created_at DESC"
  ).all();
  res.json({ blogs: rows });
});

app.get("/api/blogs/:slug", (req, res) => {
  const slug = clean(req.params.slug, 160);
  const post = db.prepare("SELECT * FROM blogs WHERE slug = ? AND status = 'published'").get(slug);
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json({ blog: post });
});

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

app.post("/api/admin/blogs", requireAuth, (req, res) => {
  const v = validBlog(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  let slug = slugify(v.title) || "post";
  // guarantee unique slug
  let i = 1, base = slug;
  while (db.prepare("SELECT 1 FROM blogs WHERE slug = ?").get(slug)) slug = `${base}-${++i}`;
  db.prepare(
    "INSERT INTO blogs (title, slug, excerpt, content, cover_url, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(v.title, slug, v.excerpt, v.content, v.cover_url, v.status);
  res.status(201).json({ ok: true, slug });
});

/* Admin: full list including drafts, with content stats */
app.get("/api/admin/blogs", requireAuth, (req, res) => {
  const rows = db.prepare(
    "SELECT id, title, slug, excerpt, cover_url, status, created_at, updated_at, length(content) AS content_len FROM blogs ORDER BY created_at DESC"
  ).all();
  res.json({ blogs: rows });
});

/* Admin: single post by id (works for drafts too) */
app.get("/api/admin/blogs/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const post = db.prepare("SELECT * FROM blogs WHERE id = ?").get(id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json({ blog: post });
});

app.put("/api/admin/blogs/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const v = validBlog(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  const info = db.prepare(
    "UPDATE blogs SET title=?, excerpt=?, content=?, cover_url=?, status=?, updated_at=datetime('now') WHERE id=?"
  ).run(v.title, v.excerpt, v.content, v.cover_url, v.status, id);
  if (!info.changes) return res.status(404).json({ error: "Post not found" });
  res.json({ ok: true });
});

app.delete("/api/admin/blogs/:id", requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
  const info = db.prepare("DELETE FROM blogs WHERE id = ?").run(id);
  res.json({ ok: true, deleted: info.changes });
});

/* ============================================================
   BLOGS — cover image upload (admin)
   Raw binary body; magic-byte verified; saved to public/uploads
   ============================================================ */
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.post(
  "/api/admin/upload",
  requireAuth,
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "6mb" }),
  (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 100)
      return res.status(400).json({ error: "No image received. Choose a PNG, JPG or WebP file." });
    // Verify real file type by magic bytes — never trust the header alone
    let ext = null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ext = "png";
    else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = "jpg";
    else if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") ext = "webp";
    if (!ext) return res.status(400).json({ error: "Only PNG, JPG or WebP images are allowed." });
    const name = Date.now().toString(36) + "-" + crypto.randomBytes(6).toString("hex") + "." + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    res.status(201).json({ url: "/uploads/" + name });
  }
);

/* ---------- Static site ---------- */
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

/* ---------- Generic error handler (no stack traces to client) ---------- */
app.use((err, req, res, _next) => {
  const id = errorId();
  console.error(`[${id}]`, err);
  res.status(500).json({ error: "Unexpected error (ref " + id + ")" });
});

app.listen(PORT, () => {
  console.log(`Mount Quintaa running → http://localhost:${PORT}`);
  console.log(`Admin panel          → http://localhost:${PORT}/admin`);
  if (!isProd) console.log("(development mode)");
});
