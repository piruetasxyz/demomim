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
// each glosario entry starts at a fixed grid position (same approach
// as js/audios.js), then wanders freely via slow noise-driven drift
// and bounces off other blobs — nothing pulls it back. clicking
// (without dragging) a blob opens a comic-style speech bubble that
// tracks it and shows a random definicion.
function init(glosario) {

  const blobs = [];
  let phase = Math.random() * Math.PI * 2;
  let noiseTime = Math.random() * 1000;

  // the one blob currently "talking" (bubble open), or null
  let blobAbierto = null;

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
      vx: 0,
      vy: 0,
      noiseSeed: Math.random() * 1000,
      hue: hashColor(item.concepto),
      dragging: false,
      abierta: false,
      item,
      indiceActual: -1
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
      const size = blobSize();
      blob.x = clamp((e.clientX - rect.left) - ox, 0, contW - size);
      blob.y = clamp((e.clientY - rect.top) - oy, 0, contH - size);
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
    });

    addEventListener("pointerup", e => {
      if (!blob.dragging) return;
      blob.dragging = false;
      if (!moved && Date.now() - startTime < 500) {
        // same blob tapped again -> new random definicion, still open.
        // a different blob tapped -> old bubble closes, this one opens.
        // either way, mostrarDefinicion() is the single entry point.
        mostrarDefinicion(blob);
      }
    });

    contenedor.appendChild(el);
    blobs.push(blob);
  });

  // tapping anywhere that isn't a blob or the bubble itself closes it
  contenedor.addEventListener("pointerdown", e => {
    if (!blobAbierto) return;
    if (e.target.closest(".mim-glosario-blob")) return;
    if (e.target.closest("#mim-glosario-burbuja")) return;
    cerrarBurbuja();
  });

  // ===== BUBBLE =====
  const burbuja = document.getElementById("mim-glosario-burbuja");
  const burbujaContenido = document.getElementById("mim-glosario-burbuja-contenido");
  const burbujaDesborda = document.getElementById("mim-glosario-burbuja-desborda");

  // shows a "seguir leyendo" hint while there's more text below the
  // visible area — native scrollbars alone aren't a reliable enough
  // cue (macOS/trackpad browsers keep them invisible until touched)
  function actualizarDesborda() {
    const quedaTexto = burbujaContenido.scrollTop + burbujaContenido.clientHeight
      < burbujaContenido.scrollHeight - 2;
    burbujaDesborda.classList.toggle("mim-glosario-visible", quedaTexto);
  }
  burbujaContenido.addEventListener("scroll", actualizarDesborda);

  function mostrarDefinicion(blob) {
    const item = blob.item;
    const definiciones = Object.values(item.definiciones);
    const total = definiciones.length;
    const indice = elegirIndiceAleatorio(total, blob.indiceActual);
    blob.indiceActual = indice;
    const def = definiciones[indice];

    let html = `<h2>${item.pregunta}</h2>`;

    if (def.texto) {
      html += `<p class="mim-glosario-texto">${def.texto}</p>`;
    }

    if (def.imagen) {
      html += `<img class="mim-glosario-imagen" src="${base}glosario-imagenes/${def.imagen}" alt="${item.concepto}">`;
    }

    html += `<p class="mim-glosario-firma"><strong>${def.persona}</strong>${def.contexto ? ` — ${def.contexto}` : ''}</p>`;

    if (total > 1) {
      html += `<p class="mim-glosario-contador">${indice + 1} / ${total} — toca "${item.concepto}" de nuevo para otra</p>`;
    }

    burbujaContenido.innerHTML = html;
    burbujaContenido.scrollTop = 0;
    burbuja.style.setProperty("--mim-glosario-burbuja-color", `hsl(${blob.hue}, 70%, 45%)`);

    if (blobAbierto && blobAbierto !== blob) blobAbierto.abierta = false;
    blob.abierta = true;
    blobAbierto = blob;

    burbuja.classList.remove("mim-glosario-oculto");
    posicionarBurbuja(blob);
    actualizarDesborda();

    // la imagen puede cambiar la altura del contenido una vez cargada
    const img = burbujaContenido.querySelector("img");
    if (img) img.addEventListener("load", actualizarDesborda, { once: true });
  }

  function cerrarBurbuja() {
    if (blobAbierto) blobAbierto.abierta = false;
    blobAbierto = null;
    burbuja.classList.add("mim-glosario-oculto");
    burbujaDesborda.classList.remove("mim-glosario-visible");
  }

  document.getElementById("mim-glosario-cerrar").addEventListener("click", cerrarBurbuja);

  addEventListener("keydown", e => {
    if (e.key === "Escape") cerrarBurbuja();
  });

  // positions the bubble next to its blob and stays clamped inside
  // the container. on wide screens it opens sideways (left or right,
  // whichever has more room) so it can use most of the container's
  // height instead of being squeezed above/below the blob; on narrow
  // screens there isn't enough room beside the blob, so it opens
  // above/below instead, same as before
  function posicionarBurbuja(blob) {
    const size = blobSize();
    const half = size / 2;
    const gap = 16;
    const margen = 12;
    const escritorio = contW > 600;

    const bx = blob.x + half;
    const by = blob.y + half;

    // give the content as much height as the container allows, so
    // long definiciones need less (or no) scrolling to read in full
    burbujaContenido.style.maxHeight = `${clamp(contH - margen * 2 - 6, 200, 700)}px`;

    const bw = burbuja.offsetWidth;
    const bh = burbuja.offsetHeight;

    let left, top;

    if (escritorio) {
      const espacioDerecha = contW - (bx + half);
      const espacioIzquierda = bx - half;
      const abrirDerecha = espacioDerecha >= espacioIzquierda;

      left = abrirDerecha ? bx + half + gap : bx - half - gap - bw;
      left = clamp(left, margen, Math.max(margen, contW - bw - margen));

      top = clamp(by - bh / 2, margen, Math.max(margen, contH - bh - margen));
    } else {
      const cabeArriba = (by - half - gap - bh) >= margen;
      top = cabeArriba ? by - half - gap - bh : by + half + gap;
      top = clamp(top, margen, Math.max(margen, contH - bh - margen));

      left = clamp(bx - bw / 2, margen, Math.max(margen, contW - bw - margen));
    }

    burbuja.style.left = `${left}px`;
    burbuja.style.top = `${top}px`;
  }

  function loop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    phase += 0.02;
    noiseTime += 0.004;

    const size = blobSize();
    const half = size / 2;
    const metaballR = size * 0.34;

    // gentle perlin-like drift, unbounded — blobs wander and stay
    // wherever they end up instead of homing back. a blob whose
    // bubble is open holds still so the bubble doesn't drift away
    // mid-read
    blobs.forEach(b => {
      if (b.dragging || b.abierta) return;

      const nx = noise(b.noiseSeed, noiseTime) - 0.5;
      const ny = noise(b.noiseSeed + 500, noiseTime) - 0.5;
      b.vx += nx * 0.02;
      b.vy += ny * 0.02;

      b.vx *= 0.9;
      b.vy *= 0.9;

      b.x += b.vx;
      b.y += b.vy;

      b.x = clamp(b.x, 0, contW - size);
      b.y = clamp(b.y, 0, contH - size);
    });

    // push blobs apart when they overlap — including out of the way
    // of whichever blob is being dragged, but the dragged blob itself
    // always stays exactly under the pointer
    for (let i = 0; i < blobs.length; i++) {
      for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i], c = blobs[j];
        const dx = (c.x + half) - (a.x + half);
        const dy = (c.y + half) - (a.y + half);
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0 && dist < size) {
          const overlap = (size - dist) / 2;
          const ux = dx / dist, uy = dy / dist;
          if (!a.dragging) {
            a.x = clamp(a.x - ux * overlap, 0, contW - size);
            a.y = clamp(a.y - uy * overlap, 0, contH - size);
          }
          if (!c.dragging) {
            c.x = clamp(c.x + ux * overlap, 0, contW - size);
            c.y = clamp(c.y + uy * overlap, 0, contH - size);
          }
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

    // keep the bubble glued to its blob even while dragged
    if (blobAbierto) posicionarBurbuja(blobAbierto);

    requestAnimationFrame(loop);
  }

  loop();
}

// ===== UTIL =====
// picks a random definicion index, avoiding an immediate repeat of
// the one currently shown (when there's more than one to choose from)
function elegirIndiceAleatorio(total, actual) {
  if (total <= 1) return 0;
  let indice;
  do {
    indice = Math.floor(Math.random() * total);
  } while (indice === actual);
  return indice;
}

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
