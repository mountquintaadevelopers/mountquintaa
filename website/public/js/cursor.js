/* ============================================================
   MOUNT QUINTAA — "Seed Trail" cursor
   Desktop : gold seed dot + olive ring follows the cursor,
             tiny leaves sprout along the path, ring blooms on links.
   Mobile  : the same leaves sprout wherever you tap or swipe,
             and while scrolling up/down.
   Respects prefers-reduced-motion.
   ============================================================ */
"use strict";
(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  /* ---------- Leaf particle layer (both desktop & mobile) ---------- */
  const layer = document.createElement("div");
  layer.className = "mq-leaf-layer";
  document.body.appendChild(layer);

  const COLORS = ["#F0E383", "#426001", "#B07A62", "#8FA65A"];
  let leafBudget = 0;

  function sproutLeaf(x, y, burst = false) {
    if (layer.childElementCount > 40) return;           // keep it light
    const leaf = document.createElement("span");
    leaf.className = "mq-leaf";
    const size = burst ? 7 + Math.random() * 7 : 5 + Math.random() * 5;
    const drift = (Math.random() - 0.5) * (burst ? 90 : 40);
    const rise = -(30 + Math.random() * (burst ? 70 : 40));
    const spin = (Math.random() - 0.5) * 240;
    leaf.style.cssText = `
      left:${x}px; top:${y}px; width:${size}px; height:${size}px;
      background:${COLORS[(Math.random() * COLORS.length) | 0]};
      --dx:${drift}px; --dy:${rise}px; --rot:${spin}deg;`;
    layer.appendChild(leaf);
    leaf.addEventListener("animationend", () => leaf.remove());
  }

  /* ---------- Desktop custom cursor ---------- */
  if (!isTouch) {
    document.documentElement.classList.add("mq-cursor-on");

    const dot = document.createElement("div");
    dot.className = "mq-cursor-dot";
    const ring = document.createElement("div");
    ring.className = "mq-cursor-ring";
    document.body.append(dot, ring);

    let mx = innerWidth / 2, my = innerHeight / 2;   // mouse
    let rx = mx, ry = my;                            // ring (lerped)
    let lastX = mx, lastY = my;

    addEventListener("mousemove", e => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      // sprout a leaf roughly every 28px of travel
      const dist = Math.hypot(mx - lastX, my - lastY);
      leafBudget += dist;
      if (leafBudget > 28) {
        leafBudget = 0;
        sproutLeaf(mx, my);
      }
      lastX = mx; lastY = my;
    }, { passive: true });

    (function follow() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(follow);
    })();

    /* Ring "blooms" over anything clickable */
    const HOT = "a, button, input, select, textarea, [data-open-modal], .accordion-q";
    addEventListener("mouseover", e => {
      if (e.target.closest(HOT)) ring.classList.add("hot");
    }, { passive: true });
    addEventListener("mouseout", e => {
      if (e.target.closest(HOT)) ring.classList.remove("hot");
    }, { passive: true });

    /* Click = small burst */
    addEventListener("mousedown", e => {
      for (let i = 0; i < 5; i++) sproutLeaf(e.clientX, e.clientY, true);
      ring.classList.add("press");
    });
    addEventListener("mouseup", () => ring.classList.remove("press"));

    /* Hide when the pointer leaves the window */
    addEventListener("mouseleave", () => { dot.style.opacity = ring.style.opacity = "0"; });
    addEventListener("mouseenter", () => { dot.style.opacity = ring.style.opacity = "1"; });
  }

  /* ---------- Mobile: leaves on tap, swipe & scroll ---------- */
  if (isTouch) {
    let lastTouch = { x: innerWidth / 2, y: innerHeight * 0.6 };

    addEventListener("touchstart", e => {
      const t = e.touches[0];
      lastTouch = { x: t.clientX, y: t.clientY };
      for (let i = 0; i < 4; i++) sproutLeaf(t.clientX, t.clientY, true);
    }, { passive: true });

    addEventListener("touchmove", e => {
      const t = e.touches[0];
      const dist = Math.hypot(t.clientX - lastTouch.x, t.clientY - lastTouch.y);
      leafBudget += dist;
      if (leafBudget > 34) {
        leafBudget = 0;
        sproutLeaf(t.clientX, t.clientY);
      }
      lastTouch = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    /* Momentum scrolling (finger already lifted) still sprouts gently */
    let lastScrollLeaf = 0;
    addEventListener("scroll", () => {
      const now = performance.now();
      if (now - lastScrollLeaf < 160) return;
      lastScrollLeaf = now;
      sproutLeaf(
        lastTouch.x + (Math.random() - 0.5) * 60,
        Math.min(Math.max(lastTouch.y, 80), innerHeight - 80)
      );
    }, { passive: true });
  }
})();
