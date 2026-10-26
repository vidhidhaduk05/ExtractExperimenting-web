/* One entrance per element; no wrappers and no changes to existing transforms. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const html = document.documentElement;
  const targets = [];
  const running = new Map();
  let observer;
  const seen = new Set();
  const rules = [
    ['.hero-headline, .hero-content > .rq-card, .hero-content > .rq-topics, .hero-content > .hero-sub, .hero-cta-group, .hero-proof, .hero-stats-grid', 'lift'],
    ['main section .section-eyebrow, .features-header-row h2, .features-header-row > p, .reading-room-heading > h2, .reading-room-heading > p', 'lift'],
    ['.bento-grid > .feature-card, .usecase-gallery-grid > .feature-card, .reading-room-row, .radiology-evidence, .step-card, .precision-row, .testimonial-card, .faq-item', 'lift'],
    ['.use-cases-h2, .use-cases-desc, #how-it-works .section-h2, #testimonials .section-h2, #collaboration .section-h2, #collaboration .section-inner > p, #collaboration .collab-grid > *, #faq .section-h2', 'lift'],
    ['#waitlist .cta-headline, #waitlist .cta-sub, #waitlist .email-form, #waitlist .section-inner > p, .footer-top > div, .footer-bottom', 'lift'],
    ['.rn-note, .board-legend, #use-cases-carousel-container', 'paper'],
  ];
  function show(node) {
    running.get(node)?.cancel();
    running.delete(node);
    node.dataset.rhythmState = 'shown';
    observer?.unobserve(node);
  }
  function showAll() {
    observer?.disconnect();
    targets.forEach(show);
  }
  try {
    html.classList.add('sl-rhythm');
    rules.forEach(([selector, kind]) => document.querySelectorAll(selector).forEach(node => {
      if (seen.has(node)) return;
      seen.add(node);
      // Interactive groups fade without moving their click targets under the pointer.
      node.dataset.rhythmKind = node.matches('form') || node.querySelector('a,button,input,textarea,select') ? 'paper' : kind;
      node.dataset.rhythmState = 'pending';
      targets.push(node);
    }));
    // Existing mobile note layouts and narrow-screen cards retain their own transforms.
    const style = getComputedStyle(html);
    const duration = parseFloat(style.getPropertyValue('--motion-reveal-duration')) || 660;
    const beat = parseFloat(style.getPropertyValue('--motion-reveal-stagger')) || 90;
    const distance = style.getPropertyValue('--motion-reveal-distance').trim() || '26px';
    const ease = style.getPropertyValue('--motion-reveal-ease').trim() || 'cubic-bezier(.22,1,.36,1)';
    observer = new IntersectionObserver(entries => {
      const batch = entries.filter(entry => entry.isIntersecting && entry.target.dataset.rhythmState === 'pending')
        .sort((a, b) => a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      const beats = new Map();
      batch.forEach(entry => {
        const node = entry.target;
        observer.unobserve(node);
        // Skip the entrance for content already passed during fast navigation.
        if (entry.boundingClientRect.bottom < 0 || reduced.matches) { show(node); return; }
        const group = node.closest('section, footer') || html;
        const index = beats.get(group) || 0;
        beats.set(group, index + 1);
        node.dataset.rhythmState = 'entering';
        const paper = node.dataset.rhythmKind === 'paper';
        const animation = node.animate([
          { opacity: 0, translate: paper ? '0 0' : `0 ${distance}` },
          { opacity: 1, translate: '0 0' },
        ], { duration: paper ? duration * .85 : duration, delay: Math.min(index, 3) * beat, easing: ease, fill: 'backwards' });
        running.set(node, animation);
        animation.finished.then(() => {
          if (running.get(node) === animation) {
            running.delete(node);
            node.dataset.rhythmState = 'shown';
          }
        }).catch(() => {});
      });
    }, { threshold: .04, rootMargin: '0px 0px -5% 0px' });
    targets.forEach(node => observer.observe(node));
    // Bring a newly focused control into view immediately; never animate focus away.
    document.addEventListener('focusin', event => {
      let node = event.target;
      while (node instanceof Element) {
        if (node.dataset.rhythmState && node.dataset.rhythmState !== 'shown') show(node);
        node = node.parentElement;
      }
    });
    reduced.addEventListener('change', event => { if (event.matches) showAll(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) showAll(); });
    window.addEventListener('pagehide', showAll);
  } catch (error) {
    showAll();
    html.classList.remove('sl-rhythm');
    console.warn('Section reveals unavailable; page content remains visible.', error);
  }
})();
