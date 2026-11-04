import { state } from './state.js';
import { playersAt, worldToCanvas, onCurrentLevel } from './geometry.js';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('../player-cards.css', import.meta.url).href;
document.head.appendChild(stylesheet);

const center = document.querySelector('#center');
const canvas = document.querySelector('#cv');
const ring = document.createElement('div');
ring.id = 'player-hover-ring';
ring.hidden = true;
center.appendChild(ring);

let hoverSource = null;
let hoveredPlayer = null;
let pointer = null;
let lastPreparedAt = 0;

function cardForPlayer(index) {
  const data = state.data;
  if (!data) return null;
  for (const [columnId, team] of [['#colA', data.teamA], ['#colB', data.teamB]]) {
    const position = team.indexOf(index);
    if (position >= 0) return document.querySelector(columnId)?.children[position] || null;
  }
  return null;
}

function playerFromCard(card) {
  const data = state.data;
  if (!data) return null;
  const column = card.parentElement;
  const team = column.id === 'colA' ? data.teamA : data.teamB;
  const position = [...column.children].indexOf(card);
  return team[position] ?? null;
}

for (const id of ['#colA', '#colB']) {
  const column = document.querySelector(id);
  column.addEventListener('pointerover', (event) => {
    const card = event.target.closest('.card');
    if (!card || !column.contains(card)) return;
    hoveredPlayer = playerFromCard(card);
    hoverSource = 'card';
  });
  column.addEventListener('pointerleave', () => {
    if (hoverSource === 'card') {
      hoveredPlayer = null;
      hoverSource = null;
    }
  });
}

canvas.addEventListener('pointermove', (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  hoverSource = 'map';
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
  if (hoverSource === 'map') {
    hoveredPlayer = null;
    hoverSource = null;
  }
});
window.addEventListener('blur', () => {
  hoveredPlayer = null;
  hoverSource = null;
  pointer = null;
});

function screenPosition(player, box) {
  const [x, y] = worldToCanvas(player[1], player[2]);
  const view = state.view || { zoom: 1, x: 0, y: 0 };
  return [
    box.left + (x * view.zoom + view.x) * box.width / canvas.width,
    box.top + (y * view.zoom + view.y) * box.height / canvas.height,
  ];
}

function prepareCards() {
  for (const card of document.querySelectorAll('#colA .card, #colB .card')) {
    const name = card.querySelector('.card-name');
    if (name) name.title = name.textContent.trim();
    for (const image of card.querySelectorAll('.weapons img')) {
      const file = image.getAttribute('src')?.split('/').pop()?.replace(/\.svg$/, '');
      const names = {
        ak47: 'AK-47', m4a1: 'M4A4', m4a1_silencer: 'M4A1-S', awp: 'AWP',
        usp_silencer: 'USP-S', glock: 'Glock-18', hkp2000: 'P2000',
        deagle: 'Desert Eagle', ssg08: 'SSG 08', galilar: 'Galil AR',
        incgrenade: 'Incendiary grenade', smokegrenade: 'Smoke grenade',
        hegrenade: 'HE grenade', flashbang: 'Flashbang', c4: 'C4',
      };
      if (file) image.title = names[file] || file.replaceAll('_', ' ').toUpperCase();
    }
  }
}

function update(timestamp) {
  if (state.data && state.round) {
    if (timestamp - lastPreparedAt > 200) {
      prepareCards();
      lastPreparedAt = timestamp;
    }
    const players = playersAt(state.tick);
    const box = canvas.getBoundingClientRect();
    if (hoverSource === 'map' && pointer && box.width > 0) {
      let closest = null;
      let distance = 24;
      for (const player of players) {
        if (player[3] <= 0 || !onCurrentLevel(player[6])) continue;
        const [x, y] = screenPosition(player, box);
        const d = Math.hypot(pointer.x - x, pointer.y - y);
        if (d < distance) {
          distance = d;
          closest = player[0];
        }
      }
      hoveredPlayer = closest;
    }
    const card = hoveredPlayer === null ? null : cardForPlayer(hoveredPlayer);
    for (const element of document.querySelectorAll('.card.player-hovered')) {
      if (element !== card) element.classList.remove('player-hovered');
    }
    if (card) card.classList.add('player-hovered');
    const player = players.find((p) => p[0] === hoveredPlayer && p[3] > 0 && onCurrentLevel(p[6]));
    if (player && box.width > 0) {
      const [x, y] = screenPosition(player, box);
      const bounds = center.getBoundingClientRect();
      const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      ring.hidden = !inside;
      const zoom = state.view?.zoom || 1;
      const radius = state.showAvatars ? 14 : 10;
      const size = Math.max(24, (radius * Math.sqrt(zoom) + 7) * 2 * box.width / canvas.width);
      ring.style.left = (x - bounds.left) + 'px';
      ring.style.top = (y - bounds.top) + 'px';
      ring.style.width = size + 'px';
      ring.style.height = size + 'px';
    } else {
      ring.hidden = true;
    }
  } else {
    ring.hidden = true;
  }
  requestAnimationFrame(update);
}

requestAnimationFrame(update);
