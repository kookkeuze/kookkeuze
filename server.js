// server.js – met e-mailverificatie + auto-login redirect
const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// --- AUTH libs --------------------------------------------------------------
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-in-prod';
// ----------------------------------------------------------------------------

/*
  Vereiste ENV variabelen (Railway / .env):
  - JWT_SECRET
  - APP_BASE_URL          (bv. https://<service>.up.railway.app of https://www.kookkeuze.nl)
  - FRONTEND_URL          (bv. https://www.kookkeuze.nl)
  - BREVO_API_KEY
  - BREVO_FROM_EMAIL      (optioneel, fallback: SMTP_FROM of SMTP_USER)
  - BREVO_FROM_NAME       (optioneel, fallback: Kookkeuze)
  - CORS_ORIGINS          (optioneel, comma-separated lijst)
*/
const APP_BASE_URL  = process.env.APP_BASE_URL  || `http://localhost:${PORT}`;
const FRONTEND_URL  = process.env.FRONTEND_URL  || 'http://localhost:3000';
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = process.env.BREVO_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
const BREVO_FROM_NAME  = process.env.BREVO_FROM_NAME || 'Kookkeuze';
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_HTML_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

function sanitizeOrigin(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function buildAllowedOrigins() {
  const configured = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(v => sanitizeOrigin(v))
    .filter(Boolean);

  const defaults = [
    'https://kookkeuze.nl',
    'https://www.kookkeuze.nl',
    'http://localhost:3000',
    sanitizeOrigin(APP_BASE_URL),
    sanitizeOrigin(FRONTEND_URL)
  ].filter(Boolean);

  return [...new Set([...configured, ...defaults])];
}

/* -------------------- Image scrape cache -------------------- */
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const IMAGE_NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const recipeImageCache = new Map();

function extractMetaContent(tag) {
  if (!tag) return null;
  const match = tag.match(/content=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function extractRecipeImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]*>/i,
    /<meta[^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*>/i,
    /<meta[^>]+itemprop=["']image["'][^>]*>/i
  ];

  for (const re of patterns) {
    const tag = html.match(re);
    const content = extractMetaContent(tag && tag[0]);
    if (content) return content;
  }
  return null;
}

function normalizeImageCandidate(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = normalizeImageCandidate(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof raw === 'object') {
    return normalizeImageCandidate(raw.url || raw.contentUrl || raw['@id']);
  }
  return null;
}

function extractRecipeImageFromJsonLd(html) {
  const blocks = parseJsonLdBlocks(html);
  for (const block of blocks) {
    const recipe = findRecipeObject(block);
    if (!recipe) continue;
    const candidate = normalizeImageCandidate(recipe.image);
    if (candidate) return candidate;
  }
  return null;
}

async function fetchHtmlWithRetries(targetUrl) {
  const attempts = [
    DEFAULT_HTML_HEADERS,
    {
      ...DEFAULT_HTML_HEADERS,
      'User-Agent': 'KookkeuzeBot/1.1',
      'Accept': 'text/html,application/xhtml+xml'
    }
  ];

  for (const headers of attempts) {
    try {
      const response = await fetch(targetUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) continue;
      const html = await response.text();
      if (html && html.length > 100) return html;
    } catch (_err) {
      // probeer volgende poging
    }
  }
  return null;
}
/* ------------------------------------------------------------ */

/* -------------------- Recipe info scrape -------------------- */
const RECIPE_INFO_TTL_MS = 24 * 60 * 60 * 1000;
const recipeInfoCache = new Map();

function parseJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
  }
  return blocks;
}

function findRecipeObject(data) {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeObject(item);
      if (found) return found;
    }
    return null;
  }
  if (data['@graph']) return findRecipeObject(data['@graph']);

  const type = data['@type'];
  if (type) {
    const types = Array.isArray(type) ? type : [type];
    if (types.map(t => String(t).toLowerCase()).includes('recipe')) return data;
  }
  return null;
}

function collectTextFields(recipe) {
  const parts = [];
  const push = v => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(x => push(x));
    else parts.push(String(v));
  };
  push(recipe.recipeCategory);
  push(recipe.recipeCuisine);
  push(recipe.keywords);
  push(recipe.name);
  return parts.join(' ').toLowerCase();
}

function parseCalories(cal) {
  if (!cal) return null;
  const match = String(cal).match(/(\d{2,4})/);
  return match ? parseInt(match[1], 10) : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeIngredientText(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    return value.replace(/\s+/g, ' ').trim() || null;
  }

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeIngredientText(item))
      .filter(Boolean)
      .join(', ') || null;
  }

  if (typeof value === 'object') {
    const amount = normalizeIngredientText(value.amount || value.quantity);
    const unit = normalizeIngredientText(value.unit || value.unitText);
    const name = normalizeIngredientText(value.name || value.text || value.ingredient || value.food);
    return [amount, unit, name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null;
  }

  return String(value).replace(/\s+/g, ' ').trim() || null;
}

function extractRecipeIngredients(recipe) {
  const rawIngredients = recipe.recipeIngredient || recipe.ingredients || recipe.ingredient;
  const ingredients = Array.isArray(rawIngredients)
    ? rawIngredients
    : (rawIngredients ? [rawIngredients] : []);
  const seen = new Set();

  return ingredients
    .map(item => normalizeIngredientText(item))
    .filter(Boolean)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}

function parseDurationToMinutes(iso) {
  if (!iso) return null;
  const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return null;
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  return h * 60 + m;
}

function mapTimeRequired(totalMinutes) {
  if (totalMinutes == null) return null;
  if (totalMinutes < 30) return 'Onder de 30 minuten';
  if (totalMinutes <= 45) return '30 - 45 minuten';
  if (totalMinutes <= 60) return '45 minuten - 1 uur';
  if (totalMinutes <= 120) return '1 - 2 uur';
  return 'langer dan 2 uur';
}

function mapDishType(text) {
  const checks = [
    { key: 'hartige taart', value: 'Hartige taart' },
    { key: 'ovenschotel', value: 'Ovenschotel' },
    { key: 'vegetarisch', value: 'Vegetarisch' },
    { key: 'wrap', value: 'Wraps' },
    { key: 'pasta', value: 'Pasta' },
    { key: 'rijst', value: 'Rijst' },
    { key: 'soep', value: 'Soep' },
    { key: 'taart', value: 'Taart & cake' },
    { key: 'cake', value: 'Taart & cake' },
    { key: 'brood', value: 'Brood' },
    { key: 'kip', value: 'Kip' },
    { key: 'rund', value: 'Rund' },
    { key: 'varken', value: 'Varken' },
    { key: 'vis', value: 'Vis' },
    { key: 'hartig', value: 'Hartig' },
    { key: 'zoet', value: 'Zoet' }
  ];
  for (const c of checks) {
    if (text.includes(c.key)) return c.value;
  }
  return null;
}

function mapMealCategory(text) {
  const checks = [
    { key: 'bakken', value: 'Bakken' },
    { key: 'dessert', value: 'Dessert' },
    { key: 'dressing', value: 'Dressings, sauzen & dips' },
    { key: 'saus', value: 'Dressings, sauzen & dips' },
    { key: 'dip', value: 'Dressings, sauzen & dips' },
    { key: 'drinken', value: 'Drinken' },
    { key: 'hoofdgerecht', value: 'Hoofdgerecht' },
    { key: 'lunch', value: 'Lunch' },
    { key: 'ontbijt', value: 'Ontbijt' },
    { key: 'salade', value: 'Salade' },
    { key: 'snack', value: 'Snacks' }
  ];
  for (const c of checks) {
    if (text.includes(c.key)) return c.value;
  }
  return null;
}

