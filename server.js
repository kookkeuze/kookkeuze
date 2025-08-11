// server.js – met e-mailverificatie
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');          // 🔐 token
const nodemailer = require('nodemailer');      // ✉️ mail

// eerst app & PORT (belangrijk voor CORS hieronder)
const app  = express();
const PORT = process.env.PORT || 3000;

// --- AUTH libs --------------------------------------------------------------
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-in-prod';
// ----------------------------------------------------------------------------

/*
  Vereiste ENV variabelen (Render / .env):
  - JWT_SECRET
  - APP_BASE_URL          (bv. https://kookkeuze.nl of je Render URL)
  - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  (Postmark/SendGrid/SMTP)
*/
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // true bij poort 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* -------------------- CORS -------------------- */
const corsOptions = {
  origin: [
    'https://kookkeuze.nl',
    'https://www.kookkeuze.nl',
    'http://localhost:3000' // voor lokaal testen
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
/* ---------------------------------------------- */

const {
  getRecipes,
  getRandomRecipe,
  addRecipe,
  updateRecipe,
  deleteRecipe,
  addUser,
  getUserByEmail,
  // 👇 helpers toegevoegd in database.js stap 1
  setVerificationToken,
  getUserByVerificationToken,
  verifyUserById
} = require('./database');

app.use(bodyParser.json());

// Statische bestanden serveren
app.use(express.static(path.join(__dirname)));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ====================== AUTH ===============================================
// 1. Registreren (met e-mailverificatie)
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht.' });
  }

  getUserByEmail(email, (err, existing) => {
    if (err)        return res.status(500).json({ error: 'DB-fout.' });
    if (existing)   return res.status(409).json({ error: 'Gebruiker bestaat al.' });

    bcrypt.hash(password, 10, async (err, hash) => {
      if (err) return res.status(500).json({ error: 'Hash-fout.' });

      addUser(email, hash, async (err) => {
        if (err) return res.status(500).json({ error: 'Opslaan mislukt.' });

        try {
          // Genereer token + expiry (24u)
          const token   = crypto.randomBytes(32).toString('hex');
          const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await setVerificationToken(email, token, expires);

          // Link direct naar API (geen frontend nodig)
          const verifyUrl = `${APP_BASE_URL}/api/verify?token=${token}`;

          await transporter.sendMail({
            from: `"Kookkeuze" <kookkeuze@gmail.com>`,
            to: email,
            subject: 'Bevestig je e-mailadres',
            text: `Welkom bij Kookkeuze! Klik op deze link om je e-mailadres te bevestigen: ${verifyUrl}`,
            html: `
              <p>Welkom bij Kookkeuze!</p>
              <p>Klik op de knop hieronder om je e-mailadres te bevestigen:</p>
              <p><a href="${verifyUrl}" style="background:#4ac858;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">E-mailadres bevestigen</a></p>
              <p>Of kopieer deze link in je browser: ${verifyUrl}</p>
              <p>Let op: deze link verloopt over 24 uur.</p>
            `
          });

          res.json({ message: 'Registratie gelukt! Check je e-mail om te bevestigen.' });
        } catch (e) {
          console.error('❌ Verificatietoken/mail fout:', e);
          res.status(500).json({ error: 'Kon verificatie-e-mail niet versturen.' });
        }
      });
    });
  });
});

// 1b. Verify-endpoint
app.get('/api/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token ontbreekt.' });

    const user = await getUserByVerificationToken(token);
    if (!user)  return res.status(400).json({ error: 'Ongeldige of gebruikte token.' });

    if (user.token_expires && new Date(user.token_expires) < new Date()) {
      return res.status(400).json({ error: 'Token is verlopen. Vraag een nieuwe aan.' });
    }

    await verifyUserById(user.id);
    // Eventueel redirect naar frontend met melding:
    // return res.redirect(`${APP_BASE_URL}/?verified=1`);
    return res.json({ message: 'E-mailadres bevestigd. Je kunt nu inloggen.' });
  } catch (err) {
    console.error('❌ Verify error:', err);
    res.status(500).json({ error: 'Serverfout bij verifiëren.' });
  }
});

