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

    // hard boundary radius so the cluster can never spill past the
    // edges of the screen, scaled to whichever dimension is smaller
    const maxRadius = Math.max(Math.min(innerWidth, innerHeight) * 0.32, 90);

    const size = blobSize();
    const half = size / 2;
    const metaballR = size * 0.34;

    blobs.forEach(b => {

      if (!b.dragging) {

        // attraction to the shared center
        let dx = cx - b.x;
        let dy = cy - b.y;

        b.vx += dx * 0.0008;
        b.vy += dy * 0.0008;

        // orbit, ties everyone into one rotating, interconnected mass
        b.vx += -dy * 0.0006;
        b.vy += dx * 0.0006;

        // repulsion between all people, regardless of institución
        blobs.forEach(o => {
          if (b === o) return;

          let dx = o.x - b.x;
          let dy = o.y - b.y;
          let d = Math.sqrt(dx*dx + dy*dy);
          if (d < 20) d = 20;

          let rep = -10 / (d*d);

          b.vx += rep * dx;
          b.vy += rep * dy;
        });

        b.vx *= 0.95;
        b.vy *= 0.95;

        b.x += b.vx;
        b.y += b.vy;

        // hard clamp: keep every blob within maxRadius of center
        const distX = b.x - cx;
        const distY = b.y - cy;
        const dist = Math.sqrt(distX*distX + distY*distY);
        if (dist > maxRadius) {
          const angle = Math.atan2(distY, distX);
          b.x = cx + Math.cos(angle) * maxRadius;
          b.y = cy + Math.sin(angle) * maxRadius;
          b.vx *= -0.3;
          b.vy *= -0.3;
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
