const section = document.querySelector(".cinema-scroll");
const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const sightsTrack = document.querySelector(".sights-track");
const sightsControls = document.querySelector(".sights-controls");
const sightPrev = document.querySelector(".sight-prev");
const sightNext = document.querySelector(".sight-next");
const originalSightCards = Array.from(document.querySelectorAll(".sight-card"));

let targetMouseX = 0;
let targetMouseY = 0;
let mouseX = 0;
let mouseY = 0;
let targetScroll = 0;
let smoothScroll = 0;
let prevSmoothScroll = 0;
let grainLevel = 0;
let initialized = false;
let rafPending = false;
let lastFrameTime = 0;
let sightCards = [];
const originalSightCount = originalSightCards.length;
let activeSight = originalSightCount;

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// Visite guidée : chaque chapitre photo occupe ~1300px de scroll (a-b entrée, c-d sortie).
// side: +1 = image à droite (texte à gauche), -1 = image à gauche. Entrées et sorties
// latérales opposées, en écho aux cadres du hero qui s'écartent.
// Les plages se chevauchent (~150px de scroll) : la plaque sortante glisse d'un côté
// pendant que la suivante entre du côté opposé — crossfade croisé, jamais d'écran vide.
const photoChapters = [
  { el: document.querySelector(".photo-chapter-saone"), panel: document.querySelector("#fourviere"), side: 1, a: 560, b: 900, c: 1450, d: 1800 },
  { el: document.querySelector(".photo-chapter-vieuxlyon"), panel: document.querySelector("#oldtown"), side: -1, a: 1650, b: 2000, c: 2550, d: 2900 },
  { el: document.querySelector(".photo-chapter-basilique"), panel: document.querySelector("#basilique"), side: 1, a: 2750, b: 3100, c: 3650, d: 4000 },
  { el: document.querySelector(".photo-chapter-theatre"), panel: document.querySelector("#theatres"), side: -1, a: 3850, b: 4200, c: 4750, d: 5100 },
  { el: document.querySelector(".photo-chapter-bellecour"), panel: document.querySelector("#bellecour"), side: 1, a: 4950, b: 5300, c: 5850, d: 6200 },
  { el: document.querySelector(".photo-chapter-confluences"), panel: document.querySelector("#confluences"), side: -1, a: 6050, b: 6400, c: 6950, d: 7300, zoomThrough: true },
];
// Les vidéos ne sont activées que sur grand écran : ailleurs, les posters suffisent.
const allowVideo = window.matchMedia("(min-width: 900px)").matches;

photoChapters.forEach((ch) => {
  ch.nightImg = ch.el.querySelector(".night-img");
  ch.nightVideo = ch.nightImg && ch.nightImg.tagName === "VIDEO" ? ch.nightImg : null;
  ch.video = ch.el.querySelector("video:not(.night-img)");
  ch.img = ch.video || ch.el.querySelector("img:not(.night-img)");
  ch.mediaEls = [ch.img, ch.nightImg].filter(Boolean);
  ch.h2 = ch.panel.querySelector("h2");
  // Numéro géant en fond de panneau
  const step = ch.panel.querySelector(".chapter-step");
  const num = document.createElement("span");
  num.className = "panel-num";
  num.setAttribute("aria-hidden", "true");
  num.textContent = step.textContent.slice(0, 2);
  ch.panel.prepend(num);
});

// Titres révélés mot à mot (reconstruits à chaque changement de langue)
function splitTitles() {
  photoChapters.forEach((ch) => {
    const words = ch.h2.textContent.trim().split(/\s+/);
    ch.h2.innerHTML = "";
    words.forEach((word, i) => {
      const outer = document.createElement("span");
      outer.className = "w";
      const inner = document.createElement("span");
      inner.className = "wi";
      inner.textContent = word;
      inner.style.setProperty("--wd", `${i * 55}ms`);
      outer.append(inner);
      ch.h2.append(outer, document.createTextNode(" "));
    });
  });
}
splitTitles();

const trabouleGallery = document.querySelector(".traboule-gallery");
const trabouleTrack = document.querySelector(".traboule-track");
const siteHeader = document.querySelector(".site-header");
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const scrollProgress = document.querySelector(".scroll-progress");
const siteFooter = document.querySelector(".site-footer");
const footerWatermark = document.querySelector(".footer-watermark");
let cardParallaxUntil = 0;

// Parallaxe interne des photos du slider : chaque image glisse selon la
// position de sa carte à l'écran.
function updateCardParallax() {
  if (!sightCards.length) return;
  const vw = window.innerWidth;
  sightCards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    if (rect.right < -80 || rect.left > vw + 80) return;
    const rel = (rect.left + rect.width / 2 - vw / 2) / vw;
    const photo = card.querySelector(".sight-photo");
    if (photo) photo.style.transform = `translateX(${(rel * -34).toFixed(1)}px) scale(1.14)`;
  });
}

