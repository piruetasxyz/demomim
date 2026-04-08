'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const SVG_NS   = 'http://www.w3.org/2000/svg';
const LINE_PAD = 5;   // px gap between line tip and label edge

const DEFAULTS = {
  lineWeight:  0.8,
  lineOpacity: 0.35,
  fontFamily:  'Inter, sans-serif',
  fontSize:    10,
};

// ── Mutable state ─────────────────────────────────────────────────────────────

let state          = { ...DEFAULTS };
let data           = null;
let nodesSorted    = [];          // data.nodes sorted by degree desc
let activeTemplate = 'hierarchy';

// Position layers
let basePositions  = {};          // nodeId → {x,y}  layout anchors
let positions      = {};          // nodeId → {x,y}  current (base + float)

// Label geometry — captured once per font setting, never per frame
let labelSizes     = {};          // nodeId → {w, h, dx, dy}

// Persistent DOM references — rebuilt only on font/scene change
let nodeElements   = {};          // nodeId → SVGTextElement
let edgeElements   = [];          // [{el, source, target}]

// Float animation
let floatPhases    = {};          // nodeId → {phaseX, phaseY, freqX, freqY, ampX, ampY}
let animHandle     = null;

// Drag state
let drag = null;                  // {nodeId, offsetX, offsetY} | null

// ── SVG helpers ───────────────────────────────────────────────────────────────

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function svgSize() {
  const svg = document.getElementById('main-svg');
  return { W: svg.clientWidth, H: svg.clientHeight };
}

