// ingredient-picker.js — het venster waarin je kiest welke ingredienten
// daadwerkelijk op de boodschappenlijst komen, en waar je een regel nog kunt
// bijschaven voordat hij eropgaat.
//
// Staat los van index.js omdat de eigen receptpagina (/recept/<id>) hetzelfde
// venster gebruikt. Beide pagina's laden dit bestand voor hun eigen script; de
// schapindeling en het venster zelf staan dus maar op een plek.
//
// Gebruik:
//   IngredientPicker.showLoading('Titel van het recept');
//   IngredientPicker.open({ subtitle, items, onConfirm });
// onConfirm krijgt de gekozen regels en geeft true terug als het venster dicht
// mag; bij false blijft het staan zodat een foutmelding leesbaar blijft.

window.IngredientPicker = (function () {
  // Eigen kopietjes, zodat dit bestand niets van de pagina eromheen nodig heeft.
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  // Zelfde sluitanimatie als de andere vensters in de app.
  const MODAL_CLOSE_ANIMATION_MS = 160;
  function hideModal(modalEl) {
    if (!modalEl || modalEl.classList.contains('hidden')) return;
    modalEl.classList.add('closing');
    setTimeout(() => {
      modalEl.classList.remove('closing');
      modalEl.classList.add('hidden');
    }, MODAL_CLOSE_ANIMATION_MS);
  }

  // Wat er met de gekozen regels moet gebeuren verschilt per pagina; die geeft
  // zijn eigen afhandeling mee aan open().
  let onConfirm = null;

  const ingredientPickModal = document.getElementById('ingredientPickModal');
  const closeIngredientPickModalBtn = document.getElementById('closeIngredientPickModal');
  const ingredientPickSub = document.getElementById('ingredientPickSub');
  const ingredientPickBody = document.getElementById('ingredientPickBody');
  const ingredientPickCount = document.getElementById('ingredientPickCount');
  const ingredientPickToggleAllBtn = document.getElementById('ingredientPickToggleAllBtn');
  const ingredientPickCancelBtn = document.getElementById('ingredientPickCancelBtn');
  const ingredientPickConfirmBtn = document.getElementById('ingredientPickConfirmBtn');


  let ingredientPickState = { items: [], selected: new Set(), editingKey: null };

  // Schapindeling voor de winkel. Bewust een simpele woordenlijst: hij hoeft niet
  // perfect te zijn, alles wat we niet herkennen valt netjes onder 'Overig'.
  // Schapindeling voor de winkel. Nederlandse ingredienten zijn bijna altijd
  // samenstellingen met het hoofdwoord achteraan ('rundergehakt', 'groentebouillon'),
  // dus we kijken van rechts naar links en herkennen behalve hele woorden ook
  // achtervoegsels ('*bouillon') en voorvoegsels ('basilicum*'). De uitzonderingen
  // die daar doorheen glippen ('kokosmelk' is geen zuivel) staan er los boven.
  const SHOPPING_CATEGORIES = [
    {
      key: 'groente-fruit',
      label: 'Groente & fruit',
      words: ['ui', 'uien', 'uitje', 'uitjes', 'sjalot', 'sjalotten', 'sjalotje', 'knoflook', 'tomaat', 'tomaten', 'trostomaten', 'cherrytomaatjes', 'cherrytomaten', 'paprika', 'paprikas', 'courgette', 'courgettes', 'aubergine', 'aubergines', 'wortel', 'wortels', 'wortelen', 'worteltjes', 'winterpeen', 'waspeen', 'prei', 'broccoli', 'bloemkool', 'spinazie', 'sla', 'ijsbergsla', 'komkommer', 'champignon', 'champignons', 'kastanjechampignons', 'appel', 'appels', 'banaan', 'bananen', 'citroen', 'citroenen', 'limoen', 'limoenen', 'sinaasappel', 'sinaasappels', 'mandarijn', 'avocado', 'avocados', 'aardappel', 'aardappels', 'aardappelen', 'krieltjes', 'boon', 'bonen', 'sperziebonen', 'snijbonen', 'tuinbonen', 'peultjes', 'doperwten', 'erwten', 'mais', 'maiskolf', 'pompoen', 'spruitjes', 'spruiten', 'kool', 'spitskool', 'witlof', 'rucola', 'veldsla', 'peterselie', 'basilicum', 'koriander', 'bieslook', 'dille', 'tijm', 'rozemarijn', 'salie', 'munt', 'gember', 'bosui', 'bosuitjes', 'lenteui', 'selderij', 'bleekselderij', 'knolselderij', 'venkel', 'asperges', 'radijs', 'radijsjes', 'biet', 'bietjes', 'bieten', 'druiven', 'peer', 'peren', 'aardbei', 'aardbeien', 'frambozen', 'bosbessen', 'bramen', 'mango', 'ananas', 'meloen', 'watermeloen', 'perzik', 'perziken', 'nectarine', 'kersen', 'rozijnen', 'dadels', 'abrikozen', 'pruimen', 'vijgen', 'kiwi', 'granaatappel', 'olijven', 'tauge', 'pastinaak', 'andijvie', 'boerenkool', 'paksoi', 'snijbiet', 'raapstelen', 'rammenas', 'cranberries', 'citroensap', 'limoensap', 'citroenrasp', 'limoenrasp'],
      endings: ['sla', 'kool', 'peen', 'wortel', 'wortels', 'wortelen', 'appel', 'appels', 'appelen', 'tomaat', 'tomaten', 'ui', 'uien', 'uitjes', 'peterselie', 'blaadjes', 'bes', 'bessen', 'druiven', 'olijven', 'champignons'],
      stems: ['tomaat', 'tomat', 'aardappel', 'paprika', 'champignon', 'knoflook', 'spinazie', 'basilicum', 'peterselie', 'koriander', 'komkommer', 'citroen', 'limoen', 'sinaasappel', 'banaan', 'wortel', 'courgette', 'aubergine', 'broccoli', 'bloemkool', 'pompoen', 'avocado', 'mango', 'ananas', 'meloen', 'prei', 'venkel', 'asperge', 'rucola', 'olijf', 'druif', 'aardbei', 'framboos', 'bosbes', 'rozijn', 'dadel', 'spruit', 'witlof', 'radijs', 'biet', 'appel', 'peer']
    },
    {
      key: 'vlees-vis',
      label: 'Vlees & vis',
      words: ['kip', 'kipfilet', 'kipfilets', 'kipdijfilet', 'kippendijen', 'kippenbout', 'kippenpoten', 'kipreepjes', 'kipgehakt', 'gehakt', 'gehaktballen', 'rundergehakt', 'rundvlees', 'runderlappen', 'sucadelappen', 'biefstuk', 'entrecote', 'rosbief', 'varkensvlees', 'varkenshaas', 'speklap', 'speklappen', 'spek', 'spekjes', 'ontbijtspek', 'katenspek', 'bacon', 'ham', 'achterham', 'beenham', 'worst', 'worstjes', 'rookworst', 'braadworst', 'chorizo', 'salami', 'kalkoen', 'kalkoenfilet', 'lamsvlees', 'kotelet', 'koteletten', 'zalm', 'zalmfilet', 'tonijn', 'kabeljauw', 'koolvis', 'garnaal', 'garnalen', 'gamba', 'gambas', 'mosselen', 'inktvis', 'surimi', 'vis', 'visfilet', 'ansjovis', 'makreel', 'schol', 'tilapia', 'pangasius', 'shoarma', 'gyros', 'hamburger', 'hamburgers', 'schnitzel', 'saucijs', 'saucijzen', 'carpaccio', 'rookvlees', 'tofu', 'tempeh', 'seitan', 'vegaburger', 'vleesvervanger'],
      endings: ['gehakt', 'filet', 'filets', 'worst', 'worstjes', 'vlees', 'spek', 'haas', 'bout', 'burger', 'burgers', 'lapjes', 'lappen', 'poot', 'poten', 'schnitzel', 'balletjes'],
      stems: ['kip', 'gehakt', 'rund', 'varken', 'kalfs', 'lams', 'zalm', 'tonijn', 'garnaal', 'garnalen', 'spek', 'worst']
    },
    {
      key: 'zuivel-eieren',
      label: 'Zuivel & eieren',
      words: ['melk', 'karnemelk', 'yoghurt', 'kwark', 'room', 'slagroom', 'kookroom', 'creme', 'fraiche', 'kaas', 'parmezaan', 'parmezaanse', 'mozzarella', 'feta', 'geitenkaas', 'roomkaas', 'boter', 'roomboter', 'kruidenboter', 'margarine', 'ei', 'eieren', 'eiwit', 'eiwitten', 'eidooier', 'eidooiers', 'eigeel', 'eierdooier', 'mascarpone', 'ricotta', 'skyr', 'vla', 'cheddar', 'gruyere', 'halloumi', 'brie', 'camembert', 'gorgonzola', 'huttenkase'],
      endings: ['kaas', 'melk', 'yoghurt', 'room', 'boter'],
      stems: ['yoghurt', 'kwark', 'mozzarella', 'parmezaan', 'mascarpone', 'ricotta', 'cheddar', 'slagroom']
    },
    {
      key: 'brood-banket',
      label: 'Brood & banket',
      words: ['brood', 'stokbrood', 'ciabatta', 'boterham', 'boterhammen', 'wrap', 'wraps', 'tortilla', 'tortillas', 'pita', 'pitabroodjes', 'broodje', 'broodjes', 'beschuit', 'cracker', 'crackers', 'naan', 'croissant', 'bladerdeeg', 'filodeeg', 'pizzabodem', 'bagel', 'bagels', 'focaccia', 'baguette', 'toast', 'toastjes', 'muffins', 'cake', 'koek', 'koekjes', 'speculaas', 'taart', 'taartbodem'],
      endings: ['brood', 'broodje', 'broodjes', 'boterham', 'boterhammen', 'deeg', 'koek', 'koekjes'],
      stems: ['brood']
    },
    {
      key: 'voorraadkast',
      label: 'Voorraadkast',
      words: ['bloem', 'suiker', 'basterdsuiker', 'poedersuiker', 'rietsuiker', 'zout', 'zeezout', 'peper', 'olie', 'olijfolie', 'zonnebloemolie', 'sesamolie', 'kokosolie', 'azijn', 'balsamico', 'rijst', 'basmatirijst', 'zilvervliesrijst', 'risottorijst', 'pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'macaroni', 'lasagne', 'lasagnebladen', 'noedels', 'mie', 'mihoen', 'couscous', 'quinoa', 'linzen', 'kikkererwten', 'kidneybonen', 'bulgur', 'gierst', 'meel', 'gist', 'bakpoeder', 'baksoda', 'honing', 'ahornsiroop', 'stroop', 'mosterd', 'ketchup', 'mayonaise', 'sambal', 'sojasaus', 'ketjap', 'vissaus', 'oestersaus', 'worcestersaus', 'sriracha', 'tabasco', 'bouillon', 'bouillonblokje', 'bouillonblokjes', 'tomatenblokjes', 'tomatenpuree', 'passata', 'noten', 'amandelen', 'walnoten', 'cashewnoten', 'hazelnoten', 'pinda', 'pindas', 'pijnboompitten', 'zonnebloempitten', 'sesamzaad', 'zaden', 'chiazaad', 'lijnzaad', 'kaneel', 'kerrie', 'kerriepoeder', 'paprikapoeder', 'komijn', 'komijnzaad', 'oregano', 'kurkuma', 'chilipoeder', 'chilivlokken', 'currypasta', 'pesto', 'kokos', 'kokosrasp', 'chocolade', 'chocola', 'cacao', 'havermout', 'muesli', 'cornflakes', 'pindakaas', 'jam', 'hagelslag', 'kruiden', 'kruidenmix', 'laurier', 'laurierblad', 'laurierblaadjes', 'nootmuskaat', 'vanille', 'maizena', 'gelatine', 'paneermeel', 'augurken', 'kappertjes', 'tahin', 'hummus', 'kokosmelk', 'groentebouillon', 'kippenbouillon'],
      endings: ['olie', 'azijn', 'saus', 'ketchup', 'poeder', 'suiker', 'meel', 'zaad', 'zaden', 'noten', 'bouillon', 'siroop', 'stroop', 'kruiden', 'pasta', 'spaghetti', 'macaroni', 'noedels', 'rijst', 'mout', 'pitten', 'vlokken'],
      stems: ['kokos', 'kruiden', 'bouillon', 'suiker', 'chocola', 'pinda', 'noedel', 'spaghetti', 'macaroni']
    },
    {
      key: 'diepvries',
      label: 'Diepvries',
      words: ['diepvries', 'diepvrieserwten', 'diepvriesspinazie', 'bevroren', 'ijs', 'roomijs', 'friet', 'frites'],
      endings: [],
      stems: ['diepvries']
    },
    {
      key: 'drinken',
      label: 'Drinken',
      words: ['water', 'sap', 'sinaasappelsap', 'appelsap', 'wijn', 'bier', 'cola', 'thee', 'koffie', 'limonade', 'frisdrank', 'prosecco', 'champagne', 'port', 'sherry', 'rum', 'wodka', 'likeur', 'kokoswater'],
      endings: ['sap', 'wijn', 'bier'],
      stems: []
    }
  ];

  const SHOPPING_CATEGORY_FALLBACK = { key: 'overig', label: 'Overig' };

  // Losse woorden die anders in het verkeerde schap belanden: plantaardige melk
  // is geen zuivel, pindakaas geen kaas, en citroensap hoort bij het fruit.
  const SHOPPING_WORD_OVERRIDES = {
    kokosmelk: 'voorraadkast',
    amandelmelk: 'voorraadkast',
    sojamelk: 'voorraadkast',
    havermelk: 'voorraadkast',
    rijstmelk: 'voorraadkast',
    pindakaas: 'voorraadkast',
    pindaboter: 'voorraadkast',
    amandelboter: 'voorraadkast',
    laurierblad: 'voorraadkast',
    laurierblaadjes: 'voorraadkast',
    appelmoes: 'voorraadkast',
    appelstroop: 'voorraadkast',
    citroensap: 'groente-fruit',
    limoensap: 'groente-fruit',
    boterham: 'brood-banket',
    boterhammen: 'brood-banket'
  };

  // Combinaties waarbij pas de hele regel duidelijk maakt welk schap het is:
  // een rode peper ligt bij de groente, gemalen peper in de voorraadkast.
  const SHOPPING_PHRASE_RULES = [
    [/\b(rode|groene|gele|spaanse|verse)\s+peper/, 'groente-fruit'],
    [/\b(chilipeper|jalapeno|rawit)/, 'groente-fruit'],
    [/\b(peper en zout|zwarte peper|witte peper|cayennepeper|versgemalen peper)/, 'voorraadkast']
  ];

  // Maat- en bereidingswoorden dragen niets bij aan het schap en zouden het
  // hoofdwoord alleen maar in de weg zitten.
  const SHOPPING_NOISE_WORDS = new Set([
    'gr', 'gram', 'kg', 'ml', 'cl', 'dl', 'liter', 'el', 'tl', 'eetlepel', 'eetlepels',
    'theelepel', 'theelepels', 'snuf', 'snufje', 'snuifje', 'mespunt', 'teen', 'tenen',
    'teentje', 'teentjes', 'stuk', 'stuks', 'blik', 'blikje', 'blikjes', 'pak', 'pakje',
    'zak', 'zakje', 'pot', 'potje', 'bak', 'bakje', 'doos', 'fles', 'bos', 'bosje',
    'bosjes', 'krop', 'struik', 'bol', 'plak', 'plakje', 'plakjes', 'scheut', 'scheutje',
    'handvol', 'hand', 'takje', 'takjes', 'reep', 'reepjes', 'stengel', 'stengels',
    'portie', 'porties', 'kop', 'kopje', 'punt', 'rol', 'rolletje', 'vel', 'vellen',
    'verse', 'vers', 'gedroogde', 'gedroogd', 'gemalen', 'geraspte', 'geraspt',
    'gesneden', 'fijngesneden', 'grofgesneden', 'fijngehakte', 'gehakte', 'gepelde',
    'gewassen', 'geschilde', 'gekookte', 'gebakken', 'gegrilde', 'gerookte',
    'gemarineerde', 'ongezouten', 'gezouten', 'ongezoete', 'uitgelekte', 'extra',
    'vierge', 'biologische', 'magere', 'volle', 'halfvolle', 'oude', 'jonge', 'zoete',
    'zure', 'kleine', 'grote', 'halve', 'hele', 'dunne', 'dikke', 'kruimige',
    'vastkokende', 'flinke', 'ruime', 'naar', 'smaak', 'eventueel', 'optioneel',
    'ongeveer', 'ca', 'evt', 'plus', 'van', 'voor', 'met', 'zonder', 'the', 'een'
  ]);

  function normalizeShoppingText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function shoppingTokens(name) {
    return normalizeShoppingText(name)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z\s]+/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1 && !SHOPPING_NOISE_WORDS.has(token));
  }

  // Enkelvoud en meervoud van hetzelfde woord tellen als dezelfde match.
  function shoppingTokenMatches(token, word) {
    if (token === word) return true;
    if (token === `${word}s` || token === `${word}en` || token === `${word}je` || token === `${word}jes`) return true;
    if (word === `${token}s` || word === `${token}en`) return true;
    return false;
  }

  function shoppingCategoryByKey(key) {
    return SHOPPING_CATEGORIES.find(category => category.key === key) || SHOPPING_CATEGORY_FALLBACK;
  }

  function detectShoppingCategory(name) {
    const normalized = normalizeShoppingText(name);
    const phrase = SHOPPING_PHRASE_RULES.find(([pattern]) => pattern.test(normalized));
    if (phrase) return shoppingCategoryByKey(phrase[1]);

    const tokens = shoppingTokens(name);
    if (!tokens.length) return SHOPPING_CATEGORY_FALLBACK;

    // Van achter naar voren, want het hoofdwoord staat achteraan. Hele woorden
    // gaan voor samenstellingen: 'vissaus' is voorraadkast, niet vis.
    const scan = test => {
      for (let i = tokens.length - 1; i >= 0; i--) {
        const hit = test(tokens[i]);
        if (hit) return hit;
      }
      return null;
    };

    return scan(token => {
        const override = SHOPPING_WORD_OVERRIDES[token];
        if (override) return shoppingCategoryByKey(override);
        return SHOPPING_CATEGORIES.find(c => c.words.some(w => shoppingTokenMatches(token, w)));
      })
      || scan(token => SHOPPING_CATEGORIES.find(c =>
          c.endings.some(e => token.length > e.length && token.endsWith(e))))
      || scan(token => SHOPPING_CATEGORIES.find(c =>
          c.stems.some(st => token.length > st.length && token.startsWith(st))))
      || SHOPPING_CATEGORY_FALLBACK;
  }

  function groupByShoppingCategory(entries, getName) {
    const buckets = new Map();
    entries.forEach(entry => {
      const category = detectShoppingCategory(getName(entry));
      if (!buckets.has(category.key)) buckets.set(category.key, { label: category.label, entries: [] });
      buckets.get(category.key).entries.push(entry);
    });

    const order = [...SHOPPING_CATEGORIES.map(c => c.key), SHOPPING_CATEGORY_FALLBACK.key];
    return order
      .filter(key => buckets.has(key))
      .map(key => ({ key, ...buckets.get(key) }));
  }

  function shoppingItemKey(name) {
    return normalizeShoppingText(name).replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /* — Ingrediënten kiezen voordat ze op de lijst komen — */

  function renderIngredientPicker() {
    if (!ingredientPickBody) return;
    const { items, selected, editingKey } = ingredientPickState;

    if (!items.length) {
      ingredientPickBody.innerHTML = '<p class="shopping-empty">Geen ingrediënten gevonden</p>';
      if (ingredientPickCount) ingredientPickCount.textContent = '';
      ingredientPickToggleAllBtn?.classList.add('hidden');
      ingredientPickConfirmBtn?.setAttribute('disabled', 'disabled');
      return;
    }

    const groups = groupByShoppingCategory(items, item => item.name);
    ingredientPickBody.innerHTML = groups.map(group => `
      <section class="shopping-section">
        ${groups.length > 1 ? `<div class="shopping-section-head">
          <h4 class="shopping-section-title">${escapeHtml(group.label)}</h4>
        </div>` : ''}
        <ul class="shopping-rows">
          ${group.entries.map(item => item.key === editingKey ? `
            <li class="shopping-row is-editing${selected.has(item.key) ? ' is-on' : ''}">
              <span class="shopping-check" aria-hidden="true"><i class="fas fa-check"></i></span>
              <input type="text" class="shopping-row-input" maxlength="200" autocomplete="off"
                     data-ingredient-input="${escapeAttr(item.key)}" value="${escapeAttr(item.name)}"
                     aria-label="Pas het ingrediënt aan" />
              <button type="button" class="shopping-row-edit" data-ingredient-save aria-label="Klaar met aanpassen">
                <i class="fas fa-check" aria-hidden="true"></i>
              </button>
            </li>` : `
            <li class="shopping-row${selected.has(item.key) ? ' is-on' : ''}">
              <button type="button" class="shopping-row-main" data-ingredient-key="${escapeAttr(item.key)}"
                      aria-pressed="${selected.has(item.key) ? 'true' : 'false'}">
                <span class="shopping-check" aria-hidden="true"><i class="fas fa-check"></i></span>
                <span class="shopping-row-name">${escapeHtml(item.name)}</span>
              </button>
              <button type="button" class="shopping-row-edit" data-ingredient-edit="${escapeAttr(item.key)}"
                      aria-label="Pas ${escapeAttr(item.name)} aan">
                <i class="fas fa-pen" aria-hidden="true"></i>
              </button>
            </li>`).join('')}
        </ul>
      </section>`).join('');

    const allSelected = selected.size === items.length;
    if (ingredientPickCount) ingredientPickCount.textContent = `${selected.size} geselecteerd`;
    if (ingredientPickToggleAllBtn) {
      ingredientPickToggleAllBtn.classList.remove('hidden');
      ingredientPickToggleAllBtn.textContent = allSelected ? 'Alles uit' : 'Alles aan';
    }
    if (selected.size) ingredientPickConfirmBtn?.removeAttribute('disabled');
    else ingredientPickConfirmBtn?.setAttribute('disabled', 'disabled');

    // Meteen kunnen typen, met de cursor achteraan zodat '400 g kipfilet' zich
    // laat bijwerken zonder eerst te hoeven slepen.
    if (editingKey) {
      const veld = ingredientPickBody.querySelector('[data-ingredient-input]');
      if (veld) {
        veld.focus();
        veld.setSelectionRange(veld.value.length, veld.value.length);
      }
    }
  }

  // Legt een openstaande wijziging vast zonder opnieuw te tekenen. De sleutel
  // blijft die van het oorspronkelijke ingrediënt: daar hangt de aan/uit-stand
  // aan, en die mag niet omvallen doordat je de tekst wijzigt.
  function flushIngredientEdit() {
    const key = ingredientPickState.editingKey;
    if (!key) return false;
    const veld = ingredientPickBody?.querySelector('[data-ingredient-input]');
    const item = ingredientPickState.items.find(i => i.key === key);
    const schoon = String(veld?.value ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (item && schoon) item.name = schoon;
    ingredientPickState.editingKey = null;
    return true;
  }

  function commitIngredientEdit() {
    if (flushIngredientEdit()) renderIngredientPicker();
  }

  function openIngredientPicker({ subtitle, items: rawItems, onConfirm: handler }) {
    onConfirm = handler || null;
    const items = [];
    const seen = new Set();
    rawItems.forEach(raw => {
      const name = String(raw?.name || '').trim().replace(/\s+/g, ' ');
      const key = shoppingItemKey(name);
      if (!name || !key || seen.has(key)) return;
      seen.add(key);
      items.push({ key, name, source_title: raw?.source_title || '' });
    });

    // Standaard staat alles aan: je vinkt uit wat je al in huis hebt.
    ingredientPickState = { items, selected: new Set(items.map(item => item.key)), editingKey: null };
    if (ingredientPickSub) ingredientPickSub.textContent = subtitle || '';
    renderIngredientPicker();
    ingredientPickModal?.classList.remove('hidden');
    ingredientPickModal?.setAttribute('aria-hidden', 'false');
  }

  function closeIngredientPickerPanel() {
    hideModal(ingredientPickModal);
    ingredientPickModal?.setAttribute('aria-hidden', 'true');
  }

  function showIngredientPickerLoading(subtitle) {
    onConfirm = null;
    ingredientPickState = { items: [], selected: new Set(), editingKey: null };
    if (ingredientPickSub) ingredientPickSub.textContent = subtitle || '';
    if (ingredientPickCount) ingredientPickCount.textContent = '';
    ingredientPickToggleAllBtn?.classList.add('hidden');
    if (ingredientPickBody) {
      ingredientPickBody.innerHTML = '<p class="shopping-empty">Ingrediënten ophalen…</p>';
    }
    ingredientPickConfirmBtn?.setAttribute('disabled', 'disabled');
    ingredientPickModal?.classList.remove('hidden');
    ingredientPickModal?.setAttribute('aria-hidden', 'false');
  }


  function isOpen() {
    return !!ingredientPickModal && !ingredientPickModal.classList.contains('hidden');
  }

  async function confirmIngredientPicker() {
    // Je kunt op 'Toevoegen' tikken terwijl een veld nog openstaat; dan telt wat
    // je net getypt hebt, niet de oorspronkelijke regel uit het recept.
    flushIngredientEdit();
    const chosen = ingredientPickState.items.filter(item => ingredientPickState.selected.has(item.key));
    if (!chosen.length || !onConfirm) return;

    ingredientPickConfirmBtn?.setAttribute('disabled', 'disabled');
    try {
      const gelukt = await onConfirm(chosen.map(item => ({ name: item.name, source_title: item.source_title })));
      if (gelukt !== false) closeIngredientPickerPanel();
    } finally {
      ingredientPickConfirmBtn?.removeAttribute('disabled');
    }
  }

  closeIngredientPickModalBtn?.addEventListener('click', closeIngredientPickerPanel);
  ingredientPickCancelBtn?.addEventListener('click', closeIngredientPickerPanel);
  ingredientPickModal?.addEventListener('click', e => {
    if (e.target === ingredientPickModal) closeIngredientPickerPanel();
  });

  ingredientPickBody?.addEventListener('click', e => {
    // In het veld zelf tikken (of selecteren) mag het veld niet sluiten.
    if (e.target.closest('[data-ingredient-input]')) return;

    const bewerkKnop = e.target.closest('[data-ingredient-edit]');
    const opslaanKnop = e.target.closest('[data-ingredient-save]');
    const row = e.target.closest('[data-ingredient-key]');

    const vorigeKey = ingredientPickState.editingKey;
    const warOpen = flushIngredientEdit();

    if (bewerkKnop) {
      const key = bewerkKnop.dataset.ingredientEdit;
      // Nog een keer op hetzelfde potlood sluit het veld weer.
      ingredientPickState.editingKey = vorigeKey === key ? null : key;
      renderIngredientPicker();
      return;
    }

    if (row) {
      const key = row.dataset.ingredientKey;
      if (ingredientPickState.selected.has(key)) ingredientPickState.selected.delete(key);
      else ingredientPickState.selected.add(key);
      renderIngredientPicker();
      return;
    }

    if (opslaanKnop || warOpen) renderIngredientPicker();
  });

  ingredientPickBody?.addEventListener('keydown', e => {
    const veld = e.target.closest('[data-ingredient-input]');
    if (!veld) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commitIngredientEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      ingredientPickState.editingKey = null;
      renderIngredientPicker();
    }
  });

  // Ergens anders tikken slaat op, zoals overal in de app.
  ingredientPickBody?.addEventListener('focusout', e => {
    if (e.target.closest('[data-ingredient-input]')) commitIngredientEdit();
  });

  ingredientPickToggleAllBtn?.addEventListener('click', () => {
    const { items, selected } = ingredientPickState;
    ingredientPickState.selected = selected.size === items.length
      ? new Set()
      : new Set(items.map(item => item.key));
    renderIngredientPicker();
  });

  ingredientPickConfirmBtn?.addEventListener('click', confirmIngredientPicker);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) closeIngredientPickerPanel();
  });

  return {
    open: openIngredientPicker,
    showLoading: showIngredientPickerLoading,
    close: closeIngredientPickerPanel,
    isOpen,
    groupByCategory: groupByShoppingCategory,
    categoryOf: detectShoppingCategory,
    itemKey: shoppingItemKey
  };
})();
