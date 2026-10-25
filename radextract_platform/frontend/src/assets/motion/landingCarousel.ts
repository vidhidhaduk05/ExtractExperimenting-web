/** The approved card arrangement, with per-mount listeners and animation cleanup. */
export function initializeLandingCarousel(root: HTMLElement, reduced: MediaQueryList) {
  const container = root.querySelector<HTMLElement>("#use-cases-carousel-container");
  const cards = Array.from(container?.querySelectorAll<HTMLElement>(".carousel-card-wrapper") || []);
  if (!container || !cards.length) return () => {};
  const controller = new AbortController();
  const { signal } = controller;
  let progress = 0, target = 0, dragging = false, startX = 0, frame = 0;
  let xStep = 300, zStep = 180, dragScale = 600, angleStep = 32;
  const total = cards.length;
  function responsive() {
    if (innerWidth < 768) { xStep = 160; zStep = 110; dragScale = 400; angleStep = 28; }
    else if (innerWidth < 1024) { xStep = 240; zStep = 150; dragScale = 500; angleStep = 30; }
    else { xStep = 300; zStep = 180; dragScale = 600; angleStep = 32; }
  }
  function render() {
    const wrapped = ((progress % total) + total) % total;
    cards.forEach((card, index) => {
      let diff = index - wrapped;
      while (diff > total / 2) diff -= total;
      while (diff < -total / 2) diff += total;
      const opacity = Math.max(0, 1 - Math.abs(diff) * 0.38);
      card.style.transform = `translateX(${diff * xStep}px) translateZ(${-Math.abs(diff) * zStep}px) rotateY(${-diff * angleStep}deg)`;
      card.style.opacity = String(opacity);
      card.style.zIndex = String(Math.round(100 - Math.abs(diff) * 20));
      card.style.display = opacity <= 0.05 ? "none" : "block";
      card.style.pointerEvents = opacity > 0.05 && Math.abs(diff) < 0.4 ? "auto" : "none";
    });
  }
  function tick() {
    if (!dragging) {
      const diff = target - progress;
      progress += diff * 0.15;
      if (Math.abs(diff) < 0.001) { progress = target; render(); frame = 0; return; }
    }
    render(); frame = requestAnimationFrame(tick);
  }
  function animate() {
    if (reduced.matches) { progress = target; render(); return; }
    if (!frame) frame = requestAnimationFrame(tick);
  }
  container.addEventListener("pointerdown", event => {
    dragging = true; startX = event.clientX; container.setPointerCapture(event.pointerId);
  }, { signal });
  container.addEventListener("pointermove", event => {
    if (!dragging) return;
    progress = target - (event.clientX - startX) / dragScale;
    render();
  }, { signal });
  function release(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    if (container!.hasPointerCapture(event.pointerId)) container!.releasePointerCapture(event.pointerId);
    target = ((Math.round(progress) % total) + total) % total;
    progress = ((progress % total) + total) % total;
    animate();
  }
  container.addEventListener("pointerup", release, { signal });
  container.addEventListener("pointercancel", release, { signal });
  container.tabIndex = 0;
  container.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    target += event.key === "ArrowLeft" ? -1 : 1;
    animate();
  }, { signal });
  window.addEventListener("resize", () => { responsive(); render(); }, { signal, passive: true });
  reduced.addEventListener("change", () => {
    if (reduced.matches) { cancelAnimationFrame(frame); frame = 0; progress = target; render(); }
  }, { signal });
  responsive(); render();
  return () => { controller.abort(); cancelAnimationFrame(frame); };
}
