"use strict";

// Moving targets for the "Chyť" (bubbles) and "Balónky" (balloons) games.
const Sky = (() => {
  let raf = 0;
  let items = [];
  let opts = null;
  let box = { w: 0, h: 0 };
  let observer = null;

  function widthOf(text) {
    if (text.length > 3) return 168;
    if (text.length > 2) return 146;
    if (text.length > 1) return 124;
    return 100;
  }

  function sizeClass(text) {
    return "t" + Math.min(text.length, 4);
  }

  function paint(item, value) {
    item.value = value;
    item.w = widthOf(value);
    item.el.className = (opts.kind === "balloons" ? "balloon " : "bubble ") + sizeClass(value);
    item.face.className = "face " + opts.colorOf(value);
    item.face.textContent = opts.show(value);
    item.el.style.width = item.w + "px";
    item.el.setAttribute("aria-label", opts.show(value));
  }

  function make(value, y) {
    const el = document.createElement("button");
    el.type = "button";
    const face = document.createElement("span");
    el.append(face);
    if (opts.kind === "balloons") el.append(document.createElement("i"));
    const item = { el, face, value: "", w: 100, h: opts.kind === "balloons" ? 126 : 100, x: 0, y: 0, vx: 0, vy: 0 };
    paint(item, value);
    item.x = Math.random() * Math.max(1, box.w - item.w);
    if (opts.kind === "balloons") {
      item.y = y == null ? box.h : y;
      item.vx = (10 + Math.random() * 14) * (Math.random() < 0.5 ? -1 : 1);
      item.vy = -(36 + Math.random() * 18);
    } else {
      item.y = Math.random() * Math.max(1, box.h - item.h);
      item.vx = (40 + Math.random() * 50) * (Math.random() < 0.5 ? -1 : 1);
      item.vy = (30 + Math.random() * 40) * (Math.random() < 0.5 ? -1 : 1);
    }
    place(item);
    opts.el.appendChild(el);
    items.push(item);
    return item;
  }

  function place(item) {
    item.el.style.transform = "translate(" + item.x + "px," + item.y + "px)";
  }

  function randomValue() {
    return pickOne(opts.pool);
  }

  function separate() {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (opts.kind === "balloons") {
          const dx = b.x - a.x;
          const need = (a.w + b.w) / 2 + 10;
          if (Math.abs(dx) < need && Math.abs(b.y - a.y) < 120) {
            const push = (need - Math.abs(dx)) / 2;
            const dir = dx < 0 ? -1 : 1;
            a.x -= dir * push;
            b.x += dir * push;
          }
        } else {
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const need = (a.w + b.w) / 2 + 16;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < need) {
            const push = (need - dist) / 2;
            dx /= dist;
            dy /= dist;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
          }
        }
      }
    }
  }

  function step(last) {
    return (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      const slow = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.35 : 1;
      for (const item of items) {
        item.x += item.vx * dt * slow;
        item.y += item.vy * dt * slow;
        if (item.x < 0 || item.x > box.w - item.w) item.vx *= -1;
        item.x = Math.max(0, Math.min(box.w - item.w, item.x));
        if (opts.kind !== "balloons") {
          if (item.y < 0 || item.y > box.h - item.h) item.vy *= -1;
          item.y = Math.max(0, Math.min(box.h - item.h, item.y));
        }
      }
      separate();
      if (opts.kind === "balloons") {
        for (const item of items.filter((entry) => entry.y < -entry.h)) {
          remove(item);
          make(needsTarget() ? opts.target() : randomValue());
        }
      }
      items.forEach(place);
      raf = requestAnimationFrame(step(now));
    };
  }

  function needsTarget() {
    return !items.some((item) => item.value === opts.target());
  }

  function remove(item) {
    item.el.remove();
    items = items.filter((entry) => entry !== item);
  }

  function onTap(event) {
    const el = event.target.closest("button");
    const item = items.find((entry) => entry.el === el);
    if (item) opts.onTap(item);
  }

  return {
    // options: el, kind ("bubbles" | "balloons"), pool, target(), show(value), colorOf(value), onTap(item)
    start(options) {
      this.stop();
      opts = options;
      box = { w: opts.el.clientWidth, h: opts.el.clientHeight };
      observer = new ResizeObserver(() => {
        box = { w: opts.el.clientWidth, h: opts.el.clientHeight };
      });
      observer.observe(opts.el);
      opts.el.addEventListener("click", onTap);
      if (opts.kind === "balloons") {
        [0, 1, 2, 3].forEach((index) => make(index === 0 ? opts.target() : randomValue(), box.h - 20 - index * (box.h / 4)));
      } else {
        const count = opts.pool.some((value) => value.length > 1) ? 5 : 7;
        for (let i = 0; i < count; i++) make(i < 2 ? opts.target() : randomValue());
      }
      raf = requestAnimationFrame(step(performance.now()));
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (observer) observer.disconnect();
      observer = null;
      if (opts) opts.el.removeEventListener("click", onTap);
      items.forEach((item) => item.el.remove());
      items = [];
      opts = null;
    },
    pause() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    hit(item) {
      remove(item);
      make(randomValue(), opts.kind === "balloons" ? box.h : null);
    },
    // Make sure the new target is visible: two bubbles, or one balloon.
    showTarget() {
      const target = opts.target();
      const need = opts.kind === "balloons" ? 1 : 2;
      let have = items.filter((item) => item.value === target).length;
      const others = items.filter((item) => item.value !== target);
      if (opts.kind === "balloons") others.sort((a, b) => b.y - a.y);
      for (const item of others) {
        if (have >= need) break;
        paint(item, target);
        have++;
      }
    },
    shake(item) {
      item.face.classList.remove("shake");
      void item.face.offsetWidth;
      item.face.classList.add("shake");
    }
  };
})();
