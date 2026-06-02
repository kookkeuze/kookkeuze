const API_BASE = window.location.origin;
const resultDiv = document.getElementById('result');
const dishTypeSelect = document.getElementById('dishType');
const mealCategorySelect = document.getElementById('mealCategory');
const mealTypeSelect = document.getElementById('mealType');
const timeRequiredSelect = document.getElementById('timeRequired');
const calorieRangeSelect = document.getElementById('calorieRange');
const searchTermInput = document.getElementById('searchTerm');
const searchBtn = document.getElementById('searchBtn');
const randomBtn = document.getElementById('randomBtn');

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

function getSelectedValue(select) {
  return select ? String(select.value || '').trim() : '';
}

function buildParams(includeSearch = true) {
  const params = new URLSearchParams();

  const filterMap = [
    [dishTypeSelect, 'dish_type', 'Soort gerecht'],
    [mealCategorySelect, 'meal_category', 'Menugang'],
    [mealTypeSelect, 'meal_type', 'Doel gerecht'],
    [timeRequiredSelect, 'time_required', 'Tijd'],
    [calorieRangeSelect, 'calorieRange', 'Calorieën']
  ];

  filterMap.forEach(([select, key, placeholder]) => {
    const value = getSelectedValue(select);
    if (value && value !== placeholder && value !== 'maak een keuze') {
      params.append(key, value);
    }
  });

  if (includeSearch) {
    const searchTerm = String(searchTermInput?.value || '').trim();
    if (searchTerm) params.append('search', searchTerm);
  }

  return params;
}

function fetchRecipeImage(url) {
  if (!url) return Promise.resolve(null);

  return fetch(`${API_BASE}/api/recipe-image?url=${encodeURIComponent(url)}`, { cache: 'no-store' })
    .then(res => res.json())
    .then(data => data?.imageUrl || null)
    .catch(() => null);
}

function setResultCardImage(cell, imageUrl, title) {
  if (!cell) return;
  cell.innerHTML = '';
  cell.classList.add('is-loading');

  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'recipe-card-image';
    img.alt = title || 'Recept';
    img.loading = 'lazy';
    img.src = imageUrl;
    img.addEventListener('load', () => cell.classList.remove('is-loading'), { once: true });
    img.addEventListener('error', () => {
      cell.classList.remove('is-loading');
      cell.innerHTML = '<div class="recipe-card-image-fallback">Geen afbeelding gevonden</div>';
    }, { once: true });
    cell.appendChild(img);
    return;
  }

  cell.classList.remove('is-loading');
  cell.innerHTML = '<div class="recipe-card-image-fallback">Geen afbeelding gevonden</div>';
}

function hydrateResultImages() {
  resultDiv.querySelectorAll('.result-image-cell').forEach(cell => {
    const url = decodeURIComponent(cell.dataset.url || '');
    const title = cell.dataset.title || 'Recept';
    fetchRecipeImage(url).then(imageUrl => setResultCardImage(cell, imageUrl, title));
  });
}

function renderEmptyState(message) {
  resultDiv.innerHTML = `
    <div class="recipe-search-empty-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderErrorState(message) {
  resultDiv.innerHTML = `
    <div class="recipe-search-error-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderLoadingState() {
  resultDiv.innerHTML = `
    <div class="recipe-cards-container search-results single-result">
      <div class="recipe-card">
        <div class="result-image-cell">
          <div class="recipe-card-image-skeleton"></div>
        </div>
        <div class="recipe-card-content">
          <div class="recipe-search-loading-copy">
            <span class="recipe-search-loading-line recipe-search-loading-line--short"></span>
            <span class="recipe-search-loading-line"></span>
            <span class="recipe-search-loading-line"></span>
            <span class="recipe-search-loading-line recipe-search-loading-line--wide"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function showRecipes(recipes) {
  if (!Array.isArray(recipes) || recipes.length === 0) {
    renderEmptyState('Geen resultaten gevonden.');
    return;
  }

  const singleClass = recipes.length === 1 ? ' single-result' : '';
  let html = `<div class="recipe-cards-container search-results${singleClass}">`;

  recipes.forEach(recipe => {
    const safeUrl = encodeURIComponent(recipe.url || '');
    const safeHref = escapeAttr(recipe.url || '#');
    const safeTitle = escapeAttr(recipe.title || 'Recept');
    const displayTitle = escapeHtml(recipe.title || 'Recept');

    html += `
      <div class="recipe-card">
        <div class="result-image-cell" data-url="${safeUrl}" data-title="${safeTitle}">
          <div class="recipe-card-image-skeleton"></div>
        </div>
        <div class="recipe-card-content">
          <div class="recipe-card-head">
            <h3>${displayTitle}</h3>
          </div>
          <div class="recipe-card-actions">
            <p class="recipe-link"><a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="ext-link">
              Bekijk&nbsp;recept&nbsp;<i class="fas fa-external-link-alt"></i></a></p>
          </div>
          <div class="recipe-meta-row">
            <span class="recipe-meta-pill"><i class="far fa-clock"></i> ${escapeHtml(recipe.time_required || '-')}</span>
            <span class="recipe-meta-pill"><i class="fas fa-fire"></i> ${escapeHtml(recipe.calories ?? '-')} kcal</span>
          </div>
          <ul>
            <li><i class="fas fa-utensils"></i> <strong>Soort:</strong> ${escapeHtml(recipe.dish_type || '-')}</li>
            <li><i class="fas fa-layer-group"></i> <strong>Menugang:</strong> ${escapeHtml(recipe.meal_category || '-')}</li>
            <li><i class="fas fa-bullseye"></i> <strong>Doel gerecht:</strong> ${escapeHtml(recipe.meal_type || '-')}</li>
          </ul>
        </div>
      </div>`;
  });

  html += '</div>';
  resultDiv.innerHTML = html;
  hydrateResultImages();
}

async function searchInternetRecipes() {
  renderLoadingState();

  try {
    const params = buildParams(true);
    const res = await fetch(`${API_BASE}/api/internet-recipes?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ([]));

    if (!res.ok || data?.error) {
      throw new Error(data?.error || 'Kon internetrecepten niet ophalen.');
    }

    showRecipes(data);
  } catch (err) {
    renderErrorState(err.message || 'Er ging iets fout bij het ophalen van recepten.');
  }
}

async function fetchRandomInternetRecipe() {
  renderLoadingState();

  try {
    const params = buildParams(true);
    const res = await fetch(`${API_BASE}/api/internet-recipe-random?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.error) {
      throw new Error(data?.error || 'Er ging iets fout bij het ophalen van een random recept.');
    }

    if (!data || data.message === 'Geen resultaten gevonden.') {
      renderEmptyState('Geen resultaten gevonden.');
      return;
    }

    showRecipes([data]);
  } catch (err) {
    renderErrorState(err.message || 'Er ging iets fout bij het ophalen van een random recept.');
  }
}

searchBtn?.addEventListener('click', searchInternetRecipes);
randomBtn?.addEventListener('click', fetchRandomInternetRecipe);

searchTermInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchInternetRecipes();
  }
});
