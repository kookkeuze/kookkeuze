// Rommelige, realistische captions (verzonnen, maar zoals makers ze schrijven)
// en hoe ze gesplitst moeten worden. Draaien met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  splitCaptionRecipe,
  parseTitleFromCaption,
  captionLeadText,
  detectHeader
} = require('../recipe-caption');

// Bij elke caption: de ingrediënten exact, en per stap een stukje tekst dat
// erin moet staan (in volgorde).
function assertSplit(caption, { ingredients, steps, servings }) {
  const result = splitCaptionRecipe(caption);
  assert.deepEqual(result.ingredients, ingredients, 'ingrediënten');
  assert.equal(result.steps.length, steps.length, `aantal stappen: ${JSON.stringify(result.steps, null, 1)}`);
  steps.forEach((fragment, i) => {
    assert.ok(result.steps[i].includes(fragment), `stap ${i + 1} "${result.steps[i]}" bevat "${fragment}"`);
  });
  if (servings !== undefined) assert.equal(result.servings, servings, 'personen');
  return result;
}

test('sierletters, emoji-kopjes, genummerde stappen, macro\'s en hashtags', () => {
  const caption = [
    '𝗞𝗿𝗲𝗺𝗶𝗴𝗲 𝗽𝗮𝘀𝘁𝗮 𝗺𝗲𝘁 𝘇𝗮𝗹𝗺 𝗲𝗻 𝘀𝗽𝗶𝗻𝗮𝘇𝗶𝗲 🍝',
    'Super snel klaar en zó lekker! Bewaar dit recept voor later 📌',
    '⠀',
    '🛒 𝗜𝗻𝗴𝗿𝗲𝗱𝗶ë𝗻𝘁𝗲𝗻 (2 personen):',
    '- 200 g penne',
    '- 2 zalmfilets',
    '- 150 g spinazie',
    '- 2 tenen knoflook',
    '- 100 ml kookroom',
    '- Zout en peper',
    '⠀',
    '👩‍🍳 𝗕𝗲𝗿𝗲𝗶𝗱𝗶𝗻𝗴:',
    '1. Kook de penne volgens de verpakking.',
    '2. Bak de zalm 3-4 minuten per kant en snijd in stukjes.',
    '3. Fruit de knoflook, voeg de spinazie toe en laat slinken.',
    '4. Roer de kookroom erdoor en meng met de pasta en zalm.',
    '⠀',
    'Per portie: 610 kcal | 42 g eiwit | 55 g khd | 22 g vet',
    '#pasta #zalm #recept #snelkoken'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['200 g penne', '2 zalmfilets', '150 g spinazie', '2 tenen knoflook', '100 ml kookroom', 'Zout en peper'],
    steps: ['Kook de penne', 'Bak de zalm 3-4 minuten', 'Fruit de knoflook', 'Roer de kookroom'],
    servings: 2
  });
  assert.equal(parseTitleFromCaption(caption), 'Kremige pasta met zalm en spinazie');
});

test('geen kopjes: emoji-lijst met ingrediënten, losse stappen, oproepen aan het eind', () => {
  const caption = [
    'Easy chicken fajita bowl 🌯🔥',
    '',
    '🍗 500g chicken breast',
    '🫑 2 bell peppers, sliced',
    '🧅 1 red onion',
    '🌶️ 2 tsp fajita seasoning',
    '🍚 250g rice',
    '🥑 1 avocado',
    'Lime & coriander to serve',
    '',
    'Cook the rice according to the package.',
    'Slice the chicken and toss with the seasoning.',
    'Fry the chicken in a hot pan for 6-8 minutes, then add the peppers and onion.',
    'Serve over the rice with avocado and a squeeze of lime.',
    '',
    'Save this for your next meal prep! 💪',
    'Follow @mealprepdaily for more 🙌',
    '#mealprep #fajitas #highprotein'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['500g chicken breast', '2 bell peppers, sliced', '1 red onion', '2 tsp fajita seasoning', '250g rice', '1 avocado', 'Lime & coriander to serve'],
    steps: ['Cook the rice', 'Slice the chicken', 'Fry the chicken', 'Serve over the rice']
  });
  assert.equal(parseTitleFromCaption(caption), 'Easy chicken fajita bowl');
});

