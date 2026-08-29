const fs = require('fs');
const path = require('path');

const DEFAULT_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; KookkeuzeCrawler/1.0; +https://www.kookkeuze.nl)',
  'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

const INDEX_DIR = path.join(__dirname, 'data');
const INDEX_FILE = path.join(INDEX_DIR, 'internet-recipes-index.json');
const CRAWLER_INDEX_VERSION = 1;
const DEFAULT_SITEMAP_CANDIDATES = [
  '/robots.txt',
  '/sitemap_index.xml',
  '/sitemap.xml',
  '/post-sitemap.xml',
  '/posts-sitemap.xml',
  '/recipe-sitemap.xml',
  '/recipes-sitemap.xml',
  '/recept-sitemap.xml',
  '/recepten-sitemap.xml',
  '/page-sitemap.xml'
];
const DEFAULT_LISTING_PAGE_CANDIDATES = [
  '/',
  '/recepten',
  '/recepten/',
  '/recept',
  '/recept/',
  '/recipe',
  '/recipes'
];

const INTERNET_CRAWLER_SITES = [
  {
    key: 'eiwitchef',
    source: 'Eiwitchef',
    baseUrl: 'https://www.eiwitchef.nl',
    allowedHosts: ['eiwitchef.nl', 'www.eiwitchef.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/blog'],
    maxRecipeUrls: 200
  },
  {
    key: 'lekkerensimpel',
    source: 'Lekker en Simpel',
    baseUrl: 'https://www.lekkerensimpel.com',
    allowedHosts: ['lekkerensimpel.com', 'www.lekkerensimpel.com'],
    recipePathIncludes: ['/recept', '/recepten'],
    // Recepten staan hier op de root (/pulled-chicken-wraps/) in plaats van
    // onder /recept, dus accepteren we paden van een enkel segment. Omdat daar
    // ook blogposts en winacties tussen zitten, moet de pagina wel een echt
    // schema.org-recept bevatten voordat hij in de index belandt.
    allowRootRecipePaths: true,
    requireRecipeSchema: true,
    listingPageCandidates: ['/recepten', '/familie-recepten', '/snelle-recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'leukerecepten',
    source: 'LeukeRecepten',
    baseUrl: 'https://www.leukerecepten.nl',
    allowedHosts: ['leukerecepten.nl', 'www.leukerecepten.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/categorie/hoofdgerecht', '/categorie/pasta'],
    maxRecipeUrls: 250
  },
  {
    key: '24kitchen',
    source: '24Kitchen',
    baseUrl: 'https://www.24kitchen.nl',
    allowedHosts: ['24kitchen.nl', 'www.24kitchen.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/html-sitemap', '/thema'],
    maxRecipeUrls: 250
  },
  {
    key: 'smulweb',
    source: 'Smulweb',
    baseUrl: 'https://www.smulweb.nl',
    allowedHosts: ['smulweb.nl', 'www.smulweb.nl', 'jumbo.com', 'www.jumbo.com'],
    recipePathIncludes: ['/recept', '/recepten', '/smulweb/'],
    listingPageCandidates: ['https://www.jumbo.com/recepten', 'https://www.jumbo.com/smulweb'],
    maxRecipeUrls: 250
  },
  {
    key: 'uitpaulineskeuken',
    source: 'Uit Paulines Keuken',
    baseUrl: 'https://uitpaulineskeuken.nl',
    allowedHosts: ['uitpaulineskeuken.nl', 'www.uitpaulineskeuken.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/recept'],
    maxRecipeUrls: 250
  },
  {
    key: 'chickslovefood',
    source: 'Chickslovefood',
    baseUrl: 'https://chickslovefood.com',
    allowedHosts: ['chickslovefood.com', 'www.chickslovefood.com'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/category/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'foodblog',
    source: 'Foodblog.nl',
    baseUrl: 'https://www.foodblog.nl',
    allowedHosts: ['foodblog.nl', 'www.foodblog.nl'],
    recipePathIncludes: ['/recept', '/recepten', '/recipe'],
    listingPageCandidates: ['/recepten', '/category/recepten', '/category/avondeten'],
    maxRecipeUrls: 200
  },
  {
    key: 'culy',
    source: 'Culy',
    baseUrl: 'https://www.culy.nl',
    allowedHosts: ['culy.nl', 'www.culy.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/category/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'rutgerbakt',
    source: 'Rutger Bakt',
    baseUrl: 'https://rutgerbakt.nl',
    allowedHosts: ['rutgerbakt.nl', 'www.rutgerbakt.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/koek-recepten', '/taart-recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'brendakookt',
    source: 'Brenda Kookt',
    baseUrl: 'https://brendakookt.nl',
    allowedHosts: ['brendakookt.nl', 'www.brendakookt.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/hoofdgerechten'],
    maxRecipeUrls: 250
  },
  {
    key: 'francescakookt',
    source: 'Francesca Kookt',
    baseUrl: 'https://www.francescakookt.nl',
    allowedHosts: ['francescakookt.nl', 'www.francescakookt.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recept', '/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'miljuschka',
    source: 'Miljuschka',
    baseUrl: 'https://miljuschka.nl',
    allowedHosts: ['miljuschka.nl', 'www.miljuschka.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/category/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'keukenliefde',
    source: 'Keukenliefde',
    baseUrl: 'https://www.keukenliefde.nl',
    allowedHosts: ['keukenliefde.nl', 'www.keukenliefde.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/hoofdgerecht'],
    maxRecipeUrls: 250
  },
  {
    key: 'eefkooktzo',
    source: 'Eef Kookt Zo',
    baseUrl: 'https://www.eefkooktzo.nl',
    allowedHosts: ['eefkooktzo.nl', 'www.eefkooktzo.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/category/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'familieoverdekook',
    source: 'Familie over de Kook',
    baseUrl: 'https://familieoverdekook.nl',
    allowedHosts: ['familieoverdekook.nl', 'www.familieoverdekook.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/category/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'kookmutsjes',
    source: 'Kookmutsjes',
    baseUrl: 'https://kookmutsjes.com',
    allowedHosts: ['kookmutsjes.com', 'www.kookmutsjes.com'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten', '/category/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'jumbo',
    source: 'Jumbo Recepten',
    baseUrl: 'https://www.jumbo.com/recepten',
    allowedHosts: ['jumbo.com', 'www.jumbo.com'],
    recipePathIncludes: ['/recepten/'],
    listingPageCandidates: ['/recepten'],
    maxRecipeUrls: 250
  },
  {
    key: 'plus',
    source: 'Plus',
    baseUrl: 'https://www.plus.nl/recepten',
    allowedHosts: ['plus.nl', 'www.plus.nl'],
    recipePathIncludes: ['/recept', '/recepten'],
    listingPageCandidates: ['/recepten'],
    maxRecipeUrls: 250
  }
];

const DEFAULT_RECIPE_PATH_EXCLUDES = [
  '/tag/',
  '/tags/',
  '/categorie/',
  '/categorieen/',
  '/category/',
  '/archive/',
  '/author/',
  '/auteur/',
  '/zoeken',
  '/search',
  '/page/',
  '/video/',
  '/videos/',
  '/nieuws/',
  '/artikel/',
  '/blog/',
  // Verzamel-/menupagina's: nooit als los recept aanbieden.
  '/weekmenu',
  '/weekmenus',
  '/maandmenu',
  '/collectie',
  '/collecties',
  '/overzicht',
  '/inspiratie',
  '/contact',
  '/about',
  '/privacy',
  '/voorwaarden'
];

function getEmptyCrawlerIndex() {
  return {
    version: CRAWLER_INDEX_VERSION,
    generatedAt: null,
    totalRecipes: 0,
    sites: [],
    recipes: []
  };
}

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    parsed.hash = '';
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function slugToTitle(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (!lastSegment) return 'Internet recept';
    return lastSegment
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b(recept|recipe)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/\b\w/g, char => char.toUpperCase()) || 'Internet recept';
  } catch {
    return 'Internet recept';
  }
}

// Woorden die duiden op een verzamel-/lijstpagina ("10 beste tortilla recepten")
// in plaats van één enkel recept. Bewust het meervoud, zodat losse recepten
// ("Tortilla met kip") niet worden geraakt. De naamwoorden mogen ook aan een
// ander woord vastzitten, zodat "12 pastarecepten" en "5 ovengerechten" ook
// worden herkend.
const ROUNDUP_NOUN_BASE = '(?:recepten|gerechten|varianten|variaties|idee[eë]n|manieren|klassiekers|toppers|favorieten)';
const ROUNDUP_NOUNS = `[a-zà-ÿ]*${ROUNDUP_NOUN_BASE}`;
const ROUNDUP_SUPERLATIVES = '(?:aller)?(?:beste|lekkerste|makkelijkste|snelste|populairste|favoriete|heerlijkste|leukste|mooiste|gezondste|simpelste|handigste|ultieme|top)';
const ROUNDUP_DETERMINERS = '(?:onze|mijn|alle|allerlei|diverse|verschillende)';
// Vulling tussen telwoord/bijvoeglijk naamwoord en het meervoud. Bewust
// begrensd, zodat een getal vooraan de titel niet toevallig gekoppeld wordt aan
// een meervoud helemaal achteraan.
const ROUNDUP_FILLER = "[a-zà-ÿ0-9\\s&'’,:+.-]{0,32}?";

const ROUNDUP_NUMBERED_RE = new RegExp(`\\b\\d{1,3}\\s*(?:x|keer)?\\b${ROUNDUP_FILLER}\\b${ROUNDUP_NOUNS}\\b`, 'i');
const ROUNDUP_SUPERLATIVE_RE = new RegExp(`\\b${ROUNDUP_SUPERLATIVES}\\b${ROUNDUP_FILLER}\\b${ROUNDUP_NOUNS}\\b`, 'i');
const ROUNDUP_DETERMINER_RE = new RegExp(`\\b${ROUNDUP_DETERMINERS}\\b${ROUNDUP_FILLER}\\b${ROUNDUP_NOUNS}\\b`, 'i');
const ROUNDUP_TOP_RE = /\btop[\s-]?\d{1,3}\b/i;
// "5x pasta", "3 keer anders": een telling in de titel is vrijwel altijd een
// opsomming. Maten ("20 x 30 cm", "2 x 250 gram") vallen er bewust buiten.
const ROUNDUP_COUNT_RE = /\b\d{1,3}\s*(?:x|keer)\b(?!\s*\d)(?!\s*(?:cm|mm|centimeter|gram|gr|kg|ml|cl|dl|liter|minuten|min|uur|personen)\b)/i;
// Meervoud gevolgd door een voorzetsel: "recepten met kip", "gerechten voor de bbq".
const ROUNDUP_PHRASE_RE = new RegExp(`\\b${ROUNDUP_NOUNS}\\b\\s+(?:met|voor|om|uit|van|die|zonder|op|in|bij)\\b`, 'i');
// Titel die eindigt op een meervoud ("Pastarecepten", "Snelle ovengerechten").
const ROUNDUP_TRAILING_NOUN_RE = new RegExp(`\\b${ROUNDUP_NOUNS}\\s*$`, 'i');
// Titels die met een telwoord + meervoud beginnen en daarna een voorzetsel
// krijgen ("24 soepen voor de winter") zijn een opsomming. Maten en
// bereidingstijden ("5 minuten mugcake", "1 pans pasta") vallen erbuiten,
// net als gerechtnamen met een telwoord ("4 kazen pasta").
const ROUNDUP_UNIT_WORDS = '(?:uur|uurs|uren|minuten|minuut|min|seconden|sec|pans|pan|laags|lagen|ingredi[eë]nten|stappen|personen|porties|stuks|dagen|weken|graden|gram|kilo|liter|ml|cl|dl|cm|mm)';
const ROUNDUP_LEADING_COUNT_RE = new RegExp(`^\\s*\\d{1,3}\\s+(?!${ROUNDUP_UNIT_WORDS}\\b)[a-zà-ÿ]{3,}(?:en|s)\\s+(?:voor|met|om|die|dat|uit|van|op|in|bij|waar|zonder|op een rij)\\b`, 'i');
// "7 verschillende wraps", "3 versies van ...": expliciet meerdere uitvoeringen.
const ROUNDUP_VARIETY_RE = /\b\d{1,3}\s+(?:verschillende|versies|uitvoeringen)\b/i;
// Trefwoorden die alleen op verzamel-/menupagina's voorkomen.
const ROUNDUP_KEYWORD_RE = /\b(?:weekmenu'?s?|maandmenu|weekplanner|menu van de week|verzameling|verzamelpost|collectie|overzicht|inspiratielijst|inspiratie|round-?up|receptenbundels?|bundel|lijstje|kookboek)\b/i;

const ROUNDUP_PATTERNS = [
  ROUNDUP_NUMBERED_RE,
  ROUNDUP_SUPERLATIVE_RE,
  ROUNDUP_DETERMINER_RE,
  ROUNDUP_TOP_RE,
  ROUNDUP_COUNT_RE,
  ROUNDUP_PHRASE_RE,
  ROUNDUP_TRAILING_NOUN_RE,
  ROUNDUP_LEADING_COUNT_RE,
  ROUNDUP_VARIETY_RE,
  ROUNDUP_KEYWORD_RE
];

function textLooksLikeRoundup(rawText) {
  const text = String(rawText || '').toLowerCase().trim();
  if (!text) return false;
  return ROUNDUP_PATTERNS.some(pattern => pattern.test(text));
}

function lastUrlSegmentText(rawUrl) {
  try {
    const segment = decodeURIComponent(new URL(rawUrl).pathname).split('/').filter(Boolean).pop() || '';
    return segment.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  } catch {
    return '';
  }
}

// Paginatitels dragen bijna altijd de sitenaam mee ("Griekse wraps met feta -
// Leuke Recepten"). Die staart zou de meervoudsregels hierboven ten onrechte
// laten aanslaan, dus knippen we hem eraf zodra hij overeenkomt met het domein.
function stripSiteNameFromTitle(rawTitle, rawUrl) {
  const title = String(rawTitle || '').trim();
  if (!title) return '';

  let hostKey = '';
  try {
    hostKey = new URL(rawUrl).hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/\.[a-z.]+$/, '')
      .replace(/[^a-z0-9]/g, '');
  } catch {
    hostKey = '';
  }
  if (!hostKey) return title;

  const parts = title.split(/\s+[|·»–—]\s+|\s+-\s+/).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return title;

  const kept = parts.filter(part => {
    const key = part.toLowerCase().replace(/[^a-z0-9]/g, '');
    return key && !hostKey.includes(key) && !key.includes(hostKey);
  });
  return (kept.length ? kept : parts).join(' - ');
}

// Vanaf drie verschillende recept-objecten in één pagina gaat het onmiskenbaar
// om een verzamelartikel; één of twee komt ook voor bij een enkel recept met een
// variant of een "ook lekker"-blok.
const RECIPE_BUNDLE_SCHEMA_THRESHOLD = 3;

function looksLikeRecipeBundlePayload(payloadLike) {
  const count = Number(payloadLike?.recipe_schema_count);
  return Number.isFinite(count) && count >= RECIPE_BUNDLE_SCHEMA_THRESHOLD;
}

// Herkent verzamel-/lijstartikelen op basis van titel, de laatste URL-segmenten
// en het aantal recepten in de pagina zelf, zodat "de 10 beste tortilla recepten"
// nooit als los recept wordt aangeboden.
function looksLikeRecipeRoundup(recipeLike) {
  if (!recipeLike) return false;
  if (looksLikeRecipeBundlePayload(recipeLike)) return true;
  if (textLooksLikeRoundup(stripSiteNameFromTitle(recipeLike.title, recipeLike.url))) return true;
  return textLooksLikeRoundup(lastUrlSegmentText(recipeLike.url));
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractLocsFromXml(xml) {
  return [...String(xml || '').matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map(match => decodeXmlEntities(match[1]).trim())
    .filter(Boolean);
}

function parseRobotsSitemaps(robotsText, baseUrl) {
  const lines = String(robotsText || '').split(/\r?\n/);
  const urls = [];
  for (const line of lines) {
    const match = line.match(/^\s*Sitemap:\s*(\S+)/i);
    if (!match) continue;
    try {
      urls.push(new URL(match[1], baseUrl).toString());
    } catch {
      // ignore invalid sitemap lines
    }
  }
  return [...new Set(urls)];
}

function looksLikeXmlDocument(text) {
  return /<(urlset|sitemapindex)\b/i.test(String(text || ''));
}

function isXmlLikeUrl(rawUrl) {
  return /\.xml(?:$|[?#])/i.test(String(rawUrl || ''));
}

const THROTTLED_STATUS_CODES = new Set([429, 503]);
const THROTTLE_RETRY_DELAYS_MS = [1500, 4000];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchText(url, headers = {}, acceptHeader = 'application/xml,text/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5') {
  // Sommige sites knijpen af zodra er een paar verzoeken snel achter elkaar
  // binnenkomen. Even wachten en opnieuw proberen scheelt een gemiste sitemap.
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        ...DEFAULT_FETCH_HEADERS,
        Accept: acceptHeader,
        ...headers
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });

    if (response.ok) return response.text();

    if (THROTTLED_STATUS_CODES.has(response.status) && attempt < THROTTLE_RETRY_DELAYS_MS.length) {
      await delay(THROTTLE_RETRY_DELAYS_MS[attempt]);
      continue;
    }

    throw new Error(`HTTP ${response.status}`);
  }
}

function getSitemapCandidates(site) {
  const origin = new URL(site.baseUrl).origin;
  const custom = Array.isArray(site.sitemapCandidates) ? site.sitemapCandidates : [];
  const all = [...DEFAULT_SITEMAP_CANDIDATES, ...custom];
  return [...new Set(all.map(item => {
    try {
      return new URL(item, origin).toString();
    } catch {
      return null;
    }
  }).filter(Boolean))];
}

function getListingPageCandidates(site) {
  const origin = new URL(site.baseUrl).origin;
  const custom = Array.isArray(site.listingPageCandidates) ? site.listingPageCandidates : [];
  const all = [...DEFAULT_LISTING_PAGE_CANDIDATES, ...custom, site.baseUrl];
  return [...new Set(all.map(item => {
    try {
      return new URL(item, origin).toString();
    } catch {
      return null;
    }
  }).filter(Boolean).map(normalizeUrl).filter(Boolean))];
}

function isAllowedHost(site, hostname) {
  const normalizedHost = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  const allowedHosts = Array.isArray(site.allowedHosts) ? site.allowedHosts : [];
  return allowedHosts.some(host => normalizedHost === String(host).replace(/^www\./i, '').toLowerCase());
}

function isRecipeUrlForSite(site, rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!isAllowedHost(site, parsed.hostname)) return false;

  const pathname = parsed.pathname.toLowerCase();
  if (!pathname || pathname === '/' || /\.(jpg|jpeg|png|gif|webp|svg|pdf|xml)$/i.test(pathname)) {
    return false;
  }

  if (DEFAULT_RECIPE_PATH_EXCLUDES.some(part => pathname.includes(part))) return false;
  if (Array.isArray(site.recipePathExcludes) && site.recipePathExcludes.some(part => pathname.includes(String(part).toLowerCase()))) {
    return false;
  }

  // Verzamel-/lijstpagina's ("10-beste-tortilla-recepten") uitsluiten.
  if (looksLikeRecipeRoundup({ url: rawUrl })) return false;

  // Sites die hun recepten op de root zetten: elk pad van een enkel segment
  // mag mee. De schema.org-controle bij het indexeren zeeft er niet-recepten uit.
  if (site.allowRootRecipePaths && /^\/[^/]+\/?$/.test(pathname)) return true;

  const includeParts = Array.isArray(site.recipePathIncludes) && site.recipePathIncludes.length
    ? site.recipePathIncludes
    : ['/recept', '/recepten', '/recipe', '/recipes', '/bekijk-recept'];

  const includesMatch = includeParts.some(part => pathname.includes(String(part).toLowerCase()));
  if (includesMatch) return true;

  return /(?:^|[-/])(recept|recipe)(?:$|[-/])/.test(pathname);
}

function isListingUrlForSite(site, rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!isAllowedHost(site, parsed.hostname)) return false;
  if (isXmlLikeUrl(parsed.pathname)) return false;
  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i.test(parsed.pathname)) return false;
  if (isRecipeUrlForSite(site, rawUrl)) return false;

  const pathname = parsed.pathname.toLowerCase();
  const listingHints = [
    '/recept',
    '/recepten',
    '/recipe',
    '/recipes',
    '/thema',
    '/categorie',
    '/category',
    '/hoofdgerecht',
    '/pasta',
    '/bakken',
    '/salade',
    '/soep',
    '/diner',
    '/avondeten'
  ];

  if (!pathname || pathname === '/') return true;
  if (listingHints.some(part => pathname.includes(part))) return true;
  if (parsed.search && /search|s=|recept/i.test(parsed.search)) return true;
  return false;
}

function extractHrefLinksFromHtml(html, baseUrl) {
  const links = [];
  for (const match of String(html || '').matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const href = match[1].trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }
    try {
      const absolute = normalizeUrl(new URL(href, baseUrl).toString());
      if (absolute) links.push(absolute);
    } catch {
      // ignore invalid hrefs
    }
  }
  return [...new Set(links)];
}

async function collectRecipeUrlsFromListingPages(site, log, existingRecipeUrls = []) {
  const queue = [...getListingPageCandidates(site)];
  const visitedPages = new Set();
  const recipeUrls = new Set(existingRecipeUrls.map(normalizeUrl).filter(Boolean));
  const maxPages = Number(site.maxListingPages || 25);
  const maxRecipeUrls = Number(site.maxRecipeUrls || 250);

  while (queue.length > 0 && visitedPages.size < maxPages && recipeUrls.size < maxRecipeUrls) {
    const pageUrl = queue.shift();
    if (!pageUrl || visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);

    let html;
    try {
      html = await fetchText(pageUrl, {}, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
    } catch (_err) {
      continue;
    }

    const links = extractHrefLinksFromHtml(html, pageUrl);
    for (const link of links) {
      if (isRecipeUrlForSite(site, link)) {
        recipeUrls.add(link);
        if (recipeUrls.size >= maxRecipeUrls) break;
        continue;
      }

      if (isListingUrlForSite(site, link) && !visitedPages.has(link) && !queue.includes(link)) {
        queue.push(link);
      }
    }
  }

  if (!visitedPages.size) {
    log(`geen listingpagina's bruikbaar voor ${site.source}`);
  }

  return {
    listingPagesVisited: visitedPages.size,
    recipeUrls: [...recipeUrls]
  };
}

async function discoverSiteSitemaps(site, log) {
  const origin = new URL(site.baseUrl).origin;
  const candidateUrls = new Set(getSitemapCandidates(site));

  try {
    const robotsUrl = new URL('/robots.txt', origin).toString();
    const robotsText = await fetchText(robotsUrl, {}, 'text/plain,*/*;q=0.5');
    parseRobotsSitemaps(robotsText, origin).forEach(url => candidateUrls.add(url));
  } catch (_err) {
    log(`robots.txt niet bruikbaar voor ${site.source}`);
  }

  const validSitemaps = new Map();
  for (const sitemapUrl of candidateUrls) {
    if (isXmlLikeUrl(sitemapUrl) && !validSitemaps.has(sitemapUrl)) {
      try {
        const xml = await fetchText(sitemapUrl);
        if (looksLikeXmlDocument(xml)) {
          validSitemaps.set(sitemapUrl, xml);
          // Een sitemap-index verwijst al naar alle andere sitemaps, dus verder
          // proberen levert alleen extra verzoeken op (en soms een 429).
          if (/<sitemapindex\b/i.test(xml)) break;
        }
      } catch (_err) {
        // negeer niet-bestaande sitemaps
      }
    }
  }

  return validSitemaps;
}

async function collectRecipeUrlsForSite(site, log) {
  // discoverSiteSitemaps geeft de al opgehaalde XML mee, zodat we die hieronder
  // niet nog een keer hoeven op te halen.
  const discovered = await discoverSiteSitemaps(site, log);
  const sitemapXmlCache = new Map(discovered);
  const sitemapUrls = [...discovered.keys()];
  const queue = [...sitemapUrls];
  const visitedSitemaps = new Set();
  const recipeUrls = new Set();
  const maxSitemaps = Number(site.maxSitemaps || 80);
  const maxRecipeUrls = Number(site.maxRecipeUrls || 250);

  while (queue.length > 0 && visitedSitemaps.size < maxSitemaps && recipeUrls.size < maxRecipeUrls) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    let xml = sitemapXmlCache.get(sitemapUrl);
    if (xml === undefined) {
      try {
        xml = await fetchText(sitemapUrl);
      } catch (_err) {
        continue;
      }
    } else {
      sitemapXmlCache.delete(sitemapUrl);
    }

    const locs = extractLocsFromXml(xml);
    const childSitemaps = [];
    for (const loc of locs) {
      const normalized = normalizeUrl(loc);
      if (!normalized) continue;

      if (isXmlLikeUrl(normalized)) {
        if (!visitedSitemaps.has(normalized)) childSitemaps.push(normalized);
        continue;
      }

      if (isRecipeUrlForSite(site, normalized)) {
        recipeUrls.add(normalized);
        if (recipeUrls.size >= maxRecipeUrls) break;
      }
    }

    // Recepten staan in de post-/receptsitemaps; page-sitemap.xml bevat vooral
    // categoriepagina's ("/salades", "/borrelhapjes"). Die eerst behandelen zou
    // maxRecipeUrls vullen met overzichtspagina's. Binnen elke groep beginnen we
    // bij de laatste chunk, want een sitemap-index zet de oudste vooraan.
    const isPostSitemap = url => /post|recept|recipe/i.test(url);
    const preferred = childSitemaps.filter(isPostSitemap).reverse();
    const others = childSitemaps.filter(url => !isPostSitemap(url)).reverse();
    queue.unshift(...preferred, ...others);
  }

  const htmlFallback = await collectRecipeUrlsFromListingPages(site, log, [...recipeUrls]);
  htmlFallback.recipeUrls.forEach(url => {
    if (recipeUrls.size < maxRecipeUrls) recipeUrls.add(url);
  });

  return {
    sitemapUrls,
    listingPagesVisited: htmlFallback.listingPagesVisited,
    recipeUrls: [...recipeUrls]
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const safeLimit = Math.max(1, Math.min(limit || 1, items.length || 1));
  await Promise.all(Array.from({ length: safeLimit }, () => runner()));
  return results;
}

function buildRecipeEntry(site, recipeUrl, payload) {
  return {
    title: payload?.title || slugToTitle(recipeUrl),
    url: recipeUrl,
    source: site.source,
    crawler_site_key: site.key,
    dish_type: payload?.dish_type || null,
    meal_category: payload?.meal_category || null,
    meal_type: payload?.meal_type || null,
    time_required: payload?.time_required || null,
    calories: payload?.calories ?? null,
    ingredients_preview: Array.isArray(payload?.ingredients)
      ? payload.ingredients.filter(Boolean).slice(0, 6)
      : [],
    crawled_at: new Date().toISOString()
  };
}

async function ensureIndexDir() {
  await fs.promises.mkdir(INDEX_DIR, { recursive: true });
}

async function saveInternetRecipeIndex(index) {
  await ensureIndexDir();
  await fs.promises.writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function loadInternetRecipeIndexSync() {
  try {
    if (!fs.existsSync(INDEX_FILE)) return getEmptyCrawlerIndex();
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return getEmptyCrawlerIndex();
    return {
      ...getEmptyCrawlerIndex(),
      ...parsed,
      recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
      sites: Array.isArray(parsed.sites) ? parsed.sites : []
    };
  } catch {
    return getEmptyCrawlerIndex();
  }
}

async function crawlInternetRecipeIndex({ fetchRecipePayload, log = () => {} }) {
  const allRecipes = [];
  const seenUrls = new Set();
  const siteSummaries = [];

  for (const site of INTERNET_CRAWLER_SITES) {
    const summary = {
      key: site.key,
      source: site.source,
      baseUrl: site.baseUrl,
      sitemapCount: 0,
      listingPagesVisited: 0,
      discoveredRecipeUrls: 0,
      indexedRecipes: 0,
      failedRecipes: 0,
      errors: []
    };

    log(`Start crawl voor ${site.source}`);

    try {
      const { sitemapUrls, listingPagesVisited, recipeUrls } = await collectRecipeUrlsForSite(site, log);
      summary.sitemapCount = sitemapUrls.length;
      summary.listingPagesVisited = listingPagesVisited;
      summary.discoveredRecipeUrls = recipeUrls.length;

      const entries = await mapWithConcurrency(recipeUrls, Number(site.fetchConcurrency || 3), async (recipeUrl) => {
        try {
          const payload = await fetchRecipePayload(new URL(recipeUrl));
          if (!payload || payload.error) {
            summary.failedRecipes += 1;
            return null;
          }

          const normalizedUrl = normalizeUrl(recipeUrl);
          if (!normalizedUrl || seenUrls.has(normalizedUrl)) return null;

          // Sites zonder receptpad in de URL: alleen pagina's met een echt
          // schema.org-recept tellen mee, anders glippen blogposts erdoorheen.
          if (site.requireRecipeSchema && !Number(payload?.recipe_schema_count)) {
            summary.failedRecipes += 1;
            return null;
          }

          // Titel of paginastructuur kan pas na het ophalen verraden dat het om
          // een verzamelartikel gaat.
          if (looksLikeRecipeRoundup({
            title: payload?.title,
            url: normalizedUrl,
            recipe_schema_count: payload?.recipe_schema_count
          })) {
            summary.failedRecipes += 1;
            return null;
          }

          seenUrls.add(normalizedUrl);
          summary.indexedRecipes += 1;
          return buildRecipeEntry(site, normalizedUrl, payload);
        } catch (err) {
          summary.failedRecipes += 1;
          summary.errors.push(`${recipeUrl}: ${err.message}`);
          return null;
        }
      });

      entries.filter(Boolean).forEach(entry => allRecipes.push(entry));
    } catch (err) {
      summary.errors.push(err.message || 'Onbekende crawl-fout');
    }

    if (summary.errors.length > 5) {
      summary.errors = summary.errors.slice(0, 5);
      summary.errors.push('Meer fouten afgekapt...');
    }

    siteSummaries.push(summary);
    log(`Klaar met ${site.source}: ${summary.indexedRecipes} recepten`);
  }

  const index = {
    version: CRAWLER_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    totalRecipes: allRecipes.length,
    sites: siteSummaries,
    recipes: allRecipes
  };

  await saveInternetRecipeIndex(index);
  return index;
}

module.exports = {
  INTERNET_CRAWLER_SITES,
  crawlInternetRecipeIndex,
  loadInternetRecipeIndexSync,
  getEmptyCrawlerIndex,
  looksLikeRecipeRoundup,
  INDEX_FILE
};
