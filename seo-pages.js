/* seo-pages.js — crawlbare landings- en categoriepagina's.

   De app zelf is één pagina met tabs (#kiesRecept, #overzichtRecepten, ...).
   Dat werkt prima voor gebruikers, maar Google kan er maar één URL van
   indexeren. De pagina's hieronder geven de zoekwoorden waar Kookkeuze op
   gevonden wil worden elk een eigen URL, met echte tekst en een receptenlijst
   die al in de HTML staat — dus zonder dat er JavaScript hoeft te draaien.

   Ze zijn bewust géén kopie van de app: elke pagina legt uit wat je hier kunt
   halen en linkt daarna dóór naar de receptkiezer, met de filters die bij die
   pagina horen al ingevuld (zie applyFiltersFromUrl in index.js).

   De receptenlijsten komen uit de demo-database — dezelfde voorbeeldrecepten
   die een niet-ingelogde bezoeker in de app te zien krijgt. Andermans
   privédatabases komen hier dus nooit in terecht. */

const SITE_URL = 'https://www.kookkeuze.nl';
const OG_IMAGE = SITE_URL + '/Logo/icon-kookkeuze-512.png';

// De demo-dataset verandert alleen bij een deploy, maar een crawler vraagt wel
// meerdere pagina's achter elkaar op. Tien minuten cache scheelt die queries.
const LIST_CACHE_MS = 10 * 60 * 1000;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON-LD staat in een <script>-blok, dus een letterlijke sluit-tag in een
// recepttitel zou dat blok voortijdig afsluiten.
function jsonLdSafe(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Bouwt een link naar de receptkiezer met de filters van deze pagina al
// ingevuld. De hash moet ná de query staan, anders leest de browser de
// parameters niet meer.
function toolLink(filters) {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    (Array.isArray(value) ? value : [value]).forEach(v => {
      if (v) params.append(key, v);
    });
  });
  const query = params.toString();
  return '/' + (query ? '?' + query : '') + '#kiesRecept';
}

/* -------------------- PAGINA-DEFINITIES -------------------- */
/* filterSets is een lijst: de filters bínnen één set worden gecombineerd (EN),
   de sets onderling worden samengevoegd (OF). 'Gezond' is bijvoorbeeld alles
   met doel 'Sporten' plús alle salades — dat past niet in één query. */

