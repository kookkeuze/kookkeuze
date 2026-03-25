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
        ADD COLUMN IF NOT EXISTS token_expires TIMESTAMP,
        ADD COLUMN IF NOT EXISTS reset_token TEXT,
        ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP
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

    await pool.query(`
      ALTER TABLE recipes
        ALTER COLUMN dish_type TYPE TEXT,
        ALTER COLUMN meal_type TYPE TEXT,
        ALTER COLUMN time_required TYPE TEXT,
        ALTER COLUMN meal_category TYPE TEXT
    `);
    console.log('✅ Recipe category columns converted to TEXT');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meal_plans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start DATE NOT NULL,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        meal_slot VARCHAR(20) NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'snack', 'dinner')),
        recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, week_start, day_of_week, meal_slot)
      )
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'meal_plans_meal_slot_check'
        ) THEN
          ALTER TABLE meal_plans
            DROP CONSTRAINT meal_plans_meal_slot_check;
        END IF;
        ALTER TABLE meal_plans
          ADD CONSTRAINT meal_plans_meal_slot_check
          CHECK (meal_slot IN ('breakfast', 'lunch', 'snack', 'dinner'));
      END $$;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_meal_plans_user_week
      ON meal_plans (user_id, week_start)
    `);
    console.log('✅ Meal plans table created/verified');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS recipe_databases (
        id SERIAL PRIMARY KEY,
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        is_personal BOOLEAN NOT NULL DEFAULT FALSE,
        is_default_shared BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_databases_personal_owner
      ON recipe_databases (owner_user_id)
      WHERE is_personal = TRUE
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_databases_default_shared_owner
      ON recipe_databases (owner_user_id)
      WHERE is_default_shared = TRUE
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS database_members (
        id SERIAL PRIMARY KEY,
        database_id INTEGER NOT NULL REFERENCES recipe_databases(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member'
          CHECK (role IN ('admin', 'member')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (database_id, user_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_database_members_user
      ON database_members (user_id)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS database_invites (
        id SERIAL PRIMARY KEY,
        database_id INTEGER NOT NULL REFERENCES recipe_databases(id) ON DELETE CASCADE,
        invited_email VARCHAR(255) NOT NULL,
        invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'accepted', 'revoked')),
        accepted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_database_invites_db_status
      ON database_invites (database_id, status)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_database_invites_email
      ON database_invites (LOWER(invited_email))
    `);

    await pool.query(`
      INSERT INTO recipe_databases (owner_user_id, name, is_personal)
      SELECT u.id, 'Mijn persoonlijke database', TRUE
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1
        FROM recipe_databases rd
        WHERE rd.owner_user_id = u.id
          AND rd.is_personal = TRUE
      )
    `);
    await pool.query(`
      INSERT INTO database_members (database_id, user_id, role)
      SELECT rd.id, rd.owner_user_id, 'admin'
      FROM recipe_databases rd
      WHERE rd.is_personal = TRUE
      ON CONFLICT (database_id, user_id) DO NOTHING
    `);

    await pool.query(`
      ALTER TABLE recipes
        ADD COLUMN IF NOT EXISTS database_id INTEGER REFERENCES recipe_databases(id) ON DELETE CASCADE
    `);
    await pool.query(`
      ALTER TABLE meal_plans
        ADD COLUMN IF NOT EXISTS database_id INTEGER REFERENCES recipe_databases(id) ON DELETE CASCADE
    `);

    await pool.query(`
      UPDATE recipes r
      SET database_id = rd.id
      FROM recipe_databases rd
      WHERE r.database_id IS NULL
        AND rd.owner_user_id = r.user_id
        AND rd.is_personal = TRUE
    `);
    await pool.query(`
      UPDATE meal_plans mp
      SET database_id = rd.id
      FROM recipe_databases rd
      WHERE mp.database_id IS NULL
        AND rd.owner_user_id = mp.user_id
        AND rd.is_personal = TRUE
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_recipes_database_id
      ON recipes (database_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_meal_plans_database_week
      ON meal_plans (database_id, week_start)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_database_slot
      ON meal_plans (database_id, week_start, day_of_week, meal_slot)
    `);
    await pool.query(`
      ALTER TABLE meal_plans
      DROP CONSTRAINT IF EXISTS meal_plans_user_id_week_start_day_of_week_meal_slot_key
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_database_access (
        id SERIAL PRIMARY KEY,
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        member_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (owner_user_id, member_user_id),
        CHECK (owner_user_id <> member_user_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_database_access_member
      ON shared_database_access (member_user_id)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_database_invites (
        id SERIAL PRIMARY KEY,
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invite_email VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'accepted', 'revoked')),
        accepted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_database_invites_owner
      ON shared_database_invites (owner_user_id, status)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_database_invites_email
      ON shared_database_invites (LOWER(invite_email))
    `);
    console.log('✅ Shared database tables created/verified');

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
function buildSingleCalorieExpression(range) {
  switch (range) {
    case 'Onder 100':
      return 'calories < 100';
    case 'Onder 200':
      return 'calories < 200';
    case 'Onder 300':
      return 'calories < 300';
    case 'Onder 400':
      return 'calories < 400';
    case 'Onder 500':
      return 'calories < 500';
    case 'Onder 600':
      return 'calories < 600';
    case 'Onder 700':
      return 'calories < 700';
    case 'Onder 800':
      return 'calories < 800';
    case 'Onder 900':
      return 'calories < 900';
    case 'Onder 1000':
      return 'calories < 1000';
    case 'Boven 1000':
      return 'calories > 1000';
    default:
      return '';
  }
}

