/* ============================================================
   MOUNT QUINTAA — shared front-end behaviour
   ============================================================ */
"use strict";

/* API base: same origin when served by Node.
   If your backend lives on another domain (e.g. Render) while the
   site is on GoDaddy, set it here, e.g. "https://mount-quintaa-api.onrender.com" */
const API_BASE = "";

/* ---------- Sticky header ---------- */
const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 40);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- Mobile nav ---------- */
const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");
if (navToggle && mainNav) {
  navToggle.addEventListener("click", () => {
    const open = mainNav.classList.toggle("open");
    navToggle.classList.toggle("open", open);
    document.body.style.overflow = open ? "hidden" : "";
  });
  mainNav.querySelectorAll("a").forEach(a =>
    a.addEventListener("click", () => {
      mainNav.classList.remove("open");
      navToggle.classList.remove("open");
      document.body.style.overflow = "";
    })
  );
}

/* ---------- Scroll reveals ---------- */
const io = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }),
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal, .reveal-stagger").forEach(el => io.observe(el));

/* ---------- Count-up stats ---------- */
const statIO = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    statIO.unobserve(e.target);
    const el = e.target;
    const raw = el.dataset.count;
    const suffix = el.dataset.suffix || "";
    const target = parseFloat(raw);
    const dur = 1600;
    const start = performance.now();
    const fmt = n => n >= 1000 ? n.toLocaleString("en-IN") : n;
    const tick = now => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }),
  { threshold: 0.5 }
);
document.querySelectorAll("[data-count]").forEach(el => statIO.observe(el));

/* ---------- Accordion ---------- */
document.querySelectorAll(".accordion-q").forEach(btn => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".accordion-item");
    const answer = item.querySelector(".accordion-a");
    const isOpen = item.classList.contains("open");
    // close siblings
    item.parentElement.querySelectorAll(".accordion-item.open").forEach(o => {
      o.classList.remove("open");
      o.querySelector(".accordion-a").style.maxHeight = null;
    });
    if (!isOpen) {
      item.classList.add("open");
      answer.style.maxHeight = answer.scrollHeight + "px";
    }
  });
});

/* ---------- Testimonial marquee: duplicate track for seamless loop ---------- */
document.querySelectorAll(".marquee-track").forEach(track => {
  track.innerHTML += track.innerHTML;
});

/* ---------- Enquiry modal ---------- */
const modalOverlay = document.getElementById("leadModal");
function openModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove("show");
  document.body.style.overflow = "";
}
document.querySelectorAll("[data-open-modal]").forEach(el =>
  el.addEventListener("click", ev => { ev.preventDefault(); openModal(); })
);
if (modalOverlay) {
  modalOverlay.querySelector(".modal-close")?.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  // Gentle one-time delayed popup (20 s), only if user hasn't seen it this session
  if (!sessionStorage.getItem("mq_popup_shown")) {
    setTimeout(() => {
      if (!modalOverlay.classList.contains("show")) {
        openModal();
        sessionStorage.setItem("mq_popup_shown", "1");
      }
    }, 20000);
  }
}

/* ---------- Lead form submission ---------- */
async function submitLead(form) {
  const note = form.querySelector(".form-note");
  const btn = form.querySelector("button[type=submit]");
  const data = Object.fromEntries(new FormData(form).entries());

  // Basic client validation (server validates again)
  if (!data.name || !data.phone) {
    note.textContent = "Please fill in your name and phone number.";
    note.className = "form-note err";
    return;
  }
  if (!form.querySelector("input[name=consent]")?.checked) {
    note.textContent = "Please tick the consent box so we can contact you.";
    note.className = "form-note err";
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Sending…";
  try {
    const res = await fetch(API_BASE + "/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name.trim(),
        email: (data.email || "").trim(),
        phone: data.phone.trim(),
        message: (data.message || "").trim(),
        source: data.source || document.title
      })
    });
    if (!res.ok) throw new Error((await res.json()).error || "Something went wrong");
    note.textContent = "Thank you! Our team will reach out within 24 hours.";
    note.className = "form-note ok";
    form.reset();
    setTimeout(closeModal, 2200);
  } catch (err) {
    note.textContent = err.message === "Failed to fetch"
      ? "Could not reach the server. Please call or WhatsApp us instead."
      : err.message;
    note.className = "form-note err";
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
document.querySelectorAll("form.lead-form").forEach(form =>
  form.addEventListener("submit", e => { e.preventDefault(); submitLead(form); })
);

/* ---------- Footer year ---------- */
document.querySelectorAll("[data-year]").forEach(el => (el.textContent = new Date().getFullYear()));
