#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BH1750.h>
#include "DHT.h"

// Wi-Fi name, password and server address live in secrets.h (not uploaded to GitHub).
// Copy secrets.example.h to secrets.h and fill in your own values.
#include "secrets.h"

// OLED Screen Setup
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define SCREEN_ADDRESS 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Hardware Pin Definitions
#define DHTPIN 4
#define DHTTYPE DHT22
#define SOIL_PIN 32

// Calibration measured on 2026-11-05 with GND, VCC on 3V3 and AOUT on D32
const int DRY_SOIL_VAL = 3060;  // Raw reading in dry air
const int WET_SOIL_VAL = 2180;  // Raw reading with the tip in water

// Website Connection
const unsigned long SEND_EVERY_MS = 5000;
unsigned long lastSend = 0;
const char* netStatus = "";   // Problem shown at the top left of the OLED

// Sensor Class Instances
DHT dht(DHTPIN, DHTTYPE);
BH1750 lightMeter;

// State Machine Expressions
enum Expression { HAPPY, THIRSTY, OVERWATERED, COLD, HOT, SLEEPY };
const char* FACE_NAMES[] = { "HAPPY", "THIRSTY", "OVERWATERED", "COLD", "HOT", "SLEEPY" };
Expression currentFace = HAPPY;

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NAME, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" connected, pot IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" failed. Check the name, password and that it is a 2.4 GHz network.");
  }
}

void setup() {
  Serial.begin(115200);

  // Initialize I2C Bus (SDA = 21, SCL = 22)
  Wire.begin(21, 22);

  // Initialize OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for (;;);
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Initialize Sensors
  dht.begin();
  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  pinMode(SOIL_PIN, INPUT);

  // Show progress on the OLED, then keep going even if Wi-Fi fails
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("Connecting WiFi...");
  display.display();
  connectWifi();
}

// Helper function to map raw ADC value to 0-100% moisture level
int getMoisturePercent(int rawAnalog) {
  int percent = map(rawAnalog, DRY_SOIL_VAL, WET_SOIL_VAL, 0, 100);
  return constrain(percent, 0, 100);
}

