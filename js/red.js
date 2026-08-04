'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const SVG_NS   = 'http://www.w3.org/2000/svg';
const LINE_PAD = 5;   // px gap between line tip and label edge

const FONT_FAMILY  = "'Mirador', sans-serif";
const LINE_WEIGHT  = 1.6; // fixed at the midpoint of the former 0.2–3 slider range
const LINE_OPACITY = 0.05 + (1 - 0.05) / 3; // fixed at the 1/3 point of the former 0.05–1 slider range

const DEFAULTS = {
  fontSize:    10,
};

// ── Mutable state ─────────────────────────────────────────────────────────────

let state          = { ...DEFAULTS };
let data           = null;
let nodesSorted    = [];          // data.nodes sorted by degree desc
let activeTemplate = 'constellation';

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

const LABEL_LINE_HEIGHT_EM = 1.15;

// Greedily breaks `label` into word-wrapped lines no wider than `maxWidth`,
// then rebuilds `textEl` as centered tspans (must already be attached to the
// DOM so getComputedTextLength() resolves against the real font).
function wrapLabelIntoTspans(textEl, label, maxWidth, x) {
  const words = label.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = words[0] || '';
  textEl.textContent = current;
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    textEl.textContent = candidate;
    if (textEl.getComputedTextLength() > maxWidth) {
      lines.push(current);
      current = words[i];
    } else {
      current = candidate;
    }
  }
  lines.push(current);

  textEl.textContent = '';
  lines.forEach((line, i) => {
    const tspan = svgEl('tspan', {
      x,
      dy: i === 0 ? `${-(lines.length - 1) * LABEL_LINE_HEIGHT_EM / 2}em` : `${LABEL_LINE_HEIGHT_EM}em`,
    });
    tspan.textContent = line;
    textEl.appendChild(tspan);
  });
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
  { id: 'constellation', label: 'Constelación', fn: layoutConstellation },
  { id: 'river',         label: 'Río',           fn: layoutRiver         },
  { id: 'cloud',         label: 'Nube',          fn: layoutCloud         },
  { id: 'caos',          label: 'Caos',          fn: layoutCaos          },
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
  const { W: sceneW } = svgSize();
  const maxLabelWidth = Math.min(200, sceneW * 0.3);
  nodeElements = {};
  data.nodes.forEach(node => {
    const pos = positions[node.id] || { x: -9999, y: -9999 };
    const t   = svgEl('text', {
      x:                   pos.x,
      y:                   pos.y,
      'font-family':       FONT_FAMILY,
      'font-size':         `${state.fontSize}px`,
      'font-weight':       '500',
      fill:                getNodeColor(node.hierarchy),
      'text-anchor':       'middle',
      'dominant-baseline': 'middle',
      'data-node-id':      node.id,
    });
    svg.appendChild(t); // attach before measuring so font metrics resolve
    wrapLabelIntoTspans(t, node.label, maxLabelWidth, pos.x);
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
      'stroke-width':   LINE_WEIGHT,
      'stroke-opacity': LINE_OPACITY,
      'stroke-linecap': 'round',
    });
    edgeG.appendChild(lineEl);
    edgeElements.push({ el: lineEl, source, target });
  });

  // Start animation loop
  animHandle = requestAnimationFrame(animLoop);
}

// Pairwise-separates overlapping labels along their axis of least overlap.
// The correction is folded into basePositions (not just positions) so it
// accumulates frame to frame — nodes visibly "bounce" apart until settled,
// instead of re-overlapping the instant the float animation ticks forward.
const LABEL_GAP = 6; // px breathing room kept between separated labels

function resolveLabelCollisions() {
  const ids = data.nodes.map(n => n.id);
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i];
    if (drag && drag.nodeId === a) continue;
    const pa = positions[a], sa = labelSizes[a];
    if (!pa || !sa) continue;

    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j];
      if (drag && drag.nodeId === b) continue;
      const pb = positions[b], sb = labelSizes[b];
      if (!pb || !sb) continue;

      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const overlapX = (sa.w + sb.w) / 2 + LABEL_GAP - Math.abs(dx);
      const overlapY = (sa.h + sb.h) / 2 + LABEL_GAP - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;

      // Push apart along whichever axis has the smaller overlap
      if (overlapX < overlapY) {
        const push = (overlapX / 2) * Math.sign(dx || 1);
        pa.x -= push; basePositions[a].x -= push;
        pb.x += push; basePositions[b].x += push;
      } else {
        const push = (overlapY / 2) * Math.sign(dy || 1);
        pa.y -= push; basePositions[a].y -= push;
        pb.y += push; basePositions[b].y += push;
      }
    }
  }

  // Keep bounced labels on-canvas
  const { W, H } = svgSize();
  ids.forEach(id => {
    if (drag && drag.nodeId === id) return;
    const pos = positions[id], bp = basePositions[id], sz = labelSizes[id];
    if (!pos || !bp || !sz) return;
    const halfW = sz.w / 2 + LABEL_GAP, halfH = sz.h / 2 + LABEL_GAP;
    pos.x = bp.x = Math.max(halfW, Math.min(W - halfW, bp.x));
    pos.y = bp.y = Math.max(halfH, Math.min(H - halfH, bp.y));
  });
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

  resolveLabelCollisions();

  // Update text element positions (each tspan carries its own x, so it
  // must be kept in sync too — setting x on the parent <text> alone
  // wouldn't move already-positioned tspans)
  data.nodes.forEach(node => {
    const el  = nodeElements[node.id];
    const pos = positions[node.id];
    if (el && pos) {
      el.setAttribute('x', pos.x);
      el.setAttribute('y', pos.y);
      for (const tspan of el.children) tspan.setAttribute('x', pos.x);
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
  // Update active button highlight
  document.querySelectorAll('.template-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.templateId === id);
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

function bindControls() {
  const $ = id => document.getElementById(id);

  $('font-size').addEventListener('input', e => {
    state.fontSize = parseInt(e.target.value, 10);
    buildScene();
  });

  $('btn-randomize').addEventListener('click', () => {
    const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    applyTemplate(tpl.id);
  });
}

// ── Templates UI ──────────────────────────────────────────────────────────────

function buildTemplatesUI() {
  const bar = document.getElementById('control-bar');
  TEMPLATES.forEach(tpl => {
    const group = document.createElement('div');
    group.className = 'control-group';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'template-btn';
    btn.dataset.templateId = tpl.id;
    btn.textContent = tpl.label;
    if (tpl.id === activeTemplate) btn.classList.add('active');
    btn.addEventListener('click', () => applyTemplate(tpl.id));

    group.appendChild(btn);
    bar.appendChild(group);
  });

  // Move the randomize button after the template buttons it was inserted before
  bar.appendChild(document.getElementById('btn-randomize').closest('.control-group'));
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
    console.error('[red]', err);
  }
}

document.addEventListener('DOMContentLoaded', loadData);