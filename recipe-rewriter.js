// recipe-rewriter.js – de bereiding van een overgenomen recept in eigen
// woorden laten herschrijven door Claude.
//
// Een recept van een site of Instagram nemen we niet letterlijk over van de
// maker: de stappen worden herschreven, met dezelfde werkwijze, hoeveelheden,
// tijden en temperaturen. Daarna controleren we het resultaat zelf: is er een
// getal weggevallen of bijgekomen, is een ingrediënt veranderd, of staat er
// toch nog letterlijke tekst in, dan volgt één nieuwe poging met uitleg. Lukt
// het niet (of ontbreekt ANTHROPIC_API_KEY), dan geeft rewriteRecipe null en
// houdt de aanroeper de uitgelezen stappen.

const MODEL = 'claude-opus-5-5';
const MAX_STEPS = 40;
const MAX_ATTEMPTS = 2;
const DEFAULT_BUDGET_MS = 45000;
// Minder tijd over dan dit: geen nieuwe poging meer beginnen.
const MIN_ATTEMPT_MS = 8000;
const REQUEST_TIMEOUT_MS = 40000;

let cachedClient = null;

function isRewriteEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Alleen met een expliciete sleutel in de omgeving, zodat een lokale
// ontwikkelmachine niet ongemerkt via een ander account gaat rekenen.
function getClient() {
  if (!isRewriteEnabled()) return null;
  if (!cachedClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  }
  return cachedClient;
}

const SYSTEM_PROMPT = `Je herschrijft recepten voor Kookkeuze, een Nederlandse app waarin mensen recepten van receptensites en Instagram in hun eigen kookboek bewaren. Een recept nemen we nooit letterlijk over van de maker: jij schrijft de bereiding opnieuw, in je eigen woorden, zodat de tekst duidelijk anders is dan het origineel, terwijl het recept inhoudelijk precies hetzelfde blijft.

Je krijgt de titel, de ingrediënten en de bereidingsstappen.

Voor de stappen (steps):
- Zelfde werkwijze: dezelfde handelingen in dezelfde volgorde. Laat geen handeling weg en voeg geen handelingen, ingrediënten of tips toe die niet in het origineel staan.
- Neem elk getal over zoals het er staat, in cijfers: temperaturen, tijden, hoeveelheden en maten ("180 °C", "8-10 minuten", "2 el"). Reken niets om (dus niet "een half uur" voor "30 minuten" of andersom) en verzin geen nieuwe getallen.
- Gebruik een andere zinsbouw en woordkeus dan het origineel. Schrijf korte, duidelijke stappen in de gebiedende wijs ("Snijd de ui fijn."), zonder nummers, opsommingstekens, emoji of hashtags. Je mag stappen samenvoegen of opsplitsen als dat beter leest.
- Laat weg wat geen bereiding is: persoonlijke verhalen, reclame, oproepen om te volgen, te bewaren of te reageren, en voedingswaarden.
- Schrijf in dezelfde taal als het origineel.

Voor de ingrediënten (ingredients), alleen als daarom gevraagd wordt:
- Neem elke regel letterlijk en in dezelfde volgorde over; verander niets aan de tekst van een regel.
- De splitsing tussen ingrediënten en stappen is dan automatisch gemaakt en kan ernaast zitten. Staat er een bereidingsstap tussen de ingrediënten, laat die regel dan weg uit de ingrediënten en verwerk hem op de juiste plek in de stappen. Een regel die duidelijk geen ingrediënt is (reclame, een kooktijd, een voedingswaarde) laat je ook weg. Twijfel je, laat de regel dan staan.`;

