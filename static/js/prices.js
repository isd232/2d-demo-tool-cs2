import { itemFile } from './icons.js';

export const ITEM_PRICES = {
  ak47: 2700, m4a1: 3100, m4a1_silencer: 2900, awp: 4750, aug: 3300, sg556: 3000,
  galilar: 1800, famas: 1950, ssg08: 1700, scar20: 5000, g3sg1: 5000,
  mac10: 1050, mp9: 1250, mp7: 1500, mp5sd: 1500, ump45: 1200, p90: 2350, bizon: 1400,
  nova: 1050, xm1014: 2000, mag7: 1300, sawedoff: 1100, m249: 5200, negev: 1700,
  glock: 0, usp_silencer: 0, hkp2000: 0, p250: 300, fiveseven: 500, tec9: 500,
  cz75a: 500, deagle: 700, elite: 300, revolver: 600,
  taser: 200, hegrenade: 300, flashbang: 200, smokegrenade: 300,
  molotov: 400, incgrenade: 600, decoy: 50,
};

const KEVLAR_PRICE = 650;
const HELMET_AND_KEVLAR_PRICE = 1000;
const DEFUSE_KIT_PRICE = 400;

export const BUY_LIMITS = { eco: 5000, semiEco: 10000, force: 20000 };

export function loadoutOf(snapshotRow, items) {
  const [, armorValue, balance, flags, , inventory] = snapshotRow;
  const files = inventory.map((i) => itemFile(items[i])).filter(Boolean);
  const helmet = (flags & 1) !== 0;
  const defuser = (flags & 2) !== 0;

  let value = 0;
  for (const file of files) value += ITEM_PRICES[file] ?? 0;
  if (armorValue > 0) value += helmet ? HELMET_AND_KEVLAR_PRICE : KEVLAR_PRICE;
  if (defuser) value += DEFUSE_KIT_PRICE;

  return { value, bank: balance, files, armor: armorValue, helmet, defuser };
}

export function pistolRoundNumbers(rounds) {
  const numbers = new Set(rounds.length ? [rounds[0].n] : []);
  for (let i = 1; i < rounds.length; i++) {
    if (rounds[i].sideA !== rounds[i - 1].sideA) {
      numbers.add(rounds[i].n);
      break;
    }
  }
  return numbers;
}

export function buyLabel(totalValue, playerCount, isPistolRound) {
  if (isPistolRound) return 'Pistol round';
  const scaled = playerCount ? (totalValue / playerCount) * 5 : 0;
  if (scaled < BUY_LIMITS.eco) return 'Eco';
  if (scaled < BUY_LIMITS.semiEco) return 'Semi-eco';
  if (scaled < BUY_LIMITS.force) return 'Force buy';
  return 'Full buy';
}
