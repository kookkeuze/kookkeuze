// recept.js — toont een eigen recept op /recept/<id>.
// De pagina is privé: hij haalt het recept op met de JWT uit localStorage, dus
// alleen wie toegang heeft tot de bijbehorende database ziet de inhoud.

(function () {
  const statusEl = document.getElementById('ownRecipeStatus');
  const bodyEl = document.getElementById('ownRecipeBody');
  if (!statusEl || !bodyEl) return;

  const API_BASE = (window.location.origin || '').replace(/\/+$/, '');
  const recipeId = (window.location.pathname.match(/\/recept\/(\d+)/) || [])[1] || '';

  function getValidToken() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
      const base64 = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(base64));
      if (!payload.exp || Date.now() >= payload.exp * 1000) return null;
      return token;
    } catch (_err) {
      return null;
    }
  }

  function authHeaders() {
    const token = getValidToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showStatus(message, withLoginLink) {
    bodyEl.hidden = true;
    statusEl.hidden = false;
    statusEl.innerHTML = withLoginLink
      ? `${escapeHtml(message)} <a href="/" class="own-recipe-status-link">Ga naar Kookkeuze om in te loggen</a>.`
      : escapeHtml(message);
  }

  // Lijstjes staan als vrije tekst in de database, één regel per item. Lege
  // regels en opsommingstekens die iemand zelf typte halen we eruit.
  function toLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean);
  }

  function renderMetaRow(recipe) {
    const items = [];
    if (recipe.servings) {
      items.push(['person.svg', `${recipe.servings} ${recipe.servings === 1 ? 'persoon' : 'personen'}`]);
    }
    if (recipe.prep_minutes) {
      items.push(['tijd.svg', `${recipe.prep_minutes} min`]);
    } else if (recipe.time_required) {
      items.push(['tijd.svg', recipe.time_required]);
    }
    if (recipe.calories != null) items.push(['kcal.svg', `${recipe.calories} kcal`]);
    if (!items.length) return '';

    return `<div class="own-recipe-meta">${items.map(([icon, label]) => `
      <span class="own-recipe-meta-item">
        <img src="/icons/${icon}" alt="" class="recipe-meta-icon" />
        ${escapeHtml(label)}
      </span>`).join('')}</div>`;
  }

  function renderTags(recipe) {
    const tags = [recipe.dish_type, recipe.meal_category, recipe.meal_type].filter(Boolean);
    if (!tags.length) return '';
    return `<div class="own-recipe-tags">${tags
      .map(tag => `<span class="own-recipe-tag">${escapeHtml(tag)}</span>`)
      .join('')}</div>`;
  }

  function renderRecipe(recipe) {
    const ingredients = toLines(recipe.ingredients);
    const steps = toLines(recipe.instructions);

    const ingredientsHtml = ingredients.length
      ? `<section class="own-recipe-section">
           <h2>Ingrediënten</h2>
           <ul class="own-recipe-ingredients">
             ${ingredients.map((item, index) => `
               <li>
                 <input type="checkbox" id="ingr-${index}" class="own-recipe-check" />
                 <label for="ingr-${index}">${escapeHtml(item)}</label>
               </li>`).join('')}
           </ul>
           <button type="button" id="copyIngredientsBtn" class="own-recipe-copy-btn">
             <i class="fas fa-clipboard" aria-hidden="true"></i> Kopieer boodschappenlijst
           </button>
         </section>`
      : '';

    const stepsHtml = steps.length
      ? `<section class="own-recipe-section">
           <h2>Bereiding</h2>
           <ol class="own-recipe-steps">
             ${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
           </ol>
         </section>`
      : '';

    const sourceHtml = recipe.source_note
      ? `<p class="own-recipe-source">Bron: ${escapeHtml(recipe.source_note)}</p>`
      : '';

    bodyEl.innerHTML = `
      <div class="own-recipe-head">
        <div class="own-recipe-photo-wrap">
          <div id="ownRecipePhoto" class="own-recipe-photo is-empty" aria-hidden="true"></div>
        </div>
        <div class="own-recipe-intro">
          <p class="own-recipe-kicker">Eigen recept</p>
          <h1>${escapeHtml(recipe.title || 'Recept')}</h1>
          ${renderMetaRow(recipe)}
          ${renderTags(recipe)}
          ${sourceHtml}
          <div class="own-recipe-actions">
            <a href="/" class="green-btn own-recipe-back-btn">Terug naar Kookkeuze</a>
            <button type="button" id="printRecipeBtn" class="own-recipe-secondary-btn">
              <i class="fas fa-print" aria-hidden="true"></i> Printen
            </button>
          </div>
        </div>
      </div>
      ${ingredientsHtml}
      ${stepsHtml}
    `;

    statusEl.hidden = true;
    bodyEl.hidden = false;
    document.title = `${recipe.title || 'Recept'} – Kookkeuze`;

    document.getElementById('printRecipeBtn')?.addEventListener('click', () => window.print());

    const copyBtn = document.getElementById('copyIngredientsBtn');
    copyBtn?.addEventListener('click', async () => {
      const text = `${recipe.title || 'Recept'}\n\n${ingredients.join('\n')}`;
      try {
        // navigator.share opent op mobiel het deelmenu (o.a. Notities);
        // op desktop valt hij terug op het klembord.
        if (navigator.share) {
          await navigator.share({ title: recipe.title || 'Recept', text });
        } else {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Gekopieerd!';
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="fas fa-clipboard" aria-hidden="true"></i> Kopieer boodschappenlijst';
          }, 2000);
        }
      } catch (_err) {
        /* gebruiker heeft geannuleerd, of het klembord is geblokkeerd */
      }
    });

    if (recipe.has_photo) loadPhoto(recipe.title);
  }

  // De foto zit achter dezelfde controle als het recept, dus een gewone
  // <img src> zonder token werkt niet. Daarom ophalen als blob.
  async function loadPhoto(title) {
    const holder = document.getElementById('ownRecipePhoto');
    if (!holder) return;
    try {
      const res = await fetch(`${API_BASE}/api/recipes/own/${recipeId}/photo`, { headers: authHeaders() });
      if (!res.ok) return;
      const blob = await res.blob();
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      img.alt = title || 'Receptfoto';
      img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
      holder.classList.remove('is-empty');
      holder.removeAttribute('aria-hidden');
      holder.innerHTML = '';
      holder.appendChild(img);
    } catch (_err) {
      /* zonder foto is de pagina nog steeds bruikbaar */
    }
  }

  async function load() {
    if (!recipeId) {
      showStatus('Dit recept bestaat niet.');
      return;
    }
    if (!getValidToken()) {
      showStatus('Log in om dit recept te bekijken.', true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/recipes/own/${recipeId}`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) return showStatus('Log in om dit recept te bekijken.', true);
      if (res.status === 403) return showStatus('Je hebt geen toegang tot dit recept.');
      if (res.status === 404) return showStatus('Dit recept bestaat niet (meer).');
      if (!res.ok) return showStatus(data.error || 'Het recept kon niet geladen worden.');

      renderRecipe(data);
    } catch (_err) {
      showStatus('Geen verbinding met de server. Probeer het later nog eens.');
    }
  }

  load();
})();
