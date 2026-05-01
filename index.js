// index.js — volledig bestand (auto-login + betere foutmeldingen)

/* ========= API-basis & token-helper ========= */
function resolveApiBase() {
  const fromWindow = window.KOOKKEUZE_API_BASE;
  const fromMeta = document
    .querySelector('meta[name="kookkeuze-api-base"]')
    ?.getAttribute('content');

  const base = (fromWindow || fromMeta || window.location.origin || '').trim();
  return base.replace(/\/+$/, '');
}

const API_BASE = resolveApiBase();

const authHeaders = () => {
  const t = getValidToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

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

function getValidToken() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) {
    localStorage.removeItem('token');
    return null;
  }

  if (Date.now() >= payload.exp * 1000) {
    localStorage.removeItem('token');
    return null;
  }

  return token;
}

function getCurrentUserPayload() {
  const token = getValidToken();
  if (!token) return null;
  return decodeJwtPayload(token);
}

function getCurrentUserId() {
  return Number(getCurrentUserPayload()?.id || 0) || null;
}

function getActiveDatabaseMeta() {
  const activeId = Number(localStorage.getItem('activeDatabaseOwnerId') || 0);
  if (!activeId) return null;
  return accessibleDatabases.find(db => Number(db.owner_user_id) === activeId) || null;
}

function getActiveDatabaseOwnerId() {
  const stored = Number(localStorage.getItem('activeDatabaseOwnerId') || 0);
  if (Number.isInteger(stored) && stored > 0) return stored;
  const personal = accessibleDatabases.find(db => !!db.is_personal);
  return personal ? Number(personal.owner_user_id) : null;
}

function isSharedDatabaseActive() {
  const activeDb = getActiveDatabaseMeta();
  return !!activeDb && !activeDb.is_personal;
}

function getSharedDatabaseTargets() {
  const activeId = getActiveDatabaseOwnerId();
  return accessibleDatabases.filter(db =>
    !db.is_personal && Number(db.owner_user_id) !== Number(activeId)
  );
}

function appendActiveDatabaseParam(params) {
  const ownerId = getActiveDatabaseOwnerId();
  if (ownerId) params.set('dbOwnerId', String(ownerId));
}

function withActiveDatabaseBody(payload = {}) {
  const ownerId = getActiveDatabaseOwnerId();
  return ownerId ? { ...payload, dbOwnerId: ownerId } : payload;
}

function ensureLoggedInOrNotify(targetEl) {
  if (getValidToken()) return true;

  if (targetEl) {
    targetEl.innerHTML = '<p>Je sessie is verlopen. Log opnieuw in om verder te gaan.</p>';
  }
  if (typeof updateAuthUI === 'function') updateAuthUI();
  return false;
}

const PICNIC_DEEPLINK_URL = 'https://picnic.app/nl/deeplink/?path=winkel';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

/* ========= RECEPT AFBEELDINGEN ========= */
const recipeImageCache = new Map();
let pendingResetToken = null;

function fetchRecipeImage(url) {
  if (!url) return Promise.resolve(null);
  if (recipeImageCache.has(url)) return Promise.resolve(recipeImageCache.get(url));

  const endpoint = `${API_BASE}/api/recipe-image?url=${encodeURIComponent(url)}`;
  return fetch(endpoint, { headers: authHeaders() })
    .then(r => r.json())
    .then(d => {
      const imageUrl = d && d.imageUrl ? d.imageUrl : null;
      recipeImageCache.set(url, imageUrl);
      return imageUrl;
    })
    .catch(() => null);
}

function setOverviewImage(cell, imageUrl, title) {
  cell.innerHTML = '';
  cell.classList.add('is-loading');
  const safeTitle = (title || 'Recept').trim();

  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'recipe-thumb';
    img.alt = safeTitle;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = imageUrl;
    img.addEventListener('load', () => {
      cell.classList.remove('is-loading');
      cell.classList.add('is-loaded');
    });
    img.addEventListener('error', () => {
      renderImageFallback(cell, safeTitle);
    });
    cell.appendChild(img);
    return;
  }

  renderImageFallback(cell, safeTitle);
}

function setResultCardImage(container, imageUrl, title) {
  container.innerHTML = '';
  const safeTitle = (title || 'Recept').trim();

  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'recipe-card-image';
    img.alt = safeTitle;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = imageUrl;
    img.addEventListener('error', () => {
      container.innerHTML = '<div class="recipe-card-image-fallback">Geen foto</div>';
    });
    container.appendChild(img);
    return;
  }

  container.innerHTML = '<div class="recipe-card-image-fallback">Geen foto</div>';
}

function setWeekmenuSlotImage(container, imageUrl) {
  if (!container) return;
  container.innerHTML = '';
  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'weekmenu-slot-thumb';
    img.alt = 'Receptfoto';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = imageUrl;
    img.addEventListener('error', () => {
      container.innerHTML = '<div class="weekmenu-slot-thumb-fallback">Geen foto</div>';
    });
    container.appendChild(img);
    return;
  }
  container.innerHTML = '<div class="weekmenu-slot-thumb-fallback">Geen foto</div>';
}

function hydrateWeekmenuImages() {
  const cells = document.querySelectorAll('.weekmenu-slot-thumb-wrap[data-url]');
  cells.forEach(cell => {
    const url = decodeURIComponent(cell.dataset.url || '');
    fetchRecipeImage(url).then(imageUrl => setWeekmenuSlotImage(cell, imageUrl));
  });
}

function setWeekmenuSearchImage(container, imageUrl) {
  if (!container) return;
  container.innerHTML = '';
  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'weekmenu-search-thumb';
    img.alt = 'Receptfoto';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = imageUrl;
    img.addEventListener('error', () => {
      container.innerHTML = '<div class="weekmenu-search-thumb-fallback">Geen foto</div>';
    });
    container.appendChild(img);
    return;
  }
  container.innerHTML = '<div class="weekmenu-search-thumb-fallback">Geen foto</div>';
}

function hydrateWeekmenuSearchImages() {
  const cells = document.querySelectorAll('.weekmenu-search-thumb-wrap[data-url]');
  cells.forEach(cell => {
    const url = decodeURIComponent(cell.dataset.url || '');
    fetchRecipeImage(url).then(imageUrl => setWeekmenuSearchImage(cell, imageUrl));
  });
}

function renderImageFallback(cell, title) {
  cell.innerHTML = '';
  const fallback = document.createElement('div');
  fallback.className = 'recipe-thumb-fallback';
  fallback.textContent = title ? title[0].toUpperCase() : 'R';
  cell.appendChild(fallback);
  cell.classList.remove('is-loading');
  cell.classList.add('is-loaded');
}

function hydrateOverviewImages() {
  const cells = document.querySelectorAll('.overview-image-cell');
  cells.forEach(cell => {
    const url = decodeURIComponent(cell.dataset.url || '');
    const title = cell.dataset.title || 'Recept';
    fetchRecipeImage(url).then(imageUrl => {
      setOverviewImage(cell, imageUrl, title);
    });
  });
}

function hydrateResultImages() {
  const cells = document.querySelectorAll('.result-image-cell');
  cells.forEach(cell => {
    const url = decodeURIComponent(cell.dataset.url || '');
    const title = cell.dataset.title || 'Recept';
    fetchRecipeImage(url).then(imageUrl => {
      setResultCardImage(cell, imageUrl, title);
    });
  });
}

/* ========= Auto-login vanaf verify redirect =========
   Server redirect: https://kookkeuze.nl/auth/callback?token=XYZ
   Dit pakt de token op (op elke route), slaat 'm op, en schoont de URL. */
(function autoLoginFromVerify() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    pendingResetToken = params.get('resetToken');
    if (token) {
      localStorage.setItem('token', token);
      // URL opschonen (zonder ?token)
      const cleanUrl =
        window.location.origin +
        (window.location.pathname.startsWith('/auth/callback') ? '/' : window.location.pathname);
      window.history.replaceState({}, document.title, cleanUrl);
      if (typeof showMsg === 'function') showMsg('Je bent ingelogd. Welkom terug!', true);
      // UI meteen verversen
      if (typeof updateAuthUI === 'function') updateAuthUI();
      window.location.reload();
    } else if (pendingResetToken) {
      const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch (e) {
    console.error('Auto-login parse error:', e);
  }
})();

/* -- alles leegmaken & melding wissen -- */
function resetForms() {
  document.getElementById('login-form')   .reset();
  document.getElementById('register-form').reset();
  document.getElementById('forgot-form')?.reset();
  document.getElementById('reset-form')?.reset();
  msgBox.textContent = '';
  msgBox.classList.remove('success', 'error');
}

/* ========= TABS ========= */
const tabLinks     = document.querySelectorAll('.tab-link');
const tabContents  = document.querySelectorAll('.tab-content');
const installAppBtn = document.getElementById('installAppBtn');
const installAppText = document.getElementById('installAppText');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileHeaderMenu = document.getElementById('mobileHeaderMenu');
const mobileHeaderMenuLinks = document.querySelectorAll('.mobile-header-menu-link[data-target]');
const mobileInstallAppBtn = document.getElementById('mobileInstallAppBtn');
const mobileDatabaseMenuBtn = document.getElementById('mobileDatabaseMenuBtn');
const mobileActiveTabLabel = document.getElementById('mobileActiveTabLabel');
const databaseMenuBtn = document.getElementById('databaseMenuBtn');
const databaseModal = document.getElementById('databaseModal');
const closeDatabaseModal = document.getElementById('closeDatabaseModal');
const databaseBar = document.getElementById('databaseBar');
const activeDatabaseSelect = document.getElementById('activeDatabaseSelect');
const toggleSharePanelBtn = document.getElementById('toggleSharePanelBtn');
const sharePanel = document.getElementById('sharePanel');
const shareInviteEmail = document.getElementById('shareInviteEmail');
const shareInviteBtn = document.getElementById('shareInviteBtn');
const sharePanelMsg = document.getElementById('sharePanelMsg');
const shareMembersList = document.getElementById('shareMembersList');
const shareInvitesList = document.getElementById('shareInvitesList');
const recipePackModal = document.getElementById('recipePackModal');
const closeRecipePackModalBtn = document.getElementById('closeRecipePackModal');
const recipePackModalBody = document.getElementById('recipePackModalBody');
let deferredInstallPrompt = null;
let accessibleDatabases = [];
let activeDatabaseOwnerId = null;
let recipePackList = [];
let recipePackIndex = 0;
let recipePackFromOnboarding = false;
let recipePackStats = { added: 0, skipped: 0, inserted: 0, duplicates: 0 };
let recipePackOnboardingCheckedForUserId = null;
let recipePackOnboardingMarkedDone = false;

function closeMobileHeaderMenu() {
  if (!mobileHeaderMenu || !mobileMenuBtn) return;
  mobileHeaderMenu.classList.add('hidden');
  mobileHeaderMenu.setAttribute('aria-hidden', 'true');
  mobileMenuBtn.setAttribute('aria-expanded', 'false');
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 767px)').matches;
}

function getTabLabel(targetId) {
  const match = document.querySelector(`.nav-tabs a[href="${targetId}"]`);
  return (match?.textContent || '').trim();
}

function activateTab(targetId) {
  if (!targetId) return;
  const targetLink = document.querySelector(`.nav-tabs a[href="${targetId}"]`);
  const targetContent = document.querySelector(targetId);
  if (!targetLink || !targetContent) return;

  tabLinks.forEach(l => l.classList.remove('active'));
  tabContents.forEach(tc => tc.classList.remove('active'));
  mobileHeaderMenuLinks.forEach(btn => btn.classList.remove('active'));

  targetLink.classList.add('active');
  targetContent.classList.add('active');
  mobileHeaderMenuLinks.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });
  if (mobileActiveTabLabel) {
    mobileActiveTabLabel.textContent = getTabLabel(targetId);
  }

  if (targetId === '#overzichtRecepten') fetchAllRecipes();
  if (targetId === '#weekmenuPlanner') initWeekPlanner();
  if (isMobileViewport()) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

tabLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    activateTab(link.getAttribute('href'));
  });
});

mobileHeaderMenuLinks.forEach(btn => {
  btn.addEventListener('click', () => {
    activateTab(btn.dataset.target);
    closeMobileHeaderMenu();
  });
});

