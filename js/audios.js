const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- Audio ---
let players = [];
let analyser;

async function initAudio() {
  await Tone.start();

  const p1 = new Tone.Player("./../recursos/afecto-natalia.mp3").toDestination();
  const p2 = new Tone.Player("./../recursos/regenerar-natalia.mp3").toDestination();

  analyser = new Tone.Analyser("waveform", 64);
  p1.connect(analyser);
  p2.connect(analyser);

  players = [p1, p2];
}

// --- Blob ---
class Blob {
  constructor(x, y, radius, color, label, playerIndex) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
    this.color = color;
    this.label = label;
    this.playerIndex = playerIndex;
    this.noiseOffset = Math.random() * 1000;
  }

  draw(time) {
    ctx.beginPath();

    const points = 24;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const noise = Math.sin(angle * 3 + time + this.noiseOffset);
      const r = this.radius + noise * 10;

      const px = this.x + Math.cos(angle) * r;
      const py = this.y + Math.sin(angle) * r;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();

    // --- TEXT ---
    ctx.fillStyle = "#000";
    ctx.font = "700 16px 'area', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, this.x, this.y);
  }

  update(audioLevel) {
    this.radius = this.baseRadius + audioLevel * 80;
  }

  isInside(mx, my) {
    const dx = mx - this.x;
    const dy = my - this.y;
    return Math.sqrt(dx * dx + dy * dy) < this.radius;
  }

  play() {
    players[this.playerIndex].start();
  }
}

// --- Create blobs ---
const blobs = [
  new Blob(canvas.width * 0.3, canvas.height / 2, 70, "#ffffff", "afecto", 0),
  new Blob(canvas.width * 0.7, canvas.height / 2, 70, "#ffffff", "regenerar", 1),
];

// --- Dragging state ---
let draggingBlob = null;

// --- Mouse events ---
canvas.addEventListener("mousedown", async (e) => {
  if (players.length === 0) await initAudio();

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  for (let blob of blobs) {
    if (blob.isInside(mx, my)) {
      draggingBlob = blob;
      blob.play(); // play on grab
      break;
    }
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!draggingBlob) return;

  const rect = canvas.getBoundingClientRect();
  draggingBlob.x = e.clientX - rect.left;
  draggingBlob.y = e.clientY - rect.top;
});

canvas.addEventListener("mouseup", () => {
  draggingBlob = null;
});

canvas.addEventListener("mouseleave", () => {
  draggingBlob = null;
});

// --- Animation ---
function animate(time) {
  requestAnimationFrame(animate);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let audioLevel = 0;

  if (analyser) {
    const values = analyser.getValue();
    audioLevel = values.reduce((a, b) => a + Math.abs(b), 0) / values.length;
  }

  blobs.forEach(blob => {
    blob.update(audioLevel);
    blob.draw(time * 0.002);
  });
}

animate(0);

// --- Resize ---
window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});