// Render facial expression & dynamic telemetry data
void drawFace(Expression expr, float temp, float hum, float lux, int soilMoisture) {
  display.clearDisplay();

  // Faces match the website's pot screen (static/js/scene.js)
  switch (expr) {
    case HAPPY:   // Closed smiling eyes and a wide smile
      display.drawLine(35, 24, 37, 22, SSD1306_WHITE);
      display.drawLine(35, 25, 37, 23, SSD1306_WHITE);
      display.drawLine(37, 22, 38, 20, SSD1306_WHITE);
      display.drawLine(37, 23, 38, 21, SSD1306_WHITE);
      display.drawLine(38, 20, 40, 20, SSD1306_WHITE);
      display.drawLine(38, 21, 40, 21, SSD1306_WHITE);
      display.drawLine(40, 20, 42, 20, SSD1306_WHITE);
      display.drawLine(40, 21, 42, 21, SSD1306_WHITE);
      display.drawLine(42, 20, 43, 22, SSD1306_WHITE);
      display.drawLine(42, 21, 43, 23, SSD1306_WHITE);
      display.drawLine(43, 22, 45, 24, SSD1306_WHITE);
      display.drawLine(43, 23, 45, 25, SSD1306_WHITE);
      display.drawLine(83, 24, 85, 22, SSD1306_WHITE);
      display.drawLine(83, 25, 85, 23, SSD1306_WHITE);
      display.drawLine(85, 22, 86, 20, SSD1306_WHITE);
      display.drawLine(85, 23, 86, 21, SSD1306_WHITE);
      display.drawLine(86, 20, 88, 20, SSD1306_WHITE);
      display.drawLine(86, 21, 88, 21, SSD1306_WHITE);
      display.drawLine(88, 20, 90, 20, SSD1306_WHITE);
      display.drawLine(88, 21, 90, 21, SSD1306_WHITE);
      display.drawLine(90, 20, 91, 22, SSD1306_WHITE);
      display.drawLine(90, 21, 91, 23, SSD1306_WHITE);
      display.drawLine(91, 22, 93, 24, SSD1306_WHITE);
      display.drawLine(91, 23, 93, 25, SSD1306_WHITE);
      display.drawLine(55, 34, 58, 37, SSD1306_WHITE);
      display.drawLine(55, 35, 58, 38, SSD1306_WHITE);
      display.drawLine(58, 37, 61, 38, SSD1306_WHITE);
      display.drawLine(58, 38, 61, 39, SSD1306_WHITE);
      display.drawLine(61, 38, 64, 39, SSD1306_WHITE);
      display.drawLine(61, 39, 64, 40, SSD1306_WHITE);
      display.drawLine(64, 39, 67, 38, SSD1306_WHITE);
      display.drawLine(64, 40, 67, 39, SSD1306_WHITE);
      display.drawLine(67, 38, 70, 37, SSD1306_WHITE);
      display.drawLine(67, 39, 70, 38, SSD1306_WHITE);
      display.drawLine(70, 37, 73, 34, SSD1306_WHITE);
      display.drawLine(70, 38, 73, 35, SSD1306_WHITE);
      break;

    case THIRSTY:   // Squinting eyes, open mouth and a falling water drop
      display.drawLine(44, 18, 38, 22, SSD1306_WHITE);
      display.drawLine(44, 19, 38, 23, SSD1306_WHITE);
      display.drawLine(38, 22, 44, 26, SSD1306_WHITE);
      display.drawLine(38, 23, 44, 27, SSD1306_WHITE);
      display.drawLine(84, 18, 90, 22, SSD1306_WHITE);
      display.drawLine(84, 19, 90, 23, SSD1306_WHITE);
      display.drawLine(90, 22, 84, 26, SSD1306_WHITE);
      display.drawLine(90, 23, 84, 27, SSD1306_WHITE);
      display.drawCircle(64, 37, 4, SSD1306_WHITE);
      display.drawCircle(64, 37, 3, SSD1306_WHITE);
      display.fillCircle(114, 24, 2, SSD1306_WHITE);
      display.fillTriangle(114, 19, 112, 24, 116, 24, SSD1306_WHITE);
      break;

    case OVERWATERED:   // Wavy dizzy eyes, small open mouth and bubbles
      display.drawLine(35, 22, 38, 19, SSD1306_WHITE);
      display.drawLine(35, 23, 38, 20, SSD1306_WHITE);
      display.drawLine(38, 19, 42, 23, SSD1306_WHITE);
      display.drawLine(38, 20, 42, 24, SSD1306_WHITE);
      display.drawLine(42, 23, 45, 21, SSD1306_WHITE);
      display.drawLine(42, 24, 45, 22, SSD1306_WHITE);
      display.drawLine(83, 22, 86, 19, SSD1306_WHITE);
      display.drawLine(83, 23, 86, 20, SSD1306_WHITE);
      display.drawLine(86, 19, 90, 23, SSD1306_WHITE);
      display.drawLine(86, 20, 90, 24, SSD1306_WHITE);
      display.drawLine(90, 23, 93, 21, SSD1306_WHITE);
      display.drawLine(90, 24, 93, 22, SSD1306_WHITE);
      display.drawCircle(64, 37, 3, SSD1306_WHITE);
      display.drawCircle(64, 37, 2, SSD1306_WHITE);
      display.drawCircle(104, 42, 1, SSD1306_WHITE);
      display.drawCircle(109, 33, 2, SSD1306_WHITE);
      display.drawCircle(115, 23, 3, SSD1306_WHITE);
      break;

    case COLD:   // Round eyes and a chattering zigzag mouth
      display.fillCircle(40, 22, 3, SSD1306_WHITE);
      display.fillCircle(88, 22, 3, SSD1306_WHITE);
      display.drawLine(57, 38, 60, 35, SSD1306_WHITE);
      display.drawLine(57, 39, 60, 36, SSD1306_WHITE);
      display.drawLine(60, 35, 64, 38, SSD1306_WHITE);
      display.drawLine(60, 36, 64, 39, SSD1306_WHITE);
      display.drawLine(64, 38, 68, 35, SSD1306_WHITE);
      display.drawLine(64, 39, 68, 36, SSD1306_WHITE);
      display.drawLine(68, 35, 71, 38, SSD1306_WHITE);
      display.drawLine(68, 36, 71, 39, SSD1306_WHITE);
      break;

    case HOT:   // Flat tired eyes, panting open mouth and sweat drops
      display.drawLine(35, 22, 45, 22, SSD1306_WHITE);
      display.drawLine(35, 23, 45, 23, SSD1306_WHITE);
      display.drawLine(83, 22, 93, 22, SSD1306_WHITE);
      display.drawLine(83, 23, 93, 23, SSD1306_WHITE);
      display.drawCircle(64, 37, 5, SSD1306_WHITE);
      display.drawCircle(64, 37, 4, SSD1306_WHITE);
      display.fillCircle(14, 26, 2, SSD1306_WHITE);
      display.fillTriangle(14, 21, 12, 26, 16, 26, SSD1306_WHITE);
      display.fillCircle(114, 26, 2, SSD1306_WHITE);
      display.fillTriangle(114, 21, 112, 26, 116, 26, SSD1306_WHITE);
      break;

    case SLEEPY:   // Closed sleeping eyes, small mouth and Zzz
      display.drawLine(35, 22, 37, 23, SSD1306_WHITE);
      display.drawLine(35, 23, 37, 24, SSD1306_WHITE);
      display.drawLine(37, 23, 38, 24, SSD1306_WHITE);
      display.drawLine(37, 24, 38, 25, SSD1306_WHITE);
      display.drawLine(38, 24, 40, 24, SSD1306_WHITE);
      display.drawLine(38, 25, 40, 25, SSD1306_WHITE);
      display.drawLine(40, 24, 42, 24, SSD1306_WHITE);
      display.drawLine(40, 25, 42, 25, SSD1306_WHITE);
      display.drawLine(42, 24, 43, 23, SSD1306_WHITE);
      display.drawLine(42, 25, 43, 24, SSD1306_WHITE);
      display.drawLine(43, 23, 45, 22, SSD1306_WHITE);
      display.drawLine(43, 24, 45, 23, SSD1306_WHITE);
      display.drawLine(83, 22, 85, 23, SSD1306_WHITE);
      display.drawLine(83, 23, 85, 24, SSD1306_WHITE);
      display.drawLine(85, 23, 86, 24, SSD1306_WHITE);
      display.drawLine(85, 24, 86, 25, SSD1306_WHITE);
      display.drawLine(86, 24, 88, 24, SSD1306_WHITE);
      display.drawLine(86, 25, 88, 25, SSD1306_WHITE);
      display.drawLine(88, 24, 90, 24, SSD1306_WHITE);
      display.drawLine(88, 25, 90, 25, SSD1306_WHITE);
      display.drawLine(90, 24, 91, 23, SSD1306_WHITE);
      display.drawLine(90, 25, 91, 24, SSD1306_WHITE);
      display.drawLine(91, 23, 93, 22, SSD1306_WHITE);
      display.drawLine(91, 24, 93, 23, SSD1306_WHITE);
      display.fillCircle(64, 37, 2, SSD1306_WHITE);
      display.setTextSize(1);
      display.setCursor(105, 10);
      display.print("Zzz");
      break;
  }

  // Connection Problem at the Top Left, Blank When All Is Well
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(netStatus);

  // Face Name at the Top Right
  const char* name = FACE_NAMES[expr];
  display.setCursor(SCREEN_WIDTH - 6 * strlen(name), 0);
  display.print(name);

  // Bottom Telemetry Bar
  display.setTextSize(1);
  display.setCursor(0, 56);
  display.print(temp, 0); display.print("C ");
  display.print(lux, 0);  display.print("lx ");
  display.print("Soil:"); display.print(soilMoisture); display.print("%");

  display.display();
}

