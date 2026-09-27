/* footer-tree.js — de uitklapmenu's onder "Recepten kiezen" in de footer
   vloeiend laten open- en dichtgaan.

   Zonder dit script zijn het gewone <details>-elementen: ze werken, maar
   springen in één frame open en dicht. Met script animeert de hoogte via
   grid-template-rows (0fr ↔ 1fr) op een kritisch gedempte veer (--footer-spring
   in styles.css). Een CSS-transitie vertrekt bij een onderbreking vanaf de
   waarde die nu op het scherm staat, dus tik je tijdens het dichtgaan opnieuw,
   dan draait het menu om vanaf waar het is — geen sprong, niet eerst wachten.

   Een <details> verbergt zijn inhoud zodra hij dicht is. Dichtgaan is daarom
   eerst de klasse weghalen (de animatie loopt) en pas daarna open = false. */
(function () {
  const tree = document.querySelector('.footer-tree');
  if (!tree || tree.classList.contains('is-enhanced')) return;

  const nodes = Array.from(tree.querySelectorAll('.footer-tree-node'));
  const panelOf = node => node.querySelector(':scope > .footer-tree-panel');
  const isTopLevel = node => !node.parentElement.closest('.footer-tree-node');

  nodes.forEach(node => {
    // Maar één hoofdmenu tegelijk open regelen we zelf, zodat het andere menu
    // meeanimeert; name= zou het in één frame dichtgooien.
    node.removeAttribute('name');
    if (node.open) node.classList.add('is-open');
    // Zoeken op de pagina (Ctrl+F) kan een menu openen buiten ons om; dan de
    // klasse bijtrekken. Onze eigen wisselingen negeren: dat event komt pas
    // een taak later en zou een menu dat intussen dichtgaat weer openzetten.
    node.addEventListener('toggle', () => {
      if (node._ownToggle) {
        node._ownToggle = false;
        return;
      }
      node.classList.toggle('is-open', node.open);
    });
  });
  tree.classList.add('is-enhanced');

  // Langste transitie (duur + vertraging) van deze elementen, in ms. Bij
  // 'verminder beweging' is dat alleen de korte cross-fade.
  function longestTransition(...elements) {
    const ms = value => value.split(',').map(v => parseFloat(v) * (v.trim().endsWith('ms') ? 1 : 1000));
    return Math.max(0, ...elements.filter(Boolean).flatMap(el => {
      const style = getComputedStyle(el);
      const durations = ms(style.transitionDuration);
      const delays = ms(style.transitionDelay);
      return durations.map((d, i) => d + (delays[i % delays.length] || 0));
    }));
  }

  function close(node) {
    node.classList.remove('is-open');
    clearTimeout(node._closeTimer);
    const panel = panelOf(node);
    node._closeTimer = setTimeout(() => {
      if (node.classList.contains('is-open')) return;
      node._ownToggle = true;
      node.open = false;
    }, longestTransition(panel, panel?.firstElementChild));
  }

  function open(node) {
    clearTimeout(node._closeTimer);
    if (!node.open) {
      node._ownToggle = true;
      node.open = true;
      // Eerst de dichte stand (0fr) laten berekenen, anders is er geen
      // beginwaarde om vanaf te animeren.
      void panelOf(node)?.offsetHeight;
    }
    node.classList.add('is-open');
    if (isTopLevel(node)) {
      nodes.forEach(other => {
        if (other !== node && isTopLevel(other) && other.classList.contains('is-open')) close(other);
      });
    }
    keepInView(node);
  }

  // De footer staat onderaan, dus een menu klapt vaak uit onder de rand van
  // het scherm. Scroll per frame precies zoveel mee als het menu groeit, zodat
  // wat je openklapte in beeld komt — maar nooit zo ver dat het kopje zelf
  // onder de menubalk verdwijnt. Stopt zodra de gebruiker zelf gaat scrollen.
  let following = 0;
  function stopFollowing() {
    cancelAnimationFrame(following);
    following = 0;
  }
  ['wheel', 'touchstart', 'keydown'].forEach(type =>
    window.addEventListener(type, stopFollowing, { passive: true })
  );

  function keepInView(node) {
    stopFollowing();
    const summary = node.querySelector(':scope > summary');
    const panel = panelOf(node);
    if (!summary || !panel) return;
    const until = performance.now() + longestTransition(panel, panel.firstElementChild) + 50;
    const step = () => {
      const overflow = panel.getBoundingClientRect().bottom + 16 - window.innerHeight;
      const room = summary.getBoundingClientRect().top - 88;
      const by = Math.min(overflow, room);
      if (by > 0.5) window.scrollBy({ top: by, behavior: 'instant' });
      following = performance.now() < until ? requestAnimationFrame(step) : 0;
    };
    following = requestAnimationFrame(step);
  }

  tree.addEventListener('click', event => {
    const summary = event.target.closest('summary');
    if (!summary || !tree.contains(summary)) return;
    const node = summary.parentElement;
    event.preventDefault();
    if (node.classList.contains('is-open')) close(node);
    else open(node);
  });
})();
