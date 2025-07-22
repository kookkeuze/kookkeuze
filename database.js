// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'recipes.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fout bij openen database:', err);
  } else {
    console.log('Verbonden met SQLite-database.');
  }
});

// Tabel aanmaken
db.run(`
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    dish_type TEXT,
    meal_type TEXT,
    time_required TEXT,
    meal_category TEXT,
    calories INTEGER
  )
`);

/**
 * Interpreteer één calorieRange-waarde.
 * bijv. "Onder 300" => AND calories < 300
 * "Boven 1000" => AND calories > 1000
 */
function buildSingleCalorieCondition(range) {
  switch (range) {
    case 'Onder 100':
      return ' AND calories < 100';
    case 'Onder 200':
      return ' AND calories < 200';
    case 'Onder 300':
      return ' AND calories < 300';
    case 'Onder 400':
      return ' AND calories < 400';
    case 'Onder 500':
      return ' AND calories < 500';
    case 'Onder 600':
      return ' AND calories < 600';
    case 'Onder 700':
      return ' AND calories < 700';
    case 'Onder 800':
      return ' AND calories < 800';
    case 'Onder 900':
      return ' AND calories < 900';
    case 'Onder 1000':
      return ' AND calories < 1000';
    case 'Boven 1000':
      return ' AND calories > 1000';
    default:
      return '';
  }
}

function getRecipes(filters, callback) {
  let query = 'SELECT * FROM recipes WHERE 1=1';
  const params = [];

  // Alleen recepten van de ingelogde gebruiker
  if (filters.user_id) {
    query += ' AND user_id = ?';
    params.push(filters.user_id);
  }

  // dish_type
  if (filters.dish_type && filters.dish_type !== 'maak een keuze') {
    query += ' AND dish_type = ?';
    params.push(filters.dish_type);
  }
  // meal_category
  if (filters.meal_category && filters.meal_category !== 'maak een keuze') {
    query += ' AND meal_category = ?';
    params.push(filters.meal_category);
  }
  // meal_type
  if (filters.meal_type && filters.meal_type !== 'maak een keuze') {
    query += ' AND meal_type = ?';
    params.push(filters.meal_type);
  }
  // time_required
  if (filters.time_required && filters.time_required !== 'maak een keuze') {
    query += ' AND time_required = ?';
    params.push(filters.time_required);
  }
  // Zoeken in titel
  if (filters.search) {
    query += ' AND title LIKE ?';
    params.push(`%${filters.search}%`);
  }

  // Eén calorieRange => buildSingleCalorieCondition
  if (filters.calorieRange && filters.calorieRange !== 'Calorieën') {
    query += buildSingleCalorieCondition(filters.calorieRange);
  }

  console.log('Query:', query);
  console.log('Params:', params);
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Fout in getRecipes:', err);
      return callback(err);
    }
    console.log('Found rows:', rows.length);
    callback(null, rows);
  });
}

function getRandomRecipe(filters, callback) {
  getRecipes(filters, (err, rows) => {
    if (err) return callback(err);
    if (!rows || rows.length === 0) return callback(null, null);

    const randomIndex = Math.floor(Math.random() * rows.length);
    callback(null, rows[randomIndex]);
  });
}

function addRecipe(recipe, callback) {
  const {
    title,
    url,
    dish_type,
    meal_type,
    time_required,
    meal_category,
    calories,
    user_id
  } = recipe;

  const query = `
    INSERT INTO recipes (title, url, dish_type, meal_type, time_required, meal_category, calories, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.run(query, [title, url, dish_type, meal_type, time_required, meal_category, calories, user_id],
    function (err) {
      if (err) {
        console.error('Fout bij invoegen recept:', err);
        return callback(err);
      }
      callback(null, { id: this.lastID });
    }
  );
}

function updateRecipe(id, updatedData, callback) {
  const {
    title,
    url,
    dish_type,
    meal_type,
    time_required,
    meal_category,
    calories
  } = updatedData;

  const query = `
    UPDATE recipes
    SET title = ?, url = ?, dish_type = ?, meal_type = ?, time_required = ?, meal_category = ?, calories = ?
    WHERE id = ?
  `;
  db.run(query, [
    title,
    url,
    dish_type,
    meal_type,
    time_required,
    meal_category,
    calories,
    id
  ], function (err) {
    if (err) {
      console.error('Fout bij updaten recept:', err);
      return callback(err);
    }
    callback(null);
  });
}

function deleteRecipe(id, callback) {
  const query = 'DELETE FROM recipes WHERE id = ?';
  db.run(query, [id], function (err) {
    if (err) {
      console.error('Fout bij verwijderen recept:', err);
      return callback(err);
    }
    callback(null);
  });
}

module.exports = {
  getRecipes,
  getRandomRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  addUser,
  getUserByEmail
};

// Gebruikers tabel aanmaken
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Gebruiker toevoegen
function addUser(email, passwordHash, callback) {
  const query = 'INSERT INTO users (email, password_hash) VALUES (?, ?)';
  db.run(query, [email, passwordHash], function(err) {
    if (err) {
      console.error('Fout bij toevoegen gebruiker:', err);
      return callback(err);
    }
    callback(null, { id: this.lastID });
  });
}

// Gebruiker ophalen op basis van email
function getUserByEmail(email, callback) {
  const query = 'SELECT * FROM users WHERE email = ?';
  db.get(query, [email], (err, row) => {
    if (err) {
      console.error('Fout bij ophalen gebruiker:', err);
      return callback(err);
    }
    callback(null, row);
  });
}
