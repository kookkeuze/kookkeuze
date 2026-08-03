/* Topbar op de informatiepagina's (privacy, over-ons).
   Die pagina's draaien zonder index.js — dat is de complete app-code en hangt
   aan honderden elementen die hier niet bestaan. Ze deelden daardoor wel de
   vormgeving van de menubalk, maar toonden altijd hardcoded 'Inloggen' met een
   rood kruisje, ook als je gewoon ingelogd was. Dit scriptje leest hetzelfde
   token uit localStorage als index.js en zet de balk in de juiste stand. */
(function () {
  function decodeJwtPayload(token) {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return null;
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const base64 = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      return JSON.parse(atob(base64));
    } catch (_err) {
      return null;
    }
  }

  // Zelfde controle als getValidToken() in index.js: een verlopen token telt
  // als uitgelogd en wordt opgeruimd, zodat beide pagina's hetzelfde zeggen.
  function isLoggedIn() {
    const token = localStorage.getItem('token');
    if (!token) return false;

    const payload = decodeJwtPayload(token);
    if (!payload || !payload.exp || Date.now() >= payload.exp * 1000) {
      localStorage.removeItem('token');
      return false;
    }
    return true;
  }

  function syncAuthUI() {
    const loggedIn = isLoggedIn();
    const loginText = document.querySelector('.login-text');
    const badge = document.querySelector('.auth-status-badge');

    if (loginText) loginText.textContent = loggedIn ? 'Ingelogd' : 'Inloggen';
    if (badge) {
      badge.classList.toggle('is-logged-in', loggedIn);
      badge.innerHTML = loggedIn
        ? '<i class="fas fa-check"></i>'
        : '<i class="fas fa-times"></i>';
    }
  }

  syncAuthUI();

  // Uit- of inloggen in een ander tabblad moet hier ook meteen zichtbaar zijn.
  window.addEventListener('storage', (e) => {
    if (e.key === 'token' || e.key === null) syncAuthUI();
  });

  // Terugkomen via de back-knop serveert de pagina uit de bfcache, waardoor de
  // code hierboven niet opnieuw draait en de balk verouderd zou blijven.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) syncAuthUI();
  });
})();
