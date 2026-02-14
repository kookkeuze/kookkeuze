// index.js — volledig bestand (auto-login + betere foutmeldingen)

/* ========= API-basis & token-helper ========= */
const API_BASE = 'https://kookkeuze.onrender.com';   // backend op Render

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
    }
  } catch (e) {
    console.error('Auto-login parse error:', e);
  }
})();

/* -- alles leegmaken & melding wissen -- */
function resetForms() {
  document.getElementById('login-form')   .reset();
  document.getElementById('register-form').reset();
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

/* — Zoekknop — */
document.getElementById('searchBtn').addEventListener('click', () => {
  if (!ensureLoggedInOrNotify(resultDiv)) return;
  const params = {};
  if (dishTypeSelect.value      !== 'Soort gerecht') params.dish_type     = dishTypeSelect.value;
  if (mealCategorySelect.value  !== 'Menugang')      params.meal_category = mealCategorySelect.value;
  if (mealTypeSelect.value      !== 'Doel gerecht')  params.meal_type     = mealTypeSelect.value;
  if (timeRequiredSelect.value  !== 'Tijd')          params.time_required = timeRequiredSelect.value;
  if (calorieRangeSelect.value  !== 'Calorieën')     params.calorieRange  = calorieRangeSelect.value;

  const searchTerm = document.getElementById('searchTerm').value.trim();
  if (searchTerm) params.search = searchTerm;

  const qs = new URLSearchParams(params).toString();
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
  const params = {};
  if (dishTypeSelect.value      !== 'Soort gerecht') params.dish_type     = dishTypeSelect.value;
  if (mealCategorySelect.value  !== 'Menugang')      params.meal_category = mealCategorySelect.value;
  if (mealTypeSelect.value      !== 'Doel gerecht')  params.meal_type     = mealTypeSelect.value;
  if (timeRequiredSelect.value  !== 'Tijd')          params.time_required = timeRequiredSelect.value;
  if (calorieRangeSelect.value  !== 'Calorieën')     params.calorieRange  = calorieRangeSelect.value;

  const qs = new URLSearchParams(params).toString();
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
  let html = '<div class="recipe-cards-container">';
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
  html += '</div>';
  resultDiv.innerHTML = html;
  hydrateResultImages();
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
const fetchInfoBtn  = document.getElementById('fetchInfoBtn');
const urlInfoBtn    = document.getElementById('urlInfoBtn');
const urlInfoNote   = document.getElementById('urlInfoNote');
const homeLogo      = document.getElementById('homeLogo');

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
  if (input.tagName === 'SELECT') return input.value !== 'maak een keuze';
  return input.value.trim() !== '';
}

function clearMissingState() {
  document.querySelectorAll('.field-missing').forEach(el => el.classList.remove('field-missing'));
  document.querySelectorAll('.field-error-text').forEach(el => el.remove());
}

function setMissingState(input, message) {
  if (!input) return;
  input.classList.add('field-missing');
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
      if (dishTypeNew.value === 'maak een keuze' && data.dish_type) dishTypeNew.value = data.dish_type;

      const mealCategoryNew = document.getElementById('mealCategoryNew');
      if (mealCategoryNew.value === 'maak een keuze' && data.meal_category) mealCategoryNew.value = data.meal_category;

      const mealTypeNew = document.getElementById('mealTypeNew');
      if (mealTypeNew.value === 'maak een keuze' && data.meal_type) mealTypeNew.value = data.meal_type;

      const timeRequiredNew = document.getElementById('timeRequiredNew');
      if (timeRequiredNew.value === 'maak een keuze' && data.time_required) timeRequiredNew.value = data.time_required;

      const caloriesNew = document.getElementById('caloriesNew');
      if (!caloriesNew.value.trim() && data.calories != null) caloriesNew.value = data.calories;

      if (data.missing && data.missing.length) {
        data.missing.forEach(fieldName => {
          const fieldId = fieldNameToId[fieldName];
          if (!fieldId) return;
          const input = document.getElementById(fieldId);
          if (!isFilled(input)) {
            setMissingState(input, `${fieldName} moet nog handmatig ingevuld worden.`);
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

if (urlInfoBtn && urlInfoNote) {
  urlInfoBtn.addEventListener('click', () => {
    urlInfoNote.classList.toggle('show');
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
    dish_type:     document.getElementById('dishTypeNew').value,
    meal_category: document.getElementById('mealCategoryNew').value,
    meal_type:     document.getElementById('mealTypeNew').value,
    time_required: document.getElementById('timeRequiredNew').value,
    calories:      cal ? parseInt(cal, 10) : null
  };

  fetch(`${API_BASE}/api/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(bodyData)
  })
    .then(r => r.json())
    .then(d => {
      addMessageDiv.innerHTML = d.error
        ? `<p style="color:red;">${d.error}</p>`
        : `<p style="color:green;">${d.message} (ID: ${d.id})</p>`;
      if (!d.error) addRecipeForm.reset();
    })
    .catch(console.error);
});

/* ========= OVERZICHT RECEPTEN (TAB 3) ========= */
const allRecipesDiv = document.getElementById('allRecipes');
const refreshBtn    = document.getElementById('refreshBtn');
if (refreshBtn) refreshBtn.addEventListener('click', fetchAllRecipes);

function fetchAllRecipes() {
  if (!ensureLoggedInOrNotify(allRecipesDiv)) {
    allRecipesDiv.innerHTML = `<tr><td colspan="10">Je sessie is verlopen. Log opnieuw in.</td></tr>`;
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
  allRecipesDiv.innerHTML = '';
  if (!recipes || recipes.length === 0) {
    allRecipesDiv.innerHTML = `<tr><td colspan="10">Er zijn nog geen recepten toegevoegd.</td></tr>`;
    return;
  }
  const dishOpt  = ["Kip","Rund","Varken","Brood","Hartig","Hartige taart","Ovenschotel","Pasta","Rijst","Soep","Taart & cake","Vegetarisch","Vis","Wraps","Zoet"];
  const catOpt   = ["Bakken","Dessert","Dressings, sauzen & dips","Drinken","Hoofdgerecht","Lunch","Ontbijt","Salade","Snacks"];
  const mealOpt  = ["Sporten","Normaal","Cheaten"];
  const timeOpt  = ["Onder de 30 minuten","30 - 45 minuten","45 minuten - 1 uur","1 - 2 uur","langer dan 2 uur"];

  let html = '';
  recipes.forEach(r => {
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
        <td>${dropdown(dishOpt,  r.dish_type)}</td>
        <td>${dropdown(catOpt,   r.meal_category)}</td>
        <td>${dropdown(mealOpt,  r.meal_type)}</td>
        <td>${dropdown(timeOpt,  r.time_required)}</td>
        <td><input class="calories-field" type="number" value="${cals}" /></td>
        <td><button class="green-btn edit-btn">Opslaan</button></td>
        <td><button class="pink-btn  delete-btn">Verwijder</button></td>
      </tr>`;
  });
  allRecipesDiv.innerHTML = html;
  hydrateOverviewImages();
  document.querySelectorAll('.edit-btn')   .forEach(b => b.addEventListener('click', onUpdateRecipe));
  document.querySelectorAll('.delete-btn') .forEach(b => b.addEventListener('click', onDeleteRecipe));
}

function dropdown(options, sel){
  return `<select>${options.map(o=>`<option${o===sel?' selected':''}>${o}</option>`).join('')}</select>`;
}

function onUpdateRecipe(e){
  if (!ensureLoggedInOrNotify()) return;
  const row = e.target.closest('tr');
  const id  = row.dataset.id;
  const data = {
    title:         row.cells[1].innerText.trim(),
    url:           row.cells[2].innerText.trim(),
    dish_type:     row.cells[3].querySelector('select').value,
    meal_category: row.cells[4].querySelector('select').value,
    meal_type:     row.cells[5].querySelector('select').value,
    time_required: row.cells[6].querySelector('select').value,
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
const loggedInPane = document.getElementById('loggedInPane');
const logoutBtn    = document.getElementById('logoutBtn');
const authBtnIcon  = document.querySelector('#authBtn i');
const authModal    = document.getElementById('authModal');
const loginText    = document.querySelector('.login-text');

function showMsg(txt, ok=true){
  msgBox.textContent = txt;
  msgBox.classList.toggle('success', ok);
  msgBox.classList.toggle('error',   !ok);
}

function updateAuthUI(){
  const loggedIn = !!getValidToken();
  msgBox.textContent = '';
  msgBox.classList.remove('success','error');

  authBtnIcon.className = loggedIn ? 'fas fa-user-check' : 'fas fa-user-circle';
  if (loginText) loginText.textContent = loggedIn ? 'Ingelogd' : 'Inloggen/registreren';

  if (loggedIn){
    loggedInPane.style.display = 'block';
    loginPane.classList.remove('active');
    registerPane.classList.remove('active');
  } else {
    loggedInPane.style.display = 'none';
    loginPane.classList.add('active');
    registerPane.classList.remove('active');
  }
}

/* — Uitloggen — */
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  resetForms();
  updateAuthUI();
  authModal.classList.add('hidden');
  window.location.reload();
});

/* — Registreren — */
document.getElementById('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

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
  }
});

/* — Inloggen — */
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();

  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

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
      window.location.reload();
    } else {
      showMsg(data.error || data.message || 'Inloggen mislukt.', false);
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
  authModal.classList.remove('hidden'); 
});

closeAuth.addEventListener('click', () => authModal.classList.add('hidden'));
window.addEventListener('click', e => { if (e.target === authModal) authModal.classList.add('hidden'); });

/* CTA onder stappen: "Ik wil beginnen!" opent de login/registratie */
const startNow = document.getElementById('startNow');
if (startNow) {
  startNow.addEventListener('click', (e) => {
    e.preventDefault();
    resetForms();
    authModal.classList.remove('hidden');
    // registerPane.classList.add('active');
    // loginPane.classList.remove('active');
  });
}

/* ========= GHOST-LINKS SWITCH ========= */
document.querySelectorAll('.ghost-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    loginPane   .classList.toggle('active', btn.dataset.target === 'loginPane');
    registerPane.classList.toggle('active', btn.dataset.target === 'registerPane');
    resetForms();
  });
});

/* ========= INIT ========= */
updateAuthUI();
fetchAllRecipes(); // laad direct het overzicht bij paginalaad
