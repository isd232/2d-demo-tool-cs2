const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = new URL('../toolbar.css', import.meta.url).href;
document.head.appendChild(link);

function setupToolbar() {
  const tools = document.querySelector('#tools');
  const center = document.querySelector('#center');
  if (!tools || !center || document.querySelector('#viewer-toolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.id = 'viewer-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Replay tools');
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.textContent = 'Settings';
  settings.setAttribute('aria-expanded', 'false');
  settings.setAttribute('aria-controls', 'tools');
  toolbar.appendChild(settings);
  center.appendChild(toolbar);

  tools.classList.add('settings-popover');
  tools.hidden = true;
  const heading = document.createElement('div');
  heading.className = 'settings-heading';
  heading.textContent = 'Display settings';
  tools.prepend(heading);

  function closeSettings() {
    tools.hidden = true;
    settings.setAttribute('aria-expanded', 'false');
  }

  settings.addEventListener('click', () => {
    tools.hidden = !tools.hidden;
    settings.setAttribute('aria-expanded', String(!tools.hidden));
  });
  document.addEventListener('pointerdown', (event) => {
    if (!tools.contains(event.target) && !settings.contains(event.target)) closeSettings();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !tools.hidden) {
      closeSettings();
      settings.focus();
    }
  });

  const labels = {
    trj: 'Grenade trajectories',
    lvl: 'Map level',
  };
  for (const [id, text] of Object.entries(labels)) {
    const control = tools.querySelector('#' + id);
    if (!control) continue;
    const label = document.createElement('label');
    label.className = 'settings-field-label';
    label.htmlFor = id;
    label.textContent = text;
    control.before(label);
    const sync = () => { label.hidden = control.hidden || control.style.display === 'none'; };
    new MutationObserver(sync).observe(control, { attributes: true, attributeFilter: ['hidden', 'style'] });
    sync();
  }

  const shortcuts = document.createElement('details');
  shortcuts.className = 'settings-shortcuts';
  const summary = document.createElement('summary');
  summary.textContent = 'Keyboard shortcuts';
  shortcuts.appendChild(summary);
  const rows = [
    ['Space', 'Play / pause'],
    ['Left / Right', 'Seek 5 seconds'],
    ['Up / Down', 'Next / previous round'],
    ['[ / ]', 'Previous / next kill'],
    ['Hold Tab', 'Current scoreboard'],
    ['Mouse wheel', 'Zoom'],
    ['Drag map', 'Pan'],
    ['Double click', 'Reset view'],
  ];
  const list = document.createElement('dl');
  for (const [key, description] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = description;
    list.append(dt, dd);
  }
  shortcuts.appendChild(list);
  tools.appendChild(shortcuts);

  function moveActions() {
    for (const button of [...tools.querySelectorAll(':scope > button')]) {
      toolbar.appendChild(button);
    }
  }
  moveActions();
  new MutationObserver(moveActions).observe(tools, { childList: true });

  if (document.fullscreenEnabled) {
    const fullscreen = document.createElement('button');
    fullscreen.type = 'button';
    fullscreen.className = 'toolbar-fullscreen';
    fullscreen.textContent = 'Fullscreen';
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        fullscreen.title = 'Fullscreen is not available in this browser context';
      }
    });
    document.addEventListener('fullscreenchange', () => {
      fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    });
    toolbar.appendChild(fullscreen);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupToolbar, { once: true });
} else {
  setTimeout(setupToolbar, 0);
}
