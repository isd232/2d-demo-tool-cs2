import { state, $ } from './state.js';
import { SIDE_COLOR } from './config.js';
import { playersAt } from './geometry.js';
import {
  buildStatsIndex, statsAt, roundsPlayed, buildMatchExtras,
} from './stats.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

let index = null;
let extras = null;
let indexedFor = null;

function ensureIndex() {
  if (indexedFor === state.data) return;
  index = buildStatsIndex(state.data);
  extras = buildMatchExtras(state.data);
  indexedFor = state.data;
}

const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const signed = (n) => (n > 0 ? '+' + n : String(n));
const diffClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

function playerCell(playerIndex) {
  const url = state.data.avatars[playerIndex];
  const avatar = state.showAvatars && url ? `<img class="sb-avatar" src="${url}">` : '';
  return `<td class="sb-name">${avatar}${escapeHtml(state.data.players[playerIndex])}</td>`;
}

function scoreAfter(roundsFinished) {
  let a = 0;
  let b = 0;
  state.data.rounds.slice(0, roundsFinished).forEach((round) => {
    if (round.wTeam === 'A') a++;
    else if (round.wTeam === 'B') b++;
  });
  return { A: a, B: b };
}

function teamBlock(name, side, score, headers, rowsHtml) {
  return `
    <div class="sb-team">
      <div class="sb-head" style="color:${SIDE_COLOR[side]}">
        <span>${escapeHtml(name)}</span><span class="sb-score">${score}</span>
      </div>
      <table>
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

const livePanel = document.createElement('div');
livePanel.id = 'scoreboard';

let liveVisible = false;
let lastLiveHtml = '';

function moneyByPlayer() {
  const { round, tick } = state;
  const snapshots = round.snaps;
  if (!snapshots || !snapshots.length) return new Map();
  const i = Math.min(snapshots.length - 1, Math.max(0, Math.floor((tick - round.start) / 64)));
  return new Map(snapshots[i][1].map((row) => [row[0], row[2]]));
}

function renderLive() {
  const { data, round, roundIndex, tick } = state;
  ensureIndex();

  const stats = statsAt(data, index, roundIndex, tick);
  const rounds = roundsPlayed(round, roundIndex, tick);
  const money = moneyByPlayer();
  const current = new Map(playersAt(tick).map((p) => [p[0], p]));
  const finished = roundIndex + (tick >= (round.winTick ?? round.end) ? 1 : 0);
  const scores = scoreAfter(finished);
  const sideA = round.sideA || 3;
  const sideB = sideA === 3 ? 2 : 3;

  const headers = ['Player', 'K', 'A', 'D', '+/-', 'ADR', 'HS%', '$'];
  const rowsFor = (players) => players
    .map((i) => ({ i, k: stats.k[i], a: stats.a[i], d: stats.d[i] }))
    .sort((x, y) => y.k - x.k || y.a - x.a || x.d - y.d)
    .map(({ i, k, a, d }) => {
      const p = current.get(i);
      const dead = p !== undefined && p[3] <= 0;
      return `<tr class="${dead ? 'dead' : ''}">${playerCell(i)}
        <td>${k}</td><td>${a}</td><td>${d}</td>
        <td class="${diffClass(k - d)}">${signed(k - d)}</td>
        <td>${(stats.dmg[i] / rounds).toFixed(0)}</td><td>${percent(stats.hs[i], k)}%</td>
        <td class="sb-money">${money.has(i) ? '$' + money.get(i) : ''}</td></tr>`;
    }).join('');

  const html = `
    <div class="sb-title">Round ${round.n} / ${data.rounds.length}</div>
    <div class="sb-teams">
      ${teamBlock(data.nameA, sideA, scores.A, headers, rowsFor(data.teamA))}
      ${teamBlock(data.nameB, sideB, scores.B, headers, rowsFor(data.teamB))}
    </div>`;
  if (html === lastLiveHtml) return;
  lastLiveHtml = html;
  livePanel.innerHTML = html;
}

function liveLoop() {
  if (!liveVisible) return;
  renderLive();
  requestAnimationFrame(liveLoop);
}

function showLive() {
  if (!state.data || liveVisible) return;
  liveVisible = true;
  livePanel.style.display = 'block';
  liveLoop();
}

function hideLive() {
  liveVisible = false;
  livePanel.style.display = 'none';
}

const matchOverlay = document.createElement('div');
matchOverlay.id = 'matchstats';

const isMatchOpen = () => matchOverlay.style.display === 'flex';

function closeMatch() {
  matchOverlay.style.display = 'none';
}

function renderMatch() {
  const { data } = state;
  ensureIndex();

  const rounds = data.rounds.length;
  const total = index[rounds];
  const scores = scoreAfter(rounds);
  const sideA = data.rounds[rounds - 1].sideA || 3;
  const sideB = sideA === 3 ? 2 : 3;

  const headers = ['Player', 'K', 'A', 'D', 'K/D', '+/-', 'ADR', 'HS%', 'FK', 'FD', 'FA', '2K', '3K', '4K', '5K'];
  const rowsFor = (players) => players
    .map((i) => ({ i, k: total.k[i], a: total.a[i], d: total.d[i] }))
    .sort((x, y) => y.k - x.k || y.a - x.a || x.d - y.d)
    .map(({ i, k, a, d }) => `<tr>${playerCell(i)}
        <td>${k}</td><td>${a}</td><td>${d}</td>
        <td>${d ? (k / d).toFixed(2) : k.toFixed(2)}</td>
        <td class="${diffClass(k - d)}">${signed(k - d)}</td>
        <td>${(total.dmg[i] / rounds).toFixed(1)}</td><td>${percent(total.hs[i], k)}%</td>
        <td>${extras.fk[i]}</td><td>${extras.fd[i]}</td><td>${extras.fa[i]}</td>
        <td>${extras.multi[2][i]}</td><td>${extras.multi[3][i]}</td><td>${extras.multi[4][i]}</td><td>${extras.multi[5][i]}</td>
      </tr>`).join('');

  matchOverlay.innerHTML = `
    <div class="ms-card">
      <button class="ms-close" title="Close (Esc)">&times;</button>
      <div class="sb-title">Full match stats &middot; ${escapeHtml(data.map)} &middot; ${rounds} rounds</div>
      <div class="sb-teams">
        ${teamBlock(data.nameA, sideA, scores.A, headers, rowsFor(data.teamA))}
        ${teamBlock(data.nameB, sideB, scores.B, headers, rowsFor(data.teamB))}
      </div>
      <div class="ms-legend">
        ADR: average damage per round (no friendly fire) &middot; FK / FD: first kill / first death of the round &middot;
        FA: flash assists &middot; 2K-5K: rounds with that many kills
      </div>
    </div>`;
  matchOverlay.querySelector('.ms-close').onclick = closeMatch;
}

function openMatch() {
  if (!state.data) return;
  renderMatch();
  matchOverlay.style.display = 'flex';
}

export function setupScoreboard() {
  $('#center').appendChild(livePanel);
  document.body.appendChild(matchOverlay);

  const matchButton = document.createElement('button');
  matchButton.textContent = 'Match stats';
  matchButton.onclick = () => (isMatchOpen() ? closeMatch() : openMatch());
  $('#tools').appendChild(matchButton);

  matchOverlay.addEventListener('click', (e) => {
    if (e.target === matchOverlay) closeMatch();
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      showLive();
    } else if (e.key === 'Escape') {
      closeMatch();
    }
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Tab') hideLive();
  });
  addEventListener('blur', hideLive);
}
