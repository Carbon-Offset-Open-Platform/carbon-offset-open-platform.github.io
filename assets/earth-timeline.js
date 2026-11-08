// Earth timeline: one scrubber over a century drives the globe, the narrative,
// the stat tiles and the side panel at once. Falls back to the GIF without WebGL.
import * as THREE from './three.module.min.js';

// Global annual mean CO2, ppm (NOAA GML anchors; linear between them).
const PPM = [[1990, 354.4], [1995, 360.8], [2000, 369.5], [2005, 379.8], [2010, 389.9],
             [2015, 400.8], [2020, 414.2], [2025, 424.6]];
// Beyond 2025 there is no measurement, only a path. Two of them, held apart by
// how much of the world's carbon is actually accounted for rather than estimated.
const PATH_DRIFT = [[2025, 424.6], [2050, 486], [2080, 548]]; // current trajectory
const PATH_COUNT = [[2025, 424.6], [2050, 448], [2080, 431]]; // measured and settled

const NOW = 2026;
const MIN = 1990, MAX = 2080;

const CHAPTERS = [
  {
    n: '01', key: 'measure', from: 1990, to: 2009,
    label: 'Measure',
    eyebrow: 'Chapter 01 · Measure',
    head: 'Carbon was real long before anyone <em>counted</em> it.',
    body: 'Emissions were estimated from fuel receipts and industry averages, once a year, long after the fact. Nobody could point at a single kilogram and say where it came from.',
    ticker: 'Annual averages. No way to attribute a kilogram to the thing that emitted it.',
    panel: {
      what: 'Carbon measured as a yearly national total, inferred from fuel sales.',
      does: ['Fuel receipts', 'Industry averages', 'Annual totals', 'No attribution'],
    },
  },
  {
    n: '02', key: 'report', from: 2010, to: 2025,
    label: 'Report',
    eyebrow: 'Chapter 02 · Report',
    head: 'Reporting arrived. <em>Verification</em> did not.',
    body: 'Disclosure frameworks spread fast. Most of what they publish is still a spreadsheet of estimates, restated quietly when the method changes, with no record of what the old number was.',
    ticker: 'Disclosure is widespread. Most of it is still an estimate nobody can re-check.',
    panel: {
      what: 'Carbon reported as a disclosed figure, estimated and hard to audit.',
      does: ['Scope 1-2-3 estimates', 'Annual disclosure', 'Silent restatements', 'Double counting'],
    },
  },
  {
    n: '03', key: 'verify', from: 2026, to: 2080,
    label: 'Account',
    eyebrow: 'Chapter 03 · Account',
    head: 'Treat carbon like <em>money</em>, and the number holds.',
    body: 'Every kilogram becomes an event with a time, a source and an owner. Liability transfers instead of evaporating. Restatements are entries, not edits. This is the part SCOOP is building.',
    ticker: 'An event ledger: measured, owned, transferable, and restated on the record.',
    panel: {
      what: 'Carbon held as an event ledger: measured at the source, owned by someone.',
      does: ['Event-level records', 'Liability transfer', 'Audited restatements', 'Open to re-check'],
    },
  },
];

function lerp(table, year) {
  if (year <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1], [x1, y1] = table[i];
    if (year <= x1) return y0 + (y1 - y0) * ((year - x0) / (x1 - x0));
  }
  return last[1];
}

const ppmFor = (year) => year <= 2025 ? lerp(PPM, year) : lerp(PATH_DRIFT, year);
const chapterFor = (year) => CHAPTERS.find((c) => year <= c.to) || CHAPTERS[CHAPTERS.length - 1];
// 0 = pre-industrial baseline-ish, 1 = the hottest point on the drift path.
const stressFor = (year) => Math.min(1, Math.max(0, (ppmFor(year) - 350) / 190));

