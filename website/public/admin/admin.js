/* ============================================================
   MOUNT QUINTAA — Admin panel logic
   ============================================================ */
"use strict";

/* Same origin when served by Node. If backend is hosted elsewhere
   (e.g. Render) while this page sits on GoDaddy, put that URL here:
   const API_BASE = "https://mount-quintaa-api.onrender.com"; */
const API_BASE = "";

const $ = id => document.getElementById(id);
let TOKEN = sessionStorage.getItem("mq_admin_token") || null;
let ROLE = sessionStorage.getItem("mq_admin_role") || "admin";
let USERNAME = sessionStorage.getItem("mq_admin_user") || "";
let LEADS = [];

/* ---------- View switching ---------- */
function showDashboard() {
  $("loginScreen").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  // The blog writer only gets the Blogs tab (the server blocks leads too)
  const isWriter = ROLE === "blogger";
  $("dashTitle").textContent = isWriter ? "Blog Writer" : "Lead Enquiries";
  $("whoAmI").textContent = USERNAME;
  $("tabBar").classList.toggle("hidden", isWriter);
  openTab(isWriter ? "blogs" : "leads");
  if (!isWriter) loadLeads();
}
function showLogin() {
  sessionStorage.removeItem("mq_admin_token");
  sessionStorage.removeItem("mq_admin_role");
  sessionStorage.removeItem("mq_admin_user");
  TOKEN = null;
  closeEditor();
  $("dashboard").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
}

/* ---------- Login ---------- */
const pickedRole = () => document.querySelector("input[name=role]:checked").value;
function showPickedRole() {
  $("loginTitle").textContent = pickedRole() === "blogger" ? "Blog Writer Login" : "Admin Login";
  $("loginErr").textContent = "";
}
document.querySelectorAll("input[name=role]").forEach(r => r.addEventListener("change", showPickedRole));
showPickedRole();

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("loginErr");
  err.textContent = "";
  try {
    const res = await fetch(API_BASE + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: $("lg-user").value.trim(),
        password: $("lg-pass").value,
        role: pickedRole()
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    TOKEN = data.token;
    ROLE = data.role;
    USERNAME = $("lg-user").value.trim();
    sessionStorage.setItem("mq_admin_token", TOKEN);
    sessionStorage.setItem("mq_admin_role", ROLE);
    sessionStorage.setItem("mq_admin_user", USERNAME);
    e.target.reset();
    showPickedRole();
    showDashboard();
  } catch (ex) {
    err.textContent = ex.message === "Failed to fetch"
      ? "Cannot reach the server. Is it running?"
      : ex.message;
  }
});

$("logoutBtn").addEventListener("click", showLogin);

