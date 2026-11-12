"""Rule-based plant condition logic.

Each sensor is rated good / warn / bad against the selected plant profile,
and the worst rating decides the overall state (healthy / normal / unhealthy).
"""

SENSORS = ("soil", "temp", "light", "humidity")
LABELS = {
    "soil": "Soil moisture",
    "temp": "Temperature",
    "light": "Light",
    "humidity": "Air humidity",
}
RANK = {"good": 0, "warn": 1, "bad": 2}
WEIGHTS = {"soil": 0.4, "light": 0.25, "temp": 0.2, "humidity": 0.15}

# Light is not judged between these hours: plants do not need light at night.
NIGHT_START, NIGHT_END = 19, 7

# ok = survivable range, ideal = where the plant is happy.
PROFILES = {
    "mint": {
        "name": "Mint",
        "latin": "Mentha spicata",
        "blurb": "Likes moist soil and bright, indirect light.",
        "soil": {"ok": (30, 85), "ideal": (45, 70)},
        "temp": {"ok": (10, 32), "ideal": (18, 26)},
        "light": {"ok": (1500, 40000), "ideal": (5000, 25000)},
        "humidity": {"ok": (30, 85), "ideal": (45, 70)},
    },
    "basil": {
        "name": "Basil",
        "latin": "Ocimum basilicum",
        "blurb": "Loves warmth and sun, hates the cold.",
        "soil": {"ok": (30, 80), "ideal": (45, 65)},
        "temp": {"ok": (13, 35), "ideal": (20, 29)},
        "light": {"ok": (3000, 50000), "ideal": (8000, 30000)},
        "humidity": {"ok": (25, 80), "ideal": (40, 65)},
    },
    "rosemary": {
        "name": "Rosemary",
        "latin": "Salvia rosmarinus",
        "blurb": "Prefers dry soil and lots of direct sun.",
        "soil": {"ok": (10, 55), "ideal": (20, 40)},
        "temp": {"ok": (5, 35), "ideal": (15, 28)},
        "light": {"ok": (4000, 60000), "ideal": (10000, 45000)},
        "humidity": {"ok": (15, 70), "ideal": (25, 50)},
    },
    "peace_lily": {
        "name": "Peace Lily",
        "latin": "Spathiphyllum wallisii",
        "blurb": "A shade lover that wants damp soil and humid air.",
        "soil": {"ok": (35, 90), "ideal": (50, 75)},
        "temp": {"ok": (13, 32), "ideal": (18, 27)},
        "light": {"ok": (150, 15000), "ideal": (500, 8000)},
        "humidity": {"ok": (35, 90), "ideal": (50, 80)},
    },
}
PROFILES["pot"] = {
    "name": "Mint (pot rules)",
    "latin": "Mentha spicata",
    "blurb": "Uses the same rules as the pot's own screen, so both always show the same face.",
    # ideal = the pot's thresholds, ok = the range used only for the health score
    "soil": {"ok": (0, 100), "ideal": (25, 85)},
    "temp": {"ok": (0, 45), "ideal": (15, 30)},
    "light": {"ok": (0, 100000), "ideal": (10, 100000), "note": "under 10 lx = sleepy"},
    "humidity": {"ok": (0, 100), "ideal": (45, 70)},   # shown and advised on, but never changes the face
    "pot_rules": True,
}
DEFAULT_PROFILE = "pot"

# The pot's face logic from firmware/smart_pot, in the same if / else-if order.
# (face, website mood, website state, sensor, direction, test). Health states follow plant_ai.
POT_RULES = [
    ("SLEEPY", "sleeping", "normal", "light", "low", lambda r: r["light"] < 10),
    ("THIRSTY", "thirsty", "normal", "soil", "low", lambda r: r["soil"] < 25),
    ("OVERWATERED", "drowning", "unhealthy", "soil", "high", lambda r: r["soil"] > 85),
    ("HOT", "hot", "unhealthy", "temp", "high", lambda r: r["temp"] > 30),
    ("COLD", "cold", "normal", "temp", "low", lambda r: r["temp"] < 15),
]
LEVEL_FOR_STATE = {"normal": "warn", "unhealthy": "bad"}

