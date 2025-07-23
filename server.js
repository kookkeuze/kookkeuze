// server.js – volledige versie (20-07-2025)
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');

// eerst app & PORT (belangrijk voor CORS hieronder)
const app  = express();
const PORT = process.env.PORT || 3000;

// --- NIEUW: auth libs -------------------------------------------------------
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-in-prod';
// ---------------------------------------------------------------------------

/* -------------------- CORS -------------------- */
const corsOptions = {
  origin: [
    'https://kookkeuze.nl',   // productie-frontend
    'http://localhost:3000'   // lokaal testen
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));           // geldt voor alle routes
app.options('*', cors(corsOptions));  // pre-flight respostas
/* ---------------------------------------------- */

const {
  getRecipes,
  getRandomRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  addUser,
  getUserByEmail
} = require('./database');

app.use(bodyParser.json());

// Statische bestanden serveren
app.use(express.static(path.join(__dirname)));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ====================== AUTH ===============================================
// 1. Registreren
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht.' });
  }

  getUserByEmail(email, (err, existing) => {
    if (err)   return res.status(500).json({ error: 'DB-fout.' });
    if (existing) return res.status(409).json({ error: 'Gebruiker bestaat al.' });

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return res.status(500).json({ error: 'Hash-fout.' });

      addUser(email, hash, (err) => {
        if (err) return res.status(500).json({ error: 'Opslaan mislukt.' });
        res.json({ message: 'Registratie gelukt!' });
      });
    });
  });
});

// 2. Inloggen
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht.' });
  }

  getUserByEmail(email, (err, user) => {
    if (err)   return res.status(500).json({ error: 'DB-fout.' });
    if (!user) return res.status(401).json({ error: 'Onbekend account.' });

    bcrypt.compare(password, user.password_hash, (err, same) => {
      if (err || !same) {
        return res.status(401).json({ error: 'Combinatie klopt niet.' });
      }
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
      res.json({ message: 'Inloggen gelukt!', token });
    });
  });
});

// 3. Middleware – zet gedecodeerde token in req.user
function authenticate(req, _res, next) {
  const auth = req.headers.authorization;      // verwacht: "Bearer <token>"
  console.log('🔍 Auth header:', auth ? 'Bearer token present' : 'No auth header');
  if (auth) {
    const [, token] = auth.split(' ');
    console.log('🔍 Token extracted:', token ? 'Token found' : 'No token');
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      console.log('🔍 User decoded successfully, ID:', req.user.id);
    } catch (err) { 
      console.log('🔍 Token verification failed:', err.message);
      /* ongeldige token -> ga anoniem verder */ 
    }
  }
  console.log('🔍 Final req.user:', req.user ? `User ID: ${req.user.id}` : 'No user');
  next();
}
app.use(authenticate);
// ===========================================================================

// ===================== RECEPT-API ==========================================
// 1. Haal (gefilterde) recepten op
app.get('/api/recipes', (req, res) => {
  const {
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    calorieRange
  } = req.query;

  // Alleen recepten van ingelogde gebruiker ophalen
  if (!req.user) {
    console.log('❌ No user authenticated for /api/recipes');
    return res.json([]); // Geen recepten als niet ingelogd
  }

  console.log('✅ User requesting recipes, ID:', req.user.id);
  console.log('✅ Query filters:', { dish_type, meal_category, meal_type, time_required, search, calorieRange });
  getRecipes({
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    calorieRange,
    user_id: req.user.id
  }, (err, rows) => {
    if (err) {
      console.error('❌ Database error in getRecipes:', err);
      return res.status(500).json({ error: 'Er is iets misgegaan met het ophalen.' });
    }
    console.log('✅ Returning recipes count:', rows.length);
    if (rows.length > 0) {
      console.log('✅ Sample recipe:', { id: rows[0].id, title: rows[0].title, user_id: rows[0].user_id });
      console.log('✅ All recipe IDs:', rows.map(r => r.id));
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

  // Alleen random recept van ingelogde gebruiker
  if (!req.user) {
    return res.json({ message: 'Geen resultaten gevonden.' });
  }

  getRandomRecipe({
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    calorieRange,
    user_id: req.user.id
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
  if (!req.user) {
    console.log('❌ No user authenticated for POST /api/recipes');
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten toe te voegen.' });
  }

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
    console.log('❌ Missing title or URL');
    return res.status(400).json({ error: 'Titel en URL zijn verplicht.' });
  }

  // Convert "maak een keuze" to null
  const cleanDishType = dish_type === 'maak een keuze' ? null : dish_type;
  const cleanMealCategory = meal_category === 'maak een keuze' ? null : meal_category;
  const cleanMealType = meal_type === 'maak een keuze' ? null : meal_type;
  const cleanTimeRequired = time_required === 'maak een keuze' ? null : time_required;

  console.log('✅ Adding recipe for user ID:', req.user.id);
  console.log('✅ Recipe data:', { title, url, cleanDishType, cleanMealCategory, cleanMealType, cleanTimeRequired, calories });

  addRecipe({
    title,
    url,
    dish_type: cleanDishType,
    meal_category: cleanMealCategory,
    meal_type: cleanMealType,
    time_required: cleanTimeRequired,
    calories,
    user_id: req.user.id
  }, (err, result) => {
    if (err) {
      console.error('❌ Error adding recipe:', err);
      return res.status(500).json({ error: 'Er ging iets mis bij het opslaan van het recept.' });
    }
    console.log('✅ Recipe added successfully with ID:', result.id);
    res.json({ message: 'Recept toegevoegd!', id: result.id });
  });
});

// 4. Recept bijwerken
app.put('/api/recipes/:id', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten bij te werken.' });
  }

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
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten te verwijderen.' });
  }

  const recipeId = req.params.id;

  deleteRecipe(recipeId, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Er ging iets mis bij het verwijderen.' });
    }
    res.json({ message: 'Recept verwijderd!' });
  });
});
// ===========================================================================

app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
