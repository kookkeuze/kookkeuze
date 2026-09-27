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
  const filters = matched ? toToolFilters(matched) : page.ctaFilters;
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
    path: '/recepten/snel-klaar/pasta',
    parent: '/recepten/snel-klaar',
    footerLabel: 'Snelle pasta',
    title: 'Snelle pasta recepten: binnen 30 minuten klaar – Kookkeuze',
    description:
      'Snelle pasta recepten die binnen 30 minuten op tafel staan, verzameld van Nederlandse kooksites. Kies er zelf één of laat Kookkeuze willekeurig kiezen.',
    h1: 'Snelle pasta recepten — binnen 30 minuten klaar',
    breadcrumb: 'Snelle pasta',
    intro: [
      'Snelle pasta recepten zijn pastagerechten die je in een halfuur of minder op tafel zet: terwijl de pasta kookt, maak je de saus. Hieronder staan pastarecepten van Nederlandse kooksites die in Kookkeuze als "onder de 30 minuten" te boek staan.',
      'Pasta is het klassieke doordeweekse gerecht omdat het vergevingsgezind is: een pot pesto, wat groente die op moet, een stuk kip of een blik tonijn en je hebt een maaltijd. Het lastige is niet het koken maar het kiezen. Daarom zet de knop hieronder de receptkiezer meteen op pasta én op onder de 30 minuten.',
      'Vind je een recept dat je vaker wilt maken? Met een gratis account sla je het op in je eigen receptendatabase, zet je het in je weekmenu en stuur je de ingrediënten door naar je boodschappenlijst.'
    ],
    ctaLabel: 'Toon snelle pastarecepten',
    ctaFilters: { dish_type: 'Pasta', time_required: 'Onder de 30 minuten' },
    listHeading: 'Pasta binnen 30 minuten',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere snelle pastarecepten eronder.',
    filterSets: [{ dish_type: ['Pasta'], time_required: ['Onder de 30 minuten'] }],
    faq: [
      {
        q: 'Welke pasta is het snelst klaar?',
        a: 'Verse pasta en dunne pastasoorten. Verse tagliatelle is in een paar minuten gaar, capellini en spaghettini ook. Penne en fusilli hebben tien tot twaalf minuten nodig — genoeg tijd om de saus te maken, dus ook die halen de 30 minuten makkelijk.'
      },
      {
        q: 'Hoe maak je pasta sneller klaar?',
        a: 'Zet het water op vóórdat je gaat snijden, doe een deksel op de pan en maak de saus terwijl de pasta kookt. Kies een saus die niet hoeft te sudderen, zoals pesto, een roomsaus of cherrytomaatjes die je in de pan laat openbarsten.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/snel-klaar/lunch',
    parent: '/recepten/snel-klaar',
    footerLabel: 'Snelle lunch',
    title: 'Snelle lunch: lunchrecepten binnen 30 minuten – Kookkeuze',
    description:
      'Snelle lunchrecepten die binnen 30 minuten klaar zijn: wraps, broodjes, soep en salades voor thuis of om mee te nemen. Filter en kies in één klik.',
    h1: 'Snelle lunch — recepten binnen 30 minuten',
    breadcrumb: 'Snelle lunch',
    intro: [
      'Een snelle lunch is een lunchrecept dat binnen een halfuur klaar is, zodat je tussen de middag niet je hele pauze in de keuken staat. Op deze pagina staan lunchrecepten van Nederlandse kooksites die onder de 30 minuten blijven: wraps, broodjes, soepen en salades.',
      'Wie thuiswerkt kent het: om half één trek je voor de derde keer die dag de koelkast open en eindigt het toch weer bij een boterham met kaas. Niets mis mee, maar met een paar vaste lunchrecepten achter de hand eet je gevarieerder zonder dat het meer moeite kost.',
      'De knop hieronder opent de receptkiezer op lunch én op onder de 30 minuten. Wil je het eiwitrijker, zet dan het doel erbij op "Sporten".'
    ],
    ctaLabel: 'Toon snelle lunchrecepten',
    ctaFilters: { meal_category: 'Lunch', time_required: 'Onder de 30 minuten' },
    listHeading: 'Lunch binnen 30 minuten',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere snelle lunchrecepten eronder.',
    filterSets: [{ meal_category: ['Lunch'], time_required: ['Onder de 30 minuten'] }],
    faq: [
      {
        q: 'Wat is een gezonde snelle lunch?',
        a: 'Een lunch met volkoren brood of een volkoren wrap, een eiwitbron zoals ei, kip, hummus of kwark, en groente. Een maaltijdsalade of een kom soep met brood telt ook. In de receptkiezer combineer je "Lunch" met het doel "Sporten" of met een calorieëngrens.'
      },
      {
        q: 'Kun je een lunch de avond ervoor maken?',
        a: 'Soepen, pastasalades en gevulde wraps kun je prima een dag van tevoren maken; ze blijven in de koelkast goed. Broodjes en salades met blad maak je liever op de dag zelf, anders worden ze slap.'
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
    path: '/recepten/avondeten/makkelijk/gezond',
    parent: '/recepten/avondeten/makkelijk',
    footerLabel: 'Makkelijk en gezond',
    title: 'Makkelijk en gezond avondeten: snelle recepten – Kookkeuze',
    description:
      'Recepten voor avondeten dat makkelijk én gezond is: eiwitrijke hoofdgerechten die binnen 45 minuten klaar zijn. Kies zelf of laat Kookkeuze kiezen.',
    h1: 'Makkelijk en gezond avondeten',
    breadcrumb: 'Makkelijk en gezond',
    intro: [
      'Makkelijk en gezond avondeten zijn hoofdgerechten die weinig tijd kosten en toch voedzaam zijn: veel groente, een goede eiwitbron en binnen 45 minuten op tafel. Op deze pagina staan zulke recepten van Nederlandse kooksites, verzameld door Kookkeuze.',
      'Gezond eten en makkelijk koken lijken soms elkaars tegenpolen: gezond betekent snijden, wegen en plannen, makkelijk betekent iets uit de vriezer. Deze recepten zitten ertussenin. Denk aan een traybake uit de oven, een roerbakgerecht met kip of een pasta met veel groente in de saus.',
      'De knop hieronder zet de receptkiezer op hoofdgerechten met het doel "Sporten" die hooguit 45 minuten duren. Zit er niets bij dat je aanspreekt, druk dan op Random.'
    ],
    ctaLabel: 'Kies makkelijk en gezond',
    ctaFilters: {
      meal_category: 'Hoofdgerecht',
      meal_type: 'Sporten',
      time_required: ['Onder de 30 minuten', '30 - 45 minuten']
    },
    listHeading: 'Makkelijke, gezonde hoofdgerechten',
    listIntro: 'Eiwitrijke hoofdgerechten die hooguit 45 minuten kosten.',
    filterSets: [
      {
        meal_category: ['Hoofdgerecht'],
        meal_type: ['Sporten'],
        time_required: ['Onder de 30 minuten', '30 - 45 minuten']
      }
    ],
    faq: [
      {
        q: 'Wat is een makkelijk en gezond avondeten?',
        a: 'Een hoofdgerecht met weinig stappen en weinig afwas dat toch groente en eiwit bevat. Ovenschotels, roerbakgerechten en maaltijdsalades zijn de bekendste voorbeelden: je snijdt alles in één keer en de pan of oven doet de rest.'
      },
      {
        q: 'Hoe houd je gezond eten doordeweeks vol?',
        a: 'Door de keuze niet elke dag opnieuw te maken. Plan in het weekend drie of vier avonden vooruit in de weekmenuplanner, stuur de ingrediënten naar je boodschappenlijst en haal alles in één keer in huis.'
      }
    ],
    sitemapPriority: '0.7'
  },
  {
    path: '/recepten/avondeten/makkelijk/ovenschotels',
    parent: '/recepten/avondeten/makkelijk',
    footerLabel: 'Ovenschotels',
    title: 'Makkelijke ovenschotels: recepten uit de oven – Kookkeuze',
    description:
      'Makkelijke ovenschotel recepten voor het avondeten: even snijden, de oven in en de rest gaat vanzelf. Kies er één of laat Kookkeuze voor je kiezen.',
    h1: 'Makkelijke ovenschotels voor het avondeten',
    breadcrumb: 'Ovenschotels',
    intro: [
      'Een ovenschotel is een gerecht dat je in een ovenschaal opbouwt en in de oven gaar laat worden: aardappel, pasta of rijst met groente, vlees of vis, vaak met een laagje kaas erover. Het is het ultieme makkelijke avondeten, want terwijl de oven werkt heb jij je handen vrij.',
      'Op deze pagina staan ovenschotels die als hoofdgerecht bedoeld zijn, van Nederlandse kooksites. Veel ervan zijn ook handig om vooruit te maken: je zet ze \'s middags in elkaar en schuift ze om zes uur de oven in.',
      'Zoek je iets dat sneller gaat? Zet in de receptkiezer de tijd erbij op "30 - 45 minuten" en je houdt alleen de ovenschotels over die doordeweeks haalbaar zijn.'
    ],
    ctaLabel: 'Toon ovenschotels',
    ctaFilters: { dish_type: 'Ovenschotel', meal_category: 'Hoofdgerecht' },
    listHeading: 'Ovenschotels als hoofdgerecht',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere ovenschotels eronder.',
    filterSets: [{ dish_type: ['Ovenschotel'], meal_category: ['Hoofdgerecht'] }],
    faq: [
      {
        q: 'Kun je een ovenschotel van tevoren maken?',
        a: 'Ja. De meeste ovenschotels kun je een dag van tevoren opbouwen, afgedekt in de koelkast bewaren en pas bij het eten in de oven zetten. Reken dan op tien tot vijftien minuten extra oventijd, omdat de schaal koud de oven in gaat.'
      },
      {
        q: 'Kun je een ovenschotel invriezen?',
        a: 'Schotels met gehakt, pasta of rijst vriezen goed in. Met aardappel en veel room kan de structuur korrelig worden. Laat een ingevroren schotel een nacht in de koelkast ontdooien voordat hij de oven in gaat.'
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
        a: 'Zeker. Ovenschotels, traybakes en roerbakgerechten zijn gezond te maken met weinig werk. Op de pagina <a href="/recepten/avondeten/makkelijk/gezond">makkelijk en gezond avondeten</a> staan hoofdgerechten die hooguit 45 minuten kosten.'
      }
    ],
    sitemapPriority: '0.8'
  },
  {
    path: '/recepten/avondeten/gezond/hoofdgerechten',
    parent: '/recepten/avondeten/gezond',
    footerLabel: 'Gezonde hoofdgerechten',
    footerOverviewLabel: 'Alle gezonde hoofdgerechten',
    title: 'Gezonde hoofdgerechten: recepten voor het diner – Kookkeuze',
    description:
      'Gezonde hoofdgerechten voor het avondeten: eiwitrijke recepten en maaltijden onder de 500 kcal, met pasta, kip, vis of rijst. Filter en kies in één klik.',
    h1: 'Gezonde hoofdgerechten',
    breadcrumb: 'Gezonde hoofdgerechten',
    intro: [
      'Gezonde hoofdgerechten zijn avondmaaltijden die voedzaam zijn zonder zwaar te zijn: genoeg eiwit, veel groente en niet meer calorieën dan nodig. Op deze pagina staan hoofdgerechten met het doel "Sporten" of met minder dan 500 kcal per portie, van Nederlandse kooksites.',
      'Het zijn gewone gerechten — pasta, rijst, ovenschotels, wraps — alleen net anders opgebouwd: meer groente in de saus, magere kip of vis in plaats van worst, volkoren waar het kan. Daardoor passen ze ook in een week waarin je op je eten let.',
      'Weet je al waar je zin in hebt? Kies hieronder een gezond gerecht met pasta, kip of vis, of open de receptkiezer en zet zelf je filters.'
    ],
    ctaLabel: 'Toon gezonde hoofdgerechten',
    ctaFilters: { meal_category: 'Hoofdgerecht', meal_type: 'Sporten' },
    listHeading: 'Gezonde hoofdgerechten voor het diner',
    listIntro: 'Eiwitrijke hoofdgerechten en hoofdgerechten onder de 500 kcal.',
    filterSets: [{ meal_category: ['Hoofdgerecht'], meal_type: ['Sporten'] }],
    indexFilterSets: [
      { meal_category: ['Hoofdgerecht'], meal_type: ['Sporten'] },
      { meal_category: ['Hoofdgerecht'], calories_max: 500 }
    ],
    faq: [
      {
        q: 'Wat maakt een hoofdgerecht gezond?',
        a: 'Een gezond hoofdgerecht heeft veel groente, een eiwitbron als kip, vis, peulvruchten of ei, en een verzadigende volkoren basis zoals volkoren pasta, zilvervliesrijst of aardappel. Saus en vet houd je bescheiden, zodat het bord vult zonder zwaar te worden.'
      },
      {
        q: 'Hoeveel calorieën heeft een gezond hoofdgerecht?',
        a: 'Dat hangt af van je dag en je lichaam. Een veelgebruikte vuistregel is 500 tot 700 kcal voor een avondmaaltijd; wie wil afvallen houdt vaak onder de 500 kcal aan. In de receptkiezer filter je direct op een calorieëngrens.'
      }
    ],
    sitemapPriority: '0.7'
  },
  {
    path: '/recepten/avondeten/gezond/pasta',
    parent: '/recepten/avondeten/gezond/hoofdgerechten',
    footerLabel: 'Gezonde pasta',
    title: 'Gezonde pasta recepten voor het avondeten – Kookkeuze',
    description:
      'Gezonde pasta recepten: eiwitrijke pastagerechten en pasta onder de 500 kcal, met veel groente. Kies er één of laat Kookkeuze kiezen wat je eet.',
    h1: 'Gezonde pasta recepten',
    breadcrumb: 'Gezonde pasta',
    intro: [
      'Gezonde pasta recepten zijn pastagerechten met veel groente, een magere eiwitbron en een lichte saus, zodat een bord pasta gewoon in een gezond eetpatroon past. Hier staan pastarecepten die als sportief gemarkeerd zijn of onder de 500 kcal per portie blijven.',
      'Pasta heeft een slechtere naam dan nodig. Het probleem zit zelden in de pasta zelf, maar in de hoeveelheid en in wat eroverheen gaat. Met volkoren pasta of pasta van peulvruchten, een saus op basis van tomaat of kwark en een stevige portie groente eet je een volwaardige maaltijd die niet zwaar valt.',
      'Klik op een recept om het te openen in de receptkiezer, met de andere gezonde pastarecepten eronder.'
    ],
    ctaLabel: 'Toon gezonde pastarecepten',
    ctaFilters: { dish_type: 'Pasta', meal_type: 'Sporten' },
    listHeading: 'Gezonde pastagerechten',
    listIntro: 'Eiwitrijke pasta en pasta onder de 500 kcal.',
    filterSets: [{ dish_type: ['Pasta'], meal_type: ['Sporten'] }],
    indexFilterSets: [
      { dish_type: ['Pasta'], meal_type: ['Sporten'] },
      { dish_type: ['Pasta'], calories_max: 500 }
    ],
    faq: [
      {
        q: 'Is pasta gezond?',
        a: 'Pasta kan prima deel uitmaken van een gezond avondeten. Kies bij voorkeur volkoren pasta — die staat in de Schijf van Vijf van het Voedingscentrum — houd de portie rond de 75 tot 100 gram ongekookt per persoon en vul de rest van het bord met groente.'
      },
      {
        q: 'Hoe maak je pasta gezonder?',
        a: 'Gebruik volkoren pasta of pasta van linzen of kikkererwten, maak de saus met tomaat, groente of magere kwark in plaats van room, en voeg kip, vis of peulvruchten toe voor extra eiwit.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/gezond/kip',
    parent: '/recepten/avondeten/gezond/hoofdgerechten',
    footerLabel: 'Gezond met kip',
    title: 'Gezonde recepten met kip voor het avondeten – Kookkeuze',
    description:
      'Gezonde kip recepten voor het avondeten: eiwitrijke gerechten met kipfilet en maaltijden onder de 500 kcal. Kies er één of laat Kookkeuze kiezen.',
    h1: 'Gezonde recepten met kip',
    breadcrumb: 'Gezond met kip',
    intro: [
      'Gezonde recepten met kip zijn gerechten waarin mager kippenvlees de eiwitbron is, gecombineerd met groente en een lichte basis zoals rijst, wraps of salade. Op deze pagina staan kiprecepten die als sportief gemarkeerd zijn of onder de 500 kcal per portie blijven.',
      'Kipfilet is voor veel mensen de basis van een gezond avondeten: het is mager, eiwitrijk en neemt elke smaak aan. Juist daardoor wordt het ook snel saai. Met een lijst gerechten om uit te kiezen — van roerbak tot traybake en van wrap tot curry — voorkom je dat het elke week dezelfde kip met rijst wordt.'
    ],
    ctaLabel: 'Toon gezonde kiprecepten',
    ctaFilters: { dish_type: 'Kip', meal_type: 'Sporten' },
    listHeading: 'Gezonde gerechten met kip',
    listIntro: 'Eiwitrijke kipgerechten en kip onder de 500 kcal.',
    filterSets: [{ dish_type: ['Kip'], meal_type: ['Sporten'] }],
    indexFilterSets: [
      { dish_type: ['Kip'], meal_type: ['Sporten'] },
      { dish_type: ['Kip'], calories_max: 500 },
      { search: 'kip', meal_type: ['Sporten'] },
      { search: 'kip', calories_max: 500 }
    ],
    faq: [
      {
        q: 'Hoeveel eiwit zit er in kipfilet?',
        a: 'Rauwe kipfilet bevat ongeveer 22 tot 24 gram eiwit per 100 gram, bij heel weinig vet. Daarom is kip zo\'n vaste waarde in eiwitrijke recepten.'
      },
      {
        q: 'Hoe voorkom je droge kipfilet?',
        a: 'Snijd de filet in gelijke stukken of plet hem tot een gelijke dikte, bak hem op hoog vuur gaar maar niet langer dan nodig, en laat hem daarna even rusten. Kipdijfilet is sappiger en past ook in de meeste gezonde recepten.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/gezond/vis',
    parent: '/recepten/avondeten/gezond/hoofdgerechten',
    footerLabel: 'Gezonde vis',
    title: 'Gezonde vis recepten voor het avondeten – Kookkeuze',
    description:
      'Gezonde visrecepten voor het avondeten: zalm, witvis en garnalen in eiwitrijke gerechten en maaltijden onder de 500 kcal. Kies in één klik.',
    h1: 'Gezonde vis recepten',
    breadcrumb: 'Gezonde vis',
    intro: [
      'Gezonde vis recepten zijn avondmaaltijden met vis in de hoofdrol — zalm, witvis, tonijn of garnalen — gecombineerd met groente en een lichte basis. Hier staan visgerechten die als sportief gemarkeerd zijn of onder de 500 kcal per portie blijven.',
      'Het Voedingscentrum adviseert één keer per week vis te eten, bij voorkeur vette vis zoals zalm, makreel of haring. In de praktijk schiet dat er vaak bij in, omdat vis minder vanzelfsprekend is dan kip of gehakt. Een paar vaste visrecepten helpen om het er echt in te houden.'
    ],
    ctaLabel: 'Toon gezonde visrecepten',
    ctaFilters: { dish_type: 'Vis', meal_type: 'Sporten' },
    listHeading: 'Gezonde visgerechten',
    listIntro: 'Eiwitrijke visgerechten en vis onder de 500 kcal.',
    filterSets: [{ dish_type: ['Vis'], meal_type: ['Sporten'] }],
    indexFilterSets: [
      { dish_type: ['Vis'], meal_type: ['Sporten'] },
      { dish_type: ['Vis'], calories_max: 500 }
    ],
    faq: [
      {
        q: 'Welke vis is het gezondst?',
        a: 'Vette vis zoals zalm, makreel, haring en sardines bevat de meeste omega-3-vetzuren; het Voedingscentrum raadt vooral die aan. Witvis als kabeljauw en koolvis is magerder en eiwitrijk. Beide passen in een gezond avondeten.'
      },
      {
        q: 'Hoe weet je wanneer vis gaar is?',
        a: 'Vis is gaar als het vlees ondoorzichtig is geworden en makkelijk uit elkaar valt in lamellen. Een moot zalm of kabeljauw van twee centimeter dik heeft in de pan of oven meestal acht tot twaalf minuten nodig.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/gezond/maaltijdsalades',
    parent: '/recepten/avondeten/gezond',
    footerLabel: 'Maaltijdsalades',
    title: 'Maaltijdsalades: gezonde salades als avondeten – Kookkeuze',
    description:
      'Maaltijdsalade recepten die als volwaardig avondeten of lunch dienen: met kip, vis, pasta of peulvruchten. Kies een salade of laat Kookkeuze kiezen.',
    h1: 'Maaltijdsalades als gezond avondeten',
    breadcrumb: 'Maaltijdsalades',
    intro: [
      'Een maaltijdsalade is een salade die een complete maaltijd vormt: naast blad en groente zit er een eiwitbron in, zoals kip, vis, ei of peulvruchten, en een verzadigende basis als pasta, couscous, quinoa of aardappel. Op deze pagina staan saladerecepten van Nederlandse kooksites.',
      'Een maaltijdsalade is ideaal op warme dagen en op avonden dat je geen zin hebt om lang achter het fornuis te staan. Veel salades kun je bovendien in een grotere portie maken en de volgende dag als lunch meenemen.'
    ],
    ctaLabel: 'Toon maaltijdsalades',
    ctaFilters: { meal_category: 'Salade' },
    listHeading: 'Salades voor avondeten en lunch',
    listIntro: 'Klik op een salade om hem in de receptkiezer te openen, met de andere salades eronder.',
    filterSets: [{ meal_category: ['Salade'] }],
    faq: [
      {
        q: 'Hoe maak je een salade verzadigend?',
        a: 'Zorg voor drie dingen: eiwit (kip, vis, ei, feta of bonen), een koolhydraatbron (volkoren pasta, couscous, quinoa of aardappel) en iets met vet of crunch, zoals noten, avocado of een dressing met olijfolie. Met alleen blad en groente heb je na een uur weer honger.'
      },
      {
        q: 'Kun je een maaltijdsalade van tevoren maken?',
        a: 'Ja, als je de dressing apart houdt. Pasta-, couscous- en linzensalades blijven een dag goed in de koelkast; blad en avocado voeg je pas vlak voor het eten toe.'
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
    path: '/recepten/avondeten/lekker/maaltijdsoep',
    parent: '/recepten/avondeten/lekker',
    footerLabel: 'Maaltijdsoepen',
    title: 'Maaltijdsoep recepten: soep als avondeten – Kookkeuze',
    description:
      'Maaltijdsoep recepten die als volwaardig avondeten dienen: vullende soepen met groente, peulvruchten, kip of gehakt. Kies een soep of laat Kookkeuze kiezen.',
    h1: 'Maaltijdsoepen: soep als avondeten',
    breadcrumb: 'Maaltijdsoepen',
    intro: [
      'Een maaltijdsoep is een soep die stevig genoeg is om als hoofdgerecht te eten: met groente, peulvruchten, pasta, aardappel of vlees erin, en vaak met brood erbij. Op deze pagina staan soeprecepten die als hoofdgerecht bedoeld zijn, van Nederlandse kooksites.',
      'Soep als avondeten is goedkoop, makkelijk in grote hoeveelheden te maken en de volgende dag vaak nog lekkerder. Denk aan erwtensoep, een pittige linzensoep, Thaise kippensoep of tomatensoep met balletjes.'
    ],
    ctaLabel: 'Toon maaltijdsoepen',
    ctaFilters: { dish_type: 'Soep', meal_category: 'Hoofdgerecht' },
    listHeading: 'Soepen als hoofdgerecht',
    listIntro: 'Klik op een soep om hem in de receptkiezer te openen, met de andere maaltijdsoepen eronder.',
    filterSets: [{ dish_type: ['Soep'], meal_category: ['Hoofdgerecht'] }],
    faq: [
      {
        q: 'Hoe maak je soep vullender?',
        a: 'Voeg peulvruchten (linzen, kikkererwten, bonen), aardappel, pasta of rijst toe, of een eiwitbron als kip, gehaktballetjes of ei. Met volkorenbrood erbij is een soep een complete maaltijd.'
      },
      {
        q: 'Kun je maaltijdsoep invriezen?',
        a: 'De meeste soepen vriezen uitstekend in. Soepen met pasta of aardappel kunnen na het ontdooien wat papperig worden; vries die liever zonder pasta in en kook de pasta vers bij het opwarmen.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/recepten/avondeten/lekker/wraps',
    parent: '/recepten/avondeten/lekker',
    footerLabel: 'Wraps',
    title: 'Wraps recepten: lekkere wraps als avondeten – Kookkeuze',
    description:
      'Wraps recepten voor het avondeten: met kip, gehakt, vis of vegetarisch, uit de pan of de oven. Kies een wrap of laat Kookkeuze voor je kiezen.',
    h1: 'Wraps als avondeten',
    breadcrumb: 'Wraps',
    intro: [
      'Wraps als avondeten zijn tortilla\'s die je vult met een warme vulling — kip, gehakt, vis of groente — en afmaakt met saus, sla en kaas. Je rolt ze aan tafel zelf op, of je maakt er een ovenschotel van. Op deze pagina staan wrapsrecepten die als hoofdgerecht bedoeld zijn.',
      'Wraps zijn populair bij gezinnen omdat iedereen zijn eigen wrap vult: wie geen paprika lust, laat hem gewoon weg. En ze zijn snel — veel vullingen staan in een kwartier in de pan.'
    ],
    ctaLabel: 'Toon wrapsrecepten',
    ctaFilters: { dish_type: 'Wraps', meal_category: 'Hoofdgerecht' },
    listHeading: 'Wraps als hoofdgerecht',
    listIntro: 'Klik op een recept om het in de receptkiezer te openen, met de andere wraps eronder.',
    filterSets: [{ dish_type: ['Wraps'], meal_category: ['Hoofdgerecht'] }],
    faq: [
      {
        q: 'Hoe houd je wraps warm en soepel?',
        a: 'Verwarm de wraps kort in een droge koekenpan of een paar seconden in de magnetron, en leg ze onder een schone theedoek. Koude wraps scheuren sneller bij het oprollen.'
      },
      {
        q: 'Welke vulling is lekker in een wrap?',
        a: 'Klassiekers zijn kip met paprika en ui, gekruid gehakt met bonen en mais, en gebakken vis met koolsla. Maak het af met iets fris, zoals salsa, zure room, avocado of komkommer.'
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
    path: '/gezonde-recepten-afvallen/caloriearm-avondeten',
    parent: '/gezonde-recepten-afvallen',
    footerLabel: 'Caloriearm avondeten',
    title: 'Caloriearm avondeten: recepten onder 400 kcal – Kookkeuze',
    description:
      'Caloriearm avondeten: hoofdgerechten onder de 400 kcal per portie, van Nederlandse kooksites. Handig als je wilt afvallen. Kies in één klik.',
    h1: 'Caloriearm avondeten: recepten onder 400 kcal',
    breadcrumb: 'Caloriearm avondeten',
    intro: [
      'Caloriearm avondeten is een hoofdgerecht met minder dan zo\'n 400 kcal per portie dat je toch vult, doordat het veel groente en eiwit bevat. Op deze pagina staan zulke hoofdgerechten van Nederlandse kooksites; het aantal calorieën komt van de receptsite zelf.',
      'Wie wil afvallen, hoeft niet op een half leeg bord te leven. Het verschil zit vooral in de verhoudingen: meer groente, minder saus en vet, en een magere eiwitbron. Daardoor eet je een vol bord voor aanzienlijk minder calorieën.'
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
        q: 'Waarom vult een caloriearm recept toch?',
        a: 'Groente en eiwit geven volume en verzadiging voor relatief weinig calorieën. Een bord met veel groente, kip of vis en een kleine portie rijst of aardappel voelt daardoor als een volle maaltijd.'
      },
      {
        q: 'Hoe maak je een gerecht caloriearmer?',
        a: 'Vervang room door magere kwark of yoghurt, bak met een theelepel olie in plaats van een klont boter, verdubbel de groente en halveer de pasta of rijst. De smaak blijft, de calorieën gaan flink omlaag.'
      }
    ],
    sitemapPriority: '0.6'
  },
  {
    path: '/gezonde-recepten-afvallen/eiwitrijk-ontbijt',
    parent: '/gezonde-recepten-afvallen',
    footerLabel: 'Eiwitrijk ontbijt',
    title: 'Eiwitrijk ontbijt: gezonde ontbijtrecepten – Kookkeuze',
    description:
      'Eiwitrijk ontbijt recepten: overnight oats, kwark, eieren en meer. Gezonde ontbijtrecepten die lang verzadigen, handig bij sporten en afvallen.',
    h1: 'Eiwitrijk ontbijt',
    breadcrumb: 'Eiwitrijk ontbijt',
    intro: [
      'Een eiwitrijk ontbijt is een ontbijt met een flinke portie eiwit, bijvoorbeeld uit kwark, Griekse yoghurt, eieren of eiwitpoeder. Eiwit verzadigt goed, waardoor je minder snel trek krijgt voor de lunch. Op deze pagina staan ontbijtrecepten met het doel "Sporten", van Nederlandse kooksites.',
      'Van overnight oats die je de avond ervoor klaarzet tot een omelet in vijf minuten: een eiwitrijk ontbijt hoeft niet meer tijd te kosten dan een boterham. Handig als je sport, maar net zo goed als je wilt afvallen.'
    ],
    ctaLabel: 'Toon eiwitrijke ontbijtrecepten',
    ctaFilters: { meal_category: 'Ontbijt', meal_type: 'Sporten' },
    listHeading: 'Eiwitrijke ontbijtrecepten',
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
      return new RegExp(`(^|[^a-zà-ÿ])${waarde}`, 'i').test(String(recipe?.title || ''));
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
  return `<li><details class="footer-tree-node"${attrs}><summary>${escapeHtml(page.footerLabel)}</summary><ul>${items}</ul></details></li>`;
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
    </nav>`;
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