// Lettres du titre héros, écartées vers l'extérieur à la sortie de l'intro
const heroTitle = document.querySelector(".hero-title");
const heroLetters = Array.from(heroTitle.textContent.trim()).map((chr) => {
  const span = document.createElement("span");
  span.className = "hero-letter";
  span.textContent = chr;
  return span;
});
heroTitle.replaceChildren(...heroLetters);
const letterSpread = heroLetters.map((_, i) => (i - (heroLetters.length - 1) / 2) / ((heroLetters.length - 1) / 2));

// Compteurs animés des chiffres clés
const factCounters = [];
photoChapters.forEach((ch) => {
  ch.panel.querySelectorAll(".facts dt").forEach((dt) => {
    const text = dt.textContent.trim();
    const target = parseInt(text.replace(/\s/g, ""), 10);
    if (!Number.isFinite(target)) return;
    factCounters.push({
      ch, dt, target, text,
      start: target > 100 ? target - 120 : 0,
      grouped: /\s/.test(text),
      begun: 0,
      done: false,
    });
  });
});
const formatFact = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const tourQuotes = [
  { el: document.querySelector(".tour-quote-1"), center: 2825, span: 620 },
  { el: document.querySelector(".tour-quote-2"), center: 6125, span: 620 },
];

const tourRail = document.querySelector(".tour-rail");
const railButtons = Array.from(tourRail.querySelectorAll("button"));
const mapMarker = document.querySelector(".map-marker");
const mapDots = Array.from(document.querySelectorAll(".map-dot"));
const mapPoints = mapDots.map((d) => [Number(d.getAttribute("cx")), Number(d.getAttribute("cy"))]);
const sightsSlider = document.querySelector(".sights-slider");

const smoothstep = (e0, e1, v) => {
  const x = clamp((v - e0) / (e1 - e0));
  return x * x * (3 - 2 * x);
};

const lerp = (a, b, t) => a + (b - a) * t;

const segmentInOut = (s, a, b, c, d) => {
  const enter = smoothstep(a, b, s);
  const exit = smoothstep(c, d, s);
  return { enter, exit, active: enter * (1 - exit) };
};

const getScrollDistance = () => clamp(
  -section.getBoundingClientRect().top,
  0,
  section.offsetHeight - window.innerHeight,
);

function updateSightSlider() {
  if (!sightCards.length) return;

  const cardWidth = sightCards[0].offsetWidth;
  const gap = parseFloat(getComputedStyle(sightsTrack).columnGap || "0");
  root.style.setProperty("--sights-shift", `${-(cardWidth + gap) * activeSight}px`);

  sightCards.forEach((card, index) => {
    card.classList.toggle("is-active", index === activeSight);
  });

  // La transition du track dure 640ms : on garde la parallaxe vivante pendant.
  cardParallaxUntil = performance.now() + 750;
  requestTick();
}

function jumpSightSlider(index) {
  sightsTrack.classList.add("is-jumping");
  activeSight = index;
  updateSightSlider();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sightsTrack.classList.remove("is-jumping");
    });
  });
}

function normalizeSightSlider() {
  if (activeSight >= originalSightCount * 2) {
    jumpSightSlider(activeSight - originalSightCount);
  } else if (activeSight < originalSightCount) {
    jumpSightSlider(activeSight + originalSightCount);
  }
}

function moveSightSlider(direction) {
  activeSight = clamp(activeSight + direction, 0, sightCards.length - 1);
  updateSightSlider();
}

function selectSightCard(card) {
  const nextSight = Number(card.dataset.sightIndex);
  if (!Number.isFinite(nextSight)) return;

  activeSight = nextSight;
  updateSightSlider();
}

function setupSightSlider() {
  sightsTrack.replaceChildren();

  for (let setIndex = 0; setIndex < 3; setIndex += 1) {
    originalSightCards.forEach((card, cardIndex) => {
      const clone = card.cloneNode(true);
      clone.dataset.sightIndex = setIndex * originalSightCount + cardIndex;
      clone.style.setProperty("--stagger", `${cardIndex * 70}ms`);
      sightsTrack.append(clone);
    });
  }

  sightCards = Array.from(sightsTrack.querySelectorAll(".sight-card"));
  activeSight = originalSightCount;

  sightCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (dragMoved) return;
      selectSightCard(card);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectSightCard(card);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSightSlider(event.key === "ArrowLeft" ? -1 : 1);
      }
    });
  });

  sightsTrack.addEventListener("transitionend", normalizeSightSlider);
  updateSightSlider();
}