test('stappen direct onder de ingrediënten, zonder kopje of nummers', () => {
  // Het oude probleem: deze stappen belandden bij de ingrediënten.
  const caption = [
    'Ovenschotel met gehakt en krieltjes 😍 (4 personen)',
    '',
    'INGREDIËNTEN',
    '500 gram rundergehakt',
    '1 kg krieltjes',
    '1 ui',
    '1 blik tomatenblokjes',
    '2 el Italiaanse kruiden',
    '100 g geraspte kaas',
    'Verwarm de oven voor op 200 graden.',
    'Bak de krieltjes in 20 minuten goudbruin in de oven.',
    'Rul het gehakt met de ui in een koekenpan en voeg de tomatenblokjes en kruiden toe.',
    'Doe alles in een ovenschaal, strooi de kaas erover en bak nog 15 minuten.',
    'Eet smakelijk! 🧀'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['500 gram rundergehakt', '1 kg krieltjes', '1 ui', '1 blik tomatenblokjes', '2 el Italiaanse kruiden', '100 g geraspte kaas'],
    steps: ['Verwarm de oven', 'Bak de krieltjes', 'Rul het gehakt', 'Doe alles in een ovenschaal'],
    servings: 4
  });
});

test('alles op één regel, kopjes midden in de tekst', () => {
  const caption = 'Snelle shakshuka voor 2 🍳 Je hebt nodig: 1 ui, 1 rode paprika, 1 blik tomatenblokjes, 4 eieren, 1 tl komijn. ' +
    'Bereiding: Fruit de ui en paprika 5 minuten. Voeg de tomaten en komijn toe en laat 10 minuten pruttelen. ' +
    'Maak kuiltjes, breek de eieren erin en laat ze met de deksel op de pan in 6 minuten garen. #shakshuka';
  assertSplit(caption, {
    ingredients: ['1 ui', '1 rode paprika', '1 blik tomatenblokjes', '4 eieren', '1 tl komijn'],
    steps: ['Fruit de ui en paprika 5 minuten', 'Voeg de tomaten en komijn toe', 'Maak kuiltjes']
  });
  assert.equal(parseTitleFromCaption(caption), 'Snelle shakshuka voor 2');
});

test('Engels in hoofdletters, subkopjes, "Step 1:" en notities', () => {
  const caption = [
    'CRISPY GARLIC PARMESAN POTATOES 🥔✨',
    '',
    'INGREDIENTS:',
    'For the potatoes:',
    '• 1kg baby potatoes, halved',
    '• 3 tbsp olive oil',
    '• 1 tsp garlic powder',
    '• Salt & pepper to taste',
    'For the topping:',
    '• 50g parmesan, grated',
    '• Fresh parsley',
    '',
    'METHOD:',
    'Step 1: Preheat the oven to 220°C.',
    'Step 2: Toss the potatoes with the oil, garlic powder, salt and pepper.',
    'Step 3: Roast for 35-40 minutes until golden and crispy.',
    'Step 4: Sprinkle with parmesan and parsley and serve.',
    '',
    'Notes:',
    'Leftovers keep 3 days in the fridge.',
    '',
    '#potatoes #sidedish'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['1kg baby potatoes, halved', '3 tbsp olive oil', '1 tsp garlic powder', 'Salt & pepper to taste', '50g parmesan, grated', 'Fresh parsley'],
    steps: ['Preheat the oven to 220°C', 'Toss the potatoes', 'Roast for 35-40 minutes', 'Sprinkle with parmesan']
  });
  assert.equal(parseTitleFromCaption(caption), 'Crispy garlic parmesan potatoes');
});