function svgCoords(e) {
  const svg  = document.getElementById('main-svg');
  const rect = svg.getBoundingClientRect();
  const src  = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

// ── Degree sort ───────────────────────────────────────────────────────────────

function computeDegrees() {
  const deg = {};
  data.nodes.forEach(n => { deg[n.id] = 0; });
  data.edges.forEach(({ source, target }) => {
    if (source in deg) deg[source]++;
    if (target in deg) deg[target]++;
  });
  return deg;
}

function sortNodes() {
  const deg = computeDegrees();
  nodesSorted = [...data.nodes].sort((a, b) => deg[b.id] - deg[a.id]);
}

// ── Float phases ──────────────────────────────────────────────────────────────

function initFloatPhases() {
  data.nodes.forEach(node => {
    floatPhases[node.id] = {
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      freqX:  0.09 + Math.random() * 0.14,    // Hz — very slow
      freqY:  0.07 + Math.random() * 0.11,
      ampX:   4    + Math.random() * 7,        // px
      ampY:   5    + Math.random() * 9,
    };
  });
}

// ── Layout functions (templates) ──────────────────────────────────────────────
// All signatures: (W, H, nodesSorted) → { [nodeId]: {x, y} }

function layoutConstellation(W, H, ns) {
  const mX = Math.max(90, W * 0.09), mY = 58, n = ns.length;
  const pos = {};
  ns.forEach((node, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    pos[node.id] = {
      x: mX + t * (W - 2 * mX) + (Math.random() - 0.5) * 50,
      y: Math.max(mY, Math.min(H - mY, H / 2 + (Math.random() - 0.5) * (H - 2 * mY) * 0.82)),
    };
  });
  return pos;
}

function layoutCircle(W, H, ns) {
  const cx = W / 2, cy = H / 2, n = ns.length;
  const r  = Math.min(W, H) * 0.35;
  const pos = {};
  ns.forEach((node, i) => {
    const a  = (i / n) * Math.PI * 2 - Math.PI / 2;
    const jr = (Math.random() - 0.5) * 18;
    const ja = (Math.random() - 0.5) * 0.07;
    pos[node.id] = {
      x: cx + (r + jr) * Math.cos(a + ja),
      y: cy + (r + jr) * Math.sin(a + ja),
    };
  });
  return pos;
}

function layoutMandala(W, H, ns) {
  const cx = W / 2, cy = H / 2, n = ns.length;
  const pos = {};
  if (n === 0) return pos;

  // Highest-degree node at center
  pos[ns[0].id] = {
    x: cx + (Math.random() - 0.5) * 12,
    y: cy + (Math.random() - 0.5) * 12,
  };

  const rest  = ns.slice(1);
  const half  = Math.ceil(rest.length / 2);
  const inner = rest.slice(0, half);
  const outer = rest.slice(half);
  const rI    = Math.min(W, H) * 0.21;
  const rO    = Math.min(W, H) * 0.38;

  inner.forEach((node, i) => {
    const a = (i / inner.length) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.15;
    pos[node.id] = {
      x: cx + (rI + (Math.random() - 0.5) * 14) * Math.cos(a),
      y: cy + (rI + (Math.random() - 0.5) * 14) * Math.sin(a),
    };
  });
  outer.forEach((node, i) => {
    const a = (i / outer.length) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.15;
    pos[node.id] = {
      x: cx + (rO + (Math.random() - 0.5) * 18) * Math.cos(a),
      y: cy + (rO + (Math.random() - 0.5) * 18) * Math.sin(a),
    };
  });
  return pos;
}

function layoutSpiral(W, H, ns) {
  const cx = W / 2, cy = H / 2, n = ns.length;
  const maxR = Math.min(W, H) * 0.40;
  const pos  = {};
  ns.forEach((node, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const a = t * Math.PI * 2 * 2.4;
    const r = t * maxR;
    pos[node.id] = {
      x: cx + (r + (Math.random() - 0.5) * 10) * Math.cos(a),
      y: cy + (r + (Math.random() - 0.5) * 10) * Math.sin(a),
    };
  });
  return pos;
}

function layoutHierarchy(W, H, ns) {
  const cx = W / 2;
  const cy = H / 2;

  const pos = {};

  // Group by hierarchy
  const levels = {};
  data.nodes.forEach(n => {
    const h = n.hierarchy ?? 2;
    if (!levels[h]) levels[h] = [];
    levels[h].push(n);
  });

  const r1 = Math.min(W, H) * 0.22;
  const r2 = Math.min(W, H) * 0.42;

  // Center (level 0)
  (levels[0] || []).forEach(node => {
    pos[node.id] = { x: cx, y: cy };
  });

  function placeRing(nodes, radius) {
    if (!nodes || nodes.length === 0) return;
    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      pos[node.id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle)
      };
    });
  }

  placeRing(levels[1], r1);
  placeRing(levels[2], r2);

  return pos;
}

function layoutRiver(W, H, ns) {
  const mY = 62, n = ns.length;
  const pos = {};
  ns.forEach((node, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    pos[node.id] = {
      x: W / 2 + (Math.random() - 0.5) * W * 0.54,
      y: mY + t * (H - 2 * mY),
    };
  });
  return pos;
}

function layoutWave(W, H, ns) {
  const mX = 80, n = ns.length;
  const pos = {};
  ns.forEach((node, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const x = mX + t * (W - 2 * mX) + (Math.random() - 0.5) * 28;
    const y = H / 2 + Math.sin(t * Math.PI * 2.8) * (H * 0.30) + (Math.random() - 0.5) * 20;
    pos[node.id] = { x, y: Math.max(55, Math.min(H - 55, y)) };
  });
  return pos;
}

function layoutGrid(W, H, ns) {
  const n    = ns.length;
  const cols = Math.max(2, Math.ceil(Math.sqrt(n * W / H)));
  const rows = Math.ceil(n / cols);
  const cellW  = (W * 0.72) / cols;
  const cellH  = (H * 0.70) / rows;
  const startX = (W - cellW * cols) / 2 + cellW / 2;
  const startY = (H - cellH * rows) / 2 + cellH / 2;
  const pos    = {};
  ns.forEach((node, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    pos[node.id] = {
      x: startX + col * cellW + (Math.random() - 0.5) * 20,
      y: startY + row * cellH + (Math.random() - 0.5) * 14,
    };
  });
  return pos;
}

