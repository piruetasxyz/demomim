const canvasGoo = document.getElementById("canvas-goo");
const gooCtx = canvasGoo.getContext("2d");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let blobs = [];
// center point that playing blobs draw their waveform connection to;
// crearBlobs() moves this once it knows the real grid gap, this is
// just where it sits before the data has loaded
let hub = { x: 0, y: 0 };

function resize() {
  canvasGoo.width = window.innerWidth;
  canvasGoo.height = window.innerHeight;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  if (blobs.length === 0) {
    hub.x = canvas.width / 2;
    hub.y = canvas.height / 2;
  }
}
resize();
window.addEventListener("resize", resize);

// --- Audio ---
let entries = [];
let players = [];
let analysers = []; // one waveform analyser per player, so each connecting line can show its own track's waveform

async function initAudio() {
  await Tone.start();

  players = entries.map(entry => {
    const player = new Tone.Player(`./../recursos/${entry.archivo}`).toDestination();
    const playerAnalyser = new Tone.Analyser("waveform", 64);
    player.connect(playerAnalyser);
    analysers.push(playerAnalyser);
    return player;
  });

  // buffers decode in the background after the Player constructor
  // returns, so a fast first click can otherwise land before the
  // track is actually ready to play
  await Tone.loaded();

  blobs.forEach((blob, i) => {
    const player = players[i];
    // fires both on manual pause and on natural end of the track;
    // `pausing` tells the two cases apart so a natural end resets
    // playback to the start, while a manual pause keeps the offset
    player.onstop = () => {
      if (blob.pausing) {
        blob.pausing = false;
      } else {
        blob.isPlaying = false;
        blob.offset = 0;
      }
    };
  });
}

// --- Blob ---
class Blob {
  constructor(x, y, radius, hue, concepto, persona, playerIndex) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.driftSeed = Math.random() * 1000;
    this.baseRadius = radius;
    this.radius = radius;
    this.hue = hue;
    this.concepto = concepto;
    this.persona = persona;
    this.playerIndex = playerIndex;
    this.noiseOffset = Math.random() * 1000;

    this.isPlaying = false;
    this.pausing = false;
    this.offset = 0;
    this.startTime = 0;
  }

  // blurred goo shape, same wobbly-outline math as before
  drawGoo(time) {
    gooCtx.beginPath();

    const points = 24;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const wobble = Math.sin(angle * 3 + time + this.noiseOffset);
      const r = this.radius + wobble * 10;

      const px = this.x + Math.cos(angle) * r;
      const py = this.y + Math.sin(angle) * r;

      if (i === 0) gooCtx.moveTo(px, py);
      else gooCtx.lineTo(px, py);
    }

    gooCtx.closePath();
    gooCtx.fillStyle = `hsla(${this.hue}, 70%, 60%, 0.4)`;
    gooCtx.fill();
  }

  // crisp label, drawn unblurred on top of the goo layer: the
  // glosario concept on top (bold), the person's name below (lighter)
  drawLabel() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#ec6608";
    ctx.font = "700 15px 'area', sans-serif";
    ctx.fillText(this.concepto, this.x, this.y - 9);

    ctx.globalAlpha = 0.8;
    ctx.font = "400 12px 'area', sans-serif";
    ctx.fillText(this.persona, this.x, this.y + 9);
    ctx.globalAlpha = 1;
  }

  update(audioLevel) {
    this.radius = this.baseRadius + (this.isPlaying ? audioLevel * 80 : 0);
  }

  isInside(mx, my) {
    const dx = mx - this.x;
    const dy = my - this.y;
    return Math.sqrt(dx * dx + dy * dy) < this.radius;
  }

  toggle() {
    const player = players[this.playerIndex];
    if (!player || !player.loaded) return;

    if (this.isPlaying) {
      const elapsed = Tone.now() - this.startTime;
      this.offset += elapsed;
      if (this.offset >= player.buffer.duration) this.offset = 0;

      this.pausing = true;
      player.stop();
      this.isPlaying = false;
    } else {
      this.startTime = Tone.now();
      player.start(undefined, this.offset);
      this.isPlaying = true;
    }
  }
}

// --- Create blobs, one per audio entry, arranged in a grid sized to fit
// them all, minus one cell near the middle left empty for the hub ---
function crearBlobs(entries) {
  const n = entries.length;
  const cols = Math.ceil(Math.sqrt(n));
  let rows = Math.ceil(n / cols);
  // grids that exactly fit n entries have no spare cell for the hub gap
  if (cols * rows <= n) rows++;

  const padding = 80;
  const cellWidth = (canvas.width - padding * 2) / cols;
  const cellHeight = (canvas.height - padding * 2) / rows;
  const radius = Math.min(60, Math.max(30, Math.min(cellWidth, cellHeight) * 0.32));

  const gapCol = Math.round((cols - 1) / 2);
  const gapRow = Math.round((rows - 1) / 2);
  hub.x = padding + cellWidth * (gapCol + 0.5);
  hub.y = padding + cellHeight * (gapRow + 0.5);

  const result = [];
  let i = 0;
  for (let row = 0; row < rows && i < n; row++) {
    for (let col = 0; col < cols && i < n; col++) {
      if (row === gapRow && col === gapCol) continue;

      const entry = entries[i];
      const x = padding + cellWidth * (col + 0.5) + (Math.random() - 0.5) * cellWidth * 0.2;
      const y = padding + cellHeight * (row + 0.5) + (Math.random() - 0.5) * cellHeight * 0.2;

      result.push(new Blob(x, y, radius, hashColor(entry.archivo), entry.concepto, entry.persona, i));
      i++;
    }
  }
  return result;
}

