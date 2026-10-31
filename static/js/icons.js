const ALIASES = {
  'ak-47': 'ak47', 'm4a4': 'm4a1', 'm4a1': 'm4a1', 'm4a1-s': 'm4a1_silencer', 'm4a1 silencer': 'm4a1_silencer',
  'awp': 'awp', 'aug': 'aug', 'sg 553': 'sg556', 'sg553': 'sg556', 'galil ar': 'galilar', 'famas': 'famas',
  'ssg 08': 'ssg08', 'scar-20': 'scar20', 'g3sg1': 'g3sg1',
  'mac-10': 'mac10', 'mp9': 'mp9', 'mp7': 'mp7', 'mp5-sd': 'mp5sd', 'ump-45': 'ump45', 'p90': 'p90', 'pp-bizon': 'bizon',
  'nova': 'nova', 'xm1014': 'xm1014', 'mag-7': 'mag7', 'sawed-off': 'sawedoff', 'm249': 'm249', 'negev': 'negev',
  'glock-18': 'glock', 'usp-s': 'usp_silencer', 'p2000': 'hkp2000', 'p250': 'p250', 'five-seven': 'fiveseven',
  'tec-9': 'tec9', 'cz75-auto': 'cz75a', 'desert eagle': 'deagle', 'dual berettas': 'elite', 'r8 revolver': 'revolver',
  'zeus x27': 'taser', 'zeus': 'taser', 'c4 explosive': 'c4', 'c4': 'c4', 'knife': 'knife',
  'he grenade': 'hegrenade', 'flashbang': 'flashbang', 'smoke grenade': 'smokegrenade',
  'molotov': 'molotov', 'incendiary grenade': 'incgrenade', 'decoy grenade': 'decoy',
  'inferno': 'inferno', 'planted_c4': 'planted_c4',
};
const KNOWN_FILES = new Set(Object.values(ALIASES));
const KNIFE_WORDS = /knife|bayonet|karambit|dagger|bowie|butterfly|falchion|huntsman|navaja|stiletto|talon|ursus|nomad|paracord|survival|skeleton|classic/;

const PISTOLS = new Set(['glock', 'usp_silencer', 'hkp2000', 'p250', 'fiveseven', 'tec9', 'cz75a', 'deagle', 'elite', 'revolver']);
const GRENADE_FILES = { hegrenade: 'he', flashbang: 'flash', smokegrenade: 'smoke', molotov: 'molly', incgrenade: 'molly', decoy: 'decoy' };

export const cleanName = (raw) => String(raw || '').split('|')[0].trim();

export function itemFile(raw) {
  if (!raw) return null;
  const n = cleanName(raw).toLowerCase().replace(/^weapon_/, '').replace(/^(stattrak\u2122|souvenir)\s+/, '');
  if (ALIASES[n]) return ALIASES[n];
  if (KNOWN_FILES.has(n)) return n;
  if (KNIFE_WORDS.test(n)) return 'knife';
  return null;
}

export function category(file) {
  if (!file) return 'other';
  if (GRENADE_FILES[file]) return 'grenade';
  if (PISTOLS.has(file)) return 'pistol';
  if (file === 'knife') return 'knife';
  if (file === 'c4' || file === 'taser') return 'other';
  return 'primary';
}

export function grenadeFile(kind, side) {
  switch (kind) {
    case 'he': return 'hegrenade';
    case 'flash': return 'flashbang';
    case 'smoke': return 'smokegrenade';
    case 'decoy': return 'decoy';
    case 'molly': return side === 3 ? 'incgrenade' : 'molotov';
    default: return null;
  }
}

export const GRENADE_ORDER = ['hegrenade', 'flashbang', 'smokegrenade', 'molotov', 'incgrenade', 'decoy'];

export const iconSrc = (file) => `/icons/${file}.svg`;

const imageCache = new Map();

export function iconImage(file) {
  if (!imageCache.has(file)) {
    const img = new Image();
    img.src = iconSrc(file);
    imageCache.set(file, img);
  }
  return imageCache.get(file);
}

const isLoaded = (img) => img && img.complete && img.naturalWidth > 0;

const SVG_START = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
const FALLBACK_SVG = {
  he: '<ellipse cx="12" cy="14.5" rx="6.5" ry="8" fill="#7a9a3c" stroke="#10170a" stroke-width="1.2"/><rect x="9.5" y="2.5" width="5" height="4" rx="1" fill="#cfcfcf"/>',
  smoke: '<rect x="7.5" y="6" width="9" height="16" rx="2" fill="#aab6c2" stroke="#1a2027"/><rect x="7.5" y="11" width="9" height="4" fill="#eef3f8"/><rect x="9.5" y="2" width="5" height="4.5" rx="1" fill="#6f7c89"/>',
  flash: '<rect x="7.5" y="6" width="9" height="16" rx="2" fill="#f2e98a" stroke="#2b2810"/><rect x="7.5" y="11" width="9" height="4" fill="#fff"/><rect x="9.5" y="2" width="5" height="4.5" rx="1" fill="#8a8a8a"/>',
  molly: '<path d="M9 11h6l1.2 3v6a2 2 0 0 1-2 2h-4.4a2 2 0 0 1-2-2v-6z" fill="#6fb5cc"/><rect x="10.5" y="8" width="3" height="3.4" fill="#6fb5cc"/><path d="M12 1.2c1.9 2.7 3.5 3.5 2.3 5.8-.6 1.1-2.7 1.1-3.1 0-.5-1.5.4-2.5.8-5.8z" fill="#ff5a1f"/>',
  decoy: '<circle cx="12" cy="14" r="7" fill="#8c8c8c" stroke="#1d1d1d"/><rect x="10" y="3" width="4" height="3.5" fill="#555"/>',
};

const fallbackImages = {};
for (const kind in FALLBACK_SVG) {
  fallbackImages[kind] = new Image();
  fallbackImages[kind].src = 'data:image/svg+xml;utf8,' + encodeURIComponent(SVG_START + FALLBACK_SVG[kind] + '</svg>');
}

export function grenadeImage(kind, side) {
  const img = iconImage(grenadeFile(kind, side));
  return isLoaded(img) ? img : fallbackImages[kind];
}

const badge = (body) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke-width="1.6">' + body + '</svg>');

export const BADGE = {
  headshot: badge('<circle cx="8" cy="8" r="5" stroke="#ff5a4f"/><circle cx="8" cy="8" r="1.2" fill="#ff5a4f" stroke="none"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="#ff5a4f"/>'),
  wallbang: badge('<rect x="1.5" y="2.5" width="13" height="11" stroke="#d7c9a3"/><path d="M1.5 6.2h13M1.5 9.8h13M6 2.5v3.7M10.5 6.2v3.6M6 9.8v3.7" stroke="#d7c9a3"/>'),
  noscope: badge('<circle cx="8" cy="8" r="5.5" stroke="#e6e6e6"/><path d="M3 13L13 3" stroke="#ff5a4f"/>'),
  smoke: badge('<circle cx="5.5" cy="9.5" r="3" stroke="#aab6c2"/><circle cx="10" cy="8.5" r="3.4" stroke="#aab6c2"/><circle cx="8" cy="5.5" r="2.6" stroke="#aab6c2"/>'),
  blind: badge('<path d="M1.5 8C3.5 4.5 12.5 4.5 14.5 8 12.5 11.5 3.5 11.5 1.5 8z" stroke="#f2e98a"/><circle cx="8" cy="8" r="1.8" stroke="#f2e98a"/><path d="M3 13L13 3" stroke="#ff5a4f"/>'),
};
