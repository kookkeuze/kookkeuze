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
   die een niet-ingelogde bezoeker in de app te zien krijgt — aangevuld uit de
   crawler-index. Andermans privédatabases komen hier dus nooit in terecht.

   De pagina's vormen een boom (zie parent): vijf hoofdcategorieën met daaronder
   subpagina's, en soms nog een laag dieper. Die boom is ook de footer-navigatie
   (renderFooterRecipeLinks), op elke pagina van de site. */

const SITE_URL = 'https://www.kookkeuze.nl';
const OG_IMAGE = SITE_URL + '/Logo/icon-kookkeuze-512.png';

// De demo-dataset verandert alleen bij een deploy, maar een crawler vraagt wel
// meerdere pagina's achter elkaar op. Tien minuten cache scheelt die queries.
const LIST_CACHE_MS = 10 * 60 * 1000;

// Hoeveel recepten er hoogstens op een landingspagina komen. Genoeg om de
// pagina te vullen, niet zoveel dat het een eindeloze muur tekst wordt.
const LIST_MAX = 30;

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

// Zet een filterset van een pagina om naar de parameters van de receptkiezer.
// Alleen calorieën verschillen: hier een getal, in de kiezer een keuzelijst.
function toToolFilters(filters) {
  const tool = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'calories_max') tool.calorieRange = `Onder ${value}`;
    // Het zoekveld van de kiezer neemt één zoekterm.
    else if (key === 'search') tool.search = Array.isArray(value) ? value[0] : value;
    else tool[key] = value;
  });
  return tool;
}

// Een recept in de lijst linkt niet naar de externe site maar naar de
// receptkiezer, met de filters waarmee het op deze pagina kwam. De kiezer
// zoekt dan "Op internet" — de voorbeelddatabase heeft maar een handvol
// recepten — en zet het aangeklikte recept bovenaan (zie applyFiltersFromUrl).
function recipeToolLink(page, recipe) {
  const sets = [...page.filterSets, ...(page.indexFilterSets || [])];
  const matched = sets.find(filters => matchesFilters(recipe, filters));
  const filters = page.recipeLinkFilters || (matched ? toToolFilters(matched) : page.ctaFilters);
  return toolLink({ ...filters, source: 'internet', recipe: recipe.url });
}

// De knop bovenaan opent de kiezer ook op "Op internet": een bezoeker van
// Google heeft nog geen eigen database, en de voorbeelddatabase is te klein om
// voor elk filter iets op te leveren.
function ctaToolLink(page) {
  return toolLink({ ...page.ctaFilters, source: 'internet' });
}

/* -------------------- PAGINA-DEFINITIES -------------------- */
/* filterSets is een lijst: de filters bínnen één set worden gecombineerd (EN),
   de sets onderling worden samengevoegd (OF). 'Gezond' is bijvoorbeeld alles
   met doel 'Sporten' plús alle salades — dat past niet in één query.
   indexFilterSets (optioneel) geldt alleen voor de crawler-index; daar kan ook
   op calories_max gefilterd worden, wat de demo-database niet kent.

   parent zet een pagina in de boom. Een pagina met kinderen wordt in de footer
   een uitklapmenu; footerOverviewLabel is dan de link naar de pagina zelf
   bovenaan dat menu.

   De eerste alinea van intro beantwoordt steeds direct de zoekvraag waar de
   pagina op mikt: die alinea citeren Google en AI-zoekmachines het vaakst. */

// Lunch "zonder brood": alle soorten gerecht behalve brood, wraps en zoet
// gebak. Een uitsluitfilter kent de kiezer niet, dus zo.
const LUNCH_ZONDER_BROOD = [
  'Kip', 'Vis', 'Rund', 'Varken', 'Vegetarisch', 'Pasta', 'Rijst', 'Soep',
  'Ovenschotel', 'Hartig', 'Hartige taart'
];