function mapMealType(text) {
  if (text.includes('sport') || text.includes('eiwit') || text.includes('high protein')) {
    return 'Sporten';
  }
  if (text.includes('cheat') || text.includes('cheaten')) {
    return 'Cheaten';
  }
  return null;
}

function buildRecipePayload(recipe) {
  if (!recipe) {
    return {
      title: null,
      dish_type: null,
      meal_category: null,
      meal_type: null,
      time_required: null,
      calories: null,
      ingredients: [],
      missing: ['Titel', 'Soort gerecht', 'Menugang', 'Doel gerecht', 'Tijd', 'Calorieën']
    };
  }

  const text = collectTextFields(recipe);
  const totalMinutes = parseDurationToMinutes(recipe.totalTime || recipe.cookTime || recipe.prepTime);
  const payload = {
    title: recipe.name || null,
    dish_type: mapDishType(text),
    meal_category: mapMealCategory(text),
    meal_type: mapMealType(text),
    time_required: mapTimeRequired(totalMinutes),
    calories: parseCalories(recipe.nutrition && recipe.nutrition.calories),
    ingredients: extractRecipeIngredients(recipe),
    missing: []
  };

  if (!payload.title) payload.missing.push('Titel');
  if (!payload.dish_type) payload.missing.push('Soort gerecht');
  if (!payload.meal_category) payload.missing.push('Menugang');
  if (!payload.meal_type) payload.missing.push('Doel gerecht');
  if (!payload.time_required) payload.missing.push('Tijd');
  if (payload.calories == null) payload.missing.push('Calorieën');
  return payload;
}

async function getRecipeInfoPayload(targetUrl) {
  const cacheKey = targetUrl.toString();
  const cached = recipeInfoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const html = await fetchHtmlWithRetries(cacheKey);
  if (!html) {
    return { error: 'Kon de pagina niet ophalen. Deze site blokkeert waarschijnlijk automatisch uitlezen.' };
  }

  const blocks = parseJsonLdBlocks(html);
  let recipe = null;
  for (const block of blocks) {
    recipe = findRecipeObject(block);
    if (recipe) break;
  }

  const payload = buildRecipePayload(recipe);
  recipeInfoCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + RECIPE_INFO_TTL_MS
  });
  return payload;
}
/* ------------------------------------------------------------ */

if (!BREVO_API_KEY || !BREVO_FROM_EMAIL) {
  console.warn('⚠️ Brevo API configuratie incompleet: verificatie-mails kunnen niet verstuurd worden.');
} else {
  console.log('✅ Brevo API mail geconfigureerd.');
}

async function sendBrevoEmail({ to, subject, html, text }) {
  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: BREVO_FROM_EMAIL, name: BREVO_FROM_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Brevo API fout (${response.status}): ${errorBody}`);
  }

  return response.json().catch(() => ({}));
}

/* -------------------- CORS -------------------- */
const corsOptions = {
  origin: buildAllowedOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204
};
console.log('🌐 CORS origins:', corsOptions.origin);
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
  getUserRecipePackOnboardingSeen,
  setUserRecipePackOnboardingSeen,
  getRecipeCountForDatabase,
  addRecipePackToDatabase,
  // helpers uit database.js
  setVerificationToken,
  getUserByVerificationToken,
  verifyUserById,
  setPasswordResetToken,
  getUserByPasswordResetToken,
  updateUserPasswordById,
  getMealPlanForWeek,
  upsertMealPlanEntry,
  deleteMealPlanEntry,
  listRecipeNotesForDatabase,
  upsertRecipeNote,
  deleteRecipeNote,
  getRecipeByIdForOwner,
  importRecipeToUserDatabase,
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
} = require('./database');

app.use(bodyParser.json());

// Statische bestanden serveren (zonder cache voor HTML)
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Receptinfo ophalen via JSON-LD (recipe schema)
app.get('/api/recipe-info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url ontbreekt' });

  let pageUrl;
  try {
    pageUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'ongeldige url' });
  }
  if (!['http:', 'https:'].includes(pageUrl.protocol)) {
    return res.status(400).json({ error: 'ongeldige url' });
  }

  try {
    const payload = await getRecipeInfoPayload(pageUrl);
    return res.json(payload);
  } catch (err) {
    console.error('❌ recipe-info error:', err);
    return res.json({ error: 'Fout bij ophalen van receptinformatie.' });
  }
});

// Receptafbeelding ophalen via URL (og:image / twitter:image)
app.get('/api/recipe-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url ontbreekt' });

  let pageUrl;
  try {
    pageUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'ongeldige url' });
  }
  if (!['http:', 'https:'].includes(pageUrl.protocol)) {
    return res.status(400).json({ error: 'ongeldige url' });
  }

  const cacheKey = pageUrl.toString();
  const cached = recipeImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ imageUrl: cached.imageUrl });
  }

  try {
    const html = await fetchHtmlWithRetries(cacheKey);
    if (!html) {
      return res.json({ imageUrl: null });
    }

    let imageUrl = extractRecipeImage(html) || extractRecipeImageFromJsonLd(html);
    if (imageUrl) {
      imageUrl = new URL(imageUrl, pageUrl).toString();
    }
    const proxiedImageUrl = imageUrl
      ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}&ref=${encodeURIComponent(cacheKey)}`
      : null;

    recipeImageCache.set(cacheKey, {
      imageUrl: proxiedImageUrl,
      expiresAt: Date.now() + (proxiedImageUrl ? IMAGE_CACHE_TTL_MS : IMAGE_NEGATIVE_CACHE_TTL_MS)
    });

    return res.json({ imageUrl: proxiedImageUrl });
  } catch (err) {
    console.error('❌ recipe-image error:', err);
    return res.json({ imageUrl: null });
  }
});