mobileInstallAppBtn?.addEventListener('click', () => {
  closeMobileHeaderMenu();
  installAppBtn?.click();
});

mobileDatabaseMenuBtn?.addEventListener('click', () => {
  closeMobileHeaderMenu();
  databaseMenuBtn?.click();
});

mobileMenuBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (!mobileHeaderMenu) return;
  const willOpen = mobileHeaderMenu.classList.contains('hidden');
  if (willOpen) {
    mobileHeaderMenu.classList.remove('hidden');
    mobileHeaderMenu.setAttribute('aria-hidden', 'false');
    mobileMenuBtn.setAttribute('aria-expanded', 'true');
    return;
  }
  closeMobileHeaderMenu();
});

document.addEventListener('click', e => {
  if (!mobileHeaderMenu || !mobileMenuBtn) return;
  if (mobileHeaderMenu.classList.contains('hidden')) return;
  if (mobileHeaderMenu.contains(e.target) || mobileMenuBtn.contains(e.target)) return;
  closeMobileHeaderMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMobileHeaderMenu();
});

const activeTabOnLoad = document.querySelector('.tab-link.active');
if (activeTabOnLoad) activateTab(activeTabOnLoad.getAttribute('href'));

function setSharePanelMessage(text, isError = false) {
  if (!sharePanelMsg) return;
  sharePanelMsg.textContent = text || '';
  sharePanelMsg.classList.toggle('error', !!isError);
  sharePanelMsg.classList.toggle('success', !!text && !isError);
}

function renderDatabaseSelect() {
  if (!activeDatabaseSelect) return;
  const selectedId = getActiveDatabaseOwnerId();
  activeDatabaseSelect.innerHTML = accessibleDatabases.map(db => {
    let label = db.database_name || 'Database';
    if (db.is_personal) label = `Persoonlijk (${db.owner_email})`;
    else if (db.owner_email) label = `${label} (${db.owner_email})`;
    return `<option value="${db.owner_user_id}" ${Number(db.owner_user_id) === Number(selectedId) ? 'selected' : ''}>${label}</option>`;
  }).join('');
  if (selectedId && !accessibleDatabases.some(db => Number(db.owner_user_id) === Number(selectedId))) {
    const personal = accessibleDatabases.find(db => !!db.is_personal) || accessibleDatabases[0];
    if (personal) localStorage.setItem('activeDatabaseOwnerId', String(personal.owner_user_id));
  }
}

async function loadSharePanelData() {
  if (!getValidToken() || !shareMembersList || !shareInvitesList) return;
  const activeId = getActiveDatabaseOwnerId();
  const activeDb = accessibleDatabases.find(db => Number(db.owner_user_id) === Number(activeId));
  const canManage = !!activeDb?.can_manage;
  if (!canManage) {
    shareMembersList.innerHTML = '<p class="share-empty">Schakel naar een database met beheerrechten om delen te beheren.</p>';
    shareInvitesList.innerHTML = '<p class="share-empty">Schakel naar een database met beheerrechten om uitnodigingen te beheren.</p>';
    return;
  }

  const params = new URLSearchParams();
  appendActiveDatabaseParam(params);
  const res = await fetch(`${API_BASE}/api/databases/shares?${params.toString()}`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    shareMembersList.innerHTML = '<p class="share-empty">Kon leden niet laden.</p>';
    shareInvitesList.innerHTML = '<p class="share-empty">Kon uitnodigingen niet laden.</p>';
    return;
  }

  const members = Array.isArray(data.members) ? data.members : [];
  const invites = Array.isArray(data.invites) ? data.invites : [];

  shareMembersList.innerHTML = members.length
    ? members.map(m => `
        <div class="share-item">
          <span>${m.email}${m.role === 'admin' ? ' (beheerder)' : ''}</span>
          ${m.role === 'admin' ? '' : `<button type="button" class="pink-btn share-remove-member-btn" data-member-id="${m.member_user_id}">Intrekken</button>`}
        </div>`).join('')
    : '<p class="share-empty">Nog geen gedeelde leden.</p>';

  shareInvitesList.innerHTML = invites.length
    ? invites.map(inv => `
        <div class="share-item">
          <span>${inv.invite_email}</span>
          <button type="button" class="pink-btn share-cancel-invite-btn" data-invite-id="${inv.id}">Intrekken</button>
        </div>`).join('')
    : '<p class="share-empty">Geen openstaande uitnodigingen.</p>';
}

async function loadAccessibleDatabases() {
  if (!getValidToken()) {
    accessibleDatabases = [];
    if (databaseMenuBtn) databaseMenuBtn.classList.add('hidden');
    if (mobileDatabaseMenuBtn) mobileDatabaseMenuBtn.classList.add('hidden');
    if (sharePanel) sharePanel.classList.add('hidden');
    if (databaseModal) databaseModal.classList.add('hidden');
    return;
  }

  const res = await fetch(`${API_BASE}/api/databases`, { headers: authHeaders() });
  const list = await res.json().catch(() => []);
  accessibleDatabases = Array.isArray(list) ? list : [];
  if (accessibleDatabases.length && !localStorage.getItem('activeDatabaseOwnerId')) {
    const personal = accessibleDatabases.find(db => !!db.is_personal) || accessibleDatabases[0];
    localStorage.setItem('activeDatabaseOwnerId', String(personal.owner_user_id));
  }
  if (databaseMenuBtn) databaseMenuBtn.classList.toggle('hidden', accessibleDatabases.length === 0);
  if (mobileDatabaseMenuBtn) mobileDatabaseMenuBtn.classList.toggle('hidden', accessibleDatabases.length === 0);
  renderDatabaseSelect();
  await loadSharePanelData();
}

activeDatabaseSelect?.addEventListener('change', async () => {
  localStorage.setItem('activeDatabaseOwnerId', activeDatabaseSelect.value);
  setSharePanelMessage('');
  await loadSharePanelData();
  fetchAllRecipes();
  renderPlannerSearchResults();
  initWeekPlanner();
});

toggleSharePanelBtn?.addEventListener('click', async () => {
  sharePanel?.classList.toggle('hidden');
  if (!sharePanel?.classList.contains('hidden')) {
    await loadSharePanelData();
  }
});

databaseMenuBtn?.addEventListener('click', async () => {
  if (!getValidToken()) return;
  await loadAccessibleDatabases();
  databaseModal?.classList.remove('hidden');
});

closeDatabaseModal?.addEventListener('click', () => {
  databaseModal?.classList.add('hidden');
});

databaseModal?.addEventListener('click', e => {
  if (e.target === databaseModal) databaseModal.classList.add('hidden');
});

shareInviteBtn?.addEventListener('click', async () => {
  const email = String(shareInviteEmail?.value || '').trim().toLowerCase();
  if (!email) {
    setSharePanelMessage('Vul een e-mailadres in.', true);
    return;
  }

  const res = await fetch(`${API_BASE}/api/databases/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(withActiveDatabaseBody({ email }))
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setSharePanelMessage(data.error || 'Uitnodigen mislukt.', true);
    return;
  }
  setSharePanelMessage(data.message || 'Uitnodiging verstuurd.');
  if (shareInviteEmail) shareInviteEmail.value = '';
  await loadAccessibleDatabases();
});

sharePanel?.addEventListener('click', async e => {
  const removeMemberBtn = e.target.closest('.share-remove-member-btn');
  if (removeMemberBtn) {
    const memberId = removeMemberBtn.dataset.memberId;
    const params = new URLSearchParams();
    appendActiveDatabaseParam(params);
    await fetch(`${API_BASE}/api/databases/members/${memberId}?${params.toString()}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    await loadAccessibleDatabases();
    return;
  }

  const cancelInviteBtn = e.target.closest('.share-cancel-invite-btn');
  if (cancelInviteBtn) {
    const inviteId = cancelInviteBtn.dataset.inviteId;
    const params = new URLSearchParams();
    appendActiveDatabaseParam(params);
    await fetch(`${API_BASE}/api/databases/invites/${inviteId}?${params.toString()}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    await loadSharePanelData();
  }
});

async function fetchRecipePacks() {
  if (!getValidToken()) return [];
  const res = await fetch(`${API_BASE}/api/recipe-packs`, { headers: authHeaders() });
  const data = await res.json().catch(() => []);
  if (!res.ok) return [];
  return Array.isArray(data) ? data : [];
}

async function markRecipePackOnboardingComplete() {
  if (!getValidToken() || recipePackOnboardingMarkedDone) return;
  recipePackOnboardingMarkedDone = true;
  await fetch(`${API_BASE}/api/recipe-packs/onboarding-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() }
  }).catch(() => {});
}

function renderRecipePackSummary() {
  if (!recipePackModalBody) return;
  recipePackModalBody.innerHTML = `
    <div class="recipe-pack-summary">
      <h4>Klaar! Je pakketten zijn verwerkt.</h4>
      <p>Toegevoegd: <strong>${recipePackStats.inserted}</strong> recepten</p>
      <p>Overgeslagen (bestond al): <strong>${recipePackStats.duplicates}</strong></p>
      <button id="recipePackDoneBtn" type="button" class="green-btn">Sluiten</button>
    </div>
  `;
  document.getElementById('recipePackDoneBtn')?.addEventListener('click', closeRecipePackModal);
}

