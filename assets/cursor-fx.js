(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return; // touch: no pointer to track

  var THEMES = [
    { id: 'off', label: 'Off' },
    { id: 'fire', label: 'Fire', hex: '#FF7828', color: [255, 120, 40], glow: 'rgba(255,120,40,.9)', drift: -1 },
    { id: 'smoke', label: 'Smoke', hex: '#AAB2AA', color: [170, 178, 170], glow: 'rgba(170,178,170,.85)', drift: -0.4 },
    { id: 'nature', label: 'Nature', hex: '#3CAA64', color: [60, 170, 100], glow: 'rgba(60,170,100,.9)', drift: 0.6 },
  ];
  var STORE_KEY = 'scoop-cursor-fx';

  function cursorSvgUrl(color, pointing) {
    var path = pointing
      // simple hand/pointer shape
      ? 'M9 2c-.6 0-1 .4-1 1v8.2l-1.6-1.4c-.5-.4-1.2-.4-1.6.1-.4.5-.4 1.1.1 1.6l3.9 3.6c.9.8 2 1.3 3.3 1.3h2.4c2.1 0 3.9-1.6 4.1-3.7l.6-5a1 1 0 0 0-1-1.1c-.5 0-.9.3-1 .8l-.4 2.4V8c0-.6-.4-1-1-1s-1 .4-1 1v-.5c0-.6-.4-1-1-1s-1 .4-1 1V7c0-.6-.4-1-1-1s-1 .4-1 1V3c0-.6-.4-1-1-1z'
      // normal arrow shape, matching the typical OS pointer silhouette
      : 'M3 2l15.3 6.8c.9.4.8 1.7-.1 2l-5.6 1.7 3.4 5.7c.3.5.1 1.1-.4 1.4l-1.6.9c-.5.3-1.1.1-1.4-.4L9.2 14.5 5.8 19c-.4.5-1.2.3-1.3-.3L3 2z';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24">' +
      '<path d="' + path + '" fill="' + color + '" stroke="#061C14" stroke-width="1" stroke-linejoin="round"/>' +
      '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  var cursorStyleEl = document.createElement('style');
  document.head.appendChild(cursorStyleEl);

  function applyCursorColor() {
    var t = THEMES[themeIndex];
    if (!t.hex) {
      cursorStyleEl.textContent = '';
      return;
    }
    var arrow = cursorSvgUrl(t.hex, false);
    var hand = cursorSvgUrl(t.hex, true);
    cursorStyleEl.textContent =
      'html.js-reveal{cursor:' + arrow + ' 3 2,auto}' +
      'a,button,[role="button"],input[type="submit"],.am-tab,.cursor-fx-badge,.cmdk-item,.lm-play{' +
      'cursor:' + hand + ' 9 2,pointer}';
  }

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:999;';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  var mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  var particles = [];
  var themeIndex = THEMES.findIndex(function (t) { return t.id === (localStorage.getItem(STORE_KEY) || 'off'); });
  if (themeIndex < 0) themeIndex = 0;

  document.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function setTheme(i) {
    themeIndex = (i + THEMES.length) % THEMES.length;
    localStorage.setItem(STORE_KEY, THEMES[themeIndex].id);
    applyCursorColor();
    updateBadge();
  }

  // Keyboard shortcut: Alt+C cycles themes
  document.addEventListener('keydown', function (e) {
    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      setTheme(themeIndex + 1);
    }
  });

  // Small toggle badge, bottom-left
  var badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'cursor-fx-badge';
  document.body.appendChild(badge);
  badge.addEventListener('click', function () { setTheme(themeIndex + 1); });

  function updateBadge() {
    var t = THEMES[themeIndex];
    badge.textContent = 'Cursor: ' + t.label + ' (Alt+C)';
  }

  applyCursorColor();
  updateBadge();

  function spawn() {
    var t = THEMES[themeIndex];
    if (!t.color) return;
    for (var i = 0; i < 2; i++) {
      particles.push({
        x: mouse.x + (Math.random() - 0.5) * 6,
        y: mouse.y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.6,
        vy: t.drift + (Math.random() - 0.5) * 0.6,
        r: 2 + Math.random() * (t.id === 'smoke' ? 6 : 3),
        life: 1,
        decay: t.id === 'smoke' ? 0.012 : 0.02,
        color: t.color,
      });
    }
  }

  function tick() {
    requestAnimationFrame(tick);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (themeIndex === 0) return;
    var theme = THEMES[themeIndex];

    spawn();
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + p.color[0] + ',' + p.color[1] + ',' + p.color[2] + ',' + (p.life * 0.5) + ')';
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glow aura around the real system cursor (which stays visible) — no dot on top of it
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = theme.glow;
    ctx.beginPath();
    ctx.fillStyle = theme.glow;
    ctx.arc(mouse.x, mouse.y, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  requestAnimationFrame(tick);
})();
