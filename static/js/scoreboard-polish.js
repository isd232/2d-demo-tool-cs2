import { state } from './state.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = new URL('../scoreboard-polish.css', import.meta.url).href;
document.head.appendChild(link);

const definitions = {
  Player: 'Player name',
  K: 'Kills',
  A: 'Assists',
  D: 'Deaths',
  'K/D': 'Kills divided by deaths',
  '+/-': 'Kills minus deaths',
  ADR: 'Average damage per round, excluding friendly fire',
  'HS%': 'Percentage of kills that were headshots',
  FK: 'First enemy kill of the round',
  FD: 'First death in an opening enemy kill',
  FA: 'Flash assists',
  '2K': 'Rounds with exactly two kills',
  '3K': 'Rounds with exactly three kills',
  '4K': 'Rounds with exactly four kills',
  '5K': 'Rounds with five or more kills',
  '$': 'Cash remaining at this point in the replay',
};

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

function snapshotAtTick() {
  if (!state.round) return null;
  const snapshots = state.round.snaps || [];
  let selected = null;
  for (const snapshot of snapshots) {
    if (snapshot[0] > state.tick) break;
    selected = snapshot;
  }
  return selected;
}

function polishTable(table, fullMatch) {
  const headers = [...table.querySelectorAll('thead th')];
  if (!headers.length) return;
  const count = headers.length;
  let columns = table.querySelector('colgroup');
  if (!columns) {
    columns = document.createElement('colgroup');
    for (let i = 0; i < count; i++) {
      const column = document.createElement('col');
      column.style.width = i === 0 ? '26%' : (74 / (count - 1)) + '%';
      columns.appendChild(column);
    }
    table.prepend(columns);
  }
  headers.forEach((header) => {
    const label = header.textContent.trim();
    header.title = definitions[label] || label;
    header.setAttribute('scope', 'col');
  });
  const labels = headers.map((h) => h.textContent.trim());
  const kdIndex = labels.indexOf('K/D');
  const deathIndex = labels.indexOf('D');
  const moneyIndex = labels.indexOf('$');
  const snapshot = !fullMatch ? snapshotAtTick() : null;
  const moneyByPlayer = new Map((snapshot ? snapshot[1] : []).map((row) => [row[0], row[2]]));

  for (const row of table.querySelectorAll('tbody tr')) {
    const cells = [...row.children];
    const nameCell = cells[0];
    if (!nameCell) continue;
    const name = nameCell.textContent.trim();
    nameCell.title = name;
    const playerIndex = state.data ? state.data.players.indexOf(name) : -1;
    if (kdIndex >= 0 && deathIndex >= 0 && Number(cells[deathIndex]?.textContent) === 0) {
      cells[kdIndex].textContent = '\u2014';
      cells[kdIndex].title = 'K/D is undefined with zero deaths';
    }
    if (moneyIndex >= 0) {
      const cell = cells[moneyIndex];
      const amount = moneyByPlayer.get(playerIndex);
      const available = typeof amount === 'number' && Number.isFinite(amount);
      const text = available ? '$' + amount.toLocaleString('en-US') : '\u2014';
      if (cell.textContent !== text) cell.textContent = text;
      cell.title = available ? 'Cash at the latest available snapshot' : 'Cash data unavailable';
    }
  }
}

function polishPanel(panel, fullMatch) {
  if (!panel || !state.data || !state.round) return;
  const title = panel.querySelector('.sb-title');
  if (title) {
    const text = fullMatch
      ? `FINAL MATCH STATS · ${String(state.data.map).toUpperCase()} · ${state.data.rounds.length} ROUNDS`
      : `LIVE STATS · ROUND ${state.round.n} · ${formatTime((state.tick - state.round.start) / state.data.tickrate)}`;
    if (title.textContent !== text) title.textContent = text;
  }
  panel.querySelectorAll('.sb-team table').forEach((table) => polishTable(table, fullMatch));
}

function update() {
  const live = document.querySelector('#scoreboard');
  const full = document.querySelector('#matchstats');
  if (live && getComputedStyle(live).display !== 'none') polishPanel(live, false);
  if (full && getComputedStyle(full).display !== 'none') polishPanel(full, true);
}

setInterval(update, 150);