function renderRecipePackStep() {
  if (!recipePackModalBody) return;
  if (!recipePackList.length || recipePackIndex >= recipePackList.length) {
    renderRecipePackSummary();
    return;
  }

  const pack = recipePackList[recipePackIndex];
  const progress = `${recipePackIndex + 1} / ${recipePackList.length}`;
  recipePackModalBody.innerHTML = `
    <div class="recipe-pack-card">
      <p class="recipe-pack-progress">${progress}</p>
      <div class="recipe-pack-icon"><i class="fas ${pack.icon || 'fa-box-open'}"></i></div>
      <h4>${pack.title}</h4>
      <p class="recipe-pack-subtitle">${pack.subtitle || ''}</p>
      <p class="recipe-pack-description">${pack.description || ''}</p>
      <p class="recipe-pack-count">${pack.total_recipes || 0} recepten</p>
      <div class="recipe-pack-actions">
        <button id="recipePackSkipBtn" type="button" class="recipe-pack-skip-btn" aria-label="Pakket overslaan">
          <i class="fas fa-times"></i>
        </button>
        <button id="recipePackAddBtn" type="button" class="recipe-pack-add-btn" aria-label="Pakket toevoegen">
          <i class="fas fa-check"></i>
        </button>
      </div>
    </div>
  `;

  document.getElementById('recipePackSkipBtn')?.addEventListener('click', () => {
    recipePackStats.skipped += 1;
    recipePackIndex += 1;
    renderRecipePackStep();
  });

  document.getElementById('recipePackAddBtn')?.addEventListener('click', async (e) => {
    const addBtn = e.currentTarget;
    addBtn.disabled = true;
    addBtn.classList.add('is-loading');
    try {
      const res = await fetch(`${API_BASE}/api/recipe-packs/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(withActiveDatabaseBody({ packKey: pack.key }))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Pakket toevoegen mislukt.');
      } else {
        recipePackStats.added += 1;
        recipePackStats.inserted += Number(data.inserted || 0);
        recipePackStats.duplicates += Number(data.skipped || 0);
        showRecipeAddedToast(`${pack.title}: ${data.inserted || 0} toegevoegd`);
        fetchAllRecipes();
        renderPlannerSearchResults();
      }
    } catch (_err) {
      alert('Pakket toevoegen mislukt.');
    } finally {
      recipePackIndex += 1;
      renderRecipePackStep();
    }
  });
}

function closeRecipePackModal() {
  recipePackModal?.classList.add('hidden');
  if (recipePackFromOnboarding) {
    recipePackFromOnboarding = false;
    activateTab('#kiesRecept');
  }
}

async function openRecipePackFlow(options = {}) {
  if (!getValidToken()) return;
  const { fromOnboarding = false } = options;
  recipePackFromOnboarding = !!fromOnboarding;
  if (recipePackFromOnboarding) {
    await markRecipePackOnboardingComplete();
  }
  recipePackList = await fetchRecipePacks();
  if (!recipePackList.length) {
    alert('Er zijn nu geen pakketten beschikbaar.');
    return;
  }
  recipePackIndex = 0;
  recipePackStats = { added: 0, skipped: 0, inserted: 0, duplicates: 0 };
  recipePackModal?.classList.remove('hidden');
  renderRecipePackStep();
}

async function maybeStartRecipePackOnboarding() {
  const token = getValidToken();
  if (!token) return;
  const userId = getCurrentUserId();
  if (!userId || recipePackOnboardingCheckedForUserId === userId) return;
  recipePackOnboardingCheckedForUserId = userId;
  recipePackOnboardingMarkedDone = false;

  try {
    const res = await fetch(`${API_BASE}/api/recipe-packs/onboarding-status`, {
      headers: authHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    if (data.shouldShow) {
      activateTab('#overzichtRecepten');
      await openRecipePackFlow({ fromOnboarding: true });
    } else if (data.seen) {
      recipePackOnboardingMarkedDone = true;
    }
  } catch (_err) {
    // onboarding check is best effort
  }
}

closeRecipePackModalBtn?.addEventListener('click', closeRecipePackModal);
recipePackModal?.addEventListener('click', e => {
  if (e.target === recipePackModal) closeRecipePackModal();
});

/* ========= FILTERS & ZOEKEN (TAB 1) ========= */
const dishTypeSelect      = document.getElementById('dishType');
const mealCategorySelect  = document.getElementById('mealCategory');
const mealTypeSelect      = document.getElementById('mealType');
const timeRequiredSelect  = document.getElementById('timeRequired');
const calorieRangeSelect  = document.getElementById('calorieRange');
const resultDiv           = document.getElementById('result');

function getSelectedValues(select) {
  if (!select) return [];
  if (select._multiSelectApi) return select._multiSelectApi.getValues();
  if (select.value) return [select.value];
  return [];
}

function extractSelectedOptions(options, rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) return [];
  return options.filter(opt =>
    text === opt ||
    text.startsWith(`${opt}, `) ||
    text.endsWith(`, ${opt}`) ||
    text.includes(`, ${opt}, `)
  );
}

function setMultiSelectValues(selectId, values) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const normalized = Array.isArray(values) ? values.filter(Boolean) : (values ? [values] : []);
  if (select._multiSelectApi) {
    select._multiSelectApi.setValues(normalized);
    return;
  }
  Array.from(select.options).forEach(option => {
    option.selected = normalized.includes(option.value || option.textContent.trim());
  });
}

function createMultiSelect(select, placeholderLabel) {
  if (!select) return;
  const optionItems = Array.from(select.options).filter(opt => {
    const text = (opt.value || opt.textContent || '').trim();
    return text && text !== placeholderLabel && text !== 'maak een keuze';
  });
  if (optionItems.length === 0) return;
  const initiallySelected = optionItems
    .filter(opt => opt.selected)
    .map(opt => (opt.value || opt.textContent || '').trim());

  const wrapper = document.createElement('div');
  wrapper.className = 'multi-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'multi-select-trigger';
  trigger.setAttribute('aria-expanded', 'false');

  const triggerText = document.createElement('span');
  triggerText.className = 'multi-select-text';
  triggerText.textContent = placeholderLabel;

  const triggerIcon = document.createElement('i');
  triggerIcon.className = 'fas fa-chevron-down multi-select-chevron';

  trigger.appendChild(triggerText);
  trigger.appendChild(triggerIcon);

  const menu = document.createElement('div');
  menu.className = 'multi-select-menu';

  function updateLabel() {
    const selected = optionItems.filter(opt => opt.selected).map(opt => (opt.value || opt.textContent || '').trim());
    if (selected.length === 0) {
      triggerText.textContent = placeholderLabel;
      return;
    }
    triggerText.textContent = selected.join(', ');
  }

  optionItems.forEach(opt => {
    const value = (opt.value || opt.textContent || '').trim();
    const item = document.createElement('label');
    item.className = 'multi-select-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!opt.selected;

    const text = document.createElement('span');
    text.textContent = value;

    checkbox.addEventListener('change', () => {
      opt.selected = checkbox.checked;
      updateLabel();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    item.appendChild(checkbox);
    item.appendChild(text);
    menu.appendChild(item);
  });

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.multi-select.open').forEach(node => {
      if (node !== wrapper) node.classList.remove('open');
    });
    wrapper.classList.toggle('open');
    trigger.setAttribute('aria-expanded', wrapper.classList.contains('open') ? 'true' : 'false');
  });

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);

  select.classList.add('multi-select-native');
  select.multiple = true;
  Array.from(select.options).forEach(opt => { opt.selected = false; });
  optionItems.forEach(opt => {
    const value = (opt.value || opt.textContent || '').trim();
    if (initiallySelected.includes(value)) opt.selected = true;
  });
  select.after(wrapper);

  select._multiSelectApi = {
    getValues: () => optionItems.filter(opt => opt.selected).map(opt => (opt.value || opt.textContent || '').trim()),
    setValues: values => {
      const selected = new Set(values);
      Array.from(select.options).forEach(opt => { opt.selected = false; });
      optionItems.forEach((opt, idx) => {
        opt.selected = selected.has((opt.value || opt.textContent || '').trim());
        const checkbox = menu.children[idx]?.querySelector('input');
        if (checkbox) checkbox.checked = !!opt.selected;
      });
      updateLabel();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    clear: () => {
      Array.from(select.options).forEach(opt => { opt.selected = false; });
      optionItems.forEach((opt, idx) => {
        opt.selected = false;
        const checkbox = menu.children[idx]?.querySelector('input');
        if (checkbox) checkbox.checked = false;
      });
      updateLabel();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  updateLabel();
}

[
  [dishTypeSelect, 'Soort gerecht'],
  [mealCategorySelect, 'Menugang'],
  [mealTypeSelect, 'Doel gerecht'],
  [timeRequiredSelect, 'Tijd'],
  [calorieRangeSelect, 'Calorieën'],
  [document.getElementById('dishTypeNew'), 'Soort gerecht'],
  [document.getElementById('mealCategoryNew'), 'Menugang'],
  [document.getElementById('mealTypeNew'), 'Doel gerecht'],
  [document.getElementById('timeRequiredNew'), 'Tijd']
].forEach(([select, placeholder]) => createMultiSelect(select, placeholder));

document.addEventListener('click', e => {
  document.querySelectorAll('.multi-select.open').forEach(node => {
    if (!node.contains(e.target)) node.classList.remove('open');
  });
});

/* — Zoekknop — */
document.getElementById('searchBtn').addEventListener('click', () => {
  if (!ensureLoggedInOrNotify(resultDiv)) return;
  const params = new URLSearchParams();
  getSelectedValues(dishTypeSelect).forEach(v => params.append('dish_type', v));
  getSelectedValues(mealCategorySelect).forEach(v => params.append('meal_category', v));
  getSelectedValues(mealTypeSelect).forEach(v => params.append('meal_type', v));
  getSelectedValues(timeRequiredSelect).forEach(v => params.append('time_required', v));
  getSelectedValues(calorieRangeSelect).forEach(v => params.append('calorieRange', v));

  const searchTerm = document.getElementById('searchTerm').value.trim();
  if (searchTerm) params.append('search', searchTerm);
  appendActiveDatabaseParam(params);

  const qs = params.toString();
  fetch(`${API_BASE}/api/recipes?` + qs, {
    headers: authHeaders() // ✅ JWT meesturen
  })
    .then(r => r.json())
    .then(showRecipes)
    .catch(console.error);
});

/* — Random recept — */
document.getElementById('randomBtn').addEventListener('click', () => {
  if (!ensureLoggedInOrNotify(resultDiv)) return;
  const params = new URLSearchParams();
  getSelectedValues(dishTypeSelect).forEach(v => params.append('dish_type', v));
  getSelectedValues(mealCategorySelect).forEach(v => params.append('meal_category', v));
  getSelectedValues(mealTypeSelect).forEach(v => params.append('meal_type', v));
  getSelectedValues(timeRequiredSelect).forEach(v => params.append('time_required', v));
  getSelectedValues(calorieRangeSelect).forEach(v => params.append('calorieRange', v));
  appendActiveDatabaseParam(params);

  const qs = params.toString();
  fetch(`${API_BASE}/api/recipes/random?` + qs, {
    headers: authHeaders() // ✅ JWT meesturen
  })
    .then(r => r.json())
    .then(d => {
      if (!d || d.message === 'Geen resultaten gevonden.') {
        resultDiv.innerHTML = '<p>Geen resultaten gevonden.</p>';
      } else {
        showRecipes([d]);
      }
    })
    .catch(err => {
      console.error(err);
      resultDiv.innerHTML = '<p>Er ging iets fout bij het ophalen van een random recept.</p>';
    });
});

function showRecipes(arr) {
  if (!arr || arr.length === 0) {
    resultDiv.innerHTML = '<p>Geen resultaten gevonden.</p>';
    return;
  }
  const singleClass = arr.length === 1 ? ' single-result' : '';
  const sharedTargets = getSharedDatabaseTargets();
  const importMode = isSharedDatabaseActive()
    ? 'to-own'
    : (sharedTargets.length ? 'to-shared' : null);
  const importLabel = importMode === 'to-own'
    ? 'Importeer naar mijn database'
    : 'Importeer naar gedeelde database';
  let html = `<div class="recipe-cards-container search-results${singleClass}">`;
  arr.forEach(r => {
    const safeUrl = encodeURIComponent(r.url || '');
    const safeHref = escapeAttr(r.url || '');
    const safeTitle = escapeAttr(r.title || 'Recept');
    const displayTitle = escapeHtml(r.title || 'Recept');
    html += `
      <div class="recipe-card">
        <div class="result-image-cell" data-url="${safeUrl}" data-title="${safeTitle}">
          <div class="recipe-card-image-skeleton"></div>
        </div>
        <div class="recipe-card-content">
          <h3>${displayTitle}</h3>
          <div class="recipe-card-actions${importMode ? ' has-import' : ''}">
            <p class="recipe-link"><a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="ext-link">
              Bekijk&nbsp;recept&nbsp;<i class="fas fa-external-link-alt"></i></a></p>
            <button type="button" class="plan-weekmenu-btn plan-recipe-btn" data-recipe-id="${r.id}" data-recipe-title="${safeTitle}">Plan in weekmenu</button>
            ${importMode ? `<button type="button" class="plan-weekmenu-btn import-transfer-btn import-recipe-btn" data-recipe-id="${r.id}" data-import-mode="${importMode}">${importLabel}</button>` : ''}
          </div>
          <div class="recipe-meta-row">
            <span class="recipe-meta-pill"><i class="far fa-clock"></i> ${r.time_required || '-'}</span>
            <span class="recipe-meta-pill"><i class="fas fa-fire"></i> ${r.calories ?? '-'} kcal</span>
          </div>
          <ul>
            <li><i class="fas fa-utensils"></i> <strong>Soort:</strong> ${r.dish_type || '-'}</li>
            <li><i class="fas fa-layer-group"></i> <strong>Menugang:</strong> ${r.meal_category || '-'}</li>
            <li><i class="fas fa-bullseye"></i> <strong>Doel gerecht:</strong> ${r.meal_type || '-'}</li>
          </ul>
          <div class="recipe-card-footer">
            <div class="recipe-export-menu">
              <button
                type="button"
                class="recipe-export-trigger"
                data-export-toggle
                aria-haspopup="true"
                aria-expanded="false"
                aria-label="Open exportmenu voor ${safeTitle}"
              >
                <i class="fas fa-share-alt" aria-hidden="true"></i>
                <span>Exporteer</span>
                <i class="fas fa-chevron-down export-chevron" aria-hidden="true"></i>
              </button>
              <div class="recipe-export-dropdown hidden" data-export-menu>
                <button type="button" class="recipe-export-option notes-export-option" data-recipe-url="${safeUrl}" data-recipe-title="${safeTitle}">
                  <span class="notes-button-mark" aria-hidden="true"><i class="fas fa-note-sticky"></i></span>
                  <span>Notities</span>
                </button>
                <button type="button" class="recipe-export-option picnic-export-option" data-recipe-url="${safeUrl}" data-recipe-title="${safeTitle}">
                  <span class="picnic-button-mark" aria-hidden="true">P</span>
                  <span>Picnic</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  });
  html += '</div>';
  resultDiv.innerHTML = html;
  hydrateResultImages();
}

const picnicModal = document.getElementById('picnicModal');
const closePicnicModal = document.getElementById('closePicnicModal');
const picnicModalBody = document.getElementById('picnicModalBody');
const picnicModalRecipeTitle = document.getElementById('picnicModalRecipeTitle');
let picnicModalState = {
  title: '',
  url: '',
  ingredients: []
};

function closePicnicShoppingModal() {
  picnicModal?.classList.add('hidden');
  picnicModal?.setAttribute('aria-hidden', 'true');
}

function setPicnicModalLoading() {
  if (!picnicModalBody) return;
  picnicModalBody.innerHTML = `
    <div class="picnic-loading">
      <span class="picnic-spinner" aria-hidden="true"></span>
      <p>Ingrediënten ophalen...</p>
    </div>
  `;
}

function updatePicnicSelectedCount() {
  const countEl = document.getElementById('picnicSelectedCount');
  const actionBtn = document.getElementById('picnicOpenBtn');
  if (!countEl) return;

  const selectedCount = picnicModalBody
    ? picnicModalBody.querySelectorAll('.picnic-ingredient-checkbox:checked').length
    : 0;
  countEl.textContent = `${selectedCount} geselecteerd`;
  if (actionBtn) actionBtn.disabled = selectedCount === 0;
}

function renderPicnicIngredients(ingredients) {
  if (!picnicModalBody) return;

  if (!ingredients.length) {
    const safeRecipeUrl = escapeAttr(picnicModalState.url);
    picnicModalBody.innerHTML = `
      <div class="picnic-empty-state">
        <i class="fas fa-list-ul" aria-hidden="true"></i>
        <p>Voor dit recept konden geen ingrediënten automatisch worden gevonden.</p>
        <a href="${safeRecipeUrl}" target="_blank" rel="noopener noreferrer" class="picnic-recipe-open-link">Open recept</a>
      </div>
    `;
    return;
  }

  const items = ingredients.map((ingredient, index) => `
    <label class="picnic-ingredient-item">
      <input class="picnic-ingredient-checkbox" type="checkbox" data-index="${index}" checked>
      <span>${escapeHtml(ingredient)}</span>
    </label>
  `).join('');

  picnicModalBody.innerHTML = `
    <div class="picnic-list-toolbar">
      <span id="picnicSelectedCount" class="picnic-selected-count"></span>
      <div class="picnic-list-tools">
        <button id="picnicSelectAllBtn" type="button" class="picnic-tool-btn">Alles</button>
        <button id="picnicSelectNoneBtn" type="button" class="picnic-tool-btn">Niets</button>
      </div>
    </div>
    <p class="picnic-help-text">Picnic importeert deze lijst niet automatisch. Kopieer je selectie en open daarna zelf de Picnic-app.</p>
    <div class="picnic-ingredient-list">${items}</div>
    <div id="picnicFeedback" class="picnic-feedback" role="status" aria-live="polite"></div>
    <div class="picnic-modal-actions">
      <button id="picnicCopyBtn" type="button" class="picnic-copy-btn">
        <i class="fas fa-copy" aria-hidden="true"></i>
        Kopieer lijst
      </button>
      <button id="picnicOpenBtn" type="button" class="picnic-open-btn">
        <i class="fas fa-shopping-basket" aria-hidden="true"></i>
        Open Picnic
      </button>
    </div>
  `;

  document.getElementById('picnicSelectAllBtn')?.addEventListener('click', () => {
    picnicModalBody.querySelectorAll('.picnic-ingredient-checkbox').forEach(input => {
      input.checked = true;
    });
    updatePicnicSelectedCount();
  });

  document.getElementById('picnicSelectNoneBtn')?.addEventListener('click', () => {
    picnicModalBody.querySelectorAll('.picnic-ingredient-checkbox').forEach(input => {
      input.checked = false;
    });
    updatePicnicSelectedCount();
  });

  picnicModalBody.querySelectorAll('.picnic-ingredient-checkbox').forEach(input => {
    input.addEventListener('change', updatePicnicSelectedCount);
  });

  document.getElementById('picnicCopyBtn')?.addEventListener('click', handlePicnicCopyClick);
  document.getElementById('picnicOpenBtn')?.addEventListener('click', handlePicnicAppOpenClick);
  updatePicnicSelectedCount();
}

function renderPicnicError() {
  if (!picnicModalBody) return;
  picnicModalBody.innerHTML = `
    <div class="picnic-empty-state">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <p>De boodschappenlijst kon niet worden opgehaald. Probeer het later opnieuw.</p>
    </div>
  `;
}

async function openPicnicShoppingModal(recipeUrl, recipeTitle) {
  if (!picnicModal || !picnicModalBody) return;

  picnicModalState = {
    title: recipeTitle || 'Recept',
    url: recipeUrl || '',
    ingredients: []
  };

  if (picnicModalRecipeTitle) {
    picnicModalRecipeTitle.textContent = picnicModalState.title;
  }

  picnicModal.classList.remove('hidden');
  picnicModal.setAttribute('aria-hidden', 'false');
  setPicnicModalLoading();

  try {
    const res = await fetch(`${API_BASE}/api/recipe-info?url=${encodeURIComponent(recipeUrl)}`, {
      headers: authHeaders()
    });
    const data = await res.json();
    const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
    picnicModalState.ingredients = ingredients;
    renderPicnicIngredients(ingredients);
  } catch (err) {
    console.error(err);
    renderPicnicError();
  }
}

async function fetchRecipeIngredients(recipeUrl) {
  const res = await fetch(`${API_BASE}/api/recipe-info?url=${encodeURIComponent(recipeUrl)}`, {
    headers: authHeaders()
  });
  return res.json();
}

function getSelectedPicnicIngredients() {
  if (!picnicModalBody) return [];
  return [...picnicModalBody.querySelectorAll('.picnic-ingredient-checkbox:checked')]
    .map(input => picnicModalState.ingredients[Number(input.dataset.index)])
    .filter(Boolean);
}

function buildPicnicShoppingListText(items) {
  const title = picnicModalState.title || 'Recept';
  return [`Boodschappenlijst voor ${title}`, '', ...items.map(item => `- ${item}`)].join('\n');
}

function buildShoppingListText(title, items) {
  const safeTitle = title || 'Recept';
  return [`Boodschappenlijst voor ${safeTitle}`, '', ...items.map(item => `- ${item}`)].join('\n');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_err) {
      // val terug op execCommand
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch (_err) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function setPicnicFeedback(message, tone = 'info') {
  const feedback = document.getElementById('picnicFeedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.tone = tone;
}

async function handlePicnicCopyClick() {
  const selectedIngredients = getSelectedPicnicIngredients();

  if (!selectedIngredients.length) {
    setPicnicFeedback('Selecteer minimaal 1 ingrediënt.', 'error');
    return;
  }

  const text = buildPicnicShoppingListText(selectedIngredients);
  const copied = await copyTextToClipboard(text);

  if (!copied) {
    setPicnicFeedback('Kopiëren lukte niet automatisch. Probeer de lijst handmatig te selecteren.', 'error');
    return;
  }

  if (typeof showRecipeAddedToast === 'function') {
    showRecipeAddedToast('Boodschappenlijst gekopieerd.');
  }
  setPicnicFeedback('Lijst gekopieerd. Open nu Picnic en voeg de producten handmatig toe.', 'success');
}

function handlePicnicAppOpenClick() {
  const opened = window.open(PICNIC_DEEPLINK_URL, '_blank');

  if (opened) {
    opened.opener = null;
    return;
  }

  window.location.assign(PICNIC_DEEPLINK_URL);
}

async function openNotesExport(recipeUrl, recipeTitle) {
  try {
    const data = await fetchRecipeIngredients(recipeUrl);
    const ingredients = Array.isArray(data.ingredients) ? data.ingredients.filter(Boolean) : [];
    const exportText = buildShoppingListText(
      recipeTitle || 'Recept',
      ingredients.length ? ingredients : ['Er konden geen ingrediënten automatisch worden opgehaald.']
    );

    if (navigator.share) {
      await navigator.share({
        title: recipeTitle || 'Boodschappenlijst',
        text: exportText
      });
      if (typeof showRecipeAddedToast === 'function') {
        showRecipeAddedToast('Deelmenu geopend voor Notities.');
      }
      return;
    }

    const copied = await copyTextToClipboard(exportText);
    if (copied) {
      if (typeof showRecipeAddedToast === 'function') {
        showRecipeAddedToast('Lijst gekopieerd voor Notities.');
      }
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error(err);
    if (typeof showRecipeAddedToast === 'function') {
      showRecipeAddedToast('Export naar Notities lukte niet.');
    }
  }
}

closePicnicModal?.addEventListener('click', closePicnicShoppingModal);
picnicModal?.addEventListener('click', e => {
  if (e.target === picnicModal) closePicnicShoppingModal();
});

function closeAllRecipeExportMenus(exceptMenu = null) {
  document.querySelectorAll('[data-export-menu]').forEach(menu => {
    const shouldKeepOpen = exceptMenu && menu === exceptMenu;
    menu.classList.toggle('hidden', !shouldKeepOpen);
    const wrapper = menu.closest('.recipe-export-menu');
    const trigger = wrapper?.querySelector('[data-export-toggle]');
    trigger?.setAttribute('aria-expanded', shouldKeepOpen ? 'true' : 'false');
    wrapper?.classList.toggle('is-open', !!shouldKeepOpen);
  });
}

document.addEventListener('click', e => {
  if (e.target.closest('.recipe-export-menu')) return;
  closeAllRecipeExportMenus();
});

resultDiv?.addEventListener('click', e => {
  const exportToggle = e.target.closest('[data-export-toggle]');
  if (exportToggle) {
    const wrapper = exportToggle.closest('.recipe-export-menu');
    const menu = wrapper?.querySelector('[data-export-menu]');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    closeAllRecipeExportMenus(willOpen ? menu : null);
    return;
  }

  const notesBtn = e.target.closest('.notes-export-option');
  if (notesBtn) {
    const recipeUrl = decodeURIComponent(notesBtn.dataset.recipeUrl || '');
    closeAllRecipeExportMenus();
    openNotesExport(recipeUrl, notesBtn.dataset.recipeTitle || 'Recept');
    return;
  }

  const picnicBtn = e.target.closest('.picnic-export-option');
  if (picnicBtn) {
    const recipeUrl = decodeURIComponent(picnicBtn.dataset.recipeUrl || '');
    closeAllRecipeExportMenus();
    openPicnicShoppingModal(recipeUrl, picnicBtn.dataset.recipeTitle || 'Recept');
    return;
  }

  const importBtn = e.target.closest('.import-recipe-btn');
  if (importBtn) {
    handleImportRecipe(importBtn.dataset.recipeId, importBtn.dataset.importMode || '');
    return;
  }
  const btn = e.target.closest('.plan-recipe-btn');
  if (!btn) return;
  plannerSuggestedDay = null;
  plannerSuggestedSlot = null;
  openAssignModalForRecipe(btn.dataset.recipeId, btn.dataset.recipeTitle);
});

/* ========= WEEKMENU PLANNER ========= */
const weekmenuGrid = document.getElementById('weekmenuGrid');
const weekLabel = document.getElementById('weekLabel');
const weekPrevBtn = document.getElementById('weekPrevBtn');
const weekNextBtn = document.getElementById('weekNextBtn');
const weekmenuSearchInput = document.getElementById('weekmenuSearchInput');
const weekmenuSearchResults = document.getElementById('weekmenuSearchResults');
const weekmenuSearchPagination = document.getElementById('weekmenuSearchPagination');
const weekmenuSearchSection = document.querySelector('.weekmenu-search');
const assignModal = document.getElementById('assignModal');
const closeAssignModal = document.getElementById('closeAssignModal');
const assignModalRecipeTitle = document.getElementById('assignModalRecipeTitle');
const assignCalendarPicker = document.getElementById('assignCalendarPicker');
const assignModalSaveBtn = document.getElementById('assignModalSaveBtn');
const weekmenuPreviewModal = document.getElementById('weekmenuPreviewModal');
const closeWeekmenuPreviewModal = document.getElementById('closeWeekmenuPreviewModal');
const weekmenuPreviewBody = document.getElementById('weekmenuPreviewBody');

const plannerDays = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
const WEEKMENU_SEARCH_PAGE_SIZE = 10;
let plannerWeekStart = null;
let plannerInitialized = false;
let plannerRecipes = [];
let plannerSearchCurrentPage = 1;
let plannerEntries = new Map();
let plannerSuggestedDay = null;
let plannerSuggestedSlot = null;
let pendingAssignRecipeId = null;
let assignSelectedDay = 1;
let assignSelectedSlot = 'dinner';

function getMonday(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // maandag = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoPlusDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toIsoDate(dt);
}

function formatWeekLabel(weekStartIso) {
  const start = new Date(`${weekStartIso}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const formatter = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' });
  return `Week van ${formatter.format(start)} t/m ${formatter.format(end)}`;
}

function formatShortWeekLabel(weekStartIso) {
  const start = new Date(`${weekStartIso}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const monthFmt = new Intl.DateTimeFormat('nl-NL', { month: 'short' });
  const yearFmt = new Intl.DateTimeFormat('nl-NL', { year: 'numeric' });
  const startMonth = monthFmt.format(start);
  const endMonth = monthFmt.format(end);
  const year = yearFmt.format(end);
  if (startMonth === endMonth) return `${startMonth} ${year}`;
  return `${startMonth}/${endMonth} ${year}`;
}

function formatDayNumber(weekStartIso, offset) {
  const dt = new Date(`${weekStartIso}T00:00:00`);
  dt.setDate(dt.getDate() + offset);
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(dt);
}

function plannerSlotKey(day, slot) {
  return `${day}-${slot}`;
}

function renderAssignCalendarPicker() {
  if (!assignCalendarPicker || !plannerWeekStart) return;
  const slots = [
    { key: 'breakfast', label: 'Ontbijt' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'snack', label: 'Tussendoor' },
    { key: 'dinner', label: 'Avondeten' }
  ];

  let html = `
    <div class="assign-picker-weeknav">
      <button type="button" class="assign-week-btn" data-shift="-7" aria-label="Vorige week">
        <i class="fas fa-chevron-left"></i>
      </button>
      <p class="assign-week-label">${formatWeekLabel(plannerWeekStart)} <span>(${formatShortWeekLabel(plannerWeekStart)})</span></p>
      <button type="button" class="assign-week-btn" data-shift="7" aria-label="Volgende week">
        <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    <div class="assign-picker-days-wrap">
      <button type="button" class="assign-days-scroll-btn prev" data-scroll="prev" aria-label="Scroll dagen naar links">
        <i class="fas fa-chevron-left"></i>
      </button>
      <div class="assign-picker-days">`;
  plannerDays.forEach((dayName, idx) => {
    const dayNumber = idx + 1;
    const activeClass = assignSelectedDay === dayNumber ? ' active' : '';
    html += `<button type="button" class="assign-day-btn${activeClass}" data-day="${dayNumber}">${dayName}<span>${formatDayNumber(plannerWeekStart, idx)}</span></button>`;
  });
  html += `</div>
      <button type="button" class="assign-days-scroll-btn next" data-scroll="next" aria-label="Scroll dagen naar rechts">
        <i class="fas fa-chevron-right"></i>
      </button>
    </div>
    <div class="assign-picker-slots">`;

  slots.forEach(slot => {
    const activeClass = assignSelectedSlot === slot.key ? ' active' : '';
    html += `<button type="button" class="assign-slot-btn${activeClass}" data-slot="${slot.key}">${slot.label}</button>`;
  });
  html += '</div>';
  assignCalendarPicker.innerHTML = html;

  assignCalendarPicker.querySelectorAll('.assign-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      assignSelectedDay = Number(btn.dataset.day);
      renderAssignCalendarPicker();
    });
  });
  assignCalendarPicker.querySelectorAll('.assign-slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      assignSelectedSlot = btn.dataset.slot;
      renderAssignCalendarPicker();
    });
  });

  assignCalendarPicker.querySelectorAll('.assign-week-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      plannerWeekStart = isoPlusDays(plannerWeekStart, Number(btn.dataset.shift || '0'));
      if (weekLabel) weekLabel.textContent = formatWeekLabel(plannerWeekStart);
      renderAssignCalendarPicker();
      await loadWeekMenu();
    });
  });

  const dayScroller = assignCalendarPicker.querySelector('.assign-picker-days');
  const dayWrap = assignCalendarPicker.querySelector('.assign-picker-days-wrap');
  const updateScrollerState = () => {
    if (!dayScroller || !dayWrap) return;
    const maxScrollLeft = Math.max(0, dayScroller.scrollWidth - dayScroller.clientWidth);
    dayWrap.classList.toggle('has-overflow', maxScrollLeft > 6);
    dayWrap.classList.toggle('at-start', dayScroller.scrollLeft <= 2);
    dayWrap.classList.toggle('at-end', dayScroller.scrollLeft >= maxScrollLeft - 2);
  };

  assignCalendarPicker.querySelectorAll('.assign-days-scroll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!dayScroller) return;
      const dir = btn.dataset.scroll === 'prev' ? -1 : 1;
      dayScroller.scrollBy({ left: 240 * dir, behavior: 'smooth' });
    });
  });

  dayScroller?.addEventListener('scroll', updateScrollerState, { passive: true });
  requestAnimationFrame(updateScrollerState);
}

