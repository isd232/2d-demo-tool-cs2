import hashlib
import json
import math
import os
import re
import shutil
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory, abort
from demoparser2 import DemoParser

try:
    import orjson
except ImportError:
    orjson = None

BASE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(BASE, "cache")
MAPS = os.path.join(BASE, "maps")
ICONS = os.path.join(BASE, "icons")
for directory in (CACHE, MAPS, ICONS):
    os.makedirs(directory, exist_ok=True)

CACHE_VERSION = "v11"
TICKRATE = 64
STEP = 4
SNAPSHOT_INTERVAL = 64
SMOKE_TICKS = 18 * TICKRATE
MOLLY_TICKS = 7 * TICKRATE
MAX_FLIGHT_TICKS = 8 * TICKRATE
POST_ROUND_TICKS = 7 * TICKRATE
MAX_POST_ROUND_TICKS = 15 * TICKRATE
MAX_STORED_JOBS = 20

EVENT_NAMES = [
    "round_freeze_end", "round_end", "round_start", "round_officially_ended",
    "smokegrenade_detonate", "flashbang_detonate", "hegrenade_detonate", "inferno_startburn",
    "smokegrenade_expired", "inferno_expire",
    "bomb_planted", "bomb_defused", "bomb_exploded",
    "weapon_fire", "player_hurt", "player_blind",
]

STAGES = [
    ("events", "Reading events", 10),
    ("tick data", "Reading player positions", 15),
    ("prepare ticks", "Preparing positions", 5),
    ("grenades", "Tracking grenades", 25),
    ("snapshots", "Reading equipment", 20),
    ("build rounds", "Building rounds", 8),
    ("team names", "Finding team names", 5),
    ("avatars (waiting)", "Loading avatars", 7),
    ("radar", "Loading map radar", 2),
    ("write json", "Saving replay", 3),
]
STAGE_INFO = {}
_cumulative = 0
for _key, _label, _weight in STAGES:
    STAGE_INFO[_key] = (_label, _cumulative, _cumulative + _weight)
    _cumulative += _weight

FALLBACK_MAP_DATA = {
    "de_mirage": {"pos_x": -3230, "pos_y": 1713, "scale": 5.0},
    "de_dust2": {"pos_x": -2476, "pos_y": 3239, "scale": 4.4},
    "de_inferno": {"pos_x": -2087, "pos_y": 3870, "scale": 4.9},
    "de_nuke": {"pos_x": -3453, "pos_y": 2887, "scale": 7.0},
    "de_ancient": {"pos_x": -2953, "pos_y": 2164, "scale": 5.0},
    "de_anubis": {"pos_x": -2796, "pos_y": 3328, "scale": 5.22},
    "de_overpass": {"pos_x": -4831, "pos_y": 1781, "scale": 5.2},
    "de_vertigo": {"pos_x": -3168, "pos_y": 1762, "scale": 4.0},
    "de_train": {"pos_x": -2308, "pos_y": 2078, "scale": 4.082},
}

ICON_SOURCES = [
    "https://raw.githubusercontent.com/Juknum/counter-strike-icons/main/cs2/panorama/images/icons/equipment/{n}.svg",
    "https://cdn.jsdelivr.net/gh/Juknum/counter-strike-icons@main/cs2/panorama/images/icons/equipment/{n}.svg",
]
failed_icons = set()

NON_FIRING_WEAPONS = (
    "knife", "bayonet", "karambit", "hegrenade", "flashbang", "smokegrenade",
    "molotov", "incgrenade", "decoy", "c4", "taser",
)

app = Flask(__name__)

jobs = {}
job_context = threading.local()


def report(percent, label):
    job = getattr(job_context, "job", None)
    if job is not None:
        job["percent"] = round(percent, 1)
        job["label"] = label


@contextmanager
def timed(label):
    info = STAGE_INFO.get(label)
    if info:
        report(info[1], info[0])
    start = time.perf_counter()
    yield
    print(f"[time] {label}: {time.perf_counter() - start:.2f}s")
    if info:
        report(info[2], info[0])


