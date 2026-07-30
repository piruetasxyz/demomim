const canvasGoo = document.getElementById("canvas-goo");
const gooCtx = canvasGoo.getContext("2d");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resize() {
  canvasGoo.width = window.innerWidth;
  canvasGoo.height = window.innerHeight;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

// --- Audio ---
let entries = [];
let players = [];
let analyser;

async function initAudio() {
  await Tone.start();

  analyser = new Tone.Analyser("waveform", 64);

  players = entries.map(entry => {
    const player = new Tone.Player(`./../recursos/${entry.archivo}`).toDestination();
    player.connect(analyser);
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
  constructor(x, y, radius, hue, label, playerIndex) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
    this.hue = hue;
    this.label = label;
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
      const noise = Math.sin(angle * 3 + time + this.noiseOffset);
      const r = this.radius + noise * 10;

      const px = this.x + Math.cos(angle) * r;
      const py = this.y + Math.sin(angle) * r;

      if (i === 0) gooCtx.moveTo(px, py);
      else gooCtx.lineTo(px, py);
    }

    gooCtx.closePath();
    gooCtx.fillStyle = `hsla(${this.hue}, 80%, 70%, 0.9)`;
    gooCtx.fill();
  }

  // crisp label, drawn unblurred on top of the goo layer
  drawLabel() {
    ctx.fillStyle = "#000";
    ctx.font = "700 16px 'area', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, this.x, this.y);
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

// --- Create blobs, one per audio entry, arranged in a grid sized to fit them all ---
let blobs = [];

function crearBlobs(entries) {
  const n = entries.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const padding = 80;
  const cellWidth = (canvas.width - padding * 2) / cols;
  const cellHeight = (canvas.height - padding * 2) / rows;
  const radius = Math.min(60, Math.max(30, Math.min(cellWidth, cellHeight) * 0.32));

  return entries.map((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = padding + cellWidth * (col + 0.5) + (Math.random() - 0.5) * cellWidth * 0.2;
    const y = padding + cellHeight * (row + 0.5) + (Math.random() - 0.5) * cellHeight * 0.2;

    return new Blob(x, y, radius, hashColor(entry.concepto), entry.persona, i);
  });
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
  if (!draggingBlob) return;

  const rect = canvas.getBoundingClientRect();
  draggingBlob.x = e.clientX - rect.left;
  draggingBlob.y = e.clientY - rect.top;

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
});

// --- Animation ---
function animate(time) {
  requestAnimationFrame(animate);
  gooCtx.clearRect(0, 0, canvasGoo.width, canvasGoo.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let audioLevel = 0;

  if (analyser) {
    const values = analyser.getValue();
    audioLevel = values.reduce((a, b) => a + Math.abs(b), 0) / values.length;
  }

  blobs.forEach(blob => {
    blob.update(audioLevel);
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
