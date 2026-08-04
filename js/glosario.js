const contenedor = document.getElementById("mim-glosario");
const base = contenedor.dataset.base || "./../";

const canvas = document.getElementById("mim-glosario-canvas");
const ctx = canvas.getContext("2d");

// cached container size, kept in sync via ResizeObserver so the render
// loop never forces a layout reflow by reading getBoundingClientRect()
// on every frame
let contW = 0, contH = 0;

function actualizarTamano() {
  const rect = contenedor.getBoundingClientRect();
  contW = rect.width;
  contH = rect.height;
  canvas.width = contW;
  canvas.height = contH;
}
actualizarTamano();
new ResizeObserver(actualizarTamano).observe(contenedor);

// ===== LOAD YAML =====
fetch(`${base}datos/glosario.yaml`)
  .then(r => r.text())
  .then(t => init(jsyaml.load(t).glosario));

// ===== SYSTEM =====
// each glosario entry sits at a fixed grid position, like a
// constellation that doesn't drift on its own (same approach as
// js/audios.js) — blobs only move when dragged. clicking (without
// dragging) a blob opens the panel and cycles to its next definicion.
function init(glosario) {

  const blobs = [];
  let phase = Math.random() * Math.PI * 2;
  let noiseTime = Math.random() * 1000;

  // blob size in px, kept in sync with css/glosario.css .mim-glosario-blob size
  const blobSize = () => contW <= 600 ? 76 : 116;

  const posiciones = posicionesGrid(glosario.length, contW, contH);

  glosario.forEach((item, i) => {

    const el = document.createElement("div");
    el.className = "mim-glosario-blob";

    const half = blobSize() / 2;
    const blob = {
      el,
      x: posiciones[i].cx - half,
      y: posiciones[i].cy - half,
      homeX: posiciones[i].cx - half,
      homeY: posiciones[i].cy - half,
      vx: 0,
      vy: 0,
      noiseSeed: Math.random() * 1000,
      hue: hashColor(item.concepto),
      dragging: false,
      item,
      indiceDefinicion: 0
    };

    el.innerHTML = `
      <div class="mim-glosario-content">
        <div class="mim-glosario-concepto">${item.concepto}</div>
      </div>
    `;

    // drag, with a small movement/time threshold so a tap still
    // registers as a click and opens the definicion panel. coordinates
    // are converted from viewport-relative (clientX/Y) to
    // container-relative, since the container can sit anywhere on the
    // host page rather than always filling the whole viewport
    let ox, oy, startX, startY, startTime, moved;

    el.onpointerdown = e => {
      blob.dragging = true;
      const rect = contenedor.getBoundingClientRect();
      ox = (e.clientX - rect.left) - blob.x;
      oy = (e.clientY - rect.top) - blob.y;
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();
      moved = false;
    };

    addEventListener("pointermove", e => {
      if (!blob.dragging) return;
      const rect = contenedor.getBoundingClientRect();
      blob.x = (e.clientX - rect.left) - ox;
      blob.y = (e.clientY - rect.top) - oy;
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
    });

    addEventListener("pointerup", e => {
      if (!blob.dragging) return;
      blob.dragging = false;
      if (!moved && Date.now() - startTime < 500) {
        mostrarDefinicion(blob);
      }
    });

    contenedor.appendChild(el);
    blobs.push(blob);
  });

  function loop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    phase += 0.02;
    noiseTime += 0.004;

    const size = blobSize();
    const half = size / 2;
    const metaballR = size * 0.34;

    // gentle perlin-like drift around each blob's home slot, so the
    // constellation stays put overall but doesn't feel frozen
    blobs.forEach(b => {
      if (b.dragging) return;

      const nx = noise(b.noiseSeed, noiseTime) - 0.5;
      const ny = noise(b.noiseSeed + 500, noiseTime) - 0.5;
      b.vx += nx * 0.02;
      b.vy += ny * 0.02;

      // weak spring back to the home slot, keeps drift bounded
      b.vx += (b.homeX - b.x) * 0.002;
      b.vy += (b.homeY - b.y) * 0.002;

      b.vx *= 0.9;
      b.vy *= 0.9;

      b.x += b.vx;
      b.y += b.vy;
    });

    // bounce blobs off each other when they overlap
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i], c = blobs[j];
        const dx = (c.x + half) - (a.x + half);
        const dy = (c.y + half) - (a.y + half);
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0 && dist < size) {
          const overlap = (size - dist) / 2;
          const ux = dx / dist, uy = dy / dist;
          if (!a.dragging) { a.x -= ux * overlap; a.y -= uy * overlap; }
          if (!c.dragging) { c.x += ux * overlap; c.y += uy * overlap; }
        }
      }
    }

    blobs.forEach(b => {

      const s = 1 + Math.sin(phase + b.hue) * 0.08;

      const x = Number.isFinite(b.x) ? b.x : 0;
      const y = Number.isFinite(b.y) ? b.y : 0;
      const scale = Number.isFinite(s) ? s : 1;

      b.el.style.transform =
        `translate(${x}px, ${y}px) scale(${scale})`;

      // metaball field
      ctx.beginPath();
      ctx.arc(x + half, y + half, metaballR * scale, 0, Math.PI*2);
      ctx.fillStyle = `hsla(${b.hue}, 70%, 60%, 0.4)`;
      ctx.fill();
    });

    requestAnimationFrame(loop);
  }

  loop();
}

// ===== PANEL =====
function mostrarDefinicion(blob) {
  const item = blob.item;
  const definiciones = Object.values(item.definiciones);
  const total = definiciones.length;
  const indice = blob.indiceDefinicion % total;
  const def = definiciones[indice];
  blob.indiceDefinicion++;

  let html = `<h2>${item.pregunta}</h2>`;

  if (def.texto) {
    html += `<p class="mim-glosario-texto">${def.texto}</p>`;
  }

  if (def.imagen) {
    html += `<img class="mim-glosario-imagen" src="${base}glosario-imagenes/${def.imagen}" alt="${item.concepto}">`;
  }

  html += `<p class="mim-glosario-firma"><strong>${def.persona}</strong>${def.contexto ? ` — ${def.contexto}` : ''}</p>`;

  if (total > 1) {
    html += `<p class="mim-glosario-contador">${indice + 1} / ${total} — toca "${item.concepto}" de nuevo para ver otra</p>`;
  }

  document.getElementById("mim-glosario-panel-contenido").innerHTML = html;
  document.getElementById("mim-glosario-panel").classList.remove("mim-glosario-oculto");
}

function cerrarPanel() {
  document.getElementById("mim-glosario-panel").classList.add("mim-glosario-oculto");
}

document.getElementById("mim-glosario-cerrar").addEventListener("click", cerrarPanel);

addEventListener("keydown", e => {
  if (e.key === "Escape") cerrarPanel();
});

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

function hashColor(str) {
  let h = 0;
  for (let i=0;i<str.length;i++) {
    h = str.charCodeAt(i) + ((h<<5)-h);
  }
  return h % 360;
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
