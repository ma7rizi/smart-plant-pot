<p align="center">
  <img src="static/icons/icon-192.png" width="96" height="96" alt="Sprout logo">
</p>

<h1 align="center">Smart Plant Pot</h1>

<p align="center">
  An IoT plant pot that shows how your plant feels, with a live dashboard and phone app.<br>
  <b><a href="https://ma7rizi.pythonanywhere.com">Live site</a></b> ·
  <a href="https://github.com/users/ma7rizi/projects/1">Roadmap</a> ·
  <a href="DEPLOY.md">Hosting guide</a> ·
  <a href="CONTRIBUTING.md">How the team works</a>
</p>

An ESP32 reads soil moisture, temperature, humidity and light, and shows a face on a small OLED screen. Every reading goes to **Sprout**, a web dashboard with live status, history charts, advice and alerts. It installs on a phone like an app and sends push alerts even when the app is closed.

> Diploma project in Software Engineering (Group D28).

## Features

**The pot**
- **Six faces:** SLEEPY, THIRSTY, OVERWATERED, HOT, COLD and HAPPY, chosen by fixed rules. The pot and the website use the same rules, in the same order.
- **Two connections:** Wi-Fi (HTTP POST), with USB serial as a backup.

**The website**
- **Live dashboard:** plant status, a 0–100 health score, an exact copy of the pot's screen, four sensor cards with healthy ranges, advice and notifications. Updates every second.
- **History:** charts with the healthy range shaded, or a table, for the last 120, 360 or 1,200 readings.
- **About and Support:** how the pot works, plus a contact form saved to the database with a reference number.
- **Plant profiles:** healthy ranges for different plants (mint, basil, rosemary, peace lily and more).
- **Simulator:** a virtual pot, so the whole system can be tried without the hardware.

**Accounts**
- Sign up and sign in with a **username** and password. Two roles: **user** and **admin**.
- **Admin tab:** test every kind of phone alert. Clearing all readings is admin-only.

**Phone app**
- **Install from the browser** (Add to Home Screen) with its own logo. Opens full-screen like an app.
- **App layout:** bottom tab bar on phones and icons in the top tabs on tablets. It stays clear of the iPhone notch and Dynamic Island.
- **Push alerts:** "Water me now", "Too hot", "Watered"… even when the app is closed.
- **Offline screen** when there's no internet.

**Security**
- The pot must send a secret **API key** with every reading.
- Passwords are **hashed**, never stored as plain text.
- After 5 wrong passwords in 5 minutes, that address is blocked for a while.
- Push messages are **signed and encrypted**.
- Keys and passwords live on the server, **never in this repository**.

## How it works

```
 ┌──────────────┐  Wi-Fi: POST /api/readings + API key  ┌───────────────┐       ┌────────────┐
 │  ESP32 pot   │ ────────────────────────────────────▶ │ Flask server  │ ────▶ │ SQLite     │
 │  4 sensors   │  USB: "DATA {json}" lines (backup)    │ app.py        │ ◀──── │ plant.db   │
 │  OLED face   │ ────────────────────────────────────▶ │ rules.py      │       └────────────┘
 └──────────────┘                                       └──┬─────────┬──┘
                                     GET /api/live (1 s)   │         │  push alert
                                     GET /api/history      ▼         ▼  (Apple / Google)
                                                  ┌──────────────┐  ┌──────────────┐
                                                  │ Website /    │  │ Phone, even  │
                                                  │ phone app    │  │ app closed   │
                                                  └──────────────┘  └──────────────┘
```

1. The pot reads its sensors, picks a face and sends a reading about every 6 seconds.
2. The server checks the key and the reading, works out the status and advice, and saves it.
3. The website asks for the latest data every second. When the plant needs something, the server also sends a push alert to every phone that turned alerts on.

## Tech stack

| Part | Technology |
|---|---|
| Hardware | ESP32, capacitive soil moisture sensor v2.0, DHT22, BH1750, SSD1306 OLED 128×64 |
| Firmware | Arduino (C++) |
| Server | Python 3, Flask, pywebpush (push alerts) |
| Database | SQLite |
| Website | HTML, CSS, JavaScript (no framework) |
| Phone app | Progressive Web App: web app manifest, service worker, Web Push |
| Hosting | PythonAnywhere (free plan) |