const PAGES = [
  {
    path: '/wat-eten-we-vandaag',
    footerLabel: 'Wat eten we vandaag?',
    title: 'Wat eten we vandaag? Kies snel een recept – Kookkeuze',
    description:
      'Geen idee wat je vandaag moet eten? Filter op tijd, soort gerecht en calorieën, of laat Kookkeuze willekeurig een recept voor je kiezen. Gratis te proberen.',
    h1: 'Wat eten we vandaag?',
    breadcrumb: 'Wat eten we vandaag',
    intro: [
      'Geen idee wat je vandaag moet eten? Je staat om zes uur voor een open koelkast, iedereen heeft honger, en precies op dat moment wil er niets te binnen schieten. Kookkeuze neemt die keuze van je over.',
      'De receptkiezer staat via de knop hieronder ingesteld op recepten die <strong>snel klaar</strong> zijn: binnen een halfuur op tafel. Zoek je iets anders, dan zet je de filters met één tik om. Je kiest op soort gerecht (pasta, kip, vis, vegetarisch, soep), op menugang, op bereidingstijd en op calorieën — zo vind je net zo makkelijk een <strong>gezond</strong> avondeten als een <strong>makkelijk</strong> gerecht voor doordeweeks.',
      'Kom je er dan nog niet uit? Druk op Random. Kookkeuze pakt zelf een recept dat aan je filters voldoet, en daarmee is het beslist. Geen eindeloos scrollen meer.',
      'Met een gratis account bouw je daarna je eigen receptendatabase. Je plakt de link van elk recept dat je online tegenkomt, wij halen de titel en de foto op, en jij bepaalt onder welke categorieën het valt. Vervolgens plan je er je weekmenu mee en stuur je de ingrediënten door naar je boodschappenlijst. Zonder account kijk je vrij rond in de voorbeelddatabase hieronder.'
    ],
    ctaLabel: 'Open de receptkiezer op "snel klaar"',
    ctaFilters: { time_required: 'Onder de 30 minuten' },
    listHeading: 'Binnen een halfuur klaar',
    listIntro:
      'Een greep uit de voorbeeldrecepten die binnen een halfuur klaar zijn. In je eigen database staan straks je eigen recepten.',
    filterSets: [{ time_required: ['Onder de 30 minuten'] }],
    sitemapPriority: '0.9'
  },
  {
    path: '/recepten/avondeten/makkelijk',
    footerLabel: 'Makkelijk avondeten',
    title: 'Makkelijke recepten voor het avondeten – Kookkeuze',
    description:
      'Makkelijke recepten voor het avondeten: hoofdgerechten die binnen 45 minuten klaar zijn. Filter op tijd en soort gerecht, of laat Kookkeuze kiezen.',
    h1: 'Makkelijke recepten voor het avondeten',
    breadcrumb: 'Makkelijk',
    intro: [
      'Een makkelijk avondeten is meestal een kwestie van twee dingen: weinig stappen en weinig tijd. Daarom staat deze pagina op hoofdgerechten die binnen 45 minuten op tafel staan — pastagerechten, kip uit de pan, ovenschotels die je in elkaar zet en verder met rust laat.',
      'Kookkeuze is geen receptensite met duizenden gerechten waar je alsnog uit moet kiezen. Het is een kiezer: je zet de filters op wat je vanavond aankunt en je krijgt terug wat daarbij past. Staat je hoofd er helemaal niet naar, dan druk je op Random en is het beslist.'
    ],
    ctaLabel: 'Kies een makkelijk hoofdgerecht',
    ctaFilters: {
      meal_category: 'Hoofdgerecht',
      time_required: ['Onder de 30 minuten', '30 - 45 minuten']
    },
    listHeading: 'Makkelijke hoofdgerechten uit de voorbeelddatabase',
    listIntro: 'Hoofdgerechten die hooguit 45 minuten kosten.',
    filterSets: [
      {
        meal_category: ['Hoofdgerecht'],
        time_required: ['Onder de 30 minuten', '30 - 45 minuten']
      }
    ],
    sitemapPriority: '0.8'
  },
  {
    path: '/recepten/avondeten/gezond',
    footerLabel: 'Gezond avondeten',
    title: 'Gezonde recepten voor het avondeten – Kookkeuze',
    description:
      'Gezonde recepten voor het avondeten: hoofdgerechten en salades met een sportief doel. Filter op calorieën en bereidingstijd in Kookkeuze.',
    h1: 'Gezonde recepten voor het avondeten',
    breadcrumb: 'Gezond',
    intro: [
      'Gezond eten strandt zelden op de recepten en bijna altijd op het moment van kiezen. Om zes uur is het makkelijker om iets te bestellen dan om te bedenken wat er nog in de koelkast ligt. Deze pagina verzamelt de kant van Kookkeuze die daarbij helpt: hoofdgerechten met doel "Sporten" en salades die als avondeten doorgaan.',
      'In de tool zelf ga je verder dan deze lijst. Je zet een calorieëngrens op je filter, je combineert die met een bereidingstijd, en je kiest of het vlees, vis of vegetarisch moet worden. Wat overblijft is precies wat er vanavond in past — en dat plan je meteen in je weekmenu, zodat de keuze morgen ook al gemaakt is.'
    ],
    ctaLabel: 'Kies een gezond hoofdgerecht',
    ctaFilters: { meal_type: 'Sporten' },
    listHeading: 'Gezonde gerechten uit de voorbeelddatabase',
    listIntro: 'Hoofdgerechten met doel "Sporten" en salades.',
    filterSets: [{ meal_type: ['Sporten'] }, { meal_category: ['Salade'] }],
    sitemapPriority: '0.8'
  },
  {
    path: '/recepten/avondeten/lekker',
    footerLabel: 'Lekker avondeten',
    title: 'Lekkere recepten voor het avondeten – Kookkeuze',
    description:
      'Lekkere recepten voor het avondeten, van pasta tot ovenschotel. Verzamel je favorieten in je eigen database en laat Kookkeuze kiezen wat het vanavond wordt.',
    h1: 'Lekkere recepten voor het avondeten',
    breadcrumb: 'Lekker',
    intro: [
      'Lekker is het enige criterium waar geen filter voor bestaat, want het verschilt per huishouden. Wat wij wél kunnen: zorgen dat de recepten die jij lekker vindt niet langer verspreid staan over bookmarks, screenshots en appjes aan jezelf.',
      'In Kookkeuze plak je de link van een recept dat je ergens tegenkwam — een foodblog, een supermarktsite, een kookprogramma — en dan staat het in je eigen database. Wij halen de titel en de foto erbij, jij hangt er de categorieën aan die voor jou kloppen. Vanaf dat moment is "wat eten we vandaag" een keuze uit jouw eigen favorieten in plaats van uit het hele internet. Hieronder staan de hoofdgerechten uit onze voorbeelddatabase, zodat je ziet hoe dat eruitziet.'
    ],
    ctaLabel: 'Bekijk de hoofdgerechten',
    ctaFilters: { meal_category: 'Hoofdgerecht' },
    listHeading: 'Hoofdgerechten uit de voorbeelddatabase',
    listIntro: 'Zo ziet een gevulde database eruit — met jouw recepten erin wordt het jouw lijst.',
    filterSets: [{ meal_category: ['Hoofdgerecht'] }],
    sitemapPriority: '0.7'
  },
  {
    path: '/recepten/snel-klaar',
    footerLabel: 'Snel klaar',
    title: 'Snelle recepten – binnen 30 minuten klaar – Kookkeuze',
    description:
      'Snelle recepten die binnen 30 minuten klaar zijn. Filter op bereidingstijd in Kookkeuze en beslis in één klik wat je vanavond eet.',
    h1: 'Snelle recepten — binnen 30 minuten klaar',
    breadcrumb: 'Snel klaar',
    intro: [
      'Bereidingstijd is in Kookkeuze een echt filter, geen slag in de lucht. Bij elk recept dat je opslaat leg je vast in welke categorie het valt: onder de 30 minuten, 30 tot 45 minuten, 45 minuten tot een uur, 1 tot 2 uur, of langer. Deze pagina laat de snelste categorie zien.',
      'Dat filter is precies waar je op doordeweekse avonden iets aan hebt. Je zet de tijd op "onder de 30 minuten", eventueel met een soort gerecht erbij, en je houdt alleen over wat vanavond haalbaar is. De uitgebreide recepten blijven bewaard voor het weekend — ze staan gewoon in dezelfde database, achter een ander filter.'
    ],
    ctaLabel: 'Filter op onder de 30 minuten',
    ctaFilters: { time_required: 'Onder de 30 minuten' },
    listHeading: 'Binnen 30 minuten klaar',
    listIntro: 'De snelste recepten uit de voorbeelddatabase.',
    filterSets: [{ time_required: ['Onder de 30 minuten'] }],
    sitemapPriority: '0.7'
  },
  {
    path: '/gezonde-recepten-afvallen',
    footerLabel: 'Afvallen',
    title: 'Gezonde recepten om af te vallen – filter op calorieën – Kookkeuze',
    description:
      'Gezonde recepten om af te vallen: filter je eigen recepten op calorieën, van onder de 300 tot onder de 700 kcal, en plan er je weekmenu mee.',
    h1: 'Gezonde recepten om af te vallen',
    breadcrumb: 'Afvallen',
    intro: [
      'Afvallen loopt bijna nooit stuk op één maaltijd. Het loopt stuk op de avond dat je geen idee hebt wat je gaat eten en het daarom maar wordt wat er het snelst op tafel staat. Een lijst met caloriearme recepten helpt daar weinig tegen — een filter dat je in twee tellen toepast wel.',
      'Kookkeuze heeft daarom een calorieënfilter op elk recept in je database. Je vult bij het opslaan in hoeveel kcal een portie ongeveer telt, en daarna doorzoek je je hele verzameling op "onder de 300", "onder de 500", "onder de 700" — tot en met "boven de 1000" voor de dagen dat het niet hoeft.',
      'Dat filter combineer je met de rest: gezond én binnen een halfuur, of caloriearm én vegetarisch. En omdat je er meteen je weekmenu mee plant en de ingrediënten doorstuurt naar je boodschappenlijst, staat de keuze al vast voordat de honger toeslaat.'
    ],
    ctaLabel: 'Open de receptkiezer',
    ctaFilters: { meal_type: 'Sporten' },
    // Geen receptenlijst: in de voorbeelddatabase staan bewust geen calorieën
    // (die staan niet in de brondata en verzinnen we niet). Een lijst met
    // "caloriearme" recepten zonder cijfers zou een loze belofte zijn.
    filterSets: [],
    extraSections: [
      {
        heading: 'Zo gebruik je het calorieënfilter',
        steps: [
          {
            title: 'Vul de calorieën in bij het recept',
            body:
              'Bij het toevoegen van een recept staat een veld voor calorieën per portie. Veel receptsites vermelden dat; staat het er niet bij, dan laat je het leeg en filter je op de andere velden.'
          },
          {
            title: 'Zet je grens in de receptkiezer',
            body:
              'In het filter "Calorieën" kies je een bovengrens. Kookkeuze toont dan alleen recepten die daaronder blijven — je eigen recepten, niet een willekeurige lijst van het internet.'
          },
          {
            title: 'Plan er je week mee',
            body:
              'Zet de recepten die overblijven in de weekmenuplanner en stuur de ingrediënten in één keer door naar je boodschappenlijst. De keuze is dan al gemaakt voordat je honger hebt.'
          }
        ]
      }
    ],
    sitemapPriority: '0.7'
  }
];

