// Las tarjetas usan sus nodos originales: no duplicamos formularios ni sus eventos.
export function createClubNavigation({ viewport, gestureTarget = viewport, buttons, panels, load, canSwipe }) {
  const views = panels.map(panel => panel.dataset.viewPanel);
  const scrollPositions = new Map();
  let current = views[0];
  let gesture = null;
  let revision = 0;
  let animations = [];
  let suppressClickUntil = 0;
  let windowWidth = window.innerWidth;
  const panelFor = view => panels.find(panel => panel.dataset.viewPanel === view);
  const available = () => views.filter(view => buttons.some(button => button.dataset.view === view && !button.hidden && !button.disabled));
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clean() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    viewport.style.minHeight = '';
    viewport.classList.remove('is-dragging');
    panels.forEach(panel => {
      panel.style.transform = '';
      panel.style.position = '';
      panel.style.top = '';
      panel.style.width = '';
      panel.hidden = panel.dataset.viewPanel !== current;
      panel.inert = panel.hidden;
      panel.setAttribute('aria-hidden', String(panel.hidden));
    });
    buttons.forEach(button => {
      const active = button.dataset.view === current;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function releaseGesture() {
    const drag = gesture;
    gesture = null;
    if (drag && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
  }

  function prepare(view) {
    const panel = panelFor(view);
    panel.hidden = false;
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.style.position = 'absolute';
    panel.style.width = '100%';
    const scrollInCard = scroll => Math.max(0, scroll - viewport.offsetTop);
    panel.style.top = `${scrollInCard(window.scrollY) - scrollInCard(scrollPositions.get(view) || 0)}px`;
    viewport.style.minHeight = `${Math.max(viewport.offsetHeight, panel.offsetTop + panel.offsetHeight)}px`;
    void load(view);
    return panel;
  }

  async function settle(view, direction, from = 0, commit = true, animate = true) {
    const version = ++revision;
    const previous = current;
    const oldPanel = panelFor(previous);
    const nextPanel = panelFor(view);
    const width = viewport.clientWidth;
    scrollPositions.set(previous, window.scrollY);
    viewport.classList.remove('is-dragging');
    if (animate && !reducedMotion()) {
      const options = { duration: 280, easing: 'cubic-bezier(.22,.68,0,1)', fill: 'forwards' };
      animations = [
        oldPanel.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${commit ? -direction * width : 0}px)` }], options),
        nextPanel.animate([{ transform: `translateX(${from + direction * width}px)` }, { transform: `translateX(${commit ? 0 : direction * width}px)` }], options),
      ];
      await Promise.allSettled(animations.map(animation => animation.finished));
    }
    if (version !== revision) return;
    if (commit) current = view;
    clean();
    if (commit) window.scrollTo({ top: scrollPositions.get(current) || 0, behavior: 'instant' });
  }

  function reset() {
    revision++;
    releaseGesture();
    current = views[0];
    scrollPositions.clear();
    clean();
  }

  function refresh() {
    revision++;
    releaseGesture();
    if (!available().includes(current)) current = available()[0] || views[0];
    clean();
  }

  function show(view, { animate = true } = {}) {
    const enabled = available();
    if (!enabled.includes(view)) return;
    revision++;
    releaseGesture();
    clean();
    if (view === current) { void load(view); return; }
    const direction = enabled.indexOf(view) > enabled.indexOf(current) ? 1 : -1;
    prepare(view);
    void settle(view, direction, 0, true, animate);
  }

  buttons.forEach(button => button.addEventListener('click', () => show(button.dataset.view)));
  gestureTarget.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || animations.length || !canSwipe() || available().length < 2) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, view: null, direction: 0 };
  });
  gestureTarget.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.view) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      if (Math.abs(dy) >= Math.abs(dx)) { releaseGesture(); return; }
      viewport.setPointerCapture(gesture.id);
      viewport.classList.add('is-dragging');
    }
    event.preventDefault();
    const direction = dx < 0 ? 1 : -1;
    if (direction !== gesture.direction) {
      clean();
      viewport.classList.add('is-dragging');
      const enabled = available();
      gesture.view = enabled[(enabled.indexOf(current) + direction + enabled.length) % enabled.length];
      gesture.direction = direction;
      prepare(gesture.view);
    }
    gesture.dx = Math.max(-viewport.clientWidth, Math.min(viewport.clientWidth, dx));
    panelFor(current).style.transform = `translateX(${gesture.dx}px)`;
    panelFor(gesture.view).style.transform = `translateX(${gesture.dx + direction * viewport.clientWidth}px)`;
  }, { passive: false });

  function end(event, cancelled = false) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const drag = gesture;
    releaseGesture();
    if (!drag.view) return;
    suppressClickUntil = performance.now() + 400;
    const commit = !cancelled && Math.abs(drag.dx) >= viewport.clientWidth * 0.3;
    void settle(drag.view, drag.direction, drag.dx, commit);
  }
  gestureTarget.addEventListener('pointerup', event => end(event));
  gestureTarget.addEventListener('pointercancel', event => end(event, true));
  // En pantallas táctiles la captura inicial pertenece a la tarjeta. Su pérdida
  // burbujea al contenedor cuando este toma la captura y no termina el arrastre.
  viewport.addEventListener('lostpointercapture', event => { if (event.target === viewport) end(event, true); });
  gestureTarget.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  window.addEventListener('resize', () => {
    if (window.innerWidth === windowWidth) return;
    windowWidth = window.innerWidth;
    refresh();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && gesture) refresh(); });
  clean();
  return { show, reset, refresh };
}
