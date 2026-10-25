import { createSpring } from "./spring";

/** Wheel-only resistance; all resources and temporary wrappers are owned by this mount. */
export function initializeEdgeMotion(container: HTMLElement, reduced: MediaQueryList) {
  const controller = new AbortController();
  const signal = controller.signal;
  let boundary: HTMLDivElement | undefined;
  let surface: HTMLDivElement | undefined;
  let spring: ReturnType<typeof createSpring> | undefined;
  let pull = 0;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  const limit = 42;

  function clearEdge() {
    if (boundary && boundary.dataset.edge) {
      delete boundary.dataset.edge;
    }
  }

  function release() {
    clearTimeout(releaseTimer);
    pull = 0;
    spring?.setTarget(0);
  }

  function cancelPull() {
    clearTimeout(releaseTimer);
    pull = 0;
    spring?.reset();
    surface?.classList.remove("is-settling");
    clearEdge();
  }

  function reset() {
    cancelPull();
    document.documentElement.classList.remove("sl-physics-edge");
    clearEdge();
  }

  function initialize() {
    if (reduced.matches || spring) return;
    const main = container.querySelector(":scope > main");
    if (!main) return;
    boundary = document.createElement("div");
    boundary.className = "sl-edge-boundary";
    surface = document.createElement("div");
    surface.className = "sl-edge-surface";
    main.before(boundary);
    boundary.append(surface);
    surface.append(main);
    const footer = container.querySelector(":scope > footer");
    if (footer) surface.append(footer);
    spring = createSpring({
      onUpdate(value) {
        if (surface) surface.style.translate = `0 ${value.toFixed(3)}px`;
      },
      onRest(value) {
        if (value === 0) {
          surface?.classList.remove("is-settling");
          clearEdge();
        }
      },
    });
    document.documentElement.classList.add("sl-physics-edge");
  }

  function bypass(target: EventTarget | null) {
    if (!(target instanceof Element) || !container.contains(target)) return true;
    if (target.closest('input,textarea,select,button,a,[contenteditable="true"],#research-board,#use-cases-carousel-container,[data-lenis-prevent]')) return true;
    let node: Element | null = target;
    while (node && node !== container) {
      if (node.scrollHeight > node.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function onWheel(event: WheelEvent) {
    if (
      reduced.matches ||
      event.ctrlKey ||
      event.metaKey ||
      !event.cancelable ||
      event.defaultPrevented ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
      bypass(event.target)
    ) {
      release();
      return;
    }
    initialize();
    if (!spring || !boundary || !surface) return;
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const y = Math.max(0, scrollY);
    const top = y <= 1 && event.deltaY < 0;
    const bottom = y >= max - 1 && event.deltaY > 0;
    if (!top && !bottom) {
      if (pull !== 0) {
        release();
      } else {
        clearEdge();
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const mode = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    const delta = Math.max(-120, Math.min(120, event.deltaY * mode));
    const sign = top ? 1 : -1;
    if (pull && Math.sign(pull) !== sign) pull = 0;
    pull = Math.max(-600, Math.min(600, pull - delta));
    const resisted = sign * limit * (0.45 * Math.abs(pull)) / (limit + 0.45 * Math.abs(pull));
    boundary.dataset.edge = top ? "top" : "bottom";
    surface.classList.add("is-settling");
    spring.setTarget(resisted);
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(release, 110);
  }

  function onScroll() {
    if (boundary && boundary.dataset.edge === "bottom") {
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      if (scrollY < max - 20) {
        clearEdge();
      }
    }
  }

  initialize();
  window.addEventListener("wheel", onWheel, { capture: true, passive: false, signal });
  window.addEventListener("scroll", onScroll, { capture: true, passive: true, signal });
  document.addEventListener("pointerdown", event => {
    if (event.target instanceof Element && event.target.closest("a,button,input,textarea,select")) cancelPull();
    else release();
  }, { capture: true, signal });
  document.addEventListener("focusin", cancelPull, { capture: true, signal });
  document.addEventListener("keydown", cancelPull, { capture: true, signal });
  window.addEventListener("resize", release, { signal });
  reduced.addEventListener("change", () => {
    if (reduced.matches) reset();
    else { initialize(); if (spring) document.documentElement.classList.add("sl-physics-edge"); }
  }, { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); }, { signal });
  window.addEventListener("pagehide", reset, { signal });
  window.addEventListener("pageshow", event => { if (event.persisted && !reduced.matches) { initialize(); document.documentElement.classList.add("sl-physics-edge"); } }, { signal });
  return () => {
    controller.abort();
    reset();
    if (boundary && surface) boundary.replaceWith(...Array.from(surface.children));
  };
}
