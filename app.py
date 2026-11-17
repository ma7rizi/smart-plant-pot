"""Smart Plant Pot backend: receives sensor readings, classifies the plant's
condition, stores everything and serves the web app.

Run:  python app.py                    demo with the simulated pot
      python app.py --real             real ESP32 pot over Wi-Fi, simulator switched off
      python app.py --real --usb COM5  also accept readings from a pot plugged in by USB
Then open http://localhost:5000
"""

import hmac
import json
import logging
import os
import re
import secrets
import sqlite3
import sys
import threading
import base64
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

try:   # Web Push: alerts that reach the phone even when the app is closed
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from py_vapid import Vapid
    from pywebpush import WebPushException, webpush
except ImportError:   # pip install -r requirements.txt
    webpush = None

import rules
from simulator import Simulator, make_sim_api

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "plant.db")
PORT = int(os.environ.get("PORT", 5000))
# Real hardware posts the readings, no simulator. Set by --real, or REAL_POT=1 when hosted (see wsgi.py).
REAL_POT = "--real" in sys.argv or os.environ.get("REAL_POT") == "1"
USB_PORT = sys.argv[sys.argv.index("--usb") + 1] if "--usb" in sys.argv else None
OFFLINE_AFTER = 20 if REAL_POT else 6   # seconds without a reading before the pot counts as offline
MAX_READINGS = 20000
# Secret the pot must send in the X-Api-Key header. Empty = no check (local testing).
API_KEY = os.environ.get("API_KEY", "")
# Built-in admin account: sign in with username "admin". Online, set ADMIN_PASSWORD (see DEPLOY.md);
# on a laptop without it the password is "admin123" for easy testing.
ADMIN_USER = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ("" if REAL_POT else "admin123")
LOGIN_LIMIT, LOGIN_WINDOW = 5, 300   # at most 5 wrong passwords per 5 minutes from one address
WATER_JUMP = 5          # % rise in soil moisture that counts as a watering
WATER_COOLDOWN = 10     # seconds between "watered" notifications

