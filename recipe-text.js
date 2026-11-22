// recipe-text.js – kleine tekstfuncties voor receptgegevens (ingrediëntregels,
// HTML-entities), gedeeld door server.js en recipe-caption.js. Los bestand
// zodat ze zonder server of database te testen zijn.

function decodeHtmlEntities(value) {
  if (!value) return '';

  const namedEntities = {
    amp: '&',
    apos: "'",
    quot: '"',
    nbsp: ' ',
    lt: '<',
    gt: '>',
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    ndash: '-',
    mdash: '-',
    hellip: '...',
    frac14: '1/4',
    frac12: '1/2',
    frac34: '3/4'
  };

  return String(value)
    .replace(/&#(\d+);/g, (_match, dec) => {
      const codePoint = Number(dec);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const codePoint = parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name.toLowerCase()] ?? match);
}

function normalizeIngredientText(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    // JSON-LD bevat soms HTML-entities (&amp;, &frac12;) — die decoderen we.
    return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim() || null;
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

// Filter regels die duidelijk geen ingrediënt zijn: JS/Vue-template-resten,
// HTML-brokken, knoplabels of regels zonder letters.
function isPlausibleIngredient(text) {
  if (!text) return false;
  if (text.length < 2 || text.length > 140) return false;
  if (!/[a-zA-Zà-ÿ]/.test(text)) return false;
  if (/[{}<>]|:class|:key|===|=>|\$\{|\|\||&&|@click|v-if|v-for|function\s*\(|aria-|data-v-/.test(text)) return false;
  const trimmed = text.trim();
  if (/^ingredi[eë]nten?\b\s*[:]/i.test(trimmed)) return false;
  if (/^(ingredi[eë]nten?|porties?|minder porties|meer porties|voor|aantal personen|personen|persoon|stuks?|servings?)$/i.test(trimmed)) return false;
  return true;
}

function dedupeIngredients(items) {
  const seen = new Set();

  return items
    .filter(Boolean)
    .filter(isPlausibleIngredient)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}

module.exports = {
  decodeHtmlEntities,
  normalizeIngredientText,
  isPlausibleIngredient,
  dedupeIngredients
};