// 2. Inloggen (blokkeer als niet geverifieerd)
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail en wachtwoord zijn verplicht.' });
  }

  getUserByEmail(email, (err, user) => {
    if (err)    return res.status(500).json({ error: 'DB-fout.' });
    if (!user)  return res.status(401).json({ error: 'Onbekend account.' });

    if (!user.is_verified) {
      return res.status(403).json({ error: 'Verifieer eerst je e-mailadres (check je inbox).' });
    }

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
  const auth = req.headers.authorization; // verwacht: "Bearer <token>"
  if (auth) {
    const [, token] = auth.split(' ');
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (_err) {
      /* ongeldige token -> ga anoniem verder */
    }
  }
  next();
}
app.use(authenticate);
// ===========================================================================

// ===================== RECEPT-API ==========================================
// 1. Haal (gefilterde) recepten op
app.get('/api/recipes', (req, res) => {
  const { dish_type, meal_category, meal_type, time_required, search, calorieRange } = req.query;

  // Alleen recepten van ingelogde gebruiker
  if (!req.user) {
    return res.json([]); // Geen recepten als niet ingelogd
  }

  getRecipes({
    dish_type,
    meal_category,
    meal_type,
    time_required,
    search,
    calorieRange,
    user_id: req.user.id
  }, (err, rows) => {
    if (err)   return res.status(500).json({ error: 'Er is iets misgegaan met het ophalen.' });
    res.json(rows);
  });
});

// 2. Random recept
app.get('/api/recipes/random', (req, res) => {
  const { dish_type, meal_category, meal_type, time_required, search, calorieRange } = req.query;

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
    if (err)      return res.status(500).json({ error: 'Er ging iets mis bij random ophalen.' });
    if (!recipe)  return res.json({ message: 'Geen resultaten gevonden.' });
    res.json(recipe);
  });
});

// 3. Nieuw recept
app.post('/api/recipes', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten toe te voegen.' });
  }

  const { title, url, dish_type, meal_category, meal_type, time_required, calories } = req.body;
  if (!title || !url) {
    return res.status(400).json({ error: 'Titel en URL zijn verplicht.' });
  }

  const cleanDishType     = dish_type     === 'maak een keuze' ? null : dish_type;
  const cleanMealCategory = meal_category === 'maak een keuze' ? null : meal_category;
  const cleanMealType     = meal_type     === 'maak een keuze' ? null : meal_type;
  const cleanTimeRequired = time_required === 'maak een keuze' ? null : time_required;

  addRecipe({
    title,
    url,
    dish_type:     cleanDishType,
    meal_category: cleanMealCategory,
    meal_type:     cleanMealType,
    time_required: cleanTimeRequired,
    calories,
    user_id: req.user.id
  }, (err, result) => {
    if (err) return res.status(500).json({ error: 'Er ging iets mis bij het opslaan van het recept.' });
    res.json({ message: 'Recept toegevoegd!', id: result.id });
  });
});

// 4. Recept bijwerken
app.put('/api/recipes/:id', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten bij te werken.' });
  }

  const recipeId = req.params.id;
  const { title, url, dish_type, meal_type, time_required, meal_category, calories } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: 'Titel en URL zijn verplicht voor update.' });
  }

  updateRecipe(recipeId, { title, url, dish_type, meal_type, time_required, meal_category, calories }, (err) => {
    if (err) return res.status(500).json({ error: 'Er ging iets mis bij het bijwerken.' });
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
    if (err) return res.status(500).json({ error: 'Er ging iets mis bij het verwijderen.' });
    res.json({ message: 'Recept verwijderd!' });
  });
});
// ===========================================================================

app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
