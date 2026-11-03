import { state, $ } from './state.js';
import { SIDE_COLOR } from './config.js';
import { category, cleanName, iconSrc, GRENADE_ORDER } from './icons.js';
import { loadoutOf, buyLabel, pistolRoundNumbers } from './prices.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const MAX_BAR_VALUE = 30000;

const overlay = document.createElement('div');
overlay.id = 'economy';

let cache = null;
let cachedFor = null;
let selectedRound = 0;
let goToRound = () => {};

function teamSummary(round, players) {
  const snapshot = round.snaps && round.snaps[0] ? round.snaps[0][1] : null;
  if (!snapshot) return null;
  const rows = new Map(snapshot.map((row) => [row[0], row]));
  const loadouts = players
    .filter((i) => rows.has(i))
    .map((i) => ({ player: i, ...loadoutOf(rows.get(i), state.data.items) }));
  return {
    loadouts,
    value: loadouts.reduce((sum, l) => sum + l.value, 0),
    bank: loadouts.reduce((sum, l) => sum + l.bank, 0),
  };
}

function buildEconomy() {
  if (cachedFor === state.data) return cache;
  const { data } = state;
  const pistols = pistolRoundNumbers(data.rounds);
  cache = data.rounds.map((round) => {
    const a = teamSummary(round, data.teamA);
    const b = teamSummary(round, data.teamB);
    const isPistol = pistols.has(round.n);
    if (a) a.label = buyLabel(a.value, a.loadouts.length, isPistol);
    if (b) b.label = buyLabel(b.value, b.loadouts.length, isPistol);
    return { a, b };
  });
  cachedFor = state.data;
  return cache;
}

function teamCells(summary, color) {
  if (!summary) return '<td></td><td></td><td></td>';
  const width = Math.min(100, (summary.value / MAX_BAR_VALUE) * 100);
  return `
    <td class="eco-label">${summary.label}</td>
    <td class="eco-value">
      <div class="eco-bar"><i style="width:${width}%;background:${color}"></i></div>
      <span>${money(summary.value)}</span>
    </td>
    <td class="eco-bank">${money(summary.bank)}</td>`;
}

function winnerCell(round) {
  const { data } = state;
  if (round.wTeam === 'A') return `<td style="color:${SIDE_COLOR[round.sideA]}">${escapeHtml(data.nameA)}</td>`;
  if (round.wTeam === 'B') return `<td style="color:${SIDE_COLOR[round.sideA === 3 ? 2 : 3]}">${escapeHtml(data.nameB)}</td>`;
  return '<td></td>';
}

const iconTag = (file, cssClass, title = '') =>
  `<img class="${cssClass}" src="${iconSrc(file)}" title="${escapeHtml(title)}" onerror="this.style.display='none'">`;

function loadoutIcons(loadout) {
  const primary = loadout.files.find((f) => category(f) === 'primary');
  const pistol = loadout.files.find((f) => category(f) === 'pistol');
  let html = [primary, pistol].filter(Boolean).map((f) => iconTag(f, 'wicon active', cleanName(f))).join('');
  if (loadout.armor > 0) html += iconTag(loadout.helmet ? 'assaultsuit' : 'kevlar', 'uicon active', 'Armor');
  if (loadout.defuser) html += iconTag('defuser', 'uicon active', 'Defuse kit');
  for (const file of GRENADE_ORDER) {
    const count = loadout.files.filter((f) => f === file).length;
    for (let i = 0; i < count; i++) html += iconTag(file, 'uicon active');
  }
  return html;
}