function openAssignModalForRecipe(recipeId, recipeTitle) {
  if (!ensureLoggedInOrNotify(weekmenuGrid || resultDiv)) return;
  if (!plannerWeekStart) plannerWeekStart = toIsoDate(getMonday(new Date()));
  pendingAssignRecipeId = Number(recipeId);
  if (assignModalRecipeTitle) assignModalRecipeTitle.textContent = recipeTitle || 'Recept';
  assignSelectedDay = Number(plannerSuggestedDay || 1);
  assignSelectedSlot = plannerSuggestedSlot || 'dinner';
  renderAssignCalendarPicker();
  assignModal?.classList.remove('hidden');
}

function closeAssignModalPanel() {
  pendingAssignRecipeId = null;
  assignModal?.classList.add('hidden');
}

async function loadPlannerRecipes() {
  if (!getValidToken()) {
    plannerRecipes = [];
    return;
  }
  const params = new URLSearchParams();
  appendActiveDatabaseParam(params);
  const res = await fetch(`${API_BASE}/api/recipes?${params.toString()}`, { headers: authHeaders() });
  const data = await res.json();
  plannerRecipes = Array.isArray(data) ? data : [];
}

async function loadWeekMenu() {
  if (!ensureLoggedInOrNotify(weekmenuGrid)) return;
  const params = new URLSearchParams({ weekStart: plannerWeekStart });
  appendActiveDatabaseParam(params);
  const res = await fetch(`${API_BASE}/api/meal-plan?${params.toString()}`, {
    headers: authHeaders()
  });
  const rows = await res.json();
  plannerEntries = new Map();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    plannerEntries.set(plannerSlotKey(Number(row.day_of_week), row.meal_slot), row);
  });
  renderWeekMenuGrid();
}