// Afbeelding proxy (vermindert hotlink/referrer problemen bij externe sites)
app.get('/api/image-proxy', async (req, res) => {
  const { url, ref } = req.query;
  if (!url) return res.status(400).send('url ontbreekt');

  let imageUrl;
  try {
    imageUrl = new URL(url);
  } catch {
    return res.status(400).send('ongeldige url');
  }
  if (!['http:', 'https:'].includes(imageUrl.protocol)) {
    return res.status(400).send('ongeldige url');
  }

  let referer = null;
  if (typeof ref === 'string' && ref) {
    try {
      referer = new URL(ref).toString();
    } catch {
      referer = null;
    }
  }

  try {
    const response = await fetch(imageUrl.toString(), {
      headers: {
        'User-Agent': DEFAULT_HTML_HEADERS['User-Agent'],
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {})
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      return res.status(404).send('Afbeelding niet beschikbaar');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    console.error('❌ image-proxy error:', err);
    return res.status(502).send('Afbeelding ophalen mislukt');
  }
});

/* -------------------- Email template -------------------- */
function verificationEmailHtml(verifyUrl) {
  const PRIMARY = '#4dca5b';
  const PRIMARY_DARK = '#38b248';
  const ACCENT = '#d97a45';
  const PAGE_BG = '#eef5ef';
  const CARD_BG = '#ffffff';
  const TEXT_DARK = '#28372f';
  const TEXT_BODY = '#4b5c53';
  const MUTED = '#708178';
  const logoUrl = `${FRONTEND_URL}/Logo/Kookkeuze-logo.png`;

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light only">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Bevestig je e-mailadres</title>
    <style>
      @media screen and (max-width: 640px) {
        .mail-wrap { padding: 18px 10px !important; }
        .mail-card { border-radius: 14px !important; }
        .mail-body { padding: 24px 18px !important; }
        .mail-title { font-size: 31px !important; }
        .mail-cta { display: block !important; text-align: center !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:${PAGE_BG};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
      Bevestig je e-mailadres en activeer je Kookkeuze-account.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="mail-wrap"
           style="background:${PAGE_BG};padding:30px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="mail-card"
                 style="max-width:640px;margin:0 auto;background:${CARD_BG};border-radius:20px;overflow:hidden;box-shadow:0 18px 42px rgba(40,55,47,0.14);">
            <tr>
              <td style="height:8px;background:${PRIMARY};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 24px 20px;background:#f4fbf4;border-bottom:1px solid #e0efe2;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td valign="middle">
                      <img src="${logoUrl}" alt="Kookkeuze" style="height:36px;display:block;">
                    </td>
                    <td align="right" valign="middle">
                      <span style="display:inline-block;background:#ffffff;color:${PRIMARY_DARK};border:1px solid #d8eddc;
                                   border-radius:999px;padding:7px 12px;font-size:12px;font-weight:700;letter-spacing:.03em;">
                        ACCOUNT ACTIVEREN
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mail-body" style="padding:30px 28px 26px;">
                <h1 class="mail-title" style="margin:0 0 14px 0;font-size:42px;line-height:1.06;letter-spacing:-0.02em;color:${TEXT_DARK};">
                  Bevestig je e-mailadres
                </h1>
                <p style="margin:0 0 20px 0;color:${TEXT_BODY};font-size:17px;line-height:1.62;">
                  Welkom bij Kookkeuze. Klik op de knop hieronder om je account af te ronden en direct recepten te kunnen bewaren.
                </p>
                <p style="margin:0 0 26px 0;">
                  <a href="${verifyUrl}" class="mail-cta"
                     style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;
                            padding:14px 24px;border-radius:12px;font-size:18px;font-weight:700;line-height:1.2;
                            box-shadow:0 8px 18px rgba(77,202,91,0.32);">
                    E-mailadres bevestigen
                  </a>
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                       style="background:#f8fbf8;border:1px solid #e0eae1;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 14px 12px;">
                      <p style="margin:0 0 8px 0;color:${MUTED};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;">
                        Werkt de knop niet?
                      </p>
                      <p style="margin:0;color:${TEXT_BODY};font-size:13px;line-height:1.55;word-break:break-all;">
                        Kopieer en plak deze link in je browser:<br>
                        <a href="${verifyUrl}" style="color:${PRIMARY_DARK};text-decoration:underline;">${verifyUrl}</a>
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0 0;color:${MUTED};font-size:13px;line-height:1.6;">
                  Heb je dit niet aangevraagd? Dan kun je deze e-mail veilig negeren.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                       style="border-top:1px solid #e8efea;">
                  <tr>
                    <td style="padding-top:14px;font-size:12px;color:${MUTED};line-height:1.5;">
                      © ${new Date().getFullYear()} Kookkeuze
                    </td>
                    <td align="right" style="padding-top:14px;font-size:12px;color:${ACCENT};font-weight:700;letter-spacing:.02em;">
                      kookkeuze.nl
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

function passwordResetEmailHtml(resetUrl) {
  const PRIMARY = '#4dca5b';
  const TEXT_DARK = '#3a3a3a';
  const BACKGROUND = '#f8f9fa';
  const logoUrl = `${FRONTEND_URL}/Logo/Kookkeuze-logo.png`;

  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light only">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Wachtwoord opnieuw instellen</title>
  </head>
  <body style="margin:0;background:${PRIMARY};padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:${BACKGROUND};padding:24px 24px 0;">
          <img src="${logoUrl}" alt="Kookkeuze" style="height:35px;display:block;">
        </td>
      </tr>
      <tr>
        <td style="padding:24px 24px 0;">
          <h1 style="margin:0 0 8px 0;font-size:36px;line-height:1.1;color:${TEXT_DARK};">
            Wachtwoord opnieuw instellen
          </h1>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="margin:0 0 16px 0;color:#444;font-size:16px;line-height:1.6;">
            Klik op de knop hieronder om een nieuw wachtwoord te kiezen.
          </p>
          <p style="margin:24px 0;">
            <a href="${resetUrl}"
               style="display:inline-block;background:${PRIMARY};color:#fff;text-decoration:none;
                      padding:14px 22px;border-radius:10px;font-weight:bold;">
              Nieuw wachtwoord instellen
            </a>
          </p>
          <p style="margin:0 0 8px 0;color:#666;font-size:14px;">
            Werkt de knop niet? Kopieer en plak deze link in je browser:
          </p>
          <p style="margin:0 0 24px 0;color:#4a4a4a;font-size:13px;word-break:break-all;">
            <a href="${resetUrl}" style="color:${PRIMARY};text-decoration:underline;">${resetUrl}</a>
          </p>
          <p style="margin:0 0 4px 0;color:#888;font-size:12px;line-height:1.6;">
            Heb jij dit niet aangevraagd? Dan kun je deze e-mail negeren.
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

          if (!BREVO_API_KEY || !BREVO_FROM_EMAIL) {
            return res.status(500).json({ error: 'Mailconfig ontbreekt. Neem contact op met de beheerder.' });
          }

          const mailInfo = await sendBrevoEmail({
            to: email,
            subject: 'Bevestig je e-mailadres',
            html: verificationEmailHtml(verifyUrl),
            text: `Welkom bij Kookkeuze! Bevestig je e-mail via: ${verifyUrl}`
          });

          console.log('📧 Verificatiemail verstuurd:', {
            to: email,
            messageId: mailInfo.messageId || null
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
    // Uitnodigingen accepteren mag verificatie nooit blokkeren.
    try {
      await dbCall(acceptPendingInvitesForUser, user.id, user.email);
    } catch (inviteErr) {
      console.warn('⚠️ Verify: invites konden niet worden verwerkt, ga door met login redirect.', inviteErr);
    }

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
      acceptPendingInvitesForUser(user.id, user.email, () => {});
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
      res.json({ message: 'Inloggen gelukt!', token });
    });
  });
});

// 2b. Reset wachtwoord aanvragen
app.post('/api/password-reset/request', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'E-mailadres is verplicht.' });
  }

  const genericMessage = 'Als dit e-mailadres bestaat, is er een resetlink verstuurd.';

  try {
    const user = await new Promise((resolve, reject) => {
      getUserByEmail(email, (err, foundUser) => {
        if (err) return reject(err);
        resolve(foundUser || null);
      });
    });

    if (!user) return res.json({ message: genericMessage });
    if (!BREVO_API_KEY || !BREVO_FROM_EMAIL) {
      return res.status(500).json({ error: 'Mailconfig ontbreekt. Neem contact op met de beheerder.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 uur
    await setPasswordResetToken(email, token, expires);

    const resetUrl = `${FRONTEND_URL}/?resetToken=${token}`;

    await sendBrevoEmail({
      to: email,
      subject: 'Wachtwoord opnieuw instellen',
      html: passwordResetEmailHtml(resetUrl),
      text: `Stel je wachtwoord opnieuw in via: ${resetUrl}`
    });

    return res.json({ message: genericMessage });
  } catch (err) {
    console.error('❌ Password reset request error:', err);
    return res.status(500).json({ error: 'Kon reset e-mail niet versturen.' });
  }
});

// 2c. Nieuw wachtwoord opslaan met reset token
app.post('/api/password-reset/confirm', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return res.status(400).json({ error: 'Token en wachtwoord zijn verplicht.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Gebruik minimaal 8 tekens voor je wachtwoord.' });
  }

  try {
    const user = await getUserByPasswordResetToken(token);
    if (!user) return res.status(400).json({ error: 'Resetlink is ongeldig of al gebruikt.' });

    if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Resetlink is verlopen. Vraag een nieuwe aan.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await updateUserPasswordById(user.id, hash);
    return res.json({ message: 'Je wachtwoord is bijgewerkt. Je kunt nu inloggen.' });
  } catch (err) {
    console.error('❌ Password reset confirm error:', err);
    return res.status(500).json({ error: 'Serverfout bij resetten van wachtwoord.' });
  }
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
function toArrayValue(raw, placeholder) {
  if (Array.isArray(raw)) {
    return raw
      .map(v => String(v || '').trim())
      .filter(v => v && v !== placeholder && v !== 'maak een keuze');
  }
  const single = String(raw || '').trim();
  if (!single || single === placeholder || single === 'maak een keuze') return [];
  return [single];
}

function normalizeRecipeField(raw) {
  const values = toArrayValue(raw, '');
  if (values.length === 0) return null;
  return values.join('||');
}

function packRecipe(title, url, recipeMeta) {
  return {
    title,
    url,
    dish_type: recipeMeta.dish_type || null,
    meal_category: recipeMeta.meal_category || null,
    meal_type: recipeMeta.meal_type || null,
    time_required: recipeMeta.time_required || null,
    calories: recipeMeta.calories ?? null
  };
}

const RECIPE_PACKS = [
  {
    key: 'sporten',
    title: 'Sporten',
    subtitle: 'Eiwitrijk en voedzaam',
    description: '20 recepten met focus op eiwitten en herstel.',
    icon: 'fa-dumbbell',
    recipes: [
      ['5-Ingredient Salmon Teriyaki Bowls', 'https://www.allrecipes.com/5-ingredient-salmon-teriyaki-bowls-recipe-11871553'],
      ['Skillet Chicken and White Bean Stew', 'https://www.allrecipes.com/skillet-chicken-and-white-bean-stew-recipe-11871872'],
      ['Chicken and Chickpea Curry Stuffed Sweet Potatoes', 'https://www.allrecipes.com/chicken-and-chickpea-curry-stuffed-sweet-potatoes-recipe-11871410'],
      ['High Protein Sheet Pan Pasta Bake', 'https://www.allrecipes.com/high-protein-sheet-pan-pasta-bake-recipe-11871461'],
      ['Kadai Chicken', 'https://www.allrecipes.com/recipe/246849/kadai-chicken/'],
      ['Ultra Easy Pineapple Chicken Kabobs', 'https://www.allrecipes.com/recipe/234348/ultra-easy-pineapple-chicken-kabobs/'],
      ['Peachy Broccoli Chicken', 'https://www.allrecipes.com/recipe/62106/peachy-broccoli-chicken/'],
      ['Cinnamon Chicken', 'https://www.allrecipes.com/recipe/16759/cinnamon-chicken/'],
      ['Spanish Rice Chicken I', 'https://www.allrecipes.com/recipe/8985/spanish-rice-chicken-i/'],
      ['Spicy Steamed Shrimp', 'https://www.allrecipes.com/recipe/21330/spicy-steamed-shrimp/'],
      ['Slow Cooker Chicken Chili with Greens and Beans', 'https://www.allrecipes.com/recipe/219932/slow-cooker-chicken-chili-with-greens-and-beans/'],
      ['Italian White Bean and Sausage Stew', 'https://www.allrecipes.com/recipe/279875/italian-white-bean-and-sausage-stew/'],
      ['Instant Pot Keto Chicken and Kale Stew', 'https://www.allrecipes.com/recipe/263873/instant-pot-keto-chicken-and-kale-stew/'],
      ['Spicy Chicken and Sweet Potato Stew', 'https://www.allrecipes.com/recipe/149586/spicy-chicken-and-sweet-potato-stew/'],
      ['Belizean Chicken Stew', 'https://www.allrecipes.com/recipe/244520/belizean-chicken-stew/'],
      ['Peppers Stuffed with Spinach and Ground Chicken', 'https://www.allrecipes.com/recipe/282480/peppers-stuffed-with-spinach-and-ground-chicken/'],
      ['Stuffed Zucchini with Chicken Sausage', 'https://www.allrecipes.com/recipe/215679/stuffed-zucchini-with-chicken-sausage/'],
      ['Stuffed Peppers with Turkey and Vegetables', 'https://www.allrecipes.com/recipe/79805/stuffed-peppers-with-turkey-and-vegetables/'],
      ['Slow Cooked Chicken Stew', 'https://www.allrecipes.com/recipe/260603/slow-cooked-chicken-stew/'],
      ['Creole Chicken Stew with Baby Lima Beans', 'https://www.allrecipes.com/recipe/282867/creole-chicken-stew-with-baby-lima-beans/']
    ].map(([title, url]) => packRecipe(title, url, {
      dish_type: 'Kip',
      meal_category: 'Hoofdgerecht',
      meal_type: 'Sporten',
      time_required: '30 - 45 minuten'
    }))
  },
  {
    key: 'snacks-toetjes',
    title: 'Snacks en toetjes',
    subtitle: 'Lekkere tussendoortjes',
    description: '20 makkelijke snacks en desserts voor elk moment.',
    icon: 'fa-ice-cream',
    recipes: [
      ['Dark Chocolate Almond Rocks', 'https://www.allrecipes.com/recipe/256321/dark-chocolate-almond-rocks/'],
      ['Air Fryer Apple Chips', 'https://www.allrecipes.com/recipe/276459/air-fryer-tajin-apple-chips/'],
      ['Candied Almond Bark Popcorn', 'https://www.allrecipes.com/recipe/260870/candied-almond-bark-popcorn/'],
      ['Nutella Crescent Rolls', 'https://www.allrecipes.com/recipe/280431/nutella-crescent-rolls/'],
      ['Chocolate Covered Potato Chips', 'https://www.allrecipes.com/recipe/79655/chocolate-covered-potato-chips/'],
      ['Oreo Cookie Bark', 'https://www.allrecipes.com/recipe/15684/oreo-cookie-bark/'],
      ['Birthday Cake Dip', 'https://www.allrecipes.com/birthday-cake-dip-recipe-11803153'],
      ['Almond Croissant Ooey Gooey Butter Cake', 'https://www.allrecipes.com/almond-croissant-ooey-gooey-butter-cake-recipe-11811360'],
      ['Chocolate Pudding Cake', 'https://www.allrecipes.com/recipe/17499/chocolate-pudding-cake-iii/'],
      ['Snickers Cheesecake Bars', 'https://www.allrecipes.com/snickers-cheesecake-bars-recipe-11822745'],
      ['Salted Caramel Pecan Pie Bars', 'https://www.allrecipes.com/salted-caramel-pecan-pie-bars-recipe-11848104'],
      ['Heavenly Raspberry Dessert', 'https://www.allrecipes.com/recipe/244321/heavenly-raspberry-dessert/'],
      ['Nutella Swirl Cheesecake Bars', 'https://www.allrecipes.com/nutella-swirl-cheesecake-bars-recipe-8779386'],
      ['Blackberry Cheesecake Brownies', 'https://www.allrecipes.com/blackberry-cheesecake-brownies-recipe-8693993'],
      ['Cookie Butter Pie', 'https://www.allrecipes.com/recipe/278704/cookie-butter-pie/'],
      ['No-Bake Chocolate Pistachio Cheesecake Bars', 'https://www.allrecipes.com/no-bake-chocolate-pistachio-cheesecake-bars-recipe-11714362'],
      ['Red, White, and Blue Cheesecake Bites', 'https://www.allrecipes.com/red-white-and-blue-cheesecake-bites-recipe-7554460'],
      ['Strawberry Chiffon Pie', 'https://www.allrecipes.com/recipe/274398/strawberry-chiffon-pie/'],
      ['No Bake Irish Cream Cheesecake', 'https://www.allrecipes.com/no-bake-irish-cream-cheesecake-recipe-11922193'],
      ['Vegan Chocolate Pie', 'https://www.allrecipes.com/recipe/277909/vegan-chocolate-pie/']
    ].map(([title, url]) => packRecipe(title, url, {
      dish_type: 'Zoet',
      meal_category: 'Dessert',
      meal_type: 'Cheaten',
      time_required: 'Onder de 30 minuten'
    }))
  },
  {
    key: 'snel-klaar',
    title: 'Snel klaar',
    subtitle: 'Binnen 30 minuten op tafel',
    description: '20 snelle recepten voor drukke dagen.',
    icon: 'fa-bolt',
    recipes: [
      ['5-Ingredient Salmon Teriyaki Bowls', 'https://www.allrecipes.com/5-ingredient-salmon-teriyaki-bowls-recipe-11871553'],
      ['Chicken and Chickpea Curry Stuffed Sweet Potatoes', 'https://www.allrecipes.com/chicken-and-chickpea-curry-stuffed-sweet-potatoes-recipe-11871410'],
      ['High Protein Sheet Pan Pasta Bake', 'https://www.allrecipes.com/high-protein-sheet-pan-pasta-bake-recipe-11871461'],
      ['Pineapple, Black Beans, and Couscous', 'https://www.allrecipes.com/recipe/223548/pineapple-black-beans-and-couscous/'],
      ['Simple Mexican Quinoa', 'https://www.allrecipes.com/recipe/242110/simple-mexican-quinoa/'],
      ['Kadai Chicken', 'https://www.allrecipes.com/recipe/246849/kadai-chicken/'],
      ['Eggplant Pasta', 'https://www.allrecipes.com/recipe/240955/eggplant-pasta/'],
      ['Ultra Easy Pineapple Chicken Kabobs', 'https://www.allrecipes.com/recipe/234348/ultra-easy-pineapple-chicken-kabobs/'],
      ['Peachy Broccoli Chicken', 'https://www.allrecipes.com/recipe/62106/peachy-broccoli-chicken/'],
      ['Bow Ties with Veggies', 'https://www.allrecipes.com/recipe/23972/bow-ties-with-veggies/'],
      ['Spanish Rice Chicken I', 'https://www.allrecipes.com/recipe/8985/spanish-rice-chicken-i/'],
      ['Spicy Steamed Shrimp', 'https://www.allrecipes.com/recipe/21330/spicy-steamed-shrimp/'],
      ['Parmesan Puff Pastry Stars', 'https://www.allrecipes.com/recipe/260957/parmesan-puff-pastry-stars/'],
      ['World\'s Easiest and Most Amazing Two-Ingredient Dip', 'https://www.allrecipes.com/recipe/244677/worlds-easiest-and-most-amazing-two-ingredient-dip/'],
      ['Nutella Crescent Rolls', 'https://www.allrecipes.com/recipe/280431/nutella-crescent-rolls/'],
      ['Chickpea Curry', 'https://www.allrecipes.com/recipe/34689/chickpea-curry/'],
      ['Quick Vegetable Curry', 'https://www.allrecipes.com/recipe/143002/quick-vegetable-curry/'],
      ['Butternut Squash Curry', 'https://www.allrecipes.com/recipe/281702/butternut-squash-curry/'],
      ['Vegan Coconut-Lentil Curry with Sweet Potatoes', 'https://www.allrecipes.com/recipe/273844/vegan-coconut-lentil-curry-with-sweet-potatoes/'],
      ['Vegan Sweet Potato Chickpea Curry', 'https://www.allrecipes.com/recipe/265472/vegan-sweet-potato-chickpea-curry/']
    ].map(([title, url]) => packRecipe(title, url, {
      dish_type: 'Pasta',
      meal_category: 'Hoofdgerecht',
      meal_type: 'Normaal',
      time_required: 'Onder de 30 minuten'
    }))
  },
  {
    key: 'budget',
    title: 'Budget',
    subtitle: 'Voordelig en vullend',
    description: '20 betaalbare recepten met simpele ingrediënten.',
    icon: 'fa-coins',
    recipes: [
      ['Scrumptious Chicken Vegetable Stew', 'https://www.allrecipes.com/recipe/78016/scrumptious-chicken-vegetable-stew/'],
      ['Instant Pot Brunswick Stew', 'https://www.allrecipes.com/recipe/262403/instant-pot-brunswick-stew/'],
      ['Slow Cooker Chicken Chili with Greens and Beans', 'https://www.allrecipes.com/recipe/219932/slow-cooker-chicken-chili-with-greens-and-beans/'],
      ['Moroccan-Style Chicken and Eggplant Stew', 'https://www.allrecipes.com/recipe/256940/moroccan-style-chicken-and-eggplant-stew/'],
      ['Italian White Bean and Sausage Stew', 'https://www.allrecipes.com/recipe/279875/italian-white-bean-and-sausage-stew/'],
      ['Chamberlayne Chicken and Kale Stew', 'https://www.allrecipes.com/recipe/179908/chamberlayne-chicken-and-kale-stew/'],
      ['Skillet Gnocchi with Chard and White Beans', 'https://www.allrecipes.com/recipe/238785/skillet-gnocchi-with-chard-white-beans/'],
      ['Slow Cooked Chicken Stew', 'https://www.allrecipes.com/recipe/260603/slow-cooked-chicken-stew/'],
      ['Creole Chicken Stew with Baby Lima Beans', 'https://www.allrecipes.com/recipe/282867/creole-chicken-stew-with-baby-lima-beans/'],
      ['Hearty Winter Stew', 'https://www.allrecipes.com/recipe/282693/hearty-winter-stew/'],
      ['West African Peanut Stew', 'https://www.allrecipes.com/recipe/217952/west-african-peanut-stew/'],
      ['Millet-Stuffed Peppers', 'https://www.allrecipes.com/recipe/75785/millet-stuffed-peppers/'],
      ['Taco-Stuffed Zucchini Boats', 'https://www.allrecipes.com/recipe/242032/taco-stuffed-zucchini-boats/'],
      ['Stuffed Zucchini Casserole', 'https://www.allrecipes.com/recipe/16366/stuffed-zucchini-casserole/'],
      ['Zucchini with Chickpea and Mushroom Stuffing', 'https://www.allrecipes.com/recipe/25920/zucchini-with-chickpea-and-mushroom-stuffing/'],
      ['Spiced Sweet Potato Dahl', 'https://www.allrecipes.com/recipe/256725/spiced-sweet-potato-dahl/'],
      ['Zucchini Boats on the Grill', 'https://www.allrecipes.com/recipe/72788/zucchini-boats-on-the-grill/'],
      ['Butternut Squash Curry', 'https://www.allrecipes.com/recipe/281702/butternut-squash-curry/'],
      ['Chickpea Curry', 'https://www.allrecipes.com/recipe/34689/chickpea-curry/'],
      ['Quick Vegetable Curry', 'https://www.allrecipes.com/recipe/143002/quick-vegetable-curry/']
    ].map(([title, url]) => packRecipe(title, url, {
      dish_type: 'Rijst',
      meal_category: 'Hoofdgerecht',
      meal_type: 'Normaal',
      time_required: '30 - 45 minuten'
    }))
  },
  {
    key: 'vega',
    title: 'Vega',
    subtitle: 'Vol smaak, zonder vlees',
    description: '20 vegetarische recepten voor variatie in je week.',
    icon: 'fa-seedling',
    recipes: [
      ['Vegan Sweet Potato Chickpea Curry', 'https://www.allrecipes.com/recipe/265472/vegan-sweet-potato-chickpea-curry/'],
      ['Stuffed Red Pepper with Quinoa and Chickpeas', 'https://www.allrecipes.com/recipe/233365/stuffed-red-pepper-with-quinoa-and-chickpeas/'],
      ['Millet-Stuffed Peppers', 'https://www.allrecipes.com/recipe/75785/millet-stuffed-peppers/'],
      ['Taco-Stuffed Zucchini Boats', 'https://www.allrecipes.com/recipe/242032/taco-stuffed-zucchini-boats/'],
      ['Stuffed Zucchini Casserole', 'https://www.allrecipes.com/recipe/16366/stuffed-zucchini-casserole/'],
      ['Vegan Butternut Squash and Chickpea Curry', 'https://www.allrecipes.com/recipe/263124/vegan-butternut-squash-and-chickpea-curry/'],
      ['Zucchini with Chickpea and Mushroom Stuffing', 'https://www.allrecipes.com/recipe/25920/zucchini-with-chickpea-and-mushroom-stuffing/'],
      ['Vegan Coconut-Lentil Curry with Sweet Potatoes', 'https://www.allrecipes.com/recipe/273844/vegan-coconut-lentil-curry-with-sweet-potatoes/'],
      ['Spiced Sweet Potato Dahl', 'https://www.allrecipes.com/recipe/256725/spiced-sweet-potato-dahl/'],
      ['Zucchini Boats on the Grill', 'https://www.allrecipes.com/recipe/72788/zucchini-boats-on-the-grill/'],
      ['Butternut Squash Curry', 'https://www.allrecipes.com/recipe/281702/butternut-squash-curry/'],
      ['Chickpea Curry', 'https://www.allrecipes.com/recipe/34689/chickpea-curry/'],
      ['Quick Vegetable Curry', 'https://www.allrecipes.com/recipe/143002/quick-vegetable-curry/'],
      ['Portobello Mushroom Caps and Veggies', 'https://www.allrecipes.com/recipe/45842/portobello-mushroom-caps-and-veggies/'],
      ['Simple Mexican Quinoa', 'https://www.allrecipes.com/recipe/242110/simple-mexican-quinoa/'],
      ['Eggplant Pasta', 'https://www.allrecipes.com/recipe/240955/eggplant-pasta/'],
      ['Maple Cannellini Bean Salad with Baby Broccoli and Butternut Squash', 'https://www.allrecipes.com/recipe/228251/maple-cannellini-bean-salad-with-baby-broccoli-and-butternut-squash/'],
      ['Skillet Gnocchi with Chard and White Beans', 'https://www.allrecipes.com/recipe/238785/skillet-gnocchi-with-chard-white-beans/'],
      ['Parmesan Thyme Crisps', 'https://www.allrecipes.com/recipe/247068/parmesan-thyme-crisps/'],
      ['Vegan Chocolate Pie', 'https://www.allrecipes.com/recipe/277909/vegan-chocolate-pie/']
    ].map(([title, url]) => packRecipe(title, url, {
      dish_type: 'Vegetarisch',
      meal_category: 'Hoofdgerecht',
      meal_type: 'Normaal',
      time_required: '30 - 45 minuten'
    }))
  }
];

function getRecipePackSummaries() {
  return RECIPE_PACKS.map(pack => ({
    key: pack.key,
    title: pack.title,
    subtitle: pack.subtitle,
    description: pack.description,
    icon: pack.icon,
    total_recipes: pack.recipes.length
  }));
}

function dbCall(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function isValidWeekStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const dt = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(dt.getTime());
}

function parseRequestedOwnerId(req) {
  const raw = req.method === 'GET'
    ? req.query?.dbOwnerId
    : (req.body?.dbOwnerId ?? req.query?.dbOwnerId);
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return NaN;
  return id;
}

async function resolveDatabaseOwnerId(req) {
  if (!req.user) {
    const err = new Error('Je moet ingelogd zijn.');
    err.statusCode = 401;
    throw err;
  }
  const requested = parseRequestedOwnerId(req);
  if (Number.isNaN(requested)) {
    const err = new Error('Ongeldige dbOwnerId.');
    err.statusCode = 400;
    throw err;
  }
  const ownerUserId = requested || await getPersonalDatabaseId(req.user.id);
  if (!ownerUserId) {
    const err = new Error('Persoonlijke database niet gevonden.');
    err.statusCode = 404;
    throw err;
  }
  const hasAccess = await dbCall(userHasDatabaseAccess, req.user.id, ownerUserId);
  if (!hasAccess) {
    const err = new Error('Je hebt geen toegang tot deze database.');
    err.statusCode = 403;
    throw err;
  }
  return ownerUserId;
}

app.get('/api/recipe-packs', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  return res.json(getRecipePackSummaries());
});

