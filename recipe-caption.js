// recipe-caption.js – een Instagram-caption (of de beschrijving van een pin)
// opdelen in titel, ingrediënten en bereidingsstappen.
//
// Captions zijn rommelig: kopjes met emoji, sierletters of hoofdletters,
// soms helemaal geen kopjes, genummerde of juist losse stappen, alles op één
// regel, en aan het eind hashtags en "volg mij". We lopen de regels één voor
// één af en houden bij in welk deel van de caption we zitten (intro,
// ingrediënten, bereiding, overig zoals voedingswaarden, afsluiting). Een
// kopje zet dat deel vast; zonder kopje beslist de regel zelf: begint hij met
// een hoeveelheid en eenheid, of met een werkwoord als "Snijd" of "Preheat"?
//
// Los van server.js, zodat het zonder server of database te testen is.

const { normalizeIngredientText, dedupeIngredients } = require('./recipe-text');

const MAX_STEPS = 40;

/* -------------------- Tekens en regels opschonen -------------------- */

// Makers schrijven kopjes vaak in "sierletters" (𝘐𝘯𝘨𝘳𝘦𝘥𝘪𝘦𝘯𝘵𝘦𝘯, 𝗕𝗲𝗿𝗲𝗶𝗱𝗶𝗻𝗴):
// Unicode-wiskundesymbolen die op letters lijken. Die zetten we om naar gewone
// letters, anders herkent de parser geen enkel kopje. Alleen dat blok, want
// NFKC op de hele tekst zou ook ½ in 1⁄2 veranderen.
function normalizeFancyText(text) {
  return String(text || '').replace(/[\u{1D400}-\u{1D7FF}]/gu, ch => ch.normalize('NFKC'));
}

// Emoji en pijltjes/symbolen die als opsommingsteken of versiering dienen.
const DECORATION = '(?:\\p{Extended_Pictographic}|[\\u2190-\\u27BF\\u2B00-\\u2BFF\\uFE0E\\uFE0F\\u200D])';
const DECORATION_RE = new RegExp(DECORATION, 'gu');
const BULLET_CHARS = '\\-•*–—·▪◦●○■□◆◇►▸>»~+✓';
const LEADING_BULLET_RE = new RegExp(`^(?:[\\s${BULLET_CHARS}]|${DECORATION})+`, 'u');
const STARTS_WITH_BULLET_RE = new RegExp(`^(?:[${BULLET_CHARS}]|${DECORATION})`, 'u');
const TRAILING_DECORATION_RE = new RegExp(`(?:\\s|${DECORATION})+$`, 'u');

// Verwijder leidende opsommingstekens én emoji/symbolen van een regel.
function stripLeadingBullet(line) {
  return String(line || '').replace(LEADING_BULLET_RE, '').trim();
}

function startsWithBullet(line) {
  return STARTS_WITH_BULLET_RE.test(String(line || ''));
}

