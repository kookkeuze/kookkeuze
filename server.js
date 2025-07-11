// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const {
  getRecipes,
  getRandomRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Statische bestanden
app.use(express.static(path.join(__dirname)));

// 1. Haal (gefilterde) recepten op
app.get('/api/recipes', (req, res) => {
  const {
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    // calorieRange is enkelvoudig
    calorieRange
  } = req.query;

  getRecipes({
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    calorieRange
  }, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Er is iets misgegaan met het ophalen.' });
    }
    res.json(rows);
  });
});

// 2. Random recept
app.get('/api/recipes/random', (req, res) => {
  const {
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    calorieRange
  } = req.query;

  getRandomRecipe({
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    calorieRange
  }, (err, recipe) => {
    if (err) {
      console.error('Error bij random recept:', err);
      return res.status(500).json({ error: 'Er ging iets mis bij random ophalen.' });
    }
    if (!recipe) {
      return res.json({ message: 'Geen resultaten gevonden.' });
    }
    res.json(recipe);
  });
});

// 3. Nieuw recept
app.post('/api/recipes', (req, res) => {
  const {
    title,
    url,
    dish_type,
    meal_category,
    meal_type,
    time_required,
    calories
  } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: 'Titel en URL zijn verplicht.' });
  }

  addRecipe({
    title,
    url,
    dish_type,
    meal_category,
    meal_type,
    time_required,
    calories
  }, (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Er ging iets mis bij het opslaan van het recept.' });
    }
    res.json({ message: 'Recept toegevoegd!', id: result.id });
  });
});

// 4. Recept bijwerken
app.put('/api/recipes/:id', (req, res) => {
  const recipeId = req.params.id;
  const {
    title,
    url,
    dish_type,
    meal_type,
    time_required,
    meal_category,
    calories
  } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: 'Titel en URL zijn verplicht voor update.' });
  }

  updateRecipe(recipeId, {
    title,
    url,
    dish_type,
    meal_type,
    time_required,
    meal_category,
    calories
  }, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Er ging iets mis bij het bijwerken.' });
    }
    res.json({ message: 'Recept bijgewerkt!' });
  });
});

// 5. Recept verwijderen
app.delete('/api/recipes/:id', (req, res) => {
  const recipeId = req.params.id;

  deleteRecipe(recipeId, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Er ging iets mis bij het verwijderen.' });
    }
    res.json({ message: 'Recept verwijderd!' });
  });
});

app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
