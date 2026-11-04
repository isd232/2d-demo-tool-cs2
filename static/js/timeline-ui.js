import { state, $ } from './state.js';
import { cleanName } from './icons.js';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('../timeline.css', import.meta.url).href;
document.head.appendChild(stylesheet);

const timeline = $('#tl');
const clock = document.createElement('span');
clock.id = 'timeline-clock';
clock.setAttribute('aria-label', 'Round playback time');
timeline.parentNode.insertBefore(clock, timeline.nextSibling);

const tooltip = document.createElement('div');
tooltip.id = 'timeline-tooltip';
tooltip.setAttribute('role', 'tooltip');
document.body.appendChild(tooltip);

let pointer = null;
let lastClock = '';

export function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

export function eventDescription(event) {
  if (event.type === 'kill') {
    const weapon = cleanName(event.weapon).replace(/^weapon_/, '').replaceAll('_', ' ');
    return [weapon, `${event.att || 'World'} → ${event.vic || '?'}`, event.hs ? 'Headshot' : ''].filter(Boolean).join(' · ');
  }
  return {
    bomb_planted: 'Bomb planted',
    bomb_defused: 'Bomb defused',
    bomb_exploded: 'Bomb exploded',
  }[event.type] || '';
}

function hideTooltip() {
  tooltip.hidden = true;
}

function updateTooltip() {
  if (!pointer || !state.round || !state.data || document.hidden) {
    hideTooltip();
    return;
  }
  const box = timeline.getBoundingClientRect();
  if (!box.width || pointer.x < box.left || pointer.x > box.right || pointer.y < box.top || pointer.y > box.bottom) {
    hideTooltip();
    return;
  }
  const fraction = Math.max(0, Math.min(1, (pointer.x - box.left) / box.width));
  const round = state.round;
  const tick = round.start + fraction * (round.end - round.start);
  const marker = pointer.target.closest?.('[data-jump]');
  const markerTick = marker && timeline.contains(marker) ? Number(marker.dataset.jump) : null;
  const event = Number.isFinite(markerTick)
    ? round.events.find((e) => e.t === markerTick && (e.type === 'kill' || e.type.startsWith('bomb_')))
    : null;
  const displayTick = event ? event.t : tick;
  const time = formatTime((displayTick - round.start) / state.data.tickrate);
  tooltip.replaceChildren();
  const title = document.createElement('div');
  title.className = 'timeline-tooltip-title';
  title.textContent = event ? `${time} · ${eventDescription(event)}` : time;
  tooltip.appendChild(title);
  if (event) {
    const hint = document.createElement('div');
    hint.className = 'timeline-tooltip-hint';
    hint.textContent = 'Click to jump before this event';
    tooltip.appendChild(hint);
  }
  tooltip.hidden = false;
  const width = tooltip.getBoundingClientRect().width;
  tooltip.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, pointer.x - width / 2)) + 'px';
  tooltip.style.top = Math.max(8, box.top - tooltip.getBoundingClientRect().height - 10) + 'px';
}

function update() {
  if (state.round && state.data) {
    const elapsed = (state.tick - state.round.start) / state.data.tickrate;
    const duration = (state.round.end - state.round.start) / state.data.tickrate;
    const text = formatTime(Math.min(duration, elapsed)) + ' / ' + formatTime(duration);
    if (text !== lastClock) {
      clock.textContent = text;
      lastClock = text;
    }
    timeline.querySelectorAll('[data-jump][title]').forEach((marker) => {
      marker.removeAttribute('title');
    });
  }
  updateTooltip();
  requestAnimationFrame(update);
}

timeline.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX, y: event.clientY, target: event.target };
});
timeline.addEventListener('pointerleave', () => {
  pointer = null;
  hideTooltip();
});
window.addEventListener('blur', () => {
  pointer = null;
  hideTooltip();
});
window.addEventListener('scroll', () => {
  pointer = null;
  hideTooltip();
}, true);
hideTooltip();
requestAnimationFrame(update);
