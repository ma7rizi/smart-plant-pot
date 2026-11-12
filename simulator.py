"""Virtual smart pot.

Stands in for the ESP32 and its sensors: it simulates a plant's environment and
POSTs readings to the backend exactly like the real hardware will. Replace this
with the real pot and nothing else in the system has to change.
"""

import json
import math
import random
import threading
import urllib.request
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

SPEEDS = [
    {"value": 0, "label": "Paused"},
    {"value": 1 / 60, "label": "Real time"},
    {"value": 1, "label": "1 min/s"},
    {"value": 5, "label": "5 min/s"},
    {"value": 30, "label": "30 min/s"},
]

SCENARIOS = {
    "perfect": {
        "label": "Perfect day", "desc": "Everything in the ideal range",
        "set": {"soil": 58, "temp": 23, "humidity": 55, "exposure": 0.78, "hour": 10, "day_cycle": True, "wifi": True},
    },
    "drought": {
        "label": "Forgot to water", "desc": "A week without water",
        "set": {"soil": 13, "temp": 25, "humidity": 45, "exposure": 0.78, "hour": 13},
    },
    "overwatered": {
        "label": "Overwatered", "desc": "Soil is waterlogged",
        "set": {"soil": 97, "temp": 22, "humidity": 70, "exposure": 0.7, "hour": 11},
    },
    "heatwave": {
        "label": "Heat wave", "desc": "Hot, dry and blazing sun",
        "set": {"soil": 40, "temp": 38, "humidity": 22, "exposure": 0.97, "hour": 14},
    },
    "cold": {
        "label": "Cold snap", "desc": "Left next to the AC",
        "set": {"soil": 55, "temp": 6, "humidity": 50, "exposure": 0.7, "hour": 9},
    },
    "closet": {
        "label": "Dark closet", "desc": "No light at midday",
        "set": {"soil": 55, "temp": 22, "humidity": 55, "exposure": 0.04, "hour": 12},
    },
    "night": {
        "label": "Night time", "desc": "The plant goes to sleep",
        "set": {"soil": 58, "temp": 21, "humidity": 58, "exposure": 0.78, "hour": 23, "day_cycle": True},
    },
}


