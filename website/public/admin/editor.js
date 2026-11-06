/* ============================================================
   MOUNT QUINTAA — blog writing screen
   A post is a list of blocks plus FAQs and SEO settings. Drafts
   save themselves; a live post only changes when Update is
   pressed. Loaded after admin.js and uses its $, TOKEN, API_BASE.
   ============================================================ */
"use strict";

const BLOCK_TYPES = {
  intro: { chip: "Intro", label: "Intro", hint: "The opening paragraph — put the main keyword in the first sentence.", format: true },
  h2: { chip: "H2", label: "Heading (H2)" },
  h3: { chip: "H3", label: "Sub-heading (H3)" },
  paragraph: { chip: "Paragraph", label: "Paragraph", format: true },
  list: { chip: "List", label: "List", hint: "One item per line.", format: true },
  table: { chip: "Table", label: "Table" },
  tip: { chip: "Tip", label: "Tip box", format: true },
  warning: { chip: "Warning", label: "Warning box", format: true },
  image: { chip: "Image", label: "Image" },
  quote: { chip: "Quote", label: "Quote" },
  services: { chip: "Pages", label: "Page cards", hint: "Cards linking to Mount Quintaa pages, with one line on why each fits." },
  cta: { chip: "CTA", label: "Call to action", hint: "A box with a button — end every post with one." }
};

const TEMPLATES = [
  { name: "Farmland guide", about: "Explains a topic for buyers: headings, a list, a tip, FAQs and a call to action.",
    blocks: ["intro", "h2", "paragraph", "h2", "paragraph", "list", "image", "h2", "h3", "paragraph", "h3", "paragraph", "tip", "cta"], faqs: 4 },
  { name: "Project update", about: "News from the site: what's done, photos, what's next.",
    blocks: ["intro", "h2", "paragraph", "image", "h2", "list", "h2", "paragraph", "cta"], faqs: 0 },
  { name: "Comparison", about: "Weighs up options with a table and a clear recommendation.",
    blocks: ["intro", "h2", "paragraph", "table", "h2", "paragraph", "warning", "h2", "paragraph", "services", "cta"], faqs: 3 }
];

const AUTOSAVE_MS = 2500;
const DEFAULT_AUTHOR = "Mount Quintaa Team";

let POST = null;        // the post being edited
let DIRTY = false;      // changed since the last save
let SAVING = false;
let SAVE_TIMER = null;
let ADD_AT = null;      // where an open "+ Add block" menu is
let SLUG_TOUCHED = false;

const toSlug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

function newBlock(type) {
  switch (type) {
    case "list": return { type, text: "", numbered: false };
    case "table": return { type, rows: [["Detail", "Information"], ["", ""], ["", ""]] };
    case "image": return { type, url: "", alt: "", caption: "", credit: "" };
    case "services": return { type, items: [{ page: "", why: "" }] };
    case "cta": return { type, text: "", label: "Book a Site Visit", link: "/contact" };
    default: return { type, text: "" };
  }
}

function blankPost() {
  return {
    id: null, title: "", excerpt: "", blocks: [newBlock("intro")], faqs: [], slug: "", cover_url: "",
    meta_title: "", meta_description: "", keyword: "", tags: [], category: "", featured: false,
    author: DEFAULT_AUTHOR, status: "draft"
  };
}

/* Older posts are one plain text field: turn each paragraph into a block */
function withBlocks(post) {
  const blocks = post.blocks?.length ? post.blocks
    : String(post.content || "").split(/\n{2,}/).filter(p => p.trim()).map(text => ({ type: "paragraph", text }));
  return {
    ...blankPost(), ...post,
    blocks: blocks.length ? blocks : [newBlock("intro")],
    faqs: post.faqs || [], tags: post.tags || [], author: post.author || DEFAULT_AUTHOR,
    excerpt: post.excerpt || "", cover_url: post.cover_url || "", meta_title: post.meta_title || "",
    meta_description: post.meta_description || "", keyword: post.keyword || "", category: post.category || ""
  };
}

/* ---------- Opening and closing ---------- */
function openEditor(post) {
  POST = post;
  DIRTY = false;
  ADD_AT = null;
  SLUG_TOUCHED = !!post.slug && !post.slug.startsWith("draft-");
  $("blogListView").classList.add("hidden");
  $("blogEditorView").classList.remove("hidden");
  $("edError").classList.add("hidden");
  $("edTitle").value = POST.title;
  $("edExcerpt").value = POST.excerpt;
  ["slug", "meta_title", "meta_description", "keyword", "author"].forEach(k => { $("ed-" + k).value = POST[k]; });
  $("ed-category").value = POST.category;
  $("ed-featured").checked = POST.featured;
  renderBlocks();
  renderFaqs();
  renderTags();
  renderCover();
  refresh();
  [$("edTitle"), $("edExcerpt")].forEach(grow);
  window.scrollTo({ top: 0 });
}

