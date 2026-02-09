/* ==========================================================
   landing-page-rmu.js
   - Scroll reveal (replays on scroll up/down)
   - Optional: adjust initial hash scroll for fixed header
   - Optional: smooth scroll for [data-scroll-to] anchors
   ========================================================== */

/* ===== CONFIG ===== */
const SOLAR = {
  revealSelector: '.reveal-rmu',
  inViewClass: 'in-view-rmu',
  headerSelector: '.header',
  anchorSelector: '[data-scroll-to]'
};

/* ===== Helpers ===== */
function getHeaderOffset() {
  const header = document.querySelector(SOLAR.headerSelector);
  return header ? header.offsetHeight : 0;
}

function smoothScrollTo(targetSelector) {
  if (!targetSelector || !targetSelector.startsWith('#')) return;
  const target = document.querySelector(targetSelector);
  if (!target) return;

  const y = target.getBoundingClientRect().top + window.pageYOffset - getHeaderOffset();
  window.scrollTo({ top: y, behavior: 'smooth' });
}

/* ===== Scroll Reveal that re-triggers on leave ===== */
(function initScrollReveal() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    document.querySelectorAll(SOLAR.revealSelector).forEach(el => el.classList.add(SOLAR.inViewClass));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const el = entry.target;
      if (entry.isIntersecting) {
        el.classList.add(SOLAR.inViewClass);
      } else {
        // Remove when leaving viewport so it can animate again on return
        el.classList.remove(SOLAR.inViewClass);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll(SOLAR.revealSelector).forEach(el => io.observe(el));
})();

/* ===== Smooth in-page scrolling for elements with [data-scroll-to] ===== */
(function initSmoothAnchors() {
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest(SOLAR.anchorSelector);
    if (!trigger) return;

    const href = trigger.getAttribute('href');
    const dataTarget = trigger.getAttribute('data-target');
    const targetSelector = dataTarget || href;

    if (targetSelector && targetSelector.startsWith('#')) {
      e.preventDefault();
      smoothScrollTo(targetSelector);
    }
  });

  // If the page loads with a hash, fix initial position for fixed header
  window.addEventListener('load', () => {
    if (window.location.hash) {
      // Wait a tick so layout is ready
      setTimeout(() => smoothScrollTo(window.location.hash), 0);
    }
  });
})();

/* ==========================================================
   Logos pager (dots) + continuous marquee coexist (robust)
   ========================================================== */
(function initLogosPager() {
  const wrap = document.querySelector('.logos-wrap-rmu');
  const track = document.getElementById('logos-track-rmu');
  const dotsWrap = document.getElementById('dots-rmu');
  if (!wrap || !track || !dotsWrap) return;

  const dots = Array.from(dotsWrap.querySelectorAll('.dot-rmu'));
  const RESUME_DELAY = 3500; // ms after click before continuous scroll resumes
  let resumeTimer = null;

  // set active dot helper
  function setActiveDot(idx) {
    dots.forEach((d, i) => d.classList.toggle('is-active-rmu', i === idx));
  }
  setActiveDot(0);

  // compute page width (use visible viewport of the logos)
  function pageWidth() { return wrap.clientWidth; }

  // Fully disable CSS animation and let us control transform
  function enterManualMode() {
    track.classList.add('manual-rmu');
    track.style.animationPlayState = 'paused';
  }

  // Resume CSS animation from the start smoothly
  function resumeContinuous() {
    // remove manual transform + class and restart animation cleanly
    track.style.transform = '';
    track.classList.remove('manual-rmu');

    // Restart the CSS animation reliably (toggle to 'none' then back)
    const prevAnim = getComputedStyle(track).animation;
    track.style.animation = 'none';
    // force reflow
    // eslint-disable-next-line no-unused-expressions
    track.offsetHeight;
    // restore whatever animation was in CSS
    track.style.animation = prevAnim;
    track.style.animationPlayState = 'running';
  }

  // Jump to page n by translating the track
  function goToPage(n) {
    const idx = Math.max(0, Math.min(n, dots.length - 1));
    setActiveDot(idx);

    enterManualMode();

    const offset = -idx * pageWidth();
    track.style.transform = `translateX(${offset}px)`;

    // schedule resume
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(resumeContinuous, RESUME_DELAY);
  }

  // Click handlers on dots
  dots.forEach(d => {
    d.addEventListener('click', () => {
      const n = parseInt(d.getAttribute('data-page') || '0', 10);
      goToPage(n);
    });
  });

  // Maintain the same page on resize while paused
  const ro = new ResizeObserver(() => {
    const active = dots.findIndex(el => el.classList.contains('is-active-rmu'));
    if (active > -1 && track.classList.contains('manual-rmu')) {
      track.style.transform = `translateX(${-active * pageWidth()}px)`;
    }
  });
  ro.observe(wrap); // observe container width changes

  // Also pause marquee on hover (optional, keeps prior UX)
  wrap.addEventListener('mouseenter', () => {
    if (!track.classList.contains('manual-rmu')) {
      track.style.animationPlayState = 'paused';
    }
  });
  wrap.addEventListener('mouseleave', () => {
    if (!track.classList.contains('manual-rmu')) {
      track.style.animationPlayState = 'running';
    }
  });
})();


