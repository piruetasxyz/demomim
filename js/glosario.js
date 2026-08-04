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
// each glosario entry floats as a blob, like equipo. clicking (without
// dragging) a blob opens the panel and cycles to its next definicion.
function init(glosario) {

  const blobs = [];
  let phase = Math.random() * Math.PI * 2;

  // blob size in px, kept in sync with css/glosario.css .mim-glosario-blob size
  const blobSize = () => contW <= 600 ? 76 : 116;

  glosario.forEach(item => {

    const el = document.createElement("div");
    el.className = "mim-glosario-blob";

    const blob = {
      el,
      x: contW/2 + (Math.random() - 0.5) * 60,
      y: contH/2 + (Math.random() - 0.5) * 60,
      vx: 0,
      vy: 0,
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

    // shared center, recomputed every frame so it adapts to any
    // container size (desktop or mobile) and to resizes
    const cx = contW / 2;
    const cy = contH / 2;

    const size = blobSize();
    const half = size / 2;
    const metaballR = size * 0.34;

    // soft rectangular walls, padded so blobs (and their text) stay
    // fully inside the container. b.x/b.y are the blob's top-left corner, so the
    // right/bottom bounds must subtract the full blob size, not just
    // half of it, or the far edge can drift past the container.
    const padding = 50;
    const left = padding;
    const right = contW - size - padding;
    const top = padding;
    const bottom = contH - size - padding;

    blobs.forEach(b => {

      if (!b.dragging) {

        // attraction to the shared center (softer, so repulsion can
        // spread people out further instead of collapsing into a ring)
        let dx = cx - b.x;
        let dy = cy - b.y;

        b.vx += dx * 0.00035;
        b.vy += dy * 0.00035;

        // orbit, ties everyone into one rotating, interconnected mass
        // (weaker than before, so it doesn't force a tight ring)
        b.vx += -dy * 0.00025;
        b.vy += dx * 0.00025;

        // repulsion between all concepts
        blobs.forEach(o => {
          if (b === o) return;

          let dx = o.x - b.x;
          let dy = o.y - b.y;
          let d = Math.sqrt(dx*dx + dy*dy);
          if (d < 20) d = 20;

          let rep = -22 / (d*d);

          b.vx += rep * dx;
          b.vy += rep * dy;
        });

        b.vx *= 0.95;
        b.vy *= 0.95;

        // speed cap: nothing is allowed to spin off at high speed
        const speed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
        const maxSpeed = 3.5;
        if (speed > maxSpeed) {
          b.vx = (b.vx / speed) * maxSpeed;
          b.vy = (b.vy / speed) * maxSpeed;
        }

        b.x += b.vx;
        b.y += b.vy;

        // soft walls: gently push back in, proportional to how far
        // past the edge the blob is, instead of a hard circular clamp
        if (b.x < left) {
          b.vx += (left - b.x) * 0.06;
        } else if (b.x > right) {
          b.vx -= (b.x - right) * 0.06;
        }

        if (b.y < top) {
          b.vy += (top - b.y) * 0.06;
        } else if (b.y > bottom) {
          b.vy -= (b.y - bottom) * 0.06;
        }

        // hard safety clamp: when many blobs crowd the same edge,
        // repulsion between them can overpower the soft push above,
        // so pin the position at the wall (no bounce, just a stop)
        // to guarantee nothing (or its text) ever leaves the container
        if (b.x < left) { b.x = left; if (b.vx < 0) b.vx = 0; }
        else if (b.x > right) { b.x = right; if (b.vx > 0) b.vx = 0; }

        if (b.y < top) { b.y = top; if (b.vy < 0) b.vy = 0; }
        else if (b.y > bottom) { b.y = bottom; if (b.vy > 0) b.vy = 0; }
      }

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
function hashColor(str) {
  let h = 0;
  for (let i=0;i<str.length;i++) {
    h = str.charCodeAt(i) + ((h<<5)-h);
  }
  return h % 360;
}