function closeEditor() {
  clearTimeout(SAVE_TIMER);
  POST = null;
  DIRTY = false;
  $("blogEditorView").classList.add("hidden");
  $("blogListView").classList.remove("hidden");
}

$("newPostBtn").addEventListener("click", () => openEditor(blankPost()));

async function editPost(id) {
  const blog = await fetchFullPost(id);
  if (blog) openEditor(withBlocks(blog));
}

async function duplicatePost(id) {
  const blog = await fetchFullPost(id);
  if (!blog) return;
  openEditor({ ...withBlocks(blog), id: null, title: blog.title + " (copy)", slug: "", status: "draft", featured: false, published_at: null });
  markDirty();
}

$("edBack").addEventListener("click", async () => {
  if (POST.status === "draft" && DIRTY) await save("draft");
  else if (DIRTY && !confirm("Leave without saving your changes to this live post?")) return;
  closeEditor();
  loadBlogs();
});

window.addEventListener("beforeunload", e => {
  if (POST && DIRTY) e.preventDefault();
});

/* ---------- Saving ---------- */
const hasWriting = () => POST.title.trim() || POST.excerpt.trim() || MQBlog.text(POST);

function markDirty() {
  DIRTY = true;
  refresh();
  clearTimeout(SAVE_TIMER);
  // A live post only changes when Update is pressed
  if (POST.status === "draft") SAVE_TIMER = setTimeout(() => hasWriting() && save("draft"), AUTOSAVE_MS);
}

async function save(status) {
  if (SAVING) return false;
  clearTimeout(SAVE_TIMER);
  SAVING = true;
  showState("Saving…");
  const error = $("edError");
  error.classList.add("hidden");
  const wasDirty = DIRTY;
  DIRTY = false;
  try {
    const res = await fetch(API_BASE + (POST.id ? "/api/admin/blogs/" + POST.id : "/api/admin/blogs"), {
      method: POST.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
      body: JSON.stringify({ ...POST, status, content: MQBlog.text(POST) })
    });
    if (res.status === 401) { closeEditor(); showLogin(); return false; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not save the post");
    POST.id = data.id;
    POST.status = status;
    POST.slug = data.slug;
    $("ed-slug").value = data.slug;
    return true;
  } catch (ex) {
    DIRTY = wasDirty;
    error.textContent = ex.message === "Failed to fetch" ? "Could not reach the server. Your work is still here — try again." : ex.message;
    error.classList.remove("hidden");
    return false;
  } finally {
    SAVING = false;
    refresh();
    // Typed while saving: pick those changes up too
    if (DIRTY && POST?.status === "draft") markDirty();
  }
}

$("edSave").addEventListener("click", () => save("draft"));
$("edPublish").addEventListener("click", publish);
async function publish() {
  $("edMenu").classList.add("hidden");
  const wasLive = POST.status === "published";
  if (await save("published")) showState(wasLive ? "Updated" : "Published ✓");
}

$("edMore").addEventListener("click", () => $("edMenu").classList.toggle("hidden"));
$("edPublishNow").addEventListener("click", publish);
$("edToDraft").addEventListener("click", async () => {
  $("edMenu").classList.add("hidden");
  if (confirm("Take this post off the website and move it back to drafts?")) await save("draft");
});

$("edDelete").addEventListener("click", async () => {
  const live = POST.status === "published";
  if (!confirm(live ? "Delete this live post permanently?" : "Delete this draft permanently?")) return;
  clearTimeout(SAVE_TIMER);
  if (POST.id) {
    const res = await fetch(API_BASE + "/api/admin/blogs/" + POST.id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + TOKEN }
    });
    if (res.status === 401) { closeEditor(); showLogin(); return; }
  }
  closeEditor();
  loadBlogs();
});

/* Opens the real article page with this post, without saving it */
$("edPreview").addEventListener("click", () => {
  localStorage.setItem("mq_blog_preview", JSON.stringify({ ...POST, content: MQBlog.text(POST), title: POST.title || "Untitled post" }));
  window.open("/blog?preview=1", "_blank", "noopener");
});

