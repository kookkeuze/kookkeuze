// De herschrijfstap met een nep-client: geen echte API-aanroepen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteRecipe, validateRewrite, extractNumbers, MODEL } = require('../recipe-rewriter');

const original = {
  title: 'Romige pasta met zalm',
  ingredients: ['200 g penne', '2 zalmfilets', '150 g spinazie', '100 ml kookroom', 'Bak de zalm 4 minuten per kant.'],
  steps: [
    'Kook de penne volgens de verpakking.',
    'Fruit de knoflook, voeg de spinazie toe en laat slinken.',
    'Roer de kookroom erdoor en laat 2 minuten zachtjes koken.'
  ]
};

// Een client die de antwoorden in volgorde teruggeeft en de verzoeken bewaart.
function fakeClient(answers) {
  const requests = [];
  const create = async (params) => {
    requests.push(params);
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    if (answer && answer.stop_reason) return answer;
    return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(answer) }] };
  };
  return { requests, messages: { create }, beta: { messages: { create } } };
}

const goodAnswer = {
  ingredients: ['200 g penne', '2 zalmfilets', '150 g spinazie', '100 ml kookroom'],
  steps: [
    'Kook de pasta zoals op het pak staat.',
    'Bak de zalmfilets 4 minuten aan elke kant.',
    'Fruit de knoflook en laat de spinazie erin slinken.',
    'Schenk de kookroom erbij en laat het geheel 2 minuten zacht pruttelen.'
  ]
};

test('getallen worden gelijkgetrokken', () => {
  assert.deepEqual([...extractNumbers('½ ui, 1/2 citroen, 2,5 dl, 180 °C, 8-10 min')].sort(), ['0.5', '10', '180', '2.5', '8'].sort());
});

test('een goede herschrijving: stap verhuist uit de ingrediënten, getallen kloppen', async () => {
  const client = fakeClient([goodAnswer]);
  const result = await rewriteRecipe(original, { client, fixIngredients: false });
  assert.deepEqual(result.ingredients, goodAnswer.ingredients);
  assert.deepEqual(result.steps, goodAnswer.steps);
  assert.equal(client.requests.length, 1);
  const request = client.requests[0];
  assert.equal(request.model, MODEL);
  assert.ok(request.output_config.format.schema.properties.ingredients, 'vraagt om ingrediënten');
  assert.ok(request.messages[0].content.includes('Bak de zalm 4 minuten per kant.'));
});

test('ontbrekend getal: tweede poging met uitleg, en die wordt gebruikt', async () => {
  const missingTime = { ...goodAnswer, steps: goodAnswer.steps.map(s => s.replace(' 2 minuten', ' even')) };
  const client = fakeClient([missingTime, goodAnswer]);
  const result = await rewriteRecipe(original, { client, fixIngredients: false });
  assert.deepEqual(result.steps, goodAnswer.steps);
  assert.equal(client.requests.length, 2);
  assert.match(client.requests[1].messages[0].content, /ontbraken: 2\b/);
});

test('twee keer afgekeurd: null, zodat de uitgelezen stappen blijven', async () => {
  // 220 staat nergens in het origineel (200 wel, bij de penne).
  const invented = { ...goodAnswer, steps: [...goodAnswer.steps, 'Zet de oven op 220 °C.'] };
  const client = fakeClient([invented, invented]);
  assert.equal(await rewriteRecipe(original, { client, fixIngredients: false }), null);
});

test('een aangepast ingrediënt wordt afgekeurd', () => {
  const check = validateRewrite(original, { ...goodAnswer, ingredients: ['250 g penne', ...goodAnswer.ingredients.slice(1)] }, { fixIngredients: false });
  assert.equal(check.ok, false);
  assert.match(check.reason, /ingrediënt aangepast/);
});

test('te veel ingrediënten weggelaten wordt afgekeurd', () => {
  const check = validateRewrite(original, { ...goodAnswer, ingredients: ['200 g penne'] }, { fixIngredients: false });
  assert.equal(check.ok, false);
});

test('letterlijk overgenomen stappen worden afgekeurd', () => {
  const check = validateRewrite(original, { steps: [...original.steps, 'Bak de zalm 4 minuten per kant.'] }, { fixIngredients: true });
  assert.equal(check.ok, false);
  assert.match(check.reason, /letterlijk/);
});

test('vaste ingrediënten (receptsite): alleen stappen gevraagd, ingrediënten blijven', async () => {
  const site = { ...original, ingredients: original.ingredients.slice(0, 4), steps: [...original.steps, 'Bak de zalm 4 minuten per kant.'] };
  const client = fakeClient([{ steps: goodAnswer.steps }]);
  const result = await rewriteRecipe(site, { client, fixIngredients: true });
  assert.deepEqual(result.ingredients, site.ingredients);
  assert.equal(client.requests[0].output_config.format.schema.properties.ingredients, undefined);
});

test('nummers die het model toch toevoegt gaan eraf', () => {
  const check = validateRewrite(original, { steps: goodAnswer.steps.map((s, i) => `${i + 1}. ${s}`) }, { fixIngredients: true });
  assert.equal(check.ok, true);
  assert.equal(check.steps[0], goodAnswer.steps[0]);
});

test('API-fout of weigering: null, geen crash', async () => {
  const apiError = Object.assign(new Error('overloaded'), { status: 529 });
  assert.equal(await rewriteRecipe(original, { client: fakeClient([apiError]) }), null);
  const refusal = { stop_reason: 'refusal', content: [] };
  assert.equal(await rewriteRecipe(original, { client: fakeClient([refusal, refusal]) }), null);
});

test('zonder sleutel en zonder client: null', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(await rewriteRecipe(original), null);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