function outputSchema(withIngredients) {
  const properties = { steps: { type: 'array', items: { type: 'string' } } };
  if (withIngredients) properties.ingredients = { type: 'array', items: { type: 'string' } };
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

function buildUserMessage(recipe, { fixIngredients, feedback }) {
  const parts = [];
  if (recipe.title) parts.push(`<titel>${recipe.title}</titel>`);
  parts.push(`<ingredienten>\n${recipe.ingredients.map(line => `- ${line}`).join('\n')}\n</ingredienten>`);
  parts.push(`<bereiding>\n${recipe.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n</bereiding>`);
  parts.push(fixIngredients
    ? 'De ingrediënten kloppen al; geef alleen de herschreven stappen terug.'
    : 'Ingrediënten en stappen zijn automatisch uit een Instagram-bericht gehaald. Geef de herschreven stappen en de (zo nodig opgeschoonde) ingrediënten terug.');
  if (feedback) parts.push(feedback);
  return parts.join('\n\n');
}

/* -------------------- Controle -------------------- */

const FRACTION_VALUES = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

function numberKey(value) {
  return String(Math.round(value * 100) / 100);
}

// Alle getallen in een tekst, gelijkgetrokken: "1/2", "½" en "0,5" zijn
// hetzelfde getal.
function extractNumbers(text) {
  const numbers = new Set();
  const rest = String(text || '')
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_m, a, b) => {
      if (Number(b)) numbers.add(numberKey(Number(a) / Number(b)));
      return ' ';
    })
    .replace(/[½¼¾⅓⅔⅛]/g, ch => {
      numbers.add(numberKey(FRACTION_VALUES[ch]));
      return ' ';
    });
  for (const m of rest.matchAll(/\d+(?:[.,]\d+)?/g)) {
    numbers.add(numberKey(Number(m[0].replace(',', '.'))));
  }
  return numbers;
}

function normalizeForCompare(text) {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function cleanRewrittenStep(step) {
  return String(step || '')
    .replace(/^\s*(?:(?:stap|step)\s*)?\d{1,2}\s*[.):-]\s+/i, '')
    .replace(/^[\s\-•*–]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Klopt het herschreven recept met het origineel? Geeft { ok, ingredients,
// steps } of { ok: false, reason, missing, invented }.
function validateRewrite(original, result, { fixIngredients = true } = {}) {
  if (!result || !Array.isArray(result.steps)) return { ok: false, reason: 'onleesbaar antwoord' };
  const steps = result.steps.map(cleanRewrittenStep).filter(Boolean);
  if (!steps.length) return { ok: false, reason: 'geen stappen' };
  if (steps.length > MAX_STEPS || steps.some(step => step.length > 1500)) {
    return { ok: false, reason: 'te veel of te lange stappen' };
  }

  let ingredients = original.ingredients;
  if (!fixIngredients) {
    if (!Array.isArray(result.ingredients)) return { ok: false, reason: 'geen ingrediënten' };
    const returned = new Set(result.ingredients.map(line => String(line || '').trim()).filter(Boolean));
    const known = new Set(original.ingredients);
    const changed = [...returned].filter(line => !known.has(line));
    if (changed.length) return { ok: false, reason: `ingrediënt aangepast: ${changed[0]}` };
    ingredients = original.ingredients.filter(line => returned.has(line));
    const dropped = original.ingredients.length - ingredients.length;
    if (original.ingredients.length && !ingredients.length) return { ok: false, reason: 'alle ingrediënten weg' };
    if (dropped > Math.max(2, Math.ceil(original.ingredients.length * 0.3))) {
      return { ok: false, reason: `${dropped} ingrediënten weggelaten` };
    }
  }

  // Geen getal kwijt (tijden, temperaturen, hoeveelheden) en geen verzonnen
  // getallen. Getallen uit de ingrediënten mogen in een stap terugkomen.
  const before = extractNumbers(original.steps.join(' '));
  const after = extractNumbers(steps.join(' '));
  const allowed = new Set([...before, ...extractNumbers(original.ingredients.join(' ')), ...extractNumbers(original.title)]);
  const missing = [...before].filter(n => !after.has(n));
  const invented = [...after].filter(n => !allowed.has(n));
  if (missing.length || invented.length) {
    return { ok: false, reason: 'getallen kloppen niet', missing, invented };
  }

  // Niet stiekem letterlijk overgenomen.
  const originalSteps = new Set(original.steps.map(normalizeForCompare));
  const copied = steps.filter(step => step.length > 30 && originalSteps.has(normalizeForCompare(step))).length;
  if (copied && copied >= Math.ceil(steps.length / 3)) {
    return { ok: false, reason: `${copied} stap(pen) letterlijk overgenomen` };
  }

  return { ok: true, ingredients, steps };
}

function feedbackFor(check) {
  const lines = ['Je vorige versie werd afgekeurd.'];
  if (check.missing && check.missing.length) {
    lines.push(`Deze getallen uit de bereiding ontbraken: ${check.missing.join(', ')}. Neem ze exact over.`);
  }
  if (check.invented && check.invented.length) {
    lines.push(`Deze getallen staan niet in het origineel: ${check.invented.join(', ')}. Laat ze weg of gebruik de getallen uit het origineel.`);
  }
  if (!check.missing && !check.invented) lines.push(`Reden: ${check.reason}.`);
  return lines.join(' ');
}

/* -------------------- Aanroep -------------------- */

// Server-side fallback: weigert het model om veiligheidsredenen, dan neemt de
// API zelf een ander model. Kent het account die bèta niet (400), dan zonder.
let useServerFallback = true;

async function requestRewrite(client, recipe, { fixIngredients, feedback, timeoutMs }) {
  const params = {
    model: MODEL,
    max_tokens: 8000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: outputSchema(!fixIngredients) }
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(recipe, { fixIngredients, feedback }) }]
  };
  const options = { timeout: Math.min(timeoutMs, REQUEST_TIMEOUT_MS) };

  let response;
  if (useServerFallback) {
    try {
      response = await client.beta.messages.create(
        { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        options
      );
    } catch (err) {
      if (err && err.status === 400 && /fallback/i.test(String(err.message))) {
        console.warn('⚠️ server-side fallback niet beschikbaar, herschrijven gaat verder zonder');
        useServerFallback = false;
      } else {
        throw err;
      }
    }
  }
  if (!response) response = await client.messages.create(params, options);

  // Geweigerd of afgekapt: niets bruikbaars.
  if (response.stop_reason !== 'end_turn') return { failed: `stop_reason ${response.stop_reason}` };
  const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('');
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    return { failed: 'geen geldige JSON' };
  }
}

