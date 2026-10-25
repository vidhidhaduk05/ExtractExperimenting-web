import json

with open(r'radextract_platform/frontend/src/landing_body.html', 'r', encoding='utf-8') as f:
    raw_html = f.read()

json_html = json.dumps(raw_html)

tsx_template = """import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export const LandingPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Mobile hamburger
    const hamburger = container.querySelector('#hamburger');
    const mobileMenu = container.querySelector('#mobile-menu');
    const handleHamburger = () => {
      mobileMenu?.classList.toggle('open');
    };
    hamburger?.addEventListener('click', handleHamburger);

    // 2. Scroll-triggered fade-up
    const fadeEls = container.querySelectorAll('.fade-up:not(.visible)');
    const fadeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            fadeObserver.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    fadeEls.forEach((el) => fadeObserver.observe(el));

    // 3. Metric bars animation
    const metricVals = [92, 94, 91, 88, 90];
    const metricBars = [
      container.querySelector('#m1') as HTMLElement | null,
      container.querySelector('#m2') as HTMLElement | null,
      container.querySelector('#m3') as HTMLElement | null,
      container.querySelector('#m4') as HTMLElement | null,
      container.querySelector('#m5') as HTMLElement | null,
    ];
    const metricContainer = container.querySelector('#metric-list');
    let barObs: IntersectionObserver | null = null;
    if (metricContainer) {
      barObs = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            metricBars.forEach((bar, i) => {
              if (bar) {
                setTimeout(() => {
                  bar.style.width = metricVals[i] + '%';
                }, i * 120);
              }
            });
            if (metricContainer && barObs) barObs.unobserve(metricContainer);
          }
        },
        { threshold: 0.3 }
      );
      barObs.observe(metricContainer);
    }

    // 4. FAQ accordion
    const faqBtns = container.querySelectorAll('.faq-q');
    const handleFaqClick = (btn: Element) => {
      const item = btn.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      container.querySelectorAll('.faq-item').forEach((i) => {
        i.classList.remove('open');
        i.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    };
    faqBtns.forEach((btn) => {
      btn.addEventListener('click', () => handleFaqClick(btn));
    });

    // 5. Waitlist form
    const waitlistForm = container.querySelector('#waitlist-form');
    const wBtn = container.querySelector('#waitlist-btn') as HTMLButtonElement | null;
    const handleWaitlist = (e: Event) => {
      e.preventDefault();
      const emailInput = waitlistForm?.querySelector('.email-input') as HTMLInputElement | null;
      if (emailInput && emailInput.value && wBtn) {
        wBtn.textContent = "✓ You're on the list!";
        wBtn.style.background = 'var(--sage)';
        wBtn.disabled = true;
        emailInput.disabled = true;
      }
    };
    waitlistForm?.addEventListener('submit', handleWaitlist);

    // 6. Smooth anchor scroll
    const handleAnchor = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (link) {
        const href = link.getAttribute('href');
        if (href && href.length > 1 && !href.startsWith('#/')) {
          const el = container.querySelector(href);
          if (el) {
            e.preventDefault();
            window.scrollTo({
              top: el.getBoundingClientRect().top + window.scrollY - 80,
              behavior: 'smooth',
            });
          }
        }
      }
    };
    container.addEventListener('click', handleAnchor);

    // 7. Hero mockup parallax tilt
    const heroMockup = container.querySelector('#hero-mockup') as HTMLElement | null;
    const handleMouseMove = (e: MouseEvent) => {
      if (!heroMockup) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 12;
      const y = (e.clientY / window.innerHeight - 0.5) * 8;
      heroMockup.style.transform = "rotateY(" + (-6 + x * 0.4) + "deg) rotateX(" + (3 - y * 0.4) + "deg)";
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 8. Research board draggable sticky notes
    const board = container.querySelector('#research-board') as HTMLElement | null;
    let cleanupBoard: (() => void) | null = null;
    if (board) {
      const notes = board.querySelectorAll('.rn-note') as NodeListOf<HTMLElement>;
      let zCounter = 100;
      let activeNote: HTMLElement | null = null;
      let dragOffset = { x: 0, y: 0 };

      function placeNote(note: HTMLElement) {
        if (!board) return;
        const bW = board.clientWidth;
        const bH = board.clientHeight;
        const nW = note.offsetWidth || 240;
        const nH = note.offsetHeight || 260;

        const pctX = parseFloat(note.dataset.x || '5');
        const pctY = parseFloat(note.dataset.y || '10');
        const rot = parseFloat(note.dataset.rot || '0');

        let left = Math.max(16, Math.min(bW - nW - 16, (pctX / 100) * bW));
        let top = Math.max(60, Math.min(bH - nH - 16, (pctY / 100) * bH));

        note.style.left = left + 'px';
        note.style.top = top + 'px';
        note.style.transform = "rotate(" + rot + "deg)";
        note.style.setProperty('--rot', rot + 'deg');
        note.style.zIndex = (zCounter++).toString();
      }

      if ((document as any).fonts) {
        (document as any).fonts.ready.then(() => notes.forEach(placeNote));
      } else {
        setTimeout(() => notes.forEach(placeNote), 100);
      }

      let resizeTimer: any;
      const handleResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => notes.forEach(placeNote), 200);
      };
      window.addEventListener('resize', handleResize, { passive: true });

      function onPointerDown(this: HTMLElement, e: PointerEvent) {
        if ((e.target as HTMLElement).closest('.rn-link')) return;
        e.preventDefault();
        activeNote = this;
        this.classList.add('lifting');
        this.classList.remove('landing');
        this.style.zIndex = (++zCounter).toString();
        this.setPointerCapture(e.pointerId);

        const rect = this.getBoundingClientRect();
        const boardRect = board!.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        (this as any)._boardRect = boardRect;
      }

      function onPointerMove(this: HTMLElement, e: PointerEvent) {
        if (!activeNote || activeNote !== this) return;
        e.preventDefault();
        const bRect = (this as any)._boardRect || board!.getBoundingClientRect();
        const nW = this.offsetWidth;
        const nH = this.offsetHeight;
        const bW = bRect.width;
        const bH = bRect.height;

        let newLeft = e.clientX - bRect.left - dragOffset.x;
        let newTop = e.clientY - bRect.top - dragOffset.y;

        newLeft = Math.max(0, Math.min(bW - nW, newLeft));
        newTop = Math.max(0, Math.min(bH - nH, newTop));

        this.style.left = newLeft + 'px';
        this.style.top = newTop + 'px';

        const rot = parseFloat(this.dataset.rot || '0');
        const velX = (e.movementX || 0) * 0.08;
        this.style.transform = "rotate(" + (rot + velX) + "deg) scale(1.04)";
      }

      function onPointerUp(this: HTMLElement, e: PointerEvent) {
        if (!activeNote || activeNote !== this) return;
        const rot = parseFloat(this.dataset.rot || '0');
        const bW = board!.clientWidth;
        const bH = board!.clientHeight;
        const curLeft = parseFloat(this.style.left) || 0;
        const curTop = parseFloat(this.style.top) || 0;
        this.dataset.x = ((curLeft / bW) * 100).toFixed(1);
        this.dataset.y = ((curTop / bH) * 100).toFixed(1);

        this.style.setProperty('--note-transform', 'translate(0,0)');
        this.style.transform = "rotate(" + rot + "deg)";
        this.classList.remove('lifting');
        this.classList.add('landing');
        setTimeout(() => this.classList.remove('landing'), 520);
        activeNote = null;
      }

      notes.forEach((note) => {
        note.addEventListener('pointerdown', onPointerDown);
        note.addEventListener('pointermove', onPointerMove);
        note.addEventListener('pointerup', onPointerUp);
        note.addEventListener('pointercancel', onPointerUp);
      });

      cleanupBoard = () => {
        window.removeEventListener('resize', handleResize);
        notes.forEach((note) => {
          note.removeEventListener('pointerdown', onPointerDown);
          note.removeEventListener('pointermove', onPointerMove);
          note.removeEventListener('pointerup', onPointerUp);
          note.removeEventListener('pointercancel', onPointerUp);
        });
      };
    }

    // 9. Interactive Carousel in use-case-gallery
    const carouselContainer = container.querySelector('#usecase-carousel-container') as HTMLElement | null;
    let cleanupCarousel: (() => void) | null = null;
    if (carouselContainer) {
      const items = Array.from(carouselContainer.querySelectorAll('.usecase-item')) as HTMLElement[];
      const total = items.length;
      let radius = 700;
      let centerZ = -50;
      let dragScale = 1600;
      let rotationProgress = 0;
      let targetProgress = 0;
      let isDragging = false;
      let startX = 0;
      let currentProgressOffset = 0;
      let animFrameId: number | null = null;

      function updateResponsiveParams() {
        const w = window.innerWidth;
        if (w < 480) {
          radius = 360;
          centerZ = -150;
          dragScale = 900;
        } else if (w < 768) {
          radius = 500;
          centerZ = -100;
          dragScale = 1200;
        } else if (w < 1200) {
          radius = 620;
          centerZ = -70;
          dragScale = 1450;
        } else {
          radius = 700;
          centerZ = -50;
          dragScale = 1600;
        }
      }

      function updateCarousel() {
        const angleStep = 360 / total;
        items.forEach((item, index) => {
          let itemProgress = (rotationProgress + index) % total;
          if (itemProgress < 0) itemProgress += total;

          const theta = itemProgress * angleStep * (Math.PI / 180);
          const x = Math.sin(theta) * radius;
          const z = Math.cos(theta) * radius + centerZ;
          const rotY = itemProgress * angleStep;

          let distFromFront = Math.abs(itemProgress - total);
          distFromFront = Math.min(itemProgress, distFromFront);
          const normDist = distFromFront / (total / 2);
          const opacity = 1 - normDist * 0.7;

          item.style.transform = "translate3d(" + x.toFixed(1) + "px, 0px, " + z.toFixed(1) + "px) rotateY(" + rotY.toFixed(1) + "deg)";
          item.style.opacity = Math.max(0.15, opacity).toFixed(2);
          item.style.zIndex = Math.round(z + 1000).toString();
        });
      }

      function animate() {
        if (!isDragging) {
          const diff = targetProgress - rotationProgress;
          rotationProgress += diff * 0.1;
          if (Math.abs(diff) < 0.001) {
            rotationProgress = targetProgress;
            updateCarousel();
            animFrameId = null;
            return;
          }
        }
        updateCarousel();
        animFrameId = requestAnimationFrame(animate);
      }

      function startAnimIfNeeded() {
        if (!animFrameId) {
          animFrameId = requestAnimationFrame(animate);
        }
      }

      function onCarouselPointerDown(this: HTMLElement, e: PointerEvent) {
        isDragging = true;
        startX = e.clientX;
        currentProgressOffset = 0;
        this.setPointerCapture(e.pointerId);
      }

      function onCarouselPointerMove(this: HTMLElement, e: PointerEvent) {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        currentProgressOffset = -deltaX / dragScale;
        rotationProgress = targetProgress + currentProgressOffset;
        startAnimIfNeeded();
      }

      function onCarouselPointerUp(this: HTMLElement, e: PointerEvent) {
        if (!isDragging) return;
        isDragging = false;
        try { this.releasePointerCapture(e.pointerId); } catch {}

        targetProgress = Math.round(rotationProgress);
        while (targetProgress < 0) targetProgress += total;
        while (targetProgress >= total) targetProgress -= total;

        let wrapped = rotationProgress;
        while (wrapped < 0) wrapped += total;
        while (wrapped >= total) wrapped -= total;
        rotationProgress = wrapped;

        startAnimIfNeeded();
      }

      carouselContainer.addEventListener('pointerdown', onCarouselPointerDown);
      carouselContainer.addEventListener('pointermove', onCarouselPointerMove);
      carouselContainer.addEventListener('pointerup', onCarouselPointerUp);
      carouselContainer.addEventListener('pointercancel', onCarouselPointerUp);

      updateResponsiveParams();
      const onCarouselResize = () => {
        updateResponsiveParams();
        updateCarousel();
      };
      window.addEventListener('resize', onCarouselResize, { passive: true });
      updateCarousel();

      cleanupCarousel = () => {
        window.removeEventListener('resize', onCarouselResize);
        carouselContainer.removeEventListener('pointerdown', onCarouselPointerDown);
        carouselContainer.removeEventListener('pointermove', onCarouselPointerMove);
        carouselContainer.removeEventListener('pointerup', onCarouselPointerUp);
        carouselContainer.removeEventListener('pointercancel', onCarouselPointerUp);
        if (animFrameId) cancelAnimationFrame(animFrameId);
      };
    }

    // 10. Research Question Form Integration with ClaimScape
    const rqForm = container.querySelector('#research-question-form') as HTMLFormElement | null;
    const rqInput = container.querySelector('#research-question') as HTMLTextAreaElement | null;
    const rqQueryInput = container.querySelector('#rq-query') as HTMLInputElement | null;
    const rqQueryMode = container.querySelector('#rq-query-mode') as HTMLElement | null;
    const rqQueryReset = container.querySelector('#rq-query-reset') as HTMLElement | null;
    const rqIncludeCommentary = container.querySelector('#rq-include-commentary') as HTMLInputElement | null;
    const rqStatus = container.querySelector('#rq-status') as HTMLElement | null;

    let customQuery = false;
    const buildPubMedQuery = (claimText: string) => {
      let q = claimText.trim();
      if (!q) return '';
      const directional = [
        /\\breduces\\b/gi, /\\breduce\\b/gi, /\\bdecreases\\b/gi, /\\bdecrease\\b/gi,
        /\\bincreases\\b/gi, /\\bincrease\\b/gi, /\\bimproves\\b/gi, /\\bimprove\\b/gi,
        /\\bworsens\\b/gi, /\\bworsen\\b/gi, /\\bprevents\\b/gi, /\\bprevent\\b/gi,
        /\\bcauses\\b/gi, /\\bcause\\b/gi, /\\bleads to\\b/gi, /\\bprotects against\\b/gi,
        /\\bprotective nature against\\b/gi, /\\bprotective against\\b/gi,
        /\\blowers\\b/gi, /\\blower\\b/gi, /\\belevates\\b/gi, /\\belevate\\b/gi,
        /\\bextends\\b/gi, /\\bextend\\b/gi
      ];
      for (const d of directional) {
        q = q.replace(d, ' ');
      }
      q = q.replace(/[^\\w\\s-]/g, ' ');
      const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'in', 'on', 'at',
        'by', 'to', 'of', 'is', 'are', 'was', 'were', 'risk', 'nature'
      ]);
      const terms = q.split(/\\s+/).filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));
      return terms.join(' ');
    };

    function syncQuery() {
      if (!rqInput || !rqQueryInput) return;
      if (!customQuery) rqQueryInput.value = buildPubMedQuery(rqInput.value);
      if (rqQueryMode) {
        rqQueryMode.textContent = customQuery ? 'Custom query' : 'Auto-built · edit to refine';
      }
    }

    rqQueryInput?.addEventListener('input', () => {
      customQuery = true;
      syncQuery();
    });

    rqQueryReset?.addEventListener('click', () => {
      customQuery = false;
      syncQuery();
    });

    // Suggested questions and topics
    container.querySelectorAll('[data-research-question]').forEach((button) => {
      button.addEventListener('click', () => {
        const qVal = (button as HTMLElement).dataset.researchQuestion || '';
        if (rqInput) {
          rqInput.value = qVal;
          customQuery = false;
          syncQuery();
          rqInput.setCustomValidity('');
          rqInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          rqInput.focus({ preventScroll: true });
        }
      });
    });

    rqInput?.addEventListener('input', () => {
      rqInput.setCustomValidity('');
      syncQuery();
    });

    rqInput?.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        rqForm?.requestSubmit();
      }
    });

    rqForm?.addEventListener('submit', (event: Event) => {
      event.preventDefault();
      if (!rqInput) return;
      const query = rqInput.value.trim();
      if (!query) {
        rqInput.setCustomValidity('Please enter a research question.');
        rqInput.reportValidity();
        return;
      }
      let term = (rqQueryInput?.value.trim()) || buildPubMedQuery(query) || query;
      if (rqIncludeCommentary && !rqIncludeCommentary.checked) {
        term = '(' + term + ') NOT ((Review[Publication Type] NOT ("Systematic Review"[Publication Type] OR "Meta-Analysis"[Publication Type])) OR Comment[Publication Type] OR Editorial[Publication Type])';
      }
      const paperCountInput = rqForm.querySelector('input[name="paper-count"]:checked') as HTMLInputElement | null;
      const paperCount = paperCountInput ? paperCountInput.value : '200';

      if (rqStatus) rqStatus.textContent = 'Opening your question in ClaimScape…';
      rqForm.setAttribute('aria-busy', 'true');
      const submitBtn = rqForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitBtn) submitBtn.disabled = true;

      // Navigate directly in React router to ClaimScape with query parameters
      const params = new URLSearchParams({ claim: query, q: term, n: paperCount });
      navigate("/claimscape?" + params.toString());
    });

    // Typewriter placeholder animation
    const suggestions = Array.from(
      container.querySelectorAll('[data-research-question]'),
      (b) => (b as HTMLElement).dataset.researchQuestion || ''
    ).filter(Boolean);

    let typeTimer: any;
    let sIdx = 0;
    let charCount = 0;
    let isDeleting = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function tick() {
      if (!rqInput || document.activeElement === rqInput || rqInput.value || reducedMotion.matches || document.hidden) return;
      if (suggestions.length === 0) return;
      const curSuggestion = suggestions[sIdx];
      charCount += isDeleting ? -1 : 1;
      rqInput.placeholder = curSuggestion.slice(0, charCount) || 'What does the evidence say about…';
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
      typeTimer = setTimeout(tick, delay);
    }

    function stopType() { clearTimeout(typeTimer); }
    function restartType() {
      stopType();
      if (rqInput && !rqInput.value && !reducedMotion.matches) {
        typeTimer = setTimeout(tick, 900);
      }
    }

    rqInput?.addEventListener('focus', stopType);
    rqInput?.addEventListener('blur', restartType);
    const onVisibility = () => (document.hidden ? stopType() : restartType());
    document.addEventListener('visibilitychange', onVisibility);
    restartType();

    return () => {
      hamburger?.removeEventListener('click', handleHamburger);
      fadeEls.forEach((el) => fadeObserver.unobserve(el));
      if (metricContainer && barObs) barObs.unobserve(metricContainer);
      waitlistForm?.removeEventListener('submit', handleWaitlist);
      container.removeEventListener('click', handleAnchor);
      window.removeEventListener('mousemove', handleMouseMove);
      if (cleanupBoard) cleanupBoard();
      if (cleanupCarousel) cleanupCarousel();
      document.removeEventListener('visibilitychange', onVisibility);
      stopType();
    };
  }, [navigate]);

  return (
    <div
      ref={containerRef}
      className="stellar-labs-landing-root font-sans antialiased text-[#3a0f34] bg-[#fbf9f4] min-h-screen"
      dangerouslySetInnerHTML={{ __html: RAW_HTML_PLACEHOLDER }}
    />
  );
};
"""

full_code = tsx_template.replace("RAW_HTML_PLACEHOLDER", json_html)

with open(r'radextract_platform/frontend/src/pages/LandingPage.tsx', 'w', encoding='utf-8') as out:
    out.write(full_code)

print("LandingPage.tsx successfully written!")