/* ==========================================================
   Count-up animation for Impact stats
   ========================================================== */
(function initImpactCounters() {
  const items = document.querySelectorAll('.stat-value-rmu-impact');
  if (!items.length) return;

  function countTo(el) {
    const end = parseFloat(el.getAttribute('data-count-to')) || 0;
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    const duration = 1400; // ms (slow & smooth)
    const startTime = performance.now();

    function tick(now) {
      const p = Math.min(1, (now - startTime) / duration);
      // easeOutCubic for a nice finish
      const eased = 1 - Math.pow(1 - p, 3);
      let val = end * eased;

      // If the end has decimals, keep one decimal, else integer
      const hasDecimal = String(end).includes('.');
      el.textContent = prefix + (hasDecimal ? val.toFixed(1) : Math.round(val)) + suffix;

      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + (hasDecimal ? end.toFixed(1) : Math.round(end)) + suffix;
    }
    requestAnimationFrame(tick);
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const el = entry.target;
      if (entry.isIntersecting) {
        // start counting when visible
        countTo(el);
      } else {
        // reset so it can play again on re-enter
        el.textContent = (el.getAttribute('data-prefix') || '') + '0' + (el.getAttribute('data-suffix') || '');
      }
    });
  }, { threshold: 0.35 });

  items.forEach(el => {
    // initialize to 0 with prefix/suffix
    el.textContent = (el.getAttribute('data-prefix') || '') + '0' + (el.getAttribute('data-suffix') || '');
    io.observe(el);
  });
})();
/* ==========================================================
   Solutions: "View All Solutions" toggle
   ========================================================== */
(function initSolutionsToggle() {
  const grid = document.getElementById('solutions-grid-rmu-solution');
  const btn = document.getElementById('solutions-toggle-btn-rmu-solution');
  if (!grid || !btn) return;

  function setState(expanded) {
    grid.classList.toggle('is-collapsed-rmu-solution', !expanded);
    btn.setAttribute('aria-expanded', String(expanded));
    btn.textContent = expanded ? 'View Fewer' : 'View Ring Main Unit';

    // Nudge IntersectionObserver so reveal animations can trigger for newly shown cards
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('scroll'));
    });
  }

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    setState(!expanded);
  });

  // default collapsed on load
  setState(false);
})();
/* ==========================================================
   Solar App: lightweight tilt/parallax for media cards
   Targets elements with [data-tilt]
   ========================================================== */