app.get('/api/recipe-packs/onboarding-status', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  try {
    const personalDbId = await getPersonalDatabaseId(req.user.id);
    if (!personalDbId) return res.status(404).json({ error: 'Persoonlijke database niet gevonden.' });
    const [seen, recipeCount] = await Promise.all([
      dbCall(getUserRecipePackOnboardingSeen, req.user.id),
      dbCall(getRecipeCountForDatabase, personalDbId)
    ]);
    return res.json({
      seen: !!seen,
      recipeCount,
      shouldShow: !seen && recipeCount === 0
    });
  } catch (err) {
    return res.status(500).json({ error: 'Kon onboarding-status niet ophalen.' });
  }
});

app.post('/api/recipe-packs/onboarding-complete', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  try {
    await dbCall(setUserRecipePackOnboardingSeen, req.user.id, true);
    return res.json({ message: 'Onboarding gemarkeerd als afgerond.' });
  } catch (err) {
    return res.status(500).json({ error: 'Kon onboarding-status niet opslaan.' });
  }
});

app.post('/api/recipe-packs/apply', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  const packKey = String(req.body?.packKey || '').trim();
  const pack = RECIPE_PACKS.find(p => p.key === packKey);
  if (!pack) return res.status(400).json({ error: 'Onbekend receptenpakket.' });

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    const result = await dbCall(addRecipePackToDatabase, ownerUserId, req.user.id, pack.recipes);
    return res.json({
      message: `Pakket "${pack.title}" verwerkt.`,
      packKey: pack.key,
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Kon pakket niet toevoegen.' });
  }
});