function build(section) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const range = section.querySelector('#et-range');
  const el = (id) => section.querySelector('#' + id);
  const readout = el('et-readout'), readoutNote = el('et-readout-note');
  const story = el('et-story'), eyebrow = el('et-eyebrow'), head = el('et-head'), body = el('et-body');
  const tickerBox = el('et-ticker'), ticker = el('et-ticker-text');
  const statPpm = el('et-stat-ppm'), statPpmNote = el('et-stat-ppm-note');
  const statGap = el('et-stat-gap'), statGapNote = el('et-stat-gap-note');
  const panelWhat = el('et-panel-what'), panelChips = el('et-panel-chips');
  const tickSvg = el('et-ticks');
  const chapterBtns = [...section.querySelectorAll('.et-chapter')];

  // --- Tick rail: one mark per year, lit up to the handle --------------------
  const ticks = [];
  for (let y = MIN; y <= MAX; y++) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const x = ((y - MIN) / (MAX - MIN)) * 100;
    const major = y % 5 === 0;
    t.setAttribute('x1', x + '%'); t.setAttribute('x2', x + '%');
    t.setAttribute('y1', major ? 4 : 9); t.setAttribute('y2', major ? 22 : 17);
    t.setAttribute('class', 'tick');
    tickSvg.appendChild(t); ticks.push([y, t]);
  }
  const nowLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  const nx = ((NOW - MIN) / (MAX - MIN)) * 100;
  nowLine.setAttribute('x1', nx + '%'); nowLine.setAttribute('x2', nx + '%');
  nowLine.setAttribute('y1', -2); nowLine.setAttribute('y2', 26);
  nowLine.setAttribute('class', 'now');
  tickSvg.appendChild(nowLine);

  // --- Sparkline: the two paths after today ---------------------------------
  drawSpark(el('et-spark'));

  // --- State ----------------------------------------------------------------
  let year = NOW, current = null, live = null;
  const liveLine = el('et-live');

  function swap(nodes, write) {
    if (reduce) { write(); return; }
    nodes.forEach((n) => n.classList.add('is-swapping'));
    setTimeout(() => { write(); nodes.forEach((n) => n.classList.remove('is-swapping')); }, 300);
  }

  function render(y, force) {
    year = y;
    const ppm = ppmFor(y), future = y > 2025;
    const chapter = chapterFor(y);

    readout.textContent = y;
    readoutNote.textContent = y === NOW ? 'today' : future ? 'projected' : 'measured';
    // Screen readers hear the year, its status and the chapter, not just a number.
    range.setAttribute('aria-valuetext', y + ', ' + readoutNote.textContent + ', ' + chapterFor(y).label);

    statPpm.innerHTML = ppm.toFixed(1) + '<sup>ppm</sup>';
    statPpmNote.textContent = future ? 'CO₂, current trajectory' : 'CO₂ in the atmosphere';

    // The gap: drift path minus the settled path. Before today there is nothing
    // to compare, so the tile shows the rise since 1990 instead.
    if (live && chapter.key === 'verify') {
      // In the accounted era the tile drops the scenario and shows the one
      // figure on this page that was actually measured.
      statGap.innerHTML = live.co2_kg.toFixed(3) + '<sup>kg</sup>';
      statGapNote.textContent = 'CO₂ measured, not estimated';
    } else if (future) {
      const gap = lerp(PATH_DRIFT, y) - lerp(PATH_COUNT, y);
      statGap.innerHTML = '+' + gap.toFixed(0) + '<sup>ppm</sup>';
      statGapNote.textContent = 'gap if carbon stays estimated';
    } else {
      statGap.innerHTML = '+' + (ppm - PPM[0][1]).toFixed(0) + '<sup>ppm</sup>';
      statGapNote.textContent = 'added since 1990';
    }

    ticks.forEach(([ty, node]) => node.classList.toggle('is-past', ty <= y));
    section.querySelectorAll('.et-years span').forEach((s) => {
      s.classList.toggle('is-now', Math.abs(+s.dataset.year - y) < 3);
    });

    if (chapter !== current || force) {
      current = chapter;
      chapterBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.key === chapter.key));
      swap([story], () => {
        eyebrow.textContent = chapter.eyebrow;
        head.innerHTML = chapter.head;
        body.textContent = chapter.body;
      });
      swap([tickerBox], () => { ticker.textContent = chapter.ticker; });
      panelWhat.textContent = chapter.panel.what;
      panelChips.innerHTML = '';
      chapter.panel.does.forEach((d) => {
        const li = document.createElement('li');
        li.className = 'et-chip'; li.textContent = d;
        panelChips.appendChild(li);
      });
    }

    if (globe) globe.setStress(stressFor(y));
  }

  range.addEventListener('input', () => render(+range.value));
  chapterBtns.forEach((b) => b.addEventListener('click', () => {
    const c = CHAPTERS.find((x) => x.key === b.dataset.key);
    const target = Math.round((Math.max(c.from, MIN) + Math.min(c.to, MAX)) / 2);
    range.value = target; render(target);
  }));

  // Accordions: one open at a time, like a disclosure list.
  section.querySelectorAll('.et-acc > button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const acc = btn.parentElement, open = acc.classList.contains('is-open');
      section.querySelectorAll('.et-acc').forEach((a) => {
        a.classList.remove('is-open');
        a.querySelector('button').setAttribute('aria-expanded', 'false');
      });
      if (!open) { acc.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });

  const globe = startGlobe(section, reduce);
  render(NOW, true);

  // The public API is same-origin in production and simply absent on a static
  // preview, so a failure here leaves the scenario copy standing.
  fetch('/api/v0/summary', { headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || j.status !== 'ok' || typeof j.co2_kg !== 'number') return;
      live = j;
      const since = new Date(j.first_period).toLocaleDateString('en-GB',
        { day: 'numeric', month: 'short', year: 'numeric' });
      liveLine.textContent = 'Live from the record: ' + j.samples.toLocaleString()
        + ' power samples over ' + j.measurement_periods + ' settled periods on '
        + j.servers + (j.servers === 1 ? ' server' : ' servers') + ', since ' + since
        + '. ' + j.energy_kwh.toFixed(3) + ' kWh measured at the socket.';
      liveLine.hidden = false;
      render(year, true);
    })
    .catch(() => { /* no API here: the written copy stands on its own */ });
}