function normalizeFilterArray(rawValue, placeholder) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  return values
    .map(v => String(v || '').trim())
    .filter(v => v && v !== placeholder && v !== 'maak een keuze');
}

function toDisplayValue(rawValue) {
  if (typeof rawValue !== 'string') return rawValue;
  if (!rawValue.includes('||')) return rawValue;
  return rawValue
    .split('||')
    .map(v => v.trim())
    .filter(Boolean)
    .join(', ');
}

function getRecipes(filters, callback) {
  let query = 'SELECT * FROM recipes WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  console.log('getRecipes called with filters:', filters);

  // Alleen recepten van de ingelogde gebruiker
  if (filters.user_id) {
    query += ` AND database_id = $${paramIndex}`;
    params.push(filters.user_id);
    paramIndex++;
    console.log('Added database_id filter:', filters.user_id);
  } else {
    console.log('⚠️ No database_id provided in filters!');
  }

  const dishTypes = normalizeFilterArray(filters.dish_type, 'Soort gerecht');
  if (dishTypes.length > 0) {
    query += ` AND EXISTS (
      SELECT 1
      FROM unnest(string_to_array(COALESCE(dish_type, ''), '||')) AS v(val)
      WHERE btrim(v.val) = ANY($${paramIndex}::text[])
    )`;
    params.push(dishTypes);
    paramIndex++;
  }

  const mealCategories = normalizeFilterArray(filters.meal_category, 'Menugang');
  if (mealCategories.length > 0) {
    query += ` AND EXISTS (
      SELECT 1
      FROM unnest(string_to_array(COALESCE(meal_category, ''), '||')) AS v(val)
      WHERE btrim(v.val) = ANY($${paramIndex}::text[])
    )`;
    params.push(mealCategories);
    paramIndex++;
  }

  const mealTypes = normalizeFilterArray(filters.meal_type, 'Doel gerecht');
  if (mealTypes.length > 0) {
    query += ` AND EXISTS (
      SELECT 1
      FROM unnest(string_to_array(COALESCE(meal_type, ''), '||')) AS v(val)
      WHERE btrim(v.val) = ANY($${paramIndex}::text[])
    )`;
    params.push(mealTypes);
    paramIndex++;
  }

  const timeRanges = normalizeFilterArray(filters.time_required, 'Tijd');
  if (timeRanges.length > 0) {
    query += ` AND EXISTS (
      SELECT 1
      FROM unnest(string_to_array(COALESCE(time_required, ''), '||')) AS v(val)
      WHERE btrim(v.val) = ANY($${paramIndex}::text[])
    )`;
    params.push(timeRanges);
    paramIndex++;
  }
  // Zoeken in titel
  if (filters.search) {
    query += ` AND title ILIKE $${paramIndex}`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const calorieRanges = normalizeFilterArray(filters.calorieRange, 'Calorieën');
  if (calorieRanges.length > 0) {
    const calorieExpr = calorieRanges
      .map(buildSingleCalorieExpression)
      .filter(Boolean);
    if (calorieExpr.length > 0) {
      query += ` AND (${calorieExpr.join(' OR ')})`;
    }
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
    const formattedRows = result.rows.map(row => ({
      ...row,
      dish_type: toDisplayValue(row.dish_type),
      meal_category: toDisplayValue(row.meal_category),
      meal_type: toDisplayValue(row.meal_type),
      time_required: toDisplayValue(row.time_required)
    }));
    callback(null, formattedRows);
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
    user_id,
    database_id
  } = recipe;

  console.log('addRecipe called with:', recipe);

  const query = `
    INSERT INTO recipes (title, url, dish_type, meal_type, time_required, meal_category, calories, user_id, database_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `;
  
  console.log('Insert query:', query);
  console.log('Insert params:', [title, url, dish_type, meal_type, time_required, meal_category, calories, user_id, database_id]);
  
  pool.query(query, [title, url, dish_type, meal_type, time_required, meal_category, calories, user_id, database_id],
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
    calories,
    database_id
  } = updatedData;

  const query = `
    UPDATE recipes
    SET title = $1, url = $2, dish_type = $3, meal_type = $4, time_required = $5, meal_category = $6, calories = $7
    WHERE id = $8 AND database_id = $9
  `;
  pool.query(query, [
    title,
    url,
    dish_type,
    meal_type,
    time_required,
    meal_category,
    calories,
    id,
    database_id
  ], (err) => {
    if (err) {
      console.error('Fout bij updaten recept:', err);
      return callback(err);
    }
    callback(null);
  });
}

function deleteRecipe(id, databaseId, callback) {
  const query = 'DELETE FROM recipes WHERE id = $1 AND database_id = $2';
  pool.query(query, [id, databaseId], (err) => {
    if (err) {
      console.error('Fout bij verwijderen recept:', err);
      return callback(err);
    }
    callback(null);
  });
}

function getRecipeByIdForOwner(recipeId, databaseId, callback) {
  const query = `
    SELECT * FROM recipes
    WHERE id = $1 AND database_id = $2
    LIMIT 1
  `;
  pool.query(query, [recipeId, databaseId], (err, result) => {
    if (err) return callback(err);
    const row = result.rows[0] || null;
    if (!row) return callback(null, null);
    callback(null, {
      ...row,
      dish_type: toDisplayValue(row.dish_type),
      meal_category: toDisplayValue(row.meal_category),
      meal_type: toDisplayValue(row.meal_type),
      time_required: toDisplayValue(row.time_required)
    });
  });
}

function importRecipeToUserDatabase(recipeId, sourceDatabaseId, targetDatabaseId, callback) {
  const query = `
    WITH source AS (
      SELECT id, title, url, dish_type, meal_type, time_required, meal_category, calories, user_id
      FROM recipes
      WHERE id = $1 AND database_id = $2
      LIMIT 1
    ),
    existing AS (
      SELECT t.id
      FROM recipes t
      JOIN source s ON LOWER(t.url) = LOWER(s.url)
      WHERE t.database_id = $3
      LIMIT 1
    ),
    inserted AS (
      INSERT INTO recipes (title, url, dish_type, meal_type, time_required, meal_category, calories, user_id, database_id)
      SELECT s.title, s.url, s.dish_type, s.meal_type, s.time_required, s.meal_category, s.calories, s.user_id, $3
      FROM source s
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    )
    SELECT
      COALESCE((SELECT id FROM inserted), (SELECT id FROM existing)) AS id,
      EXISTS (SELECT 1 FROM source) AS source_found,
      EXISTS (SELECT 1 FROM existing) AS already_exists,
      (SELECT user_id FROM source) AS source_user_id
  `;
  pool.query(query, [recipeId, sourceDatabaseId, targetDatabaseId], (err, result) => {
    if (err) return callback(err);
    callback(null, result.rows[0] || null);
  });
}

function getMealPlanForWeek(filters, callback) {
  const { user_id, week_start } = filters;
  const query = `
    SELECT
      mp.week_start,
      mp.day_of_week,
      mp.meal_slot,
      mp.recipe_id,
      r.title,
      r.url,
      r.dish_type,
      r.meal_category,
      r.meal_type,
      r.time_required,
      r.calories
    FROM meal_plans mp
    JOIN recipes r
      ON r.id = mp.recipe_id
     AND r.database_id = mp.database_id
    WHERE mp.database_id = $1
      AND mp.week_start = $2
    ORDER BY mp.day_of_week, mp.meal_slot
  `;

  pool.query(query, [user_id, week_start], (err, result) => {
    if (err) {
      console.error('Fout bij ophalen weekmenu:', err);
      return callback(err);
    }
    const rows = result.rows.map(row => ({
      ...row,
      dish_type: toDisplayValue(row.dish_type),
      meal_category: toDisplayValue(row.meal_category),
      meal_type: toDisplayValue(row.meal_type),
      time_required: toDisplayValue(row.time_required)
    }));
    callback(null, rows);
  });
}

function upsertMealPlanEntry(entry, callback) {
  const { user_id, week_start, day_of_week, meal_slot, recipe_id } = entry;

  const query = `
    INSERT INTO meal_plans (user_id, database_id, week_start, day_of_week, meal_slot, recipe_id, updated_at)
    SELECT rd.owner_user_id, $1, $2, $3, $4, r.id, NOW()
    FROM recipe_databases rd
    JOIN recipes r ON r.database_id = rd.id
    WHERE rd.id = $1
      AND r.id = $5
    ON CONFLICT (database_id, week_start, day_of_week, meal_slot)
    DO UPDATE
      SET recipe_id = EXCLUDED.recipe_id,
          updated_at = NOW()
    RETURNING id
  `;

  pool.query(query, [user_id, week_start, day_of_week, meal_slot, recipe_id], (err, result) => {
    if (err) {
      console.error('Fout bij opslaan weekmenu-slot:', err);
      return callback(err);
    }
    if (!result.rows[0]) {
      return callback(new Error('Recept niet gevonden voor deze gebruiker.'));
    }
    callback(null, result.rows[0]);
  });
}

function deleteMealPlanEntry(entry, callback) {
  const { user_id, week_start, day_of_week, meal_slot } = entry;
  const query = `
    DELETE FROM meal_plans
    WHERE database_id = $1
      AND week_start = $2
      AND day_of_week = $3
      AND meal_slot = $4
  `;
  pool.query(query, [user_id, week_start, day_of_week, meal_slot], (err) => {
    if (err) {
      console.error('Fout bij verwijderen weekmenu-slot:', err);
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
    const userId = result.rows[0].id;
    pool.query(`
      INSERT INTO recipe_databases (owner_user_id, name, is_personal)
      VALUES ($1, 'Mijn persoonlijke database', TRUE)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [userId], (dbErr, dbRes) => {
      if (dbErr) return callback(dbErr);
      const dbId = dbRes.rows[0]?.id;
      if (!dbId) {
        pool.query(`
          SELECT id
          FROM recipe_databases
          WHERE owner_user_id = $1
            AND is_personal = TRUE
          LIMIT 1
        `, [userId], (lookupErr, lookupRes) => {
          if (lookupErr) return callback(lookupErr);
          const personalDbId = lookupRes.rows[0]?.id;
          if (!personalDbId) return callback(new Error('Persoonlijke database kon niet worden aangemaakt.'));
          pool.query(`
            INSERT INTO database_members (database_id, user_id, role)
            VALUES ($1, $2, 'admin')
            ON CONFLICT (database_id, user_id) DO NOTHING
          `, [personalDbId, userId], memberErr => {
            if (memberErr) return callback(memberErr);
            console.log('✅ User added with ID:', userId);
            callback(null, { id: userId });
          });
        });
        return;
      }
      pool.query(`
        INSERT INTO database_members (database_id, user_id, role)
        VALUES ($1, $2, 'admin')
        ON CONFLICT (database_id, user_id) DO NOTHING
      `, [dbId, userId], memberErr => {
        if (memberErr) return callback(memberErr);
        console.log('✅ User added with ID:', userId);
        callback(null, { id: userId });
      });
    });
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

async function setPasswordResetToken(email, token, expires) {
  const q = `
    UPDATE users
       SET reset_token = $1,
           reset_token_expires = $2
     WHERE email = $3
     RETURNING id
  `;
  const res = await pool.query(q, [token, expires, email]);
  return res.rows[0];
}

async function getUserByPasswordResetToken(token) {
  const q = `
    SELECT id, email, reset_token_expires
      FROM users
     WHERE reset_token = $1
     LIMIT 1
  `;
  const res = await pool.query(q, [token]);
  return res.rows[0];
}

async function updateUserPasswordById(userId, passwordHash) {
  const q = `
    UPDATE users
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires = NULL
     WHERE id = $2
     RETURNING id
  `;
  const res = await pool.query(q, [passwordHash, userId]);
  return res.rows[0];
}

function listAccessibleDatabases(userId, callback) {
  const query = `
    SELECT
      rd.id AS owner_user_id,
      rd.id AS database_id,
      owner.email AS owner_email,
      rd.name AS database_name,
      rd.is_personal AS is_personal,
      (dm.role = 'admin') AS is_owner,
      (dm.role = 'admin') AS can_manage
    FROM database_members dm
    JOIN recipe_databases rd ON rd.id = dm.database_id
    JOIN users owner ON owner.id = rd.owner_user_id
    WHERE dm.user_id = $1
    ORDER BY rd.is_personal DESC, LOWER(rd.name) ASC
  `;
  pool.query(query, [userId], (err, result) => {
    if (err) return callback(err);
    callback(null, result.rows || []);
  });
}

function userHasDatabaseAccess(userId, databaseId, callback) {
  const query = `
    SELECT 1
    FROM database_members
    WHERE database_id = $1
      AND user_id = $2
    LIMIT 1
  `;
  pool.query(query, [databaseId, userId], (err, result) => {
    if (err) return callback(err);
    callback(null, !!result.rows[0]);
  });
}

function userCanManageDatabase(userId, databaseId, callback) {
  const query = `
    SELECT 1
    FROM database_members
    WHERE database_id = $1
      AND user_id = $2
      AND role = 'admin'
    LIMIT 1
  `;
  pool.query(query, [databaseId, userId], (err, result) => {
    if (err) return callback(err);
    callback(null, !!result.rows[0]);
  });
}

async function getPersonalDatabaseId(userId) {
  const query = `
    SELECT id
    FROM recipe_databases
    WHERE owner_user_id = $1
      AND is_personal = TRUE
    LIMIT 1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows[0]?.id || null;
}

async function getOrCreateDefaultSharedDatabase(ownerUserId) {
  const existing = await pool.query(`
    SELECT id
    FROM recipe_databases
    WHERE owner_user_id = $1
      AND is_default_shared = TRUE
    LIMIT 1
  `, [ownerUserId]);
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const created = await pool.query(`
    INSERT INTO recipe_databases (owner_user_id, name, is_personal, is_default_shared)
    VALUES ($1, 'Gezamenlijke database', FALSE, TRUE)
    RETURNING id
  `, [ownerUserId]);
  const dbId = created.rows[0].id;

  await pool.query(`
    INSERT INTO database_members (database_id, user_id, role)
    VALUES ($1, $2, 'admin')
    ON CONFLICT (database_id, user_id) DO NOTHING
  `, [dbId, ownerUserId]);

  return dbId;
}

function inviteUserToDatabase(databaseId, inviterUserId, inviteEmail, callback) {
  const normalizedEmail = String(inviteEmail || '').trim().toLowerCase();
  if (!normalizedEmail) return callback(new Error('E-mailadres ontbreekt.'));

  (async () => {
    const canManage = await new Promise((resolve, reject) => {
      userCanManageDatabase(inviterUserId, databaseId, (err, ok) => err ? reject(err) : resolve(ok));
    });
    if (!canManage) throw new Error('Je mag deze database niet delen.');

    const dbRes = await pool.query(`
      SELECT owner_user_id, is_personal
      FROM recipe_databases
      WHERE id = $1
      LIMIT 1
    `, [databaseId]);
    const dbRow = dbRes.rows[0];
    if (!dbRow) throw new Error('Database niet gevonden.');

    let targetDatabaseId = Number(databaseId);
    if (dbRow.is_personal) {
      targetDatabaseId = await getOrCreateDefaultSharedDatabase(dbRow.owner_user_id);
    }

    const userRes = await pool.query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [normalizedEmail]
    );
    const invitedUser = userRes.rows[0] || null;

    if (invitedUser && Number(invitedUser.id) === Number(inviterUserId)) {
      throw new Error('Je kunt jezelf niet uitnodigen.');
    }

    if (invitedUser) {
      const insertRes = await pool.query(`
        INSERT INTO database_members (database_id, user_id, role)
        VALUES ($1, $2, 'member')
        ON CONFLICT (database_id, user_id) DO NOTHING
        RETURNING id
      `, [targetDatabaseId, invitedUser.id]);
      callback(null, {
        type: 'member',
        email: invitedUser.email,
        member_user_id: invitedUser.id,
        database_id: targetDatabaseId,
        already_had_access: !insertRes.rows[0]
      });
      return;
    }

    const inviteRes = await pool.query(`
      INSERT INTO database_invites (database_id, invited_email, invited_by_user_id, status)
      VALUES ($1, $2, $3, 'pending')
      RETURNING id, database_id, invited_email, status, created_at
    `, [targetDatabaseId, normalizedEmail, inviterUserId]);
    callback(null, {
      type: 'invite',
      ...inviteRes.rows[0]
    });
  })().catch(callback);
}

function listDatabaseMembers(databaseId, callback) {
  const query = `
    SELECT
      dm.user_id AS member_user_id,
      u.email,
      dm.role,
      dm.created_at
    FROM database_members dm
    JOIN users u ON u.id = dm.user_id
    WHERE dm.database_id = $1
    ORDER BY LOWER(u.email) ASC
  `;
  pool.query(query, [databaseId], (err, result) => {
    if (err) return callback(err);
    callback(null, result.rows || []);
  });
}

function listDatabaseInvites(databaseId, callback) {
  const query = `
    SELECT id, invited_email AS invite_email, status, created_at
    FROM database_invites
    WHERE database_id = $1
      AND status = 'pending'
    ORDER BY created_at DESC
  `;
  pool.query(query, [databaseId], (err, result) => {
    if (err) return callback(err);
    callback(null, result.rows || []);
  });
}

function revokeDatabaseMember(databaseId, memberUserId, callback) {
  const query = `
    DELETE FROM database_members
    WHERE database_id = $1
      AND user_id = $2
      AND role <> 'admin'
  `;
  pool.query(query, [databaseId, memberUserId], (err) => {
    if (err) return callback(err);
    callback(null);
  });
}

function revokeDatabaseInvite(databaseId, inviteId, callback) {
  const query = `
    UPDATE database_invites
    SET status = 'revoked'
    WHERE id = $1
      AND database_id = $2
      AND status = 'pending'
    RETURNING id
  `;
  pool.query(query, [inviteId, databaseId], (err, result) => {
    if (err) return callback(err);
    callback(null, !!result.rows[0]);
  });
}

function acceptPendingInvitesForUser(userId, email, callback) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return callback(null, { accepted: 0 });

  const insertAccessQuery = `
    INSERT INTO database_members (database_id, user_id, role)
    SELECT DISTINCT di.database_id, $1, 'member'
    FROM database_invites di
    WHERE LOWER(di.invited_email) = LOWER($2)
      AND di.status = 'pending'
    ON CONFLICT (database_id, user_id) DO NOTHING
  `;

  const acceptInviteQuery = `
    UPDATE database_invites
    SET status = 'accepted',
        accepted_by_user_id = $1,
        accepted_at = NOW()
    WHERE LOWER(invited_email) = LOWER($2)
      AND status = 'pending'
  `;

  pool.query(insertAccessQuery, [userId, normalizedEmail], (insertErr) => {
    if (insertErr) return callback(insertErr);
    pool.query(acceptInviteQuery, [userId, normalizedEmail], (acceptErr, acceptRes) => {
      if (acceptErr) return callback(acceptErr);
      callback(null, { accepted: acceptRes.rowCount || 0 });
    });
  });
}


module.exports = {
  getRecipes,
  getRandomRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  getRecipeByIdForOwner,
  importRecipeToUserDatabase,
  addUser,
  getUserByEmail,
  setVerificationToken,          
  getUserByVerificationToken,    
  verifyUserById,
  setPasswordResetToken,
  getUserByPasswordResetToken,
  updateUserPasswordById,
  getMealPlanForWeek,
  upsertMealPlanEntry,
  deleteMealPlanEntry,
  listAccessibleDatabases,
  userHasDatabaseAccess,
  userCanManageDatabase,
  getPersonalDatabaseId,
  inviteUserToDatabase,
  listDatabaseMembers,
  listDatabaseInvites,
  revokeDatabaseMember,
  revokeDatabaseInvite,
  acceptPendingInvitesForUser
};