function update(frameTime) {
  rafPending = false;
  targetScroll = getScrollDistance();
  const frameDelta = lastFrameTime
    ? Math.min(40, frameTime - lastFrameTime)
    : 1000 / 60;
  const frameRatio = frameDelta / (1000 / 60);
  const scrollEase = 1 - Math.pow(1 - 0.085, frameRatio);
  const pointerEase = 1 - Math.pow(1 - 0.1, frameRatio);
  lastFrameTime = frameTime;

  if (!initialized || reduceMotion.matches) {
    smoothScroll = targetScroll;
    initialized = true;
  } else {
    smoothScroll = lerp(smoothScroll, targetScroll, scrollEase);
  }

  if (Math.abs(smoothScroll - targetScroll) < 0.08) smoothScroll = targetScroll;

  if (reduceMotion.matches) {
    mouseX = 0;
    mouseY = 0;
  } else {
    mouseX = lerp(mouseX, targetMouseX, pointerEase);
    mouseY = lerp(mouseY, targetMouseY, pointerEase);
  }

  const frame2 = segmentInOut(smoothScroll, 560, 900, 1450, 1800);
  const frame3 = segmentInOut(smoothScroll, 1650, 2000, 2550, 2900);
  const progress = clamp(smoothScroll / 2700);
  const introExit = smoothstep(90, 650, smoothScroll);
  const sightsEnterRaw = smoothstep(9300, 10100, smoothScroll);
  const sightsEnter = Math.pow(sightsEnterRaw, 1.55);
  const sightsControlsEnter = smoothstep(9900, 10200, smoothScroll);
  // Flou de fond constant du premier chapitre à la fin de la galerie — il ne
  // « respire » pas pendant les crossfades entre chapitres.
  const tourBlur = smoothstep(560, 900, smoothScroll) * (1 - smoothstep(9000, 9250, smoothScroll));
  const blurActive = tourBlur;
  const splitDrift = Math.pow(frame2.enter, 1.2);
  const splitFade = smoothstep(640, 900, smoothScroll);
  const backScale = 0.76 + progress * 0.2 + frame2.enter * 0.18 + frame3.enter * 0.16;
  const sharedHeroY = progress * -74;
  const sharedHeroScale = progress * 0.23;
  const sightsScreenTop = Math.min(220, Math.max(112, window.innerHeight * 0.19)) - 50;
  const sightsParentTop = window.innerHeight - (window.innerHeight - sightsScreenTop) / backScale;

  root.style.setProperty("--mx", (reduceMotion.matches ? 0 : mouseX).toFixed(4));
  root.style.setProperty("--my", (reduceMotion.matches ? 0 : mouseY).toFixed(4));

  root.style.setProperty("--back-opacity", (1 - frame2.active * 0.06).toFixed(4));
  root.style.setProperty("--back-x", `${(mouseX * -12).toFixed(2)}px`);
  root.style.setProperty("--back-y", `${(mouseY * -4).toFixed(2)}px`);
  root.style.setProperty("--back-scale", backScale.toFixed(4));
  root.style.setProperty("--four-y", `${(10 + progress * 10).toFixed(2)}vh`);
  root.style.setProperty("--four-scale", (0.78 + progress * 0.16).toFixed(4));
  root.style.setProperty("--bazaar-y", `${(20 - progress * 8).toFixed(2)}vh`);
  root.style.setProperty("--blur-px", `${(blurActive * 5).toFixed(2)}px`);
  root.style.setProperty("--back-brightness", (1 - blurActive * 0.255).toFixed(4));
  root.style.setProperty("--bazaar-blur-px", `${(tourBlur * 4).toFixed(2)}px`);
  root.style.setProperty("--bazaar-brightness", (1 - tourBlur * 0.24).toFixed(4));
  root.style.setProperty("--bazaar-saturation", (1 + frame3.active * 0.18).toFixed(4));
  root.style.setProperty("--shade-opacity", "1");
  root.style.setProperty("--shade-z", tourBlur > 0.02 ? "2" : "0");
  root.style.setProperty("--shade-top-alpha", (blurActive * 0.465).toFixed(4));
  root.style.setProperty("--shade-mid-alpha", (blurActive * 0.42).toFixed(4));
  root.style.setProperty("--shade-bottom-alpha", (blurActive * 0.51).toFixed(4));

  root.style.setProperty("--title-y", `${(introExit * -210).toFixed(2)}px`);
  root.style.setProperty("--title-scale", (1 - introExit * 0.08).toFixed(4));
  root.style.setProperty("--title-opacity", (1 - introExit).toFixed(4));

  heroLetters.forEach((el, i) => {
    el.style.transform = `translate3d(${(letterSpread[i] * introExit * 170).toFixed(2)}px, ${(Math.abs(letterSpread[i]) * introExit * -46).toFixed(2)}px, 0) rotate(${(letterSpread[i] * introExit * 6).toFixed(2)}deg)`;
  });

  root.style.setProperty("--split-left-x", `calc(-50% + ${(-10 - splitDrift * 42).toFixed(2)}vw + ${(mouseX * 22).toFixed(2)}px)`);
  root.style.setProperty("--split-left-y", `${(mouseY * 10 + sharedHeroY - splitDrift * 180).toFixed(2)}px`);
  root.style.setProperty("--split-left-scale", (1 + sharedHeroScale + frame2.enter * 0.5).toFixed(4));
  root.style.setProperty("--split-right-x", `calc(-50% + ${(10 + splitDrift * 42).toFixed(2)}vw + ${(mouseX * 22).toFixed(2)}px)`);
  root.style.setProperty("--split-right-y", `${(mouseY * 10 + sharedHeroY - splitDrift * 180).toFixed(2)}px`);
  root.style.setProperty("--split-right-scale", (1 + sharedHeroScale + frame2.enter * 0.5).toFixed(4));
  root.style.setProperty("--split-opacity", (1 - splitFade).toFixed(4));

  root.style.setProperty("--intro-copy-y", `${(introExit * 90).toFixed(2)}px`);
  root.style.setProperty("--intro-copy-opacity", (1 - introExit).toFixed(4));

  let countersRunning = false;
  photoChapters.forEach((ch) => {
    const seg = segmentInOut(smoothScroll, ch.a, ch.b, ch.c, ch.d);
    ch.seg = seg;
    // Ken Burns continu sur toute la durée du chapitre
    const holdP = clamp((smoothScroll - ch.a) / (ch.d - ch.a));
    let scale = 1.09 - holdP * 0.06;
    let exitSlide = seg.exit * 160;
    if (ch.zoomThrough) {
      // Dernier chapitre : on plonge à travers l'image au lieu de la faire glisser
      scale += seg.exit * 0.55;
      exitSlide = 0;
    }
    const imgX = ch.side * ((1 - seg.enter) * 120 + exitSlide + mouseX * 10);
    const panelX = -ch.side * ((1 - seg.enter) * 70 + seg.exit * 110);
    const mediaTransform = `translate3d(${imgX.toFixed(2)}px, -50%, 0) scale(${scale.toFixed(4)})`;
    ch.el.style.opacity = seg.active.toFixed(4);
    ch.mediaEls.forEach((m) => { m.style.transform = mediaTransform; });
    ch.panel.style.opacity = (seg.active * (1 - seg.exit)).toFixed(4);
    ch.panel.style.transform = `translate3d(${panelX.toFixed(2)}px, -50%, 0)`;
    ch.panel.classList.toggle("is-revealed", seg.enter > 0.35 && seg.active > 0.02);
    if (ch.video) {
      const wantPlay = allowVideo && !nightMode && seg.active > 0.02 && ch.video.src;
      if (wantPlay && ch.video.paused) ch.video.play().catch(() => {});
      else if (!wantPlay && !ch.video.paused) ch.video.pause();
    }
    if (ch.nightVideo) {
      const wantNight = allowVideo && nightMode && seg.active > 0.02 && ch.nightVideo.src;
      if (wantNight && ch.nightVideo.paused) ch.nightVideo.play().catch(() => {});
      else if (!wantNight && !ch.nightVideo.paused) ch.nightVideo.pause();
    }
  });

  // Galerie horizontale des traboules
  const gallerySeg = segmentInOut(smoothScroll, 7350, 7600, 9050, 9250);
  trabouleGallery.style.opacity = gallerySeg.active.toFixed(4);
  const galleryProgress = smoothstep(7450, 9050, smoothScroll);
  const galleryMax = Math.max(0, trabouleTrack.scrollWidth - window.innerWidth * 0.92);
  const galleryX = window.innerWidth * 0.06 - galleryProgress * galleryMax;
  trabouleTrack.style.transform = `translate3d(${galleryX.toFixed(1)}px, -50%, 0)`;

  // Le grain de pellicule s'intensifie avec la vitesse de scroll
  grainLevel = lerp(grainLevel, clamp(Math.abs(smoothScroll - prevSmoothScroll) / 30), 0.12);
  prevSmoothScroll = smoothScroll;
  root.style.setProperty("--grain-opacity", (0.05 + grainLevel * 0.1).toFixed(4));

  root.style.setProperty("--num-x", `${(mouseX * 26).toFixed(1)}px`);
  root.style.setProperty("--num-y", `${(mouseY * 18).toFixed(1)}px`);

  factCounters.forEach((c) => {
    const active = c.ch.seg.active;
    if (!c.begun && active > 0.35) c.begun = frameTime;
    if (c.begun && !c.done) {
      const p = clamp((frameTime - c.begun) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(c.start + (c.target - c.start) * eased);
      c.dt.textContent = c.grouped ? formatFact(value) : String(value);
      if (p >= 1) c.done = true;
      else countersRunning = true;
    }
    if (c.begun && active < 0.02) {
      c.begun = 0;
      c.done = false;
      c.dt.textContent = c.text;
    }
  });

  const dusk = smoothstep(1500, 6600, smoothScroll) * (1 - sightsEnter) * 0.85;
  root.style.setProperty("--dusk", dusk.toFixed(4));

  tourQuotes.forEach((q) => {
    const t = (smoothScroll - q.center) / q.span;
    if (Math.abs(t) >= 1) {
      q.el.style.opacity = "0";
      return;
    }
    q.el.style.opacity = Math.pow(1 - Math.abs(t), 1.4).toFixed(4);
    q.el.style.transform = `translate3d(calc(-50% + ${(-t * 38).toFixed(2)}vw), -50%, 0)`;
  });

  const railOpacity = smoothstep(420, 700, smoothScroll) * (1 - smoothstep(7350, 7700, smoothScroll));
  root.style.setProperty("--rail-opacity", railOpacity.toFixed(4));
  tourRail.classList.toggle("is-visible", railOpacity > 0.5);
  let railActive = 0;
  railButtons.forEach((b, i) => {
    if (smoothScroll >= anchorTargets[b.dataset.target] - 520) railActive = i;
  });
  railButtons.forEach((b, i) => {
    b.classList.toggle("is-active", i === railActive && railOpacity > 0.05);
  });

  const railAnchors = railButtons.map((b) => anchorTargets[b.dataset.target]);
  let mx = mapPoints[0][0];
  let my = mapPoints[0][1];
  if (smoothScroll >= railAnchors[railAnchors.length - 1]) {
    [mx, my] = mapPoints[mapPoints.length - 1];
  } else if (smoothScroll > railAnchors[0]) {
    for (let i = 0; i < railAnchors.length - 1; i += 1) {
      if (smoothScroll >= railAnchors[i] && smoothScroll < railAnchors[i + 1]) {
        const f = (smoothScroll - railAnchors[i]) / (railAnchors[i + 1] - railAnchors[i]);
        mx = lerp(mapPoints[i][0], mapPoints[i + 1][0], f);
        my = lerp(mapPoints[i][1], mapPoints[i + 1][1], f);
        break;
      }
    }
  }
  mapMarker.setAttribute("cx", mx.toFixed(1));
  mapMarker.setAttribute("cy", my.toFixed(1));

  if (cursorOn && cursorInit) {
    const ringEase = 1 - Math.pow(1 - 0.22, frameRatio);
    ringX = lerp(ringX, cursorX, ringEase);
    ringY = lerp(ringY, cursorY, ringEase);
    cursorRing.style.transform = `translate3d(${ringX.toFixed(1)}px, ${ringY.toFixed(1)}px, 0)`;
    cursorRing.classList.toggle("has-label", smoothScroll < 260 && !cursorRing.classList.contains("is-link"));
  }

  root.style.setProperty("--sights-controls-opacity", sightsControlsEnter.toFixed(4));
  sightsControls.classList.toggle("is-ready", sightsControlsEnter > 0.98);
  sightsSlider.classList.toggle("is-in", sightsEnterRaw > 0.12);
  root.style.setProperty("--sights-heading-opacity", Math.pow(sightsEnterRaw, 1.2).toFixed(4));
  root.style.setProperty("--sights-heading-y", `${((1 - sightsEnterRaw) * 30).toFixed(1)}px`);
  if (sightsEnterRaw > 0.05 || frameTime < cardParallaxUntil) updateCardParallax();

  siteHeader.classList.toggle("is-scrolled", smoothScroll > 80);
  let currentNav = 0;
  navLinks.forEach((link, i) => {
    if (smoothScroll >= anchorTargets[link.getAttribute("href")] - 520) currentNav = i;
  });
  navLinks.forEach((link, i) => link.classList.toggle("is-current", i === currentNav));
  scrollProgress.style.transform = `scaleX(${(smoothScroll / (section.offsetHeight - window.innerHeight)).toFixed(4)})`;

  const beyond = Math.max(0, window.scrollY - (section.offsetHeight - window.innerHeight));
  footerWatermark.style.transform = `translateX(-50%) translateY(${(-beyond * 0.16).toFixed(1)}px)`;
  root.style.setProperty("--sights-visibility", sightsEnter > 0.01 ? "visible" : "hidden");
  root.style.setProperty("--sights-y", "0px");
  root.style.setProperty("--sights-enter-x", `${((1 - sightsEnter) * 420).toFixed(2)}vw`);
  root.style.setProperty("--sights-scale", (1 / backScale).toFixed(4));
  root.style.setProperty("--sights-top", `${sightsParentTop.toFixed(2)}px`);
  root.style.setProperty("--sights-screen-top", `${sightsScreenTop.toFixed(2)}px`);

  const shouldContinue = (
    Math.abs(smoothScroll - targetScroll) > 0.08
    || Math.abs(mouseX - targetMouseX) > 0.001
    || Math.abs(mouseY - targetMouseY) > 0.001
    || countersRunning
    || frameTime < cardParallaxUntil
    || (cursorOn && cursorInit && Math.hypot(ringX - cursorX, ringY - cursorY) > 0.4)
  );

  if (shouldContinue) {
    requestTick();
  } else {
    lastFrameTime = 0;
  }
}

function requestTick() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(update);
}

