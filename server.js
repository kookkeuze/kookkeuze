// server.js
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');

// --- NIEUW: auth libs -------------------------------------------------------
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme‑in‑prod';
// ---------------------------------------------------------------------------

app.use(cors({
  origin: [
    'https://kookkeuze.nl',   // productie-frontend
    'http://localhost:3000'   // lokaal testen
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false          // <- laat op true staan als je cookies gebruikt
}));


const {
  getRecipes,
  getRandomRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  addUser,          // ← nieuw
  getUserByEmail    // ← nieuw
} = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Statische bestanden serveren
app.use(express.static(path.join(__dirname, '/')));

// ====================== AUTH ===============================================
// 1. Registreren
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E‑mail en wachtwoord zijn verplicht.' });
  }

  getUserByEmail(email, (err, existing) => {
    if (err)   return res.status(500).json({ error: 'DB‑fout.' });
    if (existing) return res.status(409).json({ error: 'Gebruiker bestaat al.' });

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return res.status(500).json({ error: 'Hash‑fout.' });

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
    return res.status(400).json({ error: 'E‑mail en wachtwoord zijn verplicht.' });
  }

  getUserByEmail(email, (err, user) => {
    if (err)   return res.status(500).json({ error: 'DB‑fout.' });
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

// 3. Middleware – stopt gedecodeerde token in req.user (optioneel)
function authenticate(req, _res, next) {
  const auth = req.headers.authorization;      // verwacht: "Bearer <token>"
  if (auth) {
    const [, token] = auth.split(' ');
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch { /* ongeldige token -> ga anoniem verder */ }
  }
  next();
}
app.use(authenticate);
// ===========================================================================

// ===================== RECEPT‑API ==========================================
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
  if (!req.user) {
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
    return res.status(400).json({ error: 'Titel en URL zijn verplicht.' });
  }

  addRecipe({
    title,
    url,
    dish_type,
    meal_category,
    meal_type,
    time_required,
    calories,
    user_id: req.user.id        
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
// ===========================================================================

app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
