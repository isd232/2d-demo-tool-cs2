export const SIDE_COLOR = { 3: '#4aa3ff', 2: '#ff8a1f' };
export const SIDE_BG = { 3: '#2f7fd6', 2: '#e8730c' };

export const GRENADE_RGB = {
  smoke: '210,220,230',
  flash: '255,255,170',
  he: '255,90,60',
  molly: '255,60,30',
  decoy: '170,170,170',
};

export const FOV_LENGTH_UNITS = 260;
export const ROUND_SECONDS = 115;
export const BOMB_SECONDS = 40;

export const SMOKE_TIMER_FROM = 10;
export const MOLLY_TIMER_FROM = 5;

export const FIRE_ANIM_SECONDS = 0.18;
export const HIT_ANIM_SECONDS = 0.5;

export const KILLFEED_SECONDS = 6;
export const KILLFEED_MAX = 5;

export function smoothstep(x) {
  const s = Math.min(1, Math.max(0, x));
  return s * s * (3 - 2 * s);
}