## Project structure

```
smart-plant-pot/
├── app.py                 Flask server: REST API, accounts, push alerts
├── rules.py               Plant profiles, face rules and health score
├── simulator.py           Virtual pot for testing without hardware
├── wsgi.py                Entry point for hosting (PythonAnywhere)
├── requirements.txt       Python packages
├── run.bat                Start with the simulator
├── run_real.bat           Start and wait for the real pot (Wi-Fi)
├── run_usb.bat            Start with the real pot over USB (and Wi-Fi)
├── static/                The website and phone app
│   ├── index.html         Dashboard, History, About, Support, Admin, sign-in
│   ├── css/style.css
│   ├── js/                app.js, charts.js, oled.js, scene.js
│   ├── sw.js              Service worker: offline screen and push alerts
│   ├── manifest.json      Makes the site installable as an app
│   ├── offline.html       Shown when there's no internet
│   └── icons/             App logo in every size
├── firmware/smart_pot/    ESP32 code
│   ├── smart_pot.ino
│   └── secrets.example.h  Copy to secrets.h: Wi-Fi, server address, API key
├── tools/
│   └── make_oled_js.py    Builds static/js/oled.js from the firmware's faces
├── DEPLOY.md              Hosting guide
└── CONTRIBUTING.md        How the team works with issues, branches and PRs
```

## Getting started

### Run it on your computer (no hardware needed)

You need Python 3.10 or newer.

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 and sign in with username **`admin`** and password **`admin123`** (laptop only). Click **Simulator** (top right) to control the virtual pot. On Windows you can double-click `run.bat` instead.

### Use the real pot

| Connection | Command | Windows shortcut |
|---|---|---|
| Wi-Fi | `python app.py --real` | `run_real.bat` |
| USB (and Wi-Fi) | `python app.py --real --usb COM5` | `run_usb.bat` |

Change `COM5` to the port your computer gives the ESP32.

### Flash the firmware

