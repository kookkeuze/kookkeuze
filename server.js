// server.js – met e-mailverificatie + auto-login redirect
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');        // nodig voor cid-attachment pad
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

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
  - APP_BASE_URL          (bv. https://kookkeuze.onrender.com)
  - FRONTEND_URL          (bv. https://kookkeuze.nl)
  - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
*/
const APP_BASE_URL  = process.env.APP_BASE_URL  || `http://localhost:${PORT}`;
const FRONTEND_URL  = process.env.FRONTEND_URL  || 'http://localhost:3000';

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // 587 = STARTTLS
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
    'http://localhost:3000' // lokaal testen
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
  // helpers uit database.js
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

/* -------------------- Email template -------------------- */
// Huisstijl + inline logo via CID-attachment
function verificationEmailHtml(verifyUrl) {
  const PRIMARY    = '#4dca5b';
  const TEXT_DARK  = '#3a3a3a';
  const BACKGROUND = '#f8f9fa';

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light only">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Bevestig je e-mailadres</title>
  </head>
  <body style="margin:0;background:${PRIMARY};padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:${BACKGROUND};padding:24px 24px 0;">
          <!-- Belangrijk: cid verwijst naar attachment cid in sendMail -->
          <img src="cid:logo@kookkeuze" alt="Kookkeuze" style="height:28px;display:block;">
        </td>
      </tr>
      <tr>
        <td style="padding:24px 24px 0;">
          <h1 style="margin:0 0 8px 0;font-size:36px;line-height:1.1;color:${TEXT_DARK};">
            Bevestig je e-mailadres
          </h1>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="margin:0 0 16px 0;color:#444;font-size:16px;line-height:1.6;">
            Welkom bij Kookkeuze! Klik op de knop hieronder om je e-mailadres te bevestigen.
          </p>
          <p style="margin:24px 0;">
            <a href="${verifyUrl}"
               style="display:inline-block;background:${PRIMARY};color:#fff;text-decoration:none;
                      padding:14px 22px;border-radius:10px;font-weight:bold;">
              E-mailadres bevestigen
            </a>
          </p>
          <p style="margin:0 0 8px 0;color:#666;font-size:14px;">
            Werkt de knop niet? Kopieer en plak deze link in je browser:
          </p>
          <p style="margin:0 0 24px 0;color:#4a4a4a;font-size:13px;word-break:break-all;">
            <a href="${verifyUrl}" style="color:${PRIMARY};text-decoration:underline;">${verifyUrl}</a>
          </p>
          <p style="margin:0 0 4px 0;color:#888;font-size:12px;line-height:1.6;">
            Heb jij dit niet aangevraagd? Negeer deze e-mail.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px 28px;color:#8a8a8a;font-size:12px;">
          © ${new Date().getFullYear()} Kookkeuze.
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}
/* ------------------------------------------------------- */

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

          const verifyUrl = `${APP_BASE_URL}/api/verify?token=${token}`;

          await transporter.sendMail({
            from: `"Kookkeuze" <kookkeuze@gmail.com>`, // <- afzender (gecontroleerde sender)
            to: email,
            subject: 'Bevestig je e-mailadres',
            html: verificationEmailHtml(verifyUrl),
            text: `Welkom bij Kookkeuze! Bevestig je e-mail via: ${verifyUrl}`,
            // Belangrijk: inline logo meesturen als attachment met cid
            attachments: [
              {
                filename: 'Kookkeuze-logo.png',
                path: path.join(__dirname, 'Logo', 'Kookkeuze-logo.png'),
                cid: 'logo@kookkeuze'
              }
            ]
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

// 1b. Verify-endpoint (zet verified en redirect met JWT naar frontend)
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

    // JWT aanmaken en redirect naar frontend voor auto-login
    const jwtToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
    return res.redirect(`${FRONTEND_URL}/?token=${jwtToken}`);
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
