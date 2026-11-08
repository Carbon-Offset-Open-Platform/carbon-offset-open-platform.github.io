// Privacy-respecting analytics: which sections are seen and which links and
// CTAs are used. No cookies, no personal data, no form contents, no per-visitor
// IDs. Events go to Vercel Web Analytics (cookieless, aggregate) when it is
// enabled for the project, and do nothing otherwise.
(function () {
  function send(name, props) {
    try {
      if (typeof window.va === 'function') window.va('event', Object.assign({ name: name }, props || {}));
    } catch (e) { /* analytics must never break the page */ }
  }
  window.scoopTrack = send;

  // Each section counts once per page view, when at least 40% of it is on screen.
  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = en.target.id;
        if (en.isIntersecting && !seen[id]) {
          seen[id] = true;
          send('section_view', { section: id });
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('section[id]').forEach(function (s) { io.observe(s); });
  }

  // Link and button clicks: where the link goes, and the visible label.
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a[href], button[data-track]');
    if (!el) return;
    if (el.hasAttribute('data-track')) { send(el.getAttribute('data-track')); return; }
    var href = el.getAttribute('href') || '';
    var external = /^https?:/.test(href) && href.indexOf(location.origin) !== 0;
    send('link_click', {
      to: external ? new URL(href).hostname : href,
      label: (el.textContent || '').trim().slice(0, 40),
    });
  });
})();
