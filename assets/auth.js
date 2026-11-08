(function () {
  var link = document.getElementById('sign-in-link');
  if (!link) return;

  var modal = null;

  function buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'am-overlay';
    overlay.innerHTML =
      '<div class="am-panel" role="dialog" aria-modal="true">' +
        '<div class="am-head">' +
          '<div class="am-tabs">' +
            '<button type="button" class="am-tab is-active" data-tab="signin">Sign in</button>' +
            '<button type="button" class="am-tab" data-tab="signup">Create account</button>' +
          '</div>' +
          '<button type="button" class="am-close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="am-body">' +
          '<form class="am-form" data-form="signin">' +
            '<div class="am-field"><label for="am-signin-email">Email</label><input id="am-signin-email" type="email" required autocomplete="email"></div>' +
            '<div class="am-field"><label for="am-signin-password">Password</label><input id="am-signin-password" type="password" required autocomplete="current-password"></div>' +
            '<div class="am-error" hidden></div>' +
            '<button type="submit" class="am-submit">Sign in</button>' +
          '</form>' +
          '<form class="am-form" data-form="signup" hidden>' +
            '<div class="am-field"><label for="am-signup-name">Name</label><input id="am-signup-name" type="text" autocomplete="name"></div>' +
            '<div class="am-field"><label for="am-signup-email">Email</label><input id="am-signup-email" type="email" required autocomplete="email"></div>' +
            '<div class="am-field"><label for="am-signup-password">Password</label><input id="am-signup-password" type="password" required minlength="8" autocomplete="new-password"></div>' +
            '<div class="am-error" hidden></div>' +
            '<button type="submit" class="am-submit">Create account</button>' +
          '</form>' +
          '<div class="am-divider">or</div>' +
          '<a class="am-vercel" href="/api/auth/login">Continue with Vercel</a>' +
        '</div>' +
        '<div class="am-foot">New here? Create an account — no invite needed.</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    overlay.querySelector('.am-close').addEventListener('click', closeModal);

    var tabs = overlay.querySelectorAll('.am-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        overlay.querySelectorAll('.am-form').forEach(function (f) {
          f.hidden = f.getAttribute('data-form') !== tab.getAttribute('data-tab');
        });
      });
    });

    overlay.querySelector('[data-form="signin"]').addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(this, '/api/auth/login-password', {
        email: document.getElementById('am-signin-email').value,
        password: document.getElementById('am-signin-password').value,
      });
    });

    overlay.querySelector('[data-form="signup"]').addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(this, '/api/auth/signup', {
        name: document.getElementById('am-signup-name').value,
        email: document.getElementById('am-signup-email').value,
        password: document.getElementById('am-signup-password').value,
      });
    });

    return overlay;
  }

  function submitForm(form, url, body) {
    var errorEl = form.querySelector('.am-error');
    var button = form.querySelector('.am-submit');
    errorEl.hidden = true;
    button.disabled = true;
    fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (!res.ok) {
          errorEl.textContent = res.data.detail || 'Something went wrong.';
          errorEl.hidden = false;
          button.disabled = false;
          return;
        }
        window.location.reload();
      })
      .catch(function () {
        errorEl.textContent = 'Network error. Try again.';
        errorEl.hidden = false;
        button.disabled = false;
      });
  }

  function openModal() {
    if (!modal) modal = buildModal();
    modal.classList.add('is-open');
  }

  function closeModal() {
    if (modal) modal.classList.remove('is-open');
  }

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (user) {
      if (user && user.signed_in) {
        link.textContent = user.name || user.email || 'Account';
        link.title = 'Signed in — click to sign out';
        link.addEventListener('click', function (e) {
          e.preventDefault();
          fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
            .then(function () { window.location.reload(); });
        });
      } else {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          openModal();
        });
      }
    })
    .catch(function () {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();
      });
    });
})();
