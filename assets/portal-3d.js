(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var noHover = window.matchMedia('(hover: none)').matches;
  if (reduceMotion || noHover) return;

  var tiles = document.querySelectorAll('#portal .scoop-tile');
  var MAX_TILT = 8;
  var raf = null;

  tiles.forEach(function (tile) {
    var pending = null;

    tile.addEventListener('pointerenter', function () {
      tile.classList.add('is-tilting');
    });

    tile.addEventListener('pointermove', function (e) {
      pending = e;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        if (!pending) return;
        var rect = tile.getBoundingClientRect();
        var px = (pending.clientX - rect.left) / rect.width;
        var py = (pending.clientY - rect.top) / rect.height;
        var tiltX = (px - 0.5) * MAX_TILT * 2;
        var tiltY = (0.5 - py) * MAX_TILT * 2;
        tile.style.setProperty('--tilt-x', tiltX.toFixed(2) + 'deg');
        tile.style.setProperty('--tilt-y', tiltY.toFixed(2) + 'deg');
        tile.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        tile.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        pending = null;
      });
    });

    tile.addEventListener('pointerleave', function () {
      tile.classList.remove('is-tilting');
      tile.style.setProperty('--tilt-x', '0deg');
      tile.style.setProperty('--tilt-y', '0deg');
      tile.style.setProperty('--mx', '50%');
      tile.style.setProperty('--my', '50%');
    });
  });
})();
