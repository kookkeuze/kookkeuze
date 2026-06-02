const randomBtn = document.getElementById('internetRandomBtn');
const resultEl = document.getElementById('internetRecipeResult');
const API_BASE = window.location.origin;

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

  return fetch(`${API_BASE}/api/recipe-image?url=${encodeURIComponent(url)}`, { cache: 'no-store' })
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
    <div class="recipe-cards-container search-results single-result">
      <article class="recipe-card">
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
    <div class="recipe-search-error-state">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderRecipeCard(recipe) {
  const title = recipe?.title || 'Random recept';
  const url = recipe?.url || '#';
  const dishType = recipe?.dish_type || '-';
  const mealCategory = recipe?.meal_category || '-';
  const mealType = recipe?.meal_type || '-';
  const timeRequired = recipe?.time_required || '-';
  const calories = recipe?.calories ?? '-';

  resultEl.innerHTML = `
    <div class="recipe-cards-container search-results single-result">
      <article class="recipe-card">
        <div class="result-image-cell" data-random-image-cell>
          <div class="recipe-card-image-skeleton"></div>
        </div>

        <div class="recipe-card-content">
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
        </div>
      </article>
    </div>
  `;

  const imageCell = resultEl.querySelector('[data-random-image-cell]');
  fetchRecipeImage(url).then(imageUrl => setResultCardImage(imageCell, imageUrl, title));
}

async function loadRandomRecipe() {
  if (!randomBtn || !resultEl) return;

  randomBtn.disabled = true;
  renderLoadingState();

  try {
    const res = await fetch(`${API_BASE}/api/internet-recipe-random`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.error) {
      throw new Error(data?.error || 'Kon geen random recept ophalen.');
    }

    renderRecipeCard(data);
  } catch (err) {
    renderErrorState(err.message || 'Kon geen random recept ophalen.');
  } finally {
    randomBtn.disabled = false;
  }
}

randomBtn?.addEventListener('click', loadRandomRecipe);