1. Install the [Arduino IDE](https://www.arduino.cc/en/software) and the ESP32 board package.
2. Install the libraries: **Adafruit SSD1306**, **Adafruit GFX**, **BH1750** and **DHT sensor library**.
3. In `firmware/smart_pot/`, copy `secrets.example.h` to `secrets.h` and fill in your Wi-Fi name and password, the server address and the `API_KEY`. `secrets.h` is ignored by Git.
4. Open `smart_pot.ino`, choose your ESP32 board and port, and upload.

If the pot's screen shows **BAD KEY**, the `API_KEY` doesn't match the server's.

**Wiring**

| Part | ESP32 pin |
|---|---|
| Soil sensor AOUT | D32 (VCC to 3V3, GND to GND) |
| DHT22 data | D4 |
| BH1750 and OLED (I²C) | SDA D21, SCL D22 |

### Host it online

[DEPLOY.md](DEPLOY.md) walks through putting the website on PythonAnywhere's free plan, step by step.

### Install it on a phone

1. Open **https://ma7rizi.pythonanywhere.com**. It must be the `https` address.
2. **iPhone (Safari):** Share, then **Add to Home Screen**. **Android (Chrome):** ⋮, then **Install app**.
3. Open **Sprout** from the home screen, sign in, and tap **Turn on alerts** on the Dashboard.
4. Admins can try every alert from **Admin**, then **Test phone alerts**.

On iPhone, push alerts work in the app added to the Home Screen, on iOS 16.4 or newer.

### Preview other devices

Add these to the address in any browser, together with the browser's device mode (F12, then Ctrl+Shift+M):

| Add to the address | Shows |
|---|---|
| `?app=1` | The installed-app layout (bottom tab bar on phones) |
| `?app=1&notch=1` | The same, plus a pretend iPhone notch |

## Accounts and roles

| Role | Can |
|---|---|
| **User** | See the dashboard and history, change the plant profile, turn on alerts |
| **Admin** | Everything a user can, plus the **Admin** tab and clearing all readings |

Everyone who signs up is a **user**. The admin signs in with username **`admin`**: the password is `admin123` on a laptop, and online it's the `ADMIN_PASSWORD` set on the server.

## Settings

Set as environment variables. When hosted they go in the PythonAnywhere WSGI file (see [DEPLOY.md](DEPLOY.md)), never in the code.

| Variable | What it does | If not set |
|---|---|---|
| `API_KEY` | Secret the pot must send with every reading | No check (fine on a laptop) |
| `SECRET_KEY` | Signs the login cookie | A key is made and saved in the database |
| `ADMIN_PASSWORD` | Password of the `admin` account | `admin123` on a laptop, no admin when hosted |
| `REAL_POT` | `1` = wait for the real pot, no simulator (set by `wsgi.py`) | Simulator on |
| `PORT` | Port when running `python app.py` | `5000` |
| `VAPID_PRIVATE_KEY` | Key that signs push alerts | A key is made and saved in the database |
| `PUSH_CONTACT` | Contact address sent to push services | The live site's address |

## Face rules

The pot checks the rules in this order and shows the first one that matches.

| # | Face | Rule | Status |
|---|---|---|---|
| 1 | SLEEPY | Light under 10 lux | Resting |
| 2 | THIRSTY | Soil moisture under 25% | Normal |
| 3 | OVERWATERED | Soil moisture over 85% | Unhealthy |
| 4 | HOT | Temperature over 30 °C | Unhealthy |
| 5 | COLD | Temperature under 15 °C | Normal |
| 6 | HAPPY | None of the above | Healthy |

## API

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| `POST` | `/api/readings` | the pot (API key) | Send a reading |
| `POST` | `/api/signup` | anyone | Create an account (name, username, password) |
| `POST` | `/api/login` | anyone | Sign in (username, password) |
| `POST` | `/api/logout` | signed in | Sign out |
| `GET` | `/api/me` | signed in | The signed-in user, or 401 |
| `GET` | `/api/live?after=<id>` | signed in | Latest reading, status, new notifications and trend data |
| `GET` | `/api/history?limit=<n>` | signed in | The newest `n` readings (10–2,000) |
| `GET` | `/api/profiles` | signed in | Available plant profiles |
| `POST` | `/api/profile` | signed in | Choose a plant profile |
| `GET` | `/api/push/key` | signed in | Public key a phone needs to subscribe to push |
| `POST` | `/api/push/subscribe` | signed in | Save this phone's push subscription |
| `POST` | `/api/push/unsubscribe` | signed in | Remove this phone's push subscription |
| `POST` | `/api/push/test` | **admin** | Send a test push to your own phones |
| `POST` | `/api/reset` | **admin** | Clear readings and notifications |
| `POST` | `/api/support` | anyone | Send a support message |

Example reading sent by the pot:

```json
POST /api/readings
X-Api-Key: <your key>

{"device_id": "pot-01", "soil_moisture": 56.1, "temperature": 24.4, "humidity": 54.4, "light": 11675}
```

## Database

SQLite (`plant.db`), created automatically on first run. It keeps the newest 20,000 readings. Older databases are upgraded automatically.

| Table | Stores |
|---|---|
| `readings` | Every sensor reading with its status and health score |
| `events` | Notifications, such as "Water me now" or "Watered" |
| `settings` | The chosen plant profile, and keys the server makes for itself (login cookie, push signing) |
| `support_messages` | Messages sent from the Support page |
| `users` | Accounts: name, username, hashed password, role (user or admin) |
| `push_subscriptions` | Phones that get push alerts: user, push address and encryption keys |

## Team

| Role | Area |
|---|---|
| Group leader | Planning, report, About and Support pages |
| Hardware engineer | ESP32, sensors and firmware |
| Plant analyst | Face rules and project plan |
| Database designer | Database design and cloud sync |
| Web developer | Server, Dashboard, History, accounts and phone app |
| Tester | Testing and user questionnaire |