/* ---------- Top bar and SEO panel ---------- */
function showState(text) { $("edState").textContent = text; }

function refresh() {
  if (!POST) return;
  const live = POST.status === "published";
  const badge = $("edBadge");
  badge.textContent = live ? "published" : "draft";
  badge.className = "status-badge " + POST.status;
  $("edPublish").textContent = live ? "Update" : "Publish";
  $("edDelete").textContent = live ? "Delete post" : "Delete draft";
  $("edSave").classList.toggle("hidden", live);
  $("edSave").disabled = !DIRTY;
  $("edPublishNow").textContent = live ? "Update live post" : "Publish now";
  $("edToDraft").classList.toggle("hidden", !live);
  showState(SAVING ? "Saving…" : DIRTY ? "Unsaved changes" : POST.id ? "Saved" : "");

  const title = POST.meta_title || POST.title || "Untitled post";
  const description = POST.meta_description || POST.excerpt;
  $("edTitleCount").textContent = `${title.length}/60`;
  $("edDescCount").textContent = `${description.length}/160`;
  $("ed-meta_title").placeholder = POST.title || "Untitled post";
  $("ed-meta_description").placeholder = POST.excerpt;
  $("edGoogleSite").textContent = `mountquintaa.com › blog › ${POST.slug || "new-post"}`;
  $("edGoogleTitle").textContent = title;
  $("edGoogleDesc").textContent = description || "Your meta description will show here.";

  const text = MQBlog.text(POST);
  const count = MQBlog.words(text);
  $("edWords").textContent = `${MQBlog.readMinutes(count)} min read · ${count} words`;

  const checks = seoChecks(title, description, count);
  const passed = checks.filter(c => c.ok).length;
  $("edChecks").innerHTML = checks.map(c => `<li class="${c.ok ? "ok" : ""}">${c.label}</li>`).join("");
  $("edScoreText").textContent = `${passed} of ${checks.length} checks`;
  $("edScore").className = "ed-score " + (passed >= 12 ? "good" : passed >= 7 ? "mid" : "");
}

function seoChecks(title, description, count) {
  const keyword = POST.keyword.trim().toLowerCase();
  const has = s => !!keyword && String(s).toLowerCase().includes(keyword);
  const first = POST.blocks.find(b => (b.type === "intro" || b.type === "paragraph") && b.text?.trim());
  const images = POST.blocks.filter(b => b.type === "image" && b.url);
  const faqs = POST.faqs.filter(f => f.q.trim() && f.a.trim());
  const internal = POST.blocks.some(b =>
    (b.type === "cta" && b.link?.startsWith("/")) ||
    (b.type === "services" && b.items.some(i => i.page)) ||
    /\]\((\/|https?:\/\/(www\.)?mountquintaa\.com)/i.test(b.text || ""));
  return [
    { label: "Main keyword is set", ok: !!keyword },
    { label: "Keyword in the title", ok: has(POST.title) },
    { label: "Keyword in the meta description", ok: has(description) },
    { label: "Keyword in the first paragraph", ok: has(first?.text || "") },
    { label: "Keyword in the address", ok: !!keyword && POST.slug.includes(toSlug(keyword)) },
    { label: "Meta title is 30–60 characters", ok: title.length >= 30 && title.length <= 60 },
    { label: "Meta description is 120–160 characters", ok: description.length >= 120 && description.length <= 160 },
    { label: "Has at least one H2 heading", ok: POST.blocks.some(b => b.type === "h2" && b.text.trim()) },
    { label: "At least 600 words", ok: count >= 600 },
    { label: "Every image has alt text", ok: images.every(b => b.alt.trim()) },
    { label: "At least one link to another Mount Quintaa page", ok: internal },
    { label: "At least 3 FAQs", ok: faqs.length >= 3 },
    { label: "Has a call-to-action block", ok: POST.blocks.some(b => b.type === "cta") },
    { label: "Has a cover image", ok: !!POST.cover_url }
  ];
}

