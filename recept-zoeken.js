const randomBtn = document.getElementById('internetRandomBtn');
const randomAgainBtn = document.getElementById('internetRandomAgainBtn');
const resultEl = document.getElementById('internetRecipeResult');
const statusEl = document.getElementById('recipeSearchStatus');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fetchRecipeImage(url) {
  if (!url) return Promise.resolve(null);

  return fetch(`/api/recipe-image?url=${encodeURIComponent(url)}`)
    .then(res => res.json())
    .then(data => data?.imageUrl || null)
    .catch(() => null);
}

function setResultCardImage(cell, imageUrl, title) {
  if (!cell) return;
  cell.innerHTML = '';

  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'recipe-card-image';
    img.alt = title || 'Recept';
    img.loading = 'lazy';
    img.src = imageUrl;
    cell.appendChild(img);
    return;
  }

  const fallback = document.createElement('div');
  fallback.className = 'recipe-card-image-fallback';
  fallback.textContent = 'Geen afbeelding gevonden';
  cell.appendChild(fallback);
}

function renderLoadingState() {
  resultEl.innerHTML = `
    <div class="recipe-cards-container recipe-search-card-grid">
      <article class="recipe-card recipe-search-result-card is-loading">
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
      </article>
    </div>
  `;
}

function renderErrorState(message) {
  resultEl.innerHTML = `
    <div class="recipe-search-empty-state recipe-search-empty-state--error">
      <div class="recipe-search-empty-icon" aria-hidden="true">
        <i class="fas fa-triangle-exclamation"></i>
      </div>
      <h3>Ophalen lukte niet</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function buildIngredientsPreview(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="recipe-search-ingredients-empty">Geen ingredientenvoorbeeld beschikbaar.</p>';
  }

  return `
    <div class="recipe-search-ingredient-chips">
      ${items.map(item => `<span class="recipe-search-ingredient-chip">${escapeHtml(item)}</span>`).join('')}
    </div>
  `;
}

function renderRecipeCard(recipe) {
  const title = recipe?.title || 'Random recept';
  const url = recipe?.url || '#';
  const source = recipe?.source || 'Receptwebsite';
  const dishType = recipe?.dish_type || '-';
  const mealCategory = recipe?.meal_category || '-';
  const mealType = recipe?.meal_type || '-';
  const timeRequired = recipe?.time_required || '-';
  const calories = recipe?.calories ?? '-';

  resultEl.innerHTML = `
    <div class="recipe-cards-container recipe-search-card-grid">
      <article class="recipe-card recipe-search-result-card">
        <div class="result-image-cell" data-random-image-cell>
          <div class="recipe-card-image-skeleton"></div>
        </div>

        <div class="recipe-card-content">
          <div class="recipe-card-head recipe-search-card-head">
            <div class="recipe-search-source-group">
              <span class="recipe-search-source-chip">${escapeHtml(source)}</span>
              <span class="recipe-search-source-label">Random van internet</span>
            </div>
          </div>

          <h3>${escapeHtml(title)}</h3>

          <p class="recipe-link">
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
              Bekijk recept <i class="fas fa-external-link-alt" aria-hidden="true"></i>
            </a>
          </p>

          <div class="recipe-meta-row">
            <span class="recipe-meta-pill"><i class="far fa-clock" aria-hidden="true"></i> ${escapeHtml(timeRequired)}</span>
            <span class="recipe-meta-pill"><i class="fas fa-fire" aria-hidden="true"></i> ${escapeHtml(calories)} kcal</span>
          </div>

          <ul>
            <li><i class="fas fa-utensils" aria-hidden="true"></i> <strong>Soort:</strong> ${escapeHtml(dishType)}</li>
            <li><i class="fas fa-layer-group" aria-hidden="true"></i> <strong>Menugang:</strong> ${escapeHtml(mealCategory)}</li>
            <li><i class="fas fa-bullseye" aria-hidden="true"></i> <strong>Doel gerecht:</strong> ${escapeHtml(mealType)}</li>
          </ul>

          <div class="recipe-search-ingredients-block">
            <p class="recipe-search-ingredients-title">Voorbeeld van ingredienten</p>
            ${buildIngredientsPreview(recipe?.ingredients_preview)}
          </div>
        </div>
      </article>
    </div>
  `;

  const imageCell = resultEl.querySelector('[data-random-image-cell]');
  fetchRecipeImage(url).then(imageUrl => setResultCardImage(imageCell, imageUrl, title));
}

async function loadRandomRecipe() {
  if (!randomBtn || !resultEl || !statusEl) return;

  randomBtn.disabled = true;
  randomAgainBtn?.classList.add('hidden');
  statusEl.textContent = 'We zoeken een lekker random recept voor je...';
  renderLoadingState();

  try {
    const res = await fetch('/api/internet-recipe-random');
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.error) {
      throw new Error(data?.error || 'Kon geen random recept ophalen.');
    }

    renderRecipeCard(data);
    statusEl.textContent = `Gevonden op ${data.source || 'een bekende receptenwebsite'}.`;
    randomAgainBtn?.classList.remove('hidden');
  } catch (err) {
    renderErrorState(err.message || 'Kon geen random recept ophalen.');
    statusEl.textContent = 'Probeer het nog eens, we konden nu geen recept ophalen.';
  } finally {
    randomBtn.disabled = false;
  }
}

randomBtn?.addEventListener('click', loadRandomRecipe);
randomAgainBtn?.addEventListener('click', loadRandomRecipe);