def ensure_radar(map_name):
    info = {
        "map_data": FALLBACK_MAP_DATA.get(map_name),
        "has_image": False,
        "has_lower": False,
        "lower_max": None,
    }
    main_path = os.path.join(MAPS, f"{map_name}.png")
    lower_path = os.path.join(MAPS, f"{map_name}_lower.png")
    try:
        from awpy import data as awpy_data

        map_data = awpy_data.map_data().get(map_name)
        if map_data:
            info["map_data"] = map_data
        if not os.path.exists(main_path):
            shutil.copy(awpy_data.radar_path(map_name), main_path)
        try:
            if not os.path.exists(lower_path):
                shutil.copy(awpy_data.radar_path(map_name, lower=True), lower_path)
        except Exception:
            pass
    except Exception as error:
        print(f"[radar] awpy data unavailable for {map_name}: {error}")
    info["has_image"] = os.path.exists(main_path)
    info["has_lower"] = os.path.exists(lower_path)
    if info["has_lower"] and info["map_data"]:
        lower_max = info["map_data"].get("lower_level_max_units")
        if lower_max is not None and lower_max > -999999:
            info["lower_max"] = lower_max
        else:
            info["has_lower"] = False
    return info


def retry_delay(error, attempt):
    header = error.headers.get("Retry-After") if error.headers else None
    try:
        return min(float(header), 6.0)
    except (TypeError, ValueError):
        return float(min(2 ** (attempt + 1), 6))


def fetch_avatar(steam_id, attempts=3):
    url = f"https://steamcommunity.com/profiles/{steam_id}/?xml=1"
    time.sleep(0.3)
    for attempt in range(attempts):
        try:
            request_obj = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request_obj, timeout=6) as response:
                profile = ET.fromstring(response.read())
            return (profile.findtext("avatarMedium") or profile.findtext("avatarFull") or "").strip()
        except urllib.error.HTTPError as error:
            if error.code != 429:
                print(f"[avatars] {steam_id}: {error}")
                return None
            if attempt < attempts - 1:
                time.sleep(retry_delay(error, attempt))
        except Exception as error:
            print(f"[avatars] {steam_id}: {error}")
            return None
    print(f"[avatars] {steam_id}: rate limited, will retry next time")
    return None


def fetch_avatars(steam_ids):
    cache_file = os.path.join(CACHE, "avatars.json")
    cache = {}
    if os.path.exists(cache_file):
        try:
            with open(cache_file) as handle:
                cache = json.load(handle)
        except Exception:
            cache = {}
    missing = [sid for sid in set(steam_ids) if sid and sid not in cache]
    if missing:
        with ThreadPoolExecutor(2) as pool:
            for sid, url in zip(missing, pool.map(fetch_avatar, missing)):
                if url is not None:
                    cache[sid] = url
        with open(cache_file, "w") as handle:
            json.dump(cache, handle)
    return {sid: cache.get(sid, "") for sid in steam_ids}


def as_frame(value):
    return value if isinstance(value, pd.DataFrame) else pd.DataFrame(value)


def safe_event(parser, name, **kwargs):
    try:
        return as_frame(parser.parse_event(name, **kwargs))
    except Exception:
        try:
            return as_frame(parser.parse_event(name))
        except Exception:
            return pd.DataFrame()


def load_events(parser, names):
    frames = {}
    try:
        result = parser.parse_events(names)
        items = result.items() if isinstance(result, dict) else result
        for name, frame in items:
            frames[name] = as_frame(frame)
    except Exception as error:
        print("[events] batch parse failed, reading events one by one:", error)
        frames = {name: safe_event(parser, name) for name in names}
    for name in names:
        frames.setdefault(name, pd.DataFrame())
    return frames


def to_number(value, default=0.0):
    try:
        number = float(value)
        return default if number != number else number
    except Exception:
        return default


def to_flag(value):
    try:
        return bool(value) and float(value) != 0
    except Exception:
        return False


def grenade_kind(raw):
    text = str(raw).lower()
    if "smoke" in text:
        return "smoke"
    if "flash" in text:
        return "flash"
    if "decoy" in text:
        return "decoy"
    if "molotov" in text or "incendiary" in text or "inferno" in text:
        return "molly"
    if "he" in text:
        return "he"
    return "other"


def first_column(columns_by_lower, *names):
    for name in names:
        if name in columns_by_lower:
            return columns_by_lower[name]
    return None


def normalize_side(winner):
    text = str(winner).strip().upper()
    if text in ("CT", "3"):
        return 3
    if text in ("T", "2"):
        return 2
    return 0


