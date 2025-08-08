// index.js — volledig bestand (20-07-2025)

/* ========= API-basis & token-helper ========= */
const API_BASE = 'https://kookkeuze.onrender.com';   // backend op Render

const authHeaders = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

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
  const params = {};
  if (dishTypeSelect.value      !== 'Soort gerecht') params.dish_type     = dishTypeSelect.value;
  if (mealCategorySelect.value  !== 'Menugang')      params.meal_category = mealCategorySelect.value;
  if (mealTypeSelect.value      !== 'Doel gerecht')  params.meal_type     = mealTypeSelect.value;
  if (timeRequiredSelect.value  !== 'Tijd')          params.time_required = timeRequiredSelect.value;
  if (calorieRangeSelect.value  !== 'Calorieën')     params.calorieRange  = calorieRangeSelect.value;

  const searchTerm = document.getElementById('searchTerm').value.trim();
  if (searchTerm) params.search = searchTerm;

  const qs = new URLSearchParams(params).toString();
  fetch(`${API_BASE}/api/recipes?` + qs)
    .then(r => r.json())
    .then(showRecipes)
    .catch(console.error);
});

/* — Random recept — */
document.getElementById('randomBtn').addEventListener('click', () => {
  const params = {};
  if (dishTypeSelect.value      !== 'Soort gerecht') params.dish_type     = dishTypeSelect.value;
  if (mealCategorySelect.value  !== 'Menugang')      params.meal_category = mealCategorySelect.value;
  if (mealTypeSelect.value      !== 'Doel gerecht')  params.meal_type     = mealTypeSelect.value;
  if (timeRequiredSelect.value  !== 'Tijd')          params.time_required = timeRequiredSelect.value;
  if (calorieRangeSelect.value  !== 'Calorieën')     params.calorieRange  = calorieRangeSelect.value;

  const qs = new URLSearchParams(params).toString();
  fetch(`${API_BASE}/api/recipes/random?` + qs)
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
    html += `
      <div class="recipe-card">
        <h3>${r.title}</h3>
        <p><a href="${r.url}" target="_blank" class="ext-link">
          Bekijk&nbsp;recept&nbsp;<i class="fas fa-external-link-alt"></i></a></p>
        <ul>
          <li><strong>Soort:</strong>        ${r.dish_type     || '-'}</li>
          <li><strong>Menugang:</strong>     ${r.meal_category || '-'}</li>
          <li><strong>Doel gerecht:</strong> ${r.meal_type     || '-'}</li>
          <li><strong>Tijd:</strong>         ${r.time_required || '-'}</li>
          <li><strong>Calorieën:</strong>    ${r.calories ?? '-'}</li>
        </ul>
      </div>`;
  });
  html += '</div>';
  resultDiv.innerHTML = html;
}

/* ========= NIEUW RECEPT TOEVOEGEN (TAB 2) ========= */
const addRecipeForm = document.getElementById('addRecipeForm');
const addMessageDiv = document.getElementById('addMessage');

addRecipeForm.addEventListener('submit', e => {
  e.preventDefault();
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
  fetch(`${API_BASE}/api/recipes`)
    .then(r => r.json())
    .then(showAllRecipes)
    .catch(console.error);
}

function showAllRecipes(recipes) {
  allRecipesDiv.innerHTML = '';
  if (!recipes || recipes.length === 0) {
    allRecipesDiv.innerHTML = `<tr><td colspan="9">Er zijn nog geen recepten toegevoegd.</td></tr>`;
    return;
  }
  const dishOpt  = ["Kip","Rund","Varken","Brood","Hartig","Hartige taart","Ovenschotel","Pasta","Rijst","Soep","Taart & cake","Vegetarisch","Vis","Wraps","Zoet"];
  const catOpt   = ["Bakken","Dessert","Dressings, sauzen & dips","Drinken","Hoofdgerecht","Lunch","Ontbijt","Salade","Snacks"];
  const mealOpt  = ["Sporten","Normaal","Cheaten"];
  const timeOpt  = ["Onder de 30 minuten","30 - 45 minuten","45 minuten - 1 uur","1 - 2 uur","langer dan 2 uur"];

  let html = '';
  recipes.forEach(r => {
    const cals = r.calories ?? '';
    html += `
      <tr data-id="${r.id}">
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
  document.querySelectorAll('.edit-btn')   .forEach(b => b.addEventListener('click', onUpdateRecipe));
  document.querySelectorAll('.delete-btn') .forEach(b => b.addEventListener('click', onDeleteRecipe));
}

function dropdown(options, sel){
  return `<select>${options.map(o=>`<option${o===sel?' selected':''}>${o}</option>`).join('')}</select>`;
}

function onUpdateRecipe(e){
  const row = e.target.closest('tr');
  const id  = row.dataset.id;
  const data = {
    title:         row.cells[0].innerText.trim(),
    url:           row.cells[1].innerText.trim(),
    dish_type:     row.cells[2].querySelector('select').value,
    meal_category: row.cells[3].querySelector('select').value,
    meal_type:     row.cells[4].querySelector('select').value,
    time_required: row.cells[5].querySelector('select').value,
    calories:      row.cells[6].querySelector('.calories-field').value.trim() || null
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

function showMsg(txt, ok=true){
  msgBox.textContent = txt;
  msgBox.classList.toggle('success', ok);
  msgBox.classList.toggle('error',   !ok);
}

function updateAuthUI(){
  const loggedIn = !!localStorage.getItem('token');
  msgBox.textContent = '';
  msgBox.classList.remove('success','error');

  authBtnIcon.className = loggedIn ? 'fas fa-user-check' : 'fas fa-user-circle';

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
  showMsg(data.message || 'Registratie mislukt.', res.ok);
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
      resetForms();                 // velden leeg
      updateAuthUI();
      authModal.classList.add('hidden');
    } else {  
      showMsg(data.message || 'Inloggen mislukt.', false);
    }
  } catch (err) {
    console.error(err);
    showMsg('Server niet bereikbaar.', false);   // netwerk- of CORS-fout
  }
});


/* ========= MODAL OPEN / CLOSE ========= */
const authBtn   = document.getElementById('authBtn');
const closeAuth = document.getElementById('closeAuth');

authBtn.addEventListener('click', () => { 
  resetForms(); 
  authModal.classList.remove('hidden'); 
});

closeAuth .addEventListener('click', () => authModal.classList.add('hidden'));
window.addEventListener('click', e => { if (e.target === authModal) authModal.classList.add('hidden'); });

/* CTA onder stappen: "Ik wil beginnen!" opent de login/registratie */
const startNow = document.getElementById('startNow');
if (startNow) {
  startNow.addEventListener('click', (e) => {
    e.preventDefault();
    resetForms();
    authModal.classList.remove('hidden');     // toon modal

    // Wil je direct het registratie-tabje tonen?
    // registerPane.classList.add('active');
    // loginPane.classList.remove('active');
  });
}


/* ========= GHOST-LINKS SWITCH ========= */
document.querySelectorAll('.ghost-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    loginPane   .classList.toggle('active', btn.dataset.target === 'loginPane');
    registerPane.classList.toggle('active', btn.dataset.target === 'registerPane');
    resetForms();      // velden en melding schoon

  });
});

/* ========= INIT ========= */
updateAuthUI();
fetchAllRecipes();     // laad direct het overzicht bij paginalaad
