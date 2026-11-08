// The measured record in 3D: one point per settled period from the lab server.
// x = time, y = average power (W), z = load (%). Size = energy, colour = load.
// Live data from /api/v0/emissions, with a snapshot fallback for static hosting.
import * as THREE from './three.module.min.js';

const MINT = new THREE.Color('#34D399');
const EMBER = new THREE.Color('#F2B37C');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

async function loadRows() {
  try {
    const r = await fetch('/api/v0/emissions?limit=500', { headers: { accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      if (j.status === 'ok' && Array.isArray(j.emissions)) return { rows: j.emissions, source: 'live' };
    }
  } catch (e) { /* fall through to the snapshot */ }
  const r = await fetch('assets/data/measured-periods.json');
  const j = await r.json();
  return { rows: j.rows, source: 'snapshot' };
}

// Derive average power from energy and period length; keep only usable rows.
function prepare(rows) {
  return rows
    .map((r) => {
      const t = Date.parse(r.period_start), end = Date.parse(r.period_end);
      const hours = (end - t) / 3.6e6;
      return { ...r, t, end, watts: hours > 0 ? (r.total_energy_kwh / hours) * 1000 : NaN };
    })
    .filter((p) => Number.isFinite(p.watts) && Number.isFinite(p.avg_load_pct))
    .sort((a, b) => a.t - b.t);
}

const SHADER = {
  vertex: `
    attribute float aSize; attribute vec3 aColor; attribute float aSel;
    uniform float uPixel;
    varying vec3 vColor; varying float vSel;
    void main() {
      vColor = aColor; vSel = aSel;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = (aSize + aSel * 0.06) * uPixel / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: `
    varying vec3 vColor; varying float vSel;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      vec3 col = mix(vColor, vec3(1.0), vSel * 0.7);
      float a = smoothstep(0.5, 0.25, d);
      gl_FragColor = vec4(col, a * 0.92);
    }`,
};

function build(root) {
  const canvas = root.querySelector('#ms-canvas');
  const nogl = root.querySelector('#ms-nogl');
  const range = root.querySelector('#ms-range');
  const readout = root.querySelector('#ms-readout');
  const detail = root.querySelector('#ms-detail');
  const tbody = root.querySelector('#ms-tbody');
  const toggle = root.querySelector('#ms-toggle');
  const tableWrap = root.querySelector('#ms-table-wrap');
  const source = root.querySelector('#ms-source');
  const lblX = root.querySelector('#ms-lbl-x'), lblY = root.querySelector('#ms-lbl-y'), lblZ = root.querySelector('#ms-lbl-z');

  // Tables are always available, so they double as the no-WebGL fallback.
  toggle.addEventListener('click', () => {
    const open = tableWrap.hidden;
    tableWrap.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide table' : 'Show as table';
  });

  loadRows().then(({ rows, source: from }) => {
    const pts = prepare(rows);
    if (!pts.length) { source.textContent = 'No measured periods are available right now.'; return; }
    source.textContent = from === 'live'
      ? 'Live from the measurement API.'
      : 'Snapshot of the measurement API, last exported from the record.';
    start(pts);
  }).catch(() => { source.textContent = 'The measured record could not be loaded.'; });

  function start(pts) {
    const N = pts.length;
    const tMin = pts[0].t, tMax = pts[N - 1].t;
    const wMin = Math.min(...pts.map((p) => p.watts)), wMax = Math.max(...pts.map((p) => p.watts));
    const lMin = Math.min(...pts.map((p) => p.avg_load_pct)), lMax = Math.max(...pts.map((p) => p.avg_load_pct));
    const eMax = Math.max(...pts.map((p) => p.total_energy_kwh)) || 1;
    const norm = (v, a, b) => (b - a > 0 ? (v - a) / (b - a) : 0.5);
    const X = (t) => (norm(t, tMin, tMax) - 0.5) * 9;
    const Y = (w) => norm(w, wMin, wMax) * 5;
    const Z = (l) => (norm(l, lMin, lMax) - 0.5) * 7;

    lblX.textContent = 'Time: ' + fmtDate(tMin) + ' to ' + fmtDate(tMax);
    lblY.textContent = 'Power: ' + wMin.toFixed(0) + '–' + wMax.toFixed(0) + ' W';
    lblZ.textContent = 'Load: ' + lMin.toFixed(0) + '–' + lMax.toFixed(0) + '%';

    // --- Table: one row per point, selectable by keyboard -----------------
    const rowEls = pts.map((p, i) => {
      const tr = document.createElement('tr');
      const cells = [fmtTime(p.t), p.total_energy_kwh.toFixed(4), p.watts.toFixed(1), p.avg_load_pct.toFixed(1), p.total_co2_kg.toFixed(4)];
      cells.forEach((c) => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'ms-pick';
      btn.textContent = 'Show';
      btn.setAttribute('aria-label', 'Show measurement from ' + fmtTime(p.t));
      btn.addEventListener('click', () => select(i, true));
      td.appendChild(btn); tr.appendChild(td);
      tbody.appendChild(tr);
      return tr;
    });

    // --- Detail panel ------------------------------------------------------
    let selected = -1;
    function select(i, fromTable) {
      selected = i;
      const p = pts[i];
      const rows = [
        ['Period', fmtTime(p.t) + ' to ' + fmtTime(p.end).slice(11)],
        ['Session', p.session_id],
        ['Energy', p.total_energy_kwh.toFixed(6) + ' kWh, measured at the socket'],
        ['CO₂', p.total_co2_kg.toFixed(6) + ' kg, energy × grid factor'],
        ['Grid factor', p.carbon_intensity_used + ' kg CO₂ per kWh (' + p.method + ')'],
        ['Average power', p.watts.toFixed(1) + ' W (energy ÷ period length)'],
        ['Peak power', p.peak_power_w.toFixed(1) + ' W'],
        ['Load', p.avg_load_pct.toFixed(1) + '%'],
        ['Samples', String(p.samples_count) + ' power readings'],
      ];
      const dl = document.createElement('dl');
      rows.forEach(([k, v]) => {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        dl.append(dt, dd);
      });
      detail.replaceChildren(dl);
      rowEls.forEach((tr, j) => tr.classList.toggle('is-picked', j === i));
      if (live) updateSelection();
    }

    // --- Scrubber ----------------------------------------------------------
    // `live` is true once the 3D scene exists; without WebGL only the table and
    // detail panel run, and they work on their own.
    let live = false;
    let visible = N;
    function setVisible(k) {
      visible = k;
      readout.textContent = k + ' of ' + N + ' measurements, through ' + fmtDate(pts[k - 1].t);
      range.setAttribute('aria-valuetext', readout.textContent);
      rowEls.forEach((tr, j) => { tr.hidden = j >= k; });
      if (live) { points.geometry.setDrawRange(0, k); updateFit(); }
    }
    range.min = '1'; range.max = String(N); range.value = String(N);
    range.addEventListener('input', () => setVisible(+range.value));

    // --- WebGL scene -------------------------------------------------------
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) {
      canvas.hidden = true; nogl.hidden = false;
      tableWrap.hidden = false; toggle.hidden = true;
      setVisible(N);
      select(N - 1, false);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 2.4, 10.5);
    camera.lookAt(0, 2.4, 0);

    const cloud = new THREE.Group();
    scene.add(cloud);

    // Floor and axes, drawn in the same colours as the rest of the site.
    const grid = new THREE.GridHelper(10, 10, 0x1D2B24, 0x16241D);
    grid.position.y = 0;
    cloud.add(grid);
    const axisMat = new THREE.LineBasicMaterial({ color: 0x5E7268, transparent: true, opacity: 0.9 });
    const edge = (a, b) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), axisMat);
    const corner = new THREE.Vector3(-4.5, 0, -3.5);
    cloud.add(edge(corner, new THREE.Vector3(4.5, 0, -3.5)));
    cloud.add(edge(corner, new THREE.Vector3(-4.5, 0, 3.5)));
    cloud.add(edge(corner, new THREE.Vector3(-4.5, 5.2, -3.5)));

    // Points: sorted by time, so the scrubber is a draw range.
    const positions = new Float32Array(N * 3), colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N), sel = new Float32Array(N);
    const tmp = new THREE.Color();
    pts.forEach((p, i) => {
      positions.set([X(p.t), Y(p.watts), Z(p.avg_load_pct)], i * 3);
      tmp.copy(MINT).lerp(EMBER, norm(p.avg_load_pct, lMin, lMax));
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
      sizes[i] = 0.1 + 0.28 * Math.sqrt(p.total_energy_kwh / eMax); // world units
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const selAttr = new THREE.BufferAttribute(sel, 1);
    geo.setAttribute('aSel', selAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPixel: { value: 1 } },
      vertexShader: SHADER.vertex, fragmentShader: SHADER.fragment,
      transparent: true, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    cloud.add(points);

    // Linear fit of power on load, over the visible points. Labelled as a fit.
    const fitGeo = new THREE.BufferGeometry();
    fitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const fit = new THREE.Line(fitGeo, new THREE.LineDashedMaterial({ color: 0xF2B37C, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.85 }));
    fit.visible = false;
    cloud.add(fit);

    function updateFit() {
      const v = pts.slice(0, visible);
      if (v.length < 3) { fit.visible = false; return; }
      const mx = v.reduce((s, p) => s + p.avg_load_pct, 0) / v.length;
      const my = v.reduce((s, p) => s + p.watts, 0) / v.length;
      let num = 0, den = 0;
      v.forEach((p) => { num += (p.avg_load_pct - mx) * (p.watts - my); den += (p.avg_load_pct - mx) ** 2; });
      if (den === 0) { fit.visible = false; return; }
      const b = num / den, a = my - b * mx;
      const l0 = Math.min(...v.map((p) => p.avg_load_pct)), l1 = Math.max(...v.map((p) => p.avg_load_pct));
      const xm = v.reduce((s, p) => s + X(p.t), 0) / v.length;
      const arr = fitGeo.attributes.position.array;
      arr.set([xm, Y(a + b * l0), Z(l0), xm, Y(a + b * l1), Z(l1)]);
      fitGeo.attributes.position.needsUpdate = true;
      fit.visible = true;
    }

    function updateSelection() {
      sel.fill(0);
      if (selected >= 0) sel[selected] = 1;
      selAttr.needsUpdate = true;
    }

    // Labels follow the axes as the view turns.
    const labelAnchors = [
      [lblX, new THREE.Vector3(0, -0.45, -3.9)],
      [lblY, new THREE.Vector3(-4.9, 5.4, -3.5)],
      [lblZ, new THREE.Vector3(-4.9, 0, 3.9)],
    ];
    const project = new THREE.Vector3();
    function placeLabels() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      labelAnchors.forEach(([el, v]) => {
        project.copy(v).applyMatrix4(cloud.matrixWorld).project(camera);
        // Keep each label inside the stage, even when its anchor is off the edge.
        const x = Math.max(4, Math.min(w - el.offsetWidth - 4, (project.x + 1) / 2 * w));
        const y = Math.max(4, Math.min(h - el.offsetHeight - 4, (1 - project.y) / 2 * h));
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
    }

    // --- Drag to turn, click to select -------------------------------------
    let turnY = -0.35, turnX = 0.12, dragging = false, moved = 0, lastX = 0, lastY = 0, vel = 0;
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.22;
    const pointer = new THREE.Vector2();

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; vel = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      turnY += dx * 0.008; vel = dx * 0.008;
      turnX = Math.max(-0.6, Math.min(0.6, turnX + dy * 0.005));
    });
    canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved > 6) return; // it was a drag, not a click
      const r = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(points).find((h) => h.index < visible);
      if (hit) select(hit.index, false);
    });
    canvas.addEventListener('pointercancel', () => { dragging = false; });

    // --- Size, visibility, animation --------------------------------------
    let visibleOnScreen = true;
    new IntersectionObserver((es) => { visibleOnScreen = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Narrow stages (phones) get the cloud smaller and the camera further back,
      // so the whole cloud and its labels stay in frame.
      camera.position.z = camera.aspect < 1 ? 13 : 10.5;
      cloud.scale.setScalar(Math.min(1, Math.max(0.32, camera.aspect / 1.25)));
      camera.updateProjectionMatrix();
      // World size to pixels at unit distance: height / (2 tan(fov / 2)).
      mat.uniforms.uPixel.value = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!visibleOnScreen) return;
      if (!dragging) {
        turnY += (reduce ? 0 : 0.05 * dt) + vel * dt * 2;
        vel *= Math.pow(0.05, dt);
      }
      cloud.rotation.set(turnX, turnY, 0);
      cloud.updateMatrixWorld();
      placeLabels();
      renderer.render(scene, camera);
    });

    live = true;
    setVisible(N);
    select(N - 1, false); // start on the latest measurement so the panel is never empty
  }
}

const root = document.getElementById('measured');
if (root) build(root);