/* -------------------- RENDEREN -------------------- */

function renderRecipeList(recipes) {
  if (!recipes.length) return '';
  const items = recipes
    .map(recipe => {
      const meta = [recipe.meal_category, recipe.dish_type, recipe.time_required]
        .filter(Boolean)
        .join(' · ');
      return `
        <li class="seo-recipe-item">
          <a class="seo-recipe-title" href="${escapeHtml(recipe.url)}" target="_blank" rel="noopener">${escapeHtml(recipe.title)}</a>
          ${meta ? `<p class="seo-recipe-meta">${escapeHtml(meta)}</p>` : ''}
        </li>`;
    })
    .join('');
  return `<ul class="seo-recipe-list">${items}</ul>`;
}

// Kruislink tussen de landingspagina's staat in de footer (renderFooterRecipeLinks
// hieronder) en dus op elke pagina van de site, niet alleen hier in de body.

function renderExtraSections(sections) {
  if (!Array.isArray(sections) || !sections.length) return '';
  return sections
    .map(section => {
      const steps = (section.steps || [])
        .map(
          (step, index) => `
          <li class="info-step">
            <span class="info-step-number" aria-hidden="true">${index + 1}</span>
            <div class="info-step-body">
              <h4>${escapeHtml(step.title)}</h4>
              <p>${escapeHtml(step.body)}</p>
            </div>
          </li>`
        )
        .join('');
      return `      <h3>${escapeHtml(section.heading)}</h3>
      <ol class="info-steps">${steps}</ol>`;
    })
    .join('\n');
}

