import { findActiveIndex } from './lrc.js';

export class LyricsView {
  constructor({ listEl, viewportEl, emptyStateEl, onLineClick }) {
    this.listEl = listEl;
    this.viewportEl = viewportEl;
    this.emptyStateEl = emptyStateEl;
    this.onLineClick = onLineClick;
    this.lines = [];
    this.activeIndex = -1;
    this.lineEls = [];
    this.userScrolling = false;
    this.userScrollTimeout = null;

    this.viewportEl.addEventListener('scroll', () => {
      this.userScrolling = true;
      clearTimeout(this.userScrollTimeout);
      this.userScrollTimeout = setTimeout(() => { this.userScrolling = false; }, 2200);
    }, { passive: true });
  }

  setLines(lines) {
    this.lines = lines || [];
    this.activeIndex = -1;
    this.render();
  }

  render() {
    this.listEl.innerHTML = '';
    this.lineEls = [];

    if (!this.lines.length) {
      this.listEl.appendChild(this.emptyStateEl);
      this.emptyStateEl.hidden = false;
      return;
    }
    this.emptyStateEl.hidden = true;

    this.lines.forEach((line, i) => {
      const div = document.createElement('div');
      div.className = 'lyrics-line';
      div.textContent = line.text;
      div.tabIndex = 0;
      div.dataset.index = String(i);
      div.addEventListener('click', () => this.onLineClick && this.onLineClick(line, i));
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onLineClick && this.onLineClick(line, i); }
      });
      this.listEl.appendChild(div);
      this.lineEls.push(div);
    });
  }

  updateActive(currentTime) {
    if (!this.lines.length) return;
    const idx = findActiveIndex(this.lines, currentTime);
    if (idx === this.activeIndex) return;
    this.setActiveIndex(idx);
  }

  setActiveIndex(idx) {
    if (this.lineEls[this.activeIndex]) {
      this.lineEls[this.activeIndex].classList.remove('is-active', 'is-near');
    }
    this.activeIndex = idx;
    const el = this.lineEls[idx];
    if (el) {
      el.classList.add('is-active');
      const prev = this.lineEls[idx - 1];
      const next = this.lineEls[idx + 1];
      if (prev) prev.classList.add('is-near');
      if (next) next.classList.add('is-near');
      if (!this.userScrolling) this.scrollToCenter(el);
    }
  }

  scrollToCenter(el) {
    const viewportRect = this.viewportEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offset = (elRect.top + elRect.height / 2) - (viewportRect.top + viewportRect.height / 2);
    const target = this.viewportEl.scrollTop + offset;
    this.animateScrollTo(target);
  }

  // Custom eased scroll: browsers' native `behavior: 'smooth'` uses inconsistent
  // easing/duration across engines, so we drive it ourselves for a uniform,
  // buttery feel that also respects the animation-speed setting.
  animateScrollTo(target) {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { this.viewportEl.scrollTop = target; return; }

    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);

    const speed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anim-speed')) || 1;
    const duration = Math.max(220, 520 / speed);
    const start = this.viewportEl.scrollTop;
    const delta = target - start;
    if (Math.abs(delta) < 1) return;
    const startTime = performance.now();

    // ease-out-expo-ish curve, matches the CSS --ease token's feel
    const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      this.viewportEl.scrollTop = start + delta * easeOutExpo(t);
      if (t < 1) {
        this._scrollRaf = requestAnimationFrame(step);
      } else {
        this._scrollRaf = null;
      }
    };
    this._scrollRaf = requestAnimationFrame(step);
  }

  highlightForSync(idx) {
    this.lineEls.forEach(el => el.classList.remove('is-active', 'is-near'));
    const el = this.lineEls[idx];
    if (el) {
      el.classList.add('is-active');
      this.scrollToCenter(el);
    }
  }
}

export class BackgroundView {
  constructor({ imageEl }) {
    this.imageEl = imageEl;
    this.currentUrl = null;
  }
  setCover(objectUrl) {
    if (this.currentUrl && this.currentUrl.startsWith('blob:')) {
      // caller manages revocation of previous URL to avoid killing an in-use one
    }
    this.currentUrl = objectUrl;
    if (objectUrl) {
      this.imageEl.style.backgroundImage = `url(${objectUrl})`;
      this.imageEl.classList.add('active');
    } else {
      this.imageEl.classList.remove('active');
      this.imageEl.style.backgroundImage = '';
    }
  }
}
