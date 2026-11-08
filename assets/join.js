// Get involved: validates the form, then hands it to the visitor's own mail app.
// Nothing is sent from this site and nothing is stored, so the form works with
// no backend. The project contact receives the message from the visitor's address.
(function () {
  var CONTACT = 'Katrina.Pugh@tufts.edu';
  var form = document.getElementById('join-form');
  if (!form) return;

  var name = document.getElementById('jn-name');
  var email = document.getElementById('jn-email');
  var nameErr = document.getElementById('jn-name-err');
  var emailErr = document.getElementById('jn-email-err');
  var status = document.getElementById('join-status');

  function setError(input, box, message) {
    box.textContent = message || '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  // Clear an error as soon as the field is corrected.
  name.addEventListener('input', function () { if (name.value.trim()) setError(name, nameErr, ''); });
  email.addEventListener('input', function () { if (email.validity.valid) setError(email, emailErr, ''); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var ok = true;
    if (!name.value.trim()) {
      setError(name, nameErr, 'Please add your name.');
      ok = false;
    }
    if (!email.value.trim() || !email.checkValidity()) {
      setError(email, emailErr, 'Please enter an email address we can reply to.');
      ok = false;
    }
    if (!ok) {
      (name.value.trim() ? email : name).focus();
      status.textContent = '';
      return;
    }

    var data = new FormData(form);
    var role = data.get('role') || 'Other';
    var org = (data.get('org') || '').trim();
    var message = (data.get('message') || '').trim();

    var body = 'Hello,\n\nI would like to get involved with SCOOP.\n\n'
      + 'Name: ' + name.value.trim() + '\n'
      + 'I am a: ' + role + '\n'
      + (org ? 'Organization: ' + org + '\n' : '')
      + 'Reply to: ' + email.value.trim() + '\n'
      + (message ? '\n' + message + '\n' : '')
      + '\nSent from ' + location.href;

    var subject = 'SCOOP / IEEE P7802: getting involved (' + role + ')';
    var href = 'mailto:' + CONTACT
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(body);

    if (window.scoopTrack) window.scoopTrack('join_submit', { role: role });
    status.textContent = 'Opening your mail app. If nothing happens, write to ' + CONTACT + ' directly.';
    window.location.href = href;
  });
})();