# (sensor, direction) -> {level: (title, advice)}
ADVICE = {
    ("soil", "low"): {
        "warn": ("Water soon", "The soil is drying out. Give {name} a drink within the next day."),
        "bad": ("Water me now", "Soil moisture is far too low. Water slowly until the soil is evenly moist."),
    },
    ("soil", "high"): {
        "warn": ("Hold the watering", "The soil is wetter than {name} likes. Skip the next watering."),
        "bad": ("Too much water", "The soil is waterlogged and the roots can rot. Stop watering and let the pot drain."),
    },
    ("temp", "low"): {
        "warn": ("A bit chilly", "Move the pot away from cold windows and AC vents."),
        "bad": ("Too cold", "It is cold enough to damage the leaves. Move the pot somewhere warmer now."),
    },
    ("temp", "high"): {
        "warn": ("Getting warm", "Move the pot out of direct heat and check the soil more often."),
        "bad": ("Too hot", "Heat stress. Move the pot to a cooler, shaded spot and keep the soil moist."),
    },
    ("light", "low"): {
        "warn": ("Could use more light", "Move the pot closer to a window."),
        "bad": ("Too dark", "{name} cannot grow in this light. Move it to a bright spot or add a grow lamp."),
    },
    ("light", "high"): {
        "warn": ("Very bright", "Strong light dries the soil quickly. Give some shade at midday."),
        "bad": ("Sun scorch risk", "The light is strong enough to scorch the leaves. Move the pot out of direct sun."),
    },
    ("humidity", "low"): {
        "warn": ("Dry air", "Mist the leaves or group the pot with other plants."),
    },
    ("humidity", "high"): {
        "warn": ("Humid air", "Give the plant some airflow to prevent mould."),
    },
}

# Which problem picks the face when the plant is unhealthy, in priority order.
BAD_MOODS = [
    ("soil", "low", "thirsty"),
    ("soil", "high", "drowning"),
    ("temp", "high", "hot"),
    ("temp", "low", "cold"),
    ("light", "low", "dark"),
    ("light", "high", "dazzled"),
]

HEADLINES = {
    "happy": ("{name} is thriving", "HAPPY"),
    "neutral": ("{name} is doing okay", "OKAY"),
    "sad": ("{name} is unhappy", "SAD"),
    "thirsty": ("{name} needs water", "NEEDS WATER"),
    "drowning": ("{name} is overwatered", "TOO WET"),
    "hot": ("{name} is overheating", "TOO HOT"),
    "cold": ("{name} is freezing", "TOO COLD"),
    "dark": ("{name} needs more light", "TOO DARK"),
    "dazzled": ("{name} is getting scorched", "TOO BRIGHT"),
    "sleeping": ("{name} is resting", "SLEEPING"),
}


def is_night(hour):
    return hour >= NIGHT_START or hour < NIGHT_END


def _rate(value, spec, prev=None):
    """Rate one value. A small hysteresis margin stops the level flickering
    when a noisy reading sits right on a threshold."""
    (ok_lo, ok_hi), (id_lo, id_hi) = spec["ok"], spec["ideal"]

    def raw(margin):
        if value < ok_lo + margin or value > ok_hi - margin:
            return "bad"
        if value < id_lo + margin or value > id_hi - margin:
            return "warn"
        return "good"

    level = raw(0)
    if prev and RANK[prev] > RANK[level]:
        strict = raw(0.02 * (ok_hi - ok_lo))
        level = strict if RANK[strict] <= RANK[prev] else prev
    direction = None
    if level != "good":
        direction = "low" if value < (id_lo + id_hi) / 2 else "high"
    return level, direction


def _score(value, spec):
    """100 inside the ideal range, 50 at the edge of the ok range, then down to 0."""
    (ok_lo, ok_hi), (id_lo, id_hi) = spec["ok"], spec["ideal"]
    if id_lo <= value <= id_hi:
        return 100.0
    if value < id_lo:
        gap, dist = max(id_lo - ok_lo, 1e-9), id_lo - value
    else:
        gap, dist = max(ok_hi - id_hi, 1e-9), value - id_hi
    return max(0.0, 100.0 - 50.0 * dist / gap)