/* Title and excerpt grow with their text */
function grow(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
$("edTitle").addEventListener("input", e => {
  grow(e.target);
  POST.title = e.target.value;
  if (!SLUG_TOUCHED && POST.status === "draft") {
    POST.slug = toSlug(POST.title);
    $("ed-slug").value = POST.slug;
  }
  markDirty();
});
$("edExcerpt").addEventListener("input", e => {
  grow(e.target);
  POST.excerpt = e.target.value;
  markDirty();
});
["meta_title", "meta_description", "keyword", "author"].forEach(k =>
  $("ed-" + k).addEventListener("input", e => { POST[k] = e.target.value; markDirty(); })
);
$("ed-slug").addEventListener("input", e => {
  SLUG_TOUCHED = true;
  POST.slug = toSlug(e.target.value);
  markDirty();
});
$("ed-category").addEventListener("change", e => { POST.category = e.target.value; markDirty(); });
$("ed-featured").addEventListener("change", e => { POST.featured = e.target.checked; markDirty(); });

/* ---------- Tags ---------- */
function renderTags() {
  $("edTags").innerHTML = POST.tags.map((t, i) =>
    `<span>${escHTML(t)}<button type="button" data-i="${i}" aria-label="Remove ${escHTML(t)}">✕</button></span>`).join("");
}
$("ed-tags").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const tag = e.target.value.trim();
  if (tag && !POST.tags.includes(tag)) POST.tags.push(tag);
  e.target.value = "";
  renderTags();
  markDirty();
});
$("edTags").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  POST.tags.splice(+btn.dataset.i, 1);
  renderTags();
  markDirty();
});

/* ---------- Images ---------- */
/* Shrink to WebP in the browser, so big photos upload fast and load fast */
async function shrink(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = await new Promise(done => canvas.toBlob(done, "image/webp", 0.82));
  return webp?.type === "image/webp" ? webp : file;
}

async function uploadImage(file) {
  const image = await shrink(file);
  if (image.size > 4 * 1024 * 1024) throw new Error("Image too large — keep it under 4 MB.");
  const res = await fetch(API_BASE + "/api/admin/upload", {
    method: "POST",
    headers: { "Content-Type": image.type, Authorization: "Bearer " + TOKEN },
    body: image
  });
  if (res.status === 401) { closeEditor(); showLogin(); throw new Error("Please sign in again."); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

function dropHTML(url, id) {
  return `<div class="ed-drop" data-drop>
    ${url ? `<img src="${escHTML(url)}" alt="" />` : ""}
    <label for="${id}">${url ? "Replace image" : "Upload image"}</label>
    ${url ? '<button type="button" class="ed-remove" data-remove>Remove</button>' : ""}
    <input type="file" id="${id}" accept="image/png,image/jpeg,image/webp" hidden />
    <div data-note>or drag an image here — it's shrunk to a fast WebP automatically</div>
  </div>`;
}

/* Works for the cover and for image blocks; `done` gets the new url */
function wireDrop(zone, done) {
  const take = async file => {
    if (!file) return;
    const note = zone.querySelector("[data-note]");
    note.textContent = "Uploading…";
    try {
      done(await uploadImage(file));
    } catch (ex) {
      note.textContent = ex.message;
    }
  };
  zone.querySelector("input[type=file]").addEventListener("change", e => take(e.target.files[0]));
  zone.querySelector("[data-remove]")?.addEventListener("click", () => done(""));
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("over");
    take(e.dataTransfer.files[0]);
  });
}

function renderCover() {
  const box = $("edCover");
  box.innerHTML = dropHTML(POST.cover_url, "ed-cover-file");
  wireDrop(box.firstElementChild, url => {
    POST.cover_url = url;
    renderCover();
    markDirty();
  });
}

/* ---------- Blocks ---------- */
const field = (b, name) => escHTML(b[name] ?? "");