app = Flask(__name__, static_folder="static", static_url_path="")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  PERMANENT_SESSION_LIFETIME=timedelta(days=30))
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
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user', created_at TEXT);
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT);
    """)
    # Accounts used to sign in with an email; the column is now called username (old accounts are kept).
    cols = [c["name"] for c in db.execute("PRAGMA table_info(users)")]
    if "email" in cols and "username" not in cols:
        db.execute("ALTER TABLE users RENAME COLUMN email TO username")
        db.commit()
    # Key that signs the login cookie: SECRET_KEY when hosted, otherwise one saved in the database.
    secret = os.environ.get("SECRET_KEY")
    if not secret:
        row = db.execute("SELECT value FROM settings WHERE key='secret_key'").fetchone()
        secret = row["value"] if row else secrets.token_hex(32)
        if not row:
            db.execute("INSERT INTO settings (key, value) VALUES ('secret_key', ?)", (secret,))
            db.commit()
    app.secret_key = secret
    load_vapid_keys()
    # Create the admin account, or update its password if ADMIN_PASSWORD changed.
    if ADMIN_PASSWORD:
        row = db.execute("SELECT password_hash FROM users WHERE username = ?", (ADMIN_USER,)).fetchone()
        if row is None:
            db.execute("INSERT INTO users (name, username, password_hash, role, created_at) VALUES (?,?,?,?,?)",
                       ("Admin", ADMIN_USER, generate_password_hash(ADMIN_PASSWORD), "admin",
                        datetime.now().isoformat(timespec="seconds")))
        elif not check_password_hash(row["password_hash"], ADMIN_PASSWORD):
            db.execute("UPDATE users SET password_hash = ?, role = 'admin' WHERE username = ?",
                       (generate_password_hash(ADMIN_PASSWORD), ADMIN_USER))
        db.commit()
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
    cur = db.execute("INSERT INTO events (received_at, severity, sensor, title, message) VALUES (?,?,?,?,?)",
                     (time.time(), severity, sensor, title, message))
    # Problems and waterings also go to phones as push alerts (sent in the background).
    if severity in ("warn", "bad") or title == "Watered":
        push_later(title, message, f"plant-{cur.lastrowid}")


# ---- push alerts (Web Push) ---------------------------------------------------
VAPID = {"private": None, "public": None, "signer": None}
# Push services want a way to contact the sender; Apple rejects made-up addresses.
VAPID_CLAIMS = {"sub": os.environ.get("PUSH_CONTACT", "https://ma7rizi.pythonanywhere.com")}


def load_vapid_keys():
    """Keys that sign our push messages: VAPID_PRIVATE_KEY when set, otherwise made once and kept in the database."""
    if webpush is None:
        return
    pem = os.environ.get("VAPID_PRIVATE_KEY", "").replace("\\n", "\n")
    if not pem:
        row = db.execute("SELECT value FROM settings WHERE key='vapid_private_key'").fetchone()
        if row:
            pem = row["value"]
        else:
            key = ec.generate_private_key(ec.SECP256R1())
            pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                    serialization.NoEncryption()).decode()
            db.execute("INSERT INTO settings (key, value) VALUES ('vapid_private_key', ?)", (pem,))
            db.commit()
    key = serialization.load_pem_private_key(pem.encode(), password=None)
    raw = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    VAPID["private"] = pem
    VAPID["signer"] = Vapid.from_pem(pem.encode())
    VAPID["public"] = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def send_push(title, body, tag, user_id=None):
    """Send one alert to every subscribed phone (or one user's phones). Returns how many got it."""
    if webpush is None or not VAPID["signer"]:
        return 0
    with lock:
        sql, args = "SELECT id, endpoint, p256dh, auth FROM push_subscriptions", ()
        if user_id is not None:
            sql, args = sql + " WHERE user_id = ?", (user_id,)
        subs = db.execute(sql, args).fetchall()
    data = json.dumps({"title": title, "body": body, "tag": tag})
    sent, gone = 0, []
    for s in subs:
        try:
            webpush({"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}}, data,
                    vapid_private_key=VAPID["signer"], vapid_claims=dict(VAPID_CLAIMS), ttl=3600, timeout=10)
            sent += 1
        except WebPushException as e:
            if e.response is not None and e.response.status_code in (404, 410):
                gone.append(s["id"])   # the phone unsubscribed or the app was removed
            else:
                logging.warning("push failed: %s", e)
        except Exception as e:   # network problem: try again with the next alert
            logging.warning("push failed: %s", e)
    if gone:
        with lock:
            db.executemany("DELETE FROM push_subscriptions WHERE id = ?", [(i,) for i in gone])
            db.commit()
    return sent


def push_later(title, body, tag, user_id=None, delay=0):
    """Send in a background thread, so the pot's reading or the request is never slowed down."""
    t = threading.Timer(delay, send_push, args=(title, body, tag, user_id))
    t.daemon = True
    t.start()


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
    if API_KEY and not hmac.compare_digest(request.headers.get("X-Api-Key", ""), API_KEY):
        return jsonify(error="missing or wrong API key"), 401
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


# ---- accounts -----------------------------------------------------------
failed_logins = {}   # address -> times of recent wrong passwords


def current_user():
    uid = session.get("uid")
    if uid is None:
        return None
    return db.execute("SELECT id, name, username, role FROM users WHERE id = ?", (uid,)).fetchone()


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify(error="Please sign in."), 401
        return view(*args, **kwargs)
    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify(error="Please sign in."), 401
        if user["role"] != "admin":
            return jsonify(error="Only an admin can do this."), 403
        return view(*args, **kwargs)
    return wrapper


def _user_json(u):
    return {"id": u["id"], "name": u["name"], "username": u["username"], "role": u["role"]}


def _client_ip():
    return request.headers.get("X-Real-IP") or request.remote_addr or "?"


@app.post("/api/signup")
def signup():
    d = request.get_json(silent=True) or {}
    name = str(d.get("name", "")).strip()
    username = str(d.get("username", "")).strip().lower()
    password = str(d.get("password", ""))
    errors = {}
    if not 2 <= len(name) <= 80:
        errors["name"] = "Enter your full name."
    if not re.fullmatch(r"[a-z0-9_.]{3,20}", username):
        errors["username"] = "Use 3 to 20 letters, numbers, _ or ."
    elif username == ADMIN_USER:
        errors["username"] = "This username is taken. Choose another one."
    if not 8 <= len(password) <= 128:
        errors["password"] = "Use at least 8 characters."
    if errors:
        return jsonify(error="Check the highlighted fields.", errors=errors), 400
    with lock:
        if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            return jsonify(error="This username is taken.",
                           errors={"username": "This username is taken. Choose another one, or sign in."}), 409
        cur = db.execute(   # new accounts are always normal users; the admin is the built-in account
            "INSERT INTO users (name, username, password_hash, role, created_at) VALUES (?,?,?,?,?)",
            (name, username, generate_password_hash(password), "user", datetime.now().isoformat(timespec="seconds")))
        db.commit()
    session.clear()
    session.permanent = True
    session["uid"] = cur.lastrowid
    return jsonify(user=_user_json(current_user()))


@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    username = str(d.get("username", "")).strip().lower()
    password = str(d.get("password", ""))
    ip, now = _client_ip(), time.time()
    recent = [t for t in failed_logins.get(ip, []) if now - t < LOGIN_WINDOW]
    if len(recent) >= LOGIN_LIMIT:
        return jsonify(error="Too many wrong attempts. Wait a few minutes and try again."), 429
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        failed_logins[ip] = recent + [now]
        return jsonify(error="Wrong username or password."), 401
    failed_logins.pop(ip, None)
    session.clear()
    session.permanent = True
    session["uid"] = user["id"]
    return jsonify(user=_user_json(user))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
def me():
    user = current_user()
    if user is None:
        return jsonify(error="Please sign in."), 401
    return jsonify(user=_user_json(user))


@app.get("/api/live")
@login_required
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
@login_required
def get_history():
    limit = max(10, min(2000, request.args.get("limit", 180, type=int)))
    with lock:
        rows = db.execute(
            "SELECT ts, soil, temp, humidity, light, state, score FROM readings "
            "ORDER BY id DESC LIMIT ?", (limit,)).fetchall()[::-1]
    return jsonify(readings=[dict(r) for r in rows], profile=_profile_json(live["profile"]))


@app.get("/api/profiles")
@login_required
def get_profiles():
    return jsonify(profiles=[_profile_json(p) for p in rules.PROFILES], current=live["profile"])


@app.post("/api/profile")
@login_required
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


@app.get("/api/push/key")
@login_required
def push_key():
    if not VAPID["public"]:
        return jsonify(error="Push alerts are not set up on this server."), 503
    return jsonify(key=VAPID["public"])


@app.post("/api/push/subscribe")
@login_required
def push_subscribe():
    sub = (request.get_json(silent=True) or {}).get("subscription") or {}
    endpoint, keys = str(sub.get("endpoint", "")), sub.get("keys") or {}
    if not endpoint.startswith("https://") or len(endpoint) > 1000 or not keys.get("p256dh") or not keys.get("auth"):
        return jsonify(error="Invalid push subscription."), 400
    with lock:
        db.execute("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?) "
                   "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth",
                   (session["uid"], endpoint, str(keys["p256dh"]), str(keys["auth"]), datetime.now().isoformat(timespec="seconds")))
        db.commit()
    return jsonify(ok=True)


@app.post("/api/push/unsubscribe")
@login_required
def push_unsubscribe():
    endpoint = str((request.get_json(silent=True) or {}).get("endpoint", ""))
    with lock:
        db.execute("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", (endpoint, session["uid"]))
        db.commit()
    return jsonify(ok=True)


@app.post("/api/push/test")
@admin_required
def push_test():
    """Admin tool: send a test alert from the server to the admin's own phones, after an optional delay."""
    d = request.get_json(silent=True) or {}
    title, body = str(d.get("title", "Test alert"))[:60], str(d.get("body", ""))[:200]
    delay = max(0, min(30, int(d.get("delay", 0) or 0)))
    with lock:
        count = db.execute("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?", (session["uid"],)).fetchone()[0]
    if count == 0:
        return jsonify(error="This device isn't subscribed to push alerts yet. Turn on alerts first."), 409
    push_later(title, body, "test-" + str(int(time.time())), session["uid"], delay)
    return jsonify(ok=True, devices=count, delay=delay)


@app.post("/api/reset")
@admin_required
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
