/* ============================================================
   MOUNT QUINTAA — public blog rendering (external file so the
   site's Content-Security-Policy allows it to run)
   Handles three pages automatically:
     index.html  → latest 3 posts into [data-journal]
     blogs.html  → all posts into #blogGrid
     blog.html   → single post into #post (?slug=…)
   ============================================================ */
"use strict";
(async () => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = utc => new Date(utc)
    .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const FALLBACK = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80";

  const card = b => `
    <article class="j-card">
      <a href="blog.html?slug=${encodeURIComponent(b.slug)}" aria-label="${esc(b.title)}">
        <div class="img"><img src="${esc(b.cover_url) || FALLBACK}" alt="${esc(b.title)}"
             loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'" /></div>
      </a>
      <div class="body">
        <div class="caption">${fmtDate(b.created_at)}</div>
        <h3><a href="blog.html?slug=${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h3>
        ${b.excerpt ? `<p class="caption excerpt">${esc(b.excerpt)}</p>` : ""}
        <a class="read-more" href="blog.html?slug=${encodeURIComponent(b.slug)}">Read More →</a>
      </div>
    </article>`;

  /* ---------- Single post page ---------- */
  const postEl = document.getElementById("post");
  if (postEl) {
    const slug = new URLSearchParams(location.search).get("slug");
    if (!slug) { location.replace("blogs.html"); return; }
    try {
      const res = await fetch("/api/blogs/" + encodeURIComponent(slug));
      if (!res.ok) throw 0;
      const { blog } = await res.json();
      document.title = blog.title + " | Mount Quintaa Journal";
      const paras = esc(blog.content).split(/\n{2,}/)
        .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
      postEl.innerHTML = `
        <h1 class="post-title">${esc(blog.title)}</h1>
        <div class="post-meta">Published ${fmtDate(blog.created_at)}</div>
        ${blog.cover_url ? `<div class="post-cover"><img src="${esc(blog.cover_url)}" alt="${esc(blog.title)}"
            onerror="this.closest('.post-cover').remove()" /></div>` : ""}
        <div class="post-body">${paras}</div>`;
    } catch {
      postEl.innerHTML = `<h2 style="margin-top:24px">Story not found</h2>
        <p class="lead" style="margin-top:12px">It may have been unpublished.
        <a href="blogs.html" style="color:var(--color-terracotta);font-weight:600">Browse all stories</a>.</p>`;
    }
    return;
  }

  /* ---------- Listing pages ---------- */
  const fullGrid = document.getElementById("blogGrid");     // blogs.html
  const homeGrid = document.querySelector("[data-journal]"); // index.html
  const target = fullGrid || homeGrid;
  if (!target) return;

  try {
    const res = await fetch("/api/blogs");
    const { blogs } = await res.json();
    if (fullGrid) {
      const empty = document.getElementById("blogEmpty");
      if (!blogs || !blogs.length) { if (empty) empty.style.display = "block"; return; }
      fullGrid.innerHTML = blogs.map(card).join("");
    } else if (blogs && blogs.length) {
      homeGrid.innerHTML = blogs.slice(0, 3).map(card).join("");
    }
    // keep placeholders on home page when no posts exist
  } catch {
    const empty = document.getElementById("blogEmpty");
    if (empty) empty.style.display = "block";
  }
})();
