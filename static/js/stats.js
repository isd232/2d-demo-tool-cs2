const zeros = (n) => new Array(n).fill(0);

const emptyTotals = (n) => ({
  k: zeros(n),
  d: zeros(n),
  a: zeros(n),
  hs: zeros(n),
  dmg: zeros(n),
});

const cloneTotals = (t) => ({
  k: [...t.k], d: [...t.d], a: [...t.a], hs: [...t.hs], dmg: [...t.dmg],
});

const sameTeam = (sides, p1, p2) => sides[p1] !== undefined && sides[p1] === sides[p2];

const isValidKill = (e, sides) => e.attackerId >= 0 && e.attackerId !== e.victimId && !sameTeam(sides, e.attackerId, e.victimId);

function addKill(totals, e, sides) {
  if (e.victimId >= 0) totals.d[e.victimId]++;
  if (e.assisterId >= 0 && !sameTeam(sides, e.assisterId, e.victimId)) totals.a[e.assisterId]++;
  if (isValidKill(e, sides)) {
    totals.k[e.attackerId]++;
    if (e.hs) totals.hs[e.attackerId]++;
  }
}

function addHurt(totals, hurt, sides) {
  const [, victim, damage, attacker] = hurt;
  if (attacker === undefined || attacker < 0 || attacker === victim) return;
  if (sameTeam(sides, attacker, victim)) return;
  totals.dmg[attacker] += damage;
}

export function buildStatsIndex(data) {
  const n = data.players.length;
  const prefix = [emptyTotals(n)];
  data.rounds.forEach((round, i) => {
    const totals = cloneTotals(prefix[i]);
    for (const e of round.events) if (e.type === 'kill') addKill(totals, e, round.sides);
    for (const hurt of round.hurts || []) addHurt(totals, hurt, round.sides);
    prefix.push(totals);
  });
  return prefix;
}

export function statsAt(data, prefix, roundIndex, tick) {
  const totals = cloneTotals(prefix[roundIndex]);
  const round = data.rounds[roundIndex];
  for (const e of round.events) {
    if (e.type === 'kill' && e.t <= tick) addKill(totals, e, round.sides);
  }
  for (const hurt of round.hurts || []) {
    if (hurt[0] <= tick) addHurt(totals, hurt, round.sides);
  }
  return totals;
}

export function roundsPlayed(round, roundIndex, tick) {
  const winTick = round.winTick ?? round.end;
  return Math.max(1, roundIndex + (tick >= winTick ? 1 : 0));
}

export function buildMatchExtras(data) {
  const n = data.players.length;
  const extras = {
    fk: zeros(n),
    fd: zeros(n),
    fa: zeros(n),
    multi: { 2: zeros(n), 3: zeros(n), 4: zeros(n), 5: zeros(n) },
  };

  for (const round of data.rounds) {
    const kills = round.events.filter((e) => e.type === 'kill').sort((a, b) => a.t - b.t);
    const killsThisRound = zeros(n);
    let openingDone = false;

    for (const e of kills) {
      if (e.flashAssist && e.assisterId >= 0 && !sameTeam(round.sides, e.assisterId, e.victimId)) extras.fa[e.assisterId]++;
      if (!isValidKill(e, round.sides)) continue;
      killsThisRound[e.attackerId]++;
      if (!openingDone) {
        openingDone = true;
        extras.fk[e.attackerId]++;
        if (e.victimId >= 0) extras.fd[e.victimId]++;
      }
    }
    killsThisRound.forEach((count, player) => {
      if (count >= 2) extras.multi[Math.min(count, 5)][player]++;
    });
  }
  return extras;
}