function layoutCloud(W, H, ns) {
  // Gaussian cluster near center — tighter crowd, very organic
  const cx = W / 2, cy = H / 2;
  const rX = Math.min(W, H) * 0.22;
  const rY = Math.min(W, H) * 0.14;
  const pos = {};
  ns.forEach(node => {
    const u1 = Math.max(1e-9, Math.random());
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    pos[node.id] = {
      x: Math.max(60, Math.min(W - 60, cx + z0 * rX)),
      y: Math.max(50, Math.min(H - 50, cy + z1 * rY)),
    };
  });
  return pos;
}

function layoutInfinito(W, H, ns) {
  // Lissajous figure-8 (∞ on its side)
  const cx = W / 2, cy = H / 2, n = ns.length;
  const a  = Math.min(W * 0.33, H * 0.70);
  const b  = Math.min(H * 0.24, W * 0.18);
  const pos = {};
  ns.forEach((node, i) => {
    const t  = (i / n) * Math.PI * 2;
    const x  = cx + a * Math.sin(t) + (Math.random() - 0.5) * 18;
    const y  = cy + b * Math.sin(2 * t) * 0.5 + (Math.random() - 0.5) * 14;
    pos[node.id] = {
      x: Math.max(60, Math.min(W - 60, x)),
      y: Math.max(50, Math.min(H - 50, y)),
    };
  });
  return pos;
}

function layoutCaos(W, H, ns) {
  const mX = 70, mY = 55;
  const pos = {};
  ns.forEach(node => {
    pos[node.id] = {
      x: mX + Math.random() * (W - 2 * mX),
      y: mY + Math.random() * (H - 2 * mY),
    };
  });
  return pos;
}

// ── Template registry ─────────────────────────────────────────────────────────

const TEMPLATES = [
  { id: 'hierarchy', label: 'Jerarquía', desc: 'niveles radiales', fn: layoutHierarchy },
  { id: 'constellation', label: 'Constelación', desc: 'peso → izquierda', fn: layoutConstellation },
  { id: 'circle',        label: 'Círculo',       desc: 'anillo uniforme', fn: layoutCircle        },
  { id: 'mandala',       label: 'Mandala',       desc: 'anillos concéntricos', fn: layoutMandala  },
  { id: 'spiral',        label: 'Espiral',       desc: 'caracol',         fn: layoutSpiral        },
  { id: 'river',         label: 'Río',           desc: 'flujo vertical',  fn: layoutRiver         },
  { id: 'wave',          label: 'Ola',           desc: 'onda sinusoide',  fn: layoutWave          },
  { id: 'grid',          label: 'Cuadrícula',    desc: 'rejilla',         fn: layoutGrid          },
  { id: 'cloud',         label: 'Nube',          desc: 'racimo gaussiano',fn: layoutCloud         },
  { id: 'infinito',      label: 'Infinito',      desc: 'figura ∞',        fn: layoutInfinito      },
  { id: 'caos',          label: 'Caos',          desc: 'dispersión libre',fn: layoutCaos          },
];

// ── Line clipping ─────────────────────────────────────────────────────────────

function exitPoint(cx, cy, ndx, ndy, bbox, pad) {
  const L = bbox.x - pad,  R = bbox.x + bbox.width  + pad;
  const T = bbox.y - pad,  B = bbox.y + bbox.height + pad;
  let t = Infinity;
  if      (ndx > 0) t = Math.min(t, (R - cx) / ndx);
  else if (ndx < 0) t = Math.min(t, (L - cx) / ndx);
  if      (ndy > 0) t = Math.min(t, (B - cy) / ndy);
  else if (ndy < 0) t = Math.min(t, (T - cy) / ndy);
  return isFinite(t) ? { x: cx + t * ndx, y: cy + t * ndy } : { x: cx, y: cy };
}