function renderWeekMenuGrid() {
  if (!weekmenuGrid) return;
  let html = `
    <div class="weekmenu-mobile-nav" aria-hidden="true">
      <button type="button" class="weekmenu-mobile-arrow prev" data-direction="prev" aria-label="Vorige dag">
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="weekmenu-mobile-hint">Swipe door dagen</span>
      <button type="button" class="weekmenu-mobile-arrow next" data-direction="next" aria-label="Volgende dag">
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
    <div class="weekmenu-calendar">
  `;

  const daySlots = [
    { key: 'breakfast', label: 'Ontbijt' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'snack', label: 'Tussendoor' },
    { key: 'dinner', label: 'Avondeten' }
  ];

  for (let day = 1; day <= 7; day++) {

    const renderSlot = (slotKey, slotLabel, entry) => {
      if (entry) {
        const safeUrl = encodeURIComponent(entry.url || '');
        return `
          <div class="weekmenu-slot-item">
            <p class="weekmenu-slot-name">${slotLabel}</p>
            <div class="weekmenu-slot-thumb-wrap" data-url="${safeUrl}">
              <div class="weekmenu-slot-thumb-skeleton"></div>
            </div>
            <a href="${entry.url}" target="_blank" rel="noopener noreferrer" class="weekmenu-open-link">
              <span class="weekmenu-open-link-title">${entry.title}</span>
              <span class="weekmenu-open-link-icon" aria-hidden="true"><i class="fas fa-external-link-alt"></i></span>
            </a>
            <div class="weekmenu-cell-actions">
              <button type="button" class="green-btn weekmenu-replace-btn" data-day="${day}" data-slot="${slotKey}">Wijzig</button>
              <button type="button" class="pink-btn weekmenu-clear-btn weekmenu-clear-icon-btn" data-day="${day}" data-slot="${slotKey}" aria-label="Verwijder recept uit ${slotLabel}">
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>
          </div>`;
      }
      return `
        <div class="weekmenu-slot-item">
          <p class="weekmenu-slot-name">${slotLabel}</p>
          <p class="weekmenu-empty">Nog niets gepland</p>
          <div class="weekmenu-cell-actions weekmenu-cell-actions-empty">
            <button type="button" class="green-btn weekmenu-replace-btn weekmenu-add-btn" data-day="${day}" data-slot="${slotKey}" aria-label="Kies recept voor ${slotLabel}">
              <i class="fas fa-plus" aria-hidden="true"></i>
            </button>
          </div>
        </div>`;
    };

    html += `
      <article class="weekmenu-day-card" data-day-index="${day - 1}">
        <header class="weekmenu-day-header">
          <p class="weekmenu-day-name">${plannerDays[day - 1]}</p>
          <p class="weekmenu-day-date">${formatDayNumber(plannerWeekStart, day - 1)}</p>
        </header>
        <div class="weekmenu-day-body">
          ${daySlots.map(slot => renderSlot(slot.key, slot.label, plannerEntries.get(plannerSlotKey(day, slot.key)))).join('')}
        </div>
      </article>`;
  }

  html += `
    </div>
    <div class="weekmenu-mobile-dots" aria-hidden="true">
      ${plannerDays.map((_day, idx) => `<span class="weekmenu-mobile-dot${idx === 0 ? ' active' : ''}" data-dot-index="${idx}"></span>`).join('')}
    </div>
  `;
  weekmenuGrid.innerHTML = html;
  hydrateWeekmenuImages();

  const calendar = weekmenuGrid.querySelector('.weekmenu-calendar');
  const cards = Array.from(weekmenuGrid.querySelectorAll('.weekmenu-day-card'));
  const dots = Array.from(weekmenuGrid.querySelectorAll('.weekmenu-mobile-dot'));

  const updateMobileIndicators = () => {
    if (!calendar || cards.length === 0) return;
    const scrollLeft = calendar.scrollLeft;
    const cardWidth = cards[0].getBoundingClientRect().width || 1;
    const rawIndex = Math.round(scrollLeft / cardWidth);
    const activeIndex = Math.max(0, Math.min(cards.length - 1, rawIndex));
    dots.forEach((dot, idx) => dot.classList.toggle('active', idx === activeIndex));
    const prevBtn = weekmenuGrid.querySelector('.weekmenu-mobile-arrow.prev');
    const nextBtn = weekmenuGrid.querySelector('.weekmenu-mobile-arrow.next');
    if (prevBtn) prevBtn.disabled = activeIndex <= 0;
    if (nextBtn) nextBtn.disabled = activeIndex >= cards.length - 1;
  };

  const scrollToCard = direction => {
    if (!calendar || cards.length === 0) return;
    const scrollLeft = calendar.scrollLeft;
    const cardWidth = cards[0].getBoundingClientRect().width || 1;
    const currentIndex = Math.round(scrollLeft / cardWidth);
    const nextIndex = direction === 'next'
      ? Math.min(cards.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    calendar.scrollTo({ left: nextIndex * cardWidth, behavior: 'smooth' });
  };

  weekmenuGrid.querySelectorAll('.weekmenu-mobile-arrow').forEach(btn => {
    btn.addEventListener('click', () => scrollToCard(btn.dataset.direction || 'next'));
  });
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      if (!calendar || cards.length === 0) return;
      const idx = Number(dot.dataset.dotIndex || '0');
      const cardWidth = cards[0].getBoundingClientRect().width || 1;
      calendar.scrollTo({ left: idx * cardWidth, behavior: 'smooth' });
    });
  });
  calendar?.addEventListener('scroll', updateMobileIndicators, { passive: true });
  requestAnimationFrame(updateMobileIndicators);

  weekmenuGrid.querySelectorAll('.weekmenu-clear-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await clearPlannerSlot(Number(btn.dataset.day), btn.dataset.slot);
    });
  });

  weekmenuGrid.querySelectorAll('.weekmenu-replace-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      plannerSuggestedDay = Number(btn.dataset.day || '1');
      plannerSuggestedSlot = btn.dataset.slot || 'dinner';
      if (weekmenuSearchInput) {
        weekmenuSearchInput.value = '';
        renderPlannerSearchResults();
      }
      weekmenuSearchSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      requestAnimationFrame(() => weekmenuSearchInput?.focus({ preventScroll: true }));
    });
  });
}