// Post one reading to the website's /api/readings endpoint. Returns true when the website got it.
bool sendReading(const char* body) {
  // The ESP32 keeps retrying Wi-Fi on its own, so just report and skip this send
  if (WiFi.status() != WL_CONNECTED) {
    netStatus = "NO WIFI";
    return false;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();

  if (code == 200) {
    netStatus = "";
    return true;
  }
  netStatus = "NO SERVER";
  Serial.print("Server error: ");
  Serial.println(code);
  return false;
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  float lux = lightMeter.readLightLevel();
  if (lux < 0) {
    lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);   // Reconnect after a loose-wire glitch
  }
  long soilTotal = 0;
  for (int i = 0; i < 10; i++) {   // Average 10 readings to smooth out noise
    soilTotal += analogRead(SOIL_PIN);
    delay(5);
  }
  int rawSoil = soilTotal / 10;
  int moisturePercent = getMoisturePercent(rawSoil);

  Serial.printf("raw=%d soil=%d%% temp=%.1f hum=%.1f lux=%.1f\n", rawSoil, moisturePercent, temp, hum, lux);

  // Checked before the fallback below so placeholder values never reach the website
  bool sensorsOk = !isnan(temp) && !isnan(hum) && lux >= 0;

  if (isnan(temp) || isnan(hum)) {
    temp = 22.0;
    hum = 50.0;
  }

  // Priority State Machine Logic
  if (lux < 10) {
    currentFace = SLEEPY;         // Dark environment
  } else if (moisturePercent < 25) {
    currentFace = THIRSTY;        // Low soil moisture
  } else if (moisturePercent > 85) {
    currentFace = OVERWATERED;    // Overwatered soil
  } else if (temp > 30) {
    currentFace = HOT;            // High temperature
  } else if (temp < 15) {
    currentFace = COLD;           // Low temperature
  } else {
    currentFace = HAPPY;          // Optimal conditions
  }

  drawFace(currentFace, temp, hum, lux, moisturePercent);

  if (millis() - lastSend >= SEND_EVERY_MS) {
    lastSend = millis();
    if (sensorsOk) {
      char body[160];
      snprintf(body, sizeof(body),
               "{\"device_id\":\"%s\",\"soil_moisture\":%d,\"temperature\":%.1f,\"humidity\":%.1f,\"light\":%.1f}",
               DEVICE_ID, moisturePercent, temp, hum, lux);
      if (!sendReading(body)) {
        // No Wi-Fi: the laptop's USB bridge picks this line up and forwards it to the website
        Serial.print("DATA ");
        Serial.println(body);
      }
    } else {
      netStatus = "SENSOR ERR";
    }
  }

  delay(2000);
}