def split_flights(rows):
    flights, current = [], [rows[0]]
    for row in rows[1:]:
        previous = current[-1]
        if row[0] - previous[0] > 16 or math.hypot(row[1] - previous[1], row[2] - previous[2]) > 500:
            flights.append(current)
            current = [row]
        else:
            current.append(row)
    flights.append(current)
    return flights


def cut_at_rest(flight, window=16, epsilon=3.0):
    for i, a in enumerate(flight):
        if i < 4:
            continue
        j = next((k for k in range(i + 1, len(flight)) if flight[k][0] >= a[0] + window), None)
        if j is None:
            break
        b = flight[j]
        if math.hypot(b[1] - a[1], b[2] - a[2]) < epsilon and abs(b[3] - a[3]) < epsilon:
            return flight[: i + 1]
    return flight


def grenade_flights(parser):
    try:
        frame = as_frame(parser.parse_grenades())
    except Exception as error:
        print("[grenades] parse_grenades failed:", error)
        return []
    if frame.empty:
        print("[grenades] no grenade data")
        return []
    columns = {name.lower(): name for name in frame.columns}
    col_x, col_y, col_z = (first_column(columns, axis) for axis in ("x", "y", "z"))
    col_id = first_column(columns, "grenade_entity_id", "entity_id", "entityid")
    col_type = first_column(columns, "grenade_type", "type")
    col_name = first_column(columns, "name", "thrower")
    if not (col_x and col_y and col_id and col_type):
        print("[grenades] unknown columns:", list(frame.columns))
        return []
    frame = frame.dropna(subset=[col_x, col_y])
    flights = []
    for _, group in frame.groupby([col_id, col_type]):
        group = group.sort_values("tick")
        zs = group[col_z] if col_z else [0] * len(group)
        rows = [
            (int(t), to_number(x), to_number(y), to_number(z))
            for t, x, y, z in zip(group["tick"], group[col_x], group[col_y], zs)
        ]
        kind = grenade_kind(group[col_type].iloc[0])
        thrower = str(group[col_name].iloc[0]) if col_name else ""
        for flight in split_flights(rows):
            flights.append({"type": kind, "by": thrower, "rows": flight})
    print(f"[grenades] {len(flights)} flights")
    return flights


def build_trajectories(flights, detonations, round_info):
    result = []
    for flight in flights:
        rows = flight["rows"]
        start_tick = rows[0][0]
        if not (round_info["start"] <= start_tick <= round_info["end"]) or flight["type"] == "other":
            continue
        rows = [row for row in rows if row[0] <= start_tick + MAX_FLIGHT_TICKS]
        rows = cut_at_rest(rows)
        last_tick = rows[-1][0]
        best = None
        for det in detonations:
            if det["type"] != flight["type"] or not (start_tick <= det["t"] <= last_tick + 8):
                continue
            nearest = min(rows, key=lambda row: abs(row[0] - det["t"]))
            distance = math.hypot(nearest[1] - det["x"], nearest[2] - det["y"])
            if distance < 300 and (best is None or distance < best[0]):
                best = (distance, det)
        if best:
            det = best[1]
            rows = [row for row in rows if row[0] < det["t"]] + [(det["t"], det["x"], det["y"], det["z"])]
        if len(rows) < 2:
            continue
        points = [[row[0], round(row[1]), round(row[2]), round(row[3])] for row in rows]
        if len(points) > 3:
            points = points[:-1:2] + [points[-1]]
        result.append({"type": flight["type"], "by": flight["by"], "pts": points})
    return result


def parse_snapshots(parser, rounds, player_index):
    ticks = sorted({t for r in rounds for t in range(r["start"], r["end"], SNAPSHOT_INTERVAL)})
    props = [
        "balance", "armor_value", "has_helmet", "has_defuser",
        "active_weapon_name", "inventory", "name",
    ]
    try:
        frame = as_frame(parser.parse_ticks(props, ticks=ticks))
    except Exception as error:
        print("[snapshots] equipment data unavailable:", error)
        return [], {}
    items, item_ids = [], {}

    def item_id(name):
        name = str(name)
        if name not in item_ids:
            item_ids[name] = len(items)
            items.append(name)
        return item_ids[name]

    by_tick = {tick: group for tick, group in frame.groupby("tick")}
    result = {}
    for r in rounds:
        snapshots = []
        for tick in range(r["start"], r["end"], SNAPSHOT_INTERVAL):
            group = by_tick.get(tick)
            if group is None:
                continue
            rows = []
            for row in group.itertuples():
                index = player_index.get(getattr(row, "name", None))
                if index is None:
                    continue
                inventory = getattr(row, "inventory", None)
                try:
                    if inventory is not None and not isinstance(inventory, float):
                        inventory = [item_id(x) for x in list(inventory)]
                    else:
                        inventory = []
                except Exception:
                    inventory = []
                flags = (1 if getattr(row, "has_helmet", False) else 0) | (
                    2 if getattr(row, "has_defuser", False) else 0
                )
                active = getattr(row, "active_weapon_name", None)
                rows.append([
                    index,
                    int(to_number(getattr(row, "armor_value", 0))),
                    int(to_number(getattr(row, "balance", 0))),
                    flags,
                    item_id(active) if isinstance(active, str) else -1,
                    inventory,
                ])
            snapshots.append([tick, rows])
        result[r["n"]] = snapshots
    return items, result


