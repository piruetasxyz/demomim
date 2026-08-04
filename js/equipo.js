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
// Fixed grid layout, like a constellation that doesn't drift on its
// own (same approach as js/audios.js) — blobs only move when dragged.
// Color is per person, for the same individual variety as glosario.
function init(equipo) {

  const blobs = [];
  let phase = Math.random() * Math.PI * 2;

  // blob size in px, kept in sync with css/equipo.css .blob size
  const blobSize = () => innerWidth <= 600 ? 64 : 100;

  const posiciones = posicionesGrid(equipo.length, innerWidth, innerHeight);

  equipo.forEach((p, i) => {

    const el = document.createElement("div");
    el.className = "blob";

    const size = blobSize();
    const half = size / 2;
    const blob = {
      el,
      x: posiciones[i].cx - half,
      y: posiciones[i].cy - half,
      hue: hashColor(p.nombre),
      dragging: false
    };

    const institucion = innerWidth <= 600
      ? p["institucion-corto"]
      : p["institucion-largo"];

    el.innerHTML = `
      <div class="content">
        <div class="nombre">${p.nombre}</div>
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
      blob.x = e.clientX - ox;
      blob.y = e.clientY - oy;
    });

    addEventListener("pointerup", () => blob.dragging = false);

    document.body.appendChild(el);
    blobs.push(blob);
  });

  function loop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    phase += 0.02;

    const size = blobSize();
    const half = size / 2;
    const metaballR = size * 0.34;

    blobs.forEach(b => {

      const s = 1 + Math.sin(phase) * 0.08;

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