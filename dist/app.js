/* ==========================================================================
   Chris van Asselt — portfolio interactions

   Preloader → fixed chrome (rulers, taglines) → background video →
   hero poster that assembles into the sidebar → section reveals →
   section tracking + navigation.

   GSAP drives everything: ScrollTrigger for scroll-linked timelines,
   ScrollSmoother for the eased wheel scrolling, SplitText for the
   character reveals. liquid.js supplies the fluid background.
   ========================================================================== */

(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const root = document.documentElement;

  const WIDE = '(aspect-ratio >= 4/3)';
  const MOTION = '(prefers-reduced-motion: no-preference)';
  const isWide = () => matchMedia(WIDE).matches;
  const prefersMotion = () => matchMedia(MOTION).matches;
  const remPx = () => parseFloat(getComputedStyle(root).fontSize);

  const header = $('.site-header');
  const heroVideo = $('#hero-video');

  $('#year').textContent = new Date().getFullYear();

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    root.classList.add('static-hero');
    $('.preloader')?.remove();
    return;
  }

  gsap.registerPlugin(ScrollTrigger, SplitText);
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Wheel steps are eased into one continuous glide (touch keeps native scrolling).
  let smoother = null;
  if (typeof ScrollSmoother !== 'undefined') {
    gsap.registerPlugin(ScrollSmoother);
    smoother = ScrollSmoother.create({
      wrapper: '#smooth-wrapper',
      content: '#smooth-content',
      smooth: prefersMotion() ? 1.2 : 0,
      effects: false,
      ignoreMobileResize: true,
    });
  }

  /* ------------------------------------------------------------------------
     Small shared helpers
     ------------------------------------------------------------------------ */

  function debounce(fn, wait = 150) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  const splitChars = el => (el ? new SplitText(el, { type: 'words,chars' }).chars : []);

  // Characters fly in from a random scatter, like pieces snapping into place.
  function assemble(tl, chars, at, duration = 0.34) {
    if (!chars.length) return;
    const r = remPx();
    tl.fromTo(chars, {
      x: () => gsap.utils.random(-2.9, 2.9) * r,
      y: () => gsap.utils.random(-1.6, 1.6) * r,
      rotate: () => gsap.utils.random(-16, 16),
      filter: 'blur(10px)',
      opacity: 0,
    }, {
      x: 0, y: 0, rotate: 0, filter: 'blur(0px)', opacity: 1,
      ease: 'none', duration, stagger: Math.min(0.012, duration / chars.length),
    }, at);
  }

  function fadeUp(tl, targets, at, duration = 0.2, stagger = 0.03) {
    tl.fromTo(targets, { y: 14, opacity: 0, filter: 'blur(6px)' },
      { y: 0, opacity: 1, filter: 'blur(0px)', ease: 'none', duration, stagger }, at);
  }

  function drawStroke(tl, path, at, duration = 0.12) {
    if (!path) return;
    // A long gap keeps the round line cap from showing as a dot before drawing starts.
    const length = path.getTotalLength() + 8;
    tl.fromTo(path, { strokeDasharray: `${length} ${length * 2}`, strokeDashoffset: length + 40 },
      { strokeDashoffset: 0, ease: 'none', duration }, at);
  }

  // Assemble every .line inside a heading, then draw its marker underline.
  function revealHeading(tl, heading, at = 0) {
    $$('.line', heading).forEach((line, i) => assemble(tl, splitChars(line), at + i * 0.15));
    drawStroke(tl, $('.underline .marker-stroke', heading), at + 0.45);
  }

  const scrubTimeline = (trigger, start = 'top 85%', end = 'top 25%') =>
    gsap.timeline({ scrollTrigger: { trigger, start, end, scrub: 0.5 } });

  /* ------------------------------------------------------------------------
     Preloader
     ------------------------------------------------------------------------ */

  function runPreloader() {
    const el = $('.preloader');
    if (!el) return Promise.resolve();

    const ruler = $('.preloader-ruler');
    for (let i = 0; i <= 50; i++) {
      const tick = document.createElement('span');
      tick.className = `preloader-tick${i % 5 === 0 ? ' preloader-tick--major' : ''}`;
      tick.style.left = `${i * 2}%`;
      ruler.prepend(tick);
    }

    const stage = $('.preloader-stage-cards');
    const cards = ['portrait.webp', 'canopy.webp', 'team.webp', 'greenhouse.webp'].map(src => {
      const card = document.createElement('span');
      card.className = 'preloader-card';
      card.innerHTML = `<img src="assets/${src}" alt="">`;
      stage.append(card);
      return card;
    });

    const digits = $$('.preloader-digit');
    const marker = $('.preloader-marker');
    const state = { value: 0 };
    const render = () => {
      const value = Math.round(state.value);
      [...pad(value, 3)].forEach((digit, i) => { digits[i].textContent = digit; });
      marker.style.left = `${value}%`;
    };

    const motion = prefersMotion();
    gsap.fromTo('.preloader-title-mark', { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power3.out', transformOrigin: 'left center' });
    gsap.fromTo(cards, { yPercent: 120, rotate: () => gsap.utils.random(-12, 12), opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: motion ? 0.45 : 0 });
    const counter = gsap.to(state, { value: 100, duration: motion ? 2.2 : 0.3, ease: 'power2.inOut', onUpdate: render });

    const pageLoaded = new Promise(resolve => {
      if (document.readyState === 'complete') resolve();
      else addEventListener('load', resolve, { once: true });
    });
    const ready = Promise.race([
      Promise.all([pageLoaded, document.fonts.ready]),
      new Promise(resolve => setTimeout(resolve, 7000)),
    ]);

    return Promise.all([ready, counter.then()])
      .then(() => gsap.to(el, { yPercent: -100, duration: motion ? 0.9 : 0.01, ease: 'power4.inOut' }).then())
      .then(() => el.remove());
  }

  /* ------------------------------------------------------------------------
     Rulers, cursor readout, taglines
     ------------------------------------------------------------------------ */

  function initRulers() {
    const top = $('.ruler-top');
    const left = $('.ruler-left');
    const build = (container, length, side) => {
      const fragment = document.createDocumentFragment();
      for (let p = 0; p <= length; p += 10) {
        const tick = document.createElement('span');
        tick.className = 'ruler-tick';
        tick.style[side] = `${p}px`;
        fragment.append(tick);
        if (p && p % 100 === 0) {
          const mark = document.createElement('span');
          mark.className = 'ruler-mark';
          mark.textContent = p;
          mark.style[side] = `${p}px`;
          fragment.append(mark);
        }
      }
      container.replaceChildren(fragment);
    };
    const buildAll = () => { build(top, innerWidth, 'left'); build(left, innerHeight, 'top'); };
    buildAll();
    addEventListener('resize', debounce(buildAll, 200));

    const cursorX = $('.ruler-cursor-x');
    const cursorY = $('.ruler-cursor-y');
    const dataX = $('#data-x');
    const dataY = $('#data-y');
    addEventListener('pointermove', e => {
      cursorX.style.transform = `translateX(${e.clientX}px) translateX(-50%)`;
      cursorY.style.transform = `translateY(${e.clientY}px) translateY(-50%)`;
      dataX.textContent = `x:${pad(Math.round(e.clientX), 4)}`;
      dataY.textContent = `y:${pad(Math.round(e.clientY), 4)}`;
    }, { passive: true });

    $('.hero-rulers').classList.add('is-ready');
    $('.fixed-datas').classList.add('is-ready');
  }

  function initTaglines() {
    const groups = $$('.tagline-swap').map(group => $$('.tagline-word', group));
    let index = 0;
    setInterval(() => {
      if (!prefersMotion()) return;
      index = (index + 1) % groups[0].length;
      groups.forEach(words => words.forEach((word, i) => word.classList.toggle('is-on', i === index)));
    }, 2400);
  }

  /* ------------------------------------------------------------------------
     Background video. Reduced-motion visitors get the poster frame instead.
     ------------------------------------------------------------------------ */

  const heroVideoLayer = $('.hero-video');
  const videoStill = !prefersMotion();
  let heroVideoVisible = true;

  function syncHeroVideo() {
    const playing = heroVideoVisible && !videoStill;
    if (playing) heroVideo.play().catch(() => {}); else heroVideo.pause();
    heroVideoLayer.classList.toggle('is-retired', !heroVideoVisible);
  }

  function setHeroVideoVisible(visible) {
    if (visible === heroVideoVisible) return;
    heroVideoVisible = visible;
    syncHeroVideo();
  }

  // Past the hero the footage lives on under a fluid mask instead of fading
  // out, and it drifts gently against the pointer. Without WebGL the video
  // simply retires once the hero has gone.
  function initLivingBackdrop() {
    const styles = getComputedStyle(root);
    const liquid = window.createLiquid?.($('.liquid-canvas'), {
      bg: styles.getPropertyValue('--bg'),
      ink: styles.getPropertyValue('--light'),
    });

    gsap.set(heroVideo, { scale: 1.06 });
    const driftX = gsap.quickTo(heroVideo, 'xPercent', { duration: 1.4, ease: 'power3' });
    const driftY = gsap.quickTo(heroVideo, 'yPercent', { duration: 1.4, ease: 'power3' });
    const drift = e => {
      driftX((0.5 - e.clientX / innerWidth) * 3);
      driftY((0.5 - e.clientY / innerHeight) * 3);
    };
    addEventListener('pointermove', drift, { passive: true });

    return {
      hasLiquid: Boolean(liquid),
      // Called with the hero timeline's progress.
      sync(progress) {
        if (liquid) liquid.setPaused(progress < 0.1);
        else setHeroVideoVisible(progress < 0.4);
      },
      destroy() {
        removeEventListener('pointermove', drift);
        liquid?.destroy();
      },
    };
  }

  /* ------------------------------------------------------------------------
     Hero: the sidebar's name, portrait, links and nav start out as a
     full-width poster and assemble into the right-hand sidebar while the
     intro builds up. Every piece rests in its sidebar spot; the poster is
     just a transform (or size) applied on top, scrubbed back to zero.
     ------------------------------------------------------------------------ */

  function initHeroFlip() {
    root.classList.add('has-flip');

    const name = $('.brand-name');
    const nameLine = $('.brand-name-line');
    const photo = $('.brand-photo');
    const frame = $('.brand-photo-frame');
    const social = $('.hero-social');
    const socialLinks = $$('.social-link', social);
    const socialTexts = $$('.social-text', social);
    const socialIcons = $$('.social-icon', social);
    const tagline = $('.header-tagline');
    const stack = $('.header-stack');
    const navItems = $$('.header-nav a');
    const headerItems = [tagline, stack, ...navItems];
    const sidebarExtras = $$('.sidebar-bio, .sidebar-locale, .brand-photo-caption, .brand-badge');
    const layout = new Map();
    const inkCanvas = document.createElement('canvas').getContext('2d');
    const HERO_PHOTO_ASPECT = 3 / 4;

    // Where the capitals actually sit inside the name's line box, so the portrait can match them exactly.
    function inkBounds() {
      const cs = getComputedStyle(nameLine);
      inkCanvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = inkCanvas.measureText(nameLine.textContent.trim().toUpperCase());
      const r = nameLine.getBoundingClientRect();
      const baseline = r.top + (r.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
      return { top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent };
    }

    // Transform that moves a box measured at `rect` to `left`/`top`, scaled to `width`.
    const placeAt = (rect, left, top, width) => ({ x: left - rect.left, y: top - rect.top, scale: width / rect.width });

    // The sidebar name spans the sidebar's full inner width.
    function fitSidebarName() {
      name.style.fontSize = '';
      const hs = getComputedStyle(header);
      const inner = header.clientWidth - parseFloat(hs.paddingLeft) - parseFloat(hs.paddingRight);
      name.style.fontSize = `${parseFloat(getComputedStyle(name).fontSize) * inner / nameLine.getBoundingClientRect().width}px`;
    }

    function measure() {
      gsap.set([name, ...headerItems], { clearProps: 'transform' });
      gsap.set(frame, { clearProps: 'transform,width,height' });
      gsap.set(social, { clearProps: 'transform,columnGap' });
      gsap.set(socialLinks, { clearProps: 'width' });
      fitSidebarName();

      const W = innerWidth;
      const H = innerHeight;
      const inset = clamp(0.04 * W, 24, 80);
      const row = W - inset * 2;
      const rowBottom = H * 0.89;
      const gap = 24;

      // Name + portrait share one row: the portrait is exactly as tall as the capitals, 24px to their right.
      const n = name.getBoundingClientRect();
      const ink = inkBounds();
      const inkTop = (ink.top - n.top) / n.height;
      const inkHeight = (ink.bottom - ink.top) / n.height;
      const nameWidth = (row * 0.92 - gap) / (1 + HERO_PHOTO_ASPECT * inkHeight * (n.height / n.width));
      const nameScale = nameWidth / n.width;
      const nameHeight = n.height * nameScale;
      const nameTop = rowBottom - nameHeight;
      layout.set(name, placeAt(n, inset, nameTop, nameWidth));
      name.style.setProperty('--hero-flip', nameScale.toFixed(3));

      // The portrait changes shape on the way (3:4 on the poster, taller in the sidebar), so it tweens its size.
      const capTop = nameTop + inkTop * nameHeight;
      const capHeight = inkHeight * nameHeight;
      const photoLeft = inset + nameWidth + gap;
      const photoWidth = capHeight * HERO_PHOTO_ASPECT;
      const f = frame.getBoundingClientRect();
      layout.set(frame, { x: photoLeft - f.left, y: capTop - f.top, width: photoWidth, height: capHeight, restWidth: f.width, restHeight: f.height });

      // Social links read as words under the portrait, then shrink to icons in the sidebar.
      const s = social.getBoundingClientRect();
      const textWidths = socialTexts.map(t => t.getBoundingClientRect().width);
      const heroGap = 0.01 * W;
      const heroRow = textWidths.reduce((sum, w) => sum + w, 0) + heroGap * (textWidths.length - 1);
      layout.set(social, {
        x: photoLeft + photoWidth - heroRow - s.left,
        y: rowBottom - nameHeight * 0.015 - s.top,
        heroGap, restGap: parseFloat(getComputedStyle(social).columnGap),
        textWidths, iconWidth: socialLinks[0].getBoundingClientRect().width,
      });

      // Header type is set larger on the poster: tagline + nav at 1.5vw, stack at 0.8vw.
      const headerTop = 28;
      const fontScale = (el, vw) => (vw * W) / parseFloat(getComputedStyle(el).fontSize);
      const t = tagline.getBoundingClientRect();
      const tScale = fontScale(tagline, 0.015);
      layout.set(tagline, placeAt(t, inset, headerTop, t.width * tScale));
      const st = stack.getBoundingClientRect();
      const stScale = fontScale(stack, 0.008);
      layout.set(stack, placeAt(st, inset, headerTop + t.height * tScale + 5.6, st.width * stScale));

      const navGap = 32;
      const navScale = fontScale(navItems[0], 0.015);
      const navRects = navItems.map(a => a.getBoundingClientRect());
      let left = W - inset - navRects.reduce((sum, r) => sum + r.width * navScale, 0) - navGap * (navItems.length - 1);
      navItems.forEach((a, i) => {
        layout.set(a, placeAt(navRects[i], left, headerTop, navRects[i].width * navScale));
        left += navRects[i].width * navScale + navGap;
      });
    }

    measure();
    ScrollTrigger.addEventListener('refreshInit', measure);
    gsap.set([name, ...headerItems], { transformOrigin: '0 0' });

    const backdrop = initLivingBackdrop();

    const panel = $('.skills-panel');
    const heading = $('.skills-heading');
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: panel,
        start: 'top top',
        end: () => `+=${innerHeight * 1.7}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: self => {
          backdrop.sync(self.progress);
          header.classList.toggle('is-docked', self.progress > 0.5);
        },
        onRefresh: self => backdrop.sync(self.progress),
      },
    });

    const fly = { ease: 'power2.inOut', duration: 1 };
    const from = (el, key) => () => layout.get(el)[key];
    [name, ...headerItems].forEach(el => {
      tl.fromTo(el, { x: from(el, 'x'), y: from(el, 'y'), scale: from(el, 'scale') }, { x: 0, y: 0, scale: 1, ...fly }, 0);
    });
    tl.fromTo(frame,
      { x: from(frame, 'x'), y: from(frame, 'y'), width: from(frame, 'width'), height: from(frame, 'height') },
      { x: 0, y: 0, width: from(frame, 'restWidth'), height: from(frame, 'restHeight'), ...fly }, 0);
    tl.fromTo(social,
      { x: from(social, 'x'), y: from(social, 'y'), columnGap: from(social, 'heroGap') },
      { x: 0, y: 0, columnGap: from(social, 'restGap'), ...fly }, 0);
    socialLinks.forEach((link, i) => {
      tl.fromTo(link, { width: () => layout.get(social).textWidths[i] }, { width: from(social, 'iconWidth'), ...fly }, 0);
    });
    tl.fromTo(socialTexts, { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.45 }, 0.1)
      .fromTo(socialIcons, { opacity: 0 }, { opacity: 0.85, ease: 'none', duration: 0.4 }, 0.55)
      .fromTo('.hero-mark', { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.25 }, 0)
      .to(stack, { opacity: 0, ease: 'none', duration: 0.3 }, 0.1)
      // The portrait dips out mid-flight so it never crosses the name.
      .fromTo(frame, { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.2 }, 0.1)
      .to(frame, { opacity: 1, ease: 'none', duration: 0.15 }, 0.8)
      .fromTo(sidebarExtras, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: 0.3, stagger: 0.05 }, 0.65);
    if (backdrop.hasLiquid) {
      tl.fromTo('.liquid', { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.5 }, 0.2)
        .fromTo('.hero-video-overlay', { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.5 }, 0.2);
    } else {
      tl.fromTo('.hero-video', { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.5 }, 0.2);
    }

    revealHeading(tl, heading, 0.3);
    fadeUp(tl, $('.skills-subheading'), 1.05);
    $$('.skills-stat').forEach((stat, i) => {
      assemble(tl, splitChars($('.skills-stat-number', stat)), 1.12 + i * 0.1, 0.2);
      fadeUp(tl, $$('.skills-stat-label span', stat), 1.2 + i * 0.1, 0.12, 0.04);
    });
    tl.fromTo('.skills-stat-arrow', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, ease: 'none', duration: 0.1 }, 1.45);
    tl.to({}, { duration: 0.15 }, 1.55);

    const cleanupExit = initSidebarExit([name, $('.header-intro'), social, ...$$('.sidebar-bio, .sidebar-locale'), $('.header-menu'), photo]);

    return () => {
      ScrollTrigger.removeEventListener('refreshInit', measure);
      backdrop.destroy();
      cleanupExit();
      name.style.fontSize = '';
    };
  }

  // Before contact the sidebar scatters off to the right, piece by piece.
  function initSidebarExit(pieces) {
    const setGone = self => header.classList.toggle('is-gone', self.progress > 0.8);
    const exit = gsap.timeline({
      scrollTrigger: {
        trigger: '#transition', start: 'top 75%',
        endTrigger: '#contact', end: 'top 30%',
        scrub: 0.6, invalidateOnRefresh: true,
        // Measured after the pinned sections above it have added their scroll length.
        refreshPriority: -1,
        onUpdate: setGone, onRefresh: setGone,
      },
    });
    exit.to({}, { duration: 1 }, 0);
    pieces.forEach((el, i) => {
      exit.to(el, {
        xPercent: () => (gsap.utils.random(140, 340) / (el.offsetWidth || 1)) * 100,
        yPercent: () => (gsap.utils.random(-170, 170) / (el.offsetHeight || 1)) * 100,
        rotate: () => gsap.utils.random(-16, 16),
        opacity: 0, filter: 'blur(12px)', ease: 'none', duration: 0.45,
      }, 0.1 + i * 0.055);
    });

    return () => header.classList.remove('is-gone');
  }

  // Mobile, reduced motion, or no-flip: the hero is a static name poster.
  function initStaticHero(motion) {
    root.classList.add('static-hero');
    header.classList.add('is-docked');
    const portrait = $('.hero-portrait');

    // The poster already shows the name, so the header wordmark waits until it has scrolled away.
    ScrollTrigger.create({
      trigger: portrait,
      start: 'top top',
      end: 'bottom 45%',
      onLeave: () => { header.classList.remove('is-hero'); setHeroVideoVisible(false); },
      onEnterBack: () => { header.classList.add('is-hero'); setHeroVideoVisible(true); },
    });
    header.classList.toggle('is-hero', scrollY < portrait.offsetHeight * 0.55);

    gsap.fromTo('.hero-video', { opacity: 1 }, {
      opacity: 0, ease: 'none',
      scrollTrigger: { trigger: portrait, start: 'top top', end: 'bottom top', scrub: true },
    });

    if (!motion) return;
    const tl = scrubTimeline('.skills-panel', 'top 85%', 'top 20%');
    revealHeading(tl, $('.skills-heading'), 0);
    fadeUp(tl, $('.skills-subheading'), 0.55);
    $$('.skills-stat').forEach((stat, i) => {
      assemble(tl, splitChars($('.skills-stat-number', stat)), 0.6 + i * 0.1, 0.2);
      fadeUp(tl, $$('.skills-stat-label span', stat), 0.65 + i * 0.1, 0.12, 0.04);
    });
  }

  /* ------------------------------------------------------------------------
     Expertise
     ------------------------------------------------------------------------ */

  function initExpertise() {
    $$('.skills-category').forEach(category => {
      const tl = scrubTimeline(category, 'top 92%', 'top 55%');
      tl.fromTo($('.skills-category-index', category), { opacity: 0, x: -20 }, { opacity: 1, x: 0, ease: 'none', duration: 0.2 }, 0);
      assemble(tl, splitChars($('.skills-category-title', category)), 0.05);
      fadeUp(tl, $$('.skills-category-tags span', category), 0.35, 0.2, 0.05);
      const note = $('.skills-category-note', category);
      if (note) tl.fromTo(note, { opacity: 0, x: -30 }, { opacity: 1, x: 0, ease: 'none', duration: 0.2 }, 0.45);
    });
  }

  /* ------------------------------------------------------------------------
     Fieldwork: heading + curved gallery, then a pinned swap to Cultilene
     ------------------------------------------------------------------------ */

  function initPortfolio(motion) {
    const section = $('#fieldwork');
    section.classList.toggle('is-static', !motion);
    if (!motion) return;

    const enter = scrubTimeline(section, 'top 85%', 'top 10%');
    revealHeading(enter, $('.portfolio-heading'), 0);
    revealHeading(enter, $('.portfolio-subheading'), 0.5);
    fadeUp(enter, ['.portfolio-claim', '.portfolio-graffiti'], 0.9, 0.2, 0.08);

    const sceneTwo = $('.portfolio-scene-two');
    const pin = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${innerHeight * 1.6}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: self => section.classList.toggle('is-scene-two', self.progress > 0.5),
      },
    });
    pin.to('.portfolio-scene-one', {
      opacity: 0, y: () => -3 * remPx(), filter: 'blur(10px)', ease: 'none', duration: 0.15,
    }, 0.35)
      .set(sceneTwo, { visibility: 'visible' }, 0.46);
    fadeUp(pin, $('.portfolio-scene-two .experience'), 0.48);
    pin.fromTo('.portfolio-brand-arrow', { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, ease: 'none', duration: 0.12 }, 0.5);
    assemble(pin, splitChars($('.portfolio-brand')), 0.5, 0.22);
    drawStroke(pin, $('.underline--brand .marker-stroke'), 0.72);
    fadeUp(pin, ['.portfolio-brand-subtitle', '.portfolio-brand-note'], 0.74, 0.14, 0.05);
    fadeUp(pin, [...$$('.portfolio-stat'), $('.portfolio-more')], 0.82, 0.12, 0.04);
    pin.to({}, { duration: 0.1 }, 0.95);
  }

  // Cards ride along the outside of a slowly turning cylinder.
  function initCurveGallery() {
    const gallery = $('.portfolio-gallery');
    const cards = $$('.curve-card');
    let offset = 0;
    let velocity = 0;
    let spacing = 0;
    let total = 0;
    let visible = false;
    let drag = null;
    let suppressClick = false;

    const measure = () => { spacing = cards[0].offsetWidth * 1.1; total = spacing * cards.length; };
    measure();
    addEventListener('resize', debounce(measure));
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(gallery);

    gallery.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, offset, last: e.clientX, moved: 0 };
      suppressClick = false;
    });
    addEventListener('pointermove', e => {
      if (!drag) return;
      velocity = drag.last - e.clientX;
      drag.last = e.clientX;
      drag.moved = Math.abs(e.clientX - drag.x);
      offset = drag.offset - (e.clientX - drag.x);
      if (drag.moved > 6) suppressClick = true;
    }, { passive: true });
    addEventListener('pointerup', () => { drag = null; });
    gallery.addEventListener('click', e => {
      if (suppressClick) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    gsap.ticker.add((time, deltaMs) => {
      if (!visible || !spacing) return;
      if (!drag) {
        offset += velocity + (prefersMotion() ? deltaMs * 0.04 : 0);
        velocity *= 0.93;
      }
      const width = gallery.clientWidth;
      const radius = width * 0.8;
      cards.forEach((card, i) => {
        const u = ((i * spacing - offset) % total + total) % total - total / 2;
        const angle = clamp(u / radius, -1.5, 1.5);
        const x = radius * Math.sin(angle);
        const z = -radius * (1 - Math.cos(angle));
        card.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, 0, ${z.toFixed(1)}px) rotateY(${angle.toFixed(4)}rad)`;
        card.style.visibility = Math.abs(u) > width * 0.75 ? 'hidden' : 'visible';
      });
    });
  }

  /* ------------------------------------------------------------------------
     Field notes: pinned horizontal strip with a focus counter
     ------------------------------------------------------------------------ */

  function initNotes(motion) {
    const section = $('#notes');
    const gallery = $('.notes-gallery');
    const track = $('.notes-track');
    const items = $$('.notes-media', track);
    const counter = $('.notes-counter-current');
    $('.notes-counter-total').textContent = pad(items.length);

    const distance = () => Math.max(0, track.scrollWidth - gallery.clientWidth);
    let current = -1;

    function update() {
      const g = gallery.getBoundingClientRect();
      const center = g.left + g.width / 2;
      let best = 0;
      let bestDistance = Infinity;
      items.forEach((item, i) => {
        const r = item.getBoundingClientRect();
        const offset = r.left + r.width / 2 - center;
        const focus = clamp(1.25 - Math.abs(offset) / (r.width * 1.2), 0, 1);
        item.style.setProperty('--focus', focus.toFixed(3));
        $('.notes-media-inner', item).style.transform = `translateX(${(-offset / g.width * 8).toFixed(2)}%)`;
        if (Math.abs(offset) < bestDistance) { bestDistance = Math.abs(offset); best = i; }
      });
      if (best !== current) {
        current = best;
        counter.textContent = pad(best + 1);
        items.forEach((item, i) => {
          const video = $('video', item);
          if (!video) return;
          if (i === best && prefersMotion()) video.play().catch(() => {}); else video.pause();
        });
      }
    }

    // Update on every render of the scrubbed tween so focus follows the eased motion.
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      onUpdate: update,
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onRefresh: update,
        onToggle: self => { if (!self.isActive) $$('video', track).forEach(v => v.pause()); else { current = -1; update(); } },
      },
    });

    if (!motion) return;
    const tl = scrubTimeline(section, 'top 85%', 'top 10%');
    fadeUp(tl, $('.notes-head .experience'), 0);
    $$('.notes-title .line').forEach((line, i) => assemble(tl, splitChars(line), 0.1 + i * 0.12));
    drawStroke(tl, $('.ring-link--main .marker-stroke'), 0.45, 0.2);
    tl.fromTo(items, { opacity: 0, x: () => 4 * remPx() }, { opacity: 1, x: 0, ease: 'none', duration: 0.25, stagger: 0.05 }, 0.2);
    fadeUp(tl, $$('.timeline li'), 0.6, 0.2, 0.05);
    drawStroke(tl, $('.ring-link--more .marker-stroke'), 0.8, 0.2);
  }

  /* ------------------------------------------------------------------------
     People: photographs orbit on a flattened ring, driven by time + scroll
     ------------------------------------------------------------------------ */

  let orbitScroll = 0;

  function initOrbitLoop() {
    const orbit = $('.people-orbit');
    const cards = $$('.people-card');
    const items = $$('.people-list li');
    let spin = 0;
    let visible = false;
    let front = -1;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(orbit);

    gsap.ticker.add((time, deltaMs) => {
      if (!visible) return;
      if (prefersMotion()) spin += deltaMs * 0.00012;
      const W = orbit.clientWidth;
      const H = orbit.clientHeight;
      const cardW = cards[0].offsetWidth;
      const cardH = cards[0].offsetHeight;
      const radiusX = W * (isWide() ? 0.36 : 0.32);
      const radiusY = H * 0.2;
      let nextFront = 0;
      let frontDepth = -1;
      cards.forEach((card, i) => {
        const angle = spin + orbitScroll + (i * Math.PI * 2) / cards.length;
        const depth = (Math.cos(angle) + 1) / 2;
        const x = W / 2 + Math.sin(angle) * radiusX - cardW / 2;
        const y = H * 0.42 + Math.cos(angle) * radiusY - cardH / 2;
        card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(0.55 + 0.45 * depth).toFixed(3)}) rotate(${(Math.sin(angle) * -6).toFixed(2)}deg)`;
        card.style.zIndex = Math.round(depth * 100);
        card.style.filter = `brightness(${(0.4 + 0.6 * depth).toFixed(3)})`;
        if (depth > frontDepth) { frontDepth = depth; nextFront = i; }
      });
      if (nextFront !== front) {
        front = nextFront;
        items.forEach((item, i) => item.classList.toggle('is-active', i === front));
      }
    });
  }

  function initPeople(motion) {
    ScrollTrigger.create({
      trigger: '.people-orbit',
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: self => { orbitScroll = self.progress * Math.PI * 1.5; },
    });
    if (!motion) return;
    const tl = scrubTimeline('.people-head', 'top 90%', 'top 35%');
    revealHeading(tl, $('.people-heading'), 0);
    fadeUp(tl, ['.people-subheading', '.people-credits'], 0.6, 0.2, 0.08);
  }

  /* ------------------------------------------------------------------------
     Transition + contact
     ------------------------------------------------------------------------ */

  function initTransition(motion) {
    if (!motion) return;
    const tl = scrubTimeline('#transition', 'top 90%', 'top 20%');
    $$('.transition-copy .line').forEach((line, i) => assemble(tl, splitChars(line), 0.1 + i * 0.24));
  }

  let contactActive = false;

  function initContact(motion) {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: '#contact', start: 'top bottom', end: 'top top', scrub: 0.5 },
    });
    tl.fromTo('.contact-field', { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: 0.4 }, 0);
    if (motion) {
      tl.fromTo('.contact-grid', { rotationX: 35, scale: 1.3, yPercent: 20 }, { rotationX: 0, scale: 1, yPercent: 0, ease: 'none', duration: 1 }, 0);
      revealHeading(tl, $('.contact-heading'), 0.45);
      fadeUp(tl, $$('.contact-action > *'), 0.8, 0.15, 0.05);
      fadeUp(tl, ['.contact-drag', '.contact-top'], 0.85, 0.15, 0.05);
    }

    ScrollTrigger.create({
      trigger: '#contact',
      start: 'top bottom',
      end: 'bottom top',
      onToggle: self => { contactActive = self.isActive; },
    });
  }

  // Endless, draggable wall of photographs behind the contact card.
  function initContactGrid() {
    const section = $('#contact');
    const grid = $('.contact-grid');
    const sources = ['team', 'canopy', 'greenhouse', 'growers', 'consultation', 'field-portrait', 'facility-visit', 'purple-visit', 'portrait']
      .map(name => `assets/${name}.webp`).concat('assets/purple-room.jpg');
    let tiles = [];
    let step = 0;
    let cols = 0;
    let rows = 0;
    let offsetX = 0;
    let offsetY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let drag = null;

    function build() {
      const r = remPx();
      const size = (isWide() ? 13 : 16) * r;
      step = size + 0.5 * r;
      cols = Math.ceil(innerWidth / step) + 2;
      rows = Math.ceil(innerHeight / step) + 2;
      const fragment = document.createDocumentFragment();
      tiles = [];
      for (let i = 0; i < cols * rows; i++) {
        const tile = document.createElement('div');
        tile.className = 'contact-tile';
        tile.style.width = tile.style.height = `${size}px`;
        const img = document.createElement('img');
        img.src = sources[(i * 7 + Math.floor(i / cols) * 3) % sources.length];
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        tile.append(img);
        fragment.append(tile);
        tiles.push(tile);
      }
      grid.replaceChildren(fragment);
    }

    function render() {
      const w = cols * step;
      const h = rows * step;
      tiles.forEach((tile, i) => {
        const x = ((((i % cols) * step + offsetX) % w) + w) % w - step;
        const y = (((Math.floor(i / cols) * step + offsetY) % h) + h) % h - step;
        tile.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      });
    }

    build();
    render();
    addEventListener('resize', debounce(() => { build(); render(); }, 200));

    section.addEventListener('pointerdown', e => {
      if (e.target.closest('a, button')) return;
      drag = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, touch: e.pointerType !== 'mouse' };
      section.classList.add('is-dragging');
    });
    addEventListener('pointermove', e => {
      if (!drag) return;
      velocityX = e.clientX - drag.lastX;
      velocityY = drag.touch ? 0 : e.clientY - drag.lastY;
      offsetX += velocityX;
      offsetY += velocityY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    }, { passive: true });
    const release = () => { drag = null; section.classList.remove('is-dragging'); };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);

    gsap.ticker.add(() => {
      if (!contactActive) return;
      if (!drag) {
        offsetX += velocityX + (prefersMotion() ? 0.25 : 0);
        offsetY += velocityY + (prefersMotion() ? 0.12 : 0);
        velocityX *= 0.94;
        velocityY *= 0.94;
      }
      render();
    });
  }

  /* ------------------------------------------------------------------------
     Section tracking: nav state, progress
     ------------------------------------------------------------------------ */

  const navLinks = $$('.header-nav a');

  function initSectionTracking() {
    const sectionData = $('#data-s');

    const setActive = sectionName => {
      sectionData.textContent = `s:${sectionName}`;
      navLinks.forEach(link => {
        const match = $(link.getAttribute('href'))?.dataset.name === sectionName;
        link.classList.toggle('is-active', match);
        if (match) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      });
    };

    // The active section is the last one whose top has passed mid-screen.
    // These triggers only serve as auto-refreshed start positions.
    const markers = $$('main [data-name]').map(section => ScrollTrigger.create({ trigger: section, start: 'top 50%' }));
    let activeName = '';
    const pickActive = scroll => {
      const current = markers.filter(marker => marker.start <= scroll).pop();
      const name = current ? current.trigger.dataset.name : 'Introduce';
      if (name !== activeName) { activeName = name; setActive(name); }
    };

    const progress = $('#data-p');
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: self => {
        progress.textContent = `p:${pad(Math.round(self.progress * 100), 3)}%`;
        header.style.setProperty('--progress', self.progress.toFixed(4));
        pickActive(self.scroll());
      },
      onRefresh: self => pickActive(self.scroll()),
    });
    pickActive(scrollY);
  }

  /* ------------------------------------------------------------------------
     Navigation, mobile menu, lightbox
     ------------------------------------------------------------------------ */

  function initNavigation() {
    const toggle = $('.menu-toggle');
    const menu = $('.header-menu');
    const setMenu = open => {
      menu.classList.toggle('is-open', open);
      header.classList.toggle('is-menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      $('.menu-toggle-label').textContent = open ? 'Close' : 'Menu';
      document.body.style.overflow = open ? 'hidden' : '';
      smoother?.paused(open);
    };
    toggle.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });

    document.addEventListener('click', e => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const target = $(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      setMenu(false);
      if (smoother) {
        smoother.scrollTo(target.id === 'hero' ? 0 : smoother.offset(target, 'top top'), prefersMotion());
        return;
      }
      const top = target.id === 'hero' ? 0 : target.getBoundingClientRect().top + scrollY;
      scrollTo({ top, behavior: prefersMotion() ? 'smooth' : 'auto' });
    });
  }

  function initLightbox() {
    const dialog = $('.lightbox');
    const media = $('.lightbox-media');

    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-image], [data-video]');
      if (!trigger) return;
      if (trigger.dataset.video) {
        const video = document.createElement('video');
        video.src = trigger.dataset.video;
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        media.replaceChildren(video);
      } else {
        const img = document.createElement('img');
        img.src = trigger.dataset.image;
        img.alt = $('img', trigger)?.alt ?? '';
        media.replaceChildren(img);
      }
      dialog.showModal();
    });
    $('.lightbox-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => media.replaceChildren());
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  const preloaderDone = runPreloader();

  document.fonts.ready.then(() => {
    initRulers();
    initTaglines();
    initNavigation();
    initLightbox();
    initCurveGallery();
    initOrbitLoop();
    initContactGrid();
    syncHeroVideo();

    gsap.matchMedia().add({ wide: WIDE, motion: MOTION }, context => {
      const { wide, motion } = context.conditions;
      const cleanupFlip = wide && motion ? initHeroFlip() : initStaticHero(motion);
      if (motion) initExpertise();
      initPortfolio(motion);
      initNotes(motion);
      initPeople(motion);
      initTransition(motion);
      initContact(motion);
      initSectionTracking();

      return () => {
        cleanupFlip?.();
        root.classList.remove('has-flip', 'static-hero');
        header.classList.remove('is-docked', 'is-hero');
        setHeroVideoVisible(true);
      };
    });

    preloaderDone.then(() => ScrollTrigger.refresh());
  });
})();
