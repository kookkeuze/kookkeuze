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
            <button type="button" id="editRecipeBtn" class="own-recipe-secondary-btn">
              <i class="fas fa-pen" aria-hidden="true"></i> Bewerken
            </button>
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
    document.getElementById('editRecipeBtn')?.addEventListener('click', () => renderEditForm(recipe));

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

  const KEUZE = 'maak een keuze';
  const SOORTEN = ['Kip', 'Rund', 'Varken', 'Brood', 'Hartig', 'Hartige taart', 'Ovenschotel', 'Pasta', 'Rijst', 'Soep', 'Taart & cake', 'Vegetarisch', 'Vis', 'Wraps', 'Zoet'];
  const MENUGANGEN = ['Bakken', 'Dessert', 'Dressings, sauzen & dips', 'Drinken', 'Hoofdgerecht', 'Lunch', 'Ontbijt', 'Salade', 'Snacks'];
  const DOELEN = ['Sporten', 'Normaal', 'Cheaten'];
  const TIJDEN = ['Onder de 30 minuten', '30 - 45 minuten', '45 minuten - 1 uur', '1 - 2 uur', 'langer dan 2 uur'];

  // De nieuwe foto als data-URL, of de vlag dat de bestaande weg moet.
  let bewerkFoto = null;
  let fotoVerwijderen = false;

  function selectHtml(id, label, options, current) {
    const chosen = String(current || '').trim();
    const items = [KEUZE, ...options]
      .map(opt => `<option${opt === chosen ? ' selected' : ''}>${escapeHtml(opt)}</option>`)
      .join('');
    return `
      <div class="add-recipe-field">
        <label for="${id}">${escapeHtml(label)}</label>
        <select id="${id}">${items}</select>
      </div>`;
  }

  function numberFieldHtml(id, label, value, extra = '') {
    return `
      <div class="add-recipe-field">
        <label for="${id}">${escapeHtml(label)}</label>
        <input id="${id}" type="number" ${extra} value="${value == null ? '' : escapeHtml(String(value))}" />
      </div>`;
  }

  function renderEditForm(recipe) {
    bewerkFoto = null;
    fotoVerwijderen = false;

    bodyEl.innerHTML = `
      <form id="ownRecipeEditForm" class="own-recipe-edit">
        <section class="add-recipe-section">
          <div class="add-recipe-section-head">
            <div class="add-recipe-section-title">
              <h3>Recept bewerken</h3>
              <p>Je wijzigingen gelden meteen voor iedereen die deze database gebruikt.</p>
            </div>
          </div>

          <div class="add-recipe-field">
            <label for="editTitle">Titel</label>
            <input id="editTitle" type="text" maxlength="255" value="${escapeHtml(recipe.title || '')}" required />
          </div>

          <div class="add-recipe-field">
            <label for="editPhotoInput">Foto</label>
            <div class="own-photo-picker">
              <div id="editPhotoPreview" class="own-photo-preview${recipe.has_photo ? '' : ' is-empty'}">
                ${recipe.has_photo ? '' : '<span class="own-photo-placeholder">Nog geen foto</span>'}
              </div>
              <div class="own-photo-controls">
                <input id="editPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" class="own-photo-input" />
                <button type="button" id="editPhotoChooseBtn" class="own-photo-btn">${recipe.has_photo ? 'Andere foto kiezen' : 'Foto kiezen'}</button>
                <button type="button" id="editPhotoRemoveBtn" class="own-photo-remove"${recipe.has_photo ? '' : ' hidden'}>Verwijder foto</button>
                <p class="own-photo-hint">JPG, PNG of WebP. We verkleinen de foto automatisch.</p>
              </div>
            </div>
          </div>
        </section>

        <section class="add-recipe-section">
          <div class="add-recipe-section-head">
            <div class="add-recipe-section-title">
              <h3>Ingrediënten en bereiding</h3>
              <p>Eén per regel.</p>
            </div>
          </div>
          <div class="add-recipe-field">
            <label for="editIngredients">Ingrediënten</label>
            <textarea id="editIngredients" rows="8" maxlength="10000">${escapeHtml(recipe.ingredients || '')}</textarea>
          </div>
          <div class="add-recipe-field">
            <label for="editInstructions">Bereiding</label>
            <textarea id="editInstructions" rows="8" maxlength="20000">${escapeHtml(recipe.instructions || '')}</textarea>
          </div>
        </section>

        <section class="add-recipe-section">
          <div class="add-recipe-section-head">
            <div class="add-recipe-section-title">
              <h3>Gegevens</h3>
            </div>
          </div>
          <div class="add-recipe-grid">
            ${selectHtml('editDishType', 'Soort gerecht', SOORTEN, recipe.dish_type)}
            ${selectHtml('editMealCategory', 'Menugang', MENUGANGEN, recipe.meal_category)}
            ${selectHtml('editMealType', 'Doel gerecht', DOELEN, recipe.meal_type)}
            ${selectHtml('editTimeRequired', 'Tijd', TIJDEN, recipe.time_required)}
            ${numberFieldHtml('editPrepMinutes', 'Bereidingstijd in minuten', recipe.prep_minutes, 'min="0" max="6000"')}
            ${numberFieldHtml('editServings', 'Aantal personen', recipe.servings, 'min="1" max="100"')}
            ${numberFieldHtml('editCalories', 'Calorieën', recipe.calories, 'min="0"')}
            <div class="add-recipe-field">
              <label for="editSourceNote">Waar komt het vandaan</label>
              <input id="editSourceNote" type="text" maxlength="255" value="${escapeHtml(recipe.source_note || '')}" />
            </div>
          </div>
        </section>

        <p id="editRecipeMessage" class="own-recipe-edit-message" hidden></p>

        <div class="own-recipe-actions">
          <button type="submit" class="green-btn">Wijzigingen opslaan</button>
          <button type="button" id="cancelEditBtn" class="own-recipe-secondary-btn">Annuleren</button>
        </div>
      </form>`;

    statusEl.hidden = true;
    bodyEl.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (recipe.has_photo) loadPhoto(recipe.title, 'editPhotoPreview');

    const photoInput = document.getElementById('editPhotoInput');
    const preview = document.getElementById('editPhotoPreview');
    const removeBtn = document.getElementById('editPhotoRemoveBtn');

    function toonVoorbeeld(dataUrl) {
      preview.innerHTML = '';
      if (dataUrl) {
        preview.classList.remove('is-empty');
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'Voorbeeld van de gekozen foto';
        preview.appendChild(img);
        removeBtn.hidden = false;
        return;
      }
      preview.classList.add('is-empty');
      preview.innerHTML = '<span class="own-photo-placeholder">Nog geen foto</span>';
      removeBtn.hidden = true;
    }

    document.getElementById('editPhotoChooseBtn')?.addEventListener('click', () => photoInput?.click());

    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      try {
        bewerkFoto = await resizeImageToDataUrl(file);
        fotoVerwijderen = false;
        toonVoorbeeld(bewerkFoto);
      } catch (_err) {
        toonBericht('Die foto konden we niet verwerken. Probeer een JPG, PNG of WebP.', true);
      }
    });

    removeBtn?.addEventListener('click', () => {
      bewerkFoto = null;
      fotoVerwijderen = true;
      photoInput.value = '';
      toonVoorbeeld(null);
    });

    document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
      renderRecipe(recipe);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.getElementById('ownRecipeEditForm')?.addEventListener('submit', e => {
      e.preventDefault();
      opslaan(recipe);
    });
  }

  function toonBericht(tekst, isFout) {
    const el = document.getElementById('editRecipeMessage');
    if (!el) return;
    el.textContent = tekst;
    el.hidden = false;
    el.classList.toggle('is-error', !!isFout);
  }

  // Dezelfde verkleining als in het toevoegformulier: telefoonfoto's zijn zo
  // een paar megabyte, en dat hoeft niet naar de database.
  const FOTO_MAX_ZIJDE = 1400;
  const FOTO_KWALITEIT = 0.82;

  function resizeImageToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, FOTO_MAX_ZIJDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Kon de foto niet verwerken.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL('image/jpeg', FOTO_KWALITEIT));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Kon de foto niet lezen.'));
      };
      img.src = objectUrl;
    });
  }

  function leesGetal(id) {
    const raw = document.getElementById(id)?.value.trim() || '';
    return raw ? parseInt(raw, 10) : null;
  }

  function leesKeuze(id) {
    const value = document.getElementById(id)?.value || '';
    return value === KEUZE ? '' : value;
  }

  async function opslaan(vorigRecept) {
    const titel = document.getElementById('editTitle')?.value.trim() || '';
    if (!titel) return toonBericht('Geef je recept een titel.', true);

    const knop = document.querySelector('#ownRecipeEditForm button[type="submit"]');
    if (knop) knop.disabled = true;

    const body = {
      title: titel,
      dish_type: leesKeuze('editDishType'),
      meal_category: leesKeuze('editMealCategory'),
      meal_type: leesKeuze('editMealType'),
      time_required: leesKeuze('editTimeRequired'),
      calories: leesGetal('editCalories'),
      servings: leesGetal('editServings'),
      prep_minutes: leesGetal('editPrepMinutes'),
      source_note: document.getElementById('editSourceNote')?.value.trim() || '',
      ingredients: document.getElementById('editIngredients')?.value.trim() || '',
      instructions: document.getElementById('editInstructions')?.value.trim() || ''
    };
    if (bewerkFoto) body.photo = bewerkFoto;
    else if (fotoVerwijderen) body.removePhoto = true;

    try {
      const res = await fetch(`${API_BASE}/api/recipes/own/${recipeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toonBericht(data.error || 'Opslaan lukte niet.', true);

      await load();
    } catch (_err) {
      toonBericht('Geen verbinding met de server. Probeer het later nog eens.', true);
    } finally {
      if (knop) knop.disabled = false;
    }
  }

  // De foto zit achter dezelfde controle als het recept, dus een gewone
  // <img src> zonder token werkt niet. Daarom ophalen als blob.
  async function loadPhoto(title, holderId = 'ownRecipePhoto') {
    const holder = document.getElementById(holderId);
    if (!holder) return;
    try {
      // cache-buster, anders toont de browser na het opslaan de oude foto.
      const res = await fetch(`${API_BASE}/api/recipes/own/${recipeId}/photo?v=${Date.now()}`, { headers: authHeaders() });
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