fetch("./../datos/audios.yaml")
  .then(r => r.text())
  .then(t => {
    entries = jsyaml.load(t).audios;
    blobs = crearBlobs(entries);
  });

// --- Dragging vs. click state (click toggles play/pause, drag just moves) ---
let draggingBlob = null;
let startX, startY, startTime, moved;
let audioReady = null;

canvas.addEventListener("pointerdown", (e) => {
  // fire-and-await-later: kicking this off without awaiting means a
  // quick first click still finds draggingBlob set below in time,
  // instead of the whole handler stalling on init and missing pointerup
  if (players.length === 0 && !audioReady && entries.length > 0) audioReady = initAudio();

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  for (const blob of blobs) {
    if (blob.isInside(mx, my)) {
      draggingBlob = blob;
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();
      moved = false;
      break;
    }
  }
});

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (!draggingBlob) {
    canvas.style.cursor = blobs.some(b => b.isInside(mx, my)) ? "pointer" : "default";
    return;
  }

  const r = draggingBlob.baseRadius;
  draggingBlob.x = clamp(mx, r, canvas.width - r);
  draggingBlob.y = clamp(my, r, canvas.height - r);

  if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) moved = true;
});

canvas.addEventListener("pointerup", async () => {
  const blob = draggingBlob;
  draggingBlob = null;

  if (!blob || moved || Date.now() - startTime >= 500) return;

  if (audioReady) {
    await audioReady;
    audioReady = null;
  }

  blob.toggle();
});

canvas.addEventListener("pointerleave", () => {
  draggingBlob = null;
  canvas.style.cursor = "default";
});

// --- Animation ---

// gentle perlin-like drift, unbounded — blobs wander and stay
// wherever they end up instead of homing back — plus a bounce apart
// when two blobs overlap
function updatePhysics() {
  blobs.forEach(b => {
    if (b === draggingBlob) return;

    const nx = noise(b.driftSeed, noiseTime) - 0.5;
    const ny = noise(b.driftSeed + 500, noiseTime) - 0.5;
    b.vx += nx * 0.02;
    b.vy += ny * 0.02;

    b.vx *= 0.9;
    b.vy *= 0.9;

    b.x += b.vx;
    b.y += b.vy;

    b.x = clamp(b.x, b.baseRadius, canvas.width - b.baseRadius);
    b.y = clamp(b.y, b.baseRadius, canvas.height - b.baseRadius);
  });

  // push blobs apart when they overlap — including out of the way of
  // whichever blob is being dragged, but the dragged blob itself
  // always stays exactly under the pointer
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const a = blobs[i], c = blobs[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const minDist = a.radius + c.radius;
      if (dist > 0 && dist < minDist) {
        const overlap = (minDist - dist) / 2;
        const ux = dx / dist, uy = dy / dist;
        if (a !== draggingBlob) {
          a.x = clamp(a.x - ux * overlap, a.baseRadius, canvas.width - a.baseRadius);
          a.y = clamp(a.y - uy * overlap, a.baseRadius, canvas.height - a.baseRadius);
        }
        if (c !== draggingBlob) {
          c.x = clamp(c.x + ux * overlap, c.baseRadius, canvas.width - c.baseRadius);
          c.y = clamp(c.y + uy * overlap, c.baseRadius, canvas.height - c.baseRadius);
        }
      }
    }
  }
}

let noiseTime = Math.random() * 1000;

// waveform line from the center hub out to a playing blob, tapering to
// zero amplitude at both ends so it reads as a "connection" rather than
// a floating scribble
function drawConnection(blob, values) {
  const cx = hub.x;
  const cy = hub.y;
  const dx = blob.x - cx;
  const dy = blob.y - cy;
  const dist = Math.hypot(dx, dy) || 1;
  const px = -dy / dist;
  const py = dx / dist;

  ctx.beginPath();
  const n = values.length;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bx = cx + dx * t;
    const by = cy + dy * t;
    const taper = Math.sin(t * Math.PI);
    const amp = values[Math.min(i, n - 1)] * 40 * taper;

    const x = bx + px * amp;
    const y = by + py * amp;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `hsla(${blob.hue}, 70%, 55%, 0.8)`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// central hub, always visible, pulsing when something is playing
function drawHub(level) {
  const r = 8 + level * 30;

  ctx.beginPath();
  ctx.arc(hub.x, hub.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ec6608";
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function animate(time) {
  requestAnimationFrame(animate);
  gooCtx.clearRect(0, 0, canvasGoo.width, canvasGoo.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  noiseTime += 0.004;
  updatePhysics();

  let totalLevel = 0;
  let activeCount = 0;

  blobs.forEach(blob => {
    const values = blob.isPlaying ? analysers[blob.playerIndex]?.getValue() : null;
    const level = values ? values.reduce((a, b) => a + Math.abs(b), 0) / values.length : 0;
    blob.update(level);

    if (values) {
      drawConnection(blob, values);
      totalLevel += level;
      activeCount++;
    }
  });

  drawHub(activeCount ? totalLevel / activeCount : 0);

  blobs.forEach(blob => {
    blob.drawGoo(time * 0.002);
    blob.drawLabel();
  });
}

animate(0);

// --- Util ---
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = str.charCodeAt(i) + ((h << 5) - h);
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
