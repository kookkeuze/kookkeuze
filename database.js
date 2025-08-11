// database.js - PostgreSQL versie (met e-mailverificatie velden)
const { Pool } = require('pg');

// Database connection configuratie
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/recipes',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
    console.error('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    console.error('💡 Voor lokale ontwikkeling, stel DATABASE_URL in of gebruik een lokale PostgreSQL database');
  } else {
    console.log('✅ Verbonden met PostgreSQL database.');
  }
});

// Database tabellen aanmaken
async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database tables...');
    
    // Users tabel
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created/verified');

    // 🔁 Nieuwe/ontbrekende kolommen voor e-mailverificatie + index
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS verification_token TEXT,
        ADD COLUMN IF NOT EXISTS token_expires TIMESTAMP
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_verification_token
      ON users (verification_token)
    `);
    console.log('✅ Email verification columns/index ensured');

    // Recipes tabel
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        dish_type VARCHAR(100),
        meal_type VARCHAR(100),
        time_required VARCHAR(100),
        meal_category VARCHAR(100),
        calories INTEGER,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Recipes table created/verified');

    // Check if tables have data
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const recipeCount = await pool.query('SELECT COUNT(*) FROM recipes');
    console.log(`📊 Database status: ${userCount.rows[0].count} users, ${recipeCount.rows[0].count} recipes`);

  } catch (err) {
    console.error('❌ Error initializing database:', err);
    console.error('Full error details:', err);
  }
}

// Initialize database tables (only if connection is available)
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.log('⚠️ Database not available for initialization, will initialize when needed');
  } else {
    initializeDatabase();
  }
});

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
  let paramIndex = 1;

  console.log('getRecipes called with filters:', filters);

  // Alleen recepten van de ingelogde gebruiker
  if (filters.user_id) {
    query += ` AND user_id = $${paramIndex}`;
    params.push(filters.user_id);
    paramIndex++;
    console.log('Added user_id filter:', filters.user_id);
  } else {
    console.log('⚠️ No user_id provided in filters!');
  }

  // dish_type
  if (filters.dish_type && filters.dish_type !== 'maak een keuze') {
    query += ` AND dish_type = $${paramIndex}`;
    params.push(filters.dish_type);
    paramIndex++;
  }
  // meal_category
  if (filters.meal_category && filters.meal_category !== 'maak een keuze') {
    query += ` AND meal_category = $${paramIndex}`;
    params.push(filters.meal_category);
    paramIndex++;
  }
  // meal_type
  if (filters.meal_type && filters.meal_type !== 'maak een keuze') {
    query += ` AND meal_type = $${paramIndex}`;
    params.push(filters.meal_type);
    paramIndex++;
  }
  // time_required
  if (filters.time_required && filters.time_required !== 'maak een keuze') {
    query += ` AND time_required = $${paramIndex}`;
    params.push(filters.time_required);
    paramIndex++;
  }
  // Zoeken in titel
  if (filters.search) {
    query += ` AND title ILIKE $${paramIndex}`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  // Eén calorieRange => buildSingleCalorieCondition
  if (filters.calorieRange && filters.calorieRange !== 'Calorieën') {
    query += buildSingleCalorieCondition(filters.calorieRange);
  }

  console.log('Final query:', query);
  console.log('Query params:', params);
  
  pool.query(query, params, (err, result) => {
    if (err) {
      console.error('Fout in getRecipes:', err);
      return callback(err);
    }
    console.log('Found rows:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('Sample row:', result.rows[0]);
    }
    callback(null, result.rows);
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

  console.log('addRecipe called with:', recipe);

  const query = `
    INSERT INTO recipes (title, url, dish_type, meal_type, time_required, meal_category, calories, user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `;
  
  console.log('Insert query:', query);
  console.log('Insert params:', [title, url, dish_type, meal_type, time_required, meal_category, calories, user_id]);
  
  pool.query(query, [title, url, dish_type, meal_type, time_required, meal_category, calories, user_id],
    (err, result) => {
      if (err) {
        console.error('Fout bij invoegen recept:', err);
        return callback(err);
      }
      console.log('Recipe inserted with ID:', result.rows[0].id);
      callback(null, { id: result.rows[0].id });
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
    SET title = $1, url = $2, dish_type = $3, meal_type = $4, time_required = $5, meal_category = $6, calories = $7
    WHERE id = $8
  `;
  pool.query(query, [
    title,
    url,
    dish_type,
    meal_type,
    time_required,
    meal_category,
    calories,
    id
  ], (err) => {
    if (err) {
      console.error('Fout bij updaten recept:', err);
      return callback(err);
    }
    callback(null);
  });
}

function deleteRecipe(id, callback) {
  const query = 'DELETE FROM recipes WHERE id = $1';
  pool.query(query, [id], (err) => {
    if (err) {
      console.error('Fout bij verwijderen recept:', err);
      return callback(err);
    }
    callback(null);
  });
}

// Gebruiker toevoegen
function addUser(email, passwordHash, callback) {
  const query = 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id';
  pool.query(query, [email, passwordHash], (err, result) => {
    if (err) {
      console.error('❌ Fout bij toevoegen gebruiker:', err);
      if (err.code === 'ECONNREFUSED') {
        return callback(new Error('Database connection failed. Check your DATABASE_URL.'));
      }
      return callback(err);
    }
    console.log('✅ User added with ID:', result.rows[0].id);
    callback(null, { id: result.rows[0].id });
  });
}

// Gebruiker ophalen op basis van email
function getUserByEmail(email, callback) {
  const query = 'SELECT * FROM users WHERE email = $1';
  pool.query(query, [email], (err, result) => {
    if (err) {
      console.error('❌ Fout bij ophalen gebruiker:', err);
      if (err.code === 'ECONNREFUSED') {
        return callback(new Error('Database connection failed. Check your DATABASE_URL.'));
      }
      return callback(err);
    }
    callback(null, result.rows[0]);
  });
}

// ----- Email verification helpers -----
async function setVerificationToken(email, token, expires) {
  const q = `
    UPDATE users
       SET verification_token = $1,
           token_expires      = $2,
           is_verified        = FALSE
     WHERE email = $3
     RETURNING id
  `;
  const res = await pool.query(q, [token, expires, email]);
  return res.rows[0];
}

async function getUserByVerificationToken(token) {
  const q = `
    SELECT id, email, token_expires, is_verified
      FROM users
     WHERE verification_token = $1
     LIMIT 1
  `;
  const res = await pool.query(q, [token]);
  return res.rows[0];
}

async function verifyUserById(userId) {
  const q = `
    UPDATE users
       SET is_verified = TRUE,
           verification_token = NULL,
           token_expires = NULL
     WHERE id = $1
     RETURNING id
  `;
  const res = await pool.query(q, [userId]);
  return res.rows[0];
}


module.exports = {
  getRecipes,
  getRandomRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  addUser,
  getUserByEmail,
  setVerificationToken,          
  getUserByVerificationToken,    
  verifyUserById                
};