// 1. Haal (gefilterde) recepten op
app.get('/api/recipes', async (req, res) => {
  const { dish_type, meal_category, meal_type, time_required, search, calorieRange } = req.query;
  if (!req.user) return res.json([]);

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    const rows = await dbCall(getRecipes, {
      dish_type,
      meal_category,
      meal_type,
      time_required,
      search,
      calorieRange,
      user_id: ownerUserId
    });
    res.json(rows);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Er is iets misgegaan met het ophalen.' });
  }
});

// 2. Random recept
app.get('/api/recipes/random', async (req, res) => {
  const { dish_type, meal_category, meal_type, time_required, search, calorieRange } = req.query;

  if (!req.user) {
    return res.json({ message: 'Geen resultaten gevonden.' });
  }

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    const recipe = await dbCall(getRandomRecipe, {
      dish_type,
      meal_category,
      meal_type,
      time_required,
      search,
      calorieRange,
      user_id: ownerUserId
    });
    if (!recipe) return res.json({ message: 'Geen resultaten gevonden.' });
    return res.json(recipe);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Er ging iets mis bij random ophalen.' });
  }
});

// 3. Nieuw recept
app.post('/api/recipes', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten toe te voegen.' });
  }

  const { title, url, dish_type, meal_category, meal_type, time_required, calories } = req.body;
  if (!title || !url) {
    return res.status(400).json({ error: 'Titel en URL zijn verplicht.' });
  }

  const cleanDishType     = normalizeRecipeField(dish_type);
  const cleanMealCategory = normalizeRecipeField(meal_category);
  const cleanMealType     = normalizeRecipeField(meal_type);
  const cleanTimeRequired = normalizeRecipeField(time_required);

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    const result = await dbCall(addRecipe, {
      title,
      url,
      dish_type: cleanDishType,
      meal_category: cleanMealCategory,
      meal_type: cleanMealType,
      time_required: cleanTimeRequired,
      calories,
      user_id: req.user.id,
      database_id: ownerUserId
    });
    res.json({ message: 'Recept toegevoegd!', id: result.id });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Er ging iets mis bij het opslaan van het recept.' });
  }
});