// Compute current bbox from cached label size offsets (no DOM call)
function currentBBox(nodeId) {
  const pos = positions[nodeId];
  const sz  = labelSizes[nodeId];
  if (!pos || !sz) return null;
  return { x: pos.x + sz.dx, y: pos.y + sz.dy, width: sz.w, height: sz.h };
}

// ── Scene build ───────────────────────────────────────────────────────────────

function getNodeColor(level) {
  if (level === 0) return '#2e7d32'; // green
  if (level === 1) return '#e65100'; // orange
  if (level === 2) return '#1565c0'; // blue
  return '#1a1a1a';
}

function getNodeFontSize(level) {
  if (level === 0) return state.fontSize;          // 100%
  if (level === 1) return state.fontSize * 0.8;    // 80%
  if (level === 2) return state.fontSize * 0.6;    // 60%
  return state.fontSize;
}

function buildScene() {
  if (animHandle) { cancelAnimationFrame(animHandle); animHandle = null; }
  drag = null;
  document.getElementById('main-svg').classList.remove('dragging');

  const svg = document.getElementById('main-svg');
  svg.innerHTML = '';

  // 1 — edge group (z = 0, behind everything)
  const edgeG = svgEl('g', { class: 'edges' });
  svg.appendChild(edgeG);
  

  // 2 — node labels (z = 1)
  nodeElements = {};
  data.nodes.forEach(node => {
    const pos = positions[node.id] || { x: -9999, y: -9999 };
    const t   = svgEl('text', {
      x:                   pos.x,
      y:                   pos.y,
      'font-family':       state.fontFamily,
      'font-size':         `${state.fontSize}px`,
      'font-weight':       '500',
      fill:                getNodeColor(node.hierarchy),
      'text-anchor':       'middle',
      'dominant-baseline': 'middle',
      'data-node-id':      node.id,
    });
    t.textContent = node.label;
    svg.appendChild(t);
    nodeElements[node.id] = t;
  });

  // 3 — capture label sizes from getBBox (one-time DOM read per font change)
  //     We store dx/dy offsets so we never need getBBox in the hot animation loop.
  labelSizes = {};
  data.nodes.forEach(node => {
    const el  = nodeElements[node.id];
    const pos = positions[node.id];
    if (!el || !pos) return;
    const bb = el.getBBox();
    labelSizes[node.id] = {
      w:  bb.width,
      h:  bb.height,
      dx: bb.x - pos.x,    // ≈ −w/2  (constant for a given font/size)
      dy: bb.y - pos.y,    // ≈ −h/2
    };
  });

  // 4 — edge line elements (inserted into edgeG)
  edgeElements = [];
  data.edges.forEach(({ source, target }) => {
    const lineEl = svgEl('line', {
      stroke:           '#999',
      'stroke-width':   state.lineWeight,
      'stroke-opacity': state.lineOpacity,
      'stroke-linecap': 'round',
    });
    edgeG.appendChild(lineEl);
    edgeElements.push({ el: lineEl, source, target });
  });

  // 5 — watermark (topmost layer)
  const wm = svgEl('text', {
    x:                16,
    y:                22,
    'font-family':    'sans-serif',
    'font-size':      '11px',
    'font-variant':   'small-caps',
    'letter-spacing': '0.06em',
    fill:             '#c8c8c8',
    'pointer-events': 'none',
  });
  wm.textContent = data.constellation.name;
  svg.appendChild(wm);

  // Start animation loop
  animHandle = requestAnimationFrame(animLoop);
}

// ── Animation loop (runs every frame) ────────────────────────────────────────

