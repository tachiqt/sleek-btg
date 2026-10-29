import { prefersReducedMotion, motion } from '../utils/motion.js';

function splitIntoCharacters(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }
  return Array.from(text);
}

function parseTexts(el) {
  const raw = el.getAttribute('data-texts');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return raw
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean);
  }
}

function getStaggerDelay(index, total, staggerFrom, staggerDuration) {
  if (staggerFrom === 'last') return (total - 1 - index) * staggerDuration;
  if (staggerFrom === 'center') {
    const center = Math.floor(total / 2);
    return Math.abs(center - index) * staggerDuration;
  }
  return index * staggerDuration;
}

function buildWordNodes(text) {
  const words = String(text).split(' ');
  return words.map((word, i) => ({
    characters: splitIntoCharacters(word),
    needsSpace: i !== words.length - 1,
  }));
}

function renderActive(layer, text, { staggerFrom, staggerDuration, phase }) {
  layer.replaceChildren();
  layer.className = `text-rotate-active text-rotate-active--${phase}`;
  layer.setAttribute('aria-hidden', 'true');

  const words = buildWordNodes(text);
  const totalChars = words.reduce((sum, w) => sum + w.characters.length, 0);
  let charCursor = 0;

  words.forEach((wordObj) => {
    const wordEl = document.createElement('span');
    wordEl.className = 'text-rotate-word';

    wordObj.characters.forEach((char) => {
      const charEl = document.createElement('span');
      charEl.className = 'text-rotate-element';
      charEl.textContent = char;
      const delay = getStaggerDelay(charCursor, totalChars, staggerFrom, staggerDuration);
      charEl.style.setProperty('--stagger', `${delay}s`);
      wordEl.appendChild(charEl);
      charCursor += 1;
    });

    if (wordObj.needsSpace) {
      const space = document.createElement('span');
      space.className = 'text-rotate-space';
      space.textContent = ' ';
      wordEl.appendChild(space);
    }

    layer.appendChild(wordEl);
  });

  return totalChars;
}

function maxStagger(totalChars, staggerFrom, staggerDuration) {
  if (totalChars <= 1) return 0;
  let max = 0;
  for (let i = 0; i < totalChars; i += 1) {
    max = Math.max(max, getStaggerDelay(i, totalChars, staggerFrom, staggerDuration));
  }
  return max;
}

/**
 * Vanilla port of React Bits <RotatingText /> for the static Sleek.btg site.
 */
export function initRotatingText(root = document) {
  const nodes = [...root.querySelectorAll('[data-rotating-text]')];
  if (!nodes.length) return;

  const cleanups = nodes.map((el) => mountRotatingText(el));

  const onMotionChange = () => {
    cleanups.forEach((fn) => fn?.());
    cleanups.length = 0;
    nodes.forEach((el) => cleanups.push(mountRotatingText(el)));
  };

  motion.addEventListener('change', onMotionChange);
}

function mountRotatingText(el) {
  const texts = parseTexts(el);
  if (!texts.length) return () => {};

  const rotationInterval = Number(el.dataset.interval) || 2800;
  const staggerDuration = Number(el.dataset.stagger) || 0.028;
  const staggerFrom = el.dataset.staggerFrom || 'last';
  const startDelay = Number(el.dataset.startDelay) || 1600;

  let index = 0;
  let timer = null;
  let startTimer = null;
  let swapping = false;

  el.classList.add('text-rotate');
  el.replaceChildren();

  const sr = document.createElement('span');
  sr.className = 'text-rotate-sr-only';
  sr.textContent = texts[0];
  el.appendChild(sr);

  const stage = document.createElement('span');
  stage.className = 'text-rotate-stage';
  el.appendChild(stage);

  const showStatic = (text) => {
    stage.replaceChildren();
    const staticEl = document.createElement('span');
    staticEl.className = 'text-rotate-static';
    staticEl.setAttribute('aria-hidden', 'true');
    staticEl.textContent = text;
    stage.appendChild(staticEl);
    sr.textContent = text;
  };

  if (prefersReducedMotion() || texts.length === 1) {
    showStatic(texts[0]);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(timer);
    };
  }

  const active = document.createElement('span');
  renderActive(active, texts[0], { staggerFrom, staggerDuration, phase: 'settled' });
  stage.appendChild(active);

  const swap = async () => {
    if (swapping) return;
    swapping = true;
    const nextIndex = (index + 1) % texts.length;
    const outgoing = stage.querySelector('.text-rotate-active');

    if (outgoing) {
      outgoing.classList.remove('text-rotate-active--settled', 'text-rotate-active--in');
      outgoing.classList.add('text-rotate-active--out');
      const outChars = outgoing.querySelectorAll('.text-rotate-element').length;
      const outWait =
        420 + maxStagger(outChars, staggerFrom, staggerDuration) * 1000 + 40;
      await new Promise((r) => window.setTimeout(r, outWait));
      outgoing.remove();
    }

    const incoming = document.createElement('span');
    const total = renderActive(incoming, texts[nextIndex], {
      staggerFrom,
      staggerDuration,
      phase: 'in',
    });
    stage.appendChild(incoming);

    index = nextIndex;
    sr.textContent = texts[index];

    const inWait = 520 + maxStagger(total, staggerFrom, staggerDuration) * 1000;
    await new Promise((r) => window.setTimeout(r, inWait));
    incoming.classList.remove('text-rotate-active--in');
    incoming.classList.add('text-rotate-active--settled');
    swapping = false;
  };

  startTimer = window.setTimeout(() => {
    const tick = async () => {
      await swap();
      timer = window.setTimeout(tick, rotationInterval);
    };
    timer = window.setTimeout(tick, rotationInterval);
  }, startDelay);

  return () => {
    window.clearTimeout(startTimer);
    window.clearTimeout(timer);
  };
}