window.addEventListener("scroll", requestTick, { passive: true });
window.addEventListener("resize", () => {
  updateSightSlider();
  requestTick();
});
window.addEventListener("pointermove", (event) => {
  targetMouseX = event.clientX / window.innerWidth - 0.5;
  targetMouseY = event.clientY / window.innerHeight - 0.5;
  requestTick();
}, { passive: true });

sightPrev.addEventListener("click", () => moveSightSlider(-1));
sightNext.addEventListener("click", () => moveSightSlider(1));

// Les ancres pointent vers des éléments absolus dans la scène sticky : on scrolle
// vers l'offset du chapitre dans la chorégraphie plutôt que vers l'élément.
const anchorTargets = {
  "#cinema": 0, "#fourviere": 1175, "#oldtown": 2275, "#basilique": 3375,
  "#theatres": 4475, "#bellecour": 5575, "#confluences": 6675,
  "#traboules": 8250, "#routes": 10300,
};

// Saut instantané : le lerp de smoothScroll dans update() fait le travelling
// cinématique, plus fiable que le smooth scroll natif sur une longue distance.
function scrollToChapter(offset) {
  window.scrollTo({ top: section.offsetTop + offset, behavior: "instant" });
  requestTick();
}

document.querySelectorAll(".site-nav a, .site-logo, .footer-nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    const offset = anchorTargets[link.getAttribute("href")];
    if (offset === undefined) return;
    event.preventDefault();
    scrollToChapter(offset);
  });
});