function animLoop(ts) {
  const t = ts / 1000;

  // Compute animated positions from base + sinusoidal float
  data.nodes.forEach(node => {
    if (drag && drag.nodeId === node.id) return;  // drag overrides float
    const bp = basePositions[node.id];
    const f  = floatPhases[node.id];
    if (!bp || !f) return;
    positions[node.id] = {
      x: bp.x + Math.sin(2 * Math.PI * f.freqX * t + f.phaseX) * f.ampX,
      y: bp.y + Math.sin(2 * Math.PI * f.freqY * t + f.phaseY) * f.ampY,
    };
  });

  // Update text element positions
  data.nodes.forEach(node => {
    const el  = nodeElements[node.id];
    const pos = positions[node.id];
    if (el && pos) {
      el.setAttribute('x', pos.x);
      el.setAttribute('y', pos.y);
    }
  });

  // Update edge line endpoints (clipped to label bboxes)
  edgeElements.forEach(({ el, source, target }) => {
    const bS = currentBBox(source);
    const bT = currentBBox(target);
    if (!bS || !bT) return;

    const sx = bS.x + bS.width  / 2,  sy = bS.y + bS.height / 2;
    const tx = bT.x + bT.width  / 2,  ty = bT.y + bT.height / 2;
    const dx = tx - sx, dy = ty - sy;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;

    const ndx = dx / len, ndy = dy / len;
    const p1  = exitPoint(sx, sy,  ndx,  ndy, bS, LINE_PAD);
    const p2  = exitPoint(tx, ty, -ndx, -ndy, bT, LINE_PAD);

    el.setAttribute('x1', p1.x);  el.setAttribute('y1', p1.y);
    el.setAttribute('x2', p2.x);  el.setAttribute('y2', p2.y);
  });


  animHandle = requestAnimationFrame(animLoop);
}

// ── Template application ──────────────────────────────────────────────────────

function applyTemplate(id) {
  const tpl = TEMPLATES.find(t => t.id === id);
  if (!tpl) return;
  activeTemplate = id;
  const { W, H } = svgSize();
  basePositions = tpl.fn(W, H, nodesSorted);
  // Snap animated positions to new base (float layers on top next frame)
  data.nodes.forEach(n => {
    if (basePositions[n.id]) positions[n.id] = { ...basePositions[n.id] };
  });
  // Update active tile highlight
  document.querySelectorAll('.template-tile').forEach(tile => {
    tile.classList.toggle('active', tile.dataset.templateId === id);
  });
}

// ── Drag handling ─────────────────────────────────────────────────────────────

function startDrag(nodeId, x, y) {
  const pos = positions[nodeId];
  if (!pos) return;
  drag = { nodeId, offsetX: x - pos.x, offsetY: y - pos.y };
  document.getElementById('main-svg').classList.add('dragging');
}

function moveDrag(x, y) {
  if (!drag) return;
  const nx = x - drag.offsetX;
  const ny = y - drag.offsetY;
  // Update both layers so float resumes from dropped position
  basePositions[drag.nodeId] = { x: nx, y: ny };
  positions[drag.nodeId]     = { x: nx, y: ny };
}

function endDrag() {
  if (!drag) return;
  drag = null;
  document.getElementById('main-svg').classList.remove('dragging');
}

function bindDrag() {
  const svg = document.getElementById('main-svg');

  // Mouse
  svg.addEventListener('mousedown', e => {
    const target = e.target.closest('[data-node-id]');
    if (!target) return;
    e.preventDefault();
    startDrag(target.getAttribute('data-node-id'), ...Object.values(svgCoords(e)));
  });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    moveDrag(...Object.values(svgCoords(e)));
  });
  window.addEventListener('mouseup', endDrag);

  // Touch
  svg.addEventListener('touchstart', e => {
    const target = e.target.closest('[data-node-id]');
    if (!target) return;
    e.preventDefault();
    startDrag(target.getAttribute('data-node-id'), ...Object.values(svgCoords(e)));
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    if (!drag) return;
    e.preventDefault();
    moveDrag(...Object.values(svgCoords(e)));
  }, { passive: false });
  svg.addEventListener('touchend', endDrag);
}