function renderPlannerSearchResults() {
  if (!weekmenuSearchResults) return;
  const term = (weekmenuSearchInput?.value || '').trim().toLowerCase();
  const compactMobileLabels = isMobileViewport();
  const filtered = plannerRecipes
    .filter(r => (r.title || '').toLowerCase().includes(term));
  const sharedTargets = getSharedDatabaseTargets();
  const importMode = isSharedDatabaseActive()
    ? 'to-own'
    : (sharedTargets.length ? 'to-shared' : null);
  const importLabel = importMode === 'to-own'
    ? (compactMobileLabels ? 'Naar mijn db' : 'Importeer naar mijn database')
    : (compactMobileLabels ? 'Naar gedeelde db' : 'Importeer naar gedeelde database');
  const assignLabel = compactMobileLabels ? 'Plan' : 'Plan in weekmenu';

  if (filtered.length === 0) {
    weekmenuSearchResults.innerHTML = '<p class="weekmenu-search-empty">Geen recepten gevonden.</p>';
    if (weekmenuSearchPagination) weekmenuSearchPagination.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / WEEKMENU_SEARCH_PAGE_SIZE));
  if (plannerSearchCurrentPage > totalPages) plannerSearchCurrentPage = totalPages;
  if (plannerSearchCurrentPage < 1) plannerSearchCurrentPage = 1;
  const startIdx = (plannerSearchCurrentPage - 1) * WEEKMENU_SEARCH_PAGE_SIZE;
  const pageRecipes = filtered.slice(startIdx, startIdx + WEEKMENU_SEARCH_PAGE_SIZE);

  let html = '';
  pageRecipes.forEach(recipe => {
    const safeUrl = encodeURIComponent(recipe.url || '');
    html += `
      <div class="weekmenu-search-item">
        <div class="weekmenu-search-main">
          <div class="weekmenu-search-thumb-wrap" data-url="${safeUrl}">
            <div class="weekmenu-search-thumb-skeleton"></div>
          </div>
          <button type="button" class="weekmenu-search-title weekmenu-preview-title" data-recipe-id="${recipe.id}">${recipe.title}</button>
        </div>
        <div class="weekmenu-search-actions">
          <button type="button" class="plan-weekmenu-btn weekmenu-assign-btn weekmenu-primary-action" data-recipe-id="${recipe.id}" data-recipe-title="${(recipe.title || 'Recept').replace(/"/g, '&quot;')}">${assignLabel}</button>
          ${importMode ? `<button type="button" class="plan-weekmenu-btn import-transfer-btn weekmenu-import-btn weekmenu-secondary-action" data-recipe-id="${recipe.id}" data-import-mode="${importMode}">${importLabel}</button>` : ''}
        </div>
      </div>`;
  });
  weekmenuSearchResults.innerHTML = html;
  hydrateWeekmenuSearchImages();

  if (weekmenuSearchPagination) {
    if (totalPages <= 1) {
      weekmenuSearchPagination.innerHTML = '';
    } else {
      let paginationHtml = '';
      for (let i = 1; i <= totalPages; i++) {
        const activeClass = i === plannerSearchCurrentPage ? ' active' : '';
        paginationHtml += `<button type="button" class="overview-page-btn${activeClass}" data-page="${i}">${i}</button>`;
      }
      weekmenuSearchPagination.innerHTML = paginationHtml;
    }
  }
}

function openWeekmenuPreviewModal(recipeId) {
  const recipe = plannerRecipes.find(r => Number(r.id) === Number(recipeId));
  if (!recipe || !weekmenuPreviewBody) return;
  const safeUrl = encodeURIComponent(recipe.url || '');
  const safeTitle = (recipe.title || 'Recept').replace(/"/g, '&quot;');
  weekmenuPreviewBody.innerHTML = `
    <div class="recipe-cards-container search-results single-result weekmenu-preview-cards">
      <div class="recipe-card">
        <div class="result-image-cell" data-url="${safeUrl}" data-title="${safeTitle}">
          <div class="recipe-card-image-skeleton"></div>
        </div>
        <div class="recipe-card-content">
          <h3>${recipe.title || 'Recept'}</h3>
          <p class="recipe-link"><a href="${recipe.url}" target="_blank" rel="noopener noreferrer" class="ext-link">
            Bekijk&nbsp;recept&nbsp;<i class="fas fa-external-link-alt"></i></a></p>
          <div class="recipe-meta-row">
            <span class="recipe-meta-pill"><i class="far fa-clock"></i> ${recipe.time_required || '-'}</span>
            <span class="recipe-meta-pill"><i class="fas fa-fire"></i> ${recipe.calories ?? '-'} kcal</span>
          </div>
          <ul>
            <li><i class="fas fa-utensils"></i> <strong>Soort:</strong> ${recipe.dish_type || '-'}</li>
            <li><i class="fas fa-layer-group"></i> <strong>Menugang:</strong> ${recipe.meal_category || '-'}</li>
            <li><i class="fas fa-bullseye"></i> <strong>Doel gerecht:</strong> ${recipe.meal_type || '-'}</li>
          </ul>
        </div>
      </div>
    </div>`;

  const imageCell = weekmenuPreviewBody.querySelector('.result-image-cell');
  fetchRecipeImage(recipe.url || '').then(imageUrl => setResultCardImage(imageCell, imageUrl, recipe.title || 'Recept'));
  weekmenuPreviewModal?.classList.remove('hidden');
}

async function assignRecipeToPlanner(recipeId, dayOfWeek, slot) {
  if (!ensureLoggedInOrNotify(weekmenuGrid)) return;
  const res = await fetch(`${API_BASE}/api/meal-plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(withActiveDatabaseBody({
      week_start: plannerWeekStart,
      day_of_week: dayOfWeek,
      meal_slot: slot,
      recipe_id: recipeId
    }))
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    alert(data.error || 'Opslaan in weekmenu mislukt.');
    return;
  }
  await loadWeekMenu();
}

async function importRecipeBetweenDatabases(recipeId, targetDbOwnerId, successMessage) {
  if (!ensureLoggedInOrNotify(resultDiv)) return;
  const sourceOwnerId = getActiveDatabaseOwnerId();
  if (!sourceOwnerId || !targetDbOwnerId) return;

  const res = await fetch(`${API_BASE}/api/recipes/${recipeId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      dbOwnerId: sourceOwnerId,
      targetDbOwnerId
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || 'Importeren mislukt.');
    return;
  }
  alert(successMessage);
}

async function handleImportRecipe(recipeId, importMode) {
  const activeOwnerId = getActiveDatabaseOwnerId();
  const personalDb = accessibleDatabases.find(db => !!db.is_personal);
  if (!activeOwnerId || !personalDb) return;

  if (importMode === 'to-own') {
    if (!isSharedDatabaseActive()) return;
    await importRecipeBetweenDatabases(recipeId, Number(personalDb.owner_user_id), 'Recept geïmporteerd naar je eigen database.');
    return;
  }

  if (importMode === 'to-shared') {
    const sharedTargets = getSharedDatabaseTargets();
    if (!sharedTargets.length) {
      alert('Je hebt nog geen gedeelde databases om naartoe te importeren.');
      return;
    }

    let targetOwnerId = null;
    if (sharedTargets.length === 1) {
      targetOwnerId = Number(sharedTargets[0].owner_user_id);
    } else {
      const options = sharedTargets
        .map((db, idx) => `${idx + 1}. ${db.owner_email}`)
        .join('\n');
      const answer = window.prompt(
        `Kies de gedeelde database waar je naartoe wilt importeren:\n${options}\n\nVul het nummer in:`,
        '1'
      );
      if (!answer) return;
      const choice = Number(answer);
      if (!Number.isInteger(choice) || choice < 1 || choice > sharedTargets.length) {
        alert('Ongeldige keuze.');
        return;
      }
      targetOwnerId = Number(sharedTargets[choice - 1].owner_user_id);
    }

    if (!targetOwnerId) return;
    await importRecipeBetweenDatabases(recipeId, targetOwnerId, 'Recept geïmporteerd naar de gedeelde database.');
  }
}

async function clearPlannerSlot(dayOfWeek, slot) {
  if (!ensureLoggedInOrNotify(weekmenuGrid)) return;
  const res = await fetch(`${API_BASE}/api/meal-plan`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(withActiveDatabaseBody({
      week_start: plannerWeekStart,
      day_of_week: dayOfWeek,
      meal_slot: slot
    }))
  });
  if (!res.ok) {
    alert('Verwijderen uit weekmenu mislukt.');
    return;
  }
  await loadWeekMenu();
}