function drawSpark(svg) {
  if (!svg) return;
  const W = 290, H = 96, x = (y) => ((y - 2025) / 55) * W;
  const lo = 410, hi = 560, yy = (p) => H - ((p - lo) / (hi - lo)) * H;
  const path = (table) => table.map(([t, p], i) => (i ? 'L' : 'M') + x(t).toFixed(1) + ' ' + yy(p).toFixed(1)).join(' ');
  svg.setAttribute('viewBox', `0 -10 ${W} ${H + 24}`);
  svg.innerHTML = `
    <defs><linearGradient id="etSparkFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#34D399" stop-opacity=".22"/>
      <stop offset="1" stop-color="#34D399" stop-opacity="0"/>
    </linearGradient></defs>
    <line class="grid" x1="0" y1="${H}" x2="${W}" y2="${H}"/>
    <path class="area" d="${path(PATH_DRIFT)} L${W} ${H} L0 ${H} Z"/>
    <path class="line" style="stroke:#C77B4A;stroke-dasharray:4 4" d="${path(PATH_DRIFT)}"/>
    <path class="line" d="${path(PATH_COUNT)}"/>
    <circle class="head" cx="${x(2080)}" cy="${yy(431)}" r="3"/>
    <text x="0" y="${H + 14}">2025</text>
    <text x="${W}" y="${H + 14}" text-anchor="end">2080</text>`;
}

