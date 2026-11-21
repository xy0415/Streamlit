'use strict';

// Letter-by-letter editorial reveal inspired by Moving Letters; the heading's
// accessible name remains whole and the original text survives any failure.
(() => {
  const title = document.querySelector('#viewTitle');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!title || typeof window.anime !== 'function' || !window.MutationObserver) return;
  let lastText = '';
  let currentLetters = [];
  function finish() {
    if (currentLetters.length) window.anime.remove(currentLetters);
    for (const letter of currentLetters) {
      letter.style.opacity = '';
      letter.style.transform = '';
      letter.style.willChange = '';
    }
    currentLetters = [];
  }
  function reveal() {
    const text = title.textContent;
    if (!text || text === lastText) return;
    finish();
    lastText = text;
    title.removeAttribute('aria-label');
    if (motion.matches) return;
    try {
      const segments = typeof Intl.Segmenter === 'function'
        ? Array.from(new Intl.Segmenter('zh-Hant', {granularity:'grapheme'}).segment(text), x => x.segment)
        : Array.from(text);
      const fragment = document.createDocumentFragment();
      const letters = segments.map(char => {
        const el = document.createElement('span');
        el.className = 'fxi-motion-letter';
        el.setAttribute('aria-hidden','true');
        el.textContent = char;
        fragment.append(el);
        return el;
      });
      title.setAttribute('aria-label', text);
      title.replaceChildren(fragment);
      currentLetters = letters;
      window.anime({targets: letters, translateY: [12, 0], opacity: [.15, 1],
        duration: 520, delay: window.anime.stagger(45), easing:'easeOutCubic',
        complete: () => { for (const el of letters) {el.style.transform='';el.style.opacity='';el.style.willChange='';} }
      });
    } catch (error) {
      finish(); title.textContent = text; title.removeAttribute('aria-label');
    }
  }
  new MutationObserver(reveal).observe(title,{childList:true,characterData:true,subtree:true});
  motion.addEventListener('change', () => { if (motion.matches) finish(); });
  reveal();
})();