function blockBody(b, i) {
  const format = BLOCK_TYPES[b.type].format
    ? `<div class="eb-format"><button type="button" data-act="bold"><strong>B</strong></button><button type="button" data-act="link">Link</button></div>` : "";
  switch (b.type) {
    case "h2":
    case "h3":
      return `<input type="text" data-field="text" maxlength="200" value="${field(b, "text")}" />`;
    case "list":
      return `${format}<textarea data-field="text">${field(b, "text")}</textarea>
        <label class="eb-check"><input type="checkbox" data-field="numbered" ${b.numbered ? "checked" : ""} /> Numbered list</label>`;
    case "table":
      return `<div class="eb-grid">${b.rows.map((row, r) => `<div class="eb-cells ${r ? "" : "head"}">
          ${row.map((cell, c) => `<input type="text" data-row="${r}" data-col="${c}" value="${escHTML(cell)}" />`).join("")}</div>`).join("")}</div>
        <div class="eb-small">
          <button type="button" data-act="addRow">+ Add row</button><button type="button" data-act="addCol">+ Add column</button>
          <button type="button" data-act="delRow">Remove last row</button><button type="button" data-act="delCol">Remove last column</button>
        </div>`;
    case "image":
      return `${dropHTML(b.url, `ed-image-${i}`)}
        <input type="text" data-field="alt" maxlength="300" style="margin-top:8px" placeholder="Alt text — describe the image (include the keyword where it fits)" value="${field(b, "alt")}" />
        <div class="eb-two">
          <input type="text" data-field="caption" maxlength="300" placeholder="Caption (optional)" value="${field(b, "caption")}" />
          <input type="text" data-field="credit" maxlength="200" placeholder="Photo credit (optional)" value="${field(b, "credit")}" />
        </div>`;
    case "services":
      return `${b.items.map((item, n) => `<div class="eb-service">
          <select data-item="${n}" data-key="page"><option value="">Choose a page</option>
            ${MQBlog.PAGES.map(p => `<option value="${p.id}" ${p.id === item.page ? "selected" : ""}>${escHTML(p.title)}</option>`).join("")}
          </select>
          <input type="text" data-item="${n}" data-key="why" maxlength="300" placeholder="Why it fits (one line)" value="${escHTML(item.why)}" />
          <button type="button" class="eb-x" data-act="delItem" data-n="${n}" aria-label="Remove">✕</button>
        </div>`).join("")}
        <button type="button" class="eb-wide" data-act="addItem">+ Add a page</button>`;
    case "cta":
      return `<textarea data-field="text" placeholder="Text">${field(b, "text")}</textarea>
        <div class="eb-two">
          <input type="text" data-field="label" maxlength="80" placeholder="Button text" value="${field(b, "label")}" />
          <input type="text" data-field="link" maxlength="500" placeholder="/contact" value="${field(b, "link")}" />
        </div>`;
    default:
      return `${format}<textarea data-field="text">${field(b, "text")}</textarea>`;
  }
}

function addMenuHTML(at) {
  if (ADD_AT !== at) return `<div class="eb-between"><button type="button" class="open" data-act="openAdd" data-at="${at}">+ Add block</button></div>`;
  return `<div class="eb-between">${Object.entries(BLOCK_TYPES).map(([type, d]) =>
    `<button type="button" class="ed-chip" data-act="addHere" data-type="${type}" data-at="${at}">${d.chip}</button>`).join("")}</div>`;
}

function renderBlocks() {
  const last = POST.blocks.length - 1;
  $("edBlocks").innerHTML = addMenuHTML(0) + POST.blocks.map((b, i) => {
    const d = BLOCK_TYPES[b.type];
    return `<div class="eb" data-i="${i}">
      <div class="eb-head">
        <span class="eb-label">${d.label}</span>
        ${d.hint ? `<span class="eb-hint">${d.hint}</span>` : ""}
        <div class="eb-tools">
          <button type="button" data-act="up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-act="down" title="Move down" ${i === last ? "disabled" : ""}>↓</button>
          <button type="button" data-act="copy" title="Duplicate">⧉</button>
          <button type="button" class="del" data-act="remove" title="Delete">✕</button>
        </div>
      </div>
      ${blockBody(b, i)}
    </div>${addMenuHTML(i + 1)}`;
  }).join("");

  document.querySelectorAll("#edBlocks .eb").forEach(el => {
    const zone = el.querySelector("[data-drop]");
    if (!zone) return;
    const b = POST.blocks[+el.dataset.i];
    wireDrop(zone, url => {
      b.url = url;
      renderBlocks();
      markDirty();
    });
  });
}

function addBlock(type, at) {
  POST.blocks.splice(at, 0, newBlock(type));
  ADD_AT = null;
  renderBlocks();
  markDirty();
  const el = document.querySelector(`#edBlocks .eb[data-i="${at}"]`);
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.querySelector("textarea, input[type=text]")?.focus({ preventScroll: true });
}

document.querySelectorAll("#edAddBar .ed-chip").forEach(chip =>
  chip.addEventListener("click", () => addBlock(chip.dataset.type, POST.blocks.length))
);

/* Wrap the selected text, keeping the cursor in the box */
function wrapSelection(area, before, after, fallback) {
  const { selectionStart: start, selectionEnd: end, value } = area;
  const picked = value.slice(start, end) || fallback;
  area.value = value.slice(0, start) + before + picked + after + value.slice(end);
  area.focus();
  area.setSelectionRange(start + before.length, start + before.length + picked.length);
  area.dispatchEvent(new Event("input", { bubbles: true }));
}