// 4. Recept bijwerken
app.put('/api/recipes/:id', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten bij te werken.' });
  }

  const recipeId = req.params.id;
  const { title, url, dish_type, meal_type, time_required, meal_category, calories } = req.body;

  if (!title || !url) {
    return res.status(400).json({ error: 'Titel en URL zijn verplicht voor update.' });
  }

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    await dbCall(updateRecipe, recipeId, {
      title,
      url,
      dish_type: normalizeRecipeField(dish_type),
      meal_type: normalizeRecipeField(meal_type),
      time_required: normalizeRecipeField(time_required),
      meal_category: normalizeRecipeField(meal_category),
      calories,
      database_id: ownerUserId
    });
    res.json({ message: 'Recept bijgewerkt!' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Er ging iets mis bij het bijwerken.' });
  }
});

// 5. Recept verwijderen
app.delete('/api/recipes/:id', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om recepten te verwijderen.' });
  }

  const recipeId = req.params.id;

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    await dbCall(deleteRecipe, recipeId, ownerUserId);
    res.json({ message: 'Recept verwijderd!' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Er ging iets mis bij het verwijderen.' });
  }
});

// 6. Recept importeren naar eigen database
app.post('/api/recipes/:id/import', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om te importeren.' });
  }
  const recipeId = Number(req.params.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: 'Ongeldige recipe id.' });
  }

  try {
    const sourceOwnerId = await resolveDatabaseOwnerId(req);
    const rawTargetId = Number(req.body?.targetDbOwnerId);
    const fallbackPersonalDbId = await getPersonalDatabaseId(req.user.id);
    const targetOwnerId = Number.isInteger(rawTargetId) && rawTargetId > 0 ? rawTargetId : fallbackPersonalDbId;
    if (!targetOwnerId) return res.status(404).json({ error: 'Persoonlijke database niet gevonden.' });
    const canWriteTarget = await dbCall(userHasDatabaseAccess, req.user.id, targetOwnerId);
    if (!canWriteTarget) {
      return res.status(403).json({ error: 'Je hebt geen toegang tot de doel-database.' });
    }
    if (Number(sourceOwnerId) === Number(targetOwnerId)) {
      return res.status(400).json({ error: 'Bron- en doel-database zijn hetzelfde.' });
    }

    const imported = await dbCall(importRecipeToUserDatabase, recipeId, sourceOwnerId, targetOwnerId);
    if (!imported || !imported.source_found) {
      return res.status(404).json({ error: 'Recept niet gevonden in deze database.' });
    }
    if (imported.already_exists) {
      const isOwnRecipe = Number(imported.source_user_id) === Number(req.user.id);
      return res.status(409).json({
        error: isOwnRecipe
          ? 'Dit is je eigen recept en het staat al in je database.'
          : 'Dit recept staat al in de doel-database.'
      });
    }
    return res.json({ message: 'Recept geïmporteerd.', id: imported.id });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Importeren mislukt.' });
  }
});