// ── Controls ──────────────────────────────────────────────────────────────────

function updateLineAttrs() {
  edgeElements.forEach(({ el }) => {
    el.setAttribute('stroke-width',   state.lineWeight);
    el.setAttribute('stroke-opacity', state.lineOpacity);
  });
}

function syncControlsToState() {
  document.getElementById('line-weight').value = state.lineWeight;
  document.getElementById('line-opacity').value = state.lineOpacity;
  document.getElementById('font-family').value  = state.fontFamily;
  document.getElementById('font-size').value    = state.fontSize;
}

function bindControls() {
  const $ = id => document.getElementById(id);

  $('line-weight').addEventListener('input', e => {
    state.lineWeight = parseFloat(e.target.value);
    updateLineAttrs();
  });

  $('line-opacity').addEventListener('input', e => {
    state.lineOpacity = parseFloat(e.target.value);
    updateLineAttrs();
  });

  $('font-family').addEventListener('change', e => {
    state.fontFamily = e.target.value;
    // Rebuild scene to capture new label sizes; positions are preserved
    buildScene();
  });

  $('font-size').addEventListener('input', e => {
    state.fontSize = parseInt(e.target.value, 10);
    buildScene();
  });

  $('btn-randomize').addEventListener('click', () => {
    applyTemplate(activeTemplate);
  });

  $('btn-reset').addEventListener('click', () => {
    state = { ...DEFAULTS };
    syncControlsToState();
    updateLineAttrs();
    applyTemplate('constellation');
  });

  // Templates panel toggle
  $('btn-templates').addEventListener('click', () => {
    const panel = $('templates-panel');
    const btn   = $('btn-templates');
    panel.hidden = !panel.hidden;
    btn.textContent = panel.hidden ? 'Plantillas ▾' : 'Plantillas ▴';
    btn.classList.toggle('open', !panel.hidden);
  });
}

// ── Templates UI ──────────────────────────────────────────────────────────────

function buildTemplatesUI() {
  const grid = document.getElementById('templates-grid');
  grid.innerHTML = '';
  TEMPLATES.forEach(tpl => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'template-tile';
    tile.dataset.templateId = tpl.id;
    if (tpl.id === activeTemplate) tile.classList.add('active');
    tile.innerHTML =
      `<span class="tile-name">${tpl.label}</span>` +
      `<span class="tile-desc">${tpl.desc}</span>`;
    tile.addEventListener('click', () => {
      applyTemplate(tpl.id);
      // Close panel after selection
      const panel = document.getElementById('templates-panel');
      const btn   = document.getElementById('btn-templates');
      panel.hidden = true;
      btn.textContent = 'Plantillas ▾';
      btn.classList.remove('open');
    });
    grid.appendChild(tile);
  });
}

// ── Init & data loading ───────────────────────────────────────────────────────

function init() {
  sortNodes();
  initFloatPhases();

  // Compute initial layout and seed positions
  const { W, H } = svgSize();
  basePositions = layoutConstellation(W, H, nodesSorted);
  data.nodes.forEach(n => { positions[n.id] = { ...basePositions[n.id] }; });

  // Build persistent scene (captures labelSizes, starts animation)
  buildScene();

  // Wire up controls and interaction
  bindControls();
  bindDrag();
  buildTemplatesUI();

  // Reapply active template on resize so layout fills new dimensions
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyTemplate(activeTemplate), 80);
  });
}

async function loadData() {
  const errEl = document.getElementById('error-msg');
  try {
    const res = await fetch('./../datos/red.yaml');
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    data = jsyaml.load(text);
    if (!data?.nodes || !data?.edges) throw new Error('Estructura YAML inválida');
    init();
  } catch (err) {
    errEl.textContent = `No se pudo cargar data.yaml — ${err.message}`;
    errEl.style.display = 'block';
    console.error('[red-generativa]', err);
  }
}

document.addEventListener('DOMContentLoaded', loadData);