/* ---------- Fetch leads ---------- */
async function loadLeads() {
  const params = new URLSearchParams();
  params.set("sort", $("sortSel").value);
  if ($("fromDate").value) params.set("from", $("fromDate").value);
  if ($("toDate").value) params.set("to", $("toDate").value);

  try {
    const res = await fetch(API_BASE + "/api/admin/leads?" + params, {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    if (res.status === 401) return showLogin();
    const data = await res.json();
    LEADS = data.leads || [];
    renderTable();
    renderStats();
  } catch {
    alert("Could not load leads — check that the server is running.");
  }
}

/* ---------- Render table ---------- */
const escHTML = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtDate(utc) {
  // Supabase returns ISO timestamps with a time zone ("2026-10-31T10:00:00+00:00") → show in local time (IST)
  const d = new Date(utc);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function renderTable() {
  const tbody = $("leadRows");
  $("emptyState").classList.toggle("hidden", LEADS.length > 0);
  tbody.innerHTML = LEADS.map(l => `
    <tr>
      <td>${l.id}</td>
      <td><strong>${escHTML(l.name)}</strong></td>
      <td><a href="tel:${escHTML(l.phone)}">${escHTML(l.phone)}</a></td>
      <td>${l.email ? `<a href="mailto:${escHTML(l.email)}">${escHTML(l.email)}</a>` : "—"}</td>
      <td class="msg-cell">${escHTML(l.message) || "—"}</td>
      <td><span class="src-tag">${escHTML(l.source) || "Website"}</span></td>
      <td style="white-space:nowrap">${fmtDate(l.created_at)}</td>
      <td><button class="del-btn" data-id="${l.id}">Delete</button></td>
    </tr>`).join("");

  tbody.querySelectorAll(".del-btn").forEach(btn =>
    btn.addEventListener("click", () => deleteLead(btn.dataset.id))
  );
}

/* ---------- Stats ---------- */
function renderStats() {
  const now = Date.now();
  const day = 86_400_000;
  const ts = l => new Date(l.created_at).getTime();
  const todayStr = new Date().toDateString();
  $("statTotal").textContent = LEADS.length;
  $("statToday").textContent = LEADS.filter(l => new Date(ts(l)).toDateString() === todayStr).length;
  $("statWeek").textContent = LEADS.filter(l => now - ts(l) <= 7 * day).length;
  $("statMonth").textContent = LEADS.filter(l => now - ts(l) <= 30 * day).length;
}

/* ---------- Delete ---------- */
async function deleteLead(id) {
  if (!confirm("Delete this lead permanently?")) return;
  const res = await fetch(API_BASE + "/api/admin/leads/" + id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + TOKEN }
  });
  if (res.status === 401) return showLogin();
  loadLeads();
}

/* ---------- Excel export (.xlsx via SheetJS) ---------- */
$("excelBtn").addEventListener("click", () => {
  if (!LEADS.length) return alert("No leads to export for the current filters.");
  const rows = LEADS.map(l => ({
    ID: l.id,
    Name: l.name,
    Phone: l.phone,
    Email: l.email,
    Message: l.message,
    Source: l.source,
    "Date (local)": fmtDate(l.created_at)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 5 }, { wch: 22 }, { wch: 16 }, { wch: 28 }, { wch: 40 }, { wch: 18 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, `mount-quintaa-leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

/* ---------- Controls ---------- */
$("sortSel").addEventListener("change", loadLeads);
$("fromDate").addEventListener("change", loadLeads);
$("toDate").addEventListener("change", loadLeads);
$("refreshBtn").addEventListener("click", loadLeads);
$("clearBtn").addEventListener("click", () => {
  $("fromDate").value = "";
  $("toDate").value = "";
  $("sortSel").value = "desc";
  loadLeads();
});
$("dateHeader").addEventListener("click", () => {
  $("sortSel").value = $("sortSel").value === "desc" ? "asc" : "desc";
  loadLeads();
});

/* ---------- Tabs ---------- */
function openTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $("tab-leads").classList.toggle("hidden", name !== "leads");
  $("tab-blogs").classList.toggle("hidden", name !== "blogs");
  if (name === "blogs") loadBlogs();
}
document.querySelectorAll(".tab").forEach(tab =>
  tab.addEventListener("click", () => openTab(tab.dataset.tab))
);

/* ============================================================
   BLOGS — post list: stats, search, filters, duplicate.
   The writing screen itself is in editor.js
   ============================================================ */
let BLOGS = [];
let BLOG_FILTER = "all";

async function loadBlogs() {
  try {
    const res = await fetch(API_BASE + "/api/admin/blogs", {
      headers: { Authorization: "Bearer " + TOKEN }
    });
    if (res.status === 401) return showLogin();
    BLOGS = (await res.json()).blogs || [];
    renderBlogStats();
    renderBlogList();
  } catch { /* server down — keep current view */ }
}

function renderBlogStats() {
  const pub = BLOGS.filter(b => b.status === "published");
  $("bStatTotal").textContent = BLOGS.length;
  $("bStatPub").textContent = pub.length;
  $("bStatDraft").textContent = BLOGS.length - pub.length;
  $("bStatLast").textContent = pub.length
    ? new Date(pub[0].published_at || pub[0].created_at)
        .toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    : "—";
}

function visibleBlogs() {
  const q = ($("blogSearch").value || "").toLowerCase().trim();
  return BLOGS.filter(b =>
    (BLOG_FILTER === "all" || b.status === BLOG_FILTER) &&
    (!q || b.title.toLowerCase().includes(q) || (b.excerpt || "").toLowerCase().includes(q))
  );
}

function renderBlogList() {
  const rows = visibleBlogs();
  const list = $("blogList");
  $("blogEmpty").classList.toggle("hidden", rows.length > 0);
  list.innerHTML = rows.map(b => `
    <div class="post-row">
      <div>
        <div class="p-title">${escHTML(b.title)}
          <span class="status-badge ${b.status}">${b.status}</span>
        </div>
        <div class="p-date">
          ${fmtDate(b.published_at || b.created_at)} · ~${Math.max(1, Math.round((b.content_len || 0) / 5 / 200))} min read
          ${b.status === "published"
            ? ` · <a class="view" href="../blog.html?slug=${encodeURIComponent(b.slug)}" target="_blank" rel="noopener">View on site ↗</a>`
            : ""}
        </div>
      </div>
      <div class="p-actions">
        <button class="edit" data-id="${b.id}">Edit</button>
        <button class="dup" data-id="${b.id}">Duplicate</button>
        <button class="del" data-id="${b.id}">Delete</button>
      </div>
    </div>`).join("");
  list.querySelectorAll(".edit").forEach(btn => btn.addEventListener("click", () => editPost(btn.dataset.id)));
  list.querySelectorAll(".dup").forEach(btn => btn.addEventListener("click", () => duplicatePost(btn.dataset.id)));
  list.querySelectorAll(".del").forEach(btn => btn.addEventListener("click", () => deleteBlog(btn.dataset.id)));
}

$("blogSearch").addEventListener("input", renderBlogList);
document.querySelectorAll(".chip").forEach(chip =>
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === chip));
    BLOG_FILTER = chip.dataset.filter;
    renderBlogList();
  })
);

async function fetchFullPost(id) {
  const res = await fetch(API_BASE + "/api/admin/blogs/" + id, {
    headers: { Authorization: "Bearer " + TOKEN }
  });
  if (res.status === 401) { showLogin(); return null; }
  return (await res.json()).blog || null;
}

async function deleteBlog(id) {
  if (!confirm("Delete this post permanently?")) return;
  const res = await fetch(API_BASE + "/api/admin/blogs/" + id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + TOKEN }
  });
  if (res.status === 401) return showLogin();
  loadBlogs();
}

/* ---------- Boot ---------- */
if (TOKEN) showDashboard();
