"""Generate static/js/oled.js: a pixel-exact copy of the pot's OLED screen for the web app.

Reads the faces from the firmware's drawFace() and the 5x7 font from the Adafruit GFX library,
so the website preview always matches the real screen. Run it again after changing the faces:

    python tools/make_oled_js.py [path/to/glcdfont.c]
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
INO = os.path.join(HERE, "..", "firmware", "smart_pot", "smart_pot.ino")
OUT = os.path.join(HERE, "..", "static", "js", "oled.js")
FONT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    r"~\Documents\Arduino\libraries\Adafruit_GFX_Library\glcdfont.c")


def read_font(path):
    """ASCII 32-126 from glcdfont.c, 5 column bytes per character."""
    src = open(path, encoding="utf-8").read()
    data = [int(b, 16) for b in re.findall(r"0x([0-9A-Fa-f]{2})", src[src.index("{"):])]
    return data[32 * 5:127 * 5]


def read_faces(path):
    """Each case of drawFace() as a list of [call, args...]."""
    src = open(path, encoding="utf-8").read()
    body = src[src.index("void drawFace"):]
    body = body[body.index("switch (expr)"):body.index("// Connection Problem")]
    faces = {}
    for m in re.finditer(r"case (\w+):(.*?)break;", body, re.S):
        calls, cursor = [], [0, 0]
        for fn, args in re.findall(r"display\.(\w+)\((.*?)\);", m.group(2)):
            if fn == "setCursor":
                cursor = [int(a) for a in args.split(",")]
            elif fn == "print":
                calls.append(["text", *cursor, args.strip().strip('"')])
            elif fn != "setTextSize":
                calls.append([fn] + [1 if a.strip() == "SSD1306_WHITE" else 0 if a.strip() == "SSD1306_BLACK"
                                     else int(a) for a in args.split(",")])
        faces[m.group(1)] = calls
    return faces


ENGINE = r"""
  // Same drawing algorithms as the Adafruit GFX library, on a 128x64 bitmap.
  const W = 128, H = 64;
  function screen() {
    const px = new Uint8Array(W * H);
    const pixel = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; };
    const vline = (x, y, h, c) => { for (let i = 0; i < h; i++) pixel(x, y + i, c); };
    const hline = (x, y, w, c) => { for (let i = 0; i < w; i++) pixel(x + i, y, c); };
    const g = {
      px,
      fillRect(x, y, w, h, c) { for (let i = 0; i < w; i++) vline(x + i, y, h, c); },
      drawLine(x0, y0, x1, y1, c) {
        const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
        if (steep) [x0, y0, x1, y1] = [y0, x0, y1, x1];
        if (x0 > x1) [x0, x1, y0, y1] = [x1, x0, y1, y0];
        const dx = x1 - x0, dy = Math.abs(y1 - y0), ystep = y0 < y1 ? 1 : -1;
        let err = Math.trunc(dx / 2);
        for (; x0 <= x1; x0++) {
          steep ? pixel(y0, x0, c) : pixel(x0, y0, c);
          err -= dy;
          if (err < 0) { y0 += ystep; err += dx; }
        }
      },
      drawCircle(x0, y0, r, c) {
        let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
        pixel(x0, y0 + r, c); pixel(x0, y0 - r, c); pixel(x0 + r, y0, c); pixel(x0 - r, y0, c);
        while (x < y) {
          if (f >= 0) { y--; ddy += 2; f += ddy; }
          x++; ddx += 2; f += ddx;
          for (const [a, b] of [[x, y], [y, x]]) for (const sx of [1, -1]) for (const sy of [1, -1]) pixel(x0 + sx * a, y0 + sy * b, c);
        }
      },
      fillCircleHelper(x0, y0, r, corners, delta, c) {
        let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r, px_ = x, py = y;
        delta++;
        while (x < y) {
          if (f >= 0) { y--; ddy += 2; f += ddy; }
          x++; ddx += 2; f += ddx;
          if (x < y + 1) {
            if (corners & 1) vline(x0 + x, y0 - y, 2 * y + delta, c);
            if (corners & 2) vline(x0 - x, y0 - y, 2 * y + delta, c);
          }
          if (y !== py) {
            if (corners & 1) vline(x0 + py, y0 - px_, 2 * px_ + delta, c);
            if (corners & 2) vline(x0 - py, y0 - px_, 2 * px_ + delta, c);
            py = y;
          }
          px_ = x;
        }
      },
      fillCircle(x0, y0, r, c) { vline(x0, y0 - r, 2 * r + 1, c); g.fillCircleHelper(x0, y0, r, 3, 0, c); },
      fillRoundRect(x, y, w, h, r, c) {
        r = Math.min(r, Math.trunc(Math.min(w, h) / 2));
        g.fillRect(x + r, y, w - 2 * r, h, c);
        g.fillCircleHelper(x + w - r - 1, y + r, r, 1, h - 2 * r - 1, c);
        g.fillCircleHelper(x + r, y + r, r, 2, h - 2 * r - 1, c);
      },
      fillTriangle(x0, y0, x1, y1, x2, y2, c) {
        if (y0 > y1) [y0, y1, x0, x1] = [y1, y0, x1, x0];
        if (y1 > y2) [y2, y1, x2, x1] = [y1, y2, x1, x2];
        if (y0 > y1) [y0, y1, x0, x1] = [y1, y0, x1, x0];
        if (y0 === y2) {
          const a = Math.min(x0, x1, x2), b = Math.max(x0, x1, x2);
          hline(a, y0, b - a + 1, c); return;
        }
        const dx01 = x1 - x0, dy01 = y1 - y0, dx02 = x2 - x0, dy02 = y2 - y0, dx12 = x2 - x1, dy12 = y2 - y1;
        let sa = 0, sb = 0, y = y0;
        const last = y1 === y2 ? y1 : y1 - 1;
        for (; y <= last; y++) {
          let a = x0 + Math.trunc(sa / dy01), b = x0 + Math.trunc(sb / dy02);
          sa += dx01; sb += dx02;
          if (a > b) [a, b] = [b, a];
          hline(a, y, b - a + 1, c);
        }
        sa = dx12 * (y - y1); sb = dx02 * (y - y0);
        for (; y <= y2; y++) {
          let a = x1 + Math.trunc(sa / dy12), b = x0 + Math.trunc(sb / dy02);
          sa += dx12; sb += dx02;
          if (a > b) [a, b] = [b, a];
          hline(a, y, b - a + 1, c);
        }
      },
      text(x, y, s) {   // text size 1, wraps to the next line at the screen edge like the library
        for (const ch of String(s)) {
          if (x + 6 > W) { x = 0; y += 8; }
          const i = ch.charCodeAt(0) - 32;
          if (i >= 0 && i < 95) for (let col = 0; col < 5; col++) {
            const bits = FONT[i * 5 + col];
            for (let row = 0; row < 8; row++) if (bits & (1 << row)) pixel(x + col, y + row, 1);
          }
          x += 6;
        }
      },
    };
    return g;
  }

  // What drawFace() in the firmware puts on the screen.
  function draw(face, status, bottom) {
    const g = screen();
    for (const [fn, ...args] of FACES[face] || []) g[fn](...args);
    g.text(0, 0, status || '');
    if (FACES[face]) g.text(W - 6 * face.length, 0, face);
    g.text(0, 56, bottom);
    return g.px;
  }

  // Paint onto a canvas: the module is a two-colour OLED, yellow on the top 16 rows, blue below.
  function render(canvas, face, status, bottom) {
    const px = draw(face, status, bottom);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const [r, g, b] = !px[i] ? [5, 10, 18] : i < W * 16 ? [255, 214, 72] : [96, 200, 255];
      img.data.set([r, g, b, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }

  // Bottom line exactly as Serial/Print formats it: print(x, 0) rounds half up.
  const whole = x => (x < 0 ? '-' : '') + Math.floor(Math.abs(x) + 0.5);
  const bottomLine = r => `${whole(r.temp)}C ${whole(r.light)}lx Soil:${Math.round(r.soil)}%`;

  window.Oled = { render, bottomLine, faces: Object.keys(FACES) };
"""


if __name__ == "__main__":
    font, faces = read_font(FONT), read_faces(INO)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Generated by tools/make_oled_js.py from firmware/smart_pot/smart_pot.ino. Do not edit.\n")
        f.write("(function () {\n")
        f.write(f"  const FONT = {json.dumps(font, separators=(',', ':'))};\n")
        f.write(f"  const FACES = {json.dumps(faces, separators=(',', ':'))};\n")
        f.write(ENGINE)
        f.write("})();\n")
    print(f"wrote {OUT}: {len(faces)} faces ({', '.join(faces)}), {len(font) // 5} font characters")
