# Smart Plant Pot

An IoT plant pot that shows how your plant feels. An ESP32 reads soil moisture, temperature, humidity and light, shows a face on a small OLED screen, and sends every reading to a web dashboard with live status, history charts, advice and notifications.

> Diploma project in Software Engineering (Group D28).
>
> **Roadmap:** [project board](https://github.com/users/ma7rizi/projects/1) · **Contributing:** [how the team works](CONTRIBUTING.md)

## Features

- **Accounts:** sign up and sign in to see the dashboard. Passwords are stored hashed. Two roles: **user** and **admin**.
- **Live dashboard:** plant status, a 0–100 health score, an exact copy of the pot's screen, four sensor cards with healthy ranges, advice and notifications. It updates every second.
- **History:** charts with the healthy range shaded, or a table, for the last 120, 360 or 1,200 readings.
- **Six faces:** SLEEPY, THIRSTY, OVERWATERED, HOT, COLD and HAPPY. The pot and the website use the same rules, in the same order.
- **Two connections:** Wi-Fi (HTTP POST), with USB serial as a backup.
- **Support page:** a contact form, checked in the browser and on the server, saved to the database with a reference number.
- **Simulator:** a virtual pot, so the whole system can be tried without the hardware.

## How it works

```
 ┌──────────────┐   Wi-Fi: POST /api/readings    ┌───────────────┐        ┌──────────────┐
 │  ESP32 pot   │ ─────────────────────────────▶ │ Flask server  │ ─────▶ │ SQLite       │
 │  4 sensors   │   USB: "DATA {json}" lines     │ app.py        │ ◀───── │ plant.db     │
 │  OLED face   │ ─────────────────────────────▶ │ rules.py      │        └──────────────┘
 └──────────────┘                                └───────┬───────┘
                                                         │ GET /api/live (every 1 s)
                                                         ▼ GET /api/history
                                                 ┌───────────────┐
                                                 │ Web dashboard │
                                                 │ static/       │
                                                 └───────────────┘
```

1. The pot reads its sensors, picks a face and sends a reading about every 6 seconds.
2. The server checks the reading, works out the status and advice, and saves it.
3. The website asks the server for the latest data every second and updates the page.

## Tech stack

| Part | Technology |
|---|---|
| Hardware | ESP32, capacitive soil moisture sensor v2.0, DHT22, BH1750, SSD1306 OLED 128×64 |
| Firmware | Arduino (C++) |
| Server | Python 3, Flask |
| Database | SQLite |
| Website | HTML, CSS, JavaScript (no framework) |

## Project structure

```
smart-plant-pot/
├── app.py                 Flask server and REST API
├── rules.py               Plant profiles, face rules and health score
├── simulator.py           Virtual pot for testing without hardware
├── requirements.txt       Python packages
├── run.bat                Start with the simulator
├── run_real.bat           Start and wait for the real pot (Wi-Fi)
├── run_usb.bat            Start with the real pot over USB (and Wi-Fi)
├── static/                Website: Dashboard, History, About, Support
│   ├── index.html
│   ├── css/style.css
│   └── js/                app.js, charts.js, oled.js, scene.js
├── firmware/smart_pot/    ESP32 code
│   ├── smart_pot.ino
│   └── secrets.example.h  Copy to secrets.h and add your Wi-Fi details
└── tools/
    └── make_oled_js.py    Builds static/js/oled.js from the firmware's faces
```

## Getting started

### Run the website (no hardware needed)

You need Python 3.10 or newer.

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 and click **Simulator** (top right) to control the virtual pot. On Windows you can double-click `run.bat` instead.

### Use the real pot

| Connection | Command | Windows shortcut |
|---|---|---|
| Wi-Fi | `python app.py --real` | `run_real.bat` |
| USB (and Wi-Fi) | `python app.py --real --usb COM5` | `run_usb.bat` |

Change `COM5` to the port your computer gives the ESP32.

### Host it online

See [DEPLOY.md](DEPLOY.md) to put the website on PythonAnywhere (free plan), so it opens from anywhere.

### Flash the firmware

1. Install the [Arduino IDE](https://www.arduino.cc/en/software) and the ESP32 board package.
2. Install the libraries: **Adafruit SSD1306**, **Adafruit GFX**, **BH1750** and **DHT sensor library**.
3. In `firmware/smart_pot/`, copy `secrets.example.h` to `secrets.h` and fill in your Wi-Fi name, password, the server address and the `API_KEY` (if the server uses one). `secrets.h` is ignored by Git.
4. Open `smart_pot.ino`, choose your ESP32 board and port, and upload.

**Wiring**

| Part | ESP32 pin |
|---|---|
| Soil sensor AOUT | D32 (VCC to 3V3, GND to GND) |
| DHT22 data | D4 |
| BH1750 and OLED (I²C) | SDA D21, SCL D22 |

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

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/signup` | Create an account (name, email, password) |
| `POST` | `/api/login` | Sign in (email or `admin`, password) |
| `POST` | `/api/logout` | Sign out |
| `GET` | `/api/me` | The signed-in user, or 401 |
| `POST` | `/api/readings` | The pot sends a reading (needs the `X-Api-Key` header when the server has an `API_KEY`) |
| `GET` | `/api/live?after=<id>` | Latest reading, status, new notifications and trend data |
| `GET` | `/api/history?limit=<n>` | The newest `n` readings (10–2,000) |
| `GET` | `/api/profiles` | Available plant profiles |
| `POST` | `/api/profile` | Choose a plant profile |
| `POST` | `/api/support` | Send a support message |
| `POST` | `/api/reset` | Clear readings and notifications (**admin only**) |

`/api/live`, `/api/history`, `/api/profiles` and `/api/profile` need a signed-in user. `/api/support` is open to everyone.

Example reading sent by the pot:

```json
POST /api/readings
{"device_id": "pot-01", "soil_moisture": 56.1, "temperature": 24.4, "humidity": 54.4, "light": 11675}
```

## Database

SQLite (`plant.db`), created automatically on first run. It keeps the newest 20,000 readings.

| Table | Stores |
|---|---|
| `readings` | Every sensor reading with its status and health score |
| `events` | Notifications, such as "Water me now" or "Watered" |
| `settings` | The chosen plant profile |
| `support_messages` | Messages sent from the Support page |
| `users` | Accounts: name, email, hashed password, role (user or admin) |

Sign in as admin with username **`admin`**. On a laptop the password is `admin123`; online it is the `ADMIN_PASSWORD` set on the server (see [DEPLOY.md](DEPLOY.md)). Everyone who signs up is a normal user.
