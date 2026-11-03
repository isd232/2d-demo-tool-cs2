import { state, $ } from './state.js';
import {
  SIDE_COLOR, SIDE_BG, ROUND_SECONDS, BOMB_SECONDS, KILLFEED_SECONDS, KILLFEED_MAX,
} from './config.js';
import { itemFile, category, cleanName, iconSrc, GRENADE_ORDER, BADGE } from './icons.js';
import { hitStrength } from './combat.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function renderHeader() {
  const { data, round, roundIndex, tick } = state;
  const winTick = round.winTick ?? round.end;

  let scoreA = 0;
  let scoreB = 0;
  data.rounds.forEach((r, i) => {
    const finished = i < roundIndex || (i === roundIndex && tick >= winTick);
    if (!finished) return;
    if (r.wTeam === 'A') scoreA++;
    else if (r.wTeam === 'B') scoreB++;
  });
  $('#scoreA').textContent = scoreA;
  $('#scoreB').textContent = scoreB;

  const sideA = round.sideA || 3;
  const sideB = sideA === 3 ? 2 : 3;
  $('#nameA').style.color = SIDE_COLOR[sideA];
  $('#nameB').style.color = SIDE_COLOR[sideB];

  const clockTick = Math.min(tick, winTick);
  const planted = round.events.find((e) => e.type === 'bomb_planted');
  let secondsLeft;
  let bombActive = false;
  if (planted && clockTick >= planted.t) {
    secondsLeft = Math.max(0, BOMB_SECONDS - (clockTick - planted.t) / data.tickrate);
    bombActive = true;
  } else {
    secondsLeft = Math.max(0, ROUND_SECONDS - (clockTick - round.start) / data.tickrate);
  }
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(Math.floor(secondsLeft % 60)).padStart(2, '0');
  $('#clock').textContent = `${minutes}:${seconds}`;
  $('#clock').style.color = bombActive ? '#ff6b6b' : '';
}

let lastCardsHtml = '';

export function resetCards() {
  lastCardsHtml = '';
}

function currentSnapshot() {
  const { round, tick } = state;
  const snapshots = round.snaps;
  if (!snapshots || !snapshots.length) return null;
  const i = Math.min(snapshots.length - 1, Math.max(0, Math.floor((tick - round.start) / 64)));
  return new Map(snapshots[i][1].map((row) => [row[0], row]));
}

const iconTag = (file, cssClass, title = '') =>
  `<img class="${cssClass}" src="${iconSrc(file)}" title="${escapeHtml(title)}" onerror="this.style.display='none'">`;

function equipmentHtml(snapshot) {
  const { data } = state;
  const [, armorValue, balance, flags, activeIndex, inventoryIndexes] = snapshot;

  const files = inventoryIndexes
    .map((i) => ({ name: data.items[i], file: itemFile(data.items[i]) }))
    .filter((item) => item.file);
  const activeFile = activeIndex >= 0 ? itemFile(data.items[activeIndex]) : null;

  const primary = files.find((item) => category(item.file) === 'primary');
  const pistol = files.find((item) => category(item.file) === 'pistol');
  const shown = [primary, pistol].filter(Boolean);
  if (activeFile && !shown.some((item) => item.file === activeFile)) {
    shown.push({ name: '', file: activeFile });
  }
  const weapons = shown
    .map((item) => iconTag(item.file, 'wicon' + (item.file === activeFile ? ' active' : ''), cleanName(item.name)))
    .join('');

  let left = `<span class="money">$${balance}</span>`;
  if (armorValue > 0) left += iconTag(flags & 1 ? 'assaultsuit' : 'kevlar', 'uicon active', 'Armor ' + armorValue);
  if (flags & 2) left += iconTag('defuser', 'uicon active', 'Defuse kit');
  if (files.some((item) => item.file === 'c4')) left += iconTag('c4', 'uicon active', 'Bomb');

  let grenades = '';
  for (const file of GRENADE_ORDER) {
    const count = files.filter((item) => item.file === file).length;
    for (let i = 0; i < count; i++) grenades += iconTag(file, 'uicon' + (file === activeFile ? ' active' : ''));
  }
  return { weapons, left, grenades };
}

function playerCardHtml(playerIndex, players, snapshots) {
  const { data, tick } = state;
  const player = players.find((q) => q[0] === playerIndex);
  if (!player) return '';

  const hp = Math.max(0, Math.round(player[3]));
  const dead = hp <= 0;
  const hit = Math.round(hitStrength(playerIndex, tick) * 10) / 10;

  const avatarUrl = data.avatars[playerIndex];
  const avatar = state.showAvatars && avatarUrl
    ? `<img class="avatar" src="${avatarUrl}" onerror="this.style.display='none'">`
    : '';

  const snapshot = snapshots && snapshots.get(playerIndex);
  const equipment = snapshot ? equipmentHtml(snapshot) : { weapons: '', left: '', grenades: '' };

  return `
    <div class="card ${dead ? 'dead' : ''}" style="--c:${SIDE_BG[player[5]]};--hp:${hp}%;--hit:${dead ? 0 : hit}">
      <div class="card-top">
        ${avatar}
        <span class="card-name">${escapeHtml(data.players[playerIndex])}</span>
        <span class="weapons">${equipment.weapons}</span>
      </div>
      <div class="card-info">
        ${equipment.left}
        <span class="spacer"></span>${equipment.grenades}
        <span class="card-hp">${hp}</span>
      </div>
    </div>`;
}

