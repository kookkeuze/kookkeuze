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

function ensureLoggedInOrNotify(targetEl) {
  if (getValidToken()) return true;

  if (targetEl) {
    targetEl.innerHTML = '<p>Je sessie is verlopen. Log opnieuw in om verder te gaan.</p>';
  }
  if (typeof updateAuthUI === 'function') updateAuthUI();
  return false;
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
const navDropdown  = document.getElementById('navDropdown');
const installAppBtn = document.getElementById('installAppBtn');
const installAppText = document.getElementById('installAppText');
let deferredInstallPrompt = null;

tabLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();

    tabLinks.forEach(l  => l.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));

    link.classList.add('active');
    const targetId      = link.getAttribute('href');
    const targetContent = document.querySelector(targetId);
    if (targetContent) targetContent.classList.add('active');

    if (navDropdown) navDropdown.value = targetId;
    if (targetId === '#overzichtRecepten') fetchAllRecipes();
    if (targetId === '#weekmenuPlanner') initWeekPlanner();
  });
});

if (navDropdown) {
  navDropdown.addEventListener('change', e => {
    const target = e.target.value;
    document.querySelector(`.nav-tabs a[href="${target}"]`).click();
  });
  const active = document.querySelector('.tab-link.active');
  if (active) navDropdown.value = active.getAttribute('href');
}

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
  let html = `<div class="recipe-cards-container search-results${singleClass}">`;
  arr.forEach(r => {
    const safeUrl = encodeURIComponent(r.url || '');
    const safeTitle = (r.title || 'Recept').replace(/"/g, '&quot;');
    html += `
      <div class="recipe-card">
        <div class="result-image-cell" data-url="${safeUrl}" data-title="${safeTitle}">
          <div class="recipe-card-image-skeleton"></div>
        </div>
        <div class="recipe-card-content">
          <h3>${r.title}</h3>
          <div class="recipe-card-actions">
            <p class="recipe-link"><a href="${r.url}" target="_blank" class="ext-link">
              Bekijk&nbsp;recept&nbsp;<i class="fas fa-external-link-alt"></i></a></p>
            <button type="button" class="green-btn plan-recipe-btn" data-recipe-id="${r.id}" data-recipe-title="${(r.title || 'Recept').replace(/"/g, '&quot;')}">Plan in weekmenu</button>
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
        </div>
      </div>`;
  });
  html += '</div>';
  resultDiv.innerHTML = html;
  hydrateResultImages();
}

/* ========= WEEKMENU PLANNER ========= */
const weekmenuGrid = document.getElementById('weekmenuGrid');
const weekLabel = document.getElementById('weekLabel');
const weekPrevBtn = document.getElementById('weekPrevBtn');
const weekNextBtn = document.getElementById('weekNextBtn');
const weekmenuSearchInput = document.getElementById('weekmenuSearchInput');
const weekmenuSearchResults = document.getElementById('weekmenuSearchResults');
const weekmenuDaySelect = document.getElementById('weekmenuDaySelect');
const weekmenuSlotSelect = document.getElementById('weekmenuSlotSelect');
const assignModal = document.getElementById('assignModal');
const closeAssignModal = document.getElementById('closeAssignModal');
const assignModalRecipeTitle = document.getElementById('assignModalRecipeTitle');
const assignDaySelect = document.getElementById('assignDaySelect');
const assignSlotSelect = document.getElementById('assignSlotSelect');
const assignModalSaveBtn = document.getElementById('assignModalSaveBtn');

const plannerDays = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
let plannerWeekStart = null;
let plannerInitialized = false;
let plannerRecipes = [];
let plannerEntries = new Map();
let pendingAssignRecipeId = null;

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

function formatDayNumber(weekStartIso, offset) {
  const dt = new Date(`${weekStartIso}T00:00:00`);
  dt.setDate(dt.getDate() + offset);
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(dt);
}

function plannerSlotKey(day, slot) {
  return `${day}-${slot}`;
}

function openAssignModalForRecipe(recipeId, recipeTitle) {
  if (!ensureLoggedInOrNotify(resultDiv)) return;
  if (!plannerWeekStart) plannerWeekStart = toIsoDate(getMonday(new Date()));
  pendingAssignRecipeId = Number(recipeId);
  if (assignModalRecipeTitle) assignModalRecipeTitle.textContent = recipeTitle || 'Recept';
  if (assignDaySelect && weekmenuDaySelect) assignDaySelect.value = weekmenuDaySelect.value || '1';
  if (assignSlotSelect && weekmenuSlotSelect) assignSlotSelect.value = weekmenuSlotSelect.value || 'dinner';
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
  const res = await fetch(`${API_BASE}/api/recipes`, { headers: authHeaders() });
  const data = await res.json();
  plannerRecipes = Array.isArray(data) ? data : [];
}