def team_names(parser, tick, team_a, team_b, names):
    try:
        frame = as_frame(parser.parse_ticks(["team_clan_name", "name"], ticks=[tick]))
    except Exception:
        return None, None
    column = next((c for c in frame.columns if "clan" in c.lower()), None)
    if not column:
        return None, None

    def pick(members):
        wanted = {names[i] for i in members}
        values = [
            str(v) for n, v in zip(frame["name"], frame[column])
            if n in wanted and isinstance(v, str) and v.strip()
        ]
        return max(set(values), key=values.count) if values else None

    return pick(team_a), pick(team_b)


def combat_events(events, player_index):
    fires, hurts = [], []
    frame = events["weapon_fire"]
    if not frame.empty and "user_name" in frame.columns:
        weapon_column = "weapon" if "weapon" in frame.columns else None
        for row in frame.itertuples():
            index = player_index.get(getattr(row, "user_name", None))
            weapon = str(getattr(row, weapon_column, "")).lower() if weapon_column else ""
            if index is None or any(w in weapon for w in NON_FIRING_WEAPONS):
                continue
            fires.append([int(row.tick), index])
    frame = events["player_hurt"]
    if not frame.empty and "user_name" in frame.columns:
        for row in frame.itertuples():
            index = player_index.get(getattr(row, "user_name", None))
            if index is None:
                continue
            attacker = player_index.get(getattr(row, "attacker_name", None), -1)
            hurts.append([int(row.tick), index, int(to_number(getattr(row, "dmg_health", 0))), attacker])
    print(f"[combat] shots={len(fires)} hits={len(hurts)}")
    return fires, hurts


def blind_events(events, player_index):
    frame = events["player_blind"]
    blinds, last_seen = [], {}
    if frame.empty or "user_name" not in frame.columns:
        return blinds
    for row in frame.sort_values("tick").itertuples():
        index = player_index.get(getattr(row, "user_name", None))
        duration = to_number(getattr(row, "blind_duration", 0))
        if index is None or duration < 0.1:
            continue
        tick = int(row.tick)
        gap = tick - last_seen.get(index, -10**9)
        last_seen[index] = tick
        if gap < TICKRATE // 2:
            continue
        blinds.append([tick, index, round(duration, 2)])
    print(f"[blind] blinds={len(blinds)}")
    return blinds


def round_end_ticks(events, win_ticks):
    candidates = []
    for name in ("round_officially_ended", "round_start"):
        frame = events[name]
        if not frame.empty:
            candidates += [int(t) for t in frame["tick"]]
    candidates = sorted(set(candidates))
    result = []
    for win in win_ticks:
        following = next((t for t in candidates if t > win), None)
        limit = win + MAX_POST_ROUND_TICKS
        result.append(min(following, limit) if following else win + POST_ROUND_TICKS)
    return result


