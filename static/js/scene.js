// Animated plant scene: sky, pot with a face on its screen, and a plant that
// droops, yellows and perks up again as the readings change.
(function () {
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // [hour, top colour, horizon colour]
  const SKY = [
    [0, [7, 11, 30], [22, 28, 62]],
    [5, [12, 18, 46], [46, 42, 88]],
    [6.5, [66, 88, 160], [250, 172, 132]],
    [8.5, [62, 142, 228], [188, 224, 250]],
    [12, [44, 132, 232], [172, 218, 250]],
    [16.5, [66, 140, 222], [202, 222, 240]],
    [18.5, [78, 76, 150], [250, 150, 102]],
    [20, [22, 26, 68], [82, 56, 102]],
    [21.5, [7, 11, 30], [22, 28, 62]],
    [24, [7, 11, 30], [22, 28, 62]],
  ];
  function skyAt(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (h >= a[0] && h <= b[0]) {
        const t = (h - a[0]) / (b[0] - a[0]);
        return [mix(a[1], b[1], t), mix(a[2], b[2], t)];
      }
    }
    return [SKY[0][1], SKY[0][2]];
  }
  const nightness = h => clamp(h < 12 ? (6.8 - h) / 1.6 : (h - 18.6) / 1.6);

  const STEMS = [
    { a: -0.64, len: 150, ph: 0.3, side: -1 },
    { a: 0.66, len: 144, ph: 3.7, side: 1 },
    { a: -0.31, len: 196, ph: 1.1, side: -1 },
    { a: 0.33, len: 188, ph: 2.9, side: 1 },
    { a: 0.03, len: 226, ph: 2.0, side: 1 },
  ];

  // ---- face on the pot's screen --------------------------------------
  function drawFace(ctx, cx, cy, w, h, mood, t, color) {
    const u = h / 10;
    const ex = w * 0.2, ey = cy - u * 1.1, my = cy + u * 2.1;
    const blink = (t % 4.3) < 0.13;
    ctx.save();
    if (mood === 'cold') ctx.translate(Math.sin(t * 42) * u * 0.14, 0);
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = u * 0.62;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = u * 1.6;

    const line = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); };
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
    const curve = (x1, x2, y, depth) => { ctx.beginPath(); ctx.moveTo(x1, y); ctx.quadraticCurveTo((x1 + x2) / 2, y + depth, x2, y); ctx.stroke(); };
    const eyes = fn => { fn(cx - ex, -1); fn(cx + ex, 1); };
    const roundEyes = (r = u * 0.95, dx = 0) => eyes(x => blink ? line([[x - r, ey], [x + r, ey]]) : dot(x + dx, ey, r));
    const drop = (x, y, s) => { ctx.beginPath(); ctx.moveTo(x, y - s * 1.5); ctx.quadraticCurveTo(x + s, y, x, y + s * 0.7); ctx.quadraticCurveTo(x - s, y, x, y - s * 1.5); ctx.fill(); };

    switch (mood) {
      case 'happy':
        eyes(x => curve(x - u, x + u, ey + u * 0.3, -u * 1.5));
        curve(cx - u * 2, cx + u * 2, my - u * 0.5, u * 2.2);
        ctx.globalAlpha = 0.28; eyes(x => dot(x + (x < cx ? -u * 0.9 : u * 0.9), ey + u * 1.9, u * 0.8)); ctx.globalAlpha = 1;
        break;
      case 'neutral':
        roundEyes();
        line([[cx - u * 1.5, my], [cx + u * 1.5, my]]);
        break;
      case 'sleeping': {
        eyes(x => curve(x - u, x + u, ey, u * 0.9));
        dot(cx, my, u * 0.5);
        ctx.font = `700 ${u * 1.7}px ui-monospace, Consolas, monospace`;
        for (let i = 0; i < 3; i++) {
          const p = ((t * 0.35) + i / 3) % 1;
          ctx.globalAlpha = Math.sin(p * Math.PI) * 0.9;
          ctx.fillText('z', cx + w * 0.3 + p * u * 1.5, cy - u * 0.5 - p * u * 3.6);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'thirsty':
      case 'dazzled':
        eyes((x, s) => line([[x - s * u, ey - u], [x + s * u * 0.5, ey], [x - s * u, ey + u]]));
        if (mood === 'thirsty') {
          ctx.beginPath(); ctx.ellipse(cx, my, u * 1.1, u * 0.9, 0, 0, 7); ctx.stroke();
          drop(cx + w * 0.38, cy - u * 1.6 + ((t * 1.2) % 1) * u * 2, u * 0.7);
        } else line([[cx - u * 1.6, my], [cx - u * 0.5, my - u * 0.6], [cx + u * 0.5, my + u * 0.2], [cx + u * 1.6, my - u * 0.4]]);
        break;
      case 'hot':
        eyes(x => line([[x - u, ey], [x + u, ey]]));
        ctx.beginPath(); ctx.ellipse(cx, my, u * 1.3, u * 1.1, 0, 0, 7); ctx.stroke();
        drop(cx - w * 0.38, cy - u * 2.2 + ((t * 0.9) % 1) * u * 3, u * 0.7);
        drop(cx + w * 0.38, cy - u * 2.2 + ((t * 0.9 + 0.5) % 1) * u * 3, u * 0.7);
        break;
      case 'cold':
        roundEyes(u * 0.8);
        line([-2, -1, 0, 1, 2].map((k, i) => [cx + k * u * 0.9, my + (i % 2 ? -u * 0.55 : u * 0.35)]));
        break;
      case 'dark':
        roundEyes(u * 0.6, Math.sin(t * 1.4) * u * 0.7);
        ctx.beginPath(); ctx.arc(cx, my, u * 0.6, 0, 7); ctx.stroke();
        break;
      case 'drowning':
        eyes(x => line([[x - u, ey], [x - u * 0.33, ey - u * 0.6], [x + u * 0.33, ey + u * 0.3], [x + u, ey - u * 0.3]]));
        ctx.beginPath(); ctx.ellipse(cx, my, u * 0.8, u * 0.9, 0, 0, 7); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const p = ((t * 0.6) + i / 3) % 1;
          ctx.globalAlpha = 1 - p;
          ctx.lineWidth = u * 0.3;
          ctx.beginPath(); ctx.arc(cx + w * (0.3 + 0.05 * i), cy + u * 3 - p * u * 6, u * (0.35 + 0.15 * i), 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      default: // sad
        roundEyes(u * 0.85);
        eyes((x, s) => line([[x - s * u * 1.2, ey - u * 1.5], [x + s * u * 0.9, ey - u * 2.3]]));
        curve(cx - u * 1.7, cx + u * 1.7, my + u * 0.7, -u * 1.9);
        drop(cx - ex, ey + u * 1.6 + ((t * 0.7) % 1) * u * 2.4, u * 0.55);
    }
    ctx.restore();
  }

  // ---- the scene ------------------------------------------------------
  function createScene(canvas, initial = {}) {
    const ctx = canvas.getContext('2d');
    const T = Object.assign({ vitality: 1, droop: 0, hour: 10, bright: 1, moist: 0.6 }, initial);
    const S = Object.assign({}, T);
    let mood = initial.mood || 'happy', color = initial.color || '#34d399';
    let W = 0, H = 0, t = 0, last = 0;
    const drops = [], sparks = [];
    let pour = 0, started = false;
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.62, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6 }));
    const flies = Array.from({ length: 7 }, (_, i) => ({ a: Math.random() * 6, b: Math.random() * 6, s: 0.25 + Math.random() * 0.3, i }));
    const clouds = Array.from({ length: 4 }, (_, i) => ({ x: Math.random(), y: 0.1 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.7, v: 0.004 + Math.random() * 0.005 }));

    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function background(night) {
      const [top, bottom] = skyAt(S.hour);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgb(top)); g.addColorStop(0.8, rgb(bottom));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      if (night > 0.02) {
        ctx.fillStyle = '#fff';
        for (const s of stars) {
          ctx.globalAlpha = night * (0.45 + 0.55 * Math.sin(t * 1.3 + s.p));
          ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // sun
      if (S.hour > 5.4 && S.hour < 19.6) {
        const p = (S.hour - 5.4) / 14.2;
        const x = W * (0.08 + 0.84 * p), y = H * (0.78 - 0.62 * Math.sin(Math.PI * p));
        const low = 1 - Math.sin(Math.PI * p);
        const c = mix([255, 244, 200], [255, 150, 90], low);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 150);
        glow.addColorStop(0, rgb(c, 0.9 * S.bright + 0.1)); glow.addColorStop(0.14, rgb(c, 0.55 * S.bright)); glow.addColorStop(1, rgb(c, 0));
        ctx.fillStyle = glow; ctx.fillRect(x - 150, y - 150, 300, 300);
        ctx.fillStyle = rgb(mix(c, [255, 255, 255], 0.5)); ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fill();
      }
      // moon
      if (night > 0.02) {
        const p = ((S.hour + 24 - 18.6) % 24) / 12.2;
        const x = W * (0.12 + 0.76 * p), y = H * (0.62 - 0.46 * Math.sin(Math.PI * p));
        ctx.globalAlpha = night;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 90);
        glow.addColorStop(0, 'rgba(210,222,255,.35)'); glow.addColorStop(1, 'rgba(210,222,255,0)');
        ctx.fillStyle = glow; ctx.fillRect(x - 90, y - 90, 180, 180);
        ctx.fillStyle = '#e8eeff'; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.fill();
        ctx.fillStyle = rgb(skyAt(S.hour)[0]); ctx.beginPath(); ctx.arc(x + 7, y - 4, 13, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // clouds
      ctx.fillStyle = '#fff';
      for (const c of clouds) {
        const x = ((c.x + t * c.v) % 1.3 - 0.15) * W, y = c.y * H;
        ctx.globalAlpha = 0.16 * (1 - night) + 0.03;
        for (const [dx, dy, r] of [[0, 0, 26], [28, 6, 20], [-28, 8, 18], [8, -12, 20]]) {
          ctx.beginPath(); ctx.ellipse(x + dx * c.s, y + dy * c.s, r * c.s * 1.5, r * c.s * 0.8, 0, 0, 7); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // hills
      const hill = (base, amp, f, ph, col) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, H * base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph) * amp * 0.3);
        ctx.lineTo(W, H); ctx.fill();
      };
      const dim = 1 - night * 0.6;
      hill(0.7, 20, 0.006, 1, rgb(mix(bottom, [40, 96, 86].map(v => v * dim), 0.6)));
      hill(0.78, 16, 0.009, 4, rgb(mix(bottom, [22, 66, 56].map(v => v * dim), 0.85)));
    }

    function leaf(x, y, dir, len, wid, v, shade) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `hsl(${lerp(50, 140, v)},${lerp(36, 58, v)}%,${lerp(27, 27, v) * shade}%)`);
      g.addColorStop(1, `hsl(${lerp(36, 118, v)},${lerp(48, 62, v)}%,${lerp(40, 47, v) * shade}%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * 0.25, -wid, len * 0.72, -wid * 0.85, len, 0);
      ctx.bezierCurveTo(len * 0.72, wid * 0.85, len * 0.25, wid, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len * 0.88, 0); ctx.stroke();
      ctx.restore();
    }

    function plant() {
      const v = S.vitality, d = S.droop;
      STEMS.forEach((st, si) => {
        const N = 12, seg = st.len / N * (1 - 0.08 * d);
        const shade = si < 2 ? 0.82 : si < 4 ? 0.93 : 1;
        let x = st.a * 36, y = -194, ang = -Math.PI / 2 + st.a * 0.56;
        const pts = [[x, y, ang]];
        for (let k = 1; k <= N; k++) {
          const f = k / N;
          ang += st.side * (0.012 + d * 0.27 * f) + Math.sin(t * 1.1 + st.ph + f * 2.2) * 0.013 * (1 - d * 0.6);
          ang = clamp(ang, -Math.PI / 2 - 2.35, -Math.PI / 2 + 2.35);
          x += Math.cos(ang) * seg; y += Math.sin(ang) * seg;
          if (y > -150) y = lerp(y, -150, 0.6);   // do not sink through the pot
          pts.push([x, y, ang]);
        }
        ctx.strokeStyle = `hsl(${lerp(62, 128, v)},${lerp(30, 45, v)}%,${24 * shade}%)`;
        ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();

        for (let k = 2; k <= N; k += 2) {
          const [px, py, pa] = pts[k], f = k / N;
          const size = (16 + 32 * Math.sin(Math.PI * (f * 0.8 + 0.12))) * (0.86 + 0.16 * v);
          for (const s of [-1, 1]) {
            let dir = pa + s * (0.98 - 0.3 * f) + Math.sin(t * 2 + k + si + s) * 0.05 * (1 - d);
            const down = Math.cos(dir) < 0 ? -1.5 * Math.PI : Math.PI / 2;
            dir = lerp(dir, down, d * 0.78);
            leaf(px, py, dir, size, size * 0.46 * (1 - 0.42 * d), v, shade);
          }
        }
        const [tx, ty, ta] = pts[N];
        leaf(tx, ty, lerp(ta, Math.cos(ta) < 0 ? -1.5 * Math.PI : Math.PI / 2, d * 0.5), 26, 11 * (1 - 0.4 * d), v, shade);
      });
    }

    function pot() {
      // shadow on the table
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      ctx.beginPath(); ctx.ellipse(6, -50, 96, 9, 0, 0, 7); ctx.fill();
      // soil: darker when wet
      ctx.fillStyle = rgb(mix([150, 112, 78], [58, 38, 26], S.moist));
      ctx.beginPath(); ctx.ellipse(0, -193, 86, 9, 0, 0, 7); ctx.fill();
      // body
      const g = ctx.createLinearGradient(-95, 0, 95, 0);
      g.addColorStop(0, '#d9d3c6'); g.addColorStop(0.35, '#f8f4ea'); g.addColorStop(1, '#bdb5a6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-90, -184); ctx.lineTo(90, -184); ctx.lineTo(70, -66);
      ctx.quadraticCurveTo(67, -52, 52, -52); ctx.lineTo(-52, -52);
      ctx.quadraticCurveTo(-67, -52, -70, -66); ctx.closePath(); ctx.fill();
      // rim
      const rg = ctx.createLinearGradient(-100, 0, 100, 0);
      rg.addColorStop(0, '#e4ded1'); rg.addColorStop(0.35, '#fffdf6'); rg.addColorStop(1, '#c8c0b1');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.roundRect(-99, -197, 198, 20, 8); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(-88, -177, 176, 4);
    }

    function screen() {
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 26;
      ctx.fillStyle = '#060d18';
      ctx.beginPath(); ctx.roundRect(-52, -160, 104, 74, 12); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-52, -160, 104, 74, 12); ctx.stroke();
      drawFace(ctx, 0, -123, 104, 64, mood, t, color);
      ctx.fillStyle = color; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 2.4);
      ctx.beginPath(); ctx.arc(0, -72, 2.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }

    function particles(dt, night) {
      // watering
      if (pour > 0) {
        pour -= dt;
        for (let i = 0; i < 3; i++) drops.push({ x: (Math.random() - 0.5) * 150, y: -470 - Math.random() * 40, v: 420 + Math.random() * 160, splash: 0 });
      }
      ctx.strokeStyle = 'rgba(150,205,255,.85)'; ctx.fillStyle = 'rgba(150,205,255,.8)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (let i = drops.length - 1; i >= 0; i--) {
        const p = drops[i];
        if (p.splash) {
          p.splash += dt * 3;
          ctx.globalAlpha = 1 - p.splash + 1 > 0 ? clamp(2 - p.splash) : 0;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, (p.splash - 1) * 12, (p.splash - 1) * 3, 0, 0, 7); ctx.stroke();
          if (p.splash > 2) drops.splice(i, 1);
        } else {
          p.y += p.v * dt;
          const floor = Math.abs(p.x) < 86 ? -196 : -54;
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y); ctx.stroke();
          if (p.y >= floor) { p.y = floor; p.splash = 1; }
        }
      }
      ctx.globalAlpha = 1;
      // sparkles when happy
      if (mood === 'happy' && Math.random() < dt * 3.5) {
        sparks.push({ x: (Math.random() - 0.5) * 300, y: -220 - Math.random() * 200, life: 0, r: 2 + Math.random() * 3.5 });
      }
      ctx.fillStyle = '#fffbe0';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.life += dt * 0.7; p.y -= dt * 14;
        if (p.life >= 1) { sparks.splice(i, 1); continue; }
        const r = p.r * Math.sin(p.life * Math.PI);
        ctx.globalAlpha = Math.sin(p.life * Math.PI) * 0.9;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 2); ctx.quadraticCurveTo(p.x, p.y, p.x + r * 2, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + r * 2); ctx.quadraticCurveTo(p.x, p.y, p.x - r * 2, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - r * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // fireflies at night
      if (night > 0.3) {
        for (const f of flies) {
          const x = Math.sin(t * f.s + f.a) * 210 + Math.sin(t * 0.7 + f.i) * 30;
          const y = -250 + Math.cos(t * f.s * 0.8 + f.b) * 130;
          const a = night * (0.4 + 0.6 * Math.sin(t * 2.2 + f.i * 1.7) ** 2);
          const g = ctx.createRadialGradient(x, y, 0, x, y, 11);
          g.addColorStop(0, `rgba(230,255,150,${a})`); g.addColorStop(1, 'rgba(230,255,150,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 11, y - 11, 22, 22);
        }
      }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!canvas.offsetParent) return;           // hidden page: skip the work
      const r = canvas.getBoundingClientRect();
      if (Math.abs(r.width - W) > 0.5 || Math.abs(r.height - H) > 0.5) resize();
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; t = now / 1000;

      const k = 1 - Math.exp(-dt * 3.2);
      for (const key of ['vitality', 'droop', 'bright', 'moist']) S[key] += (T[key] - S[key]) * k;
      const dh = ((T.hour - S.hour + 36) % 24) - 12;
      S.hour = (S.hour + dh * (1 - Math.exp(-dt * 4)) + 24) % 24;

      const night = nightness(S.hour);
      background(night);
      const s = Math.min(W / 520, H / 480);
      ctx.save(); ctx.translate(W / 2, H); ctx.scale(s, s);
      // table
      const tg = ctx.createLinearGradient(0, -54, 0, 0);
      tg.addColorStop(0, '#5a4233'); tg.addColorStop(0.12, '#3d2c22'); tg.addColorStop(1, '#261a14');
      ctx.fillStyle = tg; ctx.fillRect(-3000, -54, 6000, 60);
      ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(-3000, -54, 6000, 1.5);
      plant();
      pot();
      ctx.restore();
      // darkness: night, or a dim spot during the day
      const dark = Math.max(night * 0.42, (1 - S.bright) * 0.62 * (1 - night));
      if (dark > 0.01) { ctx.fillStyle = `rgba(4,8,24,${dark})`; ctx.fillRect(0, 0, W, H); }
      ctx.save(); ctx.translate(W / 2, H); ctx.scale(s, s);
      screen();
      particles(dt, night);
      ctx.restore();
    }
    requestAnimationFrame(frame);

    return {
      set(p) {
        for (const key of ['vitality', 'droop', 'hour', 'bright', 'moist']) if (p[key] != null) T[key] = p[key];
        if (p.mood) mood = p.mood;
        if (p.color) color = p.color;
        if (!started) { started = true; Object.assign(S, T); }   // first reading: no tween from the default
      },
      water() { pour = 1.1; },
    };
  }

  // Small standalone face, used for the "on the pot's screen" preview.
  function createFace(canvas, get) {
    const ctx = canvas.getContext('2d');
    function frame(now) {
      requestAnimationFrame(frame);
      if (!canvas.offsetParent) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { mood, color } = get();
      drawFace(ctx, w / 2, h / 2 + h * 0.02, w, h * 0.84, mood, now / 1000, color);
    }
    requestAnimationFrame(frame);
  }

  window.PlantScene = { createScene, createFace };
})();