document.querySelector(".note-button").addEventListener("click", () => {
  scrollToChapter(anchorTargets["#routes"]);
});

document.querySelector(".footer-cta").addEventListener("click", () => {
  scrollToChapter(0);
});

railButtons.forEach((b) => {
  b.addEventListener("click", () => scrollToChapter(anchorTargets[b.dataset.target]));
});
mapDots.forEach((d) => {
  d.addEventListener("click", () => scrollToChapter(anchorTargets[d.dataset.target]));
});

// Curseur personnalisé — desktop à pointeur fin uniquement
const cursorOn = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduceMotion.matches;
const cursorDot = document.querySelector(".cursor-dot");
const cursorRing = document.querySelector(".cursor-ring");
let cursorX = 0;
let cursorY = 0;
let ringX = 0;
let ringY = 0;
let cursorInit = false;
if (cursorOn) {
  document.body.classList.add("has-cursor");
  window.addEventListener("pointermove", (event) => {
    cursorX = event.clientX;
    cursorY = event.clientY;
    if (!cursorInit) {
      ringX = cursorX;
      ringY = cursorY;
      cursorInit = true;
    }
    cursorDot.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
  }, { passive: true });
  document.addEventListener("pointerover", (event) => {
    cursorRing.classList.toggle("is-link", Boolean(event.target.closest("a, button, [role='button']")));
  });
}