async function loadWeekMenu() {
  if (!ensureLoggedInOrNotify(weekmenuGrid)) return;
  const res = await fetch(`${API_BASE}/api/meal-plan?weekStart=${encodeURIComponent(plannerWeekStart)}`, {
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
  let html = '<div class="weekmenu-calendar">';

  const daySlots = [
    { key: 'breakfast', label: 'Ontbijt' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'snack', label: 'Tussendoor' },
    { key: 'dinner', label: 'Avondeten' }
  ];

  for (let day = 1; day <= 7; day++) {

    const renderSlot = (slotKey, slotLabel, entry) => {
      if (entry) {
        return `
          <div class="weekmenu-slot-item">
            <p class="weekmenu-slot-name">${slotLabel}</p>
            <a href="${entry.url}" target="_blank" class="weekmenu-cell-title">${entry.title}</a>
            <div class="weekmenu-cell-actions">
              <button type="button" class="green-btn weekmenu-replace-btn" data-day="${day}" data-slot="${slotKey}">Wijzig</button>
              <button type="button" class="pink-btn weekmenu-clear-btn" data-day="${day}" data-slot="${slotKey}">Wis</button>
            </div>
          </div>`;
      }
      return `
        <div class="weekmenu-slot-item">
          <p class="weekmenu-slot-name">${slotLabel}</p>
          <p class="weekmenu-empty">Nog niets gepland</p>
          <button type="button" class="green-btn weekmenu-replace-btn" data-day="${day}" data-slot="${slotKey}">Kies recept</button>
        </div>`;
    };

    html += `
      <article class="weekmenu-day-card">
        <header class="weekmenu-day-header">
          <p class="weekmenu-day-name">${plannerDays[day - 1]}</p>
          <p class="weekmenu-day-date">${formatDayNumber(plannerWeekStart, day - 1)}</p>
        </header>
        <div class="weekmenu-day-body">
          ${daySlots.map(slot => renderSlot(slot.key, slot.label, plannerEntries.get(plannerSlotKey(day, slot.key)))).join('')}
        </div>
      </article>`;
  }

  html += '</div>';
  weekmenuGrid.innerHTML = html;

  weekmenuGrid.querySelectorAll('.weekmenu-clear-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await clearPlannerSlot(Number(btn.dataset.day), btn.dataset.slot);
    });
  });

  weekmenuGrid.querySelectorAll('.weekmenu-replace-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (weekmenuDaySelect) weekmenuDaySelect.value = String(btn.dataset.day);
      if (weekmenuSlotSelect) weekmenuSlotSelect.value = btn.dataset.slot;
      weekmenuSearchInput?.focus();
      weekmenuSearchInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

function renderPlannerSearchResults() {
  if (!weekmenuSearchResults) return;
  const term = (weekmenuSearchInput?.value || '').trim().toLowerCase();
  const filtered = plannerRecipes
    .filter(r => (r.title || '').toLowerCase().includes(term))
    .slice(0, 25);

  if (filtered.length === 0) {
    weekmenuSearchResults.innerHTML = '<p class="weekmenu-search-empty">Geen recepten gevonden.</p>';
    return;
  }

  let html = '';
  filtered.forEach(recipe => {
    html += `
      <div class="weekmenu-search-item">
        <a href="${recipe.url}" target="_blank" class="weekmenu-search-title">${recipe.title}</a>
        <button type="button" class="green-btn weekmenu-assign-btn" data-recipe-id="${recipe.id}">Plan</button>
      </div>`;
  });
  weekmenuSearchResults.innerHTML = html;

  weekmenuSearchResults.querySelectorAll('.weekmenu-assign-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const day = Number(weekmenuDaySelect?.value || '1');
      const slot = weekmenuSlotSelect?.value || 'dinner';
      await assignRecipeToPlanner(Number(btn.dataset.recipeId), day, slot);
    });
  });
}

async function assignRecipeToPlanner(recipeId, dayOfWeek, slot) {
  if (!ensureLoggedInOrNotify(weekmenuGrid)) return;
  const res = await fetch(`${API_BASE}/api/meal-plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      week_start: plannerWeekStart,
      day_of_week: dayOfWeek,
      meal_slot: slot,
      recipe_id: recipeId
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    alert(data.error || 'Opslaan in weekmenu mislukt.');
    return;
  }
  await loadWeekMenu();
}

async function clearPlannerSlot(dayOfWeek, slot) {
  if (!ensureLoggedInOrNotify(weekmenuGrid)) return;
  const res = await fetch(`${API_BASE}/api/meal-plan`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      week_start: plannerWeekStart,
      day_of_week: dayOfWeek,
      meal_slot: slot
    })
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

  weekmenuSearchInput?.addEventListener('input', renderPlannerSearchResults);
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

  resultDiv?.addEventListener('click', e => {
    const btn = e.target.closest('.plan-recipe-btn');
    if (!btn) return;
    openAssignModalForRecipe(btn.dataset.recipeId, btn.dataset.recipeTitle);
  });

  closeAssignModal?.addEventListener('click', closeAssignModalPanel);
  assignModal?.addEventListener('click', e => {
    if (e.target === assignModal) closeAssignModalPanel();
  });
  assignModalSaveBtn?.addEventListener('click', async () => {
    if (!pendingAssignRecipeId) return;
    const day = Number(assignDaySelect?.value || '1');
    const slot = assignSlotSelect?.value || 'dinner';
    await assignRecipeToPlanner(pendingAssignRecipeId, day, slot);
    closeAssignModalPanel();
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installAppBtn) installAppBtn.style.display = 'inline-block';
  if (installAppText) installAppText.style.display = 'inline-block';
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
    body: JSON.stringify(bodyData)
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
  fetch(`${API_BASE}/api/recipes`, {
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
    body: JSON.stringify(data)
  })
    .then(()=>alert('Recept bijgewerkt!'))
    .catch(console.error);
}

function onDeleteRecipe(e){
  if (!confirm('Weet je zeker dat je dit recept wilt verwijderen?')) return;
  if (!ensureLoggedInOrNotify()) return;
  const id = e.target.closest('tr').dataset.id;
  fetch(`${API_BASE}/api/recipes/${id}`, {
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
    setAuthPane(loggedInPane);
  } else {
    setAuthPane(pendingResetToken ? resetPane : loginPane);
  }
}

/* — Uitloggen — */
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
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
