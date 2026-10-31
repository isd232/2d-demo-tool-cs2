export const $ = (selector) => document.querySelector(selector);

export const state = {
  data: null,
  round: null,
  roundIndex: 0,
  tick: 0,
  playing: false,
  speed: 1,
  level: 0,
  showAvatars: true,
  view: { zoom: 1, x: 0, y: 0 },
  radar: { main: null, lower: null },
  avatarImages: [],
  fires: new Map(),
  hurts: new Map(),
};