function detailTeam(name, color, summary) {
  if (!summary) return '';
  const rows = [...summary.loadouts]
    .sort((x, y) => y.value - x.value)
    .map((l) => `
      <tr>
        <td class="sb-name">${escapeHtml(state.data.players[l.player])}</td>
        <td class="eco-items">${loadoutIcons(l)}</td>
        <td>${money(l.value)}</td>
        <td class="eco-bank">${money(l.bank)}</td>
      </tr>`).join('');
  return `
    <div class="sb-team">
      <div class="sb-head" style="color:${color}">
        <span>${escapeHtml(name)} &middot; ${summary.label}</span>
        <span>${money(summary.value)}</span>
      </div>
      <table>
        <thead><tr><th>Player</th><th>Items</th><th>Equipment</th><th>Bank</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function render() {
  const { data } = state;
  const economy = buildEconomy();
  const hasData = economy.some((r) => r.a || r.b);

  if (!hasData) {
    overlay.innerHTML = `
      <div class="ms-card">
        <button class="ms-close" title="Close (Esc)">&times;</button>
        <div class="sb-title">Economy</div>
        <p>No equipment data was found in this demo.</p>
      </div>`;
    overlay.querySelector('.ms-close').onclick = close;
    return;
  }

  const rows = data.rounds.map((round, i) => {
    const colorA = SIDE_COLOR[round.sideA];
    const colorB = SIDE_COLOR[round.sideA === 3 ? 2 : 3];
    const classes = [i === state.roundIndex ? 'current' : '', i === selectedRound ? 'selected' : ''].join(' ');
    return `
      <tr data-round="${i}" class="${classes}">
        <td class="eco-round">${round.n}</td>
        ${teamCells(economy[i].a, colorA)}
        ${teamCells(economy[i].b, colorB)}
        ${winnerCell(round)}
      </tr>`;
  }).join('');

  const selected = data.rounds[selectedRound];
  const colorA = SIDE_COLOR[selected.sideA];
  const colorB = SIDE_COLOR[selected.sideA === 3 ? 2 : 3];

  overlay.innerHTML = `
    <div class="ms-card">
      <button class="ms-close" title="Close (Esc)">&times;</button>
      <div class="sb-title">Economy at the start of each round &middot; click a round for details</div>
      <div class="eco-scroll">
        <table class="eco-table">
          <thead>
            <tr>
              <th>#</th>
              <th colspan="3" style="color:${SIDE_COLOR[data.rounds[0].sideA]}">${escapeHtml(data.nameA)}</th>
              <th colspan="3" style="color:${SIDE_COLOR[data.rounds[0].sideA === 3 ? 2 : 3]}">${escapeHtml(data.nameB)}</th>
              <th>Winner</th>
            </tr>
            <tr><th></th><th>Buy</th><th>Equipment</th><th>Bank</th><th>Buy</th><th>Equipment</th><th>Bank</th><th></th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="eco-detail">
        <div class="eco-detail-head">
          <span>Round ${selected.n}</span>
          <button class="eco-go">Go to round</button>
        </div>
        <div class="sb-teams">
          ${detailTeam(data.nameA, colorA, economy[selectedRound].a)}
          ${detailTeam(data.nameB, colorB, economy[selectedRound].b)}
        </div>
      </div>
      <div class="ms-legend">
        Equipment is the value of everything owned at the end of the buy phase (starting pistols are not counted).
        Bank is the cash left after buying. Buy type is estimated from team equipment value.
      </div>
    </div>`;

  overlay.querySelector('.ms-close').onclick = close;
  overlay.querySelector('.eco-go').onclick = () => {
    close();
    goToRound(selectedRound);
  };
  overlay.querySelectorAll('tr[data-round]').forEach((row) => {
    row.onclick = () => {
      selectedRound = Number(row.dataset.round);
      render();
    };
  });
  const current = overlay.querySelector('tr.current');
  if (current && current.scrollIntoView) current.scrollIntoView({ block: 'center' });
}

const isOpen = () => overlay.style.display === 'flex';

function close() {
  overlay.style.display = 'none';
}

function open() {
  if (!state.data) return;
  selectedRound = state.roundIndex;
  render();
  overlay.style.display = 'flex';
}

export function setupEconomy(onSelectRound) {
  goToRound = onSelectRound;
  document.body.appendChild(overlay);

  const button = document.createElement('button');
  button.textContent = 'Economy';
  button.onclick = () => (isOpen() ? close() : open());
  $('#tools').appendChild(button);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
