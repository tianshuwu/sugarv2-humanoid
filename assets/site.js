'use strict';

const gallery = window.SUGAR_MEDIA;
const visible = new Set();
const sources = new Map();
const allVideos = [];
const releaseTimers = new WeakMap();
const hero = document.querySelector('#hero-video');
const mobileHero = matchMedia('(max-width: 640px)');
const posterObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.poster = entry.target.dataset.poster;
    posterObserver.unobserve(entry.target);
  }
}, {rootMargin: '400px 0px'});

function loadVideo(video) {
  const source = video === hero && mobileHero.matches ? hero.dataset.mobileSrc : sources.get(video);
  if (video.dataset.loaded === source) return;
  video.dataset.loaded = source;
  video.src = source;
  video.preload = 'metadata';
  video.load();
}

function syncVideo(video) {
  if (!visible.has(video) || document.hidden) {
    video.pause();
    return;
  }
  video.play().catch(error => {
    if (error.name !== 'AbortError') console.error('Video playback failed:', error);
  });
}

function registerVideo(video, source) {
  allVideos.push(video);
  sources.set(video, source);
  video.addEventListener('loadedmetadata', () => {
    if (video.dataset.resumeTime) video.currentTime = Math.min(Number(video.dataset.resumeTime), video.duration);
    syncVideo(video);
  });
}

hero.dataset.poster = mobileHero.matches ? 'assets/posters/hero-mobile.webp' : 'assets/posters/hero-web.webp';
posterObserver.observe(hero);
registerVideo(hero, hero.dataset.desktopSrc);
mobileHero.addEventListener('change', () => {
  hero.dataset.resumeTime = hero.currentTime;
  hero.dataset.poster = mobileHero.matches ? 'assets/posters/hero-mobile.webp' : 'assets/posters/hero-web.webp';
  hero.poster = hero.dataset.poster;
  if (visible.has(hero)) { loadVideo(hero); syncVideo(hero); }
});

for (const task of document.querySelectorAll('[data-task]')) {
  for (const clip of gallery.filter(item => item.task === task.dataset.task)) {
    const figure = document.createElement('figure');
    figure.className = 'demo';
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.dataset.poster = clip.poster;
    posterObserver.observe(video);
    video.setAttribute('aria-label', `${clip.task}, demonstration ${clip.demo}, three camera views`);
    figure.append(video);
    task.querySelector('.demo-grid').append(figure);
    registerVideo(video, clip.sources['720'].src);
  }
}

for (const video of document.querySelectorAll('video[data-method-src]')) {
  posterObserver.observe(video);
  registerVideo(video, video.dataset.methodSrc);
}

// Visible players load and autoplay; offscreen players release their media.
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const video = entry.target;
    if (entry.isIntersecting) {
      clearTimeout(releaseTimers.get(video));
      visible.add(video);
      loadVideo(video);
      syncVideo(video);
    } else {
      visible.delete(video);
      video.pause();
      releaseTimers.set(video, setTimeout(() => {
        if (visible.has(video) || !video.hasAttribute('src')) return;
        video.dataset.resumeTime = video.currentTime;
        video.removeAttribute('src');
        delete video.dataset.loaded;
        video.preload = 'none';
        video.load();
      }, 300));
    }
  }
}, {threshold: 0.1});
for (const video of allVideos) observer.observe(video);

document.addEventListener('visibilitychange', () => {
  for (const video of visible) syncVideo(video);
});