/* Subpagina's mikken elk op één specifieke long-tail zoekterm (keyphrase),
   gekozen uit Google Autocomplete (wat mensen in Nederland echt intypen) en
   alleen als de index er genoeg recepten voor heeft. Die term staat in de
   URL, de titel, de H1, de eerste zin en de meta-description. Breed zoeken
   ("gezonde pasta") wint een nieuwe site niet; "pasta onder 500 kcal" wel.
   redirectFrom: de URL van een eerdere versie van de pagina (301). */
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
      'Met een gratis account bouw je daarna je eigen receptendatabase. Je plakt de link van elk recept dat je online tegenkomt, wij halen de titel en de foto op, en jij bepaalt onder welke categorieën het valt. Vervolgens plan je er je weekmenu mee en stuur je de ingrediënten door naar je boodschappenlijst. Zonder account kijk je vrij rond in de recepten hieronder.'
    ],
    ctaLabel: 'Open de receptkiezer op "snel klaar"',
    ctaFilters: { time_required: 'Onder de 30 minuten' },
    listHeading: 'Binnen een halfuur klaar',
    listIntro:
      'Een greep uit de recepten die binnen een halfuur klaar zijn. In je eigen database staan straks je eigen recepten.',
    filterSets: [{ time_required: ['Onder de 30 minuten'] }],
    sitemapPriority: '0.9'
  },

  /* ---------- Snel klaar ---------- */
  {
    path: '/recepten/snel-klaar',
    footerLabel: 'Snel klaar',
    footerOverviewLabel: 'Alle snelle recepten',
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
    listIntro: 'De snelste recepten uit de verzameling.',
    filterSets: [{ time_required: ['Onder de 30 minuten'] }],
    sitemapPriority: '0.7'
  },
  {
    path: '/recepten/snel-klaar/pasta-met-kip',
    redirectFrom: '/recepten/snel-klaar/pasta',
    parent: '/recepten/snel-klaar',
    keyphrase: 'snelle pasta recepten met kip',
    footerLabel: 'Snelle pasta met kip',
    title: 'Snelle pasta recepten met kip (binnen 30 min) – Kookkeuze',
    description:
      'Snelle pasta recepten met kip die binnen 30 minuten op tafel staan, van Nederlandse kooksites. Kies er zelf één of laat Kookkeuze voor je kiezen.',
    h1: 'Snelle pasta recepten met kip',
    breadcrumb: 'Snelle pasta met kip',
    intro: [
      'Snelle pasta recepten met kip zijn pastagerechten die je binnen 30 minuten op tafel zet, met kipfilet, kippendij of kipgehakt als basis. Hieronder staan zulke recepten van Nederlandse kooksites, allemaal in de categorie "onder de 30 minuten".',
      'Kip en pasta zijn een doordeweekse klassieker omdat ze tegelijk klaar zijn: terwijl de pasta kookt, bak je de kip en maak je de saus in dezelfde pan. Of het nu een romige saus wordt, pesto of tomaat — met de kip in reepjes of blokjes ben je snel klaar.',
      'Vind je een recept dat je vaker wilt maken? Met een gratis account zet je het in je eigen receptendatabase, plan je het in je weekmenu en stuur je de ingrediënten naar je boodschappenlijst.'
    ],
    ctaLabel: 'Toon snelle pasta met kip',
    ctaFilters: { dish_type: 'Pasta', time_required: 'Onder de 30 minuten', search: 'kip' },
    listHeading: 'Snelle pasta met kip, binnen 30 minuten',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere snelle pastarecepten met kip eronder.',
    filterSets: [{ dish_type: ['Pasta'], time_required: ['Onder de 30 minuten'], search: 'kip' }],
    faq: [
      {
        q: 'Hoe snijd je kip voor een snelle pasta?',
        a: 'Snijd kipfilet in dunne reepjes of blokjes van ongeveer twee centimeter. Dan is de kip op middelhoog vuur in vijf tot zeven minuten gaar, ongeveer net zo lang als de pasta nodig heeft. Kipgehakt is nog sneller en hoeft niet gesneden te worden.'
      },
      {
        q: 'Welke saus past bij pasta met kip?',
        a: 'De snelste zijn pesto, een roomsaus met kookroom of roomkaas, en tomatensaus uit blik met knoflook. Wil je het lichter, roer dan magere kwark of Griekse yoghurt door de pasta nadat je de pan van het vuur hebt gehaald.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/snel-klaar/lunch-zonder-brood',
    redirectFrom: '/recepten/snel-klaar/lunch',
    parent: '/recepten/snel-klaar',
    keyphrase: 'snelle lunch zonder brood',
    footerLabel: 'Snelle lunch zonder brood',
    title: 'Snelle lunch zonder brood: recepten in 30 min – Kookkeuze',
    description:
      'Snelle lunch zonder brood: soep, salades en rijst- of pastagerechten die binnen 30 minuten klaar zijn. Voor thuis of om mee te nemen naar je werk.',
    h1: 'Snelle lunch zonder brood',
    breadcrumb: 'Lunch zonder brood',
    intro: [
      'Een snelle lunch zonder brood is een lunchgerecht dat binnen 30 minuten klaar is en niet op een boterham, broodje of wrap draait: denk aan soep, een salade, of een kom rijst of pasta. Hieronder staan zulke lunchrecepten van Nederlandse kooksites.',
      'Wie elke dag brood eet, zoekt vaak afwisseling — of wil tussen de middag wat minder koolhydraten. Veel van deze gerechten kun je bovendien de avond ervoor maken en in een bakje meenemen naar je werk.'
    ],
    ctaLabel: 'Toon lunch zonder brood',
    ctaFilters: { meal_category: 'Lunch', time_required: 'Onder de 30 minuten', dish_type: LUNCH_ZONDER_BROOD },
    listHeading: 'Lunch zonder brood, binnen 30 minuten',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere lunchrecepten eronder.',
    filterSets: [{ meal_category: ['Lunch'], time_required: ['Onder de 30 minuten'], dish_type: LUNCH_ZONDER_BROOD }],
    faq: [
      {
        q: 'Wat kun je als lunch eten in plaats van brood?',
        a: 'Soep, een maaltijdsalade, een omelet, een kom rijst of noedels met groente, of een restje pasta van de avond ervoor. Met een eiwitbron erin — ei, kip, vis, bonen of kwark — houd je het tot het avondeten vol.'
      },
      {
        q: 'Welke lunch zonder brood kun je meenemen?',
        a: 'Pasta- en couscoussalades, soep in een thermosbeker en rijstgerechten blijven goed in een afsluitbaar bakje. Doe de dressing apart en voeg blad en avocado pas vlak voor het eten toe.'
      }
    ],
    sitemapPriority: '0.6'
  },

  /* ---------- Makkelijk avondeten ---------- */
  {
    path: '/recepten/avondeten/makkelijk',
    footerLabel: 'Makkelijk avondeten',
    footerOverviewLabel: 'Alle makkelijke recepten',
    title: 'Makkelijk avondeten: makkelijke recepten – Kookkeuze',
    description:
      'Makkelijk avondeten: makkelijke recepten voor hoofdgerechten die binnen 45 minuten klaar zijn. Filter op tijd en soort gerecht, of laat Kookkeuze kiezen.',
    h1: 'Makkelijk avondeten: makkelijke recepten voor elke dag',
    breadcrumb: 'Makkelijk',
    intro: [
      'Makkelijk avondeten is meestal een kwestie van twee dingen: weinig stappen en weinig tijd. Daarom staat deze pagina op makkelijke recepten voor hoofdgerechten die binnen 45 minuten op tafel staan — pastagerechten, kip uit de pan, ovenschotels die je in elkaar zet en verder met rust laat.',
      'Kookkeuze is geen receptensite met duizenden gerechten waar je alsnog uit moet kiezen. Het is een kiezer: je zet de filters op wat je vanavond aankunt en je krijgt terug wat daarbij past. Staat je hoofd er helemaal niet naar, dan druk je op Random en is het beslist.'
    ],
    ctaLabel: 'Kies een makkelijk hoofdgerecht',
    ctaFilters: {
      meal_category: 'Hoofdgerecht',
      time_required: ['Onder de 30 minuten', '30 - 45 minuten']
    },
    listHeading: 'Makkelijke hoofdgerechten',
    listIntro: 'Hoofdgerechten die hooguit 45 minuten kosten.',
    filterSets: [
      {
        meal_category: ['Hoofdgerecht'],
        time_required: ['Onder de 30 minuten', '30 - 45 minuten']
      }
    ],
    faq: [
      {
        q: 'Wat is een makkelijk avondeten?',
        a: 'Een hoofdgerecht met weinig stappen, weinig afwas en een bereidingstijd van hooguit drie kwartier. Denk aan een pasta uit één pan, een roerbakgerecht of een ovenschotel die je snel opbouwt en in de oven laat staan.'
      },
      {
        q: 'Hoe beslis je snel wat je vanavond eet?',
        a: 'Zet de filters op wat je vanavond aankunt — bijvoorbeeld hoofdgerecht en onder de 45 minuten — en druk op Random. Kookkeuze kiest dan één recept dat daaraan voldoet, zodat je niet door honderden opties hoeft te scrollen.'
      }
    ],
    sitemapPriority: '0.8'
  },
  {
    path: '/recepten/avondeten/makkelijk/gezond-met-kip',
    redirectFrom: '/recepten/avondeten/makkelijk/gezond',
    parent: '/recepten/avondeten/makkelijk',
    keyphrase: 'makkelijk en gezond avondeten met kip',
    footerLabel: 'Makkelijk en gezond met kip',
    title: 'Makkelijk en gezond avondeten met kip – Kookkeuze',
    description:
      'Makkelijk en gezond avondeten met kip: eiwitrijke hoofdgerechten met kip die binnen 45 minuten klaar zijn. Kies zelf of laat Kookkeuze kiezen.',
    h1: 'Makkelijk en gezond avondeten met kip',
    breadcrumb: 'Makkelijk en gezond met kip',
    intro: [
      'Makkelijk en gezond avondeten met kip is een hoofdgerecht met kip als eiwitbron, veel groente en een bereidingstijd van hooguit 45 minuten. Op deze pagina staan zulke recepten van Nederlandse kooksites: sportief gemarkeerd of onder de 500 kcal per portie.',
      'Kip is de makkelijkste weg naar een gezond avondeten: mager, snel gaar en het past bij bijna elke groente. Denk aan een traybake met kip en groenten uit de oven, een roerbakgerecht met kipreepjes of een kom rijst met kip en broccoli.'
    ],
    ctaLabel: 'Toon makkelijk en gezond met kip',
    ctaFilters: {
      meal_category: 'Hoofdgerecht',
      meal_type: 'Sporten',
      time_required: ['Onder de 30 minuten', '30 - 45 minuten'],
      search: 'kip'
    },
    listHeading: 'Makkelijke, gezonde hoofdgerechten met kip',
    listIntro: 'Hoofdgerechten met kip die hooguit 45 minuten kosten.',
    filterSets: [
      { meal_category: ['Hoofdgerecht'], meal_type: ['Sporten'], time_required: ['Onder de 30 minuten', '30 - 45 minuten'], search: 'kip' }
    ],
    indexFilterSets: [
      { meal_category: ['Hoofdgerecht'], meal_type: ['Sporten'], time_required: ['Onder de 30 minuten', '30 - 45 minuten'], dish_type: ['Kip'] },
      { meal_category: ['Hoofdgerecht'], meal_type: ['Sporten'], time_required: ['Onder de 30 minuten', '30 - 45 minuten'], search: 'kip' },
      { meal_category: ['Hoofdgerecht'], calories_max: 500, time_required: ['Onder de 30 minuten', '30 - 45 minuten'], dish_type: ['Kip'] },
      { meal_category: ['Hoofdgerecht'], calories_max: 500, time_required: ['Onder de 30 minuten', '30 - 45 minuten'], search: 'kip' }
    ],
    faq: [
      {
        q: 'Wat is een makkelijk en gezond avondeten met kip?',
        a: 'Een hoofdgerecht met weinig stappen waarin kip de eiwitbron is en groente de hoofdrol speelt. Traybakes, roerbakgerechten en kip met rijst en groente zijn de bekendste voorbeelden: je snijdt alles in één keer en de pan of oven doet de rest.'
      },
      {
        q: 'Kipfilet of kippendij: wat is gezonder?',
        a: 'Kipfilet is het magerst. Kippendijfilet bevat iets meer vet, maar blijft sappiger en droogt minder snel uit. Beide passen in een gezond avondeten; met dij is een makkelijk recept net iets vergevingsgezinder.'
      }
    ],
    sitemapPriority: '0.7'
  },
  {
    path: '/recepten/avondeten/makkelijk/ovenschotel-met-kip',
    redirectFrom: '/recepten/avondeten/makkelijk/ovenschotels',
    parent: '/recepten/avondeten/makkelijk',
    keyphrase: 'makkelijke ovenschotel met kip',
    footerLabel: 'Ovenschotel met kip',
    title: 'Makkelijke ovenschotel met kip: recepten – Kookkeuze',
    description:
      'Makkelijke ovenschotel met kip voor het avondeten: met aardappel, rijst, pasta of groenten. Even snijden, de oven in en klaar. Kies er één in één klik.',
    h1: 'Makkelijke ovenschotel met kip',
    breadcrumb: 'Ovenschotel met kip',
    intro: [
      'Een makkelijke ovenschotel met kip is een gerecht waarbij je kip, groente en een basis als aardappel, rijst of pasta in een ovenschaal legt en de oven de rest laat doen. Hieronder staan ovenschotels met kip van Nederlandse kooksites, bedoeld als hoofdgerecht.',
      'Het voordeel: terwijl de schotel in de oven staat, heb je je handen vrij. Veel van deze recepten kun je \'s middags al in elkaar zetten en om zes uur alleen nog de oven in schuiven.'
    ],
    ctaLabel: 'Toon ovenschotels met kip',
    ctaFilters: { dish_type: 'Ovenschotel', meal_category: 'Hoofdgerecht', search: 'kip' },
    listHeading: 'Ovenschotels met kip als hoofdgerecht',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere ovenschotels met kip eronder.',
    filterSets: [{ dish_type: ['Ovenschotel'], meal_category: ['Hoofdgerecht'], search: 'kip' }],
    faq: [
      {
        q: 'Hoe lang moet kip in de oven bij een ovenschotel?',
        a: 'Blokjes kipfilet zijn in een ovenschotel op 200 °C in 20 tot 25 minuten gaar; hele kipfilets of kippendijen hebben 30 tot 35 minuten nodig. De kip is gaar als hij vanbinnen niet meer roze is en het vocht helder is, of als een thermometer in de kern 75 °C aangeeft.'
      },
      {
        q: 'Moet je kip voorbakken voor een ovenschotel?',
        a: 'Het hoeft niet, maar kort aanbakken geeft een bruin korstje en meer smaak. Rauwe blokjes kip kun je ook direct in de schaal leggen; reken dan op de volle oventijd.'
      }
    ],
    sitemapPriority: '0.6'
  },

  /* ---------- Gezond avondeten ---------- */
  {
    path: '/recepten/avondeten/gezond',
    footerLabel: 'Gezond avondeten',
    footerOverviewLabel: 'Alle gezonde recepten',
    title: 'Gezond avondeten: gezonde recepten voor het diner – Kookkeuze',
    description:
      'Gezond avondeten zonder lang zoeken: gezonde recepten en gerechten voor het diner, van eiwitrijk hoofdgerecht tot maaltijdsalade. Filter op kcal en tijd.',
    h1: 'Gezond avondeten: gezonde recepten voor het diner',
    breadcrumb: 'Gezond',
    intro: [
      'Gezond avondeten is een hoofdgerecht met genoeg groente en eiwit dat geen calorieënbom is — en dat je ook op een doordeweekse avond echt maakt. Op deze pagina staan gezonde recepten en gerechten voor het diner: hoofdgerechten met doel "Sporten" en maaltijdsalades, van Nederlandse kooksites.',
      'Gezond eten strandt zelden op de recepten en bijna altijd op het moment van kiezen. Om zes uur is het makkelijker om iets te bestellen dan om te bedenken wat er nog in de koelkast ligt. Kookkeuze helpt daarbij: je kiest uit gerechten die al passen bij hoe je wilt eten.',
      'In de tool zelf ga je verder dan deze lijst. Je zet een calorieëngrens op je filter, je combineert die met een bereidingstijd, en je kiest of het vlees, vis of vegetarisch moet worden. Wat overblijft is precies wat er vanavond in past — en dat plan je meteen in je weekmenu, zodat de keuze morgen ook al gemaakt is.'
    ],
    ctaLabel: 'Kies een gezond hoofdgerecht',
    ctaFilters: { meal_type: 'Sporten' },
    listHeading: 'Gezonde gerechten voor het avondeten',
    listIntro: 'Hoofdgerechten met doel "Sporten" en salades.',
    filterSets: [{ meal_type: ['Sporten'] }, { meal_category: ['Salade'] }],
    faq: [
      {
        q: 'Wat is een gezond avondeten?',
        a: 'Een gezond avondeten bestaat uit een flinke portie groente, een eiwitbron zoals kip, vis, ei of peulvruchten, en een volkoren basis als volkoren pasta, zilvervliesrijst of aardappel. Het Voedingscentrum adviseert volwassenen 250 gram groente per dag; het avondeten is het makkelijkste moment om het grootste deel daarvan binnen te krijgen.'
      },
      {
        q: 'Hoe kies je snel een gezond recept voor vanavond?',
        a: 'Open de receptkiezer, zet het doel op "Sporten" of kies een calorieëngrens, en voeg eventueel een bereidingstijd toe. Druk daarna op Random: Kookkeuze kiest één recept dat aan al je filters voldoet.'
      },
      {
        q: 'Kan gezond avondeten ook makkelijk zijn?',
        a: 'Zeker. Ovenschotels, traybakes en roerbakgerechten zijn gezond te maken met weinig werk. Op de pagina <a href="/recepten/avondeten/makkelijk/gezond-met-kip">makkelijk en gezond avondeten met kip</a> staan hoofdgerechten die hooguit 45 minuten kosten.'
      }
    ],
    sitemapPriority: '0.8'
  },
  {
    path: '/recepten/avondeten/gezond/hoofdgerechten-afvallen',
    redirectFrom: '/recepten/avondeten/gezond/hoofdgerechten',
    parent: '/recepten/avondeten/gezond',
    keyphrase: 'gezonde hoofdgerechten om af te vallen',
    footerLabel: 'Hoofdgerechten om af te vallen',
    footerOverviewLabel: 'Alle hoofdgerechten om af te vallen',
    title: 'Gezonde hoofdgerechten om af te vallen – Kookkeuze',
    description:
      'Gezonde hoofdgerechten om af te vallen: eiwitrijke recepten en avondeten onder de 500 kcal, met pasta, kip, zalm of rijst. Filter en kies in één klik.',
    h1: 'Gezonde hoofdgerechten om af te vallen',
    breadcrumb: 'Hoofdgerechten om af te vallen',
    intro: [
      'Gezonde hoofdgerechten om af te vallen zijn avondmaaltijden met veel groente en eiwit en niet meer dan zo\'n 500 kcal per portie, zodat je vol zit zonder dat de calorieën oplopen. Op deze pagina staan zulke hoofdgerechten van Nederlandse kooksites, sportief gemarkeerd of onder de 500 kcal.',
      'Het zijn gewone gerechten — pasta, rijst, ovenschotels, wraps — alleen anders opgebouwd: meer groente in de saus, magere kip of vis in plaats van worst, en een kleinere portie pasta of rijst. Zo blijft afvallen vol te houden, ook doordeweeks.',
      'Weet je al waar je zin in hebt? Kies hieronder <a href="/recepten/avondeten/gezond/pasta-onder-500-kcal">pasta onder 500 kcal</a>, <a href="/recepten/avondeten/gezond/kip-en-rijst">een gezond recept met kip en rijst</a> of <a href="/recepten/avondeten/gezond/zalm">gezonde recepten met zalm</a>.'
    ],
    ctaLabel: 'Toon hoofdgerechten onder 500 kcal',
    ctaFilters: { meal_category: 'Hoofdgerecht', calorieRange: 'Onder 500' },
    listHeading: 'Gezonde hoofdgerechten om af te vallen',
    listIntro: 'Eiwitrijke hoofdgerechten en hoofdgerechten onder de 500 kcal.',
    filterSets: [{ meal_category: ['Hoofdgerecht'], meal_type: ['Sporten'] }],
    indexFilterSets: [
      { meal_category: ['Hoofdgerecht'], meal_type: ['Sporten'] },
      { meal_category: ['Hoofdgerecht'], calories_max: 500 }
    ],
    faq: [
      {
        q: 'Wat is een goed hoofdgerecht om af te vallen?',
        a: 'Een hoofdgerecht met een half bord groente, een magere eiwitbron (kip, vis, ei of peulvruchten) en een kleine portie volkoren pasta, rijst of aardappel. Die combinatie verzadigt goed voor relatief weinig calorieën.'
      },
      {
        q: 'Hoeveel calorieën mag een hoofdgerecht hebben als je wilt afvallen?',
        a: 'Veel afvalschema\'s houden 400 tot 600 kcal aan voor de avondmaaltijd. Het gaat uiteindelijk om het totaal over de dag; twijfel je over wat bij jou past, overleg dan met een diëtist.'
      }
    ],
    sitemapPriority: '0.7'
  },
  {
    path: '/recepten/avondeten/gezond/pasta-onder-500-kcal',
    redirectFrom: '/recepten/avondeten/gezond/pasta',
    parent: '/recepten/avondeten/gezond/hoofdgerechten-afvallen',
    keyphrase: 'pasta onder 500 kcal',
    footerLabel: 'Pasta onder 500 kcal',
    title: 'Pasta onder 500 kcal: lichte pastarecepten – Kookkeuze',
    description:
      'Pasta onder 500 kcal per portie: lichte pastarecepten met veel groente, van Nederlandse kooksites. Handig als je wilt afvallen. Kies in één klik.',
    h1: 'Pasta onder 500 kcal',
    breadcrumb: 'Pasta onder 500 kcal',
    intro: [
      'Pasta onder 500 kcal is een pastagerecht dat per portie minder dan 500 kilocalorieën telt, doordat de portie pasta bescheiden is en de rest van het bord uit groente en een magere eiwitbron bestaat. Hieronder staan zulke pastarecepten van Nederlandse kooksites; het aantal calorieën komt van de receptsite zelf.',
      'Pasta en afvallen gaan prima samen. Het verschil zit in de verhoudingen: zo\'n 75 gram droge pasta per persoon in plaats van 125, een saus op basis van tomaat of groente in plaats van room, en genoeg groente om het bord te vullen.'
    ],
    ctaLabel: 'Toon pasta onder 500 kcal',
    ctaFilters: { dish_type: 'Pasta', calorieRange: 'Onder 500' },
    listHeading: 'Pastarecepten onder 500 kcal',
    listIntro: 'Recepten waarvan de receptsite zelf minder dan 500 kcal per portie opgeeft.',
    // Geen calorieën in de voorbeelddatabase, zie /gezonde-recepten-afvallen.
    filterSets: [],
    indexFilterSets: [{ dish_type: ['Pasta'], calories_max: 500 }],
    faq: [
      {
        q: 'Hoeveel calorieën heeft een bord pasta?',
        a: '100 gram droge pasta bevat ongeveer 350 kcal. Met saus, kaas en olie komt een gemiddeld bord pasta al snel op 700 tot 900 kcal. Met een kleinere portie pasta en veel groente blijf je onder de 500.'
      },
      {
        q: 'Hoe maak je pasta caloriearmer?',
        a: 'Gebruik minder pasta en meer groente, vervang room door magere kwark of passata, weeg de olie af in plaats van te schenken, en strooi de kaas er pas aan tafel over. Volkoren pasta verzadigt bovendien langer.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/gezond/kip-en-rijst',
    redirectFrom: '/recepten/avondeten/gezond/kip',
    parent: '/recepten/avondeten/gezond/hoofdgerechten-afvallen',
    keyphrase: 'gezond recept met kip en rijst',
    footerLabel: 'Gezond met kip en rijst',
    title: 'Gezond recept met kip en rijst: recepten – Kookkeuze',
    description:
      'Gezond recept met kip en rijst nodig? Eiwitrijke gerechten met kipfilet en rijst, en maaltijden onder de 500 kcal. Kies er één of laat Kookkeuze kiezen.',
    h1: 'Gezond recept met kip en rijst',
    breadcrumb: 'Gezond met kip en rijst',
    intro: [
      'Een gezond recept met kip en rijst combineert magere kip met een flinke portie groente en een gewone portie rijst, het liefst zilvervliesrijst. Op deze pagina staan zulke recepten met kip en rijst van Nederlandse kooksites, sportief gemarkeerd of onder de 500 kcal per portie.',
      'Van kip teriyaki en kip kerrie tot een roerbakgerecht met broccoli: kip met rijst is misschien wel het bekendste gezonde avondeten, en niet voor niets. Het is voedzaam, goedkoop en makkelijk in een grotere portie te maken voor de lunch van morgen.'
    ],
    ctaLabel: 'Toon gezonde recepten met kip en rijst',
    ctaFilters: { dish_type: 'Rijst', meal_type: 'Sporten', search: 'kip' },
    listHeading: 'Gezonde recepten met kip en rijst',
    listIntro: 'Eiwitrijke rijstgerechten met kip en rijstgerechten met kip onder de 500 kcal.',
    filterSets: [{ dish_type: ['Rijst'], meal_type: ['Sporten'], search: 'kip' }],
    indexFilterSets: [
      { dish_type: ['Rijst'], meal_type: ['Sporten'], search: 'kip' },
      { dish_type: ['Rijst'], calories_max: 500, search: 'kip' }
    ],
    faq: [
      {
        q: 'Is kip met rijst gezond?',
        a: 'Ja, als het bord in balans is: 100 tot 150 gram magere kip, 60 tot 75 gram droge rijst per persoon en minstens de helft van het bord groente. Zilvervliesrijst bevat meer vezels dan witte rijst en staat in de Schijf van Vijf van het Voedingscentrum.'
      },
      {
        q: 'Kun je kip met rijst van tevoren maken?',
        a: 'Ja, maar laat gekookte rijst snel afkoelen en zet hem binnen een uur in de koelkast. Eet hem binnen een à twee dagen op en warm hem goed door. Rijst die lang lauw blijft staan, kan bacteriën bevatten waar je ziek van wordt.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/gezond/zalm',
    redirectFrom: '/recepten/avondeten/gezond/vis',
    parent: '/recepten/avondeten/gezond/hoofdgerechten-afvallen',
    keyphrase: 'gezonde recepten met zalm',
    footerLabel: 'Gezonde recepten met zalm',
    title: 'Gezonde recepten met zalm voor het avondeten – Kookkeuze',
    description:
      'Gezonde recepten met zalm: eiwitrijke gerechten met zalmfilet en avondeten onder de 500 kcal, uit de oven, de pan of in een salade. Kies in één klik.',
    h1: 'Gezonde recepten met zalm',
    breadcrumb: 'Gezonde recepten met zalm',
    intro: [
      'Gezonde recepten met zalm zijn gerechten met zalmfilet of gerookte zalm als eiwitbron, gecombineerd met groente en een lichte basis. Hier staan zalmrecepten van Nederlandse kooksites die sportief gemarkeerd zijn of onder de 500 kcal per portie blijven.',
      'Zalm is een vette vis, en die raadt het Voedingscentrum aan: eet één keer per week vis, bij voorkeur vette vis. Een paar vaste zalmrecepten helpen om dat echt vol te houden — uit de oven met groenten, in een pasta of op een maaltijdsalade.'
    ],
    ctaLabel: 'Toon gezonde recepten met zalm',
    ctaFilters: { meal_type: 'Sporten', search: 'zalm' },
    listHeading: 'Gezonde gerechten met zalm',
    listIntro: 'Eiwitrijke zalmgerechten en zalmgerechten onder de 500 kcal.',
    filterSets: [{ meal_type: ['Sporten'], search: 'zalm' }],
    indexFilterSets: [
      { meal_type: ['Sporten'], search: 'zalm' },
      { calories_max: 500, search: 'zalm' }
    ],
    faq: [
      {
        q: 'Hoe lang moet zalm in de oven?',
        a: 'Een zalmfilet van ongeveer twee centimeter dik is op 200 °C in 12 tot 15 minuten gaar. De zalm is klaar als hij net ondoorzichtig is en makkelijk uit elkaar valt in lamellen.'
      },
      {
        q: 'Is zalm gezond?',
        a: 'Zalm bevat veel eiwit en omega-3-vetzuren. Het Voedingscentrum adviseert één keer per week vis te eten, bij voorkeur vette vis zoals zalm, makreel of haring.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/gezond/maaltijdsalade-met-kip',
    redirectFrom: '/recepten/avondeten/gezond/maaltijdsalades',
    parent: '/recepten/avondeten/gezond',
    keyphrase: 'maaltijdsalade met kip',
    footerLabel: 'Maaltijdsalade met kip',
    title: 'Maaltijdsalade met kip: recepten voor avondeten – Kookkeuze',
    description:
      'Maaltijdsalade met kip als avondeten of lunch: volwaardige salades met kip, groente en een verzadigende basis. Van Nederlandse kooksites, gekozen in één klik.',
    h1: 'Maaltijdsalade met kip',
    breadcrumb: 'Maaltijdsalade met kip',
    intro: [
      'Een maaltijdsalade met kip is een salade die een complete maaltijd vormt: blad en groente, kip als eiwitbron en een verzadigende basis zoals pasta, couscous, krieltjes of avocado. Hieronder staan salades met kip van Nederlandse kooksites.',
      'Een maaltijdsalade met kip is ideaal op warme dagen en als lunch om mee te nemen. Gebruik gegrilde of gebakken kipfilet, gerookte kip of een restje kip van gisteren.'
    ],
    ctaLabel: 'Toon maaltijdsalades met kip',
    ctaFilters: { meal_category: 'Salade', search: 'kip' },
    // In de kiezer vangt meal_category=Salade ook elk recept met 'salade' in
    // de titel (hij zoekt in de hele omschrijving), dus één link dekt beide sets.
    recipeLinkFilters: { meal_category: 'Salade', search: 'kip' },
    listHeading: 'Salades met kip voor avondeten en lunch',
    listIntro: 'Klik op een salade om hem in de receptkiezer te openen, met de andere salades met kip eronder.',
    filterSets: [{ meal_category: ['Salade'], search: 'kip' }],
    indexFilterSets: [
      { meal_category: ['Salade'], search: 'kip' },
      { search: ['salade', 'kip'] }
    ],
    faq: [
      {
        q: 'Hoe maak je een maaltijdsalade met kip verzadigend?',
        a: 'Combineer de kip met een koolhydraatbron (volkoren pasta, couscous, krieltjes of quinoa) en iets met gezond vet, zoals avocado, noten of een dressing met olijfolie. Met alleen sla en kip heb je na een uur weer honger.'
      },
      {
        q: 'Welke kip gebruik je voor een salade?',
        a: 'Gegrilde of gebakken kipfilet in reepjes wordt het meest gebruikt. Gerookte kip scheelt bakken, en een restje gebraden kip is ideaal voor een salade de volgende dag.'
      }
    ],
    sitemapPriority: '0.6'
  },

  /* ---------- Lekker avondeten ---------- */
  {
    path: '/recepten/avondeten/lekker',
    footerLabel: 'Lekker avondeten',
    footerOverviewLabel: 'Alle lekkere recepten',
    title: 'Lekkere recepten voor het avondeten – Kookkeuze',
    description:
      'Lekkere recepten voor het avondeten, van pasta tot ovenschotel. Verzamel je favorieten in je eigen database en laat Kookkeuze kiezen wat het vanavond wordt.',
    h1: 'Lekkere recepten voor het avondeten',
    breadcrumb: 'Lekker',
    intro: [
      'Lekker is het enige criterium waar geen filter voor bestaat, want het verschilt per huishouden. Wat wij wél kunnen: zorgen dat de recepten die jij lekker vindt niet langer verspreid staan over bookmarks, screenshots en appjes aan jezelf.',
      'In Kookkeuze plak je de link van een recept dat je ergens tegenkwam — een foodblog, een supermarktsite, een kookprogramma — en dan staat het in je eigen database. Wij halen de titel en de foto erbij, jij hangt er de categorieën aan die voor jou kloppen. Vanaf dat moment is "wat eten we vandaag" een keuze uit jouw eigen favorieten in plaats van uit het hele internet. Hieronder staan hoofdgerechten uit onze verzameling, zodat je ziet hoe dat eruitziet.'
    ],
    ctaLabel: 'Bekijk de hoofdgerechten',
    ctaFilters: { meal_category: 'Hoofdgerecht' },
    listHeading: 'Hoofdgerechten om uit te kiezen',
    listIntro: 'Zo ziet een gevulde database eruit — met jouw recepten erin wordt het jouw lijst.',
    filterSets: [{ meal_category: ['Hoofdgerecht'] }],
    sitemapPriority: '0.7'
  },
  {
    path: '/recepten/avondeten/lekker/maaltijdsoep-met-kip',
    redirectFrom: '/recepten/avondeten/lekker/maaltijdsoep',
    parent: '/recepten/avondeten/lekker',
    keyphrase: 'maaltijdsoep met kip',
    footerLabel: 'Maaltijdsoep met kip',
    title: 'Maaltijdsoep met kip: vullende soeprecepten – Kookkeuze',
    description:
      'Maaltijdsoep met kip als avondeten: vullende soepen met kip en groente, noedels, rijst of bonen. Recepten van Nederlandse kooksites, gekozen in één klik.',
    h1: 'Maaltijdsoep met kip',
    breadcrumb: 'Maaltijdsoep met kip',
    intro: [
      'Een maaltijdsoep met kip is een soep die stevig genoeg is om als avondeten te dienen: met stukken kip, veel groente en vaak noedels, rijst, pasta of bonen erin. Hieronder staan soeprecepten met kip van Nederlandse kooksites.',
      'Van Thaise kippensoep met kokosmelk tot een Italiaanse soep met kip en witte bonen: kippensoep als hoofdgerecht is goedkoop, makkelijk in een grote pan te maken en de volgende dag vaak nog lekkerder.'
    ],
    ctaLabel: 'Toon maaltijdsoepen met kip',
    ctaFilters: { dish_type: 'Soep', search: 'kip' },
    listHeading: 'Soepen met kip als maaltijd',
    listIntro: 'Klik op een soep om hem in de receptkiezer te openen, met de andere soepen met kip eronder.',
    filterSets: [{ dish_type: ['Soep'], search: 'kip' }],
    faq: [
      {
        q: 'Hoe maak je kippensoep vullend genoeg als avondeten?',
        a: 'Doe er een koolhydraatbron in — noedels, rijst, pasta, aardappel of bonen — en royaal kip en groente. Met volkorenbrood erbij heb je een complete maaltijd.'
      },
      {
        q: 'Kun je maaltijdsoep met kip invriezen?',
        a: 'Ja, kippensoep vriest goed in. Vries hem liefst zonder noedels of pasta in, want die worden na het ontdooien papperig; kook ze vers bij het opwarmen. Verwarm de soep tot hij kookt.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/lekker/wraps-met-kip',
    redirectFrom: '/recepten/avondeten/lekker/wraps',
    parent: '/recepten/avondeten/lekker',
    keyphrase: 'wraps met kip',
    footerLabel: 'Wraps met kip',
    title: 'Wraps met kip: recepten voor het avondeten – Kookkeuze',
    description:
      'Wraps met kip als avondeten: uit de pan of uit de oven, met groente, saus en kaas. Recepten van Nederlandse kooksites, gekozen in één klik.',
    h1: 'Wraps met kip',
    breadcrumb: 'Wraps met kip',
    intro: [
      'Wraps met kip zijn tortilla\'s gevuld met gekruide kip, groente en saus, die je aan tafel zelf oprolt of als ovenschotel afbakt. Op deze pagina staan wrapsrecepten met kip van Nederlandse kooksites.',
      'Wraps met kip zijn populair bij gezinnen omdat iedereen zijn eigen wrap vult: wie geen paprika lust, laat hem gewoon weg. En ze zijn snel — kipreepjes met paprika en ui staan in een kwartier in de pan.'
    ],
    ctaLabel: 'Toon wraps met kip',
    ctaFilters: { dish_type: 'Wraps', search: 'kip' },
    listHeading: 'Wraps met kip als avondeten',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere wraps met kip eronder.',
    filterSets: [{ dish_type: ['Wraps'], search: 'kip' }],
    faq: [
      {
        q: 'Welke kruiden gebruik je voor kip in een wrap?',
        a: 'Paprikapoeder, komijn, knoflook en een beetje chilipoeder of cayennepeper geven de bekende fajita-smaak. Kant-en-klare kruidenmixen voor fajita of taco werken ook, maar bevatten vaak veel zout.'
      },
      {
        q: 'Kun je wraps met kip in de oven maken?',
        a: 'Ja. Vul de wraps met kip die al gaar is, rol ze op, leg ze naast elkaar in een ovenschaal, bestrooi ze met kaas en bak ze 15 tot 20 minuten op 200 °C tot de kaas gesmolten en goudbruin is.'
      }
    ],
    sitemapPriority: '0.6'
  },

  /* ---------- Afvallen ---------- */
  {
    path: '/gezonde-recepten-afvallen',
    footerLabel: 'Afvallen',
    footerOverviewLabel: 'Alle afvalrecepten',
    title: 'Gezonde recepten om af te vallen: afvalrecepten – Kookkeuze',
    description:
      'Gezonde recepten om af te vallen: afvalrecepten die je filtert op calorieën, van onder de 300 tot onder de 700 kcal. Plan er meteen je weekmenu mee.',
    h1: 'Gezonde recepten om af te vallen',
    breadcrumb: 'Afvallen',
    intro: [
      'Gezonde recepten om af te vallen zijn maaltijden die vullen met groente en eiwit, voor minder calorieën. Op deze pagina staan afvalrecepten van Nederlandse kooksites die onder de 500 kcal per portie blijven; het aantal calorieën komt van de receptsite zelf.',
      'Afvallen loopt bijna nooit stuk op één maaltijd. Het loopt stuk op de avond dat je geen idee hebt wat je gaat eten en het daarom maar wordt wat er het snelst op tafel staat. Een lijst met caloriearme recepten helpt daar weinig tegen — een filter dat je in twee tellen toepast wel.',
      'Kookkeuze heeft daarom een calorieënfilter op elk recept in je database. Je vult bij het opslaan in hoeveel kcal een portie ongeveer telt, en daarna doorzoek je je hele verzameling op "onder de 300", "onder de 500", "onder de 700" — tot en met "boven de 1000" voor de dagen dat het niet hoeft.',
      'Dat filter combineer je met de rest: gezond én binnen een halfuur, of caloriearm én vegetarisch. En omdat je er meteen je weekmenu mee plant en de ingrediënten doorstuurt naar je boodschappenlijst, staat de keuze al vast voordat de honger toeslaat.'
    ],
    ctaLabel: 'Toon recepten onder 500 kcal',
    ctaFilters: { calorieRange: 'Onder 500' },
    listHeading: 'Afvalrecepten onder 500 kcal',
    listIntro: 'Recepten waarvan de receptsite zelf minder dan 500 kcal per portie opgeeft.',
    // De voorbeelddatabase heeft geen calorieen (die staan niet in de brondata
    // en verzinnen we niet), dus daaruit halen we hier niets: filterSets blijft
    // leeg. De crawler-index leest calorieen wel uit de bron, dus die vult de
    // lijst wel - alleen met recepten waar echt een getal bij staat.
    filterSets: [],
    indexFilterSets: [{ calories_max: 500 }],
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
    faq: [
      {
        q: 'Wat zijn goede recepten om af te vallen?',
        a: 'Recepten met veel groente, een magere eiwitbron (kip, vis, ei, peulvruchten, magere kwark) en een beperkte portie koolhydraten en vet. Die vullen goed voor relatief weinig calorieën, zodat je minder eet zonder honger te lijden.'
      },
      {
        q: 'Hoeveel calorieën mag een maaltijd hebben als je wilt afvallen?',
        a: 'Dat verschilt per persoon: het gaat om het totaal over de dag, niet om één maaltijd. Veel afvalschema\'s houden 400 tot 600 kcal aan voor het avondeten. Twijfel je over wat bij jou past, overleg dan met een diëtist.'
      }
    ],
    sitemapPriority: '0.7'
  },
  {
    path: '/gezonde-recepten-afvallen/avondeten-onder-400-kcal',
    redirectFrom: '/gezonde-recepten-afvallen/caloriearm-avondeten',
    parent: '/gezonde-recepten-afvallen',
    keyphrase: 'avondeten onder 400 kcal',
    footerLabel: 'Avondeten onder 400 kcal',
    title: 'Avondeten onder 400 kcal: caloriearme recepten – Kookkeuze',
    description:
      'Avondeten onder 400 kcal: caloriearme hoofdgerechten die toch vullen, van Nederlandse kooksites. Het aantal calorieën komt van de receptsite zelf.',
    h1: 'Avondeten onder 400 kcal',
    breadcrumb: 'Avondeten onder 400 kcal',
    intro: [
      'Avondeten onder 400 kcal is een hoofdgerecht dat per portie minder dan 400 kilocalorieën telt en toch vult, doordat het veel groente en eiwit bevat. Op deze pagina staan zulke hoofdgerechten van Nederlandse kooksites; het aantal calorieën komt van de receptsite zelf.',
      'Wie wil afvallen, hoeft niet op een half leeg bord te leven. Het verschil zit in de verhoudingen: meer groente, minder saus en vet, en een magere eiwitbron. Daardoor eet je een vol bord voor aanzienlijk minder calorieën.'
    ],
    ctaLabel: 'Toon avondeten onder 400 kcal',
    ctaFilters: { meal_category: 'Hoofdgerecht', calorieRange: 'Onder 400' },
    listHeading: 'Hoofdgerechten onder 400 kcal',
    listIntro: 'Recepten waarvan de receptsite zelf minder dan 400 kcal per portie opgeeft.',
    // Geen calorieën in de voorbeelddatabase, zie /gezonde-recepten-afvallen.
    filterSets: [],
    indexFilterSets: [{ meal_category: ['Hoofdgerecht'], calories_max: 400 }],
    faq: [
      {
        q: 'Is 400 kcal genoeg voor een avondmaaltijd?',
        a: 'Voor wie wil afvallen kan dat prima, zeker als je de rest van de dag genoeg eet. Het gaat om het totaal over de dag, niet om één maaltijd. Twijfel je over wat bij jou past, overleg dan met een diëtist.'
      },
      {
        q: 'Hoe maak je een gerecht caloriearmer?',
        a: 'Vervang room door magere kwark of yoghurt, bak met een theelepel olie in plaats van een klont boter, verdubbel de groente en halveer de pasta of rijst. De smaak blijft, de calorieën gaan flink omlaag.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/gezonde-recepten-afvallen/eiwitrijk-ontbijt-afvallen',
    redirectFrom: '/gezonde-recepten-afvallen/eiwitrijk-ontbijt',
    parent: '/gezonde-recepten-afvallen',
    keyphrase: 'eiwitrijk ontbijt om af te vallen',
    footerLabel: 'Eiwitrijk ontbijt om af te vallen',
    title: 'Eiwitrijk ontbijt om af te vallen: recepten – Kookkeuze',
    description:
      'Eiwitrijk ontbijt om af te vallen: overnight oats, kwark, eieren en meer. Ontbijtrecepten die lang verzadigen, zodat je minder snel trek krijgt.',
    h1: 'Eiwitrijk ontbijt om af te vallen',
    breadcrumb: 'Eiwitrijk ontbijt',
    intro: [
      'Een eiwitrijk ontbijt om af te vallen is een ontbijt met zo\'n 20 tot 30 gram eiwit, bijvoorbeeld uit kwark, Griekse yoghurt, eieren of eiwitpoeder. Eiwit verzadigt goed, waardoor je minder snel trek krijgt voor de lunch. Op deze pagina staan ontbijtrecepten met het doel "Sporten" van Nederlandse kooksites.',
      'Van overnight oats die je de avond ervoor klaarzet tot een omelet in vijf minuten: een eiwitrijk ontbijt hoeft niet meer tijd te kosten dan een boterham.'
    ],
    ctaLabel: 'Toon eiwitrijke ontbijtrecepten',
    ctaFilters: { meal_category: 'Ontbijt', meal_type: 'Sporten' },
    listHeading: 'Eiwitrijke ontbijtrecepten om af te vallen',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere eiwitrijke ontbijtjes eronder.',
    filterSets: [{ meal_category: ['Ontbijt'], meal_type: ['Sporten'] }],
    faq: [
      {
        q: 'Hoeveel eiwit zit er in een eiwitrijk ontbijt?',
        a: 'Een eiwitrijk ontbijt bevat meestal 20 tot 30 gram eiwit. Dat haal je bijvoorbeeld met 250 gram magere kwark (ongeveer 20 gram eiwit) of drie eieren (ongeveer 18 gram) met een volkoren boterham.'
      },
      {
        q: 'Wat is een snel eiwitrijk ontbijt?',
        a: 'Overnight oats met kwark of Griekse yoghurt zet je de avond ervoor in twee minuten klaar. Roerei of een omelet staat in vijf minuten op tafel. En een bak kwark met fruit en noten kost helemaal geen bereiding.'
      }
    ],
    sitemapPriority: '0.6'
  }
];

const PAGE_BY_PATH = new Map(PAGES.map(page => [page.path, page]));

function childrenOf(path) {
  return PAGES.filter(page => page.parent === path);
}

// De pagina zelf en al zijn voorouders, van de hoofdcategorie naar beneden.
function ancestry(page) {
  const chain = [];
  for (let p = page; p; p = PAGE_BY_PATH.get(p.parent)) chain.unshift(p);
  return chain;
}

/* -------------------- RENDEREN -------------------- */

// Stabiele pseudo-willekeurige sleutel per (pagina, recept). Twee pagina's met
// hetzelfde filter - /wat-eten-we-vandaag en /recepten/snel-klaar zoeken allebei
// op "onder de 30 minuten" - zouden anders exact dezelfde lijst tonen, en dat
// leest voor Google als dubbele inhoud. Deterministisch, dus de volgorde blijft
// tussen verzoeken gelijk en de cache blijft zinvol.
function volgordeSleutel(paginaPad, url) {
  let h = 2166136261;
  const invoer = `${paginaPad}|${url}`;
  for (let i = 0; i < invoer.length; i += 1) {
    h ^= invoer.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Past een recept uit de crawler-index binnen een filterset? Elke sleutel moet
// kloppen; een lijst met waarden betekent "een van deze". calories_max is
// numeriek in plaats van een keuzelijst, want calorieen zijn een getal.
// search zoekt een woord(begin) in de titel, net als het zoekveld van de
// kiezer: veel kipgerechten staan als 'Rijst' of 'Wraps' te boek, maar
// heten wel "... met kip".
function matchesFilters(recipe, filters) {
  return Object.entries(filters).every(([sleutel, waarde]) => {
    if (sleutel === 'calories_max') {
      const kcal = Number(recipe?.calories);
      return Number.isFinite(kcal) && kcal > 0 && kcal < Number(waarde);
    }
    if (sleutel === 'search') {
      // Een lijst betekent hier: álle woorden moeten erin staan.
      const titel = String(recipe?.title || '');
      return (Array.isArray(waarde) ? waarde : [waarde])
        .every(woord => new RegExp(`(^|[^a-zà-ÿ])${woord}`, 'i').test(titel));
    }
    const opties = Array.isArray(waarde) ? waarde : [waarde];
    return opties.includes(recipe?.[sleutel]);
  });
}

function renderRecipeList(page, recipes) {
  if (!recipes.length) return '';
  const items = recipes
    .map(recipe => {
      const meta = [recipe.meal_category, recipe.dish_type, recipe.time_required]
        .filter(Boolean)
        .join(' · ');
      return `
        <li class="seo-recipe-item">
          <a class="seo-recipe-title" href="${escapeHtml(recipeToolLink(page, recipe))}">${escapeHtml(recipe.title)}</a>
          ${meta ? `<p class="seo-recipe-meta">${escapeHtml(meta)}</p>` : ''}
        </li>`;
    })
    .join('');
  return `<ul class="seo-recipe-list">${items}</ul>`;
}

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
              <h3>${escapeHtml(step.title)}</h3>
              <p>${escapeHtml(step.body)}</p>
            </div>
          </li>`
        )
        .join('');
      return `      <h2>${escapeHtml(section.heading)}</h2>
      <ol class="info-steps">${steps}</ol>`;
    })
    .join('\n');
}

// Vraag-en-antwoordblokken met de vraag als kop: zo staan ze in de HTML zoals
// mensen ze intypen. Geen FAQPage-markup: Google toont die rich result alleen
// nog bij overheids- en zorgsites. Antwoorden mogen een interne link bevatten.
function renderFaq(faq) {
  if (!Array.isArray(faq) || !faq.length) return '';
  const items = faq
    .map(item => `      <h3 class="seo-faq-q">${escapeHtml(item.q)}</h3>
      <p>${item.a}</p>`)
    .join('\n');
  return `      <h2>Veelgestelde vragen</h2>
${items}`;
}

// Doorlinken naar de rest van de categorie: de bovenliggende pagina, de
// zusjes en de eigen subpagina's. Een hoofdpagina zonder boom erboven (Wat
// eten we vandaag) linkt naar de vijf hoofdcategorieën.
function relatedPages(page) {
  const parent = PAGE_BY_PATH.get(page.parent);
  const children = childrenOf(page.path);
  if (!parent && !children.length) {
    return PAGES.filter(p => !p.parent && p !== page);
  }
  const siblings = parent ? childrenOf(parent.path).filter(p => p !== page) : [];
  return [...(parent ? [parent] : []), ...children, ...siblings];
}

function renderRelated(page) {
  const related = relatedPages(page);
  if (!related.length) return '';
  const items = related
    .map(p => `<li><a href="${p.path}">${escapeHtml(p.footerLabel)}</a></li>`)
    .join('');
  return `      <h2>Meer recepten kiezen</h2>
      <ul class="seo-related">${items}</ul>`;
}

// Footer-navigatie naar alle landingspagina's, op elke pagina van de site
// (server.js zet hem ook in index.html en de statische info-pagina's). Een
// pagina met subpagina's wordt een uitklapmenu, en dat kan genest: Gezond
// avondeten > Gezonde hoofdgerechten > Gezonde pasta. Gewone <details>, dus
// zonder JavaScript en met alle links gewoon in de HTML voor crawlers.
// Het label van een menu klapt uit; de pagina zelf staat bovenaan in het menu
// (footerOverviewLabel), want een link ín een <summary> is voor
// schermlezers een knop in een knop. Op de pagina zelf wordt de link een
// <span> en staan de menu's eromheen open.
function renderFooterNode(page, currentPath, depth) {
  const children = childrenOf(page.path);
  const link = (label, target) =>
    target.path === currentPath
      ? `<span class="footer-current" aria-current="page">${escapeHtml(label)}</span>`
      : `<a href="${target.path}">${escapeHtml(label)}</a>`;

  if (!children.length) return `<li>${link(page.footerLabel, page)}</li>`;

  const containsCurrent = [page, ...PAGES.filter(p => ancestry(p).includes(page))]
    .some(p => p.path === currentPath);
  // Op het bovenste niveau staat er maar één menu tegelijk open (name=), zodat
  // de footer niet uitdijt tot een muur van links.
  const attrs = (depth === 0 ? ' name="footer-recepten"' : '') + (containsCurrent ? ' open' : '');
  const items = [
    `<li>${link(page.footerOverviewLabel || page.footerLabel, page)}</li>`,
    ...children.map(child => renderFooterNode(child, currentPath, depth + 1))
  ].join('');
  // De panel-div is er voor de open/dicht-animatie (footer-tree.js); de <ul>
  // zelf kan dat niet, want zijn eigen marges tellen mee in de hoogte.
  return `<li><details class="footer-tree-node"${attrs}><summary>${escapeHtml(page.footerLabel)}</summary><div class="footer-tree-panel"><ul>${items}</ul></div></details></li>`;
}

function renderFooterRecipeLinks(currentPath = null) {
  const items = PAGES.filter(page => !page.parent)
    .map(page => renderFooterNode(page, currentPath, 0))
    .join('\n        ');
  return `<nav class="footer-recipe-links" aria-label="Recepten kiezen">
      <span class="footer-links-label">Recepten kiezen</span>
      <ul class="footer-tree">
        ${items}
      </ul>
    </nav>
    <script src="/footer-tree.js" defer></script>`;
}

function buildJsonLd(page, recipes) {
  const crumbs = ancestry(page);
  const blocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Kookkeuze', item: SITE_URL + '/' },
        ...crumbs.map((p, index) => ({
          '@type': 'ListItem',
          position: index + 2,
          name: p.breadcrumb,
          item: SITE_URL + p.path
        }))
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
  const list = renderRecipeList(page, recipes);
  const listBlock = list
    ? `      <h2>${escapeHtml(page.listHeading)}</h2>
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
      <h1>${escapeHtml(page.h1)}</h1>

${intro}

      <p class="seo-cta">
        <a class="seo-cta-btn" href="${ctaToolLink(page)}">${escapeHtml(page.ctaLabel)}</a>
      </p>

${listBlock}

${renderExtraSections(page.extraSections)}

${renderFaq(page.faq)}

${renderRelated(page)}
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

// prepareHtml(res, html): laatste bewerking vóór versturen; de server zet er
// de CSP-nonce van dit verzoek mee op de <script>-tags.
function registerSeoPages(app, { fetchDemoRecipes, fetchIndexRecipes = () => [], prepareHtml = (_res, html) => html }) {
  const cache = new Map();

  async function loadRecipes(page) {
    const indexFilterSets = page.indexFilterSets || page.filterSets;
    if (!page.filterSets.length && !indexFilterSets.length) return [];

    const cached = cache.get(page.path);
    if (cached && Date.now() - cached.at < LIST_CACHE_MS) return cached.recipes;

    // De voorbeeldrecepten eerst: die zijn met zorg gekozen en compleet
    // ingevuld. De crawler-index vult daarna aan tot LIST_MAX, zodat een
    // pagina niet op drie regels blijft steken.
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

    if (recipes.length < LIST_MAX && indexFilterSets.length) {
      // Op URL ontdubbelen: de voorbeeldrecepten komen van dezelfde kooksites
      // die de crawler langsgaat, dus ze kunnen elkaar overlappen.
      const gezien = new Set(recipes.map(r => String(r.url || '').replace(/\/$/, '')));
      // Ook op titel ontdubbelen: sommige sites zetten hetzelfde recept onder
      // twee URL's (Jumbo doet dat met verschillende ID's achter dezelfde slug).
      // Op de pagina zie je dan twee keer dezelfde regel staan.
      const gezienTitels = new Set(
        recipes.map(r => String(r.title || '').trim().toLowerCase()).filter(Boolean)
      );
      const treffers = [];
      for (const kandidaat of fetchIndexRecipes()) {
        const url = String(kandidaat?.url || '').replace(/\/$/, '');
        if (!url || gezien.has(url)) continue;
        const titel = String(kandidaat?.title || '').trim().toLowerCase();
        if (titel && gezienTitels.has(titel)) continue;
        if (!indexFilterSets.some(filters => matchesFilters(kandidaat, filters))) continue;
        gezien.add(url);
        if (titel) gezienTitels.add(titel);
        treffers.push(kandidaat);
      }
      treffers
        .sort((a, b) => volgordeSleutel(page.path, a.url) - volgordeSleutel(page.path, b.url))
        .slice(0, LIST_MAX - recipes.length)
        .forEach(kandidaat => recipes.push(kandidaat));
    }

    cache.set(page.path, { at: Date.now(), recipes });
    return recipes;
  }

  PAGES.forEach(page => {
    if (page.redirectFrom) {
      app.get(page.redirectFrom, (_req, res) => res.redirect(301, page.path));
    }
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
      res.send(prepareHtml(res, renderPage(page, recipes)));
    });
  });
}

// Voor sitemap.xml, zodat de lijst met URL's maar op één plek staat.
function getSeoPageUrls() {
  return PAGES.map(page => ({ path: page.path, priority: page.sitemapPriority }));
}

module.exports = { registerSeoPages, getSeoPageUrls, renderFooterRecipeLinks };
