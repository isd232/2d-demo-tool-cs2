import { state } from './state.js';

const HOLD_FRACTION = 0.3;
const MAX_LOOKBACK_SECONDS = 8;

let indexedRound = null;
let blindsByPlayer = new Map();

function indexRound() {
  if (state.round === indexedRound) return;
  indexedRound = state.round;
  blindsByPlayer = new Map();
  for (const [tick, player, duration] of state.round.blinds || []) {
    if (!blindsByPlayer.has(player)) blindsByPlayer.set(player, []);
    blindsByPlayer.get(player).push({ t: tick, duration });
  }
  for (const list of blindsByPlayer.values()) list.sort((a, b) => a.t - b.t);
}

export function blindStrength(player, tick) {
  indexRound();
  const list = blindsByPlayer.get(player);
  if (!list) return 0;

  const tickRate = state.data.tickrate;
  let strongest = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const blind = list[i];
    if (blind.t > tick) continue;
    const elapsed = (tick - blind.t) / tickRate;
    if (elapsed > MAX_LOOKBACK_SECONDS) break;
    const hold = blind.duration * HOLD_FRACTION;
    const strength = elapsed <= hold ? 1 : 1 - (elapsed - hold) / (blind.duration - hold);
    strongest = Math.max(strongest, strength);
  }
  return Math.max(0, Math.min(1, strongest));
}

export function drawBlindOverlay(ctx, x, y, radius, strength) {
  if (strength <= 0.01) return;
  const discRadius = strength >= 0.99 ? radius + 2 : radius * strength;
  const feather = Math.min(2, discRadius * 0.3);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, discRadius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(Math.max(0, 1 - feather / discRadius), '#ffffff');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, discRadius, 0, Math.PI * 2);
  ctx.fill();
}
