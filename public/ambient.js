'use strict';
// KNOT ambient layer: a new random look on every page load.
// Randomized per visit: colour theme, glow blobs, which floating art appears and where,
// the drifting point network, the goal box's shape, pulse speed and the hero tilt.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  let s = seed;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const between = (a, b) => a + rnd() * (b - a);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

  const THEMES = [
    { name: 'dusk',    c: ['#5938B5', '#9B7BFF', '#2FB59A'] },
    { name: 'rose',    c: ['#5938B5', '#E0709A', '#FFB86B'] },
    { name: 'lagoon',  c: ['#176457', '#3CC4A6', '#8F7BFF'] },
    { name: 'sunrise', c: ['#C2417A', '#FFB347', '#7A5CE0'] },
    { name: 'ice',     c: ['#4F6BED', '#4FD1E8', '#C78BFF'] },
  ];
  const theme = pick(THEMES);
  const [g1, g2, g3] = shuffle(theme.c);
  const root = document.documentElement;
  root.style.setProperty('--g1', g1); root.style.setProperty('--g2', g2); root.style.setProperty('--g3', g3);
  root.style.setProperty('--pulse', between(2.6, 4.4).toFixed(2) + 's');
  root.style.setProperty('--spin', between(7, 13).toFixed(1) + 's');
  root.style.setProperty('--tilt', between(-15, -4).toFixed(1) + 'deg');
  root.dataset.theme = theme.name;
  // Random organic shape for the goal box (outer radii; inner = outer minus the 3px ring).
  const h = [0, 0, 0, 0].map(() => Math.round(between(16, 44))), v = [0, 0, 0, 0].map(() => Math.round(between(16, 44)));
  root.style.setProperty('--shape', `${h.join('px ')}px / ${v.join('px ')}px`);
  root.style.setProperty('--shape-in', `${h.map(n => n - 4).join('px ')}px / ${v.map(n => n - 4).join('px ')}px`);

  const layer = document.createElement('div');
  layer.className = 'ambient'; layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="blobs"></div><canvas class="net"></canvas><div class="floaters"></div>';
  document.body.prepend(layer);
  const blobs = layer.querySelector('.blobs'), floaters = layer.querySelector('.floaters'), canvas = layer.querySelector('.net');

  // Glow blobs
  const cols = [g1, g2, g3];
  const nBlobs = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < nBlobs; i++) {
    const b = document.createElement('i');
    const size = between(38, 70);
    b.style.cssText = `left:${between(-10, 90).toFixed(1)}%;top:${between(-10, 90).toFixed(1)}%;width:${size.toFixed(0)}vmax;height:${size.toFixed(0)}vmax;--c:${cols[i % 3]};--o:${between(.16, .3).toFixed(2)};--dx:${between(-18, 18).toFixed(1)}vw;--dy:${between(-16, 16).toFixed(1)}vh;--sc:${between(.85, 1.25).toFixed(2)};animation-duration:${between(16, 34).toFixed(1)}s;animation-delay:${(-rnd() * 20).toFixed(1)}s`;
    blobs.appendChild(b);
  }

  // Floating art (behind the content; placed outside the text area, small drift around its anchor)
  const ART = ['artists_palette', 'basketball', 'camera_video', 'headphones', 'heart', 'heart_chat', 'laptop', 'microphone', 'navigation_arrow', 'paper_plane', 'puzzle_piece', 'sparkle'];
  const chosen = shuffle(ART).slice(0, 8 + Math.floor(rnd() * 4));
  const els = chosen.map(name => {
    const w = document.createElement('div');
    const im = new Image(); im.src = `assets/art/float/${name}.png`; im.alt = ''; im.width = 180; im.height = 180; im.decoding = 'async';
    w.appendChild(im);
    const size = Math.round(between(54, 118));
    w.style.cssText = `width:${size}px;height:${size}px;--r:${between(-24, 24).toFixed(0)}deg;--dx:${between(-26, 26).toFixed(0)}px;--dy:${between(-34, 34).toFixed(0)}px;--rr:${between(-14, 14).toFixed(0)}deg;--d:${between(7, 15).toFixed(1)}s;--delay:${(-rnd() * 10).toFixed(1)}s`;
    w._size = size; floaters.appendChild(w); return w;
  });

  function avoidRect() {
    const home = document.querySelector('.hero-copy');
    const r = (home || document.getElementById('main')).getBoundingClientRect();
    const hdr = document.querySelector('.site-header').getBoundingClientRect();
    const art = document.querySelector('.hero-art'), ar = art && art.getBoundingClientRect(), list = ar && innerWidth >= 960 ? [{ l: ar.left + ar.width * .12, t: ar.top + ar.height * .12, r: ar.right - ar.width * .08, b: ar.bottom - ar.height * .08 }] : [];
    return list.concat([{ l: r.left - 28, t: r.top - 28, r: r.right + 28, b: r.bottom + 28 }, { l: hdr.left, t: -999, r: hdr.right, b: hdr.bottom }]);
  }
  function place() {
    const W = innerWidth, H = innerHeight, avoid = avoidRect(), placed = [];
    for (const w of els) {
      const sz = w._size; let ok = false;
      for (let i = 0; i < 60 && !ok; i++) {
        const x = between(8, W - sz - 8), y = between(70, H - sz - 8), box = { l: x - 22, t: y - 40, r: x + sz + 22, b: y + sz + 40 };
        const hit = avoid.some(a => box.l < a.r && box.r > a.l && box.t < a.b && box.b > a.t) || placed.some(p => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
        if (!hit) { w.style.left = x + 'px'; w.style.top = y + 'px'; placed.push(box); ok = true; }
      }
      w.hidden = !ok;
    }
  }
  const relayout = () => requestAnimationFrame(() => requestAnimationFrame(place));
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { place(); sizeCanvas(); }, 150); });
  addEventListener('hashchange', () => { relayout(); setTimeout(place, 350); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  relayout();

  // Point network
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, pts = [];
  function sizeCanvas() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduce.matches) draw(0);
  }
  const N = 26 + Math.floor(rnd() * 22);
  for (let i = 0; i < N; i++) pts.push({ x: rnd(), y: rnd(), vx: between(-.012, .012), vy: between(-.012, .012), r: between(1.6, 3.6), c: pick(cols), ph: rnd() * 6.28 });
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const link = Math.min(200, Math.max(120, W / 7));
    for (const p of pts) { p.x += p.vx * .016; p.y += p.vy * .016; if (p.x < -.05 || p.x > 1.05) p.vx *= -1; if (p.y < -.05 || p.y > 1.05) p.vy *= -1; }
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], dx = (a.x - b.x) * W, dy = (a.y - b.y) * H, d = Math.hypot(dx, dy);
      if (d < link) { ctx.globalAlpha = (1 - d / link) * .32; ctx.strokeStyle = a.c; ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke(); }
    }
    for (const p of pts) { ctx.globalAlpha = .55 + .3 * Math.sin(t / 900 + p.ph); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r * (1 + .25 * Math.sin(t / 700 + p.ph)), 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  let raf = 0;
  function loop(t) { draw(t); raf = requestAnimationFrame(loop); }
  function start() { cancelAnimationFrame(raf); if (reduce.matches || document.hidden) return; raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', start);
  reduce.addEventListener && reduce.addEventListener('change', () => { start(); if (reduce.matches) draw(0); });
  sizeCanvas(); start();
})();