// Slider : glisser à la souris ou au doigt, avec inertie
let dragging = false;
let dragMoved = false;
let dragStartX = 0;
let dragLastX = 0;
let dragLastT = 0;
let dragVel = 0;
const cardStride = () => sightCards[0].offsetWidth + parseFloat(getComputedStyle(sightsTrack).columnGap || "0");

sightsTrack.addEventListener("pointerdown", (event) => {
  dragging = true;
  dragMoved = false;
  dragVel = 0;
  dragStartX = dragLastX = event.clientX;
  dragLastT = event.timeStamp;
  sightsTrack.classList.add("is-dragging");
  sightsTrack.setPointerCapture(event.pointerId);
});

sightsTrack.addEventListener("pointermove", (event) => {
  if (dragging) {
    const dx = event.clientX - dragStartX;
    if (Math.abs(dx) > 8) dragMoved = true;
    const dt = event.timeStamp - dragLastT || 16;
    dragVel = (event.clientX - dragLastX) / dt;
    dragLastX = event.clientX;
    dragLastT = event.timeStamp;
    root.style.setProperty("--sights-shift", `${-cardStride() * activeSight + dx}px`);
    return;
  }
  const card = event.target.closest(".sight-card");
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width - 0.5;
  const py = (event.clientY - rect.top) / rect.height - 0.5;
  card.style.setProperty("--ry", `${(px * 10).toFixed(2)}deg`);
  card.style.setProperty("--rx", `${(-py * 8).toFixed(2)}deg`);
});

sightsTrack.addEventListener("pointerout", (event) => {
  const card = event.target.closest(".sight-card");
  if (card) {
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
  }
});

const endDrag = (event) => {
  if (!dragging) return;
  dragging = false;
  sightsTrack.classList.remove("is-dragging");
  const dx = event.clientX - dragStartX;
  activeSight = clamp(activeSight + Math.round(-(dx + dragVel * 180) / cardStride()), 0, sightCards.length - 1);
  updateSightSlider();
};
sightsTrack.addEventListener("pointerup", endDrag);
sightsTrack.addEventListener("pointercancel", endDrag);

