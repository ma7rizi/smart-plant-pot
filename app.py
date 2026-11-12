"""Smart Plant Pot backend: receives sensor readings, classifies the plant's
condition, stores everything and serves the web app.

Run:  python app.py                    demo with the simulated pot
      python app.py --real             real ESP32 pot over Wi-Fi, simulator switched off
      python app.py --real --usb COM5  also accept readings from a pot plugged in by USB
Then open http://localhost:5000
"""

import json
import logging
import os
import re
import sqlite3
import sys
import threading
import time
from datetime import datetime

from flask import Flask, jsonify, request

import rules
from simulator import Simulator, make_sim_api

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "plant.db")
PORT = int(os.environ.get("PORT", 5000))
REAL_POT = "--real" in sys.argv   # real hardware posts the readings, no simulator
USB_PORT = sys.argv[sys.argv.index("--usb") + 1] if "--usb" in sys.argv else None
OFFLINE_AFTER = 20 if REAL_POT else 6   # seconds without a reading before the pot counts as offline
MAX_READINGS = 20000
WATER_JUMP = 5          # % rise in soil moisture that counts as a watering
WATER_COOLDOWN = 10     # seconds between "watered" notifications

app = Flask(__name__, static_folder="static", static_url_path="")
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.row_factory = sqlite3.Row
lock = threading.Lock()

# Latest condition, kept in memory so the dashboard poll is cheap.
live = {"reading": None, "eval": None, "received": 0.0, "device_id": None,
        "last_watered": None, "profile": rules.DEFAULT_PROFILE, "via": None}


def init_db():
    db.executescript("""
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT, ts TEXT, received_at REAL,
            soil REAL, temp REAL, humidity REAL, light REAL,
            state TEXT, score INTEGER);
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at REAL, severity TEXT, sensor TEXT, title TEXT, message TEXT);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS support_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT, name TEXT, email TEXT, phone TEXT,
            topic TEXT, message TEXT, status TEXT DEFAULT 'new');
    """)
    row = db.execute("SELECT value FROM settings WHERE key='profile'").fetchone()
    if row and row["value"] in rules.PROFILES:
        live["profile"] = row["value"]
    last = db.execute("SELECT * FROM readings ORDER BY id DESC LIMIT 1").fetchone()
    if last:
        live["reading"] = {k: last[k] for k in ("ts", "soil", "temp", "humidity", "light")}
        live["device_id"] = last["device_id"]
        live["received"] = last["received_at"]
        live["eval"] = rules.evaluate(live["reading"], live["profile"], _hour(last["ts"]))
    db.commit()


def _hour(ts):
    t = datetime.fromisoformat(ts)
    return t.hour + t.minute / 60


def _prev_levels():
    if not live["eval"]:
        return None
    return {s: v["level"] for s, v in live["eval"]["levels"].items()}


def add_event(severity, title, message, sensor=None):
    db.execute("INSERT INTO events (received_at, severity, sensor, title, message) VALUES (?,?,?,?,?)",
               (time.time(), severity, sensor, title, message))


def events_for_change(old, new, name):
    """Notify when a sensor gets worse, or returns to ideal."""
    if not old:
        return
    for s in rules.SENSORS:
        was, now = old["levels"][s]["level"], new["levels"][s]["level"]
        if rules.RANK[now] > rules.RANK[was]:
            title, text = rules.ADVICE[(s, new["levels"][s]["dir"])][now]
            add_event(now, title, text.format(name=name), s)
        elif now == "good" and was != "good" and not new["levels"][s].get("resting"):
            add_event("good", f"{rules.LABELS[s]} back to ideal", f"{name} is comfortable again.", s)


# ---- API for the pot --------------------------------------------------
@app.post("/api/readings")
def post_reading():
    result = store_reading(request.get_json(silent=True) or {}, "wifi")
    if result is None:
        return jsonify(error="expected soil_moisture, temperature, humidity and light"), 400
    # The pot uses this reply to pick the face it shows on its screen.
    return jsonify(state=result["state"], mood=result["mood"], display=result["display"])


def store_reading(d, via):
    """Classify and store one reading. Returns the evaluation, or None if the reading is invalid."""
    try:
        reading = {
            "soil": float(d["soil_moisture"]), "temp": float(d["temperature"]),
            "humidity": float(d["humidity"]), "light": float(d["light"]),
        }
    except (KeyError, TypeError, ValueError):
        return None
    # A real pot has no clock, so the server stamps the reading if ts is missing.
    reading["ts"] = d.get("ts") or datetime.now().isoformat(timespec="seconds")
    device_id = str(d.get("device_id", "pot-01"))
    now = time.time()

    with lock:
        profile = live["profile"]
        name = rules.PROFILES[profile]["name"]
        result = rules.evaluate(reading, profile, _hour(reading["ts"]), _prev_levels())
        events_for_change(live["eval"], result, name)

        prev = live["reading"]
        if prev and reading["soil"] - prev["soil"] >= WATER_JUMP:
            if not live["last_watered"] or now - live["last_watered"] > WATER_COOLDOWN:
                add_event("info", "Watered",
                          f"Soil moisture rose from {prev['soil']:.0f}% to {reading['soil']:.0f}%.", "soil")
            live["last_watered"] = now

        cur = db.execute(
            "INSERT INTO readings (device_id, ts, received_at, soil, temp, humidity, light, state, score) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (device_id, reading["ts"], now, reading["soil"], reading["temp"],
             reading["humidity"], reading["light"], result["state"], result["score"]))
        if cur.lastrowid % 500 == 0:
            db.execute("DELETE FROM readings WHERE id <= ?", (cur.lastrowid - MAX_READINGS,))
        db.commit()
        live.update(reading=reading, eval=result, received=now, device_id=device_id, via=via)
    return result