// 7. Weekmenu ophalen
app.get('/api/meal-plan', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om je weekmenu te zien.' });
  }

  const { weekStart } = req.query;
  if (!isValidWeekStart(weekStart)) {
    return res.status(400).json({ error: 'Ongeldige weekStart. Gebruik YYYY-MM-DD.' });
  }

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    const rows = await dbCall(getMealPlanForWeek, {
      user_id: ownerUserId,
      week_start: weekStart
    });
    return res.json(rows);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Kon weekmenu niet ophalen.' });
  }
});

// 8. Weekmenu-slot opslaan/updaten
app.put('/api/meal-plan', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om je weekmenu te bewerken.' });
  }

  const { week_start, day_of_week, meal_slot, recipe_id } = req.body;
  if (!isValidWeekStart(week_start)) {
    return res.status(400).json({ error: 'Ongeldige week_start. Gebruik YYYY-MM-DD.' });
  }
  const dayNum = Number(day_of_week);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) {
    return res.status(400).json({ error: 'day_of_week moet tussen 1 en 7 liggen.' });
  }
  if (!['breakfast', 'lunch', 'snack', 'dinner'].includes(String(meal_slot || ''))) {
    return res.status(400).json({ error: 'meal_slot moet breakfast, lunch, snack of dinner zijn.' });
  }
  const recipeIdNum = Number(recipe_id);
  if (!Number.isInteger(recipeIdNum) || recipeIdNum <= 0) {
    return res.status(400).json({ error: 'recipe_id ontbreekt of is ongeldig.' });
  }

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    await dbCall(upsertMealPlanEntry, {
      user_id: ownerUserId,
      week_start,
      day_of_week: dayNum,
      meal_slot,
      recipe_id: recipeIdNum
    });
    return res.json({ message: 'Weekmenu bijgewerkt.' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(400).json({ error: err.message || 'Opslaan van weekmenu mislukt.' });
  }
});