test('vraag als kopje, vinkjes, cijfer-emoji en een tip tussen de stappen', () => {
  const caption = [
    'Wraps met kip en hummus 🌯',
    '',
    'Wat heb je nodig?',
    '✔️ 4 wraps',
    '✔️ 300 g kipreepjes',
    '✔️ hummus',
    '✔️ komkommer',
    '✔️ rode ui',
    '✔️ feta',
    '',
    'Zo maak je het 👇',
    '1️⃣ Bak de kipreepjes gaar in een beetje olie.',
    '2️⃣ Smeer de wraps in met hummus.',
    'Tip: verwarm de wraps kort in een droge pan!',
    '3️⃣ Beleg met kip, komkommer, ui en feta en rol op.',
    '',
    'Laat even weten of je hem gaat maken 💛'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['4 wraps', '300 g kipreepjes', 'hummus', 'komkommer', 'rode ui', 'feta'],
    steps: ['Bak de kipreepjes', 'Smeer de wraps', 'Beleg met kip']
  });
});

test('genummerde ingrediënten én genummerde stappen in de infinitief, zonder kopjes', () => {
  const caption = [
    'Pasta pesto met kip (2 pers.)',
    '',
    '1. 250 g pasta',
    '2. 200 g kipfilet',
    '3. 3 el groene pesto',
    '4. handje cherrytomaatjes',
    '',
    '1. Pasta koken volgens de verpakking.',
    '2. Kipfilet in blokjes snijden en goudbruin bakken.',
    '3. Tomaatjes halveren.',
    '4. Alles mengen met de pesto.'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['250 g pasta', '200 g kipfilet', '3 el groene pesto', 'handje cherrytomaatjes'],
    steps: ['Pasta koken', 'Kipfilet in blokjes', 'Tomaatjes halveren', 'Alles mengen'],
    servings: 2
  });
});

test('cursieve kopjes met macro\'s ervoor en ingrediënten zonder hoeveelheid', () => {
  const caption = [
    'Burrito bowl met gehakt 🌯',
    '𝘔𝘢𝘤𝘳𝘰’𝘴 𝘱𝘦𝘳 𝘱𝘰𝘳𝘵𝘪𝘦',
    '648 kcal, 61 khd, 63 eiwit, 17 vet',
    '',
    '𝘐𝘯𝘨𝘳𝘦𝘥𝘪ë𝘯𝘵𝘦𝘯',
    '500 g mager rundergehakt',
    '1 zakje burritokruiden',
    '200 g rijst',
    '1 blik zwarte bonen',
    'Mais',
    'Peper en zout',
    '',
    '𝘉𝘦𝘳𝘦𝘪𝘥𝘪𝘯𝘨𝘴𝘸𝘪𝘫𝘻𝘦',
    'Kook de rijst.',
    'Bak het gehakt rul en voeg de kruiden en een scheutje water toe.',
    'Verdeel rijst, gehakt, bonen en mais over de bakjes.',
    '',
    'Ik maak deze elke week voor mijn lunch, echt een aanrader!',
    '#mealprep #burritobowl'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['500 g mager rundergehakt', '1 zakje burritokruiden', '200 g rijst', '1 blik zwarte bonen', 'Mais', 'Peper en zout'],
    steps: ['Kook de rijst', 'Bak het gehakt rul', 'Verdeel rijst']
  });
});

test('intro met gebiedende wijs, lijstje zonder hoeveelheden en kopjes met sterretjes', () => {
  const caption = [
    'Maak deze tomatensoep vanavond nog! 🍅',
    'Ik maak hem al jaren zo en hij blijft favoriet.',
    '',
    '**Wat je nodig hebt (4 porties):**',
    '* 1 kg trostomaten',
    '* 1 ui',
    '* 2 tenen knoflook',
    '* 1 l groentebouillon',
    '* scheutje room',
    '',
    '**Zo maak je het:**',
    'Snijd de tomaten, ui en knoflook grof.',
    'Rooster alles 30 minuten op 200 graden in de oven.',
    'Doe de groenten met de bouillon in een pan en pureer glad.',
    'Breng op smaak met peper, zout en een scheutje room.'
  ].join('\n');
  const result = assertSplit(caption, {
    ingredients: ['1 kg trostomaten', '1 ui', '2 tenen knoflook', '1 l groentebouillon', 'scheutje room'],
    steps: ['Snijd de tomaten', 'Rooster alles 30 minuten', 'Doe de groenten', 'Breng op smaak'],
    servings: 4
  });
  assert.ok(result.intro.includes('tomatensoep'), 'intro bevat de titel');
  assert.equal(parseTitleFromCaption(caption), 'Maak deze tomatensoep vanavond nog');
});