async function initWeekPlanner() {
  if (!plannerWeekStart) plannerWeekStart = toIsoDate(getMonday(new Date()));
  if (weekLabel) weekLabel.textContent = formatWeekLabel(plannerWeekStart);

  try {
    await loadPlannerRecipes();
    renderPlannerSearchResults();
    await loadWeekMenu();
  } catch (err) {
    console.error(err);
    if (weekmenuGrid) weekmenuGrid.innerHTML = '<p>Kon weekmenu niet laden.</p>';
  }

  if (plannerInitialized) return;
  plannerInitialized = true;

  weekmenuSearchInput?.addEventListener('input', () => {
    plannerSearchCurrentPage = 1;
    renderPlannerSearchResults();
  });
  weekmenuSearchResults?.addEventListener('click', e => {
    const importBtn = e.target.closest('.weekmenu-import-btn');
    if (importBtn) {
      handleImportRecipe(importBtn.dataset.recipeId, importBtn.dataset.importMode || '');
      return;
    }
    const btn = e.target.closest('.weekmenu-assign-btn');
    if (btn) {
      openAssignModalForRecipe(btn.dataset.recipeId, btn.dataset.recipeTitle);
      return;
    }
    const previewBtn = e.target.closest('.weekmenu-preview-title');
    if (previewBtn) openWeekmenuPreviewModal(previewBtn.dataset.recipeId);
  });
  weekmenuSearchPagination?.addEventListener('click', e => {
    const btn = e.target.closest('.overview-page-btn');
    if (!btn) return;
    plannerSearchCurrentPage = Number(btn.dataset.page || '1');
    renderPlannerSearchResults();
    weekmenuSearchSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  weekPrevBtn?.addEventListener('click', async () => {
    plannerWeekStart = isoPlusDays(plannerWeekStart, -7);
    if (weekLabel) weekLabel.textContent = formatWeekLabel(plannerWeekStart);
    await loadWeekMenu();
  });
  weekNextBtn?.addEventListener('click', async () => {
    plannerWeekStart = isoPlusDays(plannerWeekStart, 7);
    if (weekLabel) weekLabel.textContent = formatWeekLabel(plannerWeekStart);
    await loadWeekMenu();
  });

  closeAssignModal?.addEventListener('click', closeAssignModalPanel);
  assignModal?.addEventListener('click', e => {
    if (e.target === assignModal) closeAssignModalPanel();
  });
  closeWeekmenuPreviewModal?.addEventListener('click', () => {
    weekmenuPreviewModal?.classList.add('hidden');
  });
  weekmenuPreviewModal?.addEventListener('click', e => {
    if (e.target === weekmenuPreviewModal) weekmenuPreviewModal.classList.add('hidden');
  });
  assignModalSaveBtn?.addEventListener('click', async () => {
    if (!pendingAssignRecipeId) return;
    await assignRecipeToPlanner(pendingAssignRecipeId, assignSelectedDay, assignSelectedSlot);
    closeAssignModalPanel();
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installAppBtn) installAppBtn.style.display = 'inline-flex';
  if (installAppText) installAppText.style.display = 'inline-flex';
});

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isIos && !isStandalone) {
      alert('Op iPhone/iPad: tik op Deel en kies Zet op beginscherm.');
      return;
    }

    alert('Installeren is nu niet beschikbaar op dit apparaat of in deze browser.');
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/* ========= NIEUW RECEPT TOEVOEGEN (TAB 2) ========= */
const addRecipeForm = document.getElementById('addRecipeForm');
const addMessageDiv = document.getElementById('addMessage');
const recipeAddedToast = document.getElementById('recipeAddedToast');
const recipeAddedToastText = document.getElementById('recipeAddedToastText');
const fetchInfoBtn  = document.getElementById('fetchInfoBtn');
const homeLogo      = document.getElementById('homeLogo');
let recipeToastTimer = null;

function showRecipeAddedToast(message) {
  if (!recipeAddedToast || !recipeAddedToastText) return;

  if (recipeToastTimer) {
    clearTimeout(recipeToastTimer);
    recipeToastTimer = null;
  }

  recipeAddedToastText.textContent = message;
  recipeAddedToast.classList.remove('hide');
  recipeAddedToast.classList.add('show');

  recipeToastTimer = setTimeout(() => {
    recipeAddedToast.classList.remove('show');
    recipeAddedToast.classList.add('hide');
  }, 2200);
}

const fieldNameToId = {
  'Titel': 'title',
  'Soort gerecht': 'dishTypeNew',
  'Menugang': 'mealCategoryNew',
  'Doel gerecht': 'mealTypeNew',
  'Tijd': 'timeRequiredNew',
  'Calorieën': 'caloriesNew'
};

function isFilled(input) {
  if (!input) return false;
  if (input.tagName === 'SELECT') {
    if (input.multiple) return Array.from(input.selectedOptions).length > 0;
    return input.value !== 'maak een keuze';
  }
  return input.value.trim() !== '';
}

function clearMissingState() {
  document.querySelectorAll('.field-missing').forEach(el => el.classList.remove('field-missing'));
  document.querySelectorAll('.field-error-text').forEach(el => el.remove());
}

function setMissingState(input, message) {
  if (!input) return;
  input.classList.add('field-missing');
  if (input.tagName === 'SELECT' && input._multiSelectApi) {
    input.nextElementSibling?.classList.add('field-missing');
  }
  const fieldWrap = input.closest('#addRecipeForm > div') || input.parentElement;
  if (!fieldWrap) return;
  const text = document.createElement('p');
  text.className = 'field-error-text';
  text.textContent = message;
  fieldWrap.appendChild(text);
}

Object.values(fieldNameToId).concat('url').forEach(id => {
  const input = document.getElementById(id);
  if (!input) return;
  const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
  input.addEventListener(eventName, () => {
    input.classList.remove('field-missing');
    if (input.tagName === 'SELECT' && input._multiSelectApi) {
      input.nextElementSibling?.classList.remove('field-missing');
    }
    const fieldWrap = input.closest('#addRecipeForm > div') || input.parentElement;
    const err = fieldWrap ? fieldWrap.querySelector('.field-error-text') : null;
    if (err && isFilled(input)) err.remove();
  });
});

if (fetchInfoBtn) {
  fetchInfoBtn.addEventListener('click', async () => {
    if (!ensureLoggedInOrNotify(addMessageDiv)) return;
    const urlInput = document.getElementById('url');
    const urlValue = urlInput.value.trim();
    clearMissingState();
    if (!urlValue) {
      setMissingState(urlInput, 'URL is verplicht om informatie op te halen.');
      addMessageDiv.innerHTML = '';
      return;
    }

    fetchInfoBtn.disabled = true;
    const originalText = fetchInfoBtn.textContent;
    fetchInfoBtn.textContent = 'Bezig...';
    addMessageDiv.innerHTML = '';

    try {
      const res = await fetch(`${API_BASE}/api/recipe-info?url=${encodeURIComponent(urlValue)}`, {
        headers: authHeaders()
      });
      const data = await res.json();

      if (data.error) {
        addMessageDiv.innerHTML = `<p style="color:red;">${data.error}</p>`;
        return;
      }

      const titleInput = document.getElementById('title');
      if (!titleInput.value.trim() && data.title) titleInput.value = data.title;

      const dishTypeNew = document.getElementById('dishTypeNew');
      if (getSelectedValues(dishTypeNew).length === 0 && data.dish_type) {
        setMultiSelectValues('dishTypeNew', [data.dish_type]);
      }

      const mealCategoryNew = document.getElementById('mealCategoryNew');
      if (getSelectedValues(mealCategoryNew).length === 0 && data.meal_category) {
        setMultiSelectValues('mealCategoryNew', [data.meal_category]);
      }

      const mealTypeNew = document.getElementById('mealTypeNew');
      if (getSelectedValues(mealTypeNew).length === 0 && data.meal_type) {
        setMultiSelectValues('mealTypeNew', [data.meal_type]);
      }

      const timeRequiredNew = document.getElementById('timeRequiredNew');
      if (getSelectedValues(timeRequiredNew).length === 0 && data.time_required) {
        setMultiSelectValues('timeRequiredNew', [data.time_required]);
      }

      const caloriesNew = document.getElementById('caloriesNew');
      if (!caloriesNew.value.trim() && data.calories != null) caloriesNew.value = data.calories;

      if (data.missing && data.missing.length) {
        data.missing.forEach(fieldName => {
          const fieldId = fieldNameToId[fieldName];
          if (!fieldId) return;
          const input = document.getElementById(fieldId);
          if (!isFilled(input)) {
            setMissingState(input, `${fieldName} is niet automatisch gevonden. Je kunt dit nu invullen, of later aanpassen.`);
          }
        });
        addMessageDiv.innerHTML = '';
      } else {
        addMessageDiv.innerHTML = `<p style="color:green;">Informatie opgehaald en ingevuld.</p>`;
      }
    } catch (err) {
      console.error(err);
      addMessageDiv.innerHTML = `<p style="color:red;">Kon geen informatie ophalen. Probeer later opnieuw.</p>`;
    } finally {
      fetchInfoBtn.disabled = false;
      fetchInfoBtn.textContent = originalText;
    }
  });
}

if (homeLogo) {
  homeLogo.addEventListener('click', () => {
    const chooseTab = document.querySelector('.nav-tabs a[href="#kiesRecept"]');
    if (chooseTab) chooseTab.click();
  });
}

addRecipeForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!ensureLoggedInOrNotify(addMessageDiv)) return;
  const cal = document.getElementById('caloriesNew').value.trim();
  const bodyData = {
    title:         document.getElementById('title').value,
    url:           document.getElementById('url').value,
    dish_type:     getSelectedValues(document.getElementById('dishTypeNew')),
    meal_category: getSelectedValues(document.getElementById('mealCategoryNew')),
    meal_type:     getSelectedValues(document.getElementById('mealTypeNew')),
    time_required: getSelectedValues(document.getElementById('timeRequiredNew')),
    calories:      cal ? parseInt(cal, 10) : null
  };

  fetch(`${API_BASE}/api/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(withActiveDatabaseBody(bodyData))
  })
    .then(r => r.json())
    .then(d => {
      if (d.error) {
        addMessageDiv.innerHTML = `<p style="color:red;">${d.error}</p>`;
        return;
      }

      addMessageDiv.innerHTML = '';
      showRecipeAddedToast('Recept toegevoegd!');
      addRecipeForm.reset();
      ['dishTypeNew', 'mealCategoryNew', 'mealTypeNew', 'timeRequiredNew']
        .forEach(id => document.getElementById(id)?._multiSelectApi?.clear());
    })
    .catch(console.error);
});

/* ========= OVERZICHT RECEPTEN (TAB 3) ========= */
const allRecipesDiv = document.getElementById('allRecipes');
const refreshBtn    = document.getElementById('refreshBtn');
const openRecipePacksBtn = document.getElementById('openRecipePacksBtn');
const overviewListBtn = document.getElementById('overviewListBtn');
const overviewGridBtn = document.getElementById('overviewGridBtn');
const overviewListContainer = document.getElementById('overviewListContainer');
const overviewGridContainer = document.getElementById('overviewGridContainer');
const overviewPagination = document.getElementById('overviewPagination');
const OVERVIEW_PAGE_SIZE = 9;
let overviewAllRecipes = [];
let overviewCurrentPage = 1;
let overviewViewMode = 'list';
if (refreshBtn) refreshBtn.addEventListener('click', fetchAllRecipes);
openRecipePacksBtn?.addEventListener('click', () => {
  openRecipePackFlow({ fromOnboarding: false });
});

if (overviewListBtn && overviewGridBtn) {
  overviewListBtn.addEventListener('click', () => {
    overviewViewMode = 'list';
    applyOverviewViewMode();
  });
  overviewGridBtn.addEventListener('click', () => {
    overviewViewMode = 'grid';
    applyOverviewViewMode();
  });
}

function applyOverviewViewMode() {
  const isList = overviewViewMode === 'list';
  if (overviewListBtn) overviewListBtn.classList.toggle('active', isList);
  if (overviewGridBtn) overviewGridBtn.classList.toggle('active', !isList);
  if (overviewListContainer) overviewListContainer.style.display = isList ? 'block' : 'none';
  if (overviewGridContainer) overviewGridContainer.classList.toggle('active', !isList);
}

function renderOverviewPagination(totalItems) {
  if (!overviewPagination) return;
  const totalPages = Math.max(1, Math.ceil(totalItems / OVERVIEW_PAGE_SIZE));
  if (totalPages <= 1) {
    overviewPagination.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    const activeClass = i === overviewCurrentPage ? ' active' : '';
    html += `<button type="button" class="overview-page-btn${activeClass}" data-page="${i}">${i}</button>`;
  }
  overviewPagination.innerHTML = html;
  overviewPagination.querySelectorAll('.overview-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overviewCurrentPage = Number(btn.dataset.page);
      renderOverviewPage();
    });
  });
}

function renderOverviewPage() {
  allRecipesDiv.innerHTML = '';
  if (overviewGridContainer) overviewGridContainer.innerHTML = '';

  if (!overviewAllRecipes || overviewAllRecipes.length === 0) {
    allRecipesDiv.innerHTML = `<tr><td colspan="10">Er zijn nog geen recepten toegevoegd.</td></tr>`;
    if (overviewGridContainer) overviewGridContainer.innerHTML = '<p>Er zijn nog geen recepten toegevoegd.</p>';
    renderOverviewPagination(0);
    applyOverviewViewMode();
    return;
  }

  const dishOpt  = ["Kip","Rund","Varken","Brood","Hartig","Hartige taart","Ovenschotel","Pasta","Rijst","Soep","Taart & cake","Vegetarisch","Vis","Wraps","Zoet"];
  const catOpt   = ["Bakken","Dessert","Dressings, sauzen & dips","Drinken","Hoofdgerecht","Lunch","Ontbijt","Salade","Snacks"];
  const mealOpt  = ["Sporten","Normaal","Cheaten"];
  const timeOpt  = ["Onder de 30 minuten","30 - 45 minuten","45 minuten - 1 uur","1 - 2 uur","langer dan 2 uur"];

  const totalPages = Math.max(1, Math.ceil(overviewAllRecipes.length / OVERVIEW_PAGE_SIZE));
  if (overviewCurrentPage > totalPages) overviewCurrentPage = totalPages;
  const startIdx = (overviewCurrentPage - 1) * OVERVIEW_PAGE_SIZE;
  const pageRecipes = overviewAllRecipes.slice(startIdx, startIdx + OVERVIEW_PAGE_SIZE);

  let html = '';
  let gridHtml = '<div class="recipe-cards-container overview-grid-cards">';
  pageRecipes.forEach(r => {
    const cals = r.calories ?? '';
    const safeUrl = encodeURIComponent(r.url || '');
    const safeTitle = (r.title || 'Recept').replace(/"/g, '&quot;');
    html += `
      <tr data-id="${r.id}">
        <td class="overview-image-cell" data-url="${safeUrl}" data-title="${safeTitle}">
          <div class="recipe-thumb-skeleton"></div>
        </td>
        <td contenteditable>${r.title}</td>
        <td contenteditable>${r.url}</td>
        <td>${dropdown(dishOpt,  r.dish_type, 'Soort')}</td>
        <td>${dropdown(catOpt,   r.meal_category, 'Menugang')}</td>
        <td>${dropdown(mealOpt,  r.meal_type, 'Doel gerecht')}</td>
        <td>${dropdown(timeOpt,  r.time_required, 'Tijd')}</td>
        <td><input class="calories-field" type="number" value="${cals}" /></td>
        <td><button class="green-btn edit-btn">Opslaan</button></td>
        <td><button class="pink-btn  delete-btn">Verwijder</button></td>
      </tr>`;
    gridHtml += `
      <div class="recipe-card">
        <div class="result-image-cell" data-url="${safeUrl}" data-title="${safeTitle}">
          <div class="recipe-card-image-skeleton"></div>
        </div>
        <div class="recipe-card-content">
          <h3>${r.title}</h3>
          <p class="recipe-link"><a href="${r.url}" target="_blank" class="ext-link">
            Bekijk&nbsp;recept&nbsp;<i class="fas fa-external-link-alt"></i></a></p>
          <div class="recipe-meta-row">
            <span class="recipe-meta-pill"><i class="far fa-clock"></i> ${r.time_required || '-'}</span>
            <span class="recipe-meta-pill"><i class="fas fa-fire"></i> ${r.calories ?? '-'} kcal</span>
          </div>
          <ul>
            <li><i class="fas fa-utensils"></i> <strong>Soort:</strong> ${r.dish_type || '-'}</li>
            <li><i class="fas fa-layer-group"></i> <strong>Menugang:</strong> ${r.meal_category || '-'}</li>
            <li><i class="fas fa-bullseye"></i> <strong>Doel gerecht:</strong> ${r.meal_type || '-'}</li>
          </ul>
        </div>
      </div>`;
  });
  gridHtml += '</div>';
  allRecipesDiv.innerHTML = html;
  if (overviewGridContainer) overviewGridContainer.innerHTML = gridHtml;

  hydrateOverviewImages();
  hydrateResultImages();
  document.querySelectorAll('.overview-multi-select').forEach(select => {
    createMultiSelect(select, select.dataset.placeholder || 'Selecteer');
  });
  renderOverviewPagination(overviewAllRecipes.length);
  applyOverviewViewMode();
  document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', onUpdateRecipe));
  document.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', onDeleteRecipe));
}

function fetchAllRecipes() {
  if (!ensureLoggedInOrNotify(allRecipesDiv)) {
    allRecipesDiv.innerHTML = `<tr><td colspan="10">Je sessie is verlopen. Log opnieuw in.</td></tr>`;
    if (overviewGridContainer) {
      overviewGridContainer.innerHTML = '<p>Je sessie is verlopen. Log opnieuw in.</p>';
    }
    if (overviewPagination) overviewPagination.innerHTML = '';
    applyOverviewViewMode();
    return;
  }
  const params = new URLSearchParams();
  appendActiveDatabaseParam(params);
  fetch(`${API_BASE}/api/recipes?${params.toString()}`, {
    headers: authHeaders() // ✅ JWT meesturen
  })
    .then(r => r.json())
    .then(showAllRecipes)
    .catch(console.error);
}

function showAllRecipes(recipes) {
  overviewAllRecipes = Array.isArray(recipes) ? recipes : [];
  overviewCurrentPage = 1;
  renderOverviewPage();
}

function dropdown(options, sel, placeholder = 'Selecteer'){
  const selectedValues = extractSelectedOptions(options, sel);
  return `<select class="overview-multi-select" data-placeholder="${placeholder}" multiple>${options.map(o=>`<option${selectedValues.includes(o)?' selected':''}>${o}</option>`).join('')}</select>`;
}

function onUpdateRecipe(e){
  if (!ensureLoggedInOrNotify()) return;
  const row = e.target.closest('tr');
  const id  = row.dataset.id;
  const dishSelect = row.cells[3].querySelector('select');
  const catSelect = row.cells[4].querySelector('select');
  const mealSelect = row.cells[5].querySelector('select');
  const timeSelect = row.cells[6].querySelector('select');
  const data = {
    title:         row.cells[1].innerText.trim(),
    url:           row.cells[2].innerText.trim(),
    dish_type:     getSelectedValues(dishSelect),
    meal_category: getSelectedValues(catSelect),
    meal_type:     getSelectedValues(mealSelect),
    time_required: getSelectedValues(timeSelect),
    calories:      row.cells[7].querySelector('.calories-field').value.trim() || null
  };

  fetch(`${API_BASE}/api/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(withActiveDatabaseBody(data))
  })
    .then(()=>alert('Recept bijgewerkt!'))
    .catch(console.error);
}

