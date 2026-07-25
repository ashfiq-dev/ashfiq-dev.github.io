/* ==========================================================================
   PORTFOLIO SCRIPT — "The Pipeline"
   Vanilla JS, no framework, no build step. Safe to open directly or host
   on GitHub Pages.

   All content (profile, projects, skills, experience, log posts) is
   fetched live from Firestore via js/firebase-data.js on page load and
   rendered once it arrives. There is no hard-coded dummy/placeholder
   content anywhere — if a Firestore collection has no documents yet,
   the matching section renders a small "nothing here yet" empty state
   instead of fake data.

   All rendering logic, filtering, the modal, the pipeline SVG, the
   typewriter effect, the contact form, etc. work the same as before —
   they just now operate on data that arrived asynchronously instead of
   a hard-coded array, and handle the empty case explicitly.

   Sections:
   1.  Utilities
   2.  Data (now fetched from Firestore — see js/firebase-data.js)
   3.  State
   4.  Theme toggle
   5.  Mobile nav
   6.  Pipeline SVG particles + stage filtering
   7.  Typewriter effect
   8.  Projects rendering + filtering
   9.  Project modal (gallery, focus trap)
   10. Git-log (experience) rendering
   11. stdout log (blog) rendering
   12. Contact form validation
   13. Profile (name / bio / contact links) rendering
   14. Skills grid rendering (Firestore-driven)
   15. Footer year + init
   ========================================================================== */

import {
  getProjects,
  getSkills,
  getExperience,
  getBlogPosts,
  getProfile,
} from './firebase-data.js';