function deaccent(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Onzichtbare opvultekens (Instagram-spaties als ⠀) weg, gewone spaties gelijk.
function cleanRawLine(raw) {
  return String(raw || '')
    .replace(/[\u2800\u3164\u115F\u200B\u200C\u2060\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    // Cijfer-emoji ("1️⃣ Verwarm…", "🔟") worden gewone nummers.
    .replace(/^(\d)\uFE0F?\u20E3\s*/u, '$1. ')
    .replace(/^\u{1F51F}\s*/u, '10. ');
}

// Regels die alleen als witregel dienen ("." of "⠀" of "-").
function isSpacerLine(line) {
  return !line || /^[.\-_•*~=·|,]+$/.test(line);
}

/* -------------------- Kopjes -------------------- */

// "Ingrediënten voor de pasta", "Bereiding van de saus" (maar niet "Bereiding
// van de lekkerste lasagne ooit", dat is een titel).
const SUFFIX = "(?: (?:voor|for)(?: [\\p{L}'’]+){1,4}| (?:van|of) (?:de|het|the) [\\p{L}'’]+)?";
const HEADER_PATTERNS = [
  ['ingredients', new RegExp(
    '^(?:de |the |alle )?(?:ingredient(?:en|s)?|ingredientenlijst(?:je)?|ingredients? list|benodigdheden|' +
    'boodschappen(?:lijst(?:je)?)?|wat (?:heb )?je nodig(?: hebt)?|dit heb je nodig|je hebt nodig|nodig|' +
    "what you(?:'ll| will)? need|you(?:'ll| will)? need|shopping list|grocery list)" + SUFFIX + '$', 'u')],
  ['steps', new RegExp(
    '^(?:de |the )?(?:bereiding(?:swijze)?|werkwijze|instructies?|aan de slag|' +
    "zo maak je (?:het|dit|deze|ze|hem|'?m|'?t)(?: klaar)?|zo maak je|hoe maak je (?:het|dit)|maken|bereiden|" +
    'stappen(?:plan)?|stap voor stap|methode|method|directions?|instructions?|steps?|step by step|' +
    "how to(?: make(?: it| this)?)?|preparation|to make|let'?s make it|let'?s cook)" + SUFFIX + '$', 'u')],
  ['other', new RegExp(
    "^(?:voedingswaarden?|nutrition(?: facts| info)?|nutritional info|macros?|macro'?s|" +
    '(?:totaal |total )?per (?:portie|serving|persoon|person|stuk|bord)|totaal|totals?|' +
    'tips?|pro tips?|tip van de chef|notes?|opmerkingen?|let op|bewaren|bewaartips?|bewaaradvies|storage|' +
    'serveertips?|serveersuggesties?|serving suggestions?|variaties?|variations?|swaps?|faq|' +
    'kcal|calorie[eë]?n|calories)(?: per (?:portie|serving|persoon|person|stuk|bord))?' + SUFFIX + '$', 'u')],
  // "Recept 👇": geen eigen deel, de ingrediënten volgen nog.
  ['recipe', /^(?:het |the )?(?:recept|recipe)(?: hieronder| below| in de caption)?$/u]
];

// Het kopje zelf, zonder versiering: "🥘 **INGREDIËNTEN** (2 pers.) 👇" → "ingredienten".
function headerKey(text) {
  return deaccent(stripLeadingBullet(normalizeFancyText(text))).toLowerCase()
    .replace(/[’‘´]/g, "'")
    .replace(/[*_~`"“”„]+/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:voor|for|serves|makes|goed voor)\s+\d+\s*(?:(?:-|tot|à|to)\s*\d+\s*)?(?:personen|persoon|pers\.?|porties?|people|persons|servings?|stuks?)?/g, ' ')
    .replace(/\b\d+\s*(?:personen|persoon|pers\.?|porties?|servings?)\b/g, ' ')
    .replace(DECORATION_RE, ' ')
    .replace(/[:：.!?\-–—=>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchHeaderKey(text) {
  const key = headerKey(text);
  if (!key || key.length > 50) return null;
  for (const [kind, re] of HEADER_PATTERNS) {
    if (re.test(key)) return kind;
  }
  return null;
}

// Is deze regel een kopje? Geeft { kind, rest } terug; `rest` is wat er na de
// dubbele punt op dezelfde regel staat ("Ingrediënten: 200 g pasta, 1 ui").
function detectHeader(line) {
  const plain = stripLeadingBullet(line).replace(TRAILING_DECORATION_RE, '');
  if (!plain) return null;
  // Een volzin is geen kopje ("Bereiding duurt maar 10 minuten!").
  if (/[.!]$/.test(plain) && plain.split(/\s+/).length > 2) {
    const inline = splitInlineHeader(line);
    return inline;
  }
  const kind = matchHeaderKey(plain);
  if (kind) return { kind, rest: '' };
  return splitInlineHeader(line);
}

function splitInlineHeader(line) {
  const plain = stripLeadingBullet(line);
  const m = plain.match(/^(.{2,60}?)\s*(?:[:：]|\s[-–—]\s)\s*(.+)$/u);
  if (!m) return null;
  const kind = matchHeaderKey(m[1]);
  return kind ? { kind, rest: m[2].trim() } : null;
}

/* -------------------- Herkenning per regel -------------------- */

const FRACTIONS = '½¼¾⅓⅔⅛⅜⅝⅞⅕';
const NUMBER = `(?:\\d+(?:[.,/]\\d+)?|[${FRACTIONS}])`;
const UNIT = '(?:g|gr|gram|grams?|kg|kilo|mg|ml|cl|dl|l|ltr|liter|litre|el|tl|eetlepels?|theelepels?|' +
  'tbsp|tsp|tbs|tb|cups?|kopjes?|oz|ounces?|lbs?|pounds?|stuks?|st|teentjes?|tenen|teen|cloves?|' +
  'blikjes?|blik|blikken|cans?|zakjes?|zak|pakjes?|pak|bosjes?|bos|takjes?|snufjes?|snuf|scheutjes?|' +
  'handjes?|handvol|plakjes?|plakken|slices?|stengels?|sprigs?|bunch|pinch|dash|potjes?|pot|bekers?|' +
  'bekertje|flesje|fles|bakjes?|bak|stukjes?|schijven|schijfjes?|blaadjes?|bladeren|leaves|cm)';
const QTY_START_RE = new RegExp(`^(?:ca\\.?\\s*|±\\s*|~\\s*|\\+\\s*)?${NUMBER}`, 'u');
const QTY_UNIT_RE = new RegExp(`(?:\\d|[${FRACTIONS}])\\s*-?\\s*${UNIT}(?![\\p{L}])`, 'iu');
const QTY_WORD_START_RE = /^(?:een|één|half|halve|anderhalve?|paar|wat|beetje|snufje|scheutje|handje|handvol|klontje|a|an|one|two|three|some|pinch|dash|splash|handful|few)\s+\p{L}/iu;
const TIME_UNIT = '(?:min(?:uten|uut|s)?\\.?|minutes?|uur|uren|hours?|hrs?|sec(?:onden|onds)?|seconds?)';
const TIME_RE = new RegExp(`\\d+(?:[.,]\\d+)?\\s*(?:(?:-|–|tot|à|to)\\s*\\d+\\s*)?${TIME_UNIT}(?![\\p{L}])`, 'iu');
const TIME_AT_START_RE = new RegExp(`^(?:ca\\.?\\s*)?\\d+(?:[.,]\\d+)?\\s*(?:(?:-|–|tot|à|to)\\s*\\d+\\s*)?${TIME_UNIT}(?![\\p{L}])`, 'iu');
const COOKING_CUE_RE = /\d+\s*(?:°|graden|degrees|℃|℉)|\b(?:oven|airfryer|air fryer|koekenpan|braadpan|hapjespan|wok|skillet|pan|magnetron|microwave|kookpunt|al dente|goudbruin|golden brown|tot (?:het|ze|hij|alles)|until)\b/iu;
const TO_TASTE_RE = /\b(?:naar smaak|to taste|optioneel|optional|naar keuze|of choice|voor erbij|om te serveren|for serving|to serve|for garnish|ter garnering|ter decoratie)\b/iu;

// Gebiedende wijs aan het begin van een stap (Nederlands en Engels).
const STEP_VERBS = new Set((
  // Nederlands
  'verwarm voorverwarm snijd snij kook bak voeg meng roer doe giet zet laat breng schep serveer verdeel leg ' +
  'haal rasp pers klop smelt fruit hak pel was rooster garneer strooi besprenkel verhit schil maak plaats ' +
  'zeef spoel week marineer prak pureer mix blend vul rol vouw dek proef snipper stoof sudder grill gril wok ' +
  'kneed bestrooi bestrijk beleg keer draai neem zorg verwijder dep droog blancheer pocheer frituur ' +
  'reduceer schud wrijf kruid halveer stort smeer spuit vet bekleed verkruimel hussel schenk stamp begin ' +
  'start rul spreid verspreid combineer roerbak verdun bind blus schraap prik steek dompel wentel pof maal ' +
  'controleer herhaal bedek beboter dresseer dip schaaf top bestuif rasp trek scheur verkruimel ' +
  'gaar braad karameliseer laat bewerk zet weeg schik drapeer ' +
  // Engels
  'preheat heat cook bake add mix stir combine pour place put bring boil simmer season serve slice chop ' +
  'dice mince whisk fold transfer remove cut roast grill fry saute sauté toss blend spread sprinkle top let ' +
  'drain cover mash melt beat roll garnish divide layer fill marinate soak rinse peel grate squeeze start ' +
  'make prepare set allow use line grease brush drizzle assemble crack scramble flip reduce shred cool ' +
  'chill refrigerate freeze microwave wrap stuff coat dip dredge knead shape form press puree process ' +
  'pulse warm toast char sear brown deglaze scrape taste adjust plate finish repeat return turn arrange ' +
  'blitz zest juice halve quarter cream whip sift spoon smash crumble stack bring'
).split(/\s+/));
// Werkwoorden die ook een ingrediënt kunnen openen ("Brown sugar", "Cream
// cheese", "Warm water", "Rasp van 1 citroen"): alleen een stap in een zin.
const AMBIGUOUS_VERBS = new Set((
  'brown cream juice zest toast warm top plate form press set line turn start mix spread process wrap stuff ' +
  'char crumble stack quarter halve dip glaze sear smash taste cool fill roll cut beat cover coat drizzle ' +
  'puree grill blend chill season base rasp beleg pers week was vet kruid maal dek pof'
).split(/\s+/));
// Woorden die na zo'n werkwoord een stap verraden: "Cream the butter", "Top af
// met", "Rasp de citroen" (maar "Rasp van 1 citroen" is een ingrediënt).
const VERB_OBJECT_WORDS = new Set((
  'the de het een a an all alles everything it them with met af in on op over until tot for well goed your je ' +
  'this dit these deze together samen gently slightly completely evenly lightly kort even nog both beide each elk'
).split(/\s+/));
// Bijwoorden waarmee een stap vaak begint ("Daarna…", "Meanwhile…").
const STEP_ADVERBS = new Set((
  'dan daarna vervolgens ondertussen intussen eerst nu tot slot tenslotte zodra wanneer als terwijl ' +
  'then next meanwhile first finally once when after now while lastly'
).split(/\s+/));
// Infinitieven midden in de zin ("De ui snipperen en glazig fruiten"), ook
// met scheidbaar voorvoegsel ("toevoegen", "afgieten"). Niet na "te": "olie om
// in te bakken" is een ingrediënt.
const INFINITIVE_RE = new RegExp(
  '(?<!\\bte\\s)(?<![\\p{L}])(?:aan|af|bij|door|fijn|in|los|mee|om|onder|op|over|terug|toe|uit|vast|voor|weg|' +
  'samen|glad|goud|klein|na|neer|rond|dicht|plat|gaar|warm)?' +
  '(?:koken|bakken|snijden|snipperen|fruiten|voegen|mengen|roeren|gieten|verwarmen|verhitten|brengen|' +
  'scheppen|serveren|verdelen|leggen|halen|raspen|persen|kloppen|smelten|hakken|pellen|roosteren|garneren|' +
  'strooien|besprenkelen|schillen|plaatsen|spoelen|marineren|prakken|pureren|mixen|blenden|vullen|rollen|' +
  'vouwen|dekken|proeven|stoven|sudderen|grillen|wokken|kneden|bestrooien|bestrijken|keren|draaien|' +
  'verwijderen|deppen|drogen|blancheren|pocheren|frituren|reduceren|schudden|halveren|smeren|vetten|' +
  'bekleden|husselen|schenken|stampen|lekken|blussen|garen|warmen|koelen|dienen|rusten|dikken|braden|' +
  'karameliseren|verkruimelen|zetten)(?![\\p{L}])', 'iu');

// Oproepen, reclame en afsluiters: horen nergens bij. Bewust nauw: "Volg de
// instructies op de verpakking" en "Bewaar het in de koelkast" zijn wél stappen.
const POST_WORD = '(?:recept|recipe|bericht|post|video|reel)';
const NOISE_RE = new RegExp(
  '^(?:#|@\\w|https?:|www\\.|' +
  'follow (?:@|me\\b|us\\b|for\\b|along|my\\b)|volg (?:@|mij\\b|me\\b|ons\\b|voor\\b|en\\b|mijn\\b)|' +
  `save (?:this|it\\b|for later|the ${POST_WORD})|bewaar (?:dit|deze|het) ${POST_WORD}|` +
  `sla (?:dit|deze|het)(?: ${POST_WORD})? op|deel (?:dit|deze|het) (?:${POST_WORD}|met)|` +
  'tag (?:een|a|je|your|iemand|someone)|comment|reageer|laat (?:een )?(?:reactie|comment)|link in (?:bio|mijn bio)|' +
  'meer recepten|recept (?:staat )?(?:ook )?(?:op|via) |klik op|dubbeltik|drop een|stuur dit|share this|' +
  "don'?t forget|ad$|#ad\\b|ad\\s*[|:]|advertentie|reclame|in samenwerking met|samenwerking met|sponsored|" +
  'gesponsord|paid partnership|(?:eet )?smakelijk|enjoy[!. ]*$|enjoy (?:it|this|your)|bon app|' +
  'veel (?:kook)?plezier|happy cooking|liefs|xoxo|laat (?:me |het |even |ons )+weten|let me know|' +
  'wat vind(?:en)? jullie|wat vind jij|zou jij|wil jij|probeer jij|heb jij|ga jij|wie maakt)', 'iu');
// Voedingswaarden: "648 kcal, 61 khd, 63 eiwit" of "Eiwit: 40 g".
const NUTRITION_LINE_RE = /\d\s*k?cal\b.*\b(?:eiwit|prote|khd|koolh|carb|vet|fat)|\b(?:eiwit|prote\w*|khd|koolh\w*|carbs?|vet|fats?)\b.*\d\s*k?cal\b/i;
const NUTRITION_LABEL_RE = /^(?:calorie[ëe]?n?|calories|kcal|energie|eiwitten|eiwit|prote[iï]ne?s?|koolhydraten|khd|carbs?|vetten|vet|fats?|vezels|fibers?|fibres?|suikers?|sugars?|verzadigd)\s*[:\-=]?\s*[~±]?\d/i;
const SERVINGS_LINE_RE = /^(?:\(?\s*(?:voor|for|serves|makes|goed voor|porties|portions|servings|aantal personen)\s*:?\s*\d+(?:\s*(?:-|tot|à|to)\s*\d+)?\s*(?:personen|persoon|pers\.?|porties?|people|persons|servings?|stuks?)?\s*\)?|\(?\s*\d+\s*(?:personen|persoon|pers\.?|porties?|servings?)\s*\)?)$/i;
const TIME_LINE_RE = /^(?:bereidingstijd|kooktijd|wachttijd|oventijd|totale? tijd|tijd|klaar in|ready in|total time|prep time|cook time|prep|cook|time)\b(?=.*\d).{0,30}$/i;

// "Voor de saus:", "Topping", "To serve:" — een kopje binnen de ingrediënten
// of de bereiding. Een korte regel die op ':' eindigt is altijd zo'n kopje.
const SUBHEADER_LABEL_RE = /^(?:saus|sauce|dressing|dressings|afwerking|topping|toppings|garnering|garnish|garneer|marinade|crumble|deeg|dough|beslag|batter|vulling|filling|glazuur|glaze|frosting|voor de\b.*|voor het\b.*|to make\b.*|for the\b.*|to serve|voor erbij|erbij|extra'?s?|serveren|serveer|dipsaus|bodem|base|basis)$/i;

function isSubHeader(text) {
  const t = stripLeadingBullet(text).replace(TRAILING_DECORATION_RE, '').replace(/[*_]+/g, '').trim();
  if (!t) return false;
  if (/[:：]$/.test(t)) {
    const label = t.slice(0, -1).trim();
    return label.split(/\s+/).length <= 6 && !/^(?:stap|step)\s*\d/i.test(label) && !QTY_START_RE.test(label);
  }
  return SUBHEADER_LABEL_RE.test(t);
}

// "1. Verwarm…", "2) Voeg…", "Stap 3: …", "Step 4 - …". "1.5 kg" telt niet
// (geen spatie na de punt).
const STEP_MARKER_RE = /^(?:(?:stap|step)\s*(\d{1,2})\s*[:.)\-–]?\s*|(\d{1,2})\s*[.)]\s+(?=\S)|(\d{1,2})\s*[-–]\s+(?=\p{L}))/iu;
const MARKER_ONLY_RE = /^(?:(?:stap|step)\s*\d{1,2}|\d{1,2}[.)])\s*[:.)\-–]?$/iu;

function parseStepMarker(line) {
  const m = line.match(STEP_MARKER_RE);
  if (!m) return null;
  return { number: Number(m[1] || m[2] || m[3]), rest: line.slice(m[0].length).trim() };
}

function firstWords(body) {
  return deaccent(body).toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z']/g, '')).filter(Boolean);
}

// Hoeveel lijkt deze regel op een ingrediënt, en hoeveel op een stap?
function analyzeLine(line) {
  const marker = parseStepMarker(line);
  const body = stripLeadingBullet(marker ? marker.rest : line);
  const words = body.split(/\s+/).filter(Boolean);
  const [w1, w2] = firstWords(body);
  const plainEnd = body.replace(TRAILING_DECORATION_RE, '');
  const endsSentence = /[.!?]$/.test(plainEnd);
  const timeAtStart = TIME_AT_START_RE.test(body);
  const qtyStart = QTY_START_RE.test(body) && !timeAtStart;
  const qtyUnit = QTY_UNIT_RE.test(body);
  const hasTime = TIME_RE.test(body);
  const wordsLower = firstWords(body);
  const verbIndex = STEP_VERBS.has(w1) ? 0 : (STEP_ADVERBS.has(w1) && STEP_VERBS.has(w2) ? 1 : -1);
  const verbWord = verbIndex >= 0 ? wordsLower[verbIndex] : null;
  const verbStart = !!verbWord &&
    (!AMBIGUOUS_VERBS.has(verbWord) || endsSentence || VERB_OBJECT_WORDS.has(wordsLower[verbIndex + 1]));
  const adverbStart = !verbStart && STEP_ADVERBS.has(w1);

  let ing = 0;
  if (qtyStart) ing += 3;
  if (qtyUnit) ing += 2;
  if (!qtyStart && words.length <= 6 && QTY_WORD_START_RE.test(body)) ing += 1;
  if (TO_TASTE_RE.test(body)) ing += 2;
  if (words.length <= 6 && !endsSentence) ing += 1;
  if (startsWithBullet(line) && !marker) ing += 1;
  if (hasTime && !qtyUnit) ing -= 2;
  if (verbStart) ing -= 1;

  let step = 0;
  if (marker) step += 2;
  if (verbStart) step += 3;
  else if (adverbStart) step += 2;
  if (INFINITIVE_RE.test(body)) step += 2;
  if (hasTime || COOKING_CUE_RE.test(body)) step += 1;
  if (words.length > 10) step += 2;
  else if (words.length > 6) step += 1;
  if (endsSentence) step += 1;
  if (timeAtStart) step += 3;

  return {
    ing, step, body, marker, verbStart, adverbStart, qtyStart, qtyUnit, endsSentence,
    words: words.length,
    cookingCue: hasTime || COOKING_CUE_RE.test(body)
  };
}

function isNoiseLine(line) {
  const t = stripLeadingBullet(line);
  if (!t) return true;
  if (NOISE_RE.test(t)) return true;
  // Alleen hashtags en vermeldingen.
  if (/^(?:[#@][\p{L}\p{N}_.]+[\s,.!]*)+$/u.test(t)) return true;
  if (NUTRITION_LINE_RE.test(t) || NUTRITION_LABEL_RE.test(t)) return true;
  if (SERVINGS_LINE_RE.test(t) || TIME_LINE_RE.test(t)) return true;
  // Een losse vraag ("Zin in?", "Wie maakt deze?").
  if (/\?\s*$/.test(t.replace(TRAILING_DECORATION_RE, '')) && !STEP_VERBS.has(firstWords(t)[0])) return true;
  return false;
}

// "Ik maak dit elke week" of "We love this one!": persoonlijk verhaal, geen stap.
function isChatter(info) {
  if (info.marker || info.verbStart || info.adverbStart || info.cookingCue || info.qtyStart) return false;
  return /\b(?:ik|mijn|me|we|wij|ons|onze|i|i'm|i've|my|we're|our|us)\b/i.test(info.body);
}

/* -------------------- Regels voorbereiden -------------------- */

// Kopjes midden in een lange regel krijgen een eigen regel: "… 😋 Ingrediënten:
// 200 g pasta, 1 ui. Bereiding: Kook de pasta…".
const INLINE_HEADER_SPLIT_RE = new RegExp(
  '([.!?:)\\]]|' + DECORATION + ')\\s+(?=(?:ingredi[eë]nten|ingredients|wat (?:heb )?je nodig|je hebt nodig|dit heb je nodig|' +
  'benodigdheden|bereiding(?:swijze)?|werkwijze|instructies|instructions|method|directions|' +
  'zo maak je (?:het|dit)|how to make|stappen|steps|voedingswaarden?|nutrition|macros?)\\s*(?:\\([^)]{0,30}\\))?\\s*[:：])',
  'giu');

// "1. Kook de pasta. 2. Bak de ui. 3. Meng alles." → losse regels.
function splitInlineNumbered(line) {
  const re = /(?:^|\s)(\d{1,2})[.)]\s+(?=\p{L})/gu;
  const hits = [...line.matchAll(re)];
  if (hits.length < 2) return [line];
  const numbers = hits.map(h => Number(h[1]));
  const sequential = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
  if (!sequential || numbers[0] > 2) return [line];
  const parts = [];
  let prefix = line.slice(0, hits[0].index).trim();
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index + (hits[i][0].startsWith(' ') || hits[i][0].startsWith('\t') ? 1 : 0);
    const end = i + 1 < hits.length ? hits[i + 1].index : line.length;
    parts.push(line.slice(start, end).trim());
  }
  return prefix ? [prefix, ...parts] : parts;
}

function prepareLines(caption) {
  const text = normalizeFancyText(caption)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(INLINE_HEADER_SPLIT_RE, '$1\n');
  const out = [];
  let blankBefore = false;
  for (const raw of text.split('\n')) {
    const cleaned = cleanRawLine(raw);
    if (isSpacerLine(cleaned)) { blankBefore = true; continue; }
    for (const part of splitInlineNumbered(cleaned)) {
      out.push({ text: part, blankBefore });
      blankBefore = false;
    }
  }
  return out;
}

// Een blok korte regels zonder leestekens of werkwoorden (tussen witregels) is
// vrijwel altijd een boodschappenlijstje, ook zonder kopje of hoeveelheden.
function markListBlocks(lines, infos) {
  let start = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i === lines.length || (i > start && lines[i].blankBefore)) {
      const block = infos.slice(start, i);
      const listy = block.filter(info => info.words <= 6 && !info.endsSentence && !info.verbStart && !info.marker && info.ing >= 1);
      if (block.length >= 3 && listy.length / block.length >= 0.75) {
        for (const info of listy) info.listBlock = true;
      }
      start = i;
    }
  }
}

/* -------------------- Ingrediënten en stappen opschonen -------------------- */

function cleanIngredient(text) {
  const t = stripLeadingBullet(text)
    .replace(/^\d{1,2}[.)]\s+/, '')            // genummerd lijstje: "1. 250 g pasta"
    .replace(TRAILING_DECORATION_RE, '')
    .replace(/[\s.,;]+$/, '')
    .replace(/[*_]{2,}/g, '')
    .trim();
  return normalizeIngredientText(t);
}

// Een regel met meerdere ingrediënten ("200 g pasta, 1 potje pesto, 50 g
// kaas" of "pasta • pesto • kaas") opsplitsen. Met komma's alleen als het
// duidelijk een lijst is: "1 rode ui, fijngesneden" blijft heel.
function splitIngredientList(text, inlineAfterHeader) {
  const body = stripLeadingBullet(text);
  if (/\s[•·▪|✓✔]\s/.test(body)) return body.split(/\s[•·▪|✓✔]\s/);
  if (body.includes(';')) return body.split(/\s*;\s*/);
  const parts = body.split(/\s*,\s*/);
  if (parts.length < 2) return [text];
  const qtyParts = parts.filter(p => QTY_START_RE.test(p)).length;
  const shortParts = parts.every(p => p.split(/\s+/).length <= 6);
  if (shortParts && (qtyParts >= 2 || (inlineAfterHeader && parts.length >= 3))) {
    // "zout en peper" achteraan blijft één ingrediënt.
    return parts;
  }
  return [text];
}

function cleanStepLine(line) {
  return stripLeadingBullet(line)
    .replace(/^(?:stap|step)\s*\d{1,2}\s*[:.)\-–]?\s*/i, '')
    .replace(/^\d{1,2}\s*[.)]\s+/, '')
    .replace(/^\d{1,2}\s*[-–]\s+(?=\p{L})/u, '')
    .replace(/(?:\s+#[\p{L}\p{N}_]+)+\s*$/u, '')
    .replace(/[*_]{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Eén lange alinea ("Kook de pasta. Bak intussen de ui. Meng alles.") wordt
// losse stappen; korte zinnetjes blijven bij de zin ervoor.
function splitParagraphSteps(steps) {
  if (steps.length > 2) return steps;
  const out = [];
  for (const step of steps) {
    if (step.length < 160) { out.push(step); continue; }
    const sentences = step.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u);
    let current = '';
    for (const sentence of sentences) {
      current = current ? `${current} ${sentence}` : sentence;
      if (current.length >= 25) { out.push(current); current = ''; }
    }
    if (current) {
      if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${current}`;
      else out.push(current);
    }
  }
  return out;
}

/* -------------------- Splitsen -------------------- */

function parseServings(text) {
  const t = deaccent(String(text || '')).toLowerCase();
  const m = t.match(/\b(?:voor|for|serves|makes|goed voor)\s+(\d{1,2})\s*(?:(?:-|tot|a|to)\s*\d{1,2}\s*)?(?:personen|persoon|pers\b|porties?|people|persons|servings?)/) ||
    t.match(/\b(\d{1,2})\s*(?:personen|porties|servings|pers\.)/) ||
    t.match(/\b(?:porties?|servings?|aantal personen)\s*[:\-=]\s*(\d{1,2})\b/) ||
    t.match(/\bserves\s*:?\s*(\d{1,2})\b/);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 24 ? n : null;
}

// De kern: geeft { ingredients, steps, servings, intro } terug.
function splitCaptionRecipe(caption) {
  const lines = prepareLines(caption);
  const infos = lines.map(l => analyzeLine(l.text));
  markListBlocks(lines, infos);

  const ingredients = [];
  const steps = [];
  const introLines = [];
  let state = 'intro';            // intro | ingredients | steps | other | outro
  let sawContent = false;         // de eerste inhoudsregel is meestal de titel
  let numberedSteps = false;
  let pendingMarker = false;      // "Stap 1" op een eigen regel
  let lastStepContinuable = false;

  const addIngredient = (text, inlineAfterHeader = false) => {
    for (const part of splitIngredientList(text, inlineAfterHeader)) {
      const cleaned = cleanIngredient(part);
      if (cleaned) ingredients.push(cleaned);
    }
  };
  const addStep = (text, info, blankBefore) => {
    const cleaned = cleanStepLine(text);
    if (!cleaned) return;
    const numbered = !!info.marker || pendingMarker;
    if (info.marker || pendingMarker) numberedSteps = true;
    pendingMarker = false;
    // Een afgebroken zin ("…in een pan\nmet wat olie.") hoort bij de vorige stap.
    if (!numbered && !blankBefore && steps.length && lastStepContinuable && /^\p{Ll}/u.test(cleaned)) {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${cleaned}`;
    } else {
      steps.push(cleaned);
    }
    lastStepContinuable = !/[.!?:]$/.test(steps[steps.length - 1]);
  };

  const handleContent = (text, info, blankBefore, inlineAfterHeader) => {
    if (state === 'outro') return;

    if (state === 'other') {
      // Na voedingswaarden of tips kan de bereiding alsnog beginnen.
      const startsSteps = (info.marker && info.step >= 4) ||
        (blankBefore && info.verbStart && info.step >= 4 && ingredients.length && !steps.length);
      if (!startsSteps) return;
      state = 'steps';
    }

    if (state === 'intro') {
      const isFirst = !sawContent;
      sawContent = true;
      const ingScore = info.ing + (info.listBlock ? 2 : 0);
      if (ingScore >= (isFirst ? 5 : 3) && ingScore > info.step) {
        state = 'ingredients';
        addIngredient(text, inlineAfterHeader);
        return;
      }
      if (!isFirst && (info.marker || pendingMarker) && info.step >= 4) {
        state = 'steps';
        addStep(text, info, blankBefore);
        return;
      }
      introLines.push(text);
      return;
    }

    if (state === 'ingredients') {
      if (isSubHeader(text)) return;
      const looksLikeStep =
        (info.verbStart && info.step >= info.ing + 2) ||
        ((info.marker || pendingMarker) && !info.qtyStart && info.step >= 4 && info.step >= info.ing + 2) ||
        (info.step >= 6 && info.step >= info.ing + 4);
      if (looksLikeStep) {
        state = 'steps';
        addStep(text, info, blankBefore);
        return;
      }
      // Lange zinnen zonder hoeveelheid ("Ik gebruik altijd verse pasta,
      // maar gedroogd kan ook.") en uitroepen zijn geen ingrediënten.
      if (info.ing + (info.listBlock ? 2 : 0) < 1) return;
      if (!info.qtyStart && !info.qtyUnit && info.words > 10) return;
      // "Saus: 2 el mayo, 1 el sriracha" — het label weg, de rest telt.
      const labelled = stripLeadingBullet(text).match(/^([^:：]{2,30})[:：]\s*(.+)$/u);
      if (labelled && SUBHEADER_LABEL_RE.test(labelled[1].trim())) {
        addIngredient(labelled[2], true);
        return;
      }
      addIngredient(text, inlineAfterHeader);
      return;
    }

    if (state === 'steps') {
      // Een algemeen kopje ("Zo maak je het 👇") gevolgd door ingrediënten.
      if (!steps.length && !info.marker && !pendingMarker && info.ing >= 4 && info.step <= 1) {
        state = 'ingredients';
        addIngredient(text, inlineAfterHeader);
        return;
      }
      if (isSubHeader(text) && text.length < 40) return;
      if (steps.length && isChatter(info)) return;
      // Na genummerde stappen en een witregel: een regel die niet op een stap
      // lijkt is de afsluiting ("Zo lekker! 😍").
      if (steps.length && numberedSteps && blankBefore && !info.marker && !pendingMarker &&
          !info.verbStart && !info.adverbStart && info.step <= 2) {
        state = 'outro';
        return;
      }
      addStep(text, info, blankBefore);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const { text, blankBefore } = lines[i];
    const info = infos[i];

    const header = detectHeader(text);
    if (header) {
      pendingMarker = false;
      if (header.kind === 'recipe') {
        sawContent = true;
        if (header.rest) introLines.push(header.rest);
        continue;
      }
      sawContent = true;
      // "Tip: gebruik volkoren pasta" of "Per portie: 520 kcal" midden in het
      // recept: alleen die regel overslaan, het deel eromheen loopt door.
      if (header.kind === 'other' && header.rest) continue;
      state = header.kind;
      if (header.rest) {
        const restInfo = analyzeLine(header.rest);
        if (header.kind === 'steps') {
          for (const part of splitInlineNumbered(header.rest)) addStep(part, analyzeLine(part), false);
        } else {
          handleContent(header.rest, restInfo, false, true);
        }
      }
      continue;
    }

    if (MARKER_ONLY_RE.test(text)) {
      pendingMarker = true;
      if (state === 'intro' || state === 'ingredients' || state === 'other') state = 'steps';
      continue;
    }

    if (isNoiseLine(text)) {
      // Een afsluiter na de stappen: wat erna komt hoort niet meer bij het recept.
      if (state === 'steps' && steps.length && NOISE_RE.test(stripLeadingBullet(text))) state = 'outro';
      if (state === 'intro') sawContent = true;
      continue;
    }

    handleContent(text, info, blankBefore, false);
  }

  return {
    ingredients: dedupeIngredients(ingredients),
    steps: splitParagraphSteps(steps).filter((s, i, all) => s.length > 1 && all.indexOf(s) === i).slice(0, MAX_STEPS),
    servings: parseServings(caption),
    intro: introLines.join('\n')
  };
}

function parseIngredientsFromCaption(caption) {
  return splitCaptionRecipe(caption).ingredients;
}

function parseInstructionsFromCaption(caption) {
  return splitCaptionRecipe(caption).steps;
}

// De tekst vóór de ingrediëntenlijst: receptnaam en intro. Losse ingrediënten
// zoals "bouillon" mogen de soort gerecht niet bepalen ("Soep").
function captionLeadText(caption) {
  return splitCaptionRecipe(caption).intro;
}

/* -------------------- Titel -------------------- */

function cleanCaptionTitle(text) {
  if (!text) return null;
  let name = text
    .replace(/\s*\(\s*(voor\s*)?\d+\s*(à|-|tot)?\s*\d*\s*persone?n?\s*\)\s*$/i, '') // "(2 personen)" eraf
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N})]+$/u, '')
    // Advertentielabel achteraan ("… 💛 ad", "(ad)", "#gesponsord").
    .replace(/\s+[#(\[]?(ad|adv|advertentie|reclame|sponsored|gesponsord)[)\]]?$/i, '')
    .replace(/[^\p{L}\p{N})]+$/u, '')
    .trim();
  // Een titel in hoofdletters ("VANILLE SKYR CHEESECAKE") wordt gewone zinsopbouw.
  if (/\p{Lu}{3}/u.test(name) && !/\p{Ll}/u.test(name)) {
    name = name.charAt(0) + name.slice(1).toLowerCase();
  }
  if (name.length < 3) return null;
  if (name.length > 90) name = name.slice(0, 90).replace(/\s+\S*$/, '').trim();
  return normalizeIngredientText(name) || null;
}

function parseTitleFromCaption(caption, ogTitle) {
  const lines = prepareLines(caption).map(l => l.text);

  // 1) Expliciete "Recept: <naam>"-regel heeft voorrang (de echte receptnaam).
  for (const line of lines) {
    const m = line.match(/^(?:recept|recipe)\s*[:\-]\s*(.+)$/i);
    if (m) {
      const name = cleanCaptionTitle(m[1]);
      if (name) return name;
    }
  }

  // 2) Eerste 'echte' regel: geen vraag of engagement-bait.
  for (const line of lines) {
    if (line.includes('?')) continue;                       // "Zou jij dit maken?"
    if (/^(follow|link in bio|don'?t forget|comment|tag a|save this|recipe below|sla dit|deel (dit|het)|volg |bewaar|drop een|dubbeltik)/i
      .test(line.replace(/^[^\p{L}\p{N}]+/u, ''))) continue;
    const header = detectHeader(line);
    if (header && header.kind !== 'recipe') break;
    if (header) continue;
    const name = cleanCaptionTitle(line);
    if (name) return name;
  }

  // 3) Fallback: og:title.
  if (ogTitle) {
    const name = cleanCaptionTitle(ogTitle.split(/\s+on instagram/i)[0]);
    if (name) return name;
  }
  return null;
}

module.exports = {
  normalizeFancyText,
  stripLeadingBullet,
  detectHeader,
  splitCaptionRecipe,
  parseIngredientsFromCaption,
  parseInstructionsFromCaption,
  captionLeadText,
  cleanCaptionTitle,
  parseTitleFromCaption,
  parseServings
};
