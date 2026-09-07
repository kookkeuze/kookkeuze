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

  // De boodschappenlijst hangt aan de actieve database, precies zoals op de
  // hoofdpagina. Die keuze staat in localStorage, dus we sturen hem mee.
  function activeDatabaseQuery() {
    const ownerId = Number(localStorage.getItem('activeDatabaseOwnerId') || 0);
    return ownerId > 0 ? `?dbOwnerId=${ownerId}` : '';
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
    if (recipe.time_required) items.push(['tijd.svg', recipe.time_required]);
    if (recipe.calories != null) items.push(['kcal.svg', `${recipe.calories} kcal`]);
    if (!items.length) return '';

    return `<div class="own-recipe-meta">${items.map(([icon, label]) => `
      <span class="own-recipe-meta-item">
        <img src="/icons/${icon}" alt="" class="recipe-meta-icon" />
        ${escapeHtml(label)}
      </span>`).join('')}</div>`;
  }

  // Meerdere keuzes komen als "Kip, Vis" terug; elk stuk krijgt zijn eigen label.
  function splitField(value) {
    return String(value || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }

  function renderTags(recipe) {
    const tags = [
      ...splitField(recipe.dish_type),
      ...splitField(recipe.meal_category),
      ...splitField(recipe.meal_type)
    ];
    if (!tags.length) return '';
    return `<div class="own-recipe-tags">${tags
      .map(tag => `<span class="own-recipe-tag">${escapeHtml(tag)}</span>`)
      .join('')}</div>`;
  }

  function renderRecipe(recipe) {
    const ingredients = toLines(recipe.ingredients);
    const steps = toLines(recipe.instructions);

    const ingredientsHtml = ingredients.length
      ? `<div class="own-recipe-block">
           <h2>Ingrediënten</h2>
           <ul class="own-recipe-ingredients">
             ${ingredients.map((item, index) => `
               <li>
                 <input type="checkbox" id="ingr-${index}" class="own-recipe-check" data-ingredient="${escapeHtml(item)}" />
                 <label for="ingr-${index}">${escapeHtml(item)}</label>
               </li>`).join('')}
           </ul>
           <button type="button" id="toShoppingListBtn" class="own-recipe-list-btn">
             <img src="/icons/boodschappenlijst-tegel.svg" alt="" class="own-recipe-list-icon" />
             <span id="toShoppingListLabel">Alles op de boodschappenlijst</span>
           </button>
           <p id="shoppingListFeedback" class="own-recipe-list-feedback" hidden></p>
         </div>`
      : '';

    const stepsHtml = steps.length
      ? `<div class="own-recipe-block">
           <h2>Bereiding</h2>
           <ol class="own-recipe-steps">
             ${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
           </ol>
         </div>`
      : '';

    // Ingrediënten en bereiding horen bij elkaar en staan daarom in één kaart,
    // met een haarlijn ertussen in plaats van een tweede blok.
    const contentHtml = (ingredientsHtml || stepsHtml)
      ? `<section class="own-recipe-section">${ingredientsHtml}${stepsHtml}</section>`
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
          <div class="own-recipe-actions">
            <button type="button" id="editRecipeBtn" class="own-recipe-secondary-btn">
              <i class="fas fa-pen" aria-hidden="true"></i> Bewerken
            </button>
          </div>
        </div>
      </div>
      ${contentHtml}
    `;

    statusEl.hidden = true;
    bodyEl.hidden = false;
    document.title = `${recipe.title || 'Recept'} – Kookkeuze`;

    document.getElementById('editRecipeBtn')?.addEventListener('click', () => renderEditForm(recipe));
    initShoppingListButton(recipe, ingredients);

    if (recipe.has_photo) loadPhoto(recipe.title);
  }

  /* ---------- Ingrediënten naar de boodschappenlijst ---------- */
  // De vinkjes zijn tegelijk de selectie: vink je niets aan, dan gaat de hele
  // lijst mee. De knoptekst zegt precies wat er gebeurt, zodat je niet hoeft te
  // raden wat 'toevoegen' deze keer betekent.
  function initShoppingListButton(recipe, ingredients) {
    const button = document.getElementById('toShoppingListBtn');
    const label = document.getElementById('toShoppingListLabel');
    const feedback = document.getElementById('shoppingListFeedback');
    if (!button || !label) return;

    const checks = Array.from(document.querySelectorAll('.own-recipe-check'));

    function selection() {
      const checked = checks.filter(check => check.checked).map(check => check.dataset.ingredient || '');
      return checked.length ? checked : ingredients;
    }

    function updateLabel() {
      const count = checks.filter(check => check.checked).length;
      label.textContent = count
        ? `${count} product${count === 1 ? '' : 'en'} op de boodschappenlijst`
        : 'Alles op de boodschappenlijst';
    }

    function showFeedback(text, isError) {
      if (!feedback) return;
      feedback.textContent = text;
      feedback.hidden = false;
      feedback.classList.toggle('is-error', !!isError);
    }

    checks.forEach(check => check.addEventListener('change', updateLabel));
    updateLabel();

    button.addEventListener('click', async () => {
      if (!getValidToken()) {
        showFeedback('Log in om je boodschappenlijst te gebruiken.', true);
        return;
      }

      const items = selection().filter(Boolean);
      if (!items.length) return;

      button.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/api/shopping-list${activeDatabaseQuery()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            items: items.map(name => ({ name, source_title: recipe.title || 'Recept' }))
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showFeedback(data.error || 'Toevoegen aan de boodschappenlijst mislukte.', true);
          return;
        }

        const added = Number(data.added || items.length);
        showFeedback(`${added} product${added === 1 ? '' : 'en'} op je boodschappenlijst gezet.`, false);
        button.classList.add('is-done');
        setTimeout(() => button.classList.remove('is-done'), 1200);
      } catch (_err) {
        showFeedback('Geen verbinding met de server. Probeer het later nog eens.', true);
      } finally {
        button.disabled = false;
      }
    });
  }

  const KEUZE = 'maak een keuze';
  const SOORTEN = ['Kip', 'Rund', 'Varken', 'Brood', 'Hartig', 'Hartige taart', 'Ovenschotel', 'Pasta', 'Rijst', 'Soep', 'Taart & cake', 'Vegetarisch', 'Vis', 'Wraps', 'Zoet'];
  const MENUGANGEN = ['Bakken', 'Dessert', 'Dressings, sauzen & dips', 'Drinken', 'Hoofdgerecht', 'Lunch', 'Ontbijt', 'Salade', 'Snacks'];
  const DOELEN = ['Sporten', 'Normaal', 'Cheaten'];
  const TIJDEN = ['Onder de 30 minuten', '30 - 45 minuten', '45 minuten - 1 uur', '1 - 2 uur', 'langer dan 2 uur'];

  // De nieuwe foto als data-URL, of de vlag dat de bestaande weg moet.
  let bewerkFoto = null;
  let fotoVerwijderen = false;
  let stappen = null;

  /* ---------- Meerkeuzevelden ----------
     Zelfde vorm als op de hoofdpagina: een knop met de gekozen labels en een
     uitklaplijstje met vinkjes, zodat één recept ook 'Kip' én 'Pasta' kan zijn. */
  function multiSelectHtml(id, label, options, current) {
    // "Kip, Pasta" komt terug uit de database; alleen namen die ook echt in de
    // lijst staan tellen mee, anders wordt "Dressings, sauzen & dips" gesplitst.
    const text = String(current || '').trim();
    const chosen = options.filter(opt =>
      text === opt ||
      text.startsWith(`${opt}, `) ||
      text.endsWith(`, ${opt}`) ||
      text.includes(`, ${opt}, `)
    );

    const items = options.map(opt => `
      <label class="multi-select-option">
        <input type="checkbox" value="${escapeHtml(opt)}"${chosen.includes(opt) ? ' checked' : ''} />
        <span>${escapeHtml(opt)}</span>
      </label>`).join('');

    return `
      <div class="add-recipe-field">
        <span class="add-recipe-field-label" id="${id}Label">${escapeHtml(label)}</span>
        <div class="multi-select" id="${id}" data-placeholder="${escapeHtml(label)}">
          <button type="button" class="multi-select-trigger" aria-expanded="false" aria-labelledby="${id}Label">
            <span class="multi-select-text">${escapeHtml(chosen.length ? chosen.join(', ') : label)}</span>
            <i class="fas fa-chevron-down multi-select-chevron" aria-hidden="true"></i>
          </button>
          <div class="multi-select-menu">${items}</div>
        </div>
      </div>`;
  }

  function initMultiSelects(root) {
    root.querySelectorAll('.multi-select').forEach(wrapper => {
      const trigger = wrapper.querySelector('.multi-select-trigger');
      const text = wrapper.querySelector('.multi-select-text');
      const placeholder = wrapper.dataset.placeholder || 'Maak een keuze';

      function updateLabel() {
        const chosen = readMultiSelect(wrapper.id);
        text.textContent = chosen.length ? chosen.join(', ') : placeholder;
      }

      trigger?.addEventListener('click', e => {
        e.stopPropagation();
        root.querySelectorAll('.multi-select.open').forEach(node => {
          if (node !== wrapper) node.classList.remove('open');
        });
        wrapper.classList.toggle('open');
        trigger.setAttribute('aria-expanded', wrapper.classList.contains('open') ? 'true' : 'false');
      });

      wrapper.querySelectorAll('input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', updateLabel);
      });
    });
  }

  function readMultiSelect(id) {
    const wrapper = document.getElementById(id);
    if (!wrapper) return [];
    return Array.from(wrapper.querySelectorAll('input[type="checkbox"]:checked')).map(box => box.value);
  }

  document.addEventListener('click', e => {
    document.querySelectorAll('.multi-select.open').forEach(node => {
      if (!node.contains(e.target)) node.classList.remove('open');
    });
  });

  function numberFieldHtml(id, label, value, extra = '') {
    return `
      <div class="add-recipe-field">
        <label for="${id}">${escapeHtml(label)}</label>
        <input id="${id}" type="number" ${extra} value="${value == null ? '' : escapeHtml(String(value))}" />
      </div>`;
  }

  /* ---------- Stappen-bouwer ----------
     Dezelfde lijst als in het toevoegformulier: per stap een regel, met een
     plusje eronder en een kruisje per regel. */
  const STEP_MIN_ROWS = 3;

  function createStepBuilder(listEl, addBtn) {
    if (!listEl) return null;

    function autoGrow(textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function rows() {
      return Array.from(listEl.querySelectorAll('.step-row'));
    }

    function refresh() {
      const all = rows();
      all.forEach((row, index) => {
        const num = row.querySelector('.step-row-num');
        if (num) num.textContent = String(index + 1);
        const remove = row.querySelector('.step-remove-btn');
        if (remove) remove.hidden = all.length <= 1;
      });
    }

    function removeRow(row) {
      if (rows().length <= 1) return;
      const next = row.nextElementSibling || row.previousElementSibling;

      row.style.height = `${row.offsetHeight}px`;
      row.classList.add('is-leaving');
      // Reflow afdwingen, anders ziet de browser alleen de eindhoogte en slaat hij
      // de overgang over. Werkt ook in een tabblad op de achtergrond, waar
      // requestAnimationFrame stilstaat.
      void row.offsetWidth;
      row.style.height = '0px';
      row.style.opacity = '0';

      const done = () => {
        if (!row.isConnected) return;
        row.remove();
        refresh();
      };
      row.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 400);

      next?.querySelector('.step-row-input')?.focus();
    }

    function addRow(value = '', { focus = false, after = null, animate = false } = {}) {
      const row = document.createElement('li');
      row.className = 'step-row';
      if (animate) row.classList.add('is-entering');

      const num = document.createElement('span');
      num.className = 'step-row-num';
      num.setAttribute('aria-hidden', 'true');

      const input = document.createElement('textarea');
      input.className = 'step-row-input';
      input.rows = 1;
      input.maxLength = 2000;
      input.placeholder = 'Beschrijf deze stap';
      input.value = value;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'step-remove-btn';
      remove.setAttribute('aria-label', 'Deze stap verwijderen');
      remove.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';

      row.append(num, input, remove);
      if (after && after.parentElement === listEl) after.after(row);
      else listEl.appendChild(row);

      input.addEventListener('input', () => autoGrow(input));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          addRow('', { focus: true, after: row, animate: true });
          return;
        }
        if (e.key === 'Backspace' && input.value === '' && rows().length > 1) {
          e.preventDefault();
          removeRow(row);
        }
      });
      remove.addEventListener('click', () => removeRow(row));

      refresh();
      autoGrow(input);

      if (animate) {
        void row.offsetWidth;
        row.classList.remove('is-entering');
      }
      if (focus) input.focus();
      return row;
    }

    function setValues(values) {
      listEl.innerHTML = '';
      (Array.isArray(values) ? values : []).filter(v => String(v).trim()).forEach(step => addRow(step));
      while (rows().length < STEP_MIN_ROWS) addRow('');
      refresh();
    }

    function getValues() {
      return rows()
        .map(row => row.querySelector('.step-row-input')?.value.trim() || '')
        .filter(Boolean);
    }

    addBtn?.addEventListener('click', () => addRow('', { focus: true, animate: true }));

    return { getValues, setValues };
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
              <p>Ingrediënten één per regel; de bereiding vul je per stap in.</p>
            </div>
          </div>
          <div class="add-recipe-field">
            <label for="editIngredients">Ingrediënten</label>
            <textarea id="editIngredients" rows="8" maxlength="10000">${escapeHtml(recipe.ingredients || '')}</textarea>
          </div>
          <div class="add-recipe-field">
            <span class="add-recipe-field-label" id="editStepsLabel">Bereiding</span>
            <ol class="step-builder" id="editStepsList" aria-labelledby="editStepsLabel"></ol>
            <button type="button" class="step-add-btn" id="editStepAddBtn">
              <i class="fas fa-plus step-add-plus" aria-hidden="true"></i> Stap toevoegen
            </button>
          </div>
        </section>

        <section class="add-recipe-section">
          <div class="add-recipe-section-head">
            <div class="add-recipe-section-title">
              <h3>Gegevens</h3>
            </div>
          </div>
          <div class="add-recipe-grid">
            ${multiSelectHtml('editDishType', 'Soort gerecht', SOORTEN, recipe.dish_type)}
            ${multiSelectHtml('editMealCategory', 'Menugang', MENUGANGEN, recipe.meal_category)}
            ${multiSelectHtml('editMealType', 'Doel gerecht', DOELEN, recipe.meal_type)}
            ${multiSelectHtml('editTimeRequired', 'Tijd', TIJDEN, recipe.time_required)}
            ${numberFieldHtml('editCalories', 'Calorieën', recipe.calories, 'min="0"')}
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

    initMultiSelects(bodyEl);
    stappen = createStepBuilder(
      document.getElementById('editStepsList'),
      document.getElementById('editStepAddBtn')
    );
    stappen?.setValues(toLines(recipe.instructions));

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

  async function opslaan(vorigRecept) {
    const titel = document.getElementById('editTitle')?.value.trim() || '';
    if (!titel) return toonBericht('Geef je recept een titel.', true);

    const knop = document.querySelector('#ownRecipeEditForm button[type="submit"]');
    if (knop) knop.disabled = true;

    const body = {
      title: titel,
      dish_type: readMultiSelect('editDishType'),
      meal_category: readMultiSelect('editMealCategory'),
      meal_type: readMultiSelect('editMealType'),
      time_required: readMultiSelect('editTimeRequired'),
      calories: leesGetal('editCalories'),
      ingredients: document.getElementById('editIngredients')?.value.trim() || '',
      instructions: (stappen?.getValues() || []).join('\n')
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