(async () => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 1. UTILITIES                                                        */
  /* ------------------------------------------------------------------ */

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Simple escaper for text we inject via innerHTML. */
  const escapeHTML = (str = '') =>
    str.replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));

  /** True for a real image URL (Cloudinary etc.); false for the
      fallback data's plain-text captions like "Dashboard showing…". */
  const isImageUrl = (str = '') => /^https?:\/\//.test(str);

  /* -- Project "full description" rendering ---------------------------
     The admin panel's rich-text editor saves this field as a small
     subset of HTML (bold/italic/color/font-size + line breaks).
     Projects created before that editor existed have it saved as plain
     text with real newline characters instead — those need converting
     so their line breaks still show up (plain textContent collapses
     them). Either way, everything is sanitized down to a known-safe
     tag/attribute allowlist right before it's ever put in the DOM. */

  const RICHTEXT_ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'H3', 'A']);
  const RICHTEXT_ALLOWED_STYLE_PROPS = new Set(['color', 'font-size', 'font-weight', 'font-style']);
  const RICHTEXT_SAFE_LINK_PROTOCOL = /^(https?:|mailto:)/i;

  function sanitizeRichText(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    const clean = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          // Sanitize descendants FIRST. Otherwise unwrapping a disallowed
          // tag (e.g. <a>) could smuggle out an unsanitized nested
          // element (e.g. <img onerror=...>) that this same pass would
          // never revisit.
          clean(child);

          if (!RICHTEXT_ALLOWED_TAGS.has(child.tagName)) {
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
            return;
          }

          Array.from(child.attributes).forEach((attr) => {
            if (child.tagName === 'A' && attr.name === 'href') {
              if (!RICHTEXT_SAFE_LINK_PROTOCOL.test(attr.value.trim())) child.removeAttribute('href');
              return;
            }
            if (attr.name !== 'style') {
              child.removeAttribute(attr.name);
              return;
            }
            const kept = child.style.cssText
              .split(';')
              .map((rule) => rule.trim())
              .filter(Boolean)
              .filter((rule) => RICHTEXT_ALLOWED_STYLE_PROPS.has(rule.split(':')[0].trim().toLowerCase()))
              .join('; ');
            if (kept) child.setAttribute('style', kept);
            else child.removeAttribute('style');
          });
          if (child.tagName === 'A' && child.hasAttribute('href')) {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
        } else if (child.nodeType !== Node.TEXT_NODE) {
          node.removeChild(child); // comments, etc.
        }
      });
    };

    clean(template.content);
    return template.innerHTML;
  }

  function descriptionToSafeHTML(value = '') {
    if (!value) return '';
    const looksLikeHTML = /<[a-z][\s\S]*>/i.test(value);
    if (!looksLikeHTML) return escapeHTML(value).replace(/\n/g, '<br>');
    return sanitizeRichText(value);
  }

  /* ------------------------------------------------------------------ */
  /* 2. DATA — fetched live from Firestore, no dummy content             */
  /* ------------------------------------------------------------------ */
  /* Filled in by loadAllData() below, using js/firebase-data.js, before
     anything tries to render. Every getter in firebase-data.js always
     resolves (never rejects) — collections resolve to [] and the
     profile resolves to an empty object when there's no data yet, so
     these variables are always at least a safe empty value. */

  let PROJECTS = [];
  let SKILLS = [];
  let EXPERIENCE = [];
  let LOG_ENTRIES = [];
  let PROFILE = null;

  const STAGE_LABELS = {
    all: 'showing all',
    scrape: 'showing scrape',
    analyze: 'showing analyze',
    automate: 'showing automate',
    ml: 'showing ml',
    ship: 'showing ship',
    multi: 'showing multi-stage',
  };

  /* ------------------------------------------------------------------ */
  /* 3. STATE                                                            */
  /* ------------------------------------------------------------------ */

  const state = {
    activeFilter: 'all', // 'all' | 'scrape' | 'analyze' | 'automate' | 'ml' | 'ship'
    fullGridRendered: false,
    lastFocusedBeforeModal: null,
    galleryItems: [],
    galleryIndex: 0,
    lightboxIndex: 0,
    lightboxAlt: '',
  };

  /* ------------------------------------------------------------------ */
  /* 4. THEME TOGGLE                                                     */
  /* ------------------------------------------------------------------ */

  function initThemeToggle() {
    const root = document.documentElement;
    const btn = $('#themeToggle');
    if (!btn) return;

    const stored = localStorage.getItem('portfolio-theme');
    const initial = stored === 'light' || stored === 'dark'
      ? stored
      : (root.getAttribute('data-theme') || 'dark');

    applyTheme(initial);

    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem('portfolio-theme', next);
    });

    function applyTheme(mode) {
      root.setAttribute('data-theme', mode);
      const isLight = mode === 'light';
      btn.setAttribute('aria-pressed', String(isLight));
      btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    }
  }

  /* ------------------------------------------------------------------ */
  /* 5. MOBILE NAV                                                       */
  /* ------------------------------------------------------------------ */

  function initMobileNav() {
    const menuBtn = $('#menuBtn');
    const navLinks = $('#navLinks');
    if (!menuBtn || !navLinks) return;

    const setOpen = (open) => {
      navLinks.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    menuBtn.addEventListener('click', () => {
      setOpen(!navLinks.classList.contains('is-open'));
    });

    // Close on link click
    $$('a', navLinks).forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!navLinks.classList.contains('is-open')) return;
      if (navLinks.contains(e.target) || menuBtn.contains(e.target)) return;
      setOpen(false);
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
        setOpen(false);
        menuBtn.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 6. PIPELINE SVG — PARTICLES + STAGE FILTERING                       */
  /* ------------------------------------------------------------------ */

  function initPipeline() {
    // Both the horizontal (desktop) and vertical (mobile) SVGs are in the
    // DOM at once — CSS shows only one at a time. Animate particles on
    // whichever paths exist, and wire clicks for every .stage-node so
    // filtering/scrolling works no matter which layout is visible.
    const pathConfigs = [
      { path: $('#pipelinePath'), particlesGroup: $('#pipelineParticles') },
      { path: $('#pipelinePathVertical'), particlesGroup: $('#pipelineParticlesVertical') },
    ];
    const stageNodes = $$('.stage-node');
    const activeLabel = $('#pipelineActiveLabel');

    // ---- Flowing particles along each path ----
    if (!prefersReducedMotion()) {
      pathConfigs.forEach(({ path, particlesGroup }) => {
        if (!path || !particlesGroup) return;

        const PARTICLE_COUNT = 3;
        const pathLength = path.getTotalLength();
        const particles = [];

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('r', '4');
          circle.setAttribute('class', 'pipeline-particle');
          particlesGroup.appendChild(circle);
          particles.push({
            el: circle,
            // stagger start offsets evenly along the path
            offset: (i / PARTICLE_COUNT) * pathLength,
          });
        }

        const SPEED = 90; // px per second along the path
        let lastTime = null;

        function tick(now) {
          if (lastTime === null) lastTime = now;
          const dt = (now - lastTime) / 1000;
          lastTime = now;

          particles.forEach((p) => {
            p.offset = (p.offset + SPEED * dt) % pathLength;
            const point = path.getPointAtLength(p.offset);
            p.el.setAttribute('cx', point.x);
            p.el.setAttribute('cy', point.y);
          });

          requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      });
    }
    // If reduced motion is preferred, particles are simply not animated
    // (no elements created), matching the pipeline's calmer static state.

    // ---- Stage node click / keyboard toggling ----
    stageNodes.forEach((node) => {
      const stage = node.getAttribute('data-stage');

      const activate = () => {
        const isCurrentlyActive = node.classList.contains('is-active');
        setFilter(isCurrentlyActive ? 'all' : stage, { fromPipeline: true });

        // Jump to the projects section so tapping a stage on mobile
        // actually takes you to the filtered results, not just updates
        // a label above the fold.
        if (!isCurrentlyActive) {
          const projectsSection = $('#projects');
          if (projectsSection) {
            projectsSection.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
          }
        }
      };

      node.addEventListener('click', activate);
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });

    function updatePipelineUI() {
      stageNodes.forEach((node) => {
        const stage = node.getAttribute('data-stage');
        const isActive = state.activeFilter === stage;
        node.classList.toggle('is-active', isActive);
        node.setAttribute('aria-pressed', String(isActive));
      });
      if (activeLabel) {
        activeLabel.textContent = STAGE_LABELS[state.activeFilter] || 'showing all';
      }
    }

    // Expose for the shared filter setter below.
    window.__updatePipelineUI = updatePipelineUI;
    updatePipelineUI();
  }

  /* ------------------------------------------------------------------ */
  /* 7. TYPEWRITER EFFECT                                                */
  /* ------------------------------------------------------------------ */

  function initTypewriter() {
    const target = $('#typewriterTarget');
    if (!target) return;

    // Bio comes from Firestore only. If it hasn't been added yet, show
    // a small "not added yet" note instead of typing nothing forever.
    const fullText = (PROFILE && PROFILE.bio) || '';
    if (!fullText) {
      target.textContent = 'No bio added yet — add one in the admin panel.';
      const cursor = target.nextElementSibling;
      if (cursor && cursor.classList.contains('terminal-cursor')) cursor.style.display = 'none';
      return;
    }

    // initTypewriter() can be called again later (refreshContent() reruns
    // it on visibility change / bfcache restore). Without guarding against
    // that, a second IntersectionObserver + typeNext() loop can end up
    // running concurrently with a leftover one from a previous call,
    // both appending characters to the same element — producing the
    // doubled/scrambled text bug. Cancel any previous run first.
    if (target.__typewriterObserver) {
      target.__typewriterObserver.disconnect();
      target.__typewriterObserver = null;
    }
    if (target.__typewriterTimeoutId) {
      clearTimeout(target.__typewriterTimeoutId);
      target.__typewriterTimeoutId = null;
    }

    target.setAttribute('data-full-text', fullText);
    let hasRun = false;

    function runTypewriter() {
      if (hasRun) return;
      hasRun = true;

      if (prefersReducedMotion()) {
        target.textContent = fullText;
        return;
      }

      target.textContent = '';
      let i = 0;
      const CHAR_DELAY = 18; // ms per character

      function typeNext() {
        if (i >= fullText.length) {
          target.__typewriterTimeoutId = null;
          return;
        }
        target.textContent += fullText.charAt(i);
        i++;
        target.__typewriterTimeoutId = setTimeout(typeNext, CHAR_DELAY);
      }
      typeNext();
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runTypewriter();
            observer.disconnect();
          }
        });
      }, { threshold: 0.4 });
      target.__typewriterObserver = observer;
      observer.observe(target);
    } else {
      // Fallback for very old browsers: just run it.
      runTypewriter();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 8. PROJECTS RENDERING + FILTERING                                   */
  /* ------------------------------------------------------------------ */

  function projectCardHTML(project) {
    const tags = (project.tags && project.tags.length) ? project.tags : [project.stage];
    const isMulti = tags.length > 1;
    // Multi-tag projects get their own accent color (--c-multi) instead of
    // any single stage color, so they read as their own thing in the grid.
    const accentColorVar = isMulti ? 'var(--c-multi)' : `var(--c-${tags[0]})`;
    const tagLabel = isMulti ? tags.join(' / ') : tags[0];
    const tagClass = 'project-tag' + (isMulti ? ' multi' : '');
    const thumbSrc = project.gallery[0] || '';
    const thumbInner = isImageUrl(thumbSrc)
      ? `<img src="${escapeHTML(thumbSrc)}" alt="${escapeHTML(project.title)} screenshot" loading="lazy">`
      : escapeHTML(thumbSrc || project.title);
    const thumbClass = isImageUrl(thumbSrc) ? 'project-thumb has-image' : 'project-thumb';
    return `
      <button type="button" class="project-card" style="--card-accent:${accentColorVar}" data-project-id="${project.id}">
        <div class="${thumbClass}">${thumbInner}</div>
        <div class="project-body">
          <span class="${tagClass}">${escapeHTML(tagLabel)}</span>
          <h3 class="project-title">${escapeHTML(project.title)}</h3>
          <p class="project-desc">${escapeHTML(project.shortDesc)}</p>
        </div>
      </button>
    `;
  }

  function renderProjectGrid(container, projects) {
    if (!container) return;

    if (!projects || projects.length === 0) {
      container.innerHTML = `<p class="empty-state">No projects added yet. Add some from the admin panel.</p>`;
      return;
    }

    container.innerHTML = projects.map(projectCardHTML).join('');
    $$('.project-card', container).forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-project-id');
        const project = PROJECTS.find((p) => p.id === id);
        if (project) openModal(project, card);
      });
    });
  }

  function applyFilterToGrids() {
    const featuredGrid = $('#featuredGrid');
    const fullGrid = $('#fullGrid');

    // "Featured" grid prefers projects explicitly flagged featured:true
    // (Firestore / fallback data). If none are flagged (e.g. an older
    // dataset without the field), fall back to the first 3 of the
    // filtered set so the section never renders empty.
    const filteredAll = state.activeFilter === 'all'
      ? PROJECTS
      : state.activeFilter === 'multi'
        ? PROJECTS.filter((p) => ((p.tags && p.tags.length) ? p.tags : [p.stage]).length > 1)
        : PROJECTS.filter((p) => ((p.tags && p.tags.length) ? p.tags : [p.stage]).includes(state.activeFilter));

    const featuredOnly = filteredAll.filter((p) => p.featured);
    const featuredSet = (featuredOnly.length > 0 ? featuredOnly : filteredAll).slice(0, 3);

    renderProjectGrid(featuredGrid, featuredSet);

    // Full grid only needs re-render if it has been revealed at least once,
    // or we render it lazily the first time it's shown.
    if (state.fullGridRendered) {
      renderProjectGrid(fullGrid, filteredAll);
    }
  }

  function initFilterChips() {
    const chips = $$('.chip[data-filter]');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const filter = chip.getAttribute('data-filter');
        setFilter(filter, { fromChip: true });
      });
    });
  }

  function updateChipsUI() {
    $$('.chip[data-filter]').forEach((chip) => {
      const isActive = chip.getAttribute('data-filter') === state.activeFilter;
      chip.classList.toggle('is-active', isActive);
    });
  }

  /** Single source of truth for filter state — used by both the pipeline
      stage nodes and the filter chips so they always stay in sync. */
  function setFilter(filter) {
    state.activeFilter = filter || 'all';
    updateChipsUI();
    if (typeof window.__updatePipelineUI === 'function') {
      window.__updatePipelineUI();
    }
    applyFilterToGrids();
  }

  function initViewAllButton() {
    const btn = $('#viewAllBtn');
    const fullGrid = $('#fullGrid');
    const filterChips = $('#filterChips');
    if (!btn || !fullGrid) return;

    btn.addEventListener('click', () => {
      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      const next = !isExpanded;

      btn.setAttribute('aria-expanded', String(next));
      btn.textContent = next ? 'Hide full project list' : 'View all projects';

      if (next) {
        if (filterChips) filterChips.hidden = false;
        fullGrid.hidden = false;
        state.fullGridRendered = true;
        applyFilterToGrids();
      } else {
        fullGrid.hidden = true;
        // Filter chips remain visible once revealed; only the grid collapses.
      }
    });
  }

  function renderGallerySlide() {
    const gallery = $('#modalGallery');
    const dotsWrap = $('#galleryDots');
    const prevBtn = $('#galleryPrev');
    const nextBtn = $('#galleryNext');
    if (!gallery) return;

    const items = state.galleryItems || [];
    const idx = state.galleryIndex || 0;

    gallery.style.transform = `translateX(-${idx * 100}%)`;

    if (dotsWrap) {
      $$('.gallery-dot', dotsWrap).forEach((dot, i) => {
        dot.classList.toggle('is-active', i === idx);
      });
    }

    const multiple = items.length > 1;
    if (prevBtn) prevBtn.hidden = !multiple;
    if (nextBtn) nextBtn.hidden = !multiple;
  }

  function goToGallerySlide(index) {
    const items = state.galleryItems || [];
    if (!items.length) return;
    state.galleryIndex = (index + items.length) % items.length;
    renderGallerySlide();
  }

  function initGalleryNav() {
    const prevBtn = $('#galleryPrev');
    const nextBtn = $('#galleryNext');
    if (prevBtn) prevBtn.addEventListener('click', () => goToGallerySlide((state.galleryIndex || 0) - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goToGallerySlide((state.galleryIndex || 0) + 1));
  }

  /* ------------------------------------------------------------------ */
  /* 9b. FULLSCREEN LIGHTBOX (click a gallery image to view it fullscreen) */
  /* ------------------------------------------------------------------ */

  function openLightbox(index) {
    const overlay = $('#lightboxOverlay');
    const img = $('#lightboxImg');
    const items = (state.galleryItems || []).filter(isImageUrl);
    if (!overlay || !img || !items.length) return;

    state.lightboxIndex = index;
    img.src = items[index];
    img.alt = state.lightboxAlt || '';
    overlay.hidden = false;
  }

  function closeLightbox() {
    const overlay = $('#lightboxOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    $('#lightboxImg').src = '';
  }

  function stepLightbox(delta) {
    const items = (state.galleryItems || []).filter(isImageUrl);
    if (!items.length) return;
    state.lightboxIndex = (state.lightboxIndex + delta + items.length) % items.length;
    $('#lightboxImg').src = items[state.lightboxIndex];
  }

  function initLightbox() {
    const overlay = $('#lightboxOverlay');
    const closeBtn = $('#lightboxClose');
    const prevBtn = $('#lightboxPrev');
    const nextBtn = $('#lightboxNext');
    if (!overlay) return;

    closeBtn.addEventListener('click', closeLightbox);
    prevBtn.addEventListener('click', () => stepLightbox(-1));
    nextBtn.addEventListener('click', () => stepLightbox(1));

    // Click the dark backdrop (not the image itself) to close.
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (overlay.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 9. PROJECT MODAL                                                    */
  /* ------------------------------------------------------------------ */

  function openModal(project, triggerEl) {
    const overlay = $('#modalOverlay');
    const modal = $('#modal');
    const gallery = $('#modalGallery');
    const dotsWrap = $('#galleryDots');
    const stageTag = $('#modalStageTag');
    const title = $('#modalTitle');
    const desc = $('#modalDesc');
    const tech = $('#modalTech');
    const actions = $('#modalActions');
    if (!overlay || !modal) return;

    state.lastFocusedBeforeModal = triggerEl || document.activeElement;

    // Gallery — one slide visible at a time, navigated via prev/next
    // buttons + dots instead of a horizontal scrollbar.
    const galleryItems = project.gallery && project.gallery.length ? project.gallery : [project.title];
    state.galleryItems = galleryItems;
    state.galleryIndex = 0;
    state.lightboxAlt = `${project.title} screenshot`;

    gallery.style.transform = 'translateX(0)';
    gallery.innerHTML = galleryItems
      .map((item, i) =>
        isImageUrl(item)
          ? `<div class="modal-gallery-img has-image" data-index="${i}"><img src="${escapeHTML(item)}" alt="${escapeHTML(project.title)} screenshot" loading="lazy"></div>`
          : `<div class="modal-gallery-img" data-index="${i}">${escapeHTML(item)}</div>`
      )
      .join('');

    // Clicking an image opens it fullscreen (lightbox index only counts
    // actual images, since text placeholders can't be shown fullscreen).
    $$('.modal-gallery-img.has-image', gallery).forEach((el) => {
      el.addEventListener('click', () => {
        const imageItems = galleryItems.filter(isImageUrl);
        const clickedSrc = galleryItems[Number(el.getAttribute('data-index'))];
        const imgIndex = imageItems.indexOf(clickedSrc);
        openLightbox(imgIndex === -1 ? 0 : imgIndex);
      });
    });

    if (dotsWrap) {
      dotsWrap.innerHTML = galleryItems.length > 1
        ? galleryItems.map((_, i) => `<button type="button" class="gallery-dot${i === 0 ? ' is-active' : ''}" data-index="${i}" aria-label="Go to image ${i + 1}"></button>`).join('')
        : '';
      $$('.gallery-dot', dotsWrap).forEach((dot) => {
        dot.addEventListener('click', () => goToGallerySlide(Number(dot.getAttribute('data-index'))));
      });
    }

    renderGallerySlide();

    // Stage tag(s)
    const modalTags = (project.tags && project.tags.length) ? project.tags : [project.stage];
    const modalIsMulti = modalTags.length > 1;
    const modalStageColor = modalIsMulti ? 'var(--c-multi)' : `var(--c-${modalTags[0]})`;
    stageTag.textContent = modalTags.join(' / ');
    stageTag.classList.toggle('multi', modalIsMulti);
    stageTag.style.background = `color-mix(in srgb, ${modalStageColor} 18%, transparent)`;
    stageTag.style.color = modalStageColor;

    // Title + description
    title.textContent = project.title;
    desc.innerHTML = descriptionToSafeHTML(project.fullDesc || project.shortDesc);

    // Tech badges
    tech.innerHTML = (project.tech || [])
      .map((t) => `<span class="tech-badge">${escapeHTML(t)}</span>`)
      .join('');

    // Action buttons — only render when the link actually exists.
    const buttons = [];
    if (project.github) {
      buttons.push(
        `<a class="btn btn-outline" href="${escapeHTML(project.github)}" target="_blank" rel="noopener noreferrer">View on GitHub</a>`
      );
    }
    if (project.live) {
      buttons.push(
        `<a class="btn btn-primary" href="${escapeHTML(project.live)}" target="_blank" rel="noopener noreferrer">Live Demo</a>`
      );
    }
    if (project.download) {
      buttons.push(
        `<a class="btn btn-ghost" href="${escapeHTML(project.download)}" target="_blank" rel="noopener noreferrer">Download</a>`
      );
    }
    actions.innerHTML = buttons.join('');

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';

    // Focus the close button, then trap focus within the modal.
    const closeBtn = $('#modalClose');
    if (closeBtn) closeBtn.focus();
    document.addEventListener('keydown', onModalKeydown);
  }

  function closeModal() {
    const overlay = $('#modalOverlay');
    if (!overlay || overlay.hidden) return;

    overlay.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onModalKeydown);
    closeLightbox();

    if (state.lastFocusedBeforeModal && typeof state.lastFocusedBeforeModal.focus === 'function') {
      state.lastFocusedBeforeModal.focus();
    }
    state.lastFocusedBeforeModal = null;
  }

  function onModalKeydown(e) {
    const modal = $('#modal');
    if (!modal) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = $$(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        modal
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function initModal() {
    const overlay = $('#modalOverlay');
    const closeBtn = $('#modalClose');
    if (!overlay) return;

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 10. GIT-LOG (EXPERIENCE)                                            */
  /* ------------------------------------------------------------------ */

  /** Maps a stage keyword (from Firestore or fallback data) to the same
      CSS custom property the rest of the site uses for stage accents. */
  function stageToColorVar(stage) {
    const known = ['scrape', 'analyze', 'automate', 'ml', 'ship'];
    const safeStage = known.includes(stage) ? stage : 'automate';
    return `var(--c-${safeStage})`;
  }

  function initGitLog() {
    const container = $('#gitLog');
    if (!container) return;

    if (!EXPERIENCE || EXPERIENCE.length === 0) {
      container.innerHTML = `<p class="empty-state">No experience entries added yet. Add some from the admin panel.</p>`;
      return;
    }

    container.innerHTML = EXPERIENCE.map((c) => `
      <div class="commit" style="--commit-color:${c.color || stageToColorVar(c.stage)}">
        <div class="commit-header">
          <span class="commit-hash">${escapeHTML(c.hash)}</span>
          <span class="commit-date">${escapeHTML(c.date)}</span>
          <span class="commit-branch-tag">${escapeHTML(c.branch)}</span>
        </div>
        <h3 class="commit-title">${escapeHTML(c.title)}</h3>
        <p class="commit-role">${escapeHTML(c.role)}</p>
        <p class="commit-desc">${escapeHTML(c.desc)}</p>
      </div>
    `).join('');
  }

  /* ------------------------------------------------------------------ */
  /* 11. STDOUT LOG (BLOG)                                               */
  /* ------------------------------------------------------------------ */

  function initStdoutLog() {
    const container = $('#stdoutBody');
    if (!container) return;

    if (!LOG_ENTRIES || LOG_ENTRIES.length === 0) {
      container.innerHTML = `<p class="empty-state">No log entries added yet. Add some from the admin panel.</p>`;
      return;
    }

    const levelClass = (level) => (level === 'OK' ? 'log-level-ok' : 'log-level-info');

    container.innerHTML = LOG_ENTRIES.map((entry) => `
      <div class="log-entry">
        <div class="log-meta">
          <span class="log-level ${levelClass(entry.level)}">${escapeHTML(entry.level)}</span>
          <span class="log-timestamp">${escapeHTML(entry.timestamp)}</span>
        </div>
        <p class="log-title">${escapeHTML(entry.title)}</p>
        <p class="log-desc">${escapeHTML(entry.desc)}</p>
      </div>
    `).join('');
  }

  /* ------------------------------------------------------------------ */
  /* 12. CONTACT FORM VALIDATION                                         */
  /* ------------------------------------------------------------------ */

  function initContactForm() {
    const form = $('#contactForm');
    if (!form) return;

    const nameInput = $('#fieldName');
    const emailInput = $('#fieldEmail');
    const messageInput = $('#fieldMessage');

    const errorName = $('#errorName');
    const errorEmail = $('#errorEmail');
    const errorMessage = $('#errorMessage');

    const status = $('#formStatus');

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const MIN_MESSAGE_LENGTH = 10;

    function setFieldError(input, errorEl, message) {
      const field = input.closest('.form-field');
      if (message) {
        field.classList.add('has-error');
        errorEl.textContent = message;
      } else {
        field.classList.remove('has-error');
        errorEl.textContent = '';
      }
    }

    function validate() {
      let isValid = true;

      if (!nameInput.value.trim()) {
        setFieldError(nameInput, errorName, 'Please enter your name.');
        isValid = false;
      } else {
        setFieldError(nameInput, errorName, '');
      }

      if (!emailInput.value.trim()) {
        setFieldError(emailInput, errorEmail, 'Please enter your email.');
        isValid = false;
      } else if (!EMAIL_RE.test(emailInput.value.trim())) {
        setFieldError(emailInput, errorEmail, 'Please enter a valid email address.');
        isValid = false;
      } else {
        setFieldError(emailInput, errorEmail, '');
      }

      const messageVal = messageInput.value.trim();
      if (!messageVal) {
        setFieldError(messageInput, errorMessage, 'Please enter a message.');
        isValid = false;
      } else if (messageVal.length < MIN_MESSAGE_LENGTH) {
        setFieldError(
          messageInput,
          errorMessage,
          `Message should be at least ${MIN_MESSAGE_LENGTH} characters.`
        );
        isValid = false;
      } else {
        setFieldError(messageInput, errorMessage, '');
      }

      return isValid;
    }

    const WEB3FORMS_ACCESS_KEY = 'fd660697-3e9b-47ef-be48-ea08a7c794b2';
    const submitBtn = form.querySelector('button[type="submit"]');
    const submitBtnOriginalHTML = submitBtn ? submitBtn.innerHTML : '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';

      if (!validate()) {
        status.textContent = '// Please fix the errors above and try again.';
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="btn-prompt">$</span> sending...';
      }
      status.textContent = '// sending message...';

      try {
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            message: messageInput.value.trim(),
            subject: `New portfolio contact message from ${nameInput.value.trim()}`,
          }),
        });

        const result = await response.json();

        if (result.success) {
          status.textContent = '// Message sent \u2014 thanks for reaching out! I\u2019ll get back to you soon.';
          form.reset();
        } else {
          status.textContent = '// Something went wrong sending your message. Please try again or email me directly.';
        }
      } catch (err) {
        status.textContent = '// Network error \u2014 please try again or email me directly.';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitBtnOriginalHTML;
        }
      }
    });

    // Clear a field's error as soon as the user starts fixing it.
    [nameInput, emailInput, messageInput].forEach((input) => {
      input.addEventListener('input', () => {
        const field = input.closest('.form-field');
        if (field.classList.contains('has-error')) {
          // Re-validate just this field, quietly.
          validate();
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 13. PROFILE (name / bio / contact links)                            */
  /* ------------------------------------------------------------------ */
  /* Fills in any element carrying a data-profile-field attribute with
     live profile data. This is entirely additive: if the HTML doesn't
     contain any such elements, this function simply does nothing and
     the page shows exactly the static markup it always shipped with. */

  function initProfile() {
    if (!PROFILE) return;

    // Any element with data-profile-field="name" (or "bio", "email",
    // "github", "linkedin") gets its text content replaced with live
    // profile data. If the field is still empty in Firestore, we show
    // a short "not added yet" note instead of leaving placeholder text
    // in the markup.
    const nameEls = $$('[data-profile-field="name"]');
    nameEls.forEach((el) => { el.textContent = PROFILE.name || 'Name not set'; });
    if (PROFILE.name) {
      document.title = document.title.replace(/^[^—]*/, `${PROFILE.name} `);
      const initialEl = document.getElementById('aboutAvatarInitial');
      if (initialEl) initialEl.textContent = PROFILE.name.trim().charAt(0).toUpperCase() || '?';
    }

    const bioEls = $$('[data-profile-field="bio"]:not(#typewriterTarget)');
    bioEls.forEach((el) => { el.textContent = PROFILE.bio || 'Bio not added yet.'; });

    const contact = PROFILE.contact || {};

    const emailEls = $$('[data-profile-field="email"]');
    emailEls.forEach((el) => {
      const valueEl = el.querySelector('.contact-link-value');
      if (contact.email) {
        if (el.tagName === 'A') el.href = `mailto:${contact.email}`;
        if (valueEl) valueEl.textContent = contact.email;
        else el.textContent = contact.email;
      } else {
        if (el.tagName === 'A') el.removeAttribute('href');
        if (valueEl) valueEl.textContent = 'Not added yet';
        else el.textContent = 'Not added yet';
      }
    });

    const githubEls = $$('[data-profile-field="github"]');
    githubEls.forEach((el) => {
      const valueEl = el.querySelector('.contact-link-value');
      if (contact.github) {
        if (el.tagName === 'A') el.href = contact.github;
        if (valueEl) valueEl.textContent = contact.github.replace(/^https?:\/\//, '');
      } else {
        if (el.tagName === 'A') el.removeAttribute('href');
        if (valueEl) valueEl.textContent = 'Not added yet';
      }
    });

    const linkedinEls = $$('[data-profile-field="linkedin"]');
    linkedinEls.forEach((el) => {
      const valueEl = el.querySelector('.contact-link-value');
      if (contact.linkedin) {
        if (el.tagName === 'A') el.href = contact.linkedin;
        if (valueEl) valueEl.textContent = contact.linkedin.replace(/^https?:\/\//, '');
      } else {
        if (el.tagName === 'A') el.removeAttribute('href');
        if (valueEl) valueEl.textContent = 'Not added yet';
      }
    });

    // Profile photo: swap the placeholder initial for the real image
    // once a photoUrl exists. Previously there was no code path at all
    // that read PROFILE.photoUrl, so an uploaded photo never appeared
    // on the public site no matter what was saved in the admin panel.
    if (PROFILE.photoUrl) {
      const photoImg = document.getElementById('aboutAvatarPhoto');
      const initialEl = document.getElementById('aboutAvatarInitial');
      const captionEl = document.getElementById('aboutAvatarCaption');
      if (photoImg) {
        photoImg.src = PROFILE.photoUrl;
        photoImg.style.display = 'block';
      }
      if (initialEl) initialEl.style.display = 'none';
      if (captionEl) captionEl.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------------ */
  /* 14. SKILLS GRID (Firestore-driven)                                  */
  /* ------------------------------------------------------------------ */
  /* Fully replaces whatever placeholder markup shipped in the HTML with
     live data from the "skills" collection in Firestore. If that
     collection is empty, we show an explicit empty state rather than
     leaving any hard-coded skill tags on the page. */

  function skillGroupHTML(group) {
    const color = group.color || 'var(--c-scrape)';
    return `
      <div class="skill-group">
        <h3 class="skill-group-title" style="--group-color:${escapeHTML(color)}">${escapeHTML(group.group)}</h3>
        <div class="skill-tags">
          ${(group.tags || []).map((tag) => `<span class="skill-tag">${escapeHTML(tag)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  function initSkillsGrid() {
    const container = $('.skills-grid');
    if (!container) return;

    if (!Array.isArray(SKILLS) || SKILLS.length === 0) {
      container.innerHTML = `<p class="empty-state">No skills added yet. Add some from the admin panel.</p>`;
      return;
    }

    container.innerHTML = SKILLS.map(skillGroupHTML).join('');
  }

  /* ------------------------------------------------------------------ */
  /* 15. FOOTER YEAR + INIT                                              */
  /* ------------------------------------------------------------------ */

  function initFooterYear() {
    const yearEl = $('#footerYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /** Loads all site content (Firestore-backed, with static fallback) in
      parallel before any rendering happens. Every getter in
      firebase-data.js always resolves (never throws), so no try/catch
      is needed here — this can never leave the page blank. */
  async function loadAllData() {
    const [projects, skills, experience, blogPosts, profile] = await Promise.all([
      getProjects(),
      getSkills(),
      getExperience(),
      getBlogPosts(),
      getProfile(),
    ]);

    PROJECTS = projects;
    SKILLS = skills;
    EXPERIENCE = experience;
    LOG_ENTRIES = blogPosts;
    PROFILE = profile;
  }

  /** Re-fetches all content and re-renders every data-driven section.
      Used both for the initial page load and for refreshing content
      when the page becomes visible again (see the bfcache/visibility
      listeners below), so admin-panel edits show up for visitors
      without them needing to hard-refresh. */
  async function refreshContent() {
    await loadAllData();

    initProfile();
    initSkillsGrid();
    initTypewriter();
    initGitLog();
    initStdoutLog();
    applyFilterToGrids();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initFooterYear();
    initThemeToggle();
    initMobileNav();
    initModal();
    initGalleryNav();
    initLightbox();
    initContactForm();

    // Fetch all content (always live from Firestore) before rendering
    // anything that depends on it.
    await loadAllData();

    initProfile();
    initSkillsGrid();
    initPipeline();
    initTypewriter();
    initFilterChips();
    initViewAllButton();
    initGitLog();
    initStdoutLog();

    // Initial project render (featured grid only; full grid renders lazily
    // the first time "View all projects" is clicked).
    setFilter('all');
  });

  /* ------------------------------------------------------------------ */
  /* KEEP CONTENT FRESH — avoid showing stale data from browser bfcache  */
  /* ------------------------------------------------------------------ */
  /* If a visitor navigates back/forward, some browsers restore the page
     from an in-memory snapshot (bfcache) instead of re-running this
     script — so any admin-panel updates made in the meantime wouldn't
     show up. `pageshow` with `event.persisted` fires in that exact
     case, so we re-fetch and re-render then. We also refresh whenever
     a background tab becomes visible again, in case the visitor left
     the tab open while new content was published. */
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refreshContent();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshContent();
  });
})();