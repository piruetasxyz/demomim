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
function init(equipo) {

  const blobs = [];
  const groups = {};

  equipo.forEach(p => {

    // create group (organism)
    if (!groups[p.institucion]) {
      groups[p.institucion] = {
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        phase: Math.random() * Math.PI * 2,
        hue: hashColor(p.institucion)
      };
    }

    const g = groups[p.institucion];

    const el = document.createElement("div");
    el.className = "blob";

    const blob = {
      el,
      x: g.x + Math.random()*50,
      y: g.y + Math.random()*50,
      vx: 0,
      vy: 0,
      group: g,
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

    // update organisms
    Object.values(groups).forEach(g => {
      g.phase += 0.02;
      g.x += Math.sin(g.phase * 0.3) * 0.3;
      g.y += Math.cos(g.phase * 0.3) * 0.3;
    });

    blobs.forEach(b => {

      if (!b.dragging) {
        const g = b.group;

        // attraction to nucleus
        let dx = g.x - b.x;
        let dy = g.y - b.y;

        b.vx += dx * 0.0008;
        b.vy += dy * 0.0008;

        // orbit
        b.vx += -dy * 0.0002;
        b.vy += dx * 0.0002;

        // repulsion
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
      }

      const phase = b.group.phase || 0;
      const s = 1 + Math.sin(phase) * 0.08;

      const x = Number.isFinite(b.x) ? b.x : 0;
      const y = Number.isFinite(b.y) ? b.y : 0;
      const scale = Number.isFinite(s) ? s : 1;

      b.el.style.transform =
        `translate(${x}px, ${y}px) scale(${scale})`;

      // metaball field
      ctx.beginPath();
      ctx.arc(x + 70, y + 70, 60 * scale, 0, Math.PI*2);
      ctx.fillStyle = `hsla(${b.group.hue}, 70%, 60%, 0.4)`;
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