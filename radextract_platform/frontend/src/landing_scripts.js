// === SCRIPT 0 ===

    /* ---- Mobile hamburger ---- */
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobile-menu');
    hamburger?.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });

    /* ---- Scroll-triggered fade-up ---- */
    const fadeEls = document.querySelectorAll('.fade-up:not(.visible)');
    const fadeObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          fadeObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    fadeEls.forEach(el => fadeObserver.observe(el));

    /* ---- Metric bars animation ---- */
    const metricVals = [92, 94, 91, 88, 90];
    const metricBars = [document.getElementById('m1'), document.getElementById('m2'), document.getElementById('m3'), document.getElementById('m4'), document.getElementById('m5')];
    const metricContainer = document.getElementById('metric-list');
    if (metricContainer) {
      const barObs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          metricBars.forEach((bar, i) => {
            if (bar) {
              setTimeout(() => { bar.style.width = metricVals[i] + '%'; }, i * 120);
            }
          });
          barObs.unobserve(metricContainer);
        }
      }, { threshold: 0.3 });
      barObs.observe(metricContainer);
    }

    /* ---- FAQ accordion ---- */
    document.querySelectorAll('.faq-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach(i => {
          i.classList.remove('open');
          i.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    /* ---- Waitlist form ---- */
    const form = document.getElementById('waitlist-form');
    const wBtn = document.getElementById('waitlist-btn');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('waitlist-email').value;
      if (email) {
        wBtn.textContent = '✓ You\'re on the list!';
        wBtn.style.background = 'var(--sage)';
        wBtn.disabled = true;
        form.querySelector('.email-input').disabled = true;
      }
    });

    /* ---- Smooth anchor scroll ---- */
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && href.length > 1) {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
          }
        }
      });
    });

    /* ---- Hero mockup parallax tilt ---- */
    const heroMockup = document.getElementById('hero-mockup');
    document.addEventListener('mousemove', (e) => {
      if (!heroMockup) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 12;
      const y = (e.clientY / window.innerHeight - 0.5) * 8;
      heroMockup.style.transform = `rotateY(${-6 + x * 0.4}deg) rotateX(${3 - y * 0.4}deg)`;
    }, { passive: true });

    /* ---- Btn arrow hover ---- */
    document.querySelectorAll('[class*="btn-solid"]').forEach(btn => {
      const arrow = btn.querySelector('.arrow');
      if (arrow) {
        btn.addEventListener('mouseenter', () => arrow.style.transform = 'translateX(4px)');
        btn.addEventListener('mouseleave', () => arrow.style.transform = 'translateX(0)');
      }
    });

    /* ============================================================
       RESEARCH BOARD — Draggable sticky notes
       ============================================================ */
    (function initBoard() {
      const board = document.getElementById('research-board');
      if (!board) return;

      const notes = board.querySelectorAll('.rn-note');
      let zCounter = 100;
      let activeNote = null;
      let dragOffset  = { x: 0, y: 0 };

      /* ---------- Position notes from data-x / data-y (%) + data-rot ---------- */
      function placeNote(note) {
        const bW = board.clientWidth;
        const bH = board.clientHeight;
        const nW = note.offsetWidth  || 240;
        const nH = note.offsetHeight || 260;

        const pctX = parseFloat(note.dataset.x) || 5;
        const pctY = parseFloat(note.dataset.y) || 10;
        const rot  = parseFloat(note.dataset.rot) || 0;

        // Convert percentage to px, clamp inside board
        let left = Math.max(16, Math.min(bW - nW - 16, (pctX / 100) * bW));
        let top  = Math.max(60, Math.min(bH - nH - 16, (pctY / 100) * bH));

        note.style.left = left + 'px';
        note.style.top  = top  + 'px';
        note.style.transform = `rotate(${rot}deg)`;
        note.style.setProperty('--rot', rot + 'deg');
        note.style.zIndex = zCounter++;
      }

      // Lay out all notes once fonts are loaded
      if (document.fonts) {
        document.fonts.ready.then(() => notes.forEach(placeNote));
      } else {
        setTimeout(() => notes.forEach(placeNote), 100);
      }

      // Re-layout on resize
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => notes.forEach(placeNote), 200);
      }, { passive: true });

      /* ---------- Pointer start ---------- */
      function onPointerDown(e) {
        // Don't drag if clicking a link
        if (e.target.closest('.rn-link')) return;

        const note = e.currentTarget;
        e.preventDefault();

        activeNote = note;
        note.classList.add('lifting');
        note.classList.remove('landing');
        note.style.zIndex = ++zCounter;

        // Capture for smooth drag, including outside window
        note.setPointerCapture(e.pointerId);

        const rect = note.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;

        // Store board rect for move handler
        note._boardRect = boardRect;
      }

      /* ---------- Pointer move ---------- */
      function onPointerMove(e) {
        if (!activeNote) return;
        e.preventDefault();

        const bRect = activeNote._boardRect || board.getBoundingClientRect();
        const nW = activeNote.offsetWidth;
        const nH = activeNote.offsetHeight;
        const bW = bRect.width;
        const bH = bRect.height;

        let newLeft = e.clientX - bRect.left - dragOffset.x;
        let newTop  = e.clientY - bRect.top  - dragOffset.y;

        // Clamp to board bounds
        newLeft = Math.max(0, Math.min(bW - nW, newLeft));
        newTop  = Math.max(0, Math.min(bH - nH, newTop));

        activeNote.style.left = newLeft + 'px';
        activeNote.style.top  = newTop  + 'px';

        // Slight rotation based on horizontal velocity for feel
        const rot  = parseFloat(activeNote.dataset.rot) || 0;
        const velX = (e.movementX || 0) * 0.08;
        activeNote.style.transform = `rotate(${rot + velX}deg) scale(1.04)`;
      }

      /* ---------- Pointer end ---------- */
      function onPointerUp(e) {
        if (!activeNote) return;

        const note   = activeNote;
        const rot    = parseFloat(note.dataset.rot) || 0;

        // Save new position to data attributes as percentages
        const bW = board.clientWidth;
        const bH = board.clientHeight;
        const curLeft = parseFloat(note.style.left) || 0;
        const curTop  = parseFloat(note.style.top)  || 0;
        note.dataset.x = ((curLeft / bW) * 100).toFixed(1);
        note.dataset.y = ((curTop  / bH) * 100).toFixed(1);

        // Settle transform back
        note.style.setProperty('--note-transform', `translate(0,0)`);
        note.style.transform = `rotate(${rot}deg)`;

        note.classList.remove('lifting');
        note.classList.add('landing');
        setTimeout(() => note.classList.remove('landing'), 520);

        activeNote = null;
      }

      /* ---------- Attach events to each note ---------- */
      notes.forEach(note => {
        note.addEventListener('pointerdown', onPointerDown);
        note.addEventListener('pointermove', onPointerMove);
        note.addEventListener('pointerup',   onPointerUp);
        note.addEventListener('pointercancel', onPointerUp);

        // Keyboard accessibility — arrow keys
        note.addEventListener('keydown', (e) => {
          const step = e.shiftKey ? 20 : 5;
          let left = parseFloat(note.style.left) || 0;
          let top  = parseFloat(note.style.top)  || 0;
          const bW = board.clientWidth;
          const bH = board.clientHeight;
          const nW = note.offsetWidth;
          const nH = note.offsetHeight;

          if (e.key === 'ArrowLeft')  { left -= step; e.preventDefault(); }
          if (e.key === 'ArrowRight') { left += step; e.preventDefault(); }
          if (e.key === 'ArrowUp')    { top  -= step; e.preventDefault(); }
          if (e.key === 'ArrowDown')  { top  += step; e.preventDefault(); }

          left = Math.max(0, Math.min(bW - nW, left));
          top  = Math.max(0, Math.min(bH - nH, top));

          note.style.left = left + 'px';
          note.style.top  = top  + 'px';
          note.style.zIndex = ++zCounter;
        });
      });

    })();

    /* ============================================================
       USE CASES — 3D Carousel Slider
       ============================================================ */
    (function initUseCasesCarousel() {
      const container = document.getElementById('use-cases-carousel-container');
      const inner = document.getElementById('use-cases-carousel-inner');
      if (!container || !inner) return;

      const wrappers = inner.querySelectorAll('.carousel-card-wrapper');
      const total = wrappers.length;
      if (total === 0) return;

      let rotationProgress = 0;
      let targetProgress = 0;
      let isDragging = false;
      let startX = 0;
      let currentProgressOffset = 0;
      let animFrameId = null;

      // Configs responsive variables
      let xStep = 300;
      let zStep = 180;
      let dragScale = 600;
      let angleStep = 32;

      function updateResponsiveParams() {
        const width = window.innerWidth;
        if (width < 768) {
          xStep = 160;
          zStep = 110;
          dragScale = 400;
          angleStep = 28;
        } else if (width < 1024) {
          xStep = 240;
          zStep = 150;
          dragScale = 500;
          angleStep = 30;
        } else {
          xStep = 300;
          zStep = 180;
          dragScale = 600;
          angleStep = 32;
        }
      }

      function updateCarousel() {
        // Wrap rotationProgress between 0 and total
        let wrappedProgress = rotationProgress;
        while (wrappedProgress < 0) wrappedProgress += total;
        while (wrappedProgress >= total) wrappedProgress -= total;

        wrappers.forEach((wrapper, index) => {
          let diff = index - wrappedProgress;

          // Circular wrapping to range [-total/2, total/2]
          const halfT = total / 2;
          while (diff > halfT) diff -= total;
          while (diff < -halfT) diff += total;

          const angle = -diff * angleStep;
          const tx = diff * xStep;
          const tz = -Math.abs(diff) * zStep;
          const opacity = Math.max(0, 1 - Math.abs(diff) * 0.38);
          const zIndex = Math.round(100 - Math.abs(diff) * 20);

          wrapper.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${angle}deg)`;
          wrapper.style.opacity = opacity;
          wrapper.style.zIndex = zIndex;

          if (opacity <= 0.05) {
            wrapper.style.display = 'none';
            wrapper.style.pointerEvents = 'none';
          } else {
            wrapper.style.display = 'block';
            // Only active card (diff close to 0) gets pointer events
            wrapper.style.pointerEvents = Math.abs(diff) < 0.4 ? 'auto' : 'none';
          }
        });
      }

      function animate() {
        if (!isDragging) {
          const diff = targetProgress - rotationProgress;
          rotationProgress += diff * 0.15;
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

      // Pointer Event Handlers
      function onPointerDown(e) {
        isDragging = true;
        startX = e.clientX;
        currentProgressOffset = 0;
        container.setPointerCapture(e.pointerId);
      }

      function onPointerMove(e) {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        currentProgressOffset = -deltaX / dragScale;
        rotationProgress = targetProgress + currentProgressOffset;
        startAnimIfNeeded();
      }

      function onPointerUp(e) {
        if (!isDragging) return;
        isDragging = false;
        container.releasePointerCapture(e.pointerId);

        // Update target progress to current progress, then round
        targetProgress = Math.round(rotationProgress);
        
        // Wrap target index inside bounds [0, total - 1]
        while (targetProgress < 0) targetProgress += total;
        while (targetProgress >= total) targetProgress -= total;
        
        // Match rotationProgress to wrapped scale if needed
        let wrapped = rotationProgress;
        while (wrapped < 0) wrapped += total;
        while (wrapped >= total) wrapped -= total;
        rotationProgress = wrapped;

        startAnimIfNeeded();
      }

      container.addEventListener('pointerdown', onPointerDown);
      container.addEventListener('pointermove', onPointerMove);
      container.addEventListener('pointerup', onPointerUp);
      container.addEventListener('pointercancel', onPointerUp);

      // Support swipe keys (Left / Right)
      window.addEventListener('keydown', (e) => {
        // Only trigger if carousel is partially visible
        const rect = container.getBoundingClientRect();
        const isVisible = (rect.top < window.innerHeight && rect.bottom > 0);
        if (!isVisible) return;

        if (e.key === 'ArrowLeft') {
          targetProgress = Math.round(targetProgress - 1);
          startAnimIfNeeded();
        } else if (e.key === 'ArrowRight') {
          targetProgress = Math.round(targetProgress + 1);
          startAnimIfNeeded();
        }
      });

      // Init
      updateResponsiveParams();
      window.addEventListener('resize', () => {
        updateResponsiveParams();
        updateCarousel();
      }, { passive: true });

      // First layout
      updateCarousel();
    })();
  

// === SCRIPT 1 ===

/* Question entry is independent of the existing page's animation handlers. */
(() => {
  const form = document.getElementById('research-question-form');
  if (!form) return;
  const input = document.getElementById('research-question');
  const source = document.getElementById('rq-source');
  const status = document.getElementById('rq-status');

  const queryInput = document.getElementById('rq-query');
  const queryMode = document.getElementById('rq-query-mode');
  const includeCommentary = document.getElementById('rq-include-commentary');
  let customQuery = false;
  const buildPubMedQuery = (claimText) => {
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
    const stopWords = new Set(["the", "a", "an", "and", "or", "for", "with", "from", "in", "on", "at", "by", "to", "of", "is", "are", "was", "were", "risk", "nature"]);
    const terms = q.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
    return terms.join(" ");
  };
  function syncQuery() {
    if (!customQuery) queryInput.value = buildPubMedQuery(input.value);
    queryMode.textContent = customQuery ? 'Custom query' : 'Auto-built · edit to refine';
  }
  queryInput.addEventListener('input', () => { customQuery = true; syncQuery(); });
  document.getElementById('rq-query-reset').addEventListener('click', () => { customQuery = false; syncQuery(); });

  document.querySelectorAll('[data-research-question]').forEach(button => {
    button.addEventListener('click', () => {
      input.value = button.dataset.researchQuestion;
      customQuery = false;
      syncQuery();
      input.setCustomValidity('');
      input.focus();
    });
  });
  input.addEventListener('input', () => { input.setCustomValidity(''); syncQuery(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      input.setCustomValidity('Please enter a research question.');
      input.reportValidity();
      return;
    }
    let term = queryInput.value.trim() || buildPubMedQuery(query) || query;
    if (!includeCommentary.checked) term = '(' + term + ') NOT ((Review[Publication Type] NOT ("Systematic Review"[Publication Type] OR "Meta-Analysis"[Publication Type])) OR Comment[Publication Type] OR Editorial[Publication Type])';
    const paperCount = form.querySelector('input[name="paper-count"]:checked').value;
    // ClaimScape consumes these route parameters and starts its own search on mount.
    const params = new URLSearchParams({ claim: query, q: term, n: paperCount });
    const destination = 'https://vidhidhaduk05.github.io/ExtractExperimenting-web/#/claimscape?' + params.toString();
    status.textContent = 'Opening your question in ClaimScape…';
    form.setAttribute('aria-busy', 'true');
    form.querySelector('button[type="submit"]').disabled = true;
    window.location.assign(destination);
  });
  // Animate suggestions in the placeholder; never overwrite a visitor's input.
  const suggestions = Array.from(document.querySelectorAll('[data-research-question]'), b => b.dataset.researchQuestion);
  let timer, index = 0, count = 0, deleting = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  function tick() {
    if (document.activeElement === input || input.value || reduced.matches || document.hidden) return;
    const suggestion = suggestions[index];
    count += deleting ? -1 : 1;
    input.placeholder = suggestion.slice(0, count) || 'What does the evidence say about…';
    let delay = deleting ? 22 : 45;
    if (count >= suggestion.length) { deleting = true; delay = 2400; }
    if (count <= 0) { deleting = false; index = (index + 1) % suggestions.length; delay = 600; }
    timer = setTimeout(tick, delay);
  }
  function stop() { clearTimeout(timer); }
  function restart() { stop(); if (!input.value && !reduced.matches) timer = setTimeout(tick, 900); }
  input.addEventListener('focus', stop);
  input.addEventListener('blur', restart);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : restart());
  reduced.addEventListener('change', () => { stop(); input.placeholder = 'What does the evidence say about…'; restart(); });
  restart();
})();



// === SCRIPT 2 ===

document.querySelectorAll('#reading-room [data-research-question]').forEach(button=>button.addEventListener('click',()=>{
 const input=document.getElementById('research-question');
 input.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
 input.focus({preventScroll:true});
}));


