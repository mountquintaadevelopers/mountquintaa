/* ============================================================
   MOUNT QUINTAA — turns a post's blocks into HTML
   Used by the public article page and by the admin editor, so
   the writer's word count and links match what gets published.
   Writers mark text as **bold** and [link text](url).
   ============================================================ */
"use strict";
const MQBlog = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Pages a "page cards" block can link to */
  const PAGES = [
    { id: "projects", title: "Mount Quintaa Phase 1", url: "/projects" },
    { id: "visit", title: "Book a Site Visit", url: "/contact" },
    { id: "about", title: "About Us", url: "/about" },
    { id: "blogs", title: "All Blog Posts", url: "/blogs" }
  ];

  /* Only allow links that can't run code in the reader's browser */
  const safeUrl = url => /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(String(url).trim()) ? String(url).trim() : "";

  const isExternal = url => /^https?:\/\//i.test(url) && !/^https?:\/\/(www\.)?mountquintaa\.com/i.test(url);

  /* **bold** and [text](url), on text that has already been escaped */
  function inline(text) {
    return esc(text)
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (all, label, url) => {
        const href = safeUrl(url);
        if (!href) return label;
        return `<a href="${href}"${isExternal(href) ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
      })
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  }

  const multiline = text => inline(text).replace(/\n/g, "<br>");

  /* The same text without the bold and link marks */
  const plain = text => String(text ?? "")
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1");

  const listItems = text => String(text ?? "").split("\n").map(l => l.trim()).filter(Boolean);

  /* A heading's id for the contents list, unique within the post */
  function anchor(text, used) {
    const base = plain(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
    let id = base, i = 1;
    while (used.has(id)) id = `${base}-${++i}`;
    used.add(id);
    return id;
  }

  function block(b, used, toc) {
    switch (b.type) {
      case "intro":
        return b.text?.trim() ? `<p class="pb-intro">${multiline(b.text)}</p>` : "";
      case "paragraph":
        return b.text?.trim() ? `<p>${multiline(b.text)}</p>` : "";
      case "h2": {
        if (!b.text?.trim()) return "";
        const id = anchor(b.text, used);
        toc.push({ id, text: plain(b.text) });
        return `<h2 id="${id}">${esc(plain(b.text))}</h2>`;
      }
      case "h3":
        return b.text?.trim() ? `<h3>${esc(plain(b.text))}</h3>` : "";
      case "list": {
        const items = listItems(b.text);
        if (!items.length) return "";
        const tag = b.numbered ? "ol" : "ul";
        return `<${tag}>${items.map(i => `<li>${inline(i)}</li>`).join("")}</${tag}>`;
      }
      case "table": {
        const rows = (b.rows || []).filter(r => r.some(c => String(c).trim()));
        if (!rows.length) return "";
        const [head, ...body] = rows;
        return `<div class="pb-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead>
          <tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      }
      case "tip":
        return b.text?.trim() ? `<aside class="pb-note pb-tip"><span aria-hidden="true">💡</span><div>${multiline(b.text)}</div></aside>` : "";
      case "warning":
        return b.text?.trim() ? `<aside class="pb-note pb-warning"><span aria-hidden="true">⚠️</span><div>${multiline(b.text)}</div></aside>` : "";
      case "image": {
        if (!b.url) return "";
        const note = [b.caption && esc(b.caption), b.credit && `<span>Photo: ${esc(b.credit)}</span>`].filter(Boolean).join(" ");
        return `<figure class="pb-figure"><img src="${esc(b.url)}" alt="${esc(b.alt)}" loading="lazy" />${note ? `<figcaption>${note}</figcaption>` : ""}</figure>`;
      }
      case "quote":
        return b.text?.trim() ? `<blockquote class="pb-quote">${multiline(b.text)}</blockquote>` : "";
      case "services": {
        const cards = (b.items || []).map(i => ({ page: PAGES.find(p => p.id === i.page), why: i.why })).filter(c => c.page);
        if (!cards.length) return "";
        return `<div class="pb-cards">${cards.map(c => `<a class="pb-card" href="${c.page.url}"><strong>${esc(c.page.title)}</strong>${c.why ? `<span>${esc(c.why)}</span>` : ""}</a>`).join("")}</div>`;
      }
      case "cta": {
        const href = safeUrl(b.link);
        if (!b.text?.trim() && !(b.label && href)) return "";
        return `<div class="pb-cta">${b.text?.trim() ? `<p>${multiline(b.text)}</p>` : ""}${b.label && href ? `<a class="btn btn-primary" href="${esc(href)}">${esc(b.label)}</a>` : ""}</div>`;
      }
      default:
        return "";
    }
  }

  /* Older posts are plain text: one paragraph per blank-line gap */
  const legacy = content => String(content ?? "").split(/\n{2,}/).filter(p => p.trim())
    .map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

  /* → { html, toc: [{id, text}] } with an "In This Article" list after the intro */
  function article(post) {
    const blocks = post.blocks || [];
    if (!blocks.length) return { html: legacy(post.content), toc: [] };

    const used = new Set(["in-this-article", "faqs"]);
    const toc = [];
    const parts = blocks.map(b => ({ type: b.type, html: block(b, used, toc) })).filter(p => p.html);
    const faqs = (post.faqs || []).filter(f => f.q?.trim() && f.a?.trim());

    if (toc.length >= 2) {
      const jump = [...toc, ...(faqs.length ? [{ id: "faqs", text: "Frequently Asked Questions" }] : [])];
      const list = `<h2 id="in-this-article">In This Article</h2>
        <ul>${jump.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join("")}</ul>`;
      let at = 0;
      while (parts[at]?.type === "intro") at++;
      parts.splice(at, 0, { html: list });
      toc.unshift({ id: "in-this-article", text: "In This Article" });
    }
    if (faqs.length) {
      parts.push({ html: `<h2 id="faqs">Frequently Asked Questions</h2>
        <div class="pb-faqs">${faqs.map((f, i) => `<details${i ? "" : " open"}><summary>${esc(f.q)}</summary><div>${multiline(f.a)}</div></details>`).join("")}</div>` });
    }
    return { html: parts.map(p => p.html).join("\n"), toc };
  }

  /* All the words in a post, for the word count and the "content" column */
  function text(post) {
    const out = [];
    for (const b of post.blocks || []) {
      if (b.type === "table") (b.rows || []).forEach(r => out.push(r.join(" ")));
      else if (b.type === "services") (b.items || []).forEach(i => out.push(i.why));
      else if (b.type === "image") out.push(b.caption);
      else out.push(b.text);
    }
    for (const f of post.faqs || []) out.push(f.q, f.a);
    return out.filter(Boolean).map(plain).join("\n\n").trim();
  }

  const words = s => (String(s).match(/\S+/g) || []).length;
  const readMinutes = count => Math.max(1, Math.round(count / 200));

  return { esc, PAGES, safeUrl, plain, article, text, words, readMinutes };
})();
