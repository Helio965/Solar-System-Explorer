/*
 * Solar System Explorer
 *
 * The scene is real CSS 3D: every body is placed at its own depth
 * (translateZ) inside a preserve-3d container, and a single "camera"
 * transform slides that container along Z. JavaScript only drives the camera
 * while a trip is in progress (requestAnimationFrame stops as soon as the
 * camera settles); everything else (lighting, orbits, moons, staged reveals)
 * lives in CSS.
 */
(function () {
  "use strict";

  if (typeof PLANETS === "undefined") return;

  /* ------------------------------------------------------------ Elements */

  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const space = app.querySelector(".space");
  const system = $("system");
  const list = $("planet-list");
  const starLayers = Array.from(app.querySelectorAll(".stars"));
  const flyby = $("flyby");
  const flybyEyebrow = $("flyby-eyebrow");
  const flybyName = $("flyby-name");
  const headline = $("headline");
  const headlineEyebrow = $("headline-eyebrow");
  const headlineName = $("headline-name");
  const detailsText = $("details-text");
  const readMore = $("read-more");
  const announcer = $("announcer");
  const panel = $("planet-panel");
  const panelClose = $("panel-close");

  /* ------------------------------------------------------------ Settings */

  const N = PLANETS.length;
  const DEFAULT_PLANET = "earth";
  const rootStyle = getComputedStyle(document.documentElement);
  const PERSPECTIVE = parseFloat(getComputedStyle(space).perspective) || 1000;
  const NEXT_SCALE = parseFloat(rootStyle.getPropertyValue("--next-scale")) || 0.27;
  // Distance between two neighbouring bodies, chosen so that the next planet
  // appears at NEXT_SCALE of its real size: P / (P + GAP) = NEXT_SCALE.
  const GAP = PERSPECTIVE * (1 / NEXT_SCALE - 1);
  const MOON_DRIFT = 0.022; // in planet radii, along the orbit

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = () => motionQuery.matches;

  /* ------------------------------------------------------------- Helpers */

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const round3 = (v) => Math.round(v * 1000) / 1000;

  /** Same curve maths as CSS cubic-bezier(). */
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const err = sampleX(t) - x;
        if (Math.abs(err) < 1e-6) return sampleY(t);
        const d = slopeX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= err / d;
      }
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        if (sampleX(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
      return sampleY(t);
    };
  }

  // Slow start, long, gentle arrival: the camera "lands" on the planet.
  const easeTravel = cubicBezier(0.55, 0, 0.16, 1);

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  const texture = (p) => `assets/planets/${p.id}.webp`;

  /* --------------------------------------------------------- Build scene */

  function createBody(p, index) {
    const el = make("div", `body body--${p.id}`);
    el.style.setProperty("--scale", p.scale);
    el.style.setProperty("--rim", p.rim);
    el.style.setProperty("--glow", p.glow);
    el.style.setProperty("--gs", p.glowStrength);
    el.style.transform = `translate3d(0, 0, ${(-index * GAP).toFixed(1)}px)`;

    const atmosphere = make("div", "atmosphere");
    const satellites = make("div", "satellites");

    const moons = p.moons.map((m, k) => {
      const orbit = make("span", `orbit${m.minor ? " is-minor" : ""}`);
      orbit.style.setProperty("--i", k);

      const moon = make("div", `moon moon--${m.id}${m.minor ? " is-minor" : ""}`);
      moon.style.setProperty("--i", k);
      moon.style.setProperty("--ms", m.size);
      moon.style.setProperty("--drift-time", `${24 + k * 7}s`);
      moon.style.setProperty("--drift-delay", `${-(k * 9 + 4)}s`);

      const moonBody = make("div", "moon__body");
      const sphere = make("div", "moon__sphere");
      const label = make("div", "moon__label");
      label.append(make("span", "moon__eyebrow", m.diameter), make("span", "moon__name", m.name));
      moonBody.append(sphere, label);
      moon.append(moonBody);
      return { data: m, el: moon, orbit };
    });

    moons.forEach((m) => satellites.append(m.orbit));
    moons.forEach((m) => satellites.append(m.el));

    const sphere = make("div", "sphere");
    sphere.append(make("div", "sphere__surface"), make("div", "sphere__shade"));

    const label = make("div", "body__label");
    label.append(make("span", "body__label-eyebrow", p.type), make("span", "body__label-name", p.name));

    el.append(atmosphere);
    if (p.rings) el.append(ringHalf("back"));
    el.append(satellites, sphere);
    if (p.rings) el.append(ringHalf("front"));
    el.append(label);
    system.append(el);

    return { el, label, moons, alpha: -1, labelAlpha: -1 };
  }

  function ringHalf(side) {
    const half = make("div", `rings rings--${side}`);
    half.append(make("div", "rings__disc"));
    return half;
  }

  function createOption(p, index, order) {
    const li = make("li", "selector__item");
    li.style.setProperty("--i", order);

    const label = make("label", `planet-option planet-option--${p.id}`);
    label.style.setProperty("--c", p.accent);
    label.style.setProperty("--glow", p.glow);

    const input = make("input", "planet-option__input");
    input.type = "radio";
    input.name = "planet";
    input.value = p.id;

    const mark = make("span", "planet-option__mark");
    mark.setAttribute("aria-hidden", "true");
    const thumb = make("span", "planet-option__thumb");
    thumb.style.backgroundImage = `url("assets/planets/thumbs/${p.id}.webp")`;
    mark.append(thumb, make("span", "planet-option__ring"));

    const text = make("span", "planet-option__text");
    const au = make("span", "planet-option__au", p.au);
    au.append(make("span", "sr-only", " from the Sun"));
    text.append(make("span", "planet-option__name", p.name), au);

    label.append(input, mark, text);
    li.append(label);

    input.addEventListener("change", () => {
      if (input.checked) travel(index);
    });

    return { li, input };
  }

  const bodies = PLANETS.map(createBody);
  // The reference lists the outermost world first, Mercury at the bottom.
  const options = PLANETS.map((p, i) => createOption(p, i, N - 1 - i));
  for (let i = N - 1; i >= 0; i--) list.append(options[i].li);

  /* ---------------------------------------------------- Moons and orbits */

  const LABEL_ROOM = 44; // px kept free around a moon for its label

  /**
   * Each moon is given a position (in planet radii). From it we derive the
   * ellipse it sits on and the tangent along which it slowly drifts.
   *
   * The positions are then fitted to the viewport: moons (and their labels)
   * must stay on screen, out from under the vertical menu, and above the
   * planet's limb. A mild squeeze is enough on most screens; when the screen
   * is much narrower than the design, the moons are spread over even slots.
   */
  function layoutMoons() {
    const spread = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--moon-spread")) || 1;
    const halfW = window.innerWidth / 2;
    const menu = app.querySelector(".selector").getBoundingClientRect();
    const menuOnLeft = menu.height > menu.width;
    const leftRoom = halfW - (menuOnLeft ? menu.right + 36 : 26);
    const rightRoom = halfW - 26;

    bodies.forEach((b) => {
      const R = b.el.offsetWidth / 2;
      const moons = b.moons.filter((m) => getComputedStyle(m.el).display !== "none");
      if (!R || !moons.length) return;

      const pad = (m) => (m.data.size * R) / 2 + LABEL_ROOM;
      const room = (m, x) => Math.max(0, (x < 0 ? leftRoom : rightRoom) - pad(m)) / R; // in radii

      let k = 1;
      moons.forEach((m) => {
        const x = m.data.pos[0] * spread;
        const limit = room(m, x);
        if (Math.abs(x) > limit) k = Math.min(k, limit / Math.abs(x));
      });

      const xs = new Map();
      if (k >= 0.75) {
        moons.forEach((m) => xs.set(m, m.data.pos[0] * spread * k));
      } else {
        // Too narrow to keep the composition: even slots, original left-to-right order.
        const sorted = [...moons].sort((p, q) => p.data.pos[0] - q.data.pos[0]);
        const n = sorted.length;
        sorted.forEach((m, i) => {
          const side = n === 1 ? Math.sign(m.data.pos[0]) || 1 : -1 + (2 * i) / (n - 1);
          xs.set(m, side * room(m, side));
        });
      }

      moons.forEach((m) => {
        const x = xs.get(m);
        const clearance = m.data.size / 2 + 0.05;
        const y = Math.min(m.data.pos[1], -Math.sqrt(Math.max(0, 1 - x * x)) - clearance);
        placeMoon(m, x, y);
      });
    });
  }

  /** Put a moon at (x, y) and derive the orbit ellipse passing through it. */
  function placeMoon({ data, el, orbit }, x, y) {
    const f = data.flat;
    const rad = (data.tilt * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    // Undo the ellipse rotation, then solve x = a·cosθ, y = a·f·sinθ.
    const xr = x * c + y * s;
    const yr = -x * s + y * c;
    const a = Math.hypot(xr, yr / f);
    const theta = Math.atan2(yr / f, xr);
    // Tangent at that point (back in screen space) for the slow drift.
    const tx0 = -Math.sin(theta) * a;
    const ty0 = Math.cos(theta) * a * f;
    const tx = tx0 * c - ty0 * s;
    const ty = tx0 * s + ty0 * c;
    const len = Math.hypot(tx, ty) || 1;

    el.style.setProperty("--mx", x.toFixed(4));
    el.style.setProperty("--my", y.toFixed(4));
    el.style.setProperty("--dx", ((tx / len) * MOON_DRIFT).toFixed(4));
    el.style.setProperty("--dy", ((ty / len) * MOON_DRIFT).toFixed(4));
    orbit.style.setProperty("--a", a.toFixed(4));
    orbit.style.setProperty("--f", f);
    orbit.style.setProperty("--t", `${data.tilt}deg`);
  }

  /* -------------------------------------------------------------- Camera */

  const state = {
    cam: 0, // camera position, measured in "planets" along the depth axis
    current: -1, // planet the camera is docked at
    target: 0,
    arrived: false,
    docked: false, // the title has landed, even if the camera is still settling
    traveling: false,
    anim: null,
    raf: 0,
    startCam: 0,
    introMask: -1, // during the intro, bodies before this index stay hidden
    flybyIndex: -1,
    lastTime: 0,
    lastCam: 0,
    speed: 0,
    fadeTimer: 0,
    heroTimer: 0,
  };

  /** Body opacity as a function of its depth offset from the camera. */
  function bodyAlpha(o) {
    if (o >= 0) return o <= 1 ? 1 : 1 - smoothstep(1, 1.7, o);
    return 1 - smoothstep(0, 0.2, -o); // flying past it: fade out quickly
  }

  function render() {
    const cam = state.cam;
    system.style.transform = `translate3d(0, 0, ${(cam * GAP).toFixed(2)}px)`;

    for (let i = 0; i < N; i++) {
      const b = bodies[i];
      const o = i - cam;
      const a = i < state.introMask ? 0 : round3(bodyAlpha(o));
      if (a !== b.alpha) {
        b.alpha = a;
        b.el.style.opacity = a;
        b.el.style.visibility = a > 0 ? "visible" : "hidden";
      }
      // The small label only shows while a body waits in the distance.
      const la = round3(smoothstep(0.55, 0.9, o) * (1 - smoothstep(1.2, 1.55, o)));
      if (la !== b.labelAlpha) {
        b.labelAlpha = la;
        b.label.style.opacity = la;
      }
    }
  }

  /** Big centred title for the planet the camera is flying past or towards. */
  function renderFlyby() {
    const lo = Math.min(state.startCam, state.target);
    const hi = Math.max(state.startCam, state.target);
    let best = -1;
    let bestAlpha = 0;

    for (let i = 0; i < N; i++) {
      if (i < state.introMask) continue;
      const d = Math.abs(i - state.cam);
      let a = 0;
      if (i === state.target) a = 1 - smoothstep(0.3, 0.65, d);
      else if (i > lo && i < hi && Math.abs(i - state.startCam) > 0.01) a = 1 - smoothstep(0.06, 0.35, d);
      if (a > bestAlpha) {
        bestAlpha = a;
        best = i;
      }
    }

    if (best !== -1 && best !== state.flybyIndex) {
      state.flybyIndex = best;
      flybyEyebrow.textContent = PLANETS[best].type;
      flybyName.textContent = PLANETS[best].name;
    }
    flyby.style.opacity = round3(bestAlpha);
  }

  /** Stars stretch slightly with the camera's speed: a hint of parallax. */
  function renderStars(now) {
    const dt = Math.max(1, now - state.lastTime);
    const v = (Math.abs(state.cam - state.lastCam) / dt) * 1000;
    state.lastTime = now;
    state.lastCam = state.cam;
    state.speed += (v - state.speed) * 0.2;
    const k = Math.min(state.speed, 6);
    starLayers.forEach((layer, i) => {
      const s = 1 + k * (i === 0 ? 0.012 : 0.03);
      layer.style.transform = `scale(${s.toFixed(4)})`;
    });
  }

  function tick(now) {
    const anim = state.anim;
    if (!anim) return;
    const t = clamp((now - anim.start) / anim.duration, 0, 1);
    state.cam = anim.from + (anim.to - anim.from) * easeTravel(t);
    render();
    renderStars(now);
    if (!state.docked) {
      renderFlyby();
      // The ease-out tail is almost imperceptible: land the title as soon as
      // the planet has visually settled instead of waiting for the last pixel.
      if (t > 0.5 && Math.abs(anim.to - state.cam) < 0.02) {
        state.docked = true;
        arrive(anim.to, true);
      }
    }
    if (t >= 1) {
      finishTravel();
      return;
    }
    state.raf = requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------- Trips */

  function travel(to, opts = {}) {
    to = clamp(Math.round(to), 0, N - 1);
    if (!opts.force) {
      if (app.classList.contains("is-loading")) return; // the intro has not started yet
      if (state.traveling && to === state.target) return;
      if (!state.traveling && state.arrived && to === state.current) return;
    }

    closePanel(true);
    selectOption(to);
    setAccent(PLANETS[to]);

    const wasDocked = state.arrived;
    depart();

    if (reducedMotion()) {
      jumpTo(to);
      return;
    }

    cancelAnimationFrame(state.raf);
    clearTimeout(state.heroTimer);
    const from = state.cam;
    const steps = Math.abs(to - from);
    const duration = opts.duration || clamp(1150 + 470 * steps, 1100, 4400);
    const delay = opts.delay != null ? opts.delay : wasDocked ? 260 : 0;
    const now = performance.now();

    state.startCam = from;
    state.target = to;
    state.traveling = true;
    state.docked = false;
    state.anim = { from, to, duration, start: now + delay };
    state.lastTime = now;
    state.lastCam = from;
    app.classList.add("is-traveling");
    state.raf = requestAnimationFrame(tick);
  }

  function step(direction) {
    const base = state.traveling ? state.target : state.current;
    const next = clamp(base + direction, 0, N - 1);
    if (next !== base) travel(next);
  }

  function depart() {
    if (!state.arrived) return;
    state.arrived = false;
    app.classList.remove("is-arrived");
    app.classList.add("is-departing");
    bodies[state.current].el.classList.remove("is-current");
  }

  function finishTravel() {
    state.traveling = false;
    state.anim = null;
    state.introMask = -1;
    state.speed = 0;
    app.classList.remove("is-traveling");
    starLayers.forEach((layer) => (layer.style.transform = ""));
    if (!state.docked) arrive(state.target, true);
    state.docked = true;
  }

  /** Reduced motion: a short crossfade instead of the flight. */
  function jumpTo(to) {
    cancelAnimationFrame(state.raf);
    clearTimeout(state.fadeTimer);
    state.traveling = true;
    state.target = to;
    app.classList.add("is-fading");
    state.fadeTimer = setTimeout(() => {
      state.cam = to;
      state.introMask = -1;
      state.traveling = false;
      state.anim = null;
      render();
      flyby.style.opacity = "0";
      app.classList.remove("is-fading", "is-traveling");
      arrive(to, false);
    }, 340);
  }

  function arrive(index, fromHero) {
    const p = PLANETS[index];
    state.current = index;
    state.arrived = true;
    fillContent(p);

    if (fromHero) {
      // Swap the flying title for the real headline at the exact same spot,
      // then let the headline glide down onto the planet.
      headline.classList.add("no-transition", "is-hero");
      app.classList.remove("is-departing", "is-loading");
      flyby.style.opacity = "0";
      void headline.offsetWidth;
      headline.classList.remove("no-transition");
      state.heroTimer = setTimeout(() => headline.classList.remove("is-hero"), 140);
    } else {
      headline.classList.remove("is-hero");
      app.classList.remove("is-departing", "is-loading");
    }

    app.classList.remove("is-intro");
    app.classList.add("is-arrived");
    bodies[index].el.classList.add("is-current");

    document.title = `${p.name} · Solar System Explorer`;
    announcer.textContent = `${p.type} ${p.name}. ${p.description}`;
    try {
      history.replaceState(null, "", `#${p.id}`);
    } catch {
      /* file:// or sandboxed frames may refuse it: not important */
    }
  }

  function fillContent(p) {
    headlineEyebrow.textContent = p.type;
    headlineName.textContent = p.name;
    detailsText.textContent = p.description;
    readMore.setAttribute("aria-label", `Read more about ${p.name}`);
  }

  function selectOption(index) {
    options.forEach((o, i) => {
      o.input.checked = i === index;
    });
    // Keep the active item visible in the horizontal (mobile) strip.
    const item = options[index].li;
    if (list.scrollWidth > list.clientWidth + 4) {
      const left = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
      list.scrollTo({ left, behavior: reducedMotion() ? "auto" : "smooth" });
    }
  }

  function setAccent(p) {
    app.style.setProperty("--accent", p.accent);
    app.style.setProperty("--glow", p.glow);
  }

  /* --------------------------------------------------------------- Panel */

  let panelTimer = 0;

  function fillPanel(p) {
    panel.style.setProperty("--c", p.accent);
    panel.style.setProperty("--glow", p.glow);
    panel.style.setProperty("--rim", p.rim);
    $("panel-planet").style.backgroundImage = `url("${texture(p)}")`;
    $("panel-eyebrow").textContent = p.category;
    $("panel-title").textContent = p.name;

    const body = $("panel-body");
    body.replaceChildren(...p.details.map((text) => make("p", null, text)));

    const stats = $("panel-stats");
    stats.replaceChildren(
      ...Object.entries(p.stats).map(([key, value]) => {
        const row = make("div", "panel__stat");
        row.append(make("dt", null, STAT_LABELS[key] || key), make("dd", null, value));
        return row;
      }),
    );

    const moonList = $("panel-moons");
    const moonTitle = $("panel-moons-title");
    if (p.moons.length) {
      moonTitle.textContent = p.moons.length === 1 ? "Natural satellite" : "Main moons";
      moonList.replaceChildren(
        ...p.moons.map((m) => {
          const li = make("li", "panel__moon");
          const sphere = make("span", "panel__moon-sphere");
          sphere.setAttribute("aria-hidden", "true");
          sphere.style.backgroundImage = `url("assets/moons/${m.id}.webp")`;
          li.append(sphere, make("span", "panel__moon-name", m.name), make("span", "panel__moon-size", m.diameter));
          return li;
        }),
      );
    } else {
      moonTitle.textContent = "Moons";
      moonList.replaceChildren(make("li", "panel__moon panel__moon--none", `${p.name} has no natural satellites.`));
    }

    $("panel-fact").textContent = p.fact;
  }

  function openPanel() {
    if (!state.arrived || panel.open) return;
    clearTimeout(panelTimer);
    fillPanel(PLANETS[state.current]);
    if (typeof panel.showModal === "function") panel.showModal();
    else panel.setAttribute("open", "");
    panel.querySelector(".panel__inner").scrollTop = 0;
    requestAnimationFrame(() => panel.classList.add("is-open"));
    app.classList.add("is-panel-open");
  }

  function closePanel(immediate) {
    if (!panel.open) return;
    panel.classList.remove("is-open");
    app.classList.remove("is-panel-open");
    clearTimeout(panelTimer);
    const done = () => {
      if (panel.classList.contains("is-open")) return;
      if (typeof panel.close === "function") panel.close();
      else panel.removeAttribute("open");
    };
    if (immediate || reducedMotion()) done();
    else panelTimer = setTimeout(done, 460);
  }

  readMore.addEventListener("click", openPanel);
  panelClose.addEventListener("click", () => closePanel());
  panel.addEventListener("cancel", (e) => {
    e.preventDefault();
    closePanel();
  });
  panel.addEventListener("click", (e) => {
    if (e.target === panel) closePanel();
  });
  panel.addEventListener("close", () => {
    if (document.activeElement === document.body && state.arrived) readMore.focus({ preventScroll: true });
  });

  /* --------------------------------------------------------------- Input */

  document.addEventListener("keydown", (e) => {
    if (panel.open || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    // Radios already move with the arrow keys: let the browser handle them.
    if (t && t.closest && t.closest(".selector")) return;

    switch (e.key) {
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        step(1);
        break;
      case "ArrowDown":
      case "PageDown":
        e.preventDefault();
        step(-1);
        break;
      default:
        if (/^[1-9]$/.test(e.key) && Number(e.key) <= N) travel(Number(e.key) - 1);
    }
  });

  // One wheel gesture (a burst of events, including trackpad inertia) = one step.
  let wheelAccum = 0;
  let wheelUsed = false;
  let wheelTimer = 0;
  app.addEventListener(
    "wheel",
    (e) => {
      if (panel.open) return;
      e.preventDefault();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelUsed = false;
        wheelAccum = 0;
      }, 200);
      if (wheelUsed) return;
      wheelAccum += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (Math.abs(wheelAccum) >= 30) {
        wheelUsed = true;
        step(wheelAccum > 0 ? 1 : -1);
      }
    },
    { passive: false },
  );

  // Swipe up travels outwards, swipe down travels towards the Sun.
  let touch = null;
  app.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1 || e.target.closest(".selector, button")) {
        touch = null;
        return;
      }
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    { passive: true },
  );
  app.addEventListener(
    "touchend",
    (e) => {
      if (!touch) return;
      const dx = e.changedTouches[0].clientX - touch.x;
      const dy = e.changedTouches[0].clientY - touch.y;
      touch = null;
      if (Math.abs(dy) > 46 && Math.abs(dy) > Math.abs(dx) * 1.3) step(dy < 0 ? 1 : -1);
    },
    { passive: true },
  );

  window.addEventListener("hashchange", () => {
    const i = indexFromHash();
    if (i >= 0) travel(i);
  });

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layoutMoons);
  });

  /* ---------------------------------------------------------------- Boot */

  function indexFromHash() {
    const id = decodeURIComponent(location.hash.slice(1)).toLowerCase();
    return PLANETS.findIndex((p) => p.id === id);
  }

  function preload(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      if (img.decode) img.decode().then(resolve, resolve);
      else {
        img.onload = resolve;
        img.onerror = resolve;
      }
    });
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function boot() {
    layoutMoons();

    const fromHash = indexFromHash();
    const start = fromHash >= 0 ? fromHash : PLANETS.findIndex((p) => p.id === DEFAULT_PLANET);
    selectOption(start);
    setAccent(PLANETS[start]);
    state.target = start;

    const ready = Promise.all([
      document.fonts ? document.fonts.ready : null,
      preload(texture(PLANETS[start])),
      start + 1 < N ? preload(texture(PLANETS[start + 1])) : null,
    ]);

    Promise.race([ready, wait(2200)]).then(() => {
      layoutMoons(); // the menu's final width depends on the web font
      if (reducedMotion()) {
        state.cam = start;
        render();
        arrive(start, false);
      } else {
        // Intro: the camera starts out in the dark and flies in to the planet.
        state.cam = start - 1.5;
        state.introMask = start;
        render();
        app.classList.add("is-intro");
        app.classList.remove("is-loading");
        travel(start, { force: true, duration: 3400, delay: 120 });
      }

      // Warm up the remaining textures while the user looks around.
      const rest = () => PLANETS.forEach((p) => preload(texture(p)));
      if ("requestIdleCallback" in window) requestIdleCallback(rest, { timeout: 4000 });
      else setTimeout(rest, 2500);
    });
  }

  // Small hook for automated tests and the curious.
  window.SolarExplorer = {
    go(id) {
      const i = typeof id === "number" ? id : PLANETS.findIndex((p) => p.id === id);
      if (i >= 0) travel(i);
    },
    get current() {
      return state.arrived ? PLANETS[state.current].id : null;
    },
    get traveling() {
      return state.traveling;
    },
  };

  boot();
})();
