// index.js

// ---- TABS ----
const tabLinks = document.querySelectorAll('.tab-link');
const tabContents = document.querySelectorAll('.tab-content');

tabLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();

    tabLinks.forEach(l => l.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));

    link.classList.add('active');
    const targetId = link.getAttribute('href');
    const targetContent = document.querySelector(targetId);
    if (targetContent) {
      targetContent.classList.add('active');
    }

    if (targetId === '#overzichtRecepten') {
      fetchAllRecipes();
    }
  });
});

// ---- FILTERS & ZOEKEN (TAB 1) ----
const dishTypeSelect = document.getElementById('dishType');
const mealCategorySelect = document.getElementById('mealCategory');
const mealTypeSelect = document.getElementById('mealType');
const timeRequiredSelect = document.getElementById('timeRequired');

// Nieuw: EENVOUDIG calorieRange, single select
const calorieRangeSelect = document.getElementById('calorieRange');

const resultDiv = document.getElementById('result');

// Knoppen
document.getElementById('searchBtn').addEventListener('click', () => {
  const params = {};

  if (dishTypeSelect.value !== 'Soort gerecht') {
    params.dish_type = dishTypeSelect.value;
  }
  if (mealCategorySelect.value !== 'Menugang') {
    params.meal_category = mealCategorySelect.value;
  }
  if (mealTypeSelect.value !== 'Doel gerecht') {
    params.meal_type = mealTypeSelect.value;
  }
  if (timeRequiredSelect.value !== 'Tijd') {
    params.time_required = timeRequiredSelect.value;
  }

  // calorieRange => enkel select
  if (calorieRangeSelect.value !== 'Calorieën') {
    params.calorieRange = calorieRangeSelect.value;
  }

  const searchTerm = document.getElementById('searchTerm').value.trim();
  if (searchTerm) {
    params.search = searchTerm;
  }

  const queryString = new URLSearchParams(params).toString();
  fetch('/api/recipes?' + queryString)
    .then(res => res.json())
    .then(data => showRecipes(data))
    .catch(err => console.error(err));
});

document.getElementById('randomBtn').addEventListener('click', () => {
  const params = {};

  if (dishTypeSelect.value !== 'Soort gerecht') {
    params.dish_type = dishTypeSelect.value;
  }
  if (mealCategorySelect.value !== 'Menugang') {
    params.meal_category = mealCategorySelect.value;
  }
  if (mealTypeSelect.value !== 'Doel gerecht') {
    params.meal_type = mealTypeSelect.value;
  }
  if (timeRequiredSelect.value !== 'Tijd') {
    params.time_required = timeRequiredSelect.value;
  }

  // Single calorieRange
  if (calorieRangeSelect.value !== 'Calorieën') {
    params.calorieRange = calorieRangeSelect.value;
  }

  const queryString = new URLSearchParams(params).toString();
  fetch('/api/recipes/random?' + queryString)
    .then(res => res.json())
    .then(data => {
      if (!data || data.message === 'Geen resultaten gevonden.') {
        resultDiv.innerHTML = '<p>Geen resultaten gevonden.</p>';
      } else {
        showRecipes([data]);
      }
    })
    .catch(err => {
      console.error(err);
      resultDiv.innerHTML = '<p>Er is een fout opgetreden bij het ophalen van een random recept.</p>';
    });
});

// Toon zoekresultaten/random
function showRecipes(recipeArray) {
  const resultDiv = document.getElementById('result');
  if (!recipeArray || recipeArray.length === 0) {
    resultDiv.innerHTML = '<p>Geen resultaten gevonden.</p>';
    return;
  }

  let html = '<div class="recipe-cards-container">';
  recipeArray.forEach(r => {
    html += `
      <div class="recipe-card">
        <h3>${r.title}</h3>
<p>
  <a href="${r.url}" target="_blank" class="ext-link">
    Bekijk&nbsp;recept&nbsp;<i class="fas fa-external-link-alt"></i>
  </a>
</p>


        <ul>
          <li><i class="fa fa-thermometer-half"></i> <strong>Soort:</strong> ${r.dish_type || '-'}</li>
          <li><i class="fas fa-utensils"></i> <strong>Menugang:</strong> ${r.meal_category || '-'}</li>
          <li><i class="fas fa-globe"></i> <strong>Doel gerecht:</strong> ${r.meal_type || '-'}</li>
          <li><i class="fas fa-clock"></i> <strong>Tijd:</strong> ${r.time_required || '-'}</li>
          <li><i class="fas fa-fire"></i> <strong>Calorieën:</strong> ${r.calories != null ? r.calories : '-'}</li>
        </ul>
      </div>
    `;
  });
  html += '</div>';
  resultDiv.innerHTML = html;
}

// ---- FORMULIER: NIEUW RECEPT TOEVOEGEN (TAB 2) ----
const addRecipeForm = document.getElementById('addRecipeForm');
const addMessageDiv = document.getElementById('addMessage');

addRecipeForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const caloriesValue = document.getElementById('caloriesNew').value.trim();
  const caloriesParsed = caloriesValue ? parseInt(caloriesValue, 10) : null;

  const bodyData = {
    title: document.getElementById('title').value,
    url: document.getElementById('url').value,
    dish_type: document.getElementById('dishTypeNew').value,
    meal_category: document.getElementById('mealCategoryNew').value,
    meal_type: document.getElementById('mealTypeNew').value,
    time_required: document.getElementById('timeRequiredNew').value,
    calories: caloriesParsed
  };

  fetch('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData)
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        addMessageDiv.innerHTML = `<p style="color:red;">${data.error}</p>`;
      } else {
        addMessageDiv.innerHTML = `<p style="color:green;">${data.message} (ID: ${data.id})</p>`;
        addRecipeForm.reset();
      }
    })
    .catch(err => console.error(err));
});

// ---- OVERZICHT RECEPTEN (TAB 3) ----
const allRecipesDiv = document.getElementById('allRecipes');
document.getElementById('refreshOverview').addEventListener('click', fetchAllRecipes);

function fetchAllRecipes() {
  fetch('/api/recipes')
    .then(res => res.json())
    .then(data => showAllRecipes(data))
    .catch(err => console.error(err));
}

function showAllRecipes(recipes) {
  allRecipesDiv.innerHTML = '';

  if (!recipes || recipes.length === 0) {
    allRecipesDiv.innerHTML = `<tr><td colspan="9">Er zijn nog geen recepten toegevoegd.</td></tr>`;
    return;
  }

  const dishTypeOptions = [
    "Kip", "Rund", "Varken", "Brood", "Hartig", "Hartige taart",
    "Ovenschotel", "Pasta", "Rijst", "Soep", "Taart & cake",
    "Vegetarisch", "Vis", "Wraps", "Zoet"
  ];
  const mealCategoryOptions = [
    "Bakken", "Dessert", "Dressings, sauzen & dips",
    "Drinken", "Hoofdgerecht", "Lunch",
    "Ontbijt", "Salade", "Snacks"
  ];
  const mealTypeOptions = ["Sporten", "Normaal", "Cheaten"];
  const timeRequiredOptions = [
    "Onder de 30 minuten", "30 - 45 minuten",
    "45 minuten - 1 uur", "1 - 2 uur", "langer dan 2 uur"
  ];

  let html = '';
  recipes.forEach(r => {
    const cals = r.calories != null ? r.calories : '';

    html += `
      <tr data-id="${r.id}">
        <td contenteditable="true">${r.title}</td>
        <td contenteditable="true">${r.url}</td>
        <td>${createDropdown(dishTypeOptions, r.dish_type)}</td>
        <td>${createDropdown(mealCategoryOptions, r.meal_category)}</td>
        <td>${createDropdown(mealTypeOptions, r.meal_type)}</td>
        <td>${createDropdown(timeRequiredOptions, r.time_required)}</td>
        <td><input class="calories-field" type="number" value="${cals}" /></td>
        <td><button class="green-btn edit-btn">Opslaan</button></td>
        <td><button class="pink-btn delete-btn">Verwijder</button></td>
      </tr>
    `;
  });

  allRecipesDiv.innerHTML = html;

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', onUpdateRecipe));
  document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', onDeleteRecipe));
}

function createDropdown(options, selectedValue) {
  let dropdown = `<select>`;
  options.forEach(option => {
    const selected = (option === selectedValue) ? 'selected' : '';
    dropdown += `<option value="${option}" ${selected}>${option}</option>`;
  });
  dropdown += `</select>`;
  return dropdown;
}

function onUpdateRecipe(e) {
  const row = e.target.closest('tr');
  const id = row.getAttribute('data-id');

  const title = row.cells[0].innerText.trim();
  const url = row.cells[1].innerText.trim();
  const dish_type = row.cells[2].querySelector('select').value;
  const meal_category = row.cells[3].querySelector('select').value;
  const meal_type = row.cells[4].querySelector('select').value;
  const time_required = row.cells[5].querySelector('select').value;

  const caloriesInput = row.cells[6].querySelector('.calories-field');
  const caloriesValue = caloriesInput.value.trim();
  const caloriesParsed = caloriesValue ? parseInt(caloriesValue, 10) : null;

  const bodyData = {
    title,
    url,
    dish_type,
    meal_category,
    meal_type,
    time_required,
    calories: caloriesParsed
  };

  fetch('/api/recipes/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData)
  })
    .then(() => alert('Recept bijgewerkt!'))
    .catch(err => console.error(err));
}

function onDeleteRecipe(e) {
  if (confirm('Weet je zeker dat je dit recept wilt verwijderen?')) {
    const row = e.target.closest('tr');
    const id = row.getAttribute('data-id');

    fetch('/api/recipes/' + id, { method: 'DELETE' })
      .then(() => fetchAllRecipes())
      .catch(err => console.error(err));
  }
}