// Ambiance sonore synthétisée en Web Audio : rivière (bruit brownien filtré,
// houle lente) + cloche lointaine occasionnelle. Aucun fichier audio.
const soundToggle = document.querySelector(".sound-toggle");
let audioCtx = null;
let ambienceGain = null;

function buildAmbience() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  ambienceGain = audioCtx.createGain();
  ambienceGain.gain.value = 0.0001;
  ambienceGain.connect(audioCtx.destination);

  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 4, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const river = audioCtx.createBufferSource();
  river.buffer = buffer;
  river.loop = true;
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 420;
  const swell = audioCtx.createOscillator();
  swell.frequency.value = 0.07;
  const swellGain = audioCtx.createGain();
  swellGain.gain.value = 140;
  swell.connect(swellGain);
  swellGain.connect(lowpass.frequency);
  river.connect(lowpass);
  lowpass.connect(ambienceGain);
  river.start();
  swell.start();

  const bell = () => {
    const t = audioCtx.currentTime;
    const fundamental = audioCtx.createOscillator();
    fundamental.frequency.value = 392;
    const partial = audioCtx.createOscillator();
    partial.frequency.value = 392 * 2.4;
    const envelope = audioCtx.createGain();
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    const partialGain = audioCtx.createGain();
    partialGain.gain.value = 0.25;
    fundamental.connect(envelope);
    partial.connect(partialGain);
    partialGain.connect(envelope);
    envelope.connect(ambienceGain);
    fundamental.start(t);
    partial.start(t);
    fundamental.stop(t + 6.2);
    partial.stop(t + 6.2);
    setTimeout(bell, 15000 + Math.random() * 20000);
  };
  setTimeout(bell, 7000);
}

soundToggle.addEventListener("click", () => {
  const on = !soundToggle.classList.contains("is-on");
  soundToggle.classList.toggle("is-on", on);
  soundToggle.setAttribute("aria-pressed", String(on));
  if (!audioCtx && on) buildAmbience();
  if (!audioCtx) return;
  if (on) audioCtx.resume();
  ambienceGain.gain.setTargetAtTime(on ? 0.2 : 0.0001, audioCtx.currentTime, 0.6);
});

// Activation des vidéos sur grand écran (les posters restent seuls ailleurs)
if (allowVideo) {
  document.querySelectorAll("video[data-src]").forEach((v) => { v.src = v.dataset.src; });
  const skyVideo = document.querySelector("video.sky-img");
  if (skyVideo) skyVideo.play().catch(() => {});
  const introWordVideo = document.querySelector(".intro-word-video");
  if (introWordVideo) introWordVideo.play().catch(() => {});
}

// Mode nuit : bascule 🌙 / ☀️, images nocturnes + étalonnage sombre de la scène
const nightToggle = document.querySelector(".night-toggle");
let nightMode = false;

function applyNight(on, persist = true) {
  nightMode = on;
  document.body.classList.toggle("is-night", on);
  nightToggle.setAttribute("aria-pressed", String(on));
  if (on) {
    document.querySelectorAll("img.night-img[data-src]").forEach((img) => {
      if (!img.src) img.src = img.dataset.src;
    });
  }
  if (persist) {
    try {
      localStorage.setItem("lyon-night", on ? "1" : "0");
    } catch { /* stockage indisponible */ }
  }
  requestTick();
}

// Le site vit à l'heure de Lyon : nuit automatique quand le soleil y est couché
// (approximation saisonnière des heures de lever/coucher, fuseau Europe/Paris).
function isNightInLyon() {
  const now = new Date();
  const lyon = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const hours = lyon.getHours() + lyon.getMinutes() / 60;
  const dayOfYear = Math.floor((lyon - new Date(lyon.getFullYear(), 0, 0)) / 86400000);
  const season = Math.cos(((dayOfYear - 172) / 365) * 2 * Math.PI); // 1 au solstice d'été
  const sunrise = 7.1 - 1.2 * season;
  const sunset = 19.25 + 2.25 * season;
  return hours < sunrise || hours >= sunset;
}

nightToggle.addEventListener("click", () => applyNight(!nightMode));
try {
  const storedNight = localStorage.getItem("lyon-night");
  if (storedNight === "1") applyNight(true);
  else if (storedNight === null && isNightInLyon()) applyNight(true, false);
} catch { /* stockage indisponible */ }

// Mini-vidéos des cartes au survol
if (allowVideo) {
  sightsTrack.addEventListener("pointerover", (event) => {
    const card = event.target.closest(".sight-card");
    if (!card || card.classList.contains("is-video")) return;
    const video = card.querySelector(".sight-video");
    if (!video) return;
    if (!video.src) video.src = video.dataset.src;
    card.classList.add("is-video");
    video.play().catch(() => {});
  });
  sightsTrack.addEventListener("pointerout", (event) => {
    const card = event.target.closest(".sight-card");
    if (!card || card.contains(event.relatedTarget)) return;
    const video = card.querySelector(".sight-video");
    if (!video) return;
    card.classList.remove("is-video");
    video.pause();
  });
}

