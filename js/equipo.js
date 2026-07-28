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
// Everyone belongs to a single interconnected cluster (no separate
// clusters per institución). Only the color varies by institución;
// everyone else shares the same behavior and visual hierarchy.
function init(equipo) {

  const blobs = [];
  let phase = Math.random() * Math.PI * 2;

  // blob size in px, kept in sync with css/equipo.css .blob size
  const blobSize = () => innerWidth <= 600 ? 64 : 100;

  equipo.forEach(p => {

    const el = document.createElement("div");
    el.className = "blob";

    const size = blobSize();
    const blob = {
      el,
      x: innerWidth/2 + (Math.random() - 0.5) * 60,
      y: innerHeight/2 + (Math.random() - 0.5) * 60,
      vx: 0,
      vy: 0,
      hue: hashColor(p.institucion),
      dragging: false
    };

    el.innerHTML = `
      <div class="content">
        <div class="nombre">${p.nombre}</div>
        <div class="inst">${p.institucion}</div>
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

    // shared center, recomputed every frame so it adapts to any
    // screen size (desktop or mobile) and to window resizes
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;

    const size = blobSize();
    const half = size / 2;
    const metaballR = size * 0.34;

    // soft rectangular walls, padded so blobs (and their text) stay
    // fully on screen. b.x/b.y are the blob's top-left corner, so the
    // right/bottom bounds must subtract the full blob size, not just
    // half of it, or the far edge can drift past the viewport.
    const padding = 50;
    const left = padding;
    const right = innerWidth - size - padding;
    const top = padding;
    const bottom = innerHeight - size - padding;

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

        // repulsion between all people, regardless of institución
        // (stronger, so nobody gets trapped bouncing near the center)
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
      }

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
function hashColor(str) {
  let h = 0;
  for (let i=0;i<str.length;i++) {
    h = str.charCodeAt(i) + ((h<<5)-h);
  }
  return h % 360;
}