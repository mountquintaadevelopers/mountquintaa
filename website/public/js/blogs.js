/* ============================================================
   MOUNT QUINTAA — public blog rendering (external file so the
   site's Content-Security-Policy allows it to run)
   Handles three pages automatically:
     index.html  → latest 3 posts into [data-journal]
     blogs.html  → all posts into #blogGrid
     blog.html   → single post into #post (?slug=…), built from
                   the post's blocks by blog-render.js
   ============================================================ */
"use strict";
(async () => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = utc => new Date(utc)
    .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const FALLBACK = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80";

  const postDate = b => b.published_at || b.created_at;
  const minutes = b => Math.max(1, Math.round((b.content_len || 0) / 5 / 200));

  const card = (b, extra = "") => `
    <article class="j-card ${extra}">
      <a href="blog.html?slug=${encodeURIComponent(b.slug)}" aria-label="${esc(b.title)}">
        <div class="img"><img src="${esc(b.cover_url) || FALLBACK}" alt="${esc(b.title)}"
             loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'" /></div>
      </a>
      <div class="body">
        <div class="caption">${b.category ? esc(b.category) + " · " : ""}${fmtDate(postDate(b))} · ${minutes(b)} min read</div>
        <h3><a href="blog.html?slug=${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h3>
        ${b.excerpt ? `<p class="caption excerpt">${esc(b.excerpt)}</p>` : ""}
        <a class="read-more" href="blog.html?slug=${encodeURIComponent(b.slug)}">Read More →</a>
      </div>
    </article>`;

  /* ---------- Single post page ---------- */
  const postEl = document.getElementById("post");
  if (postEl) {
    const params = new URLSearchParams(location.search);
    const preview = params.has("preview");
    const slug = params.get("slug");
    if (!slug && !preview) { location.replace("blogs.html"); return; }
    try {
      let blog;
      if (preview) {
        blog = JSON.parse(localStorage.getItem("mq_blog_preview"));
        if (!blog) throw 0;
      } else {
        const res = await fetch("/api/blogs/" + encodeURIComponent(slug));
        if (!res.ok) throw 0;
        ({ blog } = await res.json());
      }
      showPost(blog, preview);
    } catch {
      postEl.innerHTML = `<div class="wrap" style="padding-top:120px;padding-bottom:80px">
        <h2>Story not found</h2>
        <p class="lead" style="margin-top:12px">It may have been unpublished.
        <a href="blogs.html" style="color:var(--color-terracotta);font-weight:600">Browse all stories</a>.</p></div>`;
    }
    return;
  }

  function setMeta(blog) {
    document.title = (blog.meta_title || blog.title) + " | Mount Quintaa";
    const description = blog.meta_description || blog.excerpt;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    const faqs = (blog.faqs || []).filter(f => f.q?.trim() && f.a?.trim());
    if (!faqs.length) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: MQBlog.plain(f.a) } }))
    });
    document.head.appendChild(script);
  }

  function showPost(blog, preview) {
    setMeta(blog);
    const { html, toc } = MQBlog.article(blog);
    const mins = MQBlog.readMinutes(MQBlog.words(blog.blocks?.length ? MQBlog.text(blog) : blog.content));
    const author = blog.author || "Mount Quintaa Team";
    const url = encodeURIComponent(location.href);
    const title = encodeURIComponent(blog.title);

    postEl.innerHTML = `
      ${preview ? '<div class="post-preview-note">Preview — this is how the post will look. It is not published by this page.</div>' : ""}
      <section class="page-hero post-hero">
        <div class="wrap">
          <a class="read-more" href="blogs.html">← All Stories</a>
          <h1>${esc(blog.title)}</h1>
          ${blog.excerpt ? `<p class="post-lede">${esc(blog.excerpt)}</p>` : ""}
          <div class="post-byline">
            <span class="post-avatar" aria-hidden="true">${esc(author.charAt(0).toUpperCase())}</span>
            <span>${esc(author)}</span> · <span>${fmtDate(postDate(blog) || new Date())}</span> · <span>${mins} min read</span>
          </div>
          ${blog.tags?.length ? `<div class="post-tags">${blog.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
        </div>
      </section>
      <div class="wrap post-grid${toc.length ? "" : " no-toc"}">
        ${toc.length ? `<nav class="post-toc" aria-label="In this article"><h4>In This Article</h4>
          ${toc.map(t => `<a href="#${t.id}">${esc(t.text)}</a>`).join("")}</nav>` : ""}
        <article>
          <div class="post-body">${html}</div>
          <div class="post-share">
            <span>Share</span>
            <a href="https://wa.me/?text=${title}%20${url}" target="_blank" rel="noopener">WhatsApp</a>
            <a href="https://www.linkedin.com/sharing/share-offsite/?url=${url}" target="_blank" rel="noopener">LinkedIn</a>
            <button type="button" id="copyLink">Copy link</button>
          </div>
        </article>
        <aside class="post-side">
          <span class="eyebrow">Site Visits</span>
          <h3>See It for Yourself</h3>
          <p>Photos only say so much. Come walk the land and feel the quiet for yourself.</p>
          <a class="btn btn-primary" href="contact.html">Book a Site Visit</a>
          <div class="post-side-row">
            <a href="tel:+919148758264">Call</a>
            <a href="https://wa.me/919148758264" target="_blank" rel="noopener">WhatsApp</a>
          </div>
          <a class="post-side-more" href="blogs.html">More blog posts →</a>
        </aside>
      </div>
      <section class="post-more" id="keepReading" hidden>
        <div class="wrap">
          <h2>Keep reading</h2>
          <div class="journal-grid" id="keepReadingGrid"></div>
        </div>
      </section>`;

    if (blog.cover_url) {
      const cover = encodeURI(blog.cover_url).replace(/'/g, "%27");
      postEl.querySelector(".post-hero").style.setProperty("--pagehero-img", `url('${cover}')`);
    }
    const copy = document.getElementById("copyLink");
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = "Copied ✓";
    });
    followContents();
    keepReading(blog);
  }

  /* Highlight the section being read in the contents list */
  function followContents() {
    const links = [...postEl.querySelectorAll(".post-toc a")];
    if (!links.length) return;
    const heads = links.map(a => document.getElementById(a.hash.slice(1)));
    const mark = () => {
      let at = 0;
      heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top <= 140) at = i; });
      links.forEach((a, i) => a.classList.toggle("current", i === at));
    };
    window.addEventListener("scroll", mark, { passive: true });
    mark();
  }

  /* Three more posts, same category first */
  async function keepReading(blog) {
    try {
      const { blogs } = await (await fetch("/api/blogs")).json();
      const others = (blogs || []).filter(b => b.slug !== blog.slug);
      const same = others.filter(b => blog.category && b.category === blog.category);
      const picks = [...same, ...others.filter(b => !same.includes(b))].slice(0, 3);
      if (!picks.length) return;
      document.getElementById("keepReadingGrid").innerHTML = picks.map(b => card(b)).join("");
      document.getElementById("keepReading").hidden = false;
    } catch { /* the article still works without it */ }
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
      const featured = blogs.find(b => b.featured);
      if (featured) document.getElementById("blogFeatured").innerHTML = card(featured, "j-featured");
      fullGrid.innerHTML = blogs.filter(b => b !== featured).map(b => card(b)).join("");
    } else if (blogs && blogs.length) {
      homeGrid.innerHTML = blogs.slice(0, 3).map(b => card(b)).join("");
    }
    // keep placeholders on home page when no posts exist
  } catch {
    const empty = document.getElementById("blogEmpty");
    if (empty) empty.style.display = "block";
  }
})();
