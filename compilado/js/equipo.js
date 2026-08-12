const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
resize();
addEventListener("resize", resize);

// ===== LOAD YAML =====
fetch('./../datos/equipo.yaml')
  .then(r => r.text())
  .then(t => init(jsyaml.load(t).equipo));

// ===== SYSTEM =====
// Starts from a fixed grid layout (same approach as js/audios.js),
// then each blob wanders freely via slow noise-driven drift and
// bounces off the others — nothing pulls it back. Color is per
// person, for the same individual variety as glosario.
function init(equipo) {

  const blobs = [];
  let phase = Math.random() * Math.PI * 2;
  let noiseTime = Math.random() * 1000;

  // base blob size in px, kept in sync with css/equipo.css .blob size.
  // people with more text (name + departamento + institución) get a
  // bigger circle so their text isn't clipped by the circular overflow.
  const baseBlobSize = () => innerWidth <= 600 ? 84 : 130;

  const posiciones = posicionesGrid(equipo.length, innerWidth, innerHeight);

  equipo.forEach((p, i) => {

    const institucion = innerWidth <= 600
      ? p["institucion-corto"]
      : p["institucion-largo"];

    const base = baseBlobSize();
    const textLen = p.nombre.length + p.departamento.length + institucion.length;
    const size = Math.min(base * 2.2, base + Math.max(0, textLen - 20) * 2);
    const half = size / 2;

    const el = document.createElement("div");
    el.className = "blob";
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    const blob = {
      el,
      size,
      x: posiciones[i].cx - half,
      y: posiciones[i].cy - half,
      vx: 0,
      vy: 0,
      noiseSeed: Math.random() * 1000,
      hue: Math.random() * 360,
      dragging: false
    };

    el.innerHTML = `
      <div class="content">
        <div class="nombre">${p.nombre}</div>
        <div class="departamento">${p.departamento}</div>
        <div class="inst">${institucion}</div>
      </div>
    `;

    // drag
    let ox, oy;
    el.onpointerdown = e => {
      blob.dragging = true;
      ox = e.clientX - blob.x;
      oy = e.clientY - blob.y;
    };

    addEventListener("pointermove", e => {
      if (!blob.dragging) return;
      blob.x = clamp(e.clientX - ox, 0, innerWidth - blob.size);
      blob.y = clamp(e.clientY - oy, 0, innerHeight - blob.size);
    });

    addEventListener("pointerup", () => blob.dragging = false);

    document.body.appendChild(el);
    blobs.push(blob);
  });

  function loop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    phase += 0.02;
    noiseTime += 0.004;

    // gentle perlin-like drift, unbounded — blobs wander and stay
    // wherever they end up instead of homing back
    blobs.forEach(b => {
      if (b.dragging) return;

      const nx = noise(b.noiseSeed, noiseTime) - 0.5;
      const ny = noise(b.noiseSeed + 500, noiseTime) - 0.5;
      b.vx += nx * 0.02;
      b.vy += ny * 0.02;

      b.vx *= 0.9;
      b.vy *= 0.9;

      b.x += b.vx;
      b.y += b.vy;

      b.x = clamp(b.x, 0, innerWidth - b.size);
      b.y = clamp(b.y, 0, innerHeight - b.size);
    });

    // push blobs apart when they overlap — including out of the way
    // of whichever blob is being dragged, but the dragged blob itself
    // always stays exactly under the pointer
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i], c = blobs[j];
        const dx = (c.x + c.size/2) - (a.x + a.size/2);
        const dy = (c.y + c.size/2) - (a.y + a.size/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        const minDist = a.size/2 + c.size/2;
        if (dist > 0 && dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const ux = dx / dist, uy = dy / dist;
          if (!a.dragging) {
            a.x = clamp(a.x - ux * overlap, 0, innerWidth - a.size);
            a.y = clamp(a.y - uy * overlap, 0, innerHeight - a.size);
          }
          if (!c.dragging) {
            c.x = clamp(c.x + ux * overlap, 0, innerWidth - c.size);
            c.y = clamp(c.y + uy * overlap, 0, innerHeight - c.size);
          }
        }
      }
    }

    blobs.forEach(b => {

      const s = 1 + Math.sin(phase) * 0.08;
      const half = b.size / 2;
      const metaballR = b.size * 0.34;

      const x = Number.isFinite(b.x) ? b.x : 0;
      const y = Number.isFinite(b.y) ? b.y : 0;
      const scale = Number.isFinite(s) ? s : 1;

      b.el.style.transform =
        `translate(${x}px, ${y}px) scale(${scale})`;

      // metaball field
      ctx.beginPath();
      ctx.arc(x + half, y + half, metaballR * scale, 0, Math.PI*2);
      // light/translucent pastel fill, paired with black label text below:
      // worst case across every hue still clears ~12:1 (WCAG AA needs 4.5:1)
      // — it's fixed #ec6608/white label text that couldn't hit 4.5:1 here,
      // not the background itself
      ctx.fillStyle = `hsla(${b.hue}, 70%, 60%, 0.4)`;
      ctx.fill();
    });

    requestAnimationFrame(loop);
  }

  loop();
}

// ===== UTIL =====
// fixed grid layout, sized to fit n items (same approach as
// crearBlobs in js/audios.js), each cell gets a small random jitter
// so it doesn't look too mechanical
function posicionesGrid(n, width, height) {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const padding = 80;
  const cellWidth = (width - padding * 2) / cols;
  const cellHeight = (height - padding * 2) / rows;

  const posiciones = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    posiciones.push({
      cx: padding + cellWidth * (col + 0.5) + (Math.random() - 0.5) * cellWidth * 0.2,
      cy: padding + cellHeight * (row + 0.5) + (Math.random() - 0.5) * cellHeight * 0.2
    });
  }
  return posiciones;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// smooth 1D value noise (cheap perlin-like drift): interpolates
// between pseudo-random lattice values instead of jumping around
function noise(seed, t) {
  const i = Math.floor(t);
  const f = t - i;
  const a = pseudoRandom(seed + i);
  const b = pseudoRandom(seed + i + 1);
  const u = f * f * (3 - 2 * f);
  return a + u * (b - a);
}

function pseudoRandom(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}