// recipe: { title, ingredients: string[], steps: string[] }
// options.fixIngredients: true als de ingrediënten vaststaan (receptsite);
//   false als ze uit een caption komen en er een regel mag verhuizen.
// Geeft { ingredients, steps } terug, of null als herschrijven niet lukte.
async function rewriteRecipe(recipe, options = {}) {
  const {
    fixIngredients = true,
    budgetMs = DEFAULT_BUDGET_MS,
    client = getClient()
  } = options;
  if (!client || !recipe || !Array.isArray(recipe.steps) || !recipe.steps.length) return null;

  const original = {
    title: String(recipe.title || '').trim(),
    ingredients: (recipe.ingredients || []).map(line => String(line).trim()).filter(Boolean),
    steps: recipe.steps.map(step => String(step).trim()).filter(Boolean)
  };
  const deadline = Date.now() + budgetMs;
  let feedback = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) break;
    let answer;
    try {
      answer = await requestRewrite(client, original, { fixIngredients, feedback, timeoutMs: remaining });
    } catch (err) {
      // Netwerk, sleutel of limiet: niet blijven proberen.
      console.warn(`⚠️ recept herschrijven mislukt (${err.status || err.name}): ${err.message}`);
      return null;
    }
    if (answer.failed) {
      console.warn(`⚠️ recept herschrijven: ${answer.failed} (poging ${attempt})`);
      feedback = '';
      continue;
    }
    const check = validateRewrite(original, answer.parsed, { fixIngredients });
    if (check.ok) return { ingredients: check.ingredients, steps: check.steps };
    console.warn(`⚠️ herschreven recept afgekeurd (poging ${attempt}): ${check.reason}` +
      (check.missing && check.missing.length ? ` – ontbreekt ${check.missing.join(', ')}` : '') +
      (check.invented && check.invented.length ? ` – verzonnen ${check.invented.join(', ')}` : ''));
    feedback = feedbackFor(check);
  }
  return null;
}

module.exports = {
  MODEL,
  isRewriteEnabled,
  rewriteRecipe,
  validateRewrite,
  extractNumbers,
  buildUserMessage
};