// Footer-navigatie naar alle landingspagina's, hetzelfde blok dat ook op
// index.html en de statische info-pagina's staat. Op de pagina zelf wordt de
// link een <span> in plaats van een <a>, zoals bij Privacyverklaring/Over
// Kookkeuze/Algemene voorwaarden hierboven.
function renderFooterRecipeLinks(currentPath) {
  const items = PAGES.map(page =>
    page.path === currentPath
      ? `<span class="footer-current">${escapeHtml(page.footerLabel)}</span>`
      : `<a href="${page.path}">${escapeHtml(page.footerLabel)}</a>`
  ).join('\n        ');
  return `    <nav class="footer-recipe-links" aria-label="Recepten kiezen">
      <span class="footer-links-label">Recepten kiezen</span>
        ${items}
    </nav>`;
}

function buildJsonLd(page, recipes) {
  const blocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Kookkeuze', item: SITE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: SITE_URL + page.path }
      ]
    }
  ];

  // ItemList in plaats van Recipe: Kookkeuze slaat links naar recepten op
  // andere sites op, niet de ingrediënten en bereidingsstappen zelf. Recipe-
  // markup zou beweren dat het recept hier staat, en dat is niet zo.
  if (recipes.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: page.h1,
      numberOfItems: recipes.length,
      itemListElement: recipes.map((recipe, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: recipe.title,
        url: recipe.url
      }))
    });
  }

  return blocks
    .map(block => `  <script type="application/ld+json">${jsonLdSafe(block)}</script>`)
    .join('\n');
}

function renderPage(page, recipes) {
  const canonical = SITE_URL + page.path;
  const intro = page.intro.map(paragraph => `      <p>${paragraph}</p>`).join('\n');
  const list = renderRecipeList(recipes);
  const listBlock = list
    ? `      <h3>${escapeHtml(page.listHeading)}</h3>
      ${page.listIntro ? `<p>${escapeHtml(page.listIntro)}</p>` : ''}
      ${list}`
    : '';

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/png" href="/Logo/favicon-kookkeuze.png" />
  <meta name="theme-color" content="#63D671" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}" />
  <link rel="canonical" href="${canonical}" />

  <!-- Open Graph / Twitter: bepalen hoe een gedeelde link eruitziet in
       WhatsApp, Facebook, LinkedIn en X. Zelfde vierkante app-icoon als de
       rest van de site. -->
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.description)}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:image:alt" content="Kookkeuze-logo: een pan met een groen vinkje" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Kookkeuze" />
  <meta property="og:locale" content="nl_NL" />
  <meta name="twitter:card" content="summary" />

  <link
    rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"
  />
  <link rel="stylesheet" href="/styles.css" />
  <script src="/info-header.js" defer></script>

  <!-- Google AdSense: verifieert het eigendom van de site en laadt de
       advertentiecode. Moet op elke pagina in de <head> staan. -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1116960260552746"
     crossorigin="anonymous"></script>

  <!-- Umami: privacyvriendelijke statistieken, cookieloos en zonder
       toestemmingsbanner. Defer, dus het blokkeert het laden niet. -->
  <script defer src="https://cloud.umami.is/script.js" data-website-id="b57021f2-91b0-4ba7-bd2c-19278aefe4d5"></script>

