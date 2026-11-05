'use strict';

function setupSimulationGallery(gallery) {
  const prefix = gallery.id === 'simulation-gallery' ? 'sim' : 'visual';
  const find = name => gallery.querySelector(`#${prefix}-${name}`);
  const rail = find('rail');
  const tabs = find('tabs');
  const previous = find('previous');
  const next = find('next');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const base = gallery.dataset.source;
  let tasks = [], active = -1, inView = false;
  let scrollFrame = 0, drag = null, dragged = false, destination = null;
  let releaseTimer;
  const posterObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target.querySelector('video');
      video.poster = video.dataset.poster;
      posterObserver.unobserve(entry.target);
    }
  }, {rootMargin: '400px 0px'});

  function releaseSource(task) {
    if (!task.loaded) return;
    task.video.pause();
    task.resumeTime = task.video.currentTime;
    task.video.onloadedmetadata = null;
    task.video.removeAttribute('src');
    task.video.preload = 'none';
    task.video.load();
    task.loaded = null;
    task.switching = false;
  }

  function syncPlayback() {
    tasks.forEach((task, index) => {
      if (index !== active || !inView || document.hidden || task.switching) {
        task.video.pause();
      } else {
        task.video.play().catch(error => {
          if (error.name !== 'AbortError') {
            console.error(error);
          }
        });
      }
    });
  }

  function loadSource(task) {
    const file = task.video_file;
    if (task.loaded === file) return;
    task.switching = true;
    task.video.pause();
    task.video.onloadedmetadata = () => {
      task.video.onloadedmetadata = null;
      task.video.currentTime = Math.min(task.resumeTime || 0, task.video.duration);
      task.switching = false;
      syncPlayback();
    };
    task.loaded = file;
    task.video.preload = 'metadata';
    task.video.src = `${base}${file}?v=${task.revision}`;
    task.video.load();
  }

  function activate(index) {
    if (index === active) return;
    active = index;
    tasks.forEach((task, i) => {
      task.slide.classList.toggle('active', i === index);
      task.tab.setAttribute('aria-pressed', String(i === index));
      task.video.controls = i === index;
      if (i !== index) releaseSource(task);
    });
    const task = tasks[index];
    const tabRect = task.tab.getBoundingClientRect(), tabsRect = tabs.getBoundingClientRect();
    tabs.scrollTo({left: tabs.scrollLeft + tabRect.left - tabsRect.left - (tabs.clientWidth - tabRect.width) / 2, behavior: 'instant'});
    find('position').textContent = `${index + 1} / ${tasks.length}`;
    previous.disabled = index === 0;
    next.disabled = index === tasks.length - 1;
    task.resumeTime = 0;
    if (task.loaded) task.video.currentTime = 0;
    if (inView) loadSource(task);
    syncPlayback();
  }

  function go(index, behavior = reducedMotion.matches ? 'instant' : 'smooth') {
    if (index < 0 || index >= tasks.length) return;
    const slide = tasks[index].slide;
    destination = index;
    activate(index);
    rail.scrollTo({left: slide.offsetLeft - (rail.clientWidth - slide.offsetWidth) / 2, behavior});
    if (behavior === 'instant') destination = null;
  }

  function nearest() {
    const center = rail.scrollLeft + rail.clientWidth / 2;
    return tasks.reduce((best, task, i) => Math.abs(task.slide.offsetLeft + task.slide.offsetWidth / 2 - center) < Math.abs(tasks[best].slide.offsetLeft + tasks[best].slide.offsetWidth / 2 - center) ? i : best, 0);
  }

  fetch(base + 'manifest.json', {cache: 'no-cache'}).then(response => {
    if (!response.ok) throw Error(`Simulation manifest: ${response.status}`);
    return response.json();
  }).then(data => {
    tasks = data.videos;
    tasks.forEach((task, index) => {
      task.switching = false;
      task.tab = document.createElement('button');
      task.tab.type = 'button';
      task.tab.textContent = task.title;
      task.tab.addEventListener('click', () => go(index));
      tabs.append(task.tab);
      task.slide = document.createElement('article');
      task.slide.className = 'sim-slide';
      task.slide.setAttribute('aria-label', task.title);
      task.video = document.createElement('video');
      task.video.muted = true;
      task.video.loop = true;
      task.video.playsInline = true;
      task.video.preload = 'none';
      task.video.dataset.poster = `${base}${task.poster}?v=${task.revision}`;
      task.video.setAttribute('aria-label', `${task.title} simulation`);
      task.video.addEventListener('play', () => {
        tasks.forEach(other => { if (other !== task) other.video.pause(); });
      });
      task.video.addEventListener('error', () => { find('error').hidden = false; });
      task.slide.append(task.video);
      task.slide.addEventListener('click', () => { if (index !== active) go(index); });
      rail.append(task.slide);
      posterObserver.observe(task.slide);
    });
    go(tasks.findIndex(task => task.task === 'pnp'), 'instant');
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      clearTimeout(releaseTimer);
      if (inView) loadSource(tasks[active]);
      else releaseTimer = setTimeout(() => { if (!inView) tasks.forEach(releaseSource); }, 300);
      syncPlayback();
    }, {threshold: .2}).observe(gallery);
  }).catch(error => {
    find('error').hidden = false;
    console.error(error);
  });

  rail.addEventListener('scroll', () => {
    if (!tasks.length || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (destination !== null) {
        const slide = tasks[destination].slide;
        if (Math.abs(rail.scrollLeft - (slide.offsetLeft - (rail.clientWidth - slide.offsetWidth) / 2)) < 2) destination = null;
        return;
      }
      activate(nearest());
    });
  });
  rail.addEventListener('pointerdown', event => {
    destination = null;
    if (event.target.closest('video')) return;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragged = false;
    drag = {x: event.clientX, left: rail.scrollLeft};
  });
  rail.addEventListener('pointermove', event => {
    if (!drag) return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) > 5 && !dragged) { dragged = true; rail.setPointerCapture(event.pointerId); }
    if (dragged) { event.preventDefault(); rail.style.scrollSnapType = 'none'; rail.scrollLeft = drag.left - delta; }
  });
  function endDrag(event) {
    if (!drag) return;
    drag = null;
    rail.style.scrollSnapType = '';
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    if (dragged) go(nearest());
  }
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('click', event => {
    if (dragged) { event.preventDefault(); event.stopImmediatePropagation(); dragged = false; }
  }, true);
  previous.addEventListener('click', () => go(active - 1));
  next.addEventListener('click', () => go(active + 1));
  gallery.addEventListener('keydown', event => {
    if (event.target.closest('video')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); }
  });
  document.addEventListener('visibilitychange', syncPlayback);
  window.addEventListener('resize', () => { if (active >= 0) go(active, 'instant'); });
}

document.querySelectorAll('[data-simulation-gallery]').forEach(setupSimulationGallery);