def usb_bridge(port):
    """Forward readings from a pot plugged in by USB. Without Wi-Fi the pot prints them as 'DATA {...}'."""
    import serial
    while True:
        try:
            # DTR and RTS stay low so opening the port does not restart the ESP32
            ser = serial.Serial()
            ser.port, ser.baudrate, ser.timeout = port, 115200, 2
            ser.dtr = ser.rts = False
            ser.open()
            print(f"  USB: listening to the pot on {port}")
            while True:
                line = ser.readline().decode(errors="ignore").strip()
                if line.startswith("DATA "):
                    try:
                        store_reading(json.loads(line[5:]), "usb")
                    except ValueError:
                        pass
        except Exception as exc:   # unplugged or port busy: try again shortly
            print(f"  USB: {port} not available ({exc}), retrying in 5 s")
            time.sleep(5)


# ---- API for the web app ----------------------------------------------
def _profile_json(pid):
    return {"id": pid, **rules.PROFILES[pid]}


@app.get("/api/live")
def get_live():
    after = request.args.get("after", 0, type=int)
    with lock:
        if after:
            ev = db.execute("SELECT * FROM events WHERE id > ? ORDER BY id", (after,)).fetchall()
        else:
            ev = db.execute("SELECT * FROM events ORDER BY id DESC LIMIT 30").fetchall()[::-1]
        spark = db.execute(
            "SELECT soil, temp, humidity, light FROM readings ORDER BY id DESC LIMIT 60").fetchall()[::-1]
        total = db.execute("SELECT COUNT(*) FROM readings").fetchone()[0]
        age = time.time() - live["received"] if live["received"] else None
        return jsonify(
            online=age is not None and age < OFFLINE_AFTER,
            age=age, device_id=live["device_id"], via=live["via"],
            profile=_profile_json(live["profile"]),
            reading=live["reading"], eval=live["eval"],
            last_watered=live["last_watered"], total_readings=total, now=time.time(),
            events=[dict(e) for e in ev],
            spark={s: [r[s] for r in spark] for s in rules.SENSORS})


@app.get("/api/history")
def get_history():
    limit = max(10, min(2000, request.args.get("limit", 180, type=int)))
    with lock:
        rows = db.execute(
            "SELECT ts, soil, temp, humidity, light, state, score FROM readings "
            "ORDER BY id DESC LIMIT ?", (limit,)).fetchall()[::-1]
    return jsonify(readings=[dict(r) for r in rows], profile=_profile_json(live["profile"]))


@app.get("/api/profiles")
def get_profiles():
    return jsonify(profiles=[_profile_json(p) for p in rules.PROFILES], current=live["profile"])


@app.post("/api/profile")
def set_profile():
    pid = (request.get_json(silent=True) or {}).get("id")
    if pid not in rules.PROFILES:
        return jsonify(error="unknown profile"), 404
    with lock:
        live["profile"] = pid
        db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('profile', ?)", (pid,))
        p = rules.PROFILES[pid]
        add_event("info", f"Now growing {p['name']}", p["blurb"])
        if live["reading"]:
            live["eval"] = rules.evaluate(live["reading"], pid, _hour(live["reading"]["ts"]))
        db.commit()
    return jsonify(profile=_profile_json(pid))


SUPPORT_TOPICS = ("Question about my pot", "Sensor or hardware problem", "Website problem",
                  "Feedback or suggestion", "Other")


@app.post("/api/support")
def post_support():
    """Save a customer support message. The page checks the form too; this is the final check."""
    d = request.get_json(silent=True) or {}
    v = {k: str(d.get(k, "")).strip() for k in ("name", "email", "phone", "topic", "message")}
    errors = {}
    if not 2 <= len(v["name"]) <= 80:
        errors["name"] = "Enter your full name."
    if len(v["email"]) > 120 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", v["email"]):
        errors["email"] = "Enter a valid email address, like name@example.com."
    digits = re.sub(r"\D", "", v["phone"])
    if v["phone"] and (not re.fullmatch(r"\+?[\d\s()-]+", v["phone"]) or not 7 <= len(digits) <= 15):
        errors["phone"] = "Enter a valid phone number, or leave it empty."
    if v["topic"] not in SUPPORT_TOPICS:
        errors["topic"] = "Choose a topic."
    if not 10 <= len(v["message"]) <= 1000:
        errors["message"] = "Write between 10 and 1,000 characters."
    if errors:
        return jsonify(error="Check the highlighted fields.", errors=errors), 400
    with lock:
        cur = db.execute(
            "INSERT INTO support_messages (created_at, name, email, phone, topic, message) VALUES (?,?,?,?,?,?)",
            (datetime.now().isoformat(timespec="seconds"), v["name"], v["email"], v["phone"], v["topic"], v["message"]))
        db.commit()
    return jsonify(ok=True, ref=f"SP-{cur.lastrowid:04d}")


@app.post("/api/reset")
def reset():
    with lock:
        db.execute("DELETE FROM readings")
        db.execute("DELETE FROM events")
        db.commit()
        live["last_watered"] = None
    return jsonify(ok=True)


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


if __name__ == "__main__":
    init_db()
    if not REAL_POT:
        sim = Simulator(f"http://127.0.0.1:{PORT}/api/readings")
        app.register_blueprint(make_sim_api(sim))
        sim.start()
    if USB_PORT:
        threading.Thread(target=usb_bridge, args=(USB_PORT,), daemon=True).start()
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    print(f"\n  Smart Plant Pot is running{' (waiting for the real pot)' if REAL_POT else ''}:  http://localhost:{PORT}\n  Press Ctrl+C to stop.\n")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