function addLink(area) {
  let url = (prompt("Link address, e.g. /projects or https://example.com") || "").trim();
  if (!url) return;
  if (/^[\w-]+(\.[\w-]+)+/.test(url)) url = "https://" + url;
  if (!MQBlog.safeUrl(url)) return alert("Use an address starting with / or https://");
  wrapSelection(area, "[", `](${url})`, "link text");
}

$("edBlocks").addEventListener("input", e => {
  const el = e.target;
  const box = el.closest(".eb");
  if (!box) return;
  const b = POST.blocks[+box.dataset.i];
  if (el.dataset.field) b[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
  else if (el.dataset.row) b.rows[+el.dataset.row][+el.dataset.col] = el.value;
  else if (el.dataset.item) b.items[+el.dataset.item][el.dataset.key] = el.value;
  markDirty();
});

$("edBlocks").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === "openAdd") { ADD_AT = +btn.dataset.at; return renderBlocks(); }
  if (act === "addHere") return addBlock(btn.dataset.type, +btn.dataset.at);

  const box = btn.closest(".eb");
  const i = +box.dataset.i;
  const b = POST.blocks[i];
  const area = box.querySelector("textarea");
  if (act === "bold") return wrapSelection(area, "**", "**", "bold text");
  if (act === "link") return addLink(area);

  switch (act) {
    case "up": POST.blocks.splice(i - 1, 0, POST.blocks.splice(i, 1)[0]); break;
    case "down": POST.blocks.splice(i + 1, 0, POST.blocks.splice(i, 1)[0]); break;
    case "copy": POST.blocks.splice(i + 1, 0, JSON.parse(JSON.stringify(b))); break;
    case "remove": POST.blocks.splice(i, 1); break;
    case "addRow": b.rows.push(b.rows[0].map(() => "")); break;
    case "addCol": b.rows.forEach(r => r.push("")); break;
    case "delRow": if (b.rows.length > 1) b.rows.pop(); break;
    case "delCol": if (b.rows[0].length > 1) b.rows.forEach(r => r.pop()); break;
    case "addItem": b.items.push({ page: "", why: "" }); break;
    case "delItem": b.items.splice(+btn.dataset.n, 1); break;
    default: return;
  }
  renderBlocks();
  markDirty();
});

/* ---------- FAQs ---------- */
function renderFaqs() {
  $("edFaqList").innerHTML = POST.faqs.map((f, i) => `<div class="ed-faq" data-i="${i}">
    <input type="text" data-key="q" maxlength="300" placeholder="Question" value="${escHTML(f.q)}" />
    <textarea data-key="a" placeholder="Answer">${escHTML(f.a)}</textarea>
    <button type="button" class="eb-x" aria-label="Remove question">✕</button>
  </div>`).join("");
}
$("edAddFaq").addEventListener("click", () => {
  POST.faqs.push({ q: "", a: "" });
  renderFaqs();
  markDirty();
  $("edFaqList").lastElementChild.querySelector("input").focus();
});
$("edFaqList").addEventListener("input", e => {
  POST.faqs[+e.target.closest(".ed-faq").dataset.i][e.target.dataset.key] = e.target.value;
  markDirty();
});
$("edFaqList").addEventListener("click", e => {
  if (!e.target.closest(".eb-x")) return;
  POST.faqs.splice(+e.target.closest(".ed-faq").dataset.i, 1);
  renderFaqs();
  markDirty();
});

/* ---------- Templates ---------- */
$("edTemplatesBtn").addEventListener("click", () => $("edTemplates").classList.remove("hidden"));
$("edTemplatesClose").addEventListener("click", () => $("edTemplates").classList.add("hidden"));
$("edTemplateList").innerHTML = TEMPLATES.map((t, i) =>
  `<button type="button" class="ed-template" data-i="${i}"><strong>${t.name}</strong><span>${t.about}</span></button>`).join("");
$("edTemplateList").addEventListener("click", e => {
  const btn = e.target.closest(".ed-template");
  if (!btn) return;
  const written = MQBlog.text(POST);
  if (written && !confirm("Replace the blocks you've written with this template?")) return;
  const t = TEMPLATES[+btn.dataset.i];
  POST.blocks = t.blocks.map(newBlock);
  POST.faqs = Array.from({ length: t.faqs }, () => ({ q: "", a: "" }));
  $("edTemplates").classList.add("hidden");
  renderBlocks();
  renderFaqs();
  markDirty();
});