def prepare_player_ticks(frame, player_index):
    frame = frame[frame["team_num"].isin([2, 3]) & frame["name"].notna()]
    prepared = pd.DataFrame({
        "tick": frame["tick"].astype(int),
        "pi": frame["name"].map(player_index).astype(int),
        "X": frame["X"].fillna(0).round().astype(int),
        "Y": frame["Y"].fillna(0).round().astype(int),
        "health": frame["health"].fillna(0).astype(int),
        "yaw": frame["yaw"].fillna(0).round(1),
        "team": frame["team_num"].astype(int),
        "Z": frame["Z"].fillna(0).round().astype(int),
    })
    columns = ["pi", "X", "Y", "health", "yaw", "team", "Z"]
    ordered = prepared.sort_values("tick", kind="stable")
    tick_values = ordered["tick"].to_numpy()
    rows_by_tick = {}
    if len(tick_values):
        column_lists = [ordered[column].tolist() for column in columns]
        all_rows = [list(row) for row in zip(*column_lists)]
        boundaries = np.flatnonzero(np.diff(tick_values)) + 1
        starts = np.concatenate(([0], boundaries))
        ends = np.concatenate((boundaries, [len(tick_values)]))
        for start, end in zip(starts, ends):
            rows_by_tick[int(tick_values[start])] = all_rows[start:end]
    return prepared, rows_by_tick


