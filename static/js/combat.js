import { state } from './state.js';
import { FIRE_ANIM_SECONDS, HIT_ANIM_SECONDS } from './config.js';

function groupByPlayer(rows) {
  const map = new Map();
  for (const row of rows) {
    const tick = row[0];
    const player = row[1];
    if (!map.has(player)) map.set(player, []);
    map.get(player).push(tick);
  }
  for (const list of map.values()) list.sort((a, b) => a - b);
  return map;
}

export function indexCombatEvents() {
  state.fires = groupByPlayer(state.round.fires || []);
  state.hurts = groupByPlayer(state.round.hurts || []);
}

function secondsSinceLast(list, tick, tickRate) {
  if (!list || !list.length || list[0] > tick) return Infinity;
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid] <= tick) lo = mid;
    else hi = mid - 1;
  }
  return (tick - list[lo]) / tickRate;
}

export function fireStrength(player, tick) {
  const age = secondsSinceLast(state.fires.get(player), tick, state.data.tickrate);
  return Math.max(0, 1 - age / FIRE_ANIM_SECONDS);
}

export function hitStrength(player, tick) {
  const age = secondsSinceLast(state.hurts.get(player), tick, state.data.tickrate);
  return Math.max(0, 1 - age / HIT_ANIM_SECONDS);
}