(function initSolarAppTilt() {
  const els = document.querySelectorAll('[data-tilt]');
  if (!els.length) return;

  const MAX_TILT = 8;         // degrees
  const MAX_TRANS = 10;       // px translate for parallax feel
  const EASE = 'cubic-bezier(.2,.65,.2,1)';

  function applyTilt(el, e) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    const rotX = (+dy * MAX_TILT).toFixed(2);
    const rotY = (-dx * MAX_TILT).toFixed(2);
    const tx = (-dx * MAX_TRANS).toFixed(2);
    const ty = (-dy * MAX_TRANS).toFixed(2);

    el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) translate(${tx}px, ${ty}px)`;
    el.style.transition = 'transform .08s';
  }

  function resetTilt(el) {
    el.style.transform = 'perspective(800px) rotateX(0) rotateY(0) translate(0,0)';
    el.style.transition = `transform .5s ${EASE}`;
  }

  els.forEach(el => {
    el.addEventListener('pointermove', (e) => applyTilt(el, e));
    el.addEventListener('pointerleave', () => resetTilt(el));
    el.addEventListener('pointerdown', () => resetTilt(el)); // prevent sticky tilt on touch
  });
})();


/* ==========================================================
   Projects carousel: arrows scroll by one full "page"
   ========================================================== */
(function initProjectsCarousel() {
  const viewport = document.getElementById('projects-viewport-rmu-projects');
  const prevBtn = document.querySelector('.prev-rmu-projects');
  const nextBtn = document.querySelector('.next-rmu-projects');
  if (!viewport || !prevBtn || !nextBtn) return;

  function updateButtons() {
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const atStart = viewport.scrollLeft <= 0;
    const atEnd = viewport.scrollLeft >= maxScroll - 1;
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;
  }

  function scrollPage(dir) {
    const distance = viewport.clientWidth; // page = visible width
    viewport.scrollBy({ left: dir * distance, behavior: 'smooth' });
    // optimistic button state; will correct on 'scroll' event
    setTimeout(updateButtons, 350);
  }

  prevBtn.addEventListener('click', () => scrollPage(-1));
  nextBtn.addEventListener('click', () => scrollPage(1));

  // keep buttons in sync
  viewport.addEventListener('scroll', () => {
    // debounced update
    window.clearTimeout(viewport._btnTimer);
    viewport._btnTimer = setTimeout(updateButtons, 80);
  });
  window.addEventListener('resize', updateButtons);

  // init
  updateButtons();
})();
// 
/* ==========================================================
   Types tabs: click/keyboard + hash support
   ========================================================== */
(function initSolarTypes() {
  const tabs = Array.from(document.querySelectorAll('.tab-btn-rmu-types'));
  const panels = {
    'on-grid': document.getElementById('panel-on-grid-rmu-types'),
    'off-grid': document.getElementById('panel-off-grid-rmu-types'),
    'hybrid': document.getElementById('panel-hybrid-rmu-types')
  };
  if (!tabs.length) return;

  function activate(type) {
    // tabs
    tabs.forEach(btn => {
      const isActive = btn.dataset.type === type;
      btn.classList.toggle('is-active-rmu-types', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      // tabindex for roving focus
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    // panels
    Object.entries(panels).forEach(([key, el]) => {
      const show = key === type;
      if (!el) return;
      el.classList.toggle('is-active-rmu-types', show);
      el.hidden = !show;
      if (show) {
        // restart small fade-in animation
        el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
      }
    });
  }

  // Click
  tabs.forEach(btn => btn.addEventListener('click', () => activate(btn.dataset.type)));

  // Keyboard: left/right arrows
  document.querySelector('.tabs-rmu-types')?.addEventListener('keydown', (e) => {
    const idx = tabs.findIndex(b => b.classList.contains('is-active-rmu-types'));
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (idx + dir + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    }
  });

  // Hash support e.g. #hybrid
  function fromHash() {
    const h = (location.hash || '').replace('#', '').toLowerCase();
    if (['on-grid', 'off-grid', 'hybrid'].includes(h)) activate(h);
  }
  window.addEventListener('hashchange', fromHash);

  // init
  activate('on-grid');
  fromHash();
})();
/* ==========================================================
   Scoped tabs for all .section-types-rmu-types
   (no global getElementById; supports multiple instances)
   ========================================================== */
(function initAllSolarTypeTabs() {
  document.querySelectorAll('.section-types-rmu-types').forEach(section => {
    const tabsWrap = section.querySelector('.tabs-rmu-types');
    if (!tabsWrap) return;

    const tabs = Array.from(section.querySelectorAll('.tab-btn-rmu-types'));
    const panels = Array.from(section.querySelectorAll('.panel-rmu-types'));
    if (!tabs.length || !panels.length) return;

    function activate(btn) {
      // Tabs state
      tabs.forEach(t => {
        const isActive = t === btn;
        t.classList.toggle('is-active-rmu-types', isActive);
        t.setAttribute('aria-selected', String(isActive));
        t.setAttribute('tabindex', isActive ? '0' : '-1');
      });

      // Panels state (scoped within this section)
      const targetId = btn.getAttribute('aria-controls');
      panels.forEach(p => {
        const show = p.id === targetId;
        p.hidden = !show;
        p.classList.toggle('is-active-rmu-types', show);
        if (show) { p.style.animation = 'none'; p.offsetHeight; p.style.animation = ''; }
      });
    }

    // Click to activate
    tabs.forEach(btn => btn.addEventListener('click', () => activate(btn)));

    // Keyboard: Left/Right arrows within this tablist
    tabsWrap.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const current = tabs.findIndex(t => t.classList.contains('is-active-rmu-types'));
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (current + dir + tabs.length) % tabs.length;
      tabs[next].focus();
      activate(tabs[next]);
    });

    // Init: use the one marked active or the first
    activate(tabs.find(t => t.classList.contains('is-active-rmu-types')) || tabs[0]);
  });
})();

/* IntersectionObserver reveal - shows elements when they enter the viewport,
   hides them again when they leave (works on scroll down and up). */
(function () {
  const els = document.querySelectorAll('.reveal-up');
  if (!('IntersectionObserver' in window) || !els.length) {
    els.forEach(el => el.classList.add('is-visible-mobility'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible-mobility');
      } else {
        entry.target.classList.remove('is-visible-mobility');
      }
    });
  }, { threshold: 0.18 });

  els.forEach(el => io.observe(el));
})();


document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.rmu--tab');
  const contents = document.querySelectorAll('.rmu--content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Add active class to the clicked tab
      tab.classList.add('active');

      // Find the corresponding content using the data-tab attribute
      const tabId = tab.getAttribute('data-tab');
      const content = document.getElementById(`${tabId}-content`);

      // Add active class to the content
      if (content) {
        content.classList.add('active');
      }
    });
  });

  // Set the default active tab and content on page load
  const defaultTab = document.querySelector('.rmu--tab[data-tab="mission"]');
  const defaultContent = document.getElementById('mission-content');

  if (defaultTab && defaultContent) {
    defaultTab.classList.add('active');
    defaultContent.classList.add('active');
  }
});

(function () {
  const grid = document.getElementById('grid-rmu-card-with-animation');
  if (!grid) return;
  const cards = grid.querySelectorAll('.card-rmu-card-with-animation');

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('show-rmu-card-with-animation');
      } else {
        // remove so it replays when scrolling back (LIFO feel)
        e.target.classList.remove('show-rmu-card-with-animation');
      }
    });
  }, { threshold: 0.18 });

  cards.forEach(c => io.observe(c));
})();


(() => {
  const SELECTOR = '.reveal-left, .reveal-right, .reveal-up, .reveal-down';

  // Apply per-element delay from data attribute if provided
  document.querySelectorAll(SELECTOR).forEach(el => {
    const d = el.getAttribute('data-reveal-delay');
    if (d) el.style.setProperty('--reveal-delay', /^\d+$/.test(d) ? `${d}ms` : d);
  });

  // Auto-stagger children inside a .reveal-group
  document.querySelectorAll('.reveal-group[data-reveal-stagger]').forEach(group => {
    const step = parseInt(group.dataset.revealStagger, 10) || 120; // ms
    let i = 0;
    group.querySelectorAll(SELECTOR).forEach(el => {
      el.style.setProperty('--reveal-delay', `${i * step}ms`);
      i++;
    });
  });

  // Observe and toggle visibility (replays when scrolling back unless .reveal-once)
  const io = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) target.classList.add('is-visible');
      else if (!target.classList.contains('reveal-once'))
        target.classList.remove('is-visible');
    });
  }, { threshold: 0.18 });

  document.querySelectorAll(SELECTOR).forEach(el => io.observe(el));
})();

/* Intersection Observer for gentle reveals */
(function () {
  const items = document.querySelectorAll('.reveal-rmu-panel-');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-in-rmu-panel-');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.2 });

  items.forEach(el => io.observe(el));

  /* Simple form handler (prevent empty submit in demo) */
  const form = document.getElementById('service-form-rmu-panel-');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    // You can hook this to your backend
    alert(`Thanks ${fd.get('name') || ''}! We’ll contact you soon.`);
    form.reset();
  });
})();

/* IntersectionObserver reveal - shows elements when they enter the viewport,
   hides them again when they leave (works on scroll down and up). */
(function () {
  const els = document.querySelectorAll('.reveal-up');
  if (!('IntersectionObserver' in window) || !els.length) {
    els.forEach(el => el.classList.add('is-visible-mobility'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible-mobility');
      } else {
        entry.target.classList.remove('is-visible-mobility');
      }
    });
  }, { threshold: 0.18 });

  els.forEach(el => io.observe(el));
})();


document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.rmu--tab');
  const contents = document.querySelectorAll('.rmu--content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Add active class to the clicked tab
      tab.classList.add('active');

      // Find the corresponding content using the data-tab attribute
      const tabId = tab.getAttribute('data-tab');
      const content = document.getElementById(`${tabId}-content`);

      // Add active class to the content
      if (content) {
        content.classList.add('active');
      }
    });
  });

  // Set the default active tab and content on page load
  const defaultTab = document.querySelector('.rmu--tab[data-tab="mission"]');
  const defaultContent = document.getElementById('mission-content');

  if (defaultTab && defaultContent) {
    defaultTab.classList.add('active');
    defaultContent.classList.add('active');
  }
});

(function () {
  const grid = document.getElementById('grid-rmu-card-with-animation');
  if (!grid) return;
  const cards = grid.querySelectorAll('.card-rmu-card-with-animation');

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('show-rmu-card-with-animation');
      } else {
        // remove so it replays when scrolling back (LIFO feel)
        e.target.classList.remove('show-rmu-card-with-animation');
      }
    });
  }, { threshold: 0.18 });

  cards.forEach(c => io.observe(c));
})();


(() => {
  const SELECTOR = '.reveal-left, .reveal-right, .reveal-up, .reveal-down';

  // Apply per-element delay from data attribute if provided
  document.querySelectorAll(SELECTOR).forEach(el => {
    const d = el.getAttribute('data-reveal-delay');
    if (d) el.style.setProperty('--reveal-delay', /^\d+$/.test(d) ? `${d}ms` : d);
  });

  // Auto-stagger children inside a .reveal-group
  document.querySelectorAll('.reveal-group[data-reveal-stagger]').forEach(group => {
    const step = parseInt(group.dataset.revealStagger, 10) || 120; // ms
    let i = 0;
    group.querySelectorAll(SELECTOR).forEach(el => {
      el.style.setProperty('--reveal-delay', `${i * step}ms`);
      i++;
    });
  });

  // Observe and toggle visibility (replays when scrolling back unless .reveal-once)
  const io = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) target.classList.add('is-visible');
      else if (!target.classList.contains('reveal-once'))
        target.classList.remove('is-visible');
    });
  }, { threshold: 0.18 });

  document.querySelectorAll(SELECTOR).forEach(el => io.observe(el));
})();

/* Simple reveal on scroll */
(() => {
  const els = document.querySelectorAll('.reveal-rmu-panel-');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-in-rmu-panel-');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.2 });

  els.forEach(el => io.observe(el));
})();

// Reveal on scroll for the About section
(() => {
  const items = document.querySelectorAll('.reveal-rmu-about-');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-in-rmu-about-');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });

  items.forEach(el => io.observe(el));
})();
(() => {
  const els = document.querySelectorAll(
    '.reveal-left-rmu-services, .reveal-right-rmu-services, .reveal-up-rmu-services'
  );
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-in-rmu-services');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });

  els.forEach(el => io.observe(el));
})();
(() => {
  const els = document.querySelectorAll(
    '.reveal-left-rmu-services, .reveal-right-rmu-services, .reveal-up-rmu-services'
  );
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-in-rmu-services');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });
  els.forEach(el => io.observe(el));
})();
(() => {
  const els = document.querySelectorAll(
    '.reveal-left-rmu-services, .reveal-right-rmu-services, .reveal-up-rmu-services'
  );
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-in-rmu-services');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });
  els.forEach(el => io.observe(el));
})();
// Simple reveal on scroll for the process section
(() => {
  const els = document.querySelectorAll(
    '.reveal-left-rmu-process, .reveal-right-rmu-process'
  );
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('reveal-in-rmu-process');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });

  els.forEach(el => io.observe(el));
})();
// Reveal-on-scroll for the Why Choose Us section (trigger on every scroll)

// Reveal-on-scroll for the Why Choose Us section – always trigger on scroll up and down
(() => {
  const targets = document.querySelectorAll(
    '.reveal-left-rmu-why-us, .reveal-right-rmu-why-us, .reveal-top-rmu-why-us, .reveal-bottom-rmu-why-us'
  );

  const revealOnScroll = () => {
    targets.forEach(target => {
      const rect = target.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.85 && rect.bottom > window.innerHeight * 0.15;

      if (inView) {
        target.classList.add('reveal-in-rmu-why-us');
      } else {
        target.classList.remove('reveal-in-rmu-why-us');
      }
    });
  };

  // Run on scroll and on page load
  window.addEventListener('scroll', revealOnScroll);
  window.addEventListener('resize', revealOnScroll);
  window.addEventListener('load', revealOnScroll);
})();


document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('servicesGrid');
  const detail = document.getElementById('svcDetail');
  const exploreBtn = document.getElementById('exploreServicesBtn'); // header button if present

  if (!grid || !detail) return;

  // --- DETAILS CONTENT MAP ---
  const detailsMap = {
    msb: {
  title: "ACB (Air Circuit Breaker) RMU",
  body: `
    <p>ACB-based Ring Main Units use Air Circuit Breakers for protection and control of medium-voltage feeders and transformers. They are suited to installations where robust switching performance and higher current capability are required.</p>

    <h4>What it is</h4>
    <ul class="svc-detail-list">
      <li><strong>Protection & control:</strong> Used to switch and protect MV feeders and transformer circuits.</li>
      <li><strong>Fault handling:</strong> Supports protection schemes for overcurrent, short circuit, and earth fault (with relay integration as required).</li>
      <li><strong>Duty:</strong> Preferred where higher current duty and demanding operating conditions exist.</li>
    </ul>

    <h4>Key benefits</h4>
    <ul class="svc-detail-list">
      <li>Reliable switching and protection performance</li>
      <li>Strong mechanical endurance for frequent operations</li>
      <li>Service-friendly design for maintenance and inspection</li>
      <li>Suitable for industrial and commercial MV distribution</li>
    </ul>

    <h4>Typical applications</h4>
    <ul class="svc-detail-list">
      <li>Industrial plants and processing facilities</li>
      <li>Commercial precinct substations</li>
      <li>Transformer protection and feeder sectionalising</li>
      <li>Sites with higher current MV distribution requirements</li>
    </ul>
  `,
  image: { src: "../static/images/projects/4.avif", alt: "ACB (Air Circuit Breaker) RMU" }
},

mdp: {
  title: "VCB (Vacuum Circuit Breaker) RMU",
  body: `
    <p>VCB-based RMUs extinguish arcs inside a sealed vacuum interrupter, providing fast fault interruption, high reliability, and minimal maintenance. They are widely used in compact MV distribution networks where uptime and safety are critical.</p>

    <h4>What it is</h4>
    <ul class="svc-detail-list">
      <li><strong>Vacuum interruption:</strong> Arc quenching occurs inside a vacuum bottle, reducing wear and maintenance.</li>
      <li><strong>High reliability:</strong> Suitable for frequent switching operations and long service life.</li>
      <li><strong>Compact solution:</strong> Ideal for space-limited installations such as urban kiosks and underground networks.</li>
    </ul>

    <h4>Key benefits</h4>
    <ul class="svc-detail-list">
      <li>Fast fault clearance and consistent switching performance</li>
      <li>Low maintenance compared to many traditional interrupter types</li>
      <li>Excellent operational life for frequent switching duty</li>
      <li>Strong suitability for critical uptime environments</li>
    </ul>

    <h4>Typical applications</h4>
    <ul class="svc-detail-list">
      <li>Urban distribution and embedded networks</li>
      <li>Underground distribution networks</li>
      <li>Commercial and infrastructure substations</li>
      <li>Industrial sites requiring high reliability switching</li>
    </ul>
  `,
  image: { src: "../static/images/projects/5.avif", alt: "VCB (Vacuum Circuit Breaker) RMU" }
},

mcc: {
  title: "SF6 Circuit Breaker RMU",
  body: `
    <p>SF6 RMUs use sulfur hexafluoride gas as the interrupting medium, delivering high dielectric strength, compact construction, and strong arc-quenching capability. They are commonly selected for MV networks where higher fault levels must be managed in confined spaces.</p>

    <h4>What it is</h4>
    <ul class="svc-detail-list">
      <li><strong>High insulation strength:</strong> SF6 provides excellent dielectric performance enabling compact designs.</li>
      <li><strong>Arc interruption:</strong> Proven technology for MV switching and protection duties.</li>
      <li><strong>Compact footprint:</strong> Well suited for kiosks and installations with limited space.</li>
    </ul>

    <h4>Key benefits</h4>
    <ul class="svc-detail-list">
      <li>Compact design suitable for space-constrained substations</li>
      <li>Excellent interruption and insulation performance</li>
      <li>Strong suitability for higher fault level environments</li>
      <li>Reliable operation for utility and industrial MV distribution</li>
    </ul>

    <h4>Typical applications</h4>
    <ul class="svc-detail-list">
      <li>Compact secondary substations and RMU kiosks</li>
      <li>Urban networks with limited footprint requirements</li>
      <li>Industrial distribution with higher fault levels</li>
      <li>Commercial precincts and infrastructure installations</li>
    </ul>
  `,
  image: { src: "../static/images/projects/3.avif", alt: "SF6 Circuit Breaker RMU" }
},
    plc: {
  title: "Load Break Switch (LBS) RMU",
  body: `
    <p>Load Break Switch (LBS) Ring Main Units are designed for switching and isolating medium-voltage feeders under normal load conditions. They are a cost-effective solution for distribution networks where full circuit-breaker duty is not required on every way.</p>

    <h4>What it does</h4>
    <ul class="svc-detail-list">
      <li><strong>Switching under load:</strong> Safely opens/closes circuits during normal operating conditions.</li>
      <li><strong>Isolation:</strong> Provides visible/secure isolation points for maintenance activities (as per RMU design).</li>
      <li><strong>Protection approach:</strong> Commonly paired with <strong>HRC fuses</strong> or upstream protection for fault clearing on transformer tee-offs.</li>
    </ul>

    <h4>Key benefits</h4>
    <ul class="svc-detail-list">
      <li>Economical and simple RMU configuration</li>
      <li>Compact footprint suitable for kiosk substations</li>
      <li>Reliable operation for rural and low-demand networks</li>
      <li>Ideal for ring feeders with transformer spurs</li>
    </ul>

    <h4>Typical applications</h4>
    <ul class="svc-detail-list">
      <li>Rural distribution networks</li>
      <li>Commercial sites with moderate MV loads</li>
      <li>Compact secondary substations and kiosks</li>
      <li>Transformer protection using switch-fuse combinations</li>
    </ul>
  `,
  image: { src: "../static/images/projects/10.avif", alt: "Load Break Switch (LBS) RMU" }
},

pcc: {
  title: "Combined Type RMU (ACB / VCB / SF6)",
  body: `
    <p>Combined Type RMUs integrate multiple switching and interruption technologies within one lineup. This allows different ways (ring feeders, transformer tee-offs, incomers) to be configured with the most suitable device for their duty and criticality.</p>

    <h4>What makes it “combined”</h4>
    <ul class="svc-detail-list">
      <li>Mix of <strong>circuit breakers</strong> (VCB/SF6/other) and <strong>load break switches</strong> within the same RMU lineup</li>
      <li>Different protection levels per feeder (ring feeder vs transformer way)</li>
      <li>Flexible arrangement for expansion and future feeders</li>
    </ul>

    <h4>Key benefits</h4>
    <ul class="svc-detail-list">
      <li>Optimized protection strategy per feeder duty</li>
      <li>Supports ring feeder continuity with sectionalising options</li>
      <li>Compact and modular for kiosk/secondary substations</li>
      <li>Scalable for future transformer or feeder additions</li>
    </ul>

    <h4>Typical applications</h4>
    <ul class="svc-detail-list">
      <li>Industrial sites with mixed feeder requirements</li>
      <li>Commercial precincts needing high uptime ring supply</li>
      <li>Secondary substations with multiple outgoing feeders</li>
      <li>Utilities and embedded networks</li>
    </ul>
  `,
  image: { src: "../static/images/projects/11.avif", alt: "Combined Type RMU" }
},

pdb: {
  title: "RMU Components & Accessories",
  body: `
    <p>RMU packages can be supplied with the key components and accessories required for safe MV switching, protection, indication, and cable termination. These options are selected based on network requirements, protection philosophy, and utility standards.</p>

    <h4>Typical components</h4>
    <ul class="svc-detail-list">
      <li><strong>Switching devices:</strong> Load break switches, vacuum/SF6 circuit breakers</li>
      <li><strong>Protection:</strong> Relays (where applicable), trip coils, interlocks, auxiliary contacts</li>
      <li><strong>Indication:</strong> Fault passage indicators (FPI), VPIS/voltage presence indicators</li>
      <li><strong>Metering interfaces:</strong> CTs/VTs as required, test blocks and wiring accessories</li>
      <li><strong>Transformer protection:</strong> Switch-fuse combinations, HRC fuse links</li>
      <li><strong>Busbar system:</strong> Solid insulated or gas/air insulated arrangements (model dependent)</li>
    </ul>

    <h4>Cable termination & interfaces</h4>
    <ul class="svc-detail-list">
      <li>Separable connectors (elbow / T-body), termination kits and glands</li>
      <li>MV cables and accessory kits supplied as a complete package (if required)</li>
      <li>Earthing switch provisions and earthing accessories</li>
    </ul>
  `,
  image: { src: "../static/images/projects/12.png", alt: "RMU Components and Accessories" }
},

metering: {
  title: "Export-Ready RMUs for the Pacific Region",
  body: `
    <p>We supply export-ready Ring Main Units suitable for MV distribution applications across the Pacific region. These RMUs support compact secondary substations, transformer protection, and multiple feeder arrangements for utility, industrial, and commercial customers.</p>

    <h4>Where RMUs are used</h4>
    <ul class="svc-detail-list">
      <li>Compact secondary substations and kiosk substations</li>
      <li>Ring feeder networks requiring sectionalising and continuity of supply</li>
      <li>Transformer protection and embedded networks</li>
      <li>Industrial facilities, airports, ports, water and utilities</li>
    </ul>

    <h4>Typical scope we can supply</h4>
    <ul class="svc-detail-list">
      <li>Fully assembled RMU lineup (2–6 way typical, project dependent)</li>
      <li>Switching options: LBS / VCB / SF6 (as per required duty)</li>
      <li>Accessories: terminations, interlocks, indication, and documentation pack</li>
      <li>Project packaging for shipping and installation readiness</li>
    </ul>

    <h4>Common voltage range</h4>
    <ul class="svc-detail-list">
      <li><strong>7.2 kV to 36 kV</strong> (project dependent)</li>
    </ul>
  `,
  image: { src: "../static/images/projects/13.avif", alt: "Export-ready RMU for the Pacific Region" }
}
  };

  // --- RENDER DETAILS (single function) ---
  function openDetails(key) {
    const data = detailsMap[key];
    if (!data) return;

    const imgHTML = data.image
      ? `<figure class="svc-detail-figure"><img class="svc-detail-img" src="${data.image.src}" alt="${data.image.alt || ''}"></figure>`
      : '';

    detail.innerHTML = `
      <div class="svc-detail-layout">
        ${imgHTML}
        <div class="svc-detail-copy">
          <h3>${data.title}</h3>
          ${data.body || ''}
        </div>
      </div>
    `;
    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeDetails() {
    detail.style.display = 'none';
    detail.innerHTML = '';
  }

  // --- CLICK HANDLER (delegated) ---
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.svc-cta-rmu-services');
    if (!btn) return;
    const key = btn.getAttribute('data-detail');
    const currentTitle = detail.querySelector('h3')?.textContent || '';
    if (detail.style.display === 'block' && currentTitle === (detailsMap[key]?.title || '')) {
      closeDetails();
    } else {
      openDetails(key);
    }
  });

  // --- EXPLORE / VIEW LESS toggle (uses .is-hidden on extra cards) ---
  if (exploreBtn) {
    const allCards = Array.from(grid.querySelectorAll('.svc-item-rmu-services'));
    const extraCards = allCards.slice(3); // cards 4..7
    let expanded = false;

    function setExpanded(state) {
      expanded = state;
      if (expanded) {
        extraCards.forEach(el => el.classList.remove('is-hidden'));
        exploreBtn.textContent = 'View Less';
        exploreBtn.setAttribute('aria-expanded', 'true');
        
      } else {
        extraCards.forEach(el => el.classList.add('is-hidden'));
        closeDetails();
        exploreBtn.textContent = 'Explore Solutions';
        exploreBtn.setAttribute('aria-expanded', 'false');
        
      }
      // retrigger reveal animations if you use them
      extraCards.forEach(el => {
        el.classList.remove('reveal-in-rmu-services');
        void el.offsetWidth;
      });
    }

    // init collapsed
    setExpanded(false);

    exploreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setExpanded(!expanded);
    });
  }

  // --- SCROLL REVEAL (bi-directional) ---
  const revealEls = document.querySelectorAll(
    '.reveal-left-rmu-services, .reveal-right-rmu-services, .reveal-up-rmu-services'
  );
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-in-rmu-services');
      } else {
        entry.target.classList.remove('reveal-in-rmu-services');
      }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
  revealEls.forEach(el => io.observe(el));
});
(() => {
  const modal = document.getElementById('csc-modal');
  const form  = document.getElementById('csc-form');
  const close = modal.querySelector('.modal-close-csc-rmu-csc-products');
  const successPane  = document.getElementById('csc-success');
  const docNameInput = document.getElementById('csc-doc-name');

  function openModal() {
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    successPane.hidden = true;
    form.hidden = false;
    form.reset();
    setTimeout(() => document.getElementById('csc-name')?.focus(), 50);
  }
  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  // Open from each "Request Download" button
  document.querySelectorAll('.request-download-csc-rmu-csc-products').forEach(btn => {
    btn.addEventListener('click', () => {
      docNameInput.value = btn.dataset.doc || '';
      openModal();
    });
  });

  // Close handlers
  close.addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop-csc-rmu-csc-products')
       .addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
})();

/* ===== Scroll reveal + count-up when visible ===== */
(() => {
  const els = document.querySelectorAll('.reveal-rmu-get-in-touch');

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('in-view'), delay);

      // If this block contains counters, animate them once
      el.querySelectorAll?.('.stat-num-rmu-get-in-touch').forEach(counter => {
        if (counter.dataset.done) return;
        counter.dataset.done = '1';
        const end = parseInt(counter.dataset.count || '0', 10);
        const hasPlus = end >= 20; // to match mock (25+, 500+, 20+)
        const suffix = hasPlus ? '+' : (end === 98 ? '%' : '');
        let start = 0, duration = 900, startTs;
        const step = (ts) => {
          if (!startTs) startTs = ts;
          const p = Math.min((ts - startTs) / duration, 1);
          const val = Math.floor(start + (end - start) * p);
          counter.textContent = val;
          counter.setAttribute('data-suffix', suffix);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      io.unobserve(el);
    });
  }, { threshold: 0.15 });

  els.forEach(el => io.observe(el));
})();

