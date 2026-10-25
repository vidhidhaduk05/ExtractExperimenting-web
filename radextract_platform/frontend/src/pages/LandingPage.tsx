import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Lenis from "lenis";
import landingMarkup from "../landing_body.html?raw";
import "../landing.css";
import { RESEARCH_PRESETS, findResearchPreset } from "../lib/researchPresets";
import { springRevealFrames } from "../assets/motion/spring";
import { initializeEdgeMotion } from "../assets/motion/edgeMotion";
import { initializeLandingCarousel } from "../assets/motion/landingCarousel";

type LandingEventMap = WindowEventMap & DocumentEventMap & GlobalEventHandlersEventMap & MediaQueryListEventMap;
type LandingWindow = Window & { stellarLenis?: Lenis | null };


export const LandingPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const html = document.documentElement;
    const landingWindow = window as LandingWindow;
    const controller = new AbortController();
    let disposed = false;
    const timeouts = new Set<number>();
    html.classList.add("stellar-landing-active");
    document.body.classList.add("stellar-landing-active");
    function later(callback: () => void, delay: number) {
      const id = window.setTimeout(() => {
        timeouts.delete(id);
        if (!disposed) callback();
      }, delay);
      timeouts.add(id);
      return id;
    }


    function listen<K extends keyof LandingEventMap>(
      target: EventTarget | null, type: K,
      listener: (event: LandingEventMap[K]) => void,
      options: AddEventListenerOptions | boolean = {},
    ) {
      target?.addEventListener(type, listener as EventListener, {
        ...(typeof options === "boolean" ? { capture: options } : options),
        signal: controller.signal,
      });
    }

    // 0. Lenis smooth scrolling with reduced-motion respect
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | null = null;

    function destroyLenis() {
      if (lenis) {
        lenis.destroy();
        lenis = null;
      }
      if (landingWindow.stellarLenis) {
        landingWindow.stellarLenis = null;
      }
    }

    function configureLenis() {
      destroyLenis();
      if (reducedMotion.matches) return;
      lenis = new Lenis({
        autoRaf: true,
        lerp: 0.1,
        smoothWheel: true,
        syncTouch: false,
        anchors: false,
        prevent: (node) =>
          node instanceof Element &&
          !!node.closest(
            "textarea, select, #research-board, #usecase-carousel-container, #use-cases-carousel-container, [data-lenis-prevent]"
          ),
      });
      landingWindow.stellarLenis = lenis;
    }

    configureLenis();
    const handleMotionChange = () => {
      configureLenis();
      if (reducedMotion.matches) {
        showAllRhythmNodes();
        stopType();
        if (rqInput && !rqInput.value) rqInput.placeholder = suggestions[0];
      } else restartType();
    };
    listen(reducedMotion, "change", handleMotionChange);

    // 1. Mobile hamburger
    const hamburger = container.querySelector("#hamburger");
    const mobileMenu = container.querySelector("#mobile-menu");
    const handleHamburger = () => {
      mobileMenu?.classList.toggle("open");
    };
    listen(hamburger, "click", handleHamburger);

    // 2. Rhythmic section reveals
    const rhythmTargets: Element[] = [];
    const rhythmRunning = new Map<Element, Animation>();
    let rhythmObserver: IntersectionObserver | null = null;
    const seenNodes = new Set<Element>();
    const rhythmRules: [string, "lift" | "paper"][] = [
      [
        ".hero-headline, .hero-content > .rq-card, .hero-content > .rq-topics, .hero-content > .hero-sub, .hero-cta-group, .hero-proof, .hero-stats-grid",
        "lift",
      ],
      [
        "main section .section-eyebrow, .features-header-row h2, .features-header-row > p, .reading-room-heading > h2, .reading-room-heading > p",
        "lift",
      ],
      [
        ".bento-grid > .feature-card, .usecase-gallery-grid > .feature-card, .reading-room-row, .radiology-evidence, .step-card, .precision-row, .testimonial-card, .faq-item",
        "lift",
      ],
      [
        ".use-cases-h2, .use-cases-desc, #how-it-works .section-h2, #testimonials .section-h2, #collaboration .section-h2, #collaboration .section-inner > p, #collaboration .collab-grid > *, #faq .section-h2",
        "lift",
      ],
      [
        "#waitlist .cta-headline, #waitlist .cta-sub, #waitlist .email-form, #waitlist .section-inner > p, .footer-top > div, .footer-bottom",
        "lift",
      ],
      [".rn-note, .board-legend, #usecase-carousel-container, #use-cases-carousel-container", "paper"],
    ];

    function showRhythmNode(node: HTMLElement) {
      rhythmRunning.get(node)?.cancel();
      rhythmRunning.delete(node);
      node.dataset.rhythmState = "shown";
      rhythmObserver?.unobserve(node);
    }

    function showAllRhythmNodes() {
      rhythmObserver?.disconnect();
      rhythmTargets.forEach((n) => showRhythmNode(n as HTMLElement));
    }

    let onFocusInHandler: ((e: FocusEvent) => void) | null = null;

    if (!reducedMotion.matches && "IntersectionObserver" in window && typeof Element.prototype.animate === "function") {
      try {
        html.classList.add("sl-rhythm");
        rhythmRules.forEach(([selector, kind]) => {
          container.querySelectorAll(selector).forEach((node) => {
            const el = node as HTMLElement;
            if (seenNodes.has(el)) return;
            seenNodes.add(el);
            el.dataset.rhythmKind =
              kind === "paper" || el.matches("form, input, textarea, select")
                ? "paper"
                : "lift";
            el.dataset.rhythmState = "pending";
            rhythmTargets.push(el);
          });
        });

        function parseTimeMs(val: string, fallback: number): number {
          if (!val) return fallback;
          const trimmed = val.trim();
          if (trimmed.endsWith("ms")) return parseFloat(trimmed) || fallback;
          if (trimmed.endsWith("s")) return (parseFloat(trimmed) * 1000) || fallback;
          const num = parseFloat(trimmed);
          if (isNaN(num)) return fallback;
          return num < 10 ? num * 1000 : num;
        }

        const computed = getComputedStyle(container);
        const duration = parseTimeMs(computed.getPropertyValue("--motion-reveal-duration"), 660);
        const beat = parseTimeMs(computed.getPropertyValue("--motion-reveal-stagger"), 90);
        const distance = computed.getPropertyValue("--motion-reveal-distance").trim() || "26px";
        const ease = computed.getPropertyValue("--motion-reveal-ease").trim() || "cubic-bezier(.22,1,.36,1)";

        rhythmObserver = new IntersectionObserver(
          (entries) => {
            const batch = entries
              .filter(
                (entry) =>
                  entry.isIntersecting && (entry.target as HTMLElement).dataset.rhythmState === "pending"
              )
              .sort((a, b) =>
                a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
              );
            const beats = new Map<Element, number>();
            batch.forEach((entry) => {
              const node = entry.target as HTMLElement;
              rhythmObserver?.unobserve(node);
              if (entry.boundingClientRect.bottom < 0 || reducedMotion.matches) {
                showRhythmNode(node);
                return;
              }
              const group = node.closest("section, footer") || html;
              const index = beats.get(group) || 0;
              beats.set(group, index + 1);
              node.dataset.rhythmState = "entering";
              const isPaper = node.dataset.rhythmKind === "paper";
              node.dataset.rhythmMotion = isPaper ? "fade" : "spring";
              const animation = node.animate(
                isPaper ? [
                  { opacity: 0, translate: "0 0" },
                  { opacity: 1, translate: "0 0" },
                ] : springRevealFrames(parseFloat(distance), duration),
                {
                  duration: isPaper ? duration * 0.85 : duration,
                  delay: Math.min(index, 3) * beat,
                  easing: isPaper ? ease : "linear",
                  fill: "backwards",
                }
              );
              rhythmRunning.set(node, animation);
              animation.finished
                .then(() => {
                  if (rhythmRunning.get(node) === animation) {
                    rhythmRunning.delete(node);
                    node.dataset.rhythmState = "shown";
                  }
                })
                .catch(() => {});
            });
          },
          { threshold: 0.04, rootMargin: "0px 0px -5% 0px" }
        );

        rhythmTargets.forEach((n) => rhythmObserver?.observe(n));

        onFocusInHandler = (event: FocusEvent) => {
          let node = event.target as HTMLElement | null;
          while (node instanceof Element) {
            if (node.dataset.rhythmState && node.dataset.rhythmState !== "shown") {
              showRhythmNode(node);
            }
            node = node.parentElement;
          }
        };
        listen(document, "focusin", onFocusInHandler);
      } catch (err) {
        showAllRhythmNodes();
        html.classList.remove("sl-rhythm");
      }
    }

    // 3. Metric bars animation
    const metricVals = [92, 94, 91, 88, 90];
    const metricBars = [
      container.querySelector("#m1") as HTMLElement | null,
      container.querySelector("#m2") as HTMLElement | null,
      container.querySelector("#m3") as HTMLElement | null,
      container.querySelector("#m4") as HTMLElement | null,
      container.querySelector("#m5") as HTMLElement | null,
    ];
    const metricContainer = container.querySelector("#metric-list");
    let barObs: IntersectionObserver | null = null;
    if (metricContainer) {
      barObs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            metricBars.forEach((bar, i) => {
              if (bar) {
                later(() => {
                  bar.style.width = metricVals[i] + "%";
                }, i * 120);
              }
            });
            barObs?.disconnect();
          }
        },
        { threshold: 0.3 }
      );
      barObs.observe(metricContainer);
    }

    // 4. FAQ accordion
    const faqBtns = container.querySelectorAll(".faq-q");
    const handleFaqClick = (btn: Element) => {
      const item = btn.closest(".faq-item");
      if (!item) return;
      const isOpen = item.classList.contains("open");
      container.querySelectorAll(".faq-item").forEach((i) => {
        i.classList.remove("open");
        i.querySelector(".faq-q")?.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    };
    faqBtns.forEach((btn) => {
      listen(btn, "click", () => handleFaqClick(btn));
    });

    // 5. Waitlist form
    const waitlistForm = container.querySelector("#waitlist-form");
    const wBtn = container.querySelector("#waitlist-btn") as HTMLButtonElement | null;
    const handleWaitlist = (e: Event) => {
      e.preventDefault();
      const emailInput = waitlistForm?.querySelector(".email-input") as HTMLInputElement | null;
      if (emailInput && emailInput.value && wBtn) {
        wBtn.textContent = "✓ You're on the list!";
        wBtn.style.background = "var(--sage)";
        wBtn.disabled = true;
        emailInput.disabled = true;
      }
    };
    listen(waitlistForm, "submit", handleWaitlist);

    // 6. Smooth anchor scroll with Lenis
    const handleAnchor = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (link) {
        const href = link.getAttribute("href");
        if (href && href.length > 1 && !href.startsWith("#/")) {
          const el = container.querySelector(href) as HTMLElement | null;
          if (el) {
            e.preventDefault();
            if (lenis) {
              lenis.scrollTo(el, { offset: -80 });
            } else {
              window.scrollTo({
                top: el.getBoundingClientRect().top + window.scrollY - 80,
                behavior: reducedMotion.matches ? "instant" : "smooth",
              });
            }
          }
        }
      }
    };
    listen(container, "click", handleAnchor);

    // 7. Hero mockup parallax tilt
    const heroMockup = container.querySelector("#hero-mockup") as HTMLElement | null;
    const handleMouseMove = (e: MouseEvent) => {
      if (!heroMockup || reducedMotion.matches) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 12;
      const y = (e.clientY / window.innerHeight - 0.5) * 8;
      heroMockup.style.transform = "rotateY(" + (-6 + x * 0.4) + "deg) rotateX(" + (3 - y * 0.4) + "deg)";
    };
    listen(window, "mousemove", handleMouseMove, { passive: true });

    const cleanupEdge = initializeEdgeMotion(container, reducedMotion);

    // 8. Research board draggable sticky notes
    const board = container.querySelector("#research-board") as HTMLElement | null;
    let cleanupBoard: (() => void) | null = null;
    if (board) {
      const notes = board.querySelectorAll(".rn-note") as NodeListOf<HTMLElement>;
      let zCounter = 100;
      let activeNote: HTMLElement | null = null;
      const dragOffset = { x: 0, y: 0 };
      const boardRects = new WeakMap<HTMLElement, DOMRect>();

      function placeNote(note: HTMLElement) {
        if (!board) return;
        const bW = board.clientWidth;
        const bH = board.clientHeight;
        const nW = note.offsetWidth || 240;
        const nH = note.offsetHeight || 260;

        const pctX = parseFloat(note.dataset.x || "5");
        const pctY = parseFloat(note.dataset.y || "10");
        const rot = parseFloat(note.dataset.rot || "0");

        let left = Math.max(16, Math.min(bW - nW - 16, (pctX / 100) * bW));
        let top = Math.max(60, Math.min(bH - nH - 16, (pctY / 100) * bH));

        note.style.left = left + "px";
        note.style.top = top + "px";
        note.style.transform = "rotate(" + rot + "deg)";
        note.style.setProperty("--rot", rot + "deg");
        note.style.zIndex = (zCounter++).toString();
      }

      if (document.fonts) {
        document.fonts.ready.then(() => { if (!disposed) notes.forEach(placeNote); });
      } else {
        later(() => notes.forEach(placeNote), 100);
      }

      let resizeTimer: ReturnType<typeof setTimeout>;
      const handleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = later(() => notes.forEach(placeNote), 200);
      };
      listen(window, "resize", handleResize, { passive: true });

      function onPointerDown(this: HTMLElement, e: PointerEvent) {
        if ((e.target as HTMLElement).closest(".rn-link")) return;
        e.preventDefault();
        activeNote = this;
        this.classList.add("lifting");
        this.classList.remove("landing");
        this.style.zIndex = (++zCounter).toString();
        this.setPointerCapture(e.pointerId);

        const rect = this.getBoundingClientRect();
        const boardRect = board!.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        boardRects.set(this, boardRect);
      }

      function onPointerMove(this: HTMLElement, e: PointerEvent) {
        if (!activeNote || activeNote !== this) return;
        e.preventDefault();
        const bRect = boardRects.get(this) || board!.getBoundingClientRect();
        const nW = this.offsetWidth;
        const nH = this.offsetHeight;
        const bW = bRect.width;
        const bH = bRect.height;

        let newLeft = e.clientX - bRect.left - dragOffset.x;
        let newTop = e.clientY - bRect.top - dragOffset.y;

        newLeft = Math.max(0, Math.min(bW - nW, newLeft));
        newTop = Math.max(0, Math.min(bH - nH, newTop));

        this.style.left = newLeft + "px";
        this.style.top = newTop + "px";

        const rot = parseFloat(this.dataset.rot || "0");
        const velX = (e.movementX || 0) * 0.08;
        this.style.transform = "rotate(" + (rot + velX) + "deg) scale(1.04)";
      }

      function onPointerUp(this: HTMLElement, e: PointerEvent) {
        if (!activeNote || activeNote !== this) return;
        const rot = parseFloat(this.dataset.rot || "0");
        const bW = board!.clientWidth;
        const bH = board!.clientHeight;
        const curLeft = parseFloat(this.style.left) || 0;
        const curTop = parseFloat(this.style.top) || 0;
        this.dataset.x = ((curLeft / bW) * 100).toFixed(1);
        this.dataset.y = ((curTop / bH) * 100).toFixed(1);

        this.style.setProperty("--note-transform", "translate(0,0)");
        this.style.transform = "rotate(" + rot + "deg)";
        this.classList.remove("lifting");
        this.classList.add("landing");
        later(() => this.classList.remove("landing"), 520);
        activeNote = null;
      }

      notes.forEach((note) => {
        listen(note, "pointerdown", onPointerDown);
        listen(note, "pointermove", onPointerMove);
        listen(note, "pointerup", onPointerUp);
        listen(note, "pointercancel", onPointerUp);
        listen(note, "keydown", event => {
          const step = event.shiftKey ? 20 : 8;
          const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
          const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
          if (!dx && !dy) return;
          event.preventDefault();
          const left = Math.max(0, Math.min(board.clientWidth - note.offsetWidth, (parseFloat(note.style.left) || 0) + dx));
          const top = Math.max(0, Math.min(board.clientHeight - note.offsetHeight, (parseFloat(note.style.top) || 0) + dy));
          note.style.left = left + "px"; note.style.top = top + "px";
          note.dataset.x = String((left / board.clientWidth) * 100);
          note.dataset.y = String((top / board.clientHeight) * 100);
          note.style.zIndex = String(++zCounter);
        });
      });

      cleanupBoard = () => {
        window.removeEventListener("resize", handleResize);
        notes.forEach((note) => {
          note.removeEventListener("pointerdown", onPointerDown);
          note.removeEventListener("pointermove", onPointerMove);
          note.removeEventListener("pointerup", onPointerUp);
          note.removeEventListener("pointercancel", onPointerUp);
        });
      };
    }

    // 9. Approved use-case carousel with mount-owned listeners and RAF.
    const cleanupCarousel = initializeLandingCarousel(container, reducedMotion);

    // 11. Research Question Form Integration with ClaimScape
    const rqForm = container.querySelector("#research-question-form") as HTMLFormElement | null;
    const rqInput = container.querySelector("#research-question") as HTMLTextAreaElement | null;
    const rqQueryInput = container.querySelector("#rq-query") as HTMLInputElement | null;
    const rqQueryMode = container.querySelector("#rq-query-mode") as HTMLElement | null;
    const rqQueryReset = container.querySelector("#rq-query-reset") as HTMLElement | null;
    const rqIncludeCommentary = container.querySelector("#rq-include-commentary") as HTMLInputElement | null;
    const rqStatus = container.querySelector("#rq-status") as HTMLElement | null;

    let customQuery = false;
    const buildPubMedQuery = (claimText: string) => {
      const preset = findResearchPreset(claimText);
      if (preset) return preset.query;
      let q = claimText.trim();
      if (!q) return "";
      const directional = [
        /\breduces\b/gi, /\breduce\b/gi, /\bdecreases\b/gi, /\bdecrease\b/gi,
        /\bincreases\b/gi, /\bincrease\b/gi, /\bimproves\b/gi, /\bimprove\b/gi,
        /\bworsens\b/gi, /\bworsen\b/gi, /\bprevents\b/gi, /\bprevent\b/gi,
        /\bcauses\b/gi, /\bcause\b/gi, /\bleads to\b/gi, /\bprotects against\b/gi,
        /\bprotective nature against\b/gi, /\bprotective against\b/gi,
        /\blowers\b/gi, /\blower\b/gi, /\belevates\b/gi, /\belevate\b/gi,
        /\bextends\b/gi, /\bextend\b/gi
      ];
      for (const d of directional) {
        q = q.replace(d, " ");
      }
      q = q.replace(/[^\w\s-]/g, " ");
      const stopWords = new Set([
        "the", "a", "an", "and", "or", "for", "with", "from", "in", "on", "at",
        "by", "to", "of", "is", "are", "was", "were", "risk", "nature"
      ]);
      const terms = q.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));
      return terms.join(" ");
    };

    function syncQuery() {
      if (!rqInput || !rqQueryInput) return;
      if (!customQuery) rqQueryInput.value = buildPubMedQuery(rqInput.value);
      if (rqQueryMode) {
        rqQueryMode.textContent = customQuery ? "Custom query" : findResearchPreset(rqInput.value) ? "Preset query · edit to refine" : "Auto-built · edit to refine";
      }
    }

    listen(rqQueryInput, "input", () => {
      customQuery = true;
      syncQuery();
    });

    listen(rqQueryReset, "click", () => {
      customQuery = false;
      syncQuery();
    });

    // Suggested questions and topics
    container.querySelectorAll("[data-research-question]").forEach((button) => {
      listen(button, "click", () => {
        const qVal = (button as HTMLElement).dataset.researchQuestion || "";
        if (rqInput) {
          rqInput.value = qVal;
          customQuery = false;
          syncQuery();
          rqInput?.setCustomValidity("");
          if (lenis) {
            lenis.scrollTo(rqInput, { offset: -120 });
          } else {
            rqInput.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "center" });
          }
          rqInput.focus({ preventScroll: true });
        }
      });
    });

    listen(rqInput, "input", () => {
      rqInput?.setCustomValidity("");
      syncQuery();
    });

    listen(rqInput, "keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        rqForm?.requestSubmit();
      }
    });

    listen(rqForm, "submit", (event: Event) => {
      event.preventDefault();
      if (!rqInput || !rqForm) return;
      const query = rqInput.value.trim();
      if (!query) {
        rqInput.setCustomValidity("Please enter a research question.");
        rqInput.reportValidity();
        return;
      }
      let term = (rqQueryInput?.value.trim()) || buildPubMedQuery(query) || query;
      if (rqIncludeCommentary && !rqIncludeCommentary.checked) {
        term = "(" + term + ') NOT ((Review[Publication Type] NOT ("Systematic Review"[Publication Type] OR "Meta-Analysis"[Publication Type])) OR Comment[Publication Type] OR Editorial[Publication Type])';
      }
      const paperCountInput = rqForm.querySelector('input[name="paper-count"]:checked') as HTMLInputElement | null;
      const paperCount = paperCountInput ? paperCountInput.value : "300";

      if (rqStatus) rqStatus.textContent = "Opening your question in ClaimScape…";
      rqForm.setAttribute("aria-busy", "true");
      const submitBtn = rqForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitBtn) submitBtn.disabled = true;

      const params = new URLSearchParams({ claim: query, q: term, n: paperCount });
      navigate("/claimscape?" + params.toString());
    });

    // Typewriter placeholder animation
    const suggestions = RESEARCH_PRESETS.slice(0, 3).map(preset => preset.question);

    let typeTimer: ReturnType<typeof setTimeout>;
    let sIdx = 0;
    let charCount = 0;
    let isDeleting = false;

    function tick() {
      if (!rqInput || document.activeElement === rqInput || rqInput.value || reducedMotion.matches || document.hidden) return;
      if (suggestions.length === 0) return;
      const curSuggestion = suggestions[sIdx];
      charCount += isDeleting ? -1 : 1;
      rqInput.placeholder = curSuggestion.slice(0, charCount) || "What does the evidence say about…";
      let delay = isDeleting ? 22 : 45;
      if (charCount >= curSuggestion.length) {
        isDeleting = true;
        delay = 2400;
      }
      if (charCount <= 0) {
        isDeleting = false;
        sIdx = (sIdx + 1) % suggestions.length;
        delay = 600;
      }
      typeTimer = later(tick, delay);
    }

    function stopType() { clearTimeout(typeTimer); }
    function restartType() {
      stopType();
      if (rqInput && !rqInput.value && !reducedMotion.matches) {
        typeTimer = later(tick, 900);
      }
    }

    listen(rqInput, "focus", stopType);
    listen(rqInput, "blur", restartType);
    const onVisibility = () => (document.hidden ? stopType() : restartType());
    listen(document, "visibilitychange", onVisibility);
    restartType();

    return () => {
      disposed = true;
      controller.abort();
      timeouts.forEach(id => clearTimeout(id));
      timeouts.clear();
      cleanupEdge();
      destroyLenis();
      showAllRhythmNodes();
      barObs?.disconnect();
      cleanupBoard?.();
      cleanupCarousel();
      stopType();
      html.classList.remove("sl-rhythm", "stellar-landing-active");
      document.body.classList.remove("stellar-landing-active");
    };
  }, [navigate]);

  return <div ref={containerRef} className="stellar-labs-landing-root" dangerouslySetInnerHTML={{ __html: landingMarkup }} />;
};
