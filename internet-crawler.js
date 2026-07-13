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
    key: 'libellelekker',
    source: 'Libelle Lekker',
    baseUrl: 'https://www.libelle-lekker.be',
    allowedHosts: ['libelle-lekker.be', 'www.libelle-lekker.be'],
    recipePathIncludes: ['/recept', '/recepten', '/bekijk-recept/'],
    listingPageCandidates: ['/recepten', '/zoek?search=recept'],
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
// ("Tortilla met kip") niet worden geraakt.
const ROUNDUP_NOUNS = '(?:recepten|gerechten|varianten|variaties|idee[eë]n|manieren)';
const ROUNDUP_SUPERLATIVES = '(?:beste|lekkerste|makkelijkste|snelste|populairste|favoriete|heerlijkste|leukste|top)';
const ROUNDUP_NUMBERED_RE = new RegExp(`\\b\\d{1,3}\\s*x?\\b[a-zà-ÿ0-9\\s&'’.-]*?\\b${ROUNDUP_NOUNS}\\b`, 'i');
const ROUNDUP_SUPERLATIVE_RE = new RegExp(`\\b${ROUNDUP_SUPERLATIVES}\\b[a-zà-ÿ0-9\\s&'’.-]*?\\b${ROUNDUP_NOUNS}\\b`, 'i');
const ROUNDUP_TOP_RE = /\btop[\s-]?\d{1,3}\b/i;

function textLooksLikeRoundup(rawText) {
  const text = String(rawText || '').toLowerCase().trim();
  if (!text) return false;
  return ROUNDUP_NUMBERED_RE.test(text) || ROUNDUP_SUPERLATIVE_RE.test(text) || ROUNDUP_TOP_RE.test(text);
}

function lastUrlSegmentText(rawUrl) {
  try {
    const segment = decodeURIComponent(new URL(rawUrl).pathname).split('/').filter(Boolean).pop() || '';
    return segment.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  } catch {
    return '';
  }
}

// Herkent verzamel-/lijstartikelen op basis van titel én de laatste URL-segmenten,
// zodat "de 10 beste tortilla recepten" nooit als los recept wordt aangeboden.
function looksLikeRecipeRoundup(recipeLike) {
  if (!recipeLike) return false;
  return textLooksLikeRoundup(recipeLike.title) || textLooksLikeRoundup(lastUrlSegmentText(recipeLike.url));
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

async function fetchText(url, headers = {}, acceptHeader = 'application/xml,text/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5') {
  const response = await fetch(url, {
    headers: {
      ...DEFAULT_FETCH_HEADERS,
      Accept: acceptHeader,
      ...headers
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
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

  const validSitemaps = [];
  for (const sitemapUrl of candidateUrls) {
    if (!isXmlLikeUrl(sitemapUrl)) continue;
    try {
      const xml = await fetchText(sitemapUrl);
      if (looksLikeXmlDocument(xml)) {
        validSitemaps.push(sitemapUrl);
      }
    } catch (_err) {
      // negeer niet-bestaande sitemaps
    }
  }

  return [...new Set(validSitemaps)];
}

async function collectRecipeUrlsForSite(site, log) {
  const sitemapUrls = await discoverSiteSitemaps(site, log);
  const queue = [...sitemapUrls];
  const visitedSitemaps = new Set();
  const recipeUrls = new Set();
  const maxSitemaps = Number(site.maxSitemaps || 80);
  const maxRecipeUrls = Number(site.maxRecipeUrls || 250);

  while (queue.length > 0 && visitedSitemaps.size < maxSitemaps && recipeUrls.size < maxRecipeUrls) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    let xml;
    try {
      xml = await fetchText(sitemapUrl);
    } catch (_err) {
      continue;
    }

    const locs = extractLocsFromXml(xml);
    for (const loc of locs) {
      const normalized = normalizeUrl(loc);
      if (!normalized) continue;

      if (isXmlLikeUrl(normalized)) {
        if (!visitedSitemaps.has(normalized)) queue.push(normalized);
        continue;
      }

      if (isRecipeUrlForSite(site, normalized)) {
        recipeUrls.add(normalized);
        if (recipeUrls.size >= maxRecipeUrls) break;
      }
    }
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

          // Titel kan pas na het ophalen blijken een verzamelartikel te zijn.
          if (looksLikeRecipeRoundup({ title: payload?.title, url: normalizedUrl })) {
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