function onDeleteRecipe(e){
  if (!confirm('Weet je zeker dat je dit recept wilt verwijderen?')) return;
  if (!ensureLoggedInOrNotify()) return;
  const id = e.target.closest('tr').dataset.id;
  const params = new URLSearchParams();
  appendActiveDatabaseParam(params);
  fetch(`${API_BASE}/api/recipes/${id}?${params.toString()}`, {
    method:'DELETE',
    headers: authHeaders()
  })
    .then(fetchAllRecipes)
    .catch(console.error);
}

/* ========= AUTH ========== */
const msgBox       = document.getElementById('authMessage');
const loginPane    = document.getElementById('loginPane');
const registerPane = document.getElementById('registerPane');
const forgotPane   = document.getElementById('forgotPane');
const resetPane    = document.getElementById('resetPane');
const loggedInPane = document.getElementById('loggedInPane');
const logoutBtn    = document.getElementById('logoutBtn');
const authBtnIcon  = document.querySelector('#authBtn .auth-main-icon');
const authStatusBadge = document.getElementById('authStatusBadge');
const authModal    = document.getElementById('authModal');
const loginText    = document.querySelector('.login-text');

function setSubmitLoading(formId, isLoading, loadingText) {
  const form = document.getElementById(formId);
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (!submitBtn) return;

  if (!submitBtn.dataset.defaultText) {
    submitBtn.dataset.defaultText = submitBtn.textContent.trim();
  }

  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('is-loading', isLoading);
  submitBtn.textContent = isLoading
    ? loadingText
    : submitBtn.dataset.defaultText;
}

function setAuthPane(targetPane) {
  [loggedInPane, loginPane, registerPane, forgotPane, resetPane].forEach(p => {
    if (!p) return;
    if (p === loggedInPane) p.style.display = 'none';
    p.classList.remove('active');
  });

  if (targetPane === loggedInPane) {
    loggedInPane.style.display = 'block';
    return;
  }
  if (targetPane) targetPane.classList.add('active');
}

function showMsg(txt, ok=true){
  msgBox.textContent = txt;
  msgBox.classList.toggle('success', ok);
  msgBox.classList.toggle('error',   !ok);
}

function updateAuthUI(){
  const loggedIn = !!getValidToken();
  msgBox.textContent = '';
  msgBox.classList.remove('success','error');

  if (authBtnIcon) authBtnIcon.className = 'far fa-user auth-main-icon';
  if (loginText) loginText.textContent = loggedIn ? 'Ingelogd' : 'Inloggen';
  if (authStatusBadge) {
    authStatusBadge.classList.toggle('is-logged-in', loggedIn);
    authStatusBadge.innerHTML = loggedIn
      ? '<i class="fas fa-check"></i>'
      : '<i class="fas fa-times"></i>';
  }

  if (loggedIn){
    loadAccessibleDatabases()
      .then(() => maybeStartRecipePackOnboarding())
      .catch(() => {});
    setAuthPane(loggedInPane);
  } else {
    recipePackOnboardingCheckedForUserId = null;
    recipePackOnboardingMarkedDone = false;
    recipePackModal?.classList.add('hidden');
    localStorage.removeItem('activeDatabaseOwnerId');
    if (databaseMenuBtn) databaseMenuBtn.classList.add('hidden');
    if (mobileDatabaseMenuBtn) mobileDatabaseMenuBtn.classList.add('hidden');
    if (databaseModal) databaseModal.classList.add('hidden');
    if (sharePanel) sharePanel.classList.add('hidden');
    setAuthPane(pendingResetToken ? resetPane : loginPane);
  }
}

/* — Uitloggen — */
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('activeDatabaseOwnerId');
  resetForms();
  updateAuthUI();
  authModal.classList.add('hidden');
  fetchAllRecipes();
  resultDiv.innerHTML = '';
});

/* — Registreren — */
document.getElementById('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  setSubmitLoading('register-form', true, 'Registreren...');

  try {
    const res  = await fetch(`${API_BASE}/api/register`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ email,password })
    });
    const data = await res.json();
    showMsg(data.error || data.message || 'Registratie mislukt.', res.ok && !data.error);
  } catch (err) {
    console.error(err);
    showMsg('Server niet bereikbaar.', false);
  } finally {
    setSubmitLoading('register-form', false, 'Registreren...');
  }
});

/* — Inloggen — */
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();

  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  setSubmitLoading('login-form', true, 'Inloggen...');

  try {
    const res  = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem('token', data.token);
      showMsg('Ingelogd!', true);
      resetForms();
      updateAuthUI();
      authModal.classList.add('hidden');
      fetchAllRecipes();
    } else {
      showMsg(data.error || data.message || 'Inloggen mislukt.', false);
    }
  } catch (err) {
    console.error(err);
    showMsg('Server niet bereikbaar.', false);
  } finally {
    setSubmitLoading('login-form', false, 'Inloggen...');
  }
});

/* — Wachtwoord reset aanvragen — */
document.getElementById('forgot-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return;

  try {
    const res = await fetch(`${API_BASE}/api/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    showMsg(data.error || data.message || 'Kon resetlink niet versturen.', res.ok && !data.error);
    if (res.ok) {
      setAuthPane(loginPane);
      document.getElementById('login-email').value = email;
    }
  } catch (err) {
    console.error(err);
    showMsg('Server niet bereikbaar.', false);
  }
});

/* — Nieuw wachtwoord instellen — */
document.getElementById('reset-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const password = document.getElementById('reset-password').value;
  if (!pendingResetToken) {
    showMsg('Resetlink ontbreekt of is verlopen. Vraag opnieuw een reset aan.', false);
    setAuthPane(forgotPane);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pendingResetToken, password })
    });
    const data = await res.json();
    showMsg(data.error || data.message || 'Reset mislukt.', res.ok && !data.error);
    if (res.ok) {
      pendingResetToken = null;
      setAuthPane(loginPane);
    }
  } catch (err) {
    console.error(err);
    showMsg('Server niet bereikbaar.', false);
  }
});

/* ========= MODAL OPEN / CLOSE ========= */
const authBtn   = document.getElementById('authBtn');
const closeAuth = document.getElementById('closeAuth');

authBtn.addEventListener('click', () => { 
  resetForms(); 
  updateAuthUI();
  authModal.classList.remove('hidden'); 
});

closeAuth.addEventListener('click', () => authModal.classList.add('hidden'));
window.addEventListener('click', e => { if (e.target === authModal) authModal.classList.add('hidden'); });

/* CTA onder stappen: "Ik wil beginnen!" opent de login/registratie */
const startNow = document.getElementById('startNow');
if (startNow) {
  startNow.addEventListener('click', (e) => {
    e.preventDefault();
    if (getValidToken()) {
      const chooseTab = document.querySelector('.nav-tabs a[href="#kiesRecept"]');
      if (chooseTab) chooseTab.click();
      window.location.hash = 'kiesRecept';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    resetForms();
    updateAuthUI();
    authModal.classList.remove('hidden');
  });
}

/* ========= GHOST-LINKS SWITCH ========= */
document.querySelectorAll('.ghost-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    if (target === 'loginPane') setAuthPane(loginPane);
    if (target === 'registerPane') setAuthPane(registerPane);
    if (target === 'forgotPane') setAuthPane(forgotPane);
    if (target === 'resetPane') setAuthPane(resetPane);
    msgBox.textContent = '';
    msgBox.classList.remove('success', 'error');
  });
});

/* ========= INIT ========= */
updateAuthUI();
if (pendingResetToken && !getValidToken()) {
  authModal.classList.remove('hidden');
  setAuthPane(resetPane);
  showMsg('Kies een nieuw wachtwoord om verder te gaan.', true);
}
fetchAllRecipes(); // laad direct het overzicht bij paginalaad
