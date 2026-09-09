import type { ModelPose, ModelRenderer } from './modelRenderer';

const hero = document.querySelector<HTMLElement>('.orbit-hero');
const stage = document.querySelector<HTMLElement>('.arc-showcase');
if (hero && stage) setup(hero, stage);

function setup(hero: HTMLElement, stage: HTMLElement) {
  const buttons = Array.from(stage.querySelectorAll<HTMLButtonElement>('.arc-model'));
  const models = buttons.map(button => ({ id: button.dataset.model!, name: button.dataset.name!, idea: button.dataset.idea! }));
  const pauseButton = document.querySelector<HTMLButtonElement>('#arc-pause')!;
  const announcement = document.querySelector<HTMLElement>('#arc-announcement')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const lifetime = new AbortController();
  let renderer: ModelRenderer | undefined;
  let selected = 3, phase = 0, goal: number | undefined, elapsed = 0, lastTime = 0, frameId = 0;
  let paused = reducedMotion.matches, visible = true, focused = false, disposed = false;
  const yaw = models.map(() => 0);
  const hover = models.map(() => ({ x: 0, y: 0, active: false }));
  const response = models.map(() => ({ x: 0, y: 0, lift: 0 }));
  let scrollOffset = 0, scrollTarget = 0;
  let suppressClickUntil = 0;
  const smoothstep = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  const wrap = (value: number) => ((value % 1) + 1) % 1;

  function updatePause() {
    stage.dataset.paused = String(paused);
    pauseButton.setAttribute('aria-label', paused ? 'Play model motion' : 'Pause model motion');
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.innerHTML = paused
      ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M4 2l8 5-8 5z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2h3v10H3zM8 2h3v10H8z"/></svg>';
  }
  function caption(manual = false) {
    stage.dataset.selected = models[selected].id;
    document.querySelector('#arc-name')!.textContent = models[selected].name;
    document.querySelector('.arc-counter')!.textContent = `${String(selected + 1).padStart(2, '0')} / 07`;
    document.querySelector<HTMLAnchorElement>('#arc-download')!.href = `/compute/models/${models[selected].id}.glb`;
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === selected)));
    if (manual) announcement.textContent = `${models[selected].name}, model ${selected + 1} of ${models.length}.`;
  }
  function choose(index: number) {
    selected = (index + models.length) % models.length;
    paused = true;
    goal = 0.5 - (selected + 0.5) / models.length;
    goal += Math.round(phase - goal);
    if (reducedMotion.matches) { phase = goal; goal = undefined; }
    updatePause(); caption(true); schedule();
  }
  function draw() {
    const width = stage.clientWidth, height = stage.clientHeight;
    const mobile = width <= 700;
    const radiusX = width * (mobile ? 0.405 : 0.415);
    const radiusY = mobile ? 195 : 360;
    const bottom = mobile ? 270 : 457;
    let nearest = selected, nearestDistance = Infinity;
    const poses: ModelPose[] = models.map((model, i) => {
      const p = wrap((i + 0.5) / models.length + phase), angle = Math.PI * p;
      const middle = Math.abs(p - 0.5);
      if (middle < nearestDistance) { nearest = i; nearestDistance = middle; }
      const opacity = smoothstep(p / 0.045) * smoothstep((1 - p) / 0.045);
      const size = (mobile ? Math.min(86, width * 0.20) : Math.min(151, width * 0.137)) * (0.9 + 0.1 * Math.sin(angle));
      const interaction = response[i];
      const lift = interaction.lift * 9;
      const x = width / 2 - Math.cos(angle) * radiusX;
      const y = bottom - Math.sin(angle) * radiusY + Math.sin(elapsed * 0.55 + i) * (mobile ? 3 : 7) - lift - scrollOffset * (0.025 + i * 0.004);
      const whimsical = model.id === 'moon-bunny' || model.id === 'cloud-whale';
      const pose: ModelPose = { x, y, size, opacity, rotation: [(whimsical ? 0.15 : 0.3 + elapsed * 0.08) + interaction.y * 0.18,
        (whimsical ? Math.sin(elapsed * 0.2 + i) * 0.3 : i * 0.42 + elapsed * 0.16) + yaw[i] + interaction.x * 0.25 + scrollOffset * 0.00025, Math.sin(elapsed * 0.25 + i) * 0.07] };
      const button = buttons[i];
      button.style.left = `${x}px`; button.style.top = `${y}px`;
      button.style.width = `${size * 1.13}px`; button.style.height = `${size * 1.13}px`;
      button.style.opacity = String(opacity);
      // A keyboard-focused model stays targetable even as it reaches an endpoint.
      button.style.pointerEvents = opacity < 0.1 ? 'none' : '';
      return pose;
    });
    if (goal === undefined && !paused && selected !== nearest) { selected = nearest; caption(); }
    try { renderer?.render(poses, width, height); } catch (error) { console.warn('Three.js carousel frame failed:', error); fallback(); }
  }
  function tick(now: number) {
    frameId = 0;
    if (lastTime && now - lastTime < 1000 / 30 - 1) { schedule(); return; }
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.06) : 0;
    lastTime = now;
    if (goal !== undefined) {
      phase += (goal - phase) * Math.min(1, dt * 7);
      if (Math.abs(goal - phase) < 0.0001) { phase = goal; goal = undefined; }
    } else if (!paused && !focused) { elapsed += dt; phase += dt / 160; }
    let settling = false;
    const ease = Math.min(1, dt * 9);
    response.forEach((value, i) => {
      const target = hover[i];
      const x = target.active && !reducedMotion.matches ? target.x : 0;
      const y = target.active && !reducedMotion.matches ? target.y : 0;
      const lift = target.active && !reducedMotion.matches ? 1 : 0;
      value.x += (x - value.x) * ease; value.y += (y - value.y) * ease; value.lift += (lift - value.lift) * ease;
      settling ||= Math.abs(x - value.x) + Math.abs(y - value.y) + Math.abs(lift - value.lift) > 0.001;
    });
    if (reducedMotion.matches) scrollOffset = scrollTarget = 0;
    scrollOffset += (scrollTarget - scrollOffset) * ease;
    settling ||= Math.abs(scrollTarget - scrollOffset) > 0.05;
    draw();
    if ((!paused && !focused) || goal !== undefined || settling) schedule();
  }
  function schedule() {
    if (disposed || !visible || document.hidden || frameId) return;
    frameId = requestAnimationFrame(tick);
  }
  function fallback() {
    renderer?.dispose(); renderer = undefined;
    stage.dataset.state = 'poster'; delete stage.dataset.renderer;
    buttons.forEach(button => { delete button.dataset.loaded; });
  }
  function listen(target: EventTarget, event: string, handler: EventListener) { target.addEventListener(event, handler, { signal: lifetime.signal }); }
  listen(pauseButton, 'click', () => { paused = !paused; if (!paused) focused = false; goal = undefined; updatePause(); lastTime = 0; schedule(); });
  listen(document.querySelector('#arc-previous')!, 'click', () => choose(selected - 1));
  listen(document.querySelector('#arc-next')!, 'click', () => choose(selected + 1));
  listen(hero, 'keydown', raw => {
    const event = raw as KeyboardEvent;
    if (!(event.target instanceof Element) || !event.target.closest('.arc-controls, .arc-model')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); choose(selected + (event.key === 'ArrowRight' ? 1 : -1)); }
  });
  buttons.forEach((button, index) => {
    let drag: { id: number; x: number; yaw: number; moved: boolean } | undefined;
    listen(button, 'focus', () => { if (Number(button.style.opacity) < 0.1) choose(index); });
    listen(button, 'click', () => { if (performance.now() >= suppressClickUntil) choose(index); });
    listen(button, 'pointerenter', raw => {
      if ((raw as PointerEvent).pointerType === 'touch' || reducedMotion.matches) return;
      hover[index].active = true; schedule();
    });
    listen(button, 'pointerleave', () => { hover[index] = { x: 0, y: 0, active: false }; schedule(); });
    listen(button, 'pointerdown', raw => {
      const event = raw as PointerEvent;
      if (!event.isPrimary || event.button !== 0) return;
      paused = true; goal = undefined; updatePause();
      drag = { id: event.pointerId, x: event.clientX, yaw: yaw[index], moved: false };
      button.setPointerCapture(event.pointerId);
    });
    listen(button, 'pointermove', raw => {
      const event = raw as PointerEvent;
      if (hover[index].active && !drag) {
        const bounds = button.getBoundingClientRect();
        hover[index].x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
        hover[index].y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
        schedule();
      }
      if (!drag || drag.id !== event.pointerId) return;
      const distance = event.clientX - drag.x;
      drag.moved ||= Math.abs(distance) > 6;
      if (drag.moved) { yaw[index] = drag.yaw + distance * 0.013; schedule(); }
    });
    const finish = (raw: Event) => {
      const event = raw as PointerEvent;
      if (!drag || drag.id !== event.pointerId) return;
      if (drag.moved) suppressClickUntil = performance.now() + 250;
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      drag = undefined;
    };
    listen(button, 'pointerup', finish); listen(button, 'pointercancel', finish);
  });
  listen(document.querySelector('#arc-use')!, 'click', () => {
    const brief = document.querySelector<HTMLTextAreaElement>('#managed-brief')!;
    if (brief.disabled) { announcement.textContent = 'Finish your current job before starting another model.'; return; }
    brief.value = models[selected].idea;
    brief.dispatchEvent(new Event('input', { bubbles: true }));
    brief.focus({ preventScroll: true });
    document.querySelector('#start')!.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  });
  listen(hero, 'focusin', () => { focused = true; });
  listen(hero, 'focusout', raw => {
    const event = raw as FocusEvent;
    if (!(event.relatedTarget instanceof Node) || !hero.contains(event.relatedTarget)) { focused = false; lastTime = 0; schedule(); }
  });
  listen(window, 'scroll', () => {
    scrollTarget = reducedMotion.matches ? 0 : Math.max(0, Math.min(700, -hero.getBoundingClientRect().top));
    schedule();
  });
  listen(document, 'visibilitychange', () => { lastTime = 0; if (document.hidden) { cancelAnimationFrame(frameId); frameId = 0; } else schedule(); });
  listen(reducedMotion, 'change', () => { paused = reducedMotion.matches; if (paused && goal !== undefined) { phase = goal; goal = undefined; } updatePause(); schedule(); });
  const resize = new ResizeObserver(() => { draw(); schedule(); }); resize.observe(stage);
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    lastTime = 0;
    if (!visible) { cancelAnimationFrame(frameId); frameId = 0; } else schedule();
  }); intersection.observe(hero);
  listen(window, 'pagehide', raw => {
    if ((raw as PageTransitionEvent).persisted) return;
    disposed = true; cancelAnimationFrame(frameId); lifetime.abort(); resize.disconnect(); intersection.disconnect(); renderer?.dispose();
  });
  updatePause(); caption(); draw(); schedule();
  {
    void import('./modelRenderer').then(({ createModelRenderer }) => createModelRenderer(stage.querySelector<HTMLElement>('.arc-canvas')!, models.map(model => model.id), lifetime.signal, fallback))
      .then(value => { if (disposed) { value.dispose(); return; } renderer = value; stage.dataset.state = 'ready'; stage.dataset.renderer = value.backend; buttons.forEach(button => { button.dataset.loaded = 'true'; }); draw(); schedule(); })
      .catch(error => { if (!disposed) { console.warn('Three.js carousel unavailable; showing rendered models.', error); fallback(); } });
  }
}