export function renderCards(players) {
  const { data } = state;
  const snapshots = currentSnapshot();
  const htmlA = data.teamA.map((i) => playerCardHtml(i, players, snapshots)).join('');
  const htmlB = data.teamB.map((i) => playerCardHtml(i, players, snapshots)).join('');

  const combined = htmlA + '|' + htmlB;
  if (combined === lastCardsHtml) return;
  lastCardsHtml = combined;
  $('#colA').innerHTML = htmlA;
  $('#colB').innerHTML = htmlB;
}

let lastKillfeedHtml = '';

export function resetKillfeed() {
  lastKillfeedHtml = '';
}

function killfeedName(name, playerIndex) {
  const color = SIDE_COLOR[state.round.sides[playerIndex]] || '#ffffff';
  return `<span style="color:${color}">${escapeHtml(name || '?')}</span>`;
}

const badgeTag = (key, title) => `<img class="kf-badge" src="${BADGE[key]}" title="${title}">`;

function killfeedEntryHtml(e, opacity) {
  const file = itemFile(e.weapon);
  const weapon = file
    ? `<img class="kf-weapon" src="${iconSrc(file)}" onerror="this.style.display='none'">`
    : `<span class="kf-text">${escapeHtml(cleanName(e.weapon))}</span>`;

  const badges = [
    e.blind ? badgeTag('blind', 'Attacker blind') : '',
    e.smoke ? badgeTag('smoke', 'Through smoke') : '',
    e.wb ? badgeTag('wallbang', 'Wallbang') : '',
    e.ns ? badgeTag('noscope', 'No scope') : '',
    e.hs ? badgeTag('headshot', 'Headshot') : '',
  ].join('');

  const attacker = e.att ? killfeedName(e.att, e.attackerId) : '';
  const assist = e.ast ? `<span class="kf-assist">+ ${killfeedName(e.ast, e.assisterId)}</span>` : '';

  return `<div class="kf" data-jump="${e.t}" title="Click to jump to this kill" style="opacity:${opacity}">${attacker}${assist}${weapon}${badges}${killfeedName(e.vic, e.victimId)}</div>`;
}

export function renderKillfeed() {
  const { round, tick, data } = state;
  const fadeSeconds = 0.8;

  const recent = round.events
    .filter((e) => e.type === 'kill' && e.t <= tick && (tick - e.t) / data.tickrate < KILLFEED_SECONDS)
    .slice(-KILLFEED_MAX);

  const html = recent.map((e) => {
    const age = (tick - e.t) / data.tickrate;
    const opacity = age > KILLFEED_SECONDS - fadeSeconds
      ? Math.max(0, (KILLFEED_SECONDS - age) / fadeSeconds)
      : 1;
    return killfeedEntryHtml(e, opacity.toFixed(2));
  }).join('');

  if (html === lastKillfeedHtml) return;
  lastKillfeedHtml = html;
  $('#killfeed').innerHTML = html;
}

export function buildRoundTiles(onSelect) {
  const box = $('#rtiles');
  box.innerHTML = '';
  state.data.rounds.forEach((round, i) => {
    const tile = document.createElement('div');
    tile.className = 'round-tile';
    tile.textContent = round.n;
    const color = round.wSide ? SIDE_COLOR[round.wSide] : '#555';
    tile.style.color = color;
    tile.style.borderBottomColor = color;
    tile.onclick = () => onSelect(i);
    box.appendChild(tile);
  });
}

export function highlightRoundTile(index) {
  [...$('#rtiles').children].forEach((tile, i) => tile.classList.toggle('selected', i === index));
}

const BOMB_TITLES = {
  bomb_planted: 'Bomb planted',
  bomb_defused: 'Bomb defused',
  bomb_exploded: 'Bomb exploded',
};

export function buildTimeline() {
  const { round } = state;
  const timeline = $('#tl');
  timeline.querySelectorAll('.kill-mark, .bomb-mark, .bomb-zone, .post-zone').forEach((node) => node.remove());

  const length = round.end - round.start;
  const percent = (t) => ((t - round.start) / length) * 100 + '%';

  const planted = round.events.find((e) => e.type === 'bomb_planted');
  if (planted) {
    const zone = document.createElement('div');
    zone.className = 'bomb-zone';
    zone.style.left = percent(planted.t);
    timeline.appendChild(zone);
  }

  if (round.winTick && round.winTick < round.end) {
    const zone = document.createElement('div');
    zone.className = 'post-zone';
    zone.style.left = percent(round.winTick);
    zone.title = 'Round end';
    timeline.appendChild(zone);
  }

  for (const e of round.events) {
    if (e.type === 'kill') {
      const mark = document.createElement('div');
      mark.className = 'kill-mark';
      mark.style.left = percent(e.t);
      mark.style.background = SIDE_COLOR[round.sides[e.attackerId]] || '#aaa';
      mark.title = `${e.att} - ${e.vic} (${cleanName(e.weapon)})`;
      mark.dataset.jump = e.t;
      timeline.appendChild(mark);
    } else if (e.type.startsWith('bomb_')) {
      const mark = document.createElement('div');
      mark.className = 'bomb-mark ' + e.type;
      mark.style.left = percent(e.t);
      mark.style.setProperty('--icon', `url(${iconSrc(e.type === 'bomb_defused' ? 'defuser' : 'c4')})`);
      mark.title = BOMB_TITLES[e.type] || '';
      mark.dataset.jump = e.t;
      timeline.appendChild(mark);
    }
  }
}

export function movePlayhead() {
  const { round, tick } = state;
  $('#ph').style.left = (100 * (tick - round.start)) / (round.end - round.start) + '%';
}
