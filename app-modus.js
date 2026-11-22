// App-modus: als Kookkeuze vanaf het beginscherm is geopend (geïnstalleerde
// PWA), gedraagt de site zich als een app. Niet inzoomen met dubbeltik of
// knijpen, en niet meer opzij kunnen schuiven. In de gewone browser blijft
// zoomen gewoon werken (toegankelijkheid).
//
// Staat synchroon in de <head>, direct na de viewport-meta, zodat de class en
// de viewport al goed staan voordat de pagina getekend wordt.
(function () {
  var standalone = false;
  try {
    standalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true;
  } catch (_err) {
    return;
  }
  if (!standalone) return;

  document.documentElement.classList.add('app-modus');

  // Android/Chrome: houdt zich aan maximum-scale en user-scalable.
  var meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute('content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }

  // iOS negeert user-scalable=no; knijpzoom loopt daar via gesture-events.
  var blokkeer = function (e) { e.preventDefault(); };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
    document.addEventListener(type, blokkeer, { passive: false });
  });
})();