${buildJsonLd(page, recipes)}

  <style>
    /* Ruimte tussen de menu-header en het witte tekstvlak. */
    main.container { margin-top: 24px; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a href="/" aria-label="Ga naar home">
        <img src="/Logo/Kookkeuze-logo.svg" alt="Kookkeuze-logo" class="logo-img" />
      </a>

      <div class="topbar-actions">
        <a href="/" class="topbar-action-btn install-app-btn" aria-label="Naar Kookkeuze">
          <span class="action-icon-shell"><img src="/icons/app.svg" alt="" width="24" height="24" class="topbar-icon-img" /></span>
          <span class="install-text">Naar Kookkeuze</span>
        </a>

        <a href="/" class="topbar-action-btn auth-action-btn" aria-label="Naar je account op de homepagina">
          <span class="action-icon-shell auth-icon-shell">
            <img src="/icons/person.svg" alt="" width="24" height="24" class="auth-main-icon topbar-icon-img" />
            <span class="auth-status-badge"><i class="fas fa-times"></i></span>
          </span>
          <span class="login-text">Inloggen</span>
          <i class="fas fa-chevron-down topbar-chevron"></i>
        </a>

        <a href="/" class="topbar-action-btn mobile-menu-btn" aria-label="Terug naar het menu">
          <span class="burger-icon" aria-hidden="true">
            <span class="burger-line"></span>
            <span class="burger-line"></span>
            <span class="burger-line"></span>
          </span>
        </a>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="tab-content active info-page">
      <h2>${escapeHtml(page.h1)}</h2>

${intro}

      <p class="seo-cta">
        <a class="seo-cta-btn" href="${toolLink(page.ctaFilters)}">${escapeHtml(page.ctaLabel)}</a>
      </p>

${listBlock}

${renderExtraSections(page.extraSections)}
    </section>
  </main>

  <footer class="site-footer">
    <div class="site-footer-inner">
      <a href="/" aria-label="Ga naar home">
        <img src="/Logo/Kookkeuze-logo.png" alt="Kookkeuze" class="footer-logo" />
      </a>
      <nav class="footer-links" aria-label="Footer links">
        <a href="/privacy">Privacyverklaring</a>
        <a href="/over-ons">Over Kookkeuze</a>
        <a href="/voorwaarden">Algemene voorwaarden</a>
      </nav>
${renderFooterRecipeLinks(page.path)}
    </div>
  </footer>
</body>
</html>
`;
}

/* -------------------- ROUTES -------------------- */

function registerSeoPages(app, { fetchDemoRecipes }) {
  const cache = new Map();

  async function loadRecipes(page) {
    if (!page.filterSets.length) return [];

    const cached = cache.get(page.path);
    if (cached && Date.now() - cached.at < LIST_CACHE_MS) return cached.recipes;

    const byId = new Map();
    for (const filters of page.filterSets) {
      const rows = await fetchDemoRecipes(filters);
      (rows || []).forEach(row => {
        if (row && row.url && !byId.has(row.id)) byId.set(row.id, row);
      });
    }
    const recipes = Array.from(byId.values()).sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), 'nl')
    );
    cache.set(page.path, { at: Date.now(), recipes });
    return recipes;
  }

  PAGES.forEach(page => {
    app.get(page.path, async (_req, res) => {
      let recipes = [];
      try {
        recipes = await loadRecipes(page);
      } catch (err) {
        // Zonder database moet de pagina nog steeds laden: de tekst en de link
        // naar de tool zijn het belangrijkst, de lijst is een extraatje.
        console.warn(`⚠️ Kon receptenlijst voor ${page.path} niet laden:`, err.message);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderPage(page, recipes));
    });
  });
}

// Voor sitemap.xml, zodat de lijst met URL's maar op één plek staat.
function getSeoPageUrls() {
  return PAGES.map(page => ({ path: page.path, priority: page.sitemapPriority }));
}

module.exports = { registerSeoPages, getSeoPageUrls };