def evaluate_pot(reading, profile):
    """Same face as the pot's screen. Every rule that matches is shown on the sensor cards,
    and the first one in the pot's order picks the face, state and headline."""
    name = profile["name"].split(" (")[0]
    levels = {s: {"level": "good", "dir": None, "score": round(_score(reading[s], profile[s]), 1)} for s in SENSORS}
    matched = []
    for face, mood, state, s, direction, test in POT_RULES:
        if test(reading) and levels[s]["level"] == "good":
            matched.append((face, mood, state))
            if s == "light":
                levels[s].update(resting=True)   # dark: the pot sleeps, nothing is wrong
            else:
                levels[s].update(level=LEVEL_FOR_STATE[state], dir=direction)
    face, mood, state = matched[0] if matched else ("HAPPY", "happy", "healthy")
    # The pot ignores air humidity, so it can only be a yellow warning here
    lo, hi = profile["humidity"]["ideal"]
    if not lo <= reading["humidity"] <= hi:
        levels["humidity"].update(level="warn", dir="low" if reading["humidity"] < lo else "high")

    recommendations = []
    for s in SENSORS:
        lv = levels[s]
        if lv["level"] != "good":
            title, text = ADVICE[(s, lv["dir"])][lv["level"]]
            recommendations.append({"sensor": s, "severity": lv["level"], "title": title, "text": text.format(name=name)})
    recommendations.sort(key=lambda r: -RANK[r["severity"]])

    scores = {s: levels[s]["score"] for s in SENSORS}
    score = round(0.5 * min(scores.values()) + 0.5 * sum(scores[s] * WEIGHTS[s] for s in SENSORS))
    if recommendations:
        subline = recommendations[0]["text"]
    elif mood == "sleeping":
        subline = f"It is dark, so {name} is sleeping."
    else:
        subline = "Soil, light and temperature are all within the pot's healthy range."
    return {
        "state": state, "mood": mood, "score": score, "night": mood == "sleeping",
        "levels": levels, "headline": HEADLINES[mood][0].format(name=name), "subline": subline,
        "display": face, "recommendations": recommendations,
    }


def evaluate(reading, profile_id, hour, prev_levels=None):
    """reading: {soil, temp, light, humidity}. Returns the full plant condition."""
    profile = PROFILES[profile_id]
    if profile.get("pot_rules"):
        return evaluate_pot(reading, profile)
    name = profile["name"]
    prev_levels = prev_levels or {}
    night = is_night(hour)

    levels = {}
    for s in SENSORS:
        if s == "light" and night:
            levels[s] = {"level": "good", "dir": None, "score": 100.0, "resting": True}
            continue
        level, direction = _rate(reading[s], profile[s], prev_levels.get(s))
        # Humidity is a minor factor: it can make the plant "normal" but never "unhealthy".
        if s == "humidity" and level == "bad":
            level = "warn"
        levels[s] = {"level": level, "dir": direction, "score": round(_score(reading[s], profile[s]), 1)}

    worst = max(RANK[l["level"]] for l in levels.values())
    state = ("healthy", "normal", "unhealthy")[worst]

    scores = {s: levels[s]["score"] for s in SENSORS}
    mean = sum(scores[s] * WEIGHTS[s] for s in SENSORS)
    score = round(0.5 * min(scores.values()) + 0.5 * mean)

    recommendations = []
    for s in SENSORS:
        lv = levels[s]
        if lv["level"] == "good":
            continue
        title, text = ADVICE[(s, lv["dir"])][lv["level"]]
        recommendations.append({
            "sensor": s, "severity": lv["level"],
            "title": title, "text": text.format(name=name),
        })
    recommendations.sort(key=lambda r: -RANK[r["severity"]])

    if state == "unhealthy":
        mood = "sad"
        for s, d, m in BAD_MOODS:
            if levels[s]["level"] == "bad" and levels[s]["dir"] == d:
                mood = m
                break
    elif night:
        mood = "sleeping"
    else:
        mood = "happy" if state == "healthy" else "neutral"

    headline, display = HEADLINES[mood]
    if recommendations:
        subline = recommendations[0]["text"]
    elif night:
        subline = "It is night, so the light sensor is ignored until morning."
    else:
        subline = "Soil, light, temperature and air are all in the ideal range."

    return {
        "state": state, "mood": mood, "score": score, "night": night,
        "levels": levels,
        "headline": headline.format(name=name), "subline": subline,
        "display": display, "recommendations": recommendations,
    }