def build_replay(parser, step=STEP):
    total_start = time.perf_counter()
    header = parser.parse_header()
    map_name = header.get("map_name", "unknown")

    with timed("events"):
        events = load_events(parser, EVENT_NAMES)
        deaths = safe_event(parser, "player_death", player=["X", "Y", "Z"])

    freeze = events["round_freeze_end"]
    ends = events["round_end"]
    if freeze.empty or ends.empty:
        raise ValueError("No round events found in this demo")
    ends = ends.sort_values("tick")
    freeze_ticks = sorted(int(t) for t in freeze["tick"])
    full_end_ticks = round_end_ticks(events, [int(t) for t in ends["tick"]])

    rounds, previous_win = [], 0
    for (_, row), full_end in zip(ends.iterrows(), full_end_ticks):
        win = int(row["tick"])
        starts = [t for t in freeze_ticks if previous_win < t < win]
        if starts:
            rounds.append({
                "start": starts[-1],
                "winTick": win,
                "end": full_end,
                "wSide": normalize_side(row.get("winner", "")),
                "reason": str(row.get("reason", "")),
            })
        previous_win = win
    for number, round_info in enumerate(rounds, 1):
        round_info["n"] = number

    wanted = sorted({
        t for r in rounds for t in list(range(r["start"], r["end"], step)) + [r["end"]]
    })
    props = ["X", "Y", "Z", "health", "team_num", "yaw", "name"]
    with timed("tick data"):
        ticks_frame = as_frame(parser.parse_ticks(props, ticks=wanted))
        ticks_frame = ticks_frame[ticks_frame["team_num"].isin([2, 3])]

    names = sorted(ticks_frame["name"].dropna().unique().tolist())
    player_index = {name: i for i, name in enumerate(names)}

    with timed("prepare ticks"):
        prepared, rows_by_tick = prepare_player_ticks(ticks_frame, player_index)

    steam_ids = {}
    if "steamid" in ticks_frame.columns:
        for name, value in ticks_frame.drop_duplicates("name")[["name", "steamid"]].itertuples(index=False):
            try:
                steam_id = str(int(value))
                if steam_id != "0":
                    steam_ids[name] = steam_id
            except Exception:
                pass
    avatar_pool = ThreadPoolExecutor(max_workers=1)
    avatar_future = avatar_pool.submit(fetch_avatars, list(steam_ids.values())) if steam_ids else None

    detonation_frames = {
        "smoke": events["smokegrenade_detonate"],
        "flash": events["flashbang_detonate"],
        "he": events["hegrenade_detonate"],
        "molly": events["inferno_startburn"],
    }
    expirations = []
    for event_name in ("smokegrenade_expired", "inferno_expire"):
        frame = events[event_name]
        if not frame.empty and "entityid" in frame.columns:
            expirations += [(int(r.entityid), int(r.tick)) for r in frame.itertuples()]
    bomb_frames = {
        "planted": events["bomb_planted"],
        "defused": events["bomb_defused"],
        "exploded": events["bomb_exploded"],
    }

    with timed("grenades"):
        flights = grenade_flights(parser)
    detonations = []
    for kind, frame in detonation_frames.items():
        for row in frame.itertuples():
            detonations.append({
                "type": kind,
                "t": int(row.tick),
                "x": to_number(getattr(row, "x", 0)),
                "y": to_number(getattr(row, "y", 0)),
                "z": to_number(getattr(row, "z", 0)),
            })
    all_fires, all_hurts = combat_events(events, player_index)
    all_blinds = blind_events(events, player_index)

    def within_round(frame, round_info):
        if frame.empty:
            return frame
        return frame[(frame["tick"] >= round_info["start"]) & (frame["tick"] <= round_info["end"])]

    with timed("snapshots"):
        items, snapshots = parse_snapshots(parser, rounds, player_index)

    output_rounds = []
    with timed("build rounds"):
        for round_info in rounds:
            frames = []
            for tick in range(round_info["start"], round_info["end"], step):
                rows = rows_by_tick.get(tick)
                if rows is not None:
                    frames.append([tick, rows])
            sides = {str(r[0]): r[5] for r in frames[0][1]} if frames else {}

            round_events = []
            for row in within_round(deaths, round_info).itertuples():
                attacker = str(getattr(row, "attacker_name", "") or "")
                victim = str(getattr(row, "user_name", "") or "")
                assister = str(getattr(row, "assister_name", "") or "")
                round_events.append({
                    "t": int(row.tick),
                    "type": "kill",
                    "att": attacker,
                    "vic": victim,
                    "ast": assister,
                    "attackerId": player_index.get(attacker, -1),
                    "victimId": player_index.get(victim, -1),
                    "assisterId": player_index.get(assister, -1),
                    "weapon": str(getattr(row, "weapon", "") or ""),
                    "hs": to_flag(getattr(row, "headshot", False)),
                    "wb": to_flag(getattr(row, "penetrated", 0)),
                    "ns": to_flag(getattr(row, "noscope", False)),
                    "smoke": to_flag(getattr(row, "thrusmoke", False)),
                    "blind": to_flag(getattr(row, "attackerblind", False)),
                    "flashAssist": to_flag(getattr(row, "assistedflash", False)),
                    "x": to_number(getattr(row, "user_X", 0)),
                    "y": to_number(getattr(row, "user_Y", 0)),
                    "z": to_number(getattr(row, "user_Z", 0)),
                })
            for kind, frame in detonation_frames.items():
                for row in within_round(frame, round_info).itertuples():
                    tick = int(row.tick)
                    entity = getattr(row, "entityid", None)
                    entity = int(entity) if entity is not None and entity == entity else None
                    default = SMOKE_TICKS if kind == "smoke" else MOLLY_TICKS if kind == "molly" else 0
                    end = tick
                    if default:
                        later = [t for (e, t) in expirations if e == entity and t >= tick]
                        end = min(later) if later else tick + default
                        end = min(end, tick + 2 * default)
                    round_events.append({
                        "t": tick,
                        "end": max(end, tick),
                        "type": kind,
                        "eid": entity,
                        "x": to_number(getattr(row, "x", 0)),
                        "y": to_number(getattr(row, "y", 0)),
                        "z": to_number(getattr(row, "z", 0)),
                    })
            for kind, frame in bomb_frames.items():
                for row in within_round(frame, round_info).itertuples():
                    round_events.append({"t": int(row.tick), "type": "bomb_" + kind})
            round_events.sort(key=lambda event: event["t"])

            output_rounds.append({
                **round_info,
                "frames": frames,
                "events": round_events,
                "sides": sides,
                "traj": build_trajectories(flights, detonations, round_info),
                "snaps": snapshots.get(round_info["n"], []),
                "fires": [f for f in all_fires if round_info["start"] <= f[0] <= round_info["end"]],
                "hurts": [h for h in all_hurts if round_info["start"] <= h[0] <= round_info["end"]],
                "blinds": [b for b in all_blinds if round_info["start"] <= b[0] <= round_info["end"]],
            })

    team_a, team_b = [], []
    first = next((r for r in output_rounds if r["sides"]), None)
    if first:
        team_a = sorted(int(k) for k, v in first["sides"].items() if v == 3)
        team_b = sorted(int(k) for k, v in first["sides"].items() if v == 2)
    for round_info in output_rounds:
        side_a = next(
            (round_info["sides"].get(str(i)) for i in team_a if str(i) in round_info["sides"]), 3
        )
        round_info["sideA"] = side_a
        if round_info["wSide"] == side_a:
            round_info["wTeam"] = "A"
        elif round_info["wSide"]:
            round_info["wTeam"] = "B"
        else:
            round_info["wTeam"] = ""
    name_a, name_b = (None, None)
    if first:
        with timed("team names"):
            name_a, name_b = team_names(parser, first["start"], team_a, team_b, names)

    bounds = None
    if len(prepared):
        bounds = {
            "minx": int(prepared["X"].min()), "maxx": int(prepared["X"].max()),
            "miny": int(prepared["Y"].min()), "maxy": int(prepared["Y"].max()),
        }

    with timed("avatars (waiting)"):
        avatar_by_id = avatar_future.result() if avatar_future else {}
    avatar_pool.shutdown()
    avatars = [avatar_by_id.get(steam_ids.get(name, ""), "") for name in names]

    with timed("radar"):
        radar = ensure_radar(map_name)

    print(
        f"[replay] rounds={len(output_rounds)} "
        f"trajectories={sum(len(r['traj']) for r in output_rounds)} "
        f"avatars={sum(1 for a in avatars if a)}/{len(avatars)}"
    )
    print(f"[time] total: {time.perf_counter() - total_start:.2f}s")
    return {
        "map": map_name,
        "tickrate": TICKRATE,
        "step": step,
        "players": names,
        "avatars": avatars,
        "teamA": team_a,
        "teamB": team_b,
        "nameA": name_a or "Team A",
        "nameB": name_b or "Team B",
        "items": items,
        "rounds": output_rounds,
        "bounds": bounds,
        **radar,
    }