// Boutons magnétiques : ils suivent légèrement le curseur à l'approche
if (cursorOn) {
  document.querySelectorAll(".note-button, .footer-cta, .sight-nav, .night-toggle, .sound-toggle").forEach((btn) => {
    btn.addEventListener("pointermove", (event) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--mag-x", `${((event.clientX - r.left - r.width / 2) * 0.3).toFixed(1)}px`);
      btn.style.setProperty("--mag-y", `${((event.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px`);
    });
    btn.addEventListener("pointerleave", () => {
      btn.style.setProperty("--mag-x", "0px");
      btn.style.setProperty("--mag-y", "0px");
    });
  });
}

// Footer : révélation à l'entrée, vidéo dans le titre, horloge de Lyon en direct
const footerTitleVideo = document.querySelector(".footer-title-video");
const footerObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    siteFooter.classList.toggle("is-visible", entry.isIntersecting);
    if (footerTitleVideo && allowVideo) {
      if (entry.isIntersecting) {
        if (!footerTitleVideo.src) footerTitleVideo.src = footerTitleVideo.dataset.src;
        footerTitleVideo.play().catch(() => {});
      } else if (!footerTitleVideo.paused) {
        footerTitleVideo.pause();
      }
    }
    if (entry.isIntersecting) requestTick();
  });
}, { threshold: 0.25 });
footerObserver.observe(siteFooter);

const lyonClock = document.querySelector(".lyon-clock");
const clockFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});
function tickClock() {
  lyonClock.textContent = clockFormat.format(new Date());
}
tickClock();
setInterval(tickClock, 30000);

// Préloader honnête : le rideau ne se lève que quand les visuels du hero sont
// réellement prêts (avec un plancher d'1,6 s et un plafond de 6 s).
const introVeil = document.querySelector(".intro-veil");
const introProgress = document.querySelector(".intro-progress");
let introFinished = false;

const finishIntro = () => {
  if (introFinished) return;
  introFinished = true;
  introVeil.classList.add("is-done");
  setTimeout(() => introVeil.remove(), 1000);
};

if (reduceMotion.matches) {
  introVeil.remove();
} else {
  const introStart = performance.now();
  const loadImage = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = src;
  });
  const tasks = [
    document.fonts.ready,
    loadImage("assets/lyon/sky-lyon.webp"),
    loadImage("assets/lyon/fourviere-hill.webp"),
    loadImage("assets/lyon/split-left.webp"),
    loadImage("assets/lyon/split-right.webp"),
    loadImage("assets/lyon/vieux-lyon-rooftops.webp"),
  ];
  const skyVideoEl = document.querySelector("video.sky-img");
  if (allowVideo && skyVideoEl) {
    tasks.push(new Promise((resolve) => {
      skyVideoEl.addEventListener("canplay", resolve, { once: true });
      setTimeout(resolve, 4000);
    }));
  }
  let loaded = 0;
  let shownProgress = 0;
  tasks.forEach((t) => Promise.resolve(t).then(() => { loaded += 1; }));
  const introTimer = setInterval(() => {
    const target = loaded / tasks.length;
    shownProgress = Math.min(1, shownProgress + (target - shownProgress) * 0.14 + 0.004);
    introProgress.textContent = `${Math.round(shownProgress * 100)}%`;
    const elapsed = performance.now() - introStart;
    if ((shownProgress > 0.995 && elapsed > 1600) || elapsed > 6000) {
      introProgress.textContent = "100%";
      clearInterval(introTimer);
      finishIntro();
    }
  }, 50);
  introVeil.addEventListener("click", () => {
    clearInterval(introTimer);
    finishIntro();
  }, { once: true });
}

const langButton = document.querySelector(".language-switcher");
const langLabel = langButton.querySelector(".lang-label");
const pageTitles = {
  en: "Lyon — A cinematic scroll story",
  fr: "Lyon — Une balade cinématique",
};
let currentLang = "en";
try {
  currentLang = localStorage.getItem("lyon-lang") === "fr" ? "fr" : "en";
} catch { /* stockage indisponible : on reste en anglais */ }

function applyLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.title = pageTitles[lang];
  langLabel.textContent = lang.toUpperCase();
  document.querySelectorAll("[data-fr]").forEach((el) => {
    if (!el.dataset.en) el.dataset.en = el.textContent;
    el.textContent = lang === "fr" ? el.dataset.fr : el.dataset.en;
  });
  splitTitles();
  try {
    localStorage.setItem("lyon-lang", lang);
  } catch { /* stockage indisponible */ }
}

langButton.addEventListener("click", () => {
  applyLanguage(currentLang === "en" ? "fr" : "en");
});

setupSightSlider();
if (currentLang !== "en") applyLanguage(currentLang);
requestTick();