class Simulator:
    TICK = 1.0  # real seconds between readings

    def __init__(self, url, device_id="pot-sim-01"):
        self.url = url
        self.device_id = device_id
        self.lock = threading.Lock()
        self._wake = threading.Event()
        self.clock = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
        self.start_date = self.clock.date()
        self.speed = 5.0          # simulated minutes per real second
        self.soil = 58.0          # %
        self.room_temp = 23.0     # what the user set
        self.temp = 23.0          # what the sensor sees
        self.room_humidity = 55.0
        self.humidity = 55.0
        self.exposure = 0.78      # 0 = closet, 1 = direct sun
        self.day_cycle = True
        self.wifi = True
        self.light = 0.0
        self.last_payload = None

    # ---- world model -------------------------------------------------
    def _hour(self):
        return self.clock.hour + self.clock.minute / 60 + self.clock.second / 3600

    def _daylight(self):
        if not self.day_cycle:
            return 1.0
        h = self._hour()
        if 6 <= h <= 19:
            return max(0.0, math.sin(math.pi * (h - 6) / 13)) ** 0.7
        return 0.0

    def _peak_lux(self):
        return 60 * (1000 ** self.exposure)  # 60 lux .. 60,000 lux

    def _step(self, minutes):
        self.clock += timedelta(minutes=minutes)
        day = self._daylight()
        self.light = self._peak_lux() * day + 3

        sun_heat = 5 * self.light / 60000
        target = self.room_temp + sun_heat + ((2.0 * day - 1.0) if self.day_cycle else 0)
        self.temp += (target - self.temp) * (1 - math.exp(-minutes / 40))

        h_target = self.room_humidity - (self.temp - self.room_temp) * 1.2
        self.humidity += (h_target - self.humidity) * (1 - math.exp(-minutes / 60))
        self.humidity = min(98, max(5, self.humidity))

        # Soil dries faster when it is hot, bright and the air is dry.
        evap = (0.012
                * (1 + max(0, self.temp - 18) * 0.09)
                * (1 + self.light / 25000)
                * (1.3 - self.humidity / 100 * 0.6)
                * (max(self.soil, 0) / 60) ** 0.7)
        self.soil -= evap * minutes
        if self.soil > 85:  # excess water drains out of the pot
            self.soil -= (self.soil - 85) * (1 - math.exp(-minutes / 120))
        self.soil = min(100, max(0, self.soil))

    def _advance(self, minutes):
        while minutes > 0:
            step = min(5, minutes)
            self._step(step)
            minutes -= step
        self._step(0)

    # ---- sensor read + upload ---------------------------------------
    def _payload(self):
        return {
            "device_id": self.device_id,
            "ts": self.clock.isoformat(timespec="seconds"),
            "soil_moisture": round(min(100, max(0, self.soil + random.uniform(-0.4, 0.4))), 1),
            "temperature": round(self.temp + random.uniform(-0.08, 0.08), 1),
            "humidity": round(min(100, max(0, self.humidity + random.uniform(-0.4, 0.4))), 1),
            "light": round(max(0, self.light * random.uniform(0.985, 1.015))),
        }

    def _post(self, payload):
        req = urllib.request.Request(
            self.url, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            urllib.request.urlopen(req, timeout=2).read()
        except Exception:
            pass  # backend not up yet, try again next tick

    def _loop(self):
        while True:
            woke = self._wake.wait(self.TICK)
            self._wake.clear()
            try:
                with self.lock:
                    self._advance(0 if woke else self.speed * self.TICK)
                    payload = self._payload()
                    send = self.wifi
                    if send:
                        self.last_payload = payload
                if send:
                    self._post(payload)
            except Exception as err:  # never let one bad tick kill the pot
                print("simulator error:", err)

    def start(self):
        threading.Thread(target=self._loop, daemon=True).start()

    # ---- controls ----------------------------------------------------
    def apply(self, values):
        with self.lock:
            if "speed" in values:
                self.speed = max(0.0, min(60.0, float(values["speed"])))
            if "soil" in values:
                self.soil = max(0.0, min(100.0, float(values["soil"])))
            if "temp" in values:
                self.room_temp = self.temp = max(-5.0, min(50.0, float(values["temp"])))
            if "humidity" in values:
                self.room_humidity = self.humidity = max(5.0, min(98.0, float(values["humidity"])))
            if "exposure" in values:
                self.exposure = max(0.0, min(1.0, float(values["exposure"])))
            if "hour" in values:
                h = float(values["hour"]) % 24
                self.clock = self.clock.replace(hour=int(h), minute=int(round((h % 1) * 60)) % 60, second=0)
            if "day_cycle" in values:
                self.day_cycle = bool(values["day_cycle"])
            if "wifi" in values:
                self.wifi = bool(values["wifi"])
        self._wake.set()

    def water(self, amount=25.0):
        with self.lock:
            self.soil = min(100.0, self.soil + amount)
            self.humidity = min(98.0, self.humidity + 3)
        self._wake.set()

    def snapshot(self):
        with self.lock:
            return {
                "device_id": self.device_id,
                "speed": self.speed,
                "hour": round(self._hour(), 3),
                "day": (self.clock.date() - self.start_date).days + 1,
                "soil": round(self.soil, 1),
                "temp": round(self.temp, 1),
                "humidity": round(self.humidity, 1),
                "exposure": self.exposure,
                "peak_lux": round(self._peak_lux()),
                "light": round(self.light),
                "day_cycle": self.day_cycle,
                "wifi": self.wifi,
                "last_payload": self.last_payload,
            }


def make_sim_api(sim):
    bp = Blueprint("sim", __name__)

    @bp.get("/api/sim")
    def get_sim():
        return jsonify(sim.snapshot())

    @bp.get("/api/sim/options")
    def options():
        return jsonify(
            speeds=SPEEDS,
            scenarios=[{"id": k, "label": v["label"], "desc": v["desc"]} for k, v in SCENARIOS.items()])

    @bp.post("/api/sim")
    def set_sim():
        sim.apply(request.get_json(silent=True) or {})
        return jsonify(sim.snapshot())

    @bp.post("/api/sim/water")
    def water():
        sim.water()
        return jsonify(sim.snapshot())

    @bp.post("/api/sim/scenario")
    def scenario():
        sc = SCENARIOS.get((request.get_json(silent=True) or {}).get("id"))
        if not sc:
            return jsonify(error="unknown scenario"), 404
        sim.apply(sc["set"])
        return jsonify(sim.snapshot())

    return bp