// 9. Weekmenu-slot verwijderen
app.delete('/api/meal-plan', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om je weekmenu te bewerken.' });
  }

  const { week_start, day_of_week, meal_slot } = req.body || {};
  if (!isValidWeekStart(week_start)) {
    return res.status(400).json({ error: 'Ongeldige week_start. Gebruik YYYY-MM-DD.' });
  }
  const dayNum = Number(day_of_week);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) {
    return res.status(400).json({ error: 'day_of_week moet tussen 1 en 7 liggen.' });
  }
  if (!['breakfast', 'lunch', 'snack', 'dinner'].includes(String(meal_slot || ''))) {
    return res.status(400).json({ error: 'meal_slot moet breakfast, lunch, snack of dinner zijn.' });
  }

  try {
    const ownerUserId = await resolveDatabaseOwnerId(req);
    await dbCall(deleteMealPlanEntry, {
      user_id: ownerUserId,
      week_start,
      day_of_week: dayNum,
      meal_slot
    });
    return res.json({ message: 'Weekmenu-slot verwijderd.' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Verwijderen van weekmenu-slot mislukt.' });
  }
});

// 10. Receptnotities ophalen
app.get('/api/recipe-notes', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om notities te zien.' });
  }

  try {
    const databaseId = await resolveDatabaseOwnerId(req);
    const rows = await dbCall(listRecipeNotesForDatabase, {
      user_id: req.user.id,
      database_id: databaseId
    });
    return res.json(rows);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: 'Kon receptnotities niet ophalen.' });
  }
});

// 11. Receptnotitie opslaan
app.put('/api/recipe-notes', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om notities op te slaan.' });
  }

  const { recipe_id, recipe_url, note_text } = req.body || {};
  const cleanedNote = String(note_text || '').trim();
  if (!cleanedNote) {
    return res.status(400).json({ error: 'Notitietekst ontbreekt.' });
  }
  if (cleanedNote.length > 500) {
    return res.status(400).json({ error: 'Notitie mag maximaal 500 tekens bevatten.' });
  }

  try {
    const databaseId = await resolveDatabaseOwnerId(req);
    const saved = await dbCall(upsertRecipeNote, {
      user_id: req.user.id,
      database_id: databaseId,
      recipe_id,
      recipe_url,
      note_text: cleanedNote
    });
    return res.json(saved || { success: true });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(400).json({ error: err.message || 'Opslaan van notitie mislukt.' });
  }
});

// 12. Receptnotitie verwijderen
app.delete('/api/recipe-notes', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Je moet ingelogd zijn om notities te verwijderen.' });
  }

  const { recipe_id, recipe_url } = req.body || {};

  try {
    const databaseId = await resolveDatabaseOwnerId(req);
    await dbCall(deleteRecipeNote, {
      user_id: req.user.id,
      database_id: databaseId,
      recipe_id,
      recipe_url
    });
    return res.json({ message: 'Notitie verwijderd.' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    return res.status(400).json({ error: err.message || 'Verwijderen van notitie mislukt.' });
  }
});

// 13. Beschikbare databases (eigen + gedeeld)
app.get('/api/databases', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  try {
    const databases = await dbCall(listAccessibleDatabases, req.user.id);
    return res.json(databases);
  } catch (err) {
    return res.status(500).json({ error: 'Kon databases niet ophalen.' });
  }
});

// 14. Deelinstellingen van eigen database
app.get('/api/databases/shares', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  try {
    const databaseId = await resolveDatabaseOwnerId(req);
    const canManage = await dbCall(userCanManageDatabase, req.user.id, databaseId);
    if (!canManage) return res.status(403).json({ error: 'Je hebt geen beheerrechten voor deze database.' });
    const [members, invites] = await Promise.all([
      dbCall(listDatabaseMembers, databaseId),
      dbCall(listDatabaseInvites, databaseId)
    ]);
    return res.json({ members, invites });
  } catch (err) {
    return res.status(500).json({ error: 'Kon deelinstellingen niet ophalen.' });
  }
});

// 15. Nodig gebruiker uit via e-mail
app.post('/api/databases/invite', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'E-mailadres ontbreekt.' });

  try {
    const databaseId = await resolveDatabaseOwnerId(req);
    const canManage = await dbCall(userCanManageDatabase, req.user.id, databaseId);
    if (!canManage) return res.status(403).json({ error: 'Je hebt geen beheerrechten voor deze database.' });

    const result = await dbCall(inviteUserToDatabase, databaseId, req.user.id, email);
    return res.json({
      message: result.type === 'member'
        ? (result.already_had_access ? 'Gebruiker had al toegang.' : 'Gebruiker toegevoegd aan de gedeelde database.')
        : 'Uitnodiging opgeslagen. Zodra deze gebruiker registreert met dit e-mailadres, krijgt hij toegang.',
      result
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Uitnodigen mislukt.' });
  }
});

// 16. Toegang lid intrekken
app.delete('/api/databases/members/:memberUserId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  const memberUserId = Number(req.params.memberUserId);
  if (!Number.isInteger(memberUserId) || memberUserId <= 0) {
    return res.status(400).json({ error: 'Ongeldige gebruiker.' });
  }
  try {
    const databaseId = await resolveDatabaseOwnerId(req);
    const canManage = await dbCall(userCanManageDatabase, req.user.id, databaseId);
    if (!canManage) return res.status(403).json({ error: 'Je hebt geen beheerrechten voor deze database.' });
    await dbCall(revokeDatabaseMember, databaseId, memberUserId);
    return res.json({ message: 'Toegang ingetrokken.' });
  } catch (_err) {
    return res.status(500).json({ error: 'Intrekken mislukt.' });
  }
});

// 17. Openstaande uitnodiging intrekken
app.delete('/api/databases/invites/:inviteId', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Je moet ingelogd zijn.' });
  const inviteId = Number(req.params.inviteId);
  if (!Number.isInteger(inviteId) || inviteId <= 0) {
    return res.status(400).json({ error: 'Ongeldige uitnodiging.' });
  }
  try {
    const databaseId = await resolveDatabaseOwnerId(req);
    const canManage = await dbCall(userCanManageDatabase, req.user.id, databaseId);
    if (!canManage) return res.status(403).json({ error: 'Je hebt geen beheerrechten voor deze database.' });
    const changed = await dbCall(revokeDatabaseInvite, databaseId, inviteId);
    if (!changed) return res.status(404).json({ error: 'Uitnodiging niet gevonden.' });
    return res.json({ message: 'Uitnodiging ingetrokken.' });
  } catch (_err) {
    return res.status(500).json({ error: 'Intrekken mislukt.' });
  }
});
// ===========================================================================

app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