// ---------------------------------------------------------------------------
// The globe. Same day/night/cloud textures as the hero, with a stress term that
// the scrubber drives: warmer, hazier, more ember on the night side.
// ---------------------------------------------------------------------------
function startGlobe(section, reduce) {
  const canvas = section.querySelector('#et-globe');
  const fallback = section.querySelector('#et-globe-fallback');
  const fail = () => { if (canvas) canvas.remove(); if (fallback) fallback.hidden = false; };
  if (!canvas) return null;
  if (!window.WebGLRenderingContext) { fail(); return null; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { fail(); return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0, 4.4);

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (f) => { const t = loader.load('assets/earth/' + f); t.anisotropy = Math.min(8, maxAniso); return t; };

  const uniforms = {
    dayMap: { value: tex('day.jpg') },
    nightMap: { value: tex('night.jpg') },
    dataMap: { value: tex('bump_roughness_clouds.jpg') }, // g: roughness, b: clouds
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    stress: { value: 0.4 },
  };

  const earthMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform sampler2D dayMap, nightMap, dataMap; uniform vec3 sunDir; uniform float stress;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView;
      void main() {
        vec3 n = normalize(vN), v = normalize(vView);
        float d = dot(n, sunDir);
        vec4 data = texture2D(dataMap, vUv);
        float clouds = smoothstep(0.2, 1.0, data.b);
        vec3 day = mix(texture2D(dayMap, vUv).rgb, vec3(1.0), clouds * 0.85);
        // Stress warms and desaturates the lit side, as if seen through haze.
        float grey = dot(day, vec3(0.299, 0.587, 0.114));
        day = mix(day, mix(vec3(grey), vec3(0.78, 0.49, 0.26), 0.55), stress * 0.5);
        vec3 lights = texture2D(nightMap, vUv).rgb * (1.0 - clouds);
        // Night side: city lights cool and sparse at low stress, ember-hot at high.
        vec3 night = mix(lights * vec3(0.85, 0.92, 1.0) * 1.15,
                         lights * vec3(1.6, 0.42, 0.14) * 1.45, stress);
        float lit = smoothstep(-0.12, 0.25, d);
        vec3 col = mix(night, day * (0.12 + 1.05 * max(d, 0.0)), lit);
        float spec = pow(max(dot(reflect(-sunDir, n), v), 0.0), 28.0) * (1.0 - data.g) * (1.0 - clouds) * lit;
        col += vec3(1.0, 0.95, 0.85) * spec * 0.55 * (1.0 - stress * 0.6);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
        vec3 limb = mix(vec3(0.32, 0.62, 1.0), vec3(0.95, 0.52, 0.22), stress);
        col = mix(col, limb, fres * smoothstep(-0.25, 0.6, d) * 0.75);
        col += vec3(1.0, 0.45, 0.2) * smoothstep(0.18, 0.0, abs(d)) * (0.06 + stress * 0.14);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: uniforms.sunDir, stress: uniforms.stress },
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: `
      varying vec3 vN; varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 sunDir; uniform float stress; varying vec3 vN; varying vec3 vView;
      void main() {
        float x = clamp(-dot(normalize(vN), normalize(vView)), 0.0, 1.0);
        float edge = pow(x, 1.4) * (3.2 + stress * 1.1);
        float sun = smoothstep(-0.4, 0.5, dot(normalize(vN), sunDir));
        vec3 tint = mix(vec3(0.3, 0.6, 1.0), vec3(0.95, 0.46, 0.18), stress);
        gl_FragColor = vec4(tint * edge * (0.2 + sun), 1.0);
      }`,
  });

  const earth = new THREE.Group();
  earth.rotation.x = 0.34;
  scene.add(earth);
  const spin = new THREE.Group();
  earth.add(spin);
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat));
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), atmoMat));

  // Fixed late-afternoon sun: the terminator stays in frame while scrubbing, so
  // the change the scrubber makes is the only thing moving.
  const sunLocal = new THREE.Vector3(0.82, 0.22, 0.52).normalize();

  let angle = -1.5, vel = 0, dragging = false, lastX = 0, visible = true;
  const AUTO = reduce ? 0 : 0.04;
  let stress = 0.4, stressTarget = 0.4;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    angle += dx * 0.006; vel = dx * 0.006 * 60;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  const rot = new THREE.Matrix4();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    if (!dragging) { angle += (AUTO + vel) * dt; vel *= Math.pow(0.04, dt); }
    // Ease toward the scrubbed value so a fast drag reads as a dissolve.
    stress += (stressTarget - stress) * Math.min(1, dt * 3.5);
    uniforms.stress.value = stress;
    spin.rotation.y = angle;
    spin.updateMatrixWorld();
    uniforms.sunDir.value.copy(sunLocal).applyMatrix4(rot.extractRotation(spin.matrixWorld)).normalize();
    renderer.render(scene, camera);
  });

  return { setStress(v) { stressTarget = v; if (reduce) stress = v; } };
}

const root = document.getElementById('earth');
if (root) build(root);