test('ingrediëntregels die op een werkwoord lijken blijven ingrediënten', () => {
  const caption = [
    'Cheesecake brownies',
    '',
    'Ingredients',
    '- 200g dark chocolate',
    '- Brown sugar',
    '- Cream cheese, softened',
    '- Juice of 1 lemon',
    '- Warm water',
    '',
    'Instructions',
    'Melt the chocolate.',
    'Beat the cream cheese with the sugar and lemon juice.',
    'Bake for 25 minutes at 180°C.'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['200g dark chocolate', 'Brown sugar', 'Cream cheese, softened', 'Juice of 1 lemon', 'Warm water'],
    steps: ['Melt the chocolate', 'Beat the cream cheese', 'Bake for 25 minutes']
  });
});

test('losse stappen met witregels ertussen en een persoonlijke afsluiter', () => {
  const caption = [
    'ONE PAN ORZO 🍋',
    '',
    "You'll need",
    '2 tbsp butter',
    '1 shallot, finely chopped',
    '200g orzo',
    '600ml chicken stock',
    'Zest & juice of 1 lemon',
    '40g parmesan',
    '',
    "Let's make it",
    'Melt the butter and soften the shallot for 3 minutes.',
    '',
    'Add the orzo and toast for 1 minute, then pour in the stock.',
    '',
    'Simmer for 10-12 minutes, stirring often, until creamy.',
    '',
    'Stir through the lemon and parmesan. Season and serve!',
    '',
    'I make this at least once a week 😍'
  ].join('\n');
  assertSplit(caption, {
    ingredients: ['2 tbsp butter', '1 shallot, finely chopped', '200g orzo', '600ml chicken stock', 'Zest & juice of 1 lemon', '40g parmesan'],
    steps: ['Melt the butter', 'Add the orzo', 'Simmer for 10-12 minutes', 'Stir through the lemon']
  });
});

test('regels die bij elkaar horen: afgebroken zin wordt samengevoegd', () => {
  const caption = [
    'Bereiding:',
    '1. Verhit de olie in een grote pan en bak de ui',
    'glazig in ongeveer 5 minuten.',
    '2. Voeg de rest toe.'
  ].join('\n');
  const { steps } = splitCaptionRecipe(caption);
  assert.deepEqual(steps, [
    'Verhit de olie in een grote pan en bak de ui glazig in ongeveer 5 minuten.',
    'Voeg de rest toe.'
  ]);
});

test('kopjes herkennen in allerlei vormen', () => {
  const cases = [
    ['🛒 INGREDIËNTEN 👇', 'ingredients'],
    ['𝗜𝗻𝗴𝗿𝗲𝗱𝗶𝗲𝗻𝘁𝗲𝗻 voor 4 personen:', 'ingredients'],
    ["What you'll need:", 'ingredients'],
    ['Boodschappenlijstje', 'ingredients'],
    ['__Bereidingswijze__', 'steps'],
    ['How to make it ⬇️', 'steps'],
    ['Directions', 'steps'],
    ['Voedingswaarde per portie', 'other'],
    ["Macro's", 'other']
  ];
  for (const [line, kind] of cases) {
    const header = detectHeader(line.normalize('NFC'));
    assert.equal(header && header.kind, kind, line);
  }
  // Geen kopjes: volzinnen en titels.
  for (const line of ['Bereiding duurt maar 10 minuten!', 'Bereiding van de lekkerste lasagne ooit', 'Ingrediënten die je al in huis hebt.']) {
    assert.equal(detectHeader(line), null, line);
  }
});

test('captionLeadText bevat alleen naam en intro', () => {
  const caption = 'Kippensoep zoals oma hem maakte\nHeerlijk bij koud weer\n\nIngrediënten:\n1 l bouillon\n200 g kip\n\nBereiding:\nKook alles 20 minuten.';
  const lead = captionLeadText(caption);
  assert.ok(lead.includes('Kippensoep'));
  assert.ok(!lead.includes('bouillon'));
});