def write_replay(path, data):
    if orjson:
        with open(path, "wb") as handle:
            handle.write(orjson.dumps(data, option=orjson.OPT_SERIALIZE_NUMPY))
    else:
        with open(path, "w") as handle:
            json.dump(data, handle, separators=(",", ":"))


def run_job(job, path):
    job_context.job = job
    try:
        digest = hashlib.sha1()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b""):
                digest.update(chunk)
        key = digest.hexdigest()[:14] + CACHE_VERSION
        cache_file = os.path.join(CACHE, key + ".json")
        if not os.path.exists(cache_file):
            data = build_replay(DemoParser(path))
            with timed("write json"):
                write_replay(cache_file, data)
        job.update(percent=100, label="Done", state="done", id=key)
    except Exception as error:
        print("[job] failed:", error)
        job.update(state="error", error=f"Parse error: {error}")
    finally:
        job_context.job = None
        try:
            os.unlink(path)
        except OSError:
            pass


def create_job():
    job_id = uuid.uuid4().hex
    job = {"percent": 0, "label": "Starting", "state": "running", "id": None, "error": None}
    jobs[job_id] = job
    while len(jobs) > MAX_STORED_JOBS:
        jobs.pop(next(iter(jobs)))
    return job_id, job


@app.get("/")
def index():
    return send_from_directory(BASE, "index.html")


@app.get("/maps/<path:filename>")
def serve_map(filename):
    return send_from_directory(MAPS, filename)


@app.get("/icons/<name>.svg")
def serve_icon(name):
    if not re.fullmatch(r"[a-z0-9_]+", name):
        abort(400)
    path = os.path.join(ICONS, name + ".svg")
    if not os.path.exists(path) and name not in failed_icons:
        for source in ICON_SOURCES:
            try:
                request_obj = urllib.request.Request(
                    source.format(n=name), headers={"User-Agent": "Mozilla/5.0"}
                )
                with urllib.request.urlopen(request_obj, timeout=8) as response:
                    data = response.read()
                if b"<svg" in data:
                    with open(path, "wb") as handle:
                        handle.write(data)
                    break
            except Exception:
                continue
        else:
            failed_icons.add(name)
    if not os.path.exists(path):
        abort(404)
    return send_from_directory(ICONS, name + ".svg", mimetype="image/svg+xml")


@app.post("/api/upload")
def upload():
    uploaded = request.files.get("demo")
    if not uploaded or not uploaded.filename.lower().endswith(".dem"):
        return jsonify(error="Upload a .dem file"), 400
    with tempfile.NamedTemporaryFile(suffix=".dem", delete=False) as temp:
        uploaded.save(temp.name)
        path = temp.name
    job_id, job = create_job()
    threading.Thread(target=run_job, args=(job, path), daemon=True).start()
    return jsonify(job=job_id)


@app.get("/api/progress/<job_id>")
def get_progress(job_id):
    job = jobs.get(job_id)
    if job is None:
        abort(404)
    return jsonify(job)


@app.get("/api/replay/<key>")
def get_replay(key):
    if not key.isalnum():
        abort(400)
    if not os.path.exists(os.path.join(CACHE, key + ".json")):
        abort(404)
    return send_from_directory(CACHE, key + ".json")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
