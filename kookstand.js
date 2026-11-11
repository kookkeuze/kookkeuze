// kookstand.js — porties omrekenen en de kookstand op de receptpagina.
// Los van recept.js, zodat het omrekenen en het koppelen van ingrediënten aan
// stappen ook zonder pagina te testen is (window.Kookstand).

(function () {
  /* ---------- Hoeveelheden omrekenen ---------- */

  const BREUKEN = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };
  const BREUK_TEKENS = '½¼¾⅓⅔⅛';

  // "1 1/2", "1/2", "1,5", "1½", "300" of "½". De langste vorm eerst, anders
  // pakt "1" alvast de eerste helft van "1 1/2".
  const GETAL = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s?[${BREUK_TEKENS}]?|[${BREUK_TEKENS}])`;
  const HOEVEELHEID_RE = new RegExp(`^(\\s*)(${GETAL})(?:(\\s*(?:-|–|tot|à)\\s*)(${GETAL}))?`);

  function leesGetal(tekst) {
    const t = String(tekst).trim();
    let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
    m = t.match(/^(\d+)\/(\d+)$/);
    if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
    m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)?\\s?([${BREUK_TEKENS}])?$`));
    if (m && (m[1] || m[2])) {
      return (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? BREUKEN[m[2]] : 0);
    }
    return null;
  }

  // Terug naar tekst zoals je het in een recept zou schrijven: hele getallen
  // boven de tien, anders een breuk als die er dichtbij zit (1½, ¾), en
  // anders één decimaal met een komma.
  const BREUK_STAPPEN = [[1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾']];

  function schrijfGetal(waarde) {
    if (waarde >= 10) return String(Math.round(waarde));
    const heel = Math.floor(waarde);
    const rest = waarde - heel;
    if (heel > 0 && rest < 0.06) return String(heel);
    if (rest > 0.94) return String(heel + 1);
    for (const [deel, teken] of BREUK_STAPPEN) {
      if (Math.abs(rest - deel) < 0.04) return `${heel || ''}${teken}`;
    }
    // Heel kleine hoeveelheden (een snufje van een snufje) niet op 0 laten uitkomen.
    const afgerond = waarde < 0.1 ? Math.round(waarde * 100) / 100 : Math.round(waarde * 10) / 10;
    return String(afgerond || 0.01).replace('.', ',');
  }

  // Rekent de hoeveelheid aan het begin van een ingrediënt om ("300 g pasta",
  // "2-3 tenen knoflook", "½ ui"). Zonder hoeveelheid ("peper en zout")
  // blijft de regel zoals hij is.
  function schaalIngredient(regel, factor) {
    const tekst = String(regel || '');
    if (!factor || Math.abs(factor - 1) < 1e-9) return tekst;
    const m = tekst.match(HOEVEELHEID_RE);
    if (!m) return tekst;
    const van = leesGetal(m[2]);
    if (van == null) return tekst;
    let nieuw = schrijfGetal(van * factor);
    if (m[4]) {
      const tot = leesGetal(m[4]);
      if (tot != null) nieuw += `${m[3]}${schrijfGetal(tot * factor)}`;
    }
    // "1½el" plakt anders tegen de eenheid aan als er eerst een spatie stond.
    const rest = tekst.slice(m[0].length);
    const spatie = /\s$/.test(m[4] || m[2]) ? ' ' : '';
    return `${m[1]}${nieuw}${spatie}${rest}`;
  }

  /* ---------- Welke ingrediënten bij welke stap ----------
     Een ingrediënt hoort bij de eerste stap waarin het genoemd wordt, net als
     in een kookboek: daar pak je het erbij. Hoeveelheden, eenheden en
     bijvoeglijke naamwoorden ("middelgrote", "kruimige") tellen niet mee. */

  const NIET_ZOEKEN = new Set((
    'g gr gram kg kilo ml cl dl l liter el eetlepel eetlepels tl theelepel theelepels ' +
    'stuk stuks teen tenen teentje teentjes snuf snufje snufjes scheut scheutje mespunt ' +
    'blik blikje blikjes pak pakje pakjes zak zakje zakjes bos bosje bosjes plak plakje plakjes ' +
    'plakken handje handvol takje takjes blaadje blaadjes stengel stengels kop kopje kopjes ' +
    'glas glaasje pot potje bakje bakjes doos fles flesje beker bekertje schep schepje ' +
    'grote groot kleine klein middelgrote middelgroot verse vers fijne fijn fijngehakte ' +
    'gehakte gesneden geraspte gesnipperde gekookte gebakken gegrilde geroosterde ' +
    'rode rood groene groen gele geel witte wit zwarte zwart bruine bruin ' +
    'milde mild extra vierge kruimige kruimig vastkokende vastkokend ongezouten gezouten ' +
    'zachte zacht koude koud warme warm lauwe lauw droge droog gedroogde gemalen hele heel ' +
    'halve half rijpe rijp biologische naturel light mager magere volle vol ' +
    'naar smaak voor de het een en of met van in op om te ca circa ongeveer optioneel ' +
    'evt eventueel eventjes wat beetje paar enkele'
  ).split(/\s+/));

  function zonderAccenten(tekst) {
    return String(tekst || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Grof Nederlands meervoud eraf en dubbele klinkers enkel, zodat "uien" en
  // "ui", "tomaten" en "tomaat" hetzelfde woord worden.
  function stam(woord) {
    let w = woord;
    for (const uitgang of ['tjes', 'jes', 'en', 's']) {
      if (w.endsWith(uitgang) && w.length - uitgang.length >= 2) {
        w = w.slice(0, -uitgang.length);
        break;
      }
    }
    return w.replace(/([aeiou])\1/g, '$1');
  }

  function woorden(tekst) {
    return zonderAccenten(tekst).match(/[a-z]+/g) || [];
  }

  function ingredientWoorden(regel) {
    const naam = String(regel || '')
      .replace(HOEVEELHEID_RE, '')
      .split(/[(,]/)[0];
    return [...new Set(woorden(naam)
      .filter(w => w.length >= 2 && !NIET_ZOEKEN.has(w))
      .map(stam))];
  }

  function woordenPassen(a, b) {
    if (a === b) return a.length >= 2;
    const kortste = Math.min(a.length, b.length);
    // Samenstellingen eindigen in het Nederlands op het hoofdwoord:
    // "olijfolie" is olie, "kookroom" is room, "winterpeen" is peen.
    if (kortste >= 3 && (a.endsWith(b) || b.endsWith(a))) return true;
    // En "kipfilet" in de stap bij "kipfiletreepjes" als ingrediënt.
    return kortste >= 4 && (a.startsWith(b) || b.startsWith(a));
  }

  // Geeft per stap de indexen van de ingrediënten terug, plus de ingrediënten
  // die in geen enkele stap genoemd worden.
  function koppelIngredienten(ingredienten, stappen) {
    const stapWoorden = stappen.map(stap => woorden(stap).map(stam));
    const perStap = stappen.map(() => []);
    const overig = [];
    ingredienten.forEach((regel, index) => {
      const zoek = ingredientWoorden(regel);
      const stapIndex = zoek.length
        ? stapWoorden.findIndex(lijst => lijst.some(w => zoek.some(z => woordenPassen(z, w))))
        : -1;
      if (stapIndex >= 0) perStap[stapIndex].push(index);
      else overig.push(index);
    });
    return { perStap, overig };
  }

  /* ---------- Kookstand ---------- */

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const MIN_PERSONEN = 1;
  const MAX_PERSONEN = 50;

  let open = null;

  // Het scherm blijft aan zolang je kookt; zonder steun van de browser is
  // dat jammer, maar geen ramp.
  async function schermAanHouden(state) {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        state.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_err) {
      state.wakeLock = null;
    }
  }

  function openKookstand({ titel, ingredienten, stappen, personen, basis, onPersonen }) {
    if (open || !stappen.length) return;

    const { perStap, overig } = koppelIngredienten(ingredienten, stappen);
    const state = { actief: 0, personen, wakeLock: null, afgevinkt: new Set() };

    const root = document.createElement('div');
    root.className = 'cook-mode';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', `Kookstand: ${titel}`);

    const chipHtml = index => `
      <button type="button" class="cook-chip" data-ingredient="${index}" aria-pressed="false"></button>`;

    root.innerHTML = `
      <header class="cook-mode-head">
        <button type="button" class="cook-mode-close" aria-label="Kookstand sluiten">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
        <h2 class="cook-mode-title">${escapeHtml(titel)}</h2>
      </header>
      <div class="cook-mode-progress" aria-hidden="true"><span></span></div>
      <div class="cook-mode-scroll">
        <div class="cook-servings">
          <span class="cook-servings-label">Aantal personen</span>
          <div class="cook-servings-stepper">
            <button type="button" class="cook-servings-btn" data-delta="-1" aria-label="Eén persoon minder">
              <i class="fas fa-minus" aria-hidden="true"></i>
            </button>
            <span class="cook-servings-value" aria-live="polite"></span>
            <button type="button" class="cook-servings-btn" data-delta="1" aria-label="Eén persoon meer">
              <i class="fas fa-plus" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        ${overig.length ? `
          <section class="cook-extra">
            <h3>Verder nodig</h3>
            <div class="cook-chips">${overig.map(chipHtml).join('')}</div>
          </section>` : ''}
        <ol class="cook-steps">
          ${stappen.map((stap, i) => `
            <li class="cook-step" data-step="${i}">
              ${perStap[i].length ? `<div class="cook-chips">${perStap[i].map(chipHtml).join('')}</div>` : ''}
              <div class="cook-step-row">
                <span class="cook-step-num">${i + 1}</span>
                <p class="cook-step-text">${escapeHtml(stap)}</p>
              </div>
            </li>`).join('')}
        </ol>
        <p class="cook-mode-end">Eet smakelijk!</p>
      </div>
      <footer class="cook-mode-foot">
        <button type="button" class="cook-nav-btn cook-nav-prev">
          <i class="fas fa-chevron-left" aria-hidden="true"></i> Vorige
        </button>
        <button type="button" class="cook-nav-btn cook-nav-next green-btn"></button>
      </footer>`;

    document.body.appendChild(root);
    document.documentElement.classList.add('cook-mode-open');

    const scroller = root.querySelector('.cook-mode-scroll');
    const balk = root.querySelector('.cook-mode-progress span');
    const vorige = root.querySelector('.cook-nav-prev');
    const volgende = root.querySelector('.cook-nav-next');
    const stapEls = Array.from(root.querySelectorAll('.cook-step'));
    const factor = () => state.personen / basis;

    function tekenPersonen() {
      root.querySelector('.cook-servings-value').textContent = String(state.personen);
      root.querySelector('[data-delta="-1"]').disabled = state.personen <= MIN_PERSONEN;
      root.querySelector('[data-delta="1"]').disabled = state.personen >= MAX_PERSONEN;
      root.querySelectorAll('.cook-chip').forEach(chip => {
        chip.textContent = schaalIngredient(ingredienten[Number(chip.dataset.ingredient)], factor());
      });
    }

    function tekenStap(scrollen) {
      stapEls.forEach((el, i) => {
        el.classList.toggle('is-active', i === state.actief);
        el.classList.toggle('is-done', i < state.actief);
      });
      balk.style.width = `${((state.actief + 1) / stappen.length) * 100}%`;
      vorige.disabled = state.actief === 0;
      const laatste = state.actief === stappen.length - 1;
      volgende.innerHTML = laatste
        ? 'Klaar <i class="fas fa-check" aria-hidden="true"></i>'
        : 'Volgende <i class="fas fa-chevron-right" aria-hidden="true"></i>';
      if (scrollen) {
        const el = stapEls[state.actief];
        // De actieve stap net onder de personenkiezer, zodat je ziet wat er nog komt.
        const doel = el.offsetTop - scroller.clientHeight * 0.18;
        scroller.scrollTo({ top: Math.max(0, doel), behavior: 'smooth' });
      }
    }

    function naarStap(index) {
      state.actief = Math.max(0, Math.min(stappen.length - 1, index));
      tekenStap(true);
    }

    root.addEventListener('click', e => {
      const delta = e.target.closest('.cook-servings-btn');
      if (delta) {
        state.personen = Math.max(MIN_PERSONEN, Math.min(MAX_PERSONEN, state.personen + Number(delta.dataset.delta)));
        tekenPersonen();
        onPersonen?.(state.personen);
        return;
      }
      const chip = e.target.closest('.cook-chip');
      if (chip) {
        const klaar = chip.classList.toggle('is-checked');
        chip.setAttribute('aria-pressed', klaar ? 'true' : 'false');
        return;
      }
      const stap = e.target.closest('.cook-step');
      if (stap) naarStap(Number(stap.dataset.step));
    });

    vorige.addEventListener('click', () => naarStap(state.actief - 1));
    volgende.addEventListener('click', () => {
      if (state.actief === stappen.length - 1) sluitViaGeschiedenis();
      else naarStap(state.actief + 1);
    });

    function opToets(e) {
      if (e.key === 'Escape') sluitViaGeschiedenis();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); naarStap(state.actief + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); naarStap(state.actief - 1); }
    }

    function opZichtbaar() {
      // De browser laat het scherm-aan-slot los als je even wegschakelt.
      if (document.visibilityState === 'visible' && !state.wakeLock) schermAanHouden(state);
    }

    function sluit() {
      document.removeEventListener('keydown', opToets);
      document.removeEventListener('visibilitychange', opZichtbaar);
      window.removeEventListener('popstate', sluit);
      state.wakeLock?.release?.().catch(() => {});
      document.documentElement.classList.remove('cook-mode-open');
      root.classList.add('is-leaving');
      setTimeout(() => root.remove(), 200);
      open = null;
    }

    // De terugknop van de telefoon sluit de kookstand in plaats van de
    // receptpagina te verlaten.
    function sluitViaGeschiedenis() {
      if (history.state && history.state.kookstand) history.back();
      else sluit();
    }

    root.querySelector('.cook-mode-close').addEventListener('click', sluitViaGeschiedenis);
    document.addEventListener('keydown', opToets);
    document.addEventListener('visibilitychange', opZichtbaar);
    try {
      history.pushState({ kookstand: true }, '');
      window.addEventListener('popstate', sluit);
    } catch (_err) {
      /* zonder geschiedenis sluit alleen het kruisje */
    }

    open = { sluit };
    tekenPersonen();
    tekenStap(false);
    schermAanHouden(state);
    root.querySelector('.cook-mode-close').focus({ preventScroll: true });
  }

  window.Kookstand = {
    schaalIngredient,
    koppelIngredienten,
    open: openKookstand,
    MIN_PERSONEN,
    MAX_PERSONEN
  };
})();
