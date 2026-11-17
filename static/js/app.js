(function () {
  const $ = s => document.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());

  // ---- icons ----------------------------------------------------------
  const ICONS = {
    drop: 'M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z',
    thermo: 'M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
    cloud: 'M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.75 8.5H7z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    warn: 'M12 4l9 16H3L12 4zM12 10v4.5M12 17.4v.1',
    alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5v5.5M12 16.4v.1',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5.5M12 7.6v.1',
    bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0',
    chart: 'M4 19h16M7 15l3.5-4 3 2.5L18 8',
    shield: 'M12 3l7 3v5.5c0 4.3-3 7.9-7 9.5-4-1.6-7-5.2-7-9.5V6l7-3z',
    sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    wifi: 'M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.5a4 4 0 0 1 6 0M12 19.5v.1',
    leaf: 'M5 19C5 11 10 6 19 5c0 9-4 14-11 14H5zM5 19c2-4 5-7 9-9',
    chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
    server: 'M4 5h16v6H4zM4 13h16v6H4zM7.5 8v.1M7.5 16v.1',
    db: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
    screen: 'M3 5h18v11H3zM9 20h6M12 16v4',
    mail: 'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6',
  };
  const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;
  document.querySelectorAll('[data-ic]').forEach(e => { e.outerHTML = icon(e.dataset.ic); });
  // Opened from the home screen? Then use the app layout. ?app=1 and ?notch=1 let us test it in a browser.
  const params = new URLSearchParams(location.search);
  const appMode = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || params.has('app');
  document.body.classList.toggle('app', appMode);
  // The header's blur traps fixed elements, so the bottom tab bar has to live outside it.
  const phoneSize = matchMedia('(max-width: 760px)');
  const placeTabs = () => {
    if (appMode && phoneSize.matches) document.body.appendChild($('#tabs'));
    else document.querySelector('.nav').insertBefore($('#tabs'), document.querySelector('.nav-right'));
  };
  placeTabs();
  phoneSize.addEventListener('change', placeTabs);
  document.body.classList.toggle('fake-notch', params.has('notch'));
  let isAdmin = false;

  // ---- sensors --------------------------------------------------------
  const SENSORS = {
    soil: { label: 'Soil moisture', unit: '%', dec: 0, color: '#4c9df5', icon: 'drop', min: 0, max: 100 },
    temp: { label: 'Temperature', unit: '°C', dec: 1, color: '#f07b3a', icon: 'thermo', min: 0, max: 45 },
    light: { label: 'Light', unit: 'lux', dec: 0, color: '#e6b422', icon: 'sun', min: 1, max: 100000, log: true },
    humidity: { label: 'Air humidity', unit: '%', dec: 0, color: '#2fc4b8', icon: 'cloud', min: 0, max: 100 },
  };
  const KEYS = Object.keys(SENSORS);
  const LEVEL_ICON = { good: 'check', warn: 'warn', bad: 'alert', info: 'info' };
  const STATE = {
    healthy: { label: 'Healthy', icon: 'check', color: '#34d399' },
    normal: { label: 'Normal', icon: 'warn', color: '#fbbf24' },
    unhealthy: { label: 'Unhealthy', icon: 'alert', color: '#fb7185' },
    sleeping: { label: 'Resting', icon: 'moon', color: '#a5b4fc' },
  };
  const fmt = (k, v) => v.toLocaleString(undefined, { minimumFractionDigits: SENSORS[k].dec, maximumFractionDigits: SENSORS[k].dec });
  const short = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(v);
  const pos = (k, v) => {
    const s = SENSORS[k];
    const f = s.log ? (Math.log10(Math.max(v, s.min)) - Math.log10(s.min)) / (Math.log10(s.max) - Math.log10(s.min)) : (v - s.min) / (s.max - s.min);
    return clamp(f) * 100;
  };
  const levelText = lv => lv.resting ? 'Night' : lv.level === 'good' ? 'Ideal' : (lv.level === 'warn' ? 'A bit ' : 'Too ') + lv.dir;
  const ago = s => s < 5 ? 'just now' : s < 60 ? Math.round(s) + 's ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago';

  $('#sensors').innerHTML = KEYS.map(k => `
    <div class="card sensor" id="s-${k}" data-level="good" style="--c:${SENSORS[k].color}">
      <div class="sensor-top"><span class="sensor-ic">${icon(SENSORS[k].icon)}</span>${SENSORS[k].label}<span class="badge"></span></div>
      <div class="sensor-val"><b>--</b><span>${SENSORS[k].unit}</span></div>
      <div class="spark"></div>
      <div class="range"><i class="ok"></i><i class="ideal"></i><i class="mark"></i></div>
      <div class="range-legend"><span class="lo"></span><span class="mid"></span><span class="hi"></span></div>
    </div>`).join('');

  // ---- scene ----------------------------------------------------------
  // Website moods that have a face on the pot (other plant profiles can pick moods the pot does not have)
  const MOOD_FACE = { happy: 'HAPPY', thirsty: 'THIRSTY', drowning: 'OVERWATERED', hot: 'HOT', cold: 'COLD', sleeping: 'SLEEPY' };
  const scene = PlantScene.createScene($('#scene'), { mood: 'neutral', color: '#fbbf24', vitality: 0.7 });
  const DEMOS = {
    healthy: { vitality: 1, droop: 0, hour: 10.5, bright: 1, moist: 0.6, mood: 'happy', color: STATE.healthy.color },
    normal: { vitality: 0.62, droop: 0.26, hour: 17.4, bright: 1, moist: 0.35, mood: 'neutral', color: STATE.normal.color },
    unhealthy: { vitality: 0.08, droop: 0.95, hour: 13, bright: 1, moist: 0.08, mood: 'thirsty', color: STATE.unhealthy.color },
  };
  document.querySelectorAll('canvas[data-demo]').forEach(c => PlantScene.createScene(c, DEMOS[c.dataset.demo]));

  // ---- smooth number animation -----------------------------------------
  const shown = {}, target = {};
  function animate() {
    requestAnimationFrame(animate);
    for (const k in target) {
      if (shown[k] == null) shown[k] = target[k];
      shown[k] += (target[k] - shown[k]) * 0.14;
      if (Math.abs(target[k] - shown[k]) < 0.004 * Math.max(1, Math.abs(target[k]))) shown[k] = target[k];
      const el = k === 'score' ? $('#scoreNum') : $(`#s-${k} .sensor-val b`);
      const txt = k === 'score' ? String(Math.round(shown[k])) : fmt(k, shown[k]);
      if (el.textContent !== txt) el.textContent = txt;
    }
  }
  animate();

  // ---- live dashboard ---------------------------------------------------
  let lastEvent = 0, firstLoad = true, lastRecs = '', profileId = null, serverNow = 0;

  function swapText(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
  }

  function toast(ev) {
    const t = document.createElement('div');
    t.className = 'toast'; t.dataset.level = ev.severity;
    t.innerHTML = `<span class="li-ic">${icon(LEVEL_ICON[ev.severity] || 'info')}</span><div><b>${esc(ev.title)}</b><p>${esc(ev.message)}</p></div>`;
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 5200);
  }

  // The notification list refreshes on a calm 5 second cycle: new items wait in a
  // queue, the bar fills, then they slide in. Nothing is rebuilt in between.
  const FEED_MS = 5000, feedEl = $('#feed'), queue = [];
  let cycle = null;
  function addFeed(e, animate, delay = 0) {
    const empty = feedEl.querySelector('.empty');
    if (empty) empty.remove();
    const li = document.createElement('li');
    li.dataset.level = e.severity; li.dataset.t = e.received_at;
    if (animate) { li.className = 'enter'; li.style.animationDelay = delay + 'ms'; }
    li.innerHTML = `<span class="li-ic">${icon(e.title === 'Watered' ? 'drop' : LEVEL_ICON[e.severity] || 'info')}</span>
      <div><b>${esc(e.title)}</b><p>${esc(e.message)}</p></div><time>${ago(serverNow - e.received_at)}</time>`;
    feedEl.prepend(li);
    while (feedEl.children.length > 30) feedEl.lastChild.remove();
  }
  function flushFeed() {
    queue.splice(0).forEach((e, i) => addFeed(e, true, i * 90));
    feedEl.querySelectorAll('li[data-t]').forEach(li => {
      const el = li.querySelector('time'), txt = ago(serverNow - li.dataset.t);
      if (el.textContent !== txt) el.textContent = txt;
    });
  }
  function clearFeed() {
    queue.length = 0;
    feedEl.innerHTML = '<li class="empty">No notifications yet.</li>';
  }
  function startCycle() {
    cycle = $('#feedBar').animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: FEED_MS, easing: 'linear' });
    cycle.onfinish = () => { flushFeed(); startCycle(); };
  }
  setInterval(() => {
    if (!cycle) return;
    const left = Math.max(1, Math.ceil((FEED_MS - (cycle.currentTime || 0)) / 1000));
    const html = (queue.length ? `<b>${queue.length} new</b> · ` : '') + `refreshes in ${left}s`;
    if ($('#feedNext').innerHTML !== html) $('#feedNext').innerHTML = html;
  }, 200);

  function render(d) {
    serverNow = d.now;
    const conn = $('#conn');
    conn.className = 'conn ' + (d.online ? 'on' : d.reading ? 'off' : '');
    const via = { usb: ' · USB', wifi: ' · Wi-Fi' }[d.via] || '';
    $('#connText').textContent = d.online ? 'Pot online' + via : d.reading ? `Pot offline · last seen ${ago(d.age)}${via}` : 'Waiting for the pot…';
    document.body.classList.toggle('offline', !d.online && !!d.reading);

    if (d.profile.id !== profileId) {
      profileId = d.profile.id;
      $('#profileSel').value = profileId;
      $('#latin').textContent = d.profile.latin;
      for (const k of KEYS) {
        const [okLo, okHi] = d.profile[k].ok, [idLo, idHi] = d.profile[k].ideal;
        const card = $(`#s-${k}`);
        card.querySelector('.ok').style.cssText = `left:${pos(k, okLo)}%;width:${pos(k, okHi) - pos(k, okLo)}%`;
        card.querySelector('.ideal').style.cssText = `left:${pos(k, idLo)}%;width:${pos(k, idHi) - pos(k, idLo)}%`;
        card.querySelector('.lo').textContent = short(SENSORS[k].min);
        card.querySelector('.mid').textContent = d.profile[k].note || `ideal ${short(idLo)} to ${short(idHi)} ${SENSORS[k].unit}`;
        card.querySelector('.hi').textContent = short(SENSORS[k].max);
      }
    }

    for (const ev of d.events) {
      lastEvent = Math.max(lastEvent, ev.id);
      if (firstLoad) addFeed(ev, false);
      else { queue.push(ev); toast(ev); plantAlert(ev); if (ev.title === 'Watered') scene.water(); }
    }
    if (firstLoad) { firstLoad = false; startCycle(); }

    $('#factWater').textContent = d.last_watered ? ago(d.now - d.last_watered) : 'Not yet';
    $('#factCount').textContent = d.total_readings.toLocaleString();
    $('#factDevice').textContent = d.device_id || '--';
    if (!d.eval) return;

    const r = d.reading, e = d.eval;
    const key = e.mood === 'sleeping' ? 'sleeping' : e.state;
    const st = STATE[key];
    document.body.dataset.state = key;
    $('#statePill').innerHTML = icon(st.icon) + st.label;
    swapText($('#headline'), e.headline);
    swapText($('#subline'), e.subline);
    target.score = e.score;
    $('#ringFg').style.strokeDashoffset = 314.16 * (1 - e.score / 100);

    for (const k of KEYS) {
      const lv = e.levels[k], card = $(`#s-${k}`);
      target[k] = r[k];
      card.dataset.level = lv.level;
      const badge = card.querySelector('.badge');
      const html = icon(lv.resting ? 'moon' : LEVEL_ICON[lv.level]) + levelText(lv);
      if (badge.dataset.h !== html) { badge.dataset.h = html; badge.innerHTML = html; }
      card.querySelector('.mark').style.left = pos(k, r[k]) + '%';
      card.querySelector('.spark').innerHTML = Charts.sparkline(d.spark[k], SENSORS[k].color);
    }

    const recs = JSON.stringify(e.recommendations);
    if (recs !== lastRecs) {
      lastRecs = recs;
      $('#recs').innerHTML = e.recommendations.length
        ? e.recommendations.map(x => `<li data-level="${x.severity}"><span class="li-ic">${icon(SENSORS[x.sensor].icon)}</span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div></li>`).join('')
        : `<li data-level="good"><span class="li-ic">${icon('check')}</span><div><b>Nothing to do</b><p>${esc(e.subline)}</p></div></li>`;
    }

    // pot screen preview: the same pixels the pot draws. Without Wi-Fi the pot shows NO WIFI at the top left.
    const potFace = Oled.faces.includes(e.display) ? e.display : MOOD_FACE[e.mood];
    Oled.render($('#oledScreen'), potFace, d.via === 'usb' ? 'NO WIFI' : '', Oled.bottomLine(r));

    // plant scene
    const hour = +r.ts.slice(11, 13) + +r.ts.slice(14, 16) / 60;
    const lack = (k, dir) => e.levels[k].dir === dir ? 1 - e.levels[k].score / 100 : 0;
    const droop = Math.max(lack('soil', 'low') * 1.05, lack('temp', 'high') * 0.7, lack('temp', 'low') * 0.5,
      lack('soil', 'high') * 0.4, lack('light', 'low') * 0.45, e.night ? 0.1 : 0);
    scene.set({
      vitality: clamp((e.score - 12) / 82), droop: clamp(droop), hour, moist: r.soil / 100,
      bright: e.night ? 1 : clamp(Math.log10(Math.max(r.light, 1) / 40) / Math.log10(6000 / 40)),
      mood: e.mood, color: st.color,
    });
    const chip = $('#clockChip');
    chip.querySelector('b').textContent = r.ts.slice(11, 16);
    const want = e.night ? 'moon' : 'sun';
    if (chip.dataset.i !== want) { chip.dataset.i = want; chip.querySelector('svg').outerHTML = icon(want); }
  }

  async function poll() {
    try {
      const res = await fetch('/api/live?after=' + lastEvent);
      if (res.status === 401) { location.reload(); return; }   // signed out in another tab
      render(await res.json());
    } catch (err) {
      $('#conn').className = 'conn off';
      $('#connText').textContent = 'Server not reachable';
    }
    setTimeout(poll, 1000);
  }

  // ---- phone app and plant alerts -----------------------------------------
  // The service worker lets the site install as an app ("Add to Home Screen") and shows alerts.
  const swReady = 'serviceWorker' in navigator
    ? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null)
    : Promise.resolve(null);
  const canAlert = 'Notification' in window && 'serviceWorker' in navigator;
  const alertsOn = () => {
    try { return canAlert && Notification.permission === 'granted' && localStorage.getItem('alerts') !== 'off'; } catch (err) { return false; }
  };
  function paintAlertBtn() {
    const b = $('#alertBtn');
    if (!canAlert) { b.hidden = true; return; }
    b.hidden = false;
    const blocked = Notification.permission === 'denied';
    b.classList.toggle('on', alertsOn());
    b.innerHTML = icon('bell') + (blocked ? 'Alerts blocked' : alertsOn() ? 'Alerts on' : 'Turn on alerts');
    b.title = blocked ? 'Alerts are blocked in your browser settings for this site.' : alertsOn() ? 'Tap to turn plant alerts off.' : 'Get a phone notification when your plant needs something.';
  }
  async function showAlert(title, body, tag) {
    const reg = await swReady;
    const opts = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' };
    if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
  }
  // Alert for problems ("warn" or "bad") and waterings, only while the app is in the background.
  function plantAlert(ev) {
    if (!alertsOn() || !document.hidden || pushActive) return;   // with push, the server sends it
    if (ev.severity === 'warn' || ev.severity === 'bad' || ev.title === 'Watered') showAlert(ev.title, ev.message, 'plant-' + ev.id);
  }
  // Push: the server sends alerts to this phone even when the app is closed.
  // (On iPhone this works in the app added to the Home Screen, iOS 16.4 or newer.)
  let pushActive = false;
  const b64ToBytes = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  async function pushSubscribe() {
    try {
      const reg = await swReady;
      if (!reg || !('pushManager' in reg)) return false;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const r = await fetch('/api/push/key'); if (!r.ok) return false;
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes((await r.json()).key) });
      }
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      pushActive = res.ok;
    } catch (err) { pushActive = false; }
    return pushActive;
  }
  async function pushUnsubscribe() {
    pushActive = false;
    try {
      const reg = await swReady; const sub = reg && reg.pushManager && await reg.pushManager.getSubscription();
      if (sub) { await post('/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    } catch (err) { }
  }

  $('#alertBtn').addEventListener('click', async () => {
    if (Notification.permission === 'denied') { paintAlertBtn(); return; }
    if (Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { paintAlertBtn(); return; }
      try { localStorage.setItem('alerts', 'on'); } catch (err) { }
      showAlert('Plant alerts are on', "We'll tell you when your plant needs water, light or a better temperature.", 'alerts-on');
      pushSubscribe();
    } else {
      const turnOn = !alertsOn();
      try { localStorage.setItem('alerts', turnOn ? 'on' : 'off'); } catch (err) { }
      if (turnOn) pushSubscribe(); else pushUnsubscribe();
    }
    paintAlertBtn();
  });
  paintAlertBtn();

  // ---- admin: test phone alerts ---------------------------------------------
  const TEST_ALERTS = [
    ['drop', 'warn', 'Water me now', 'Soil is dry (18%). Give your plant some water.'],
    ['drop', 'bad', 'Too much water', 'Soil is waterlogged (92%). Stop watering and let it drain.'],
    ['thermo', 'bad', 'Too hot', "It's 34 °C. Move the pot somewhere cooler."],
    ['thermo', 'warn', 'Too cold', "It's 12 °C. Move the pot away from the AC."],
    ['sun', 'warn', 'Too dark', 'Light is low. Move the pot near a window.'],
    ['check', 'good', 'Watered', 'Soil moisture went up. Thanks for watering!'],
  ];
  $('#testAlerts').innerHTML = TEST_ALERTS.map(([ic, lv, title], i) =>
    `<button type="button" class="test-alert" data-i="${i}" data-level="${lv}">${icon(ic)}<span>${esc(title)}</span></button>`).join('');
  $('#testAlerts').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const [, , title, body] = TEST_ALERTS[b.dataset.i];
    const msg = $('#testMsg');
    msg.hidden = false;
    if (!alertsOn()) { msg.dataset.level = 'bad'; msg.textContent = 'Turn on alerts first: Dashboard, then "Turn on alerts" in the Notifications card.'; return; }
    const wait = $('#testDelay').checked ? 10 : 0;
    msg.dataset.level = 'good';
    if (pushActive) {   // real push from the server: works even when the app is closed
      fetch('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, delay: wait }) })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (!ok) { msg.dataset.level = 'bad'; msg.textContent = d.error; return; }
          msg.textContent = wait ? `"${title}" is coming from the server in 10 seconds. Swipe Sprout away now: it should still arrive.` : `"${title}" sent from the server.`;
        })
        .catch(() => { msg.dataset.level = 'bad'; msg.textContent = "Couldn't reach the server."; });
      return;
    }
    msg.textContent = wait ? `"${title}" arrives in 10 seconds. Lock your phone now (push isn't available here, so keep the app open in the background).` : `"${title}" sent.`;
    setTimeout(() => showAlert(title, body, 'test-' + Date.now()), wait * 1000);
  });

  // ---- account ----------------------------------------------------------
  // Start the dashboard only for a signed-in user; otherwise show the sign-in screen.
  async function startApp() {
    let res;
    try { res = await fetch('/api/me'); } catch (err) { res = null; }
    document.body.classList.remove('checking');
    if (!res || res.status === 401) { document.body.classList.add('signed-out'); $('#afUser').focus(); return; }
    const { user } = await res.json();
    $('#userName').textContent = user.name;
    $('#userRole').textContent = user.role === 'admin' ? 'Admin' : 'User';
    $('#userInitial').textContent = user.name.trim()[0].toUpperCase();
    isAdmin = user.role === 'admin';
    $('#adminTab').hidden = !isAdmin;
    if (isAdmin) route();   // the page may have been opened on #admin
    if (alertsOn()) pushSubscribe();   // keep this phone's push subscription up to date
    const d = await (await fetch('/api/profiles')).json();
    $('#profileSel').innerHTML = d.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('#profileSel').value = d.current;
    poll();
  }

  let authMode = 'login';
  const authForm = $('#authForm');
  const setAuthErr = (name, text) => {
    authForm.querySelector(`.err[data-for="${name}"]`).textContent = text || '';
    authForm.elements[name].closest('.field').classList.toggle('invalid', !!text);
  };
  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === 'signup';
    $('#authSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#afNameField').hidden = !signup;
    $('#authTitle').textContent = signup ? 'Create your account' : 'Welcome back';
    $('#authSub').textContent = signup ? 'Sign up to follow your plant from anywhere.' : 'Sign in to see how your plant is doing.';
    $('#afSubmit').textContent = signup ? 'Create account' : 'Sign in';
    $('#afHint').textContent = signup ? 'at least 8 characters' : '';
    $('#afUserHint').textContent = signup ? '3 to 20 letters or numbers' : '';
    $('#afPassword').autocomplete = signup ? 'new-password' : 'current-password';
    ['name', 'username', 'password'].forEach(k => setAuthErr(k, ''));
    $('#afError').hidden = true;
    (signup ? $('#afName') : $('#afUser')).focus();
  }
  $('#authSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setAuthMode(b.dataset.mode); });
  authForm.addEventListener('input', e => { if (e.target.name) setAuthErr(e.target.name, ''); $('#afError').hidden = true; });
  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    const v = Object.fromEntries(['name', 'username', 'password'].map(k => [k, authForm.elements[k].value]));
    const errs = {};
    if (authMode === 'signup' && v.name.trim().length < 2) errs.name = 'Enter your full name.';
    if (authMode === 'signup' && !/^[a-z0-9_.]{3,20}$/i.test(v.username.trim())) errs.username = 'Use 3 to 20 letters, numbers, _ or .';
    if (authMode === 'login' && !v.username.trim()) errs.username = 'Enter your username.';
    if (authMode === 'signup' ? v.password.length < 8 : !v.password) errs.password = authMode === 'signup' ? 'Use at least 8 characters.' : 'Enter your password.';
    ['name', 'username', 'password'].forEach(k => setAuthErr(k, errs[k]));
    if (Object.keys(errs).length) return;
    const btn = $('#afSubmit'), label = btn.textContent;
    btn.disabled = true; btn.textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…';
    try {
      const r = await fetch(authMode === 'signup' ? '/api/signup' : '/api/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      const d = await r.json();
      if (!r.ok) { Object.entries(d.errors || {}).forEach(([k, t]) => setAuthErr(k, t)); throw new Error(d.error); }
      location.reload();
    } catch (err) {
      $('#afError').textContent = err.message === 'Failed to fetch' ? "Couldn't reach the server. Try again." : err.message;
      $('#afError').hidden = false;
      btn.disabled = false; btn.textContent = label;
    }
  });
  $('#logoutBtn').addEventListener('click', async () => { await post('/api/logout'); location.reload(); });
  startApp();
  $('#profileSel').addEventListener('change', e => post('/api/profile', { id: e.target.value }));

  // ---- history ----------------------------------------------------------
  let histN = 360, histView = 'charts', hoverIdx = null, charts = [];
  const CHARTS = [...KEYS.map(k => ({ k, ...SENSORS[k] })), { k: 'score', label: 'Health score', unit: '/ 100', dec: 0, color: '#a78bfa', wide: true }];
  $('#charts').innerHTML = CHARTS.map(c => `
    <div class="card chart-card ${c.wide ? 'wide' : ''}" style="--c:${c.color}">
      <div class="chart-head"><i></i><b>${c.label}</b><span>${c.unit}</span><strong id="cv-${c.k}"></strong></div>
      <div class="chart" id="c-${c.k}"></div>
    </div>`).join('');

  async function loadHistory() {
    if ($('#page-history').hidden) return;
    const d = await (await fetch('/api/history?limit=' + histN)).json();
    const rows = d.readings;
    charts = CHARTS.map(c => {
      const last = rows[rows.length - 1];
      $(`#cv-${c.k}`).textContent = last ? last[c.k].toLocaleString(undefined, { maximumFractionDigits: c.dec }) : '';
      return Charts.lineChart($(`#c-${c.k}`), {
        points: rows.map(r => ({ ts: r.ts, v: r[c.k] })), color: c.color, unit: c.unit, dec: c.dec,
        band: c.k === 'score' ? null : d.profile[c.k].ideal,
        min: c.k === 'temp' ? null : 0, max: c.k === 'score' ? 100 : null,
        onHover: i => { hoverIdx = i; charts.forEach(ch => ch.setHover(i)); },
      });
    });
    if (hoverIdx != null) charts.forEach(ch => ch.setHover(hoverIdx));
    const lv = { healthy: 'good', normal: 'warn', unhealthy: 'bad' };
    $('#histTable').innerHTML = '<thead><tr><th>Pot clock</th><th>Soil %</th><th>Temp °C</th><th>Humidity %</th><th>Light lux</th><th>Health</th><th>State</th></tr></thead><tbody>' +
      rows.slice(-60).reverse().map(r => `<tr><td>${r.ts.replace('T', ' ')}</td><td>${r.soil.toFixed(1)}</td><td>${r.temp.toFixed(1)}</td><td>${r.humidity.toFixed(1)}</td><td>${Math.round(r.light).toLocaleString()}</td><td>${r.score}</td>
        <td><span class="badge" data-level="${lv[r.state]}">${icon(LEVEL_ICON[lv[r.state]])}${STATE[r.state].label}</span></td></tr>`).join('') + '</tbody>';
  }
  setInterval(() => loadHistory().catch(() => { }), 2000);
  const segment = (id, attr, fn) => $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    fn(b.dataset[attr]);
  });
  segment('#rangeSeg', 'n', v => { histN = +v; hoverIdx = null; loadHistory(); });
  segment('#viewSeg', 'v', v => { histView = v; $('#charts').hidden = v !== 'charts'; $('#tableWrap').hidden = v !== 'table'; loadHistory(); });

  // ---- about --------------------------------------------------------------
  const TEAM = [
    ['Group leader', 'Planning, About and Support pages'],
    ['Hardware engineer', 'ESP32, sensors and firmware'],
    ['Plant analyst', 'Face rules and project plan'],
    ['Database designer', 'Database design'],
    ['Web developer', 'Server, Dashboard and History pages'],
    ['Tester', 'Testing and user questionnaire'],
  ];
  $('#team').innerHTML = TEAM.map(([n, r], i) => `<div class="card member"><div class="avatar">${i + 1}</div><b>${esc(n)}</b><p>${esc(r)}</p></div>`).join('');

  // The six faces, in the order the pot checks them, drawn with the pot's own pixels
  const FACES = [
    ['SLEEPY', 'Light is under 10 lux', 'It is dark, so the plant rests. Move it to a window during the day.', 'rest', 'Resting', { temp: 22, light: 3, soil: 50 }],
    ['THIRSTY', 'Soil moisture is under 25%', 'The soil is drying out. Water the plant soon.', 'warn', 'Normal', { temp: 24, light: 3200, soil: 12 }],
    ['OVERWATERED', 'Soil moisture is over 85%', 'The soil is waterlogged. Stop watering and let it drain.', 'bad', 'Unhealthy', { temp: 23, light: 2900, soil: 93 }],
    ['HOT', 'Temperature is over 30 °C', 'Heat stress. Move the pot to a cooler, shaded spot.', 'bad', 'Unhealthy', { temp: 34, light: 9000, soil: 45 }],
    ['COLD', 'Temperature is under 15 °C', 'Too chilly. Move the pot away from the AC or a cold window.', 'warn', 'Normal', { temp: 11, light: 2500, soil: 50 }],
    ['HAPPY', 'None of the above', 'Soil, light and temperature are all in range. Nothing to do.', 'good', 'Healthy', { temp: 24, light: 3200, soil: 55 }],
  ];
  $('#faceCards').innerHTML = FACES.map(([f, rule, tip, lv, st], i) => `
    <div class="card face-card">
      <canvas data-face="${f}" width="128" height="64" aria-label="${f} face"></canvas>
      <div class="face-top"><span class="order">${i + 1}</span><b>${f}</b><span class="badge" data-level="${lv}">${st}</span></div>
      <p class="rule">${esc(rule)}</p><p class="tip">${esc(tip)}</p>
    </div>`).join('');
  FACES.forEach(([f, , , , , r]) => Oled.render(document.querySelector(`canvas[data-face="${f}"]`), f, '', Oled.bottomLine(r)));

  // ---- support form ------------------------------------------------------
  const form = $('#supportForm'), msg = $('#sfMessage');
  const setErr = (name, text) => {
    form.querySelector(`.err[data-for="${name}"]`).textContent = text || '';
    form.elements[name].closest('.field').classList.toggle('invalid', !!text);
  };
  function checkForm(v) {
    const e = {};
    if (v.name.length < 2) e.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) e.email = 'Enter a valid email address, like name@example.com.';
    const digits = v.phone.replace(/\D/g, '');
    if (v.phone && (!/^\+?[\d\s()-]+$/.test(v.phone) || digits.length < 7 || digits.length > 15)) e.phone = 'Enter a valid phone number, or leave it empty.';
    if (!v.topic) e.topic = 'Choose a topic.';
    if (v.message.length < 10) e.message = 'Write at least 10 characters so we can help.';
    return e;
  }
  const values = () => Object.fromEntries(['name', 'email', 'phone', 'topic', 'message'].map(k => [k, form.elements[k].value.trim()]));
  form.addEventListener('input', e => {
    if (e.target === msg) $('#sfCount').textContent = `${msg.value.length} / 1000`;
    if (e.target.name) setErr(e.target.name, '');
    $('#sfError').hidden = true;
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = values(), errs = checkForm(v);
    ['name', 'email', 'phone', 'topic', 'message'].forEach(k => setErr(k, errs[k]));
    if (Object.keys(errs).length) { form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea').focus(); return; }
    const btn = $('#sfSend'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const r = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      const d = await r.json();
      if (!r.ok) { Object.entries(d.errors || {}).forEach(([k, t]) => setErr(k, t)); throw new Error(d.error || 'Check the highlighted fields.'); }
      $('#sentText').textContent = `Thanks, ${v.name.split(' ')[0]}. Your reference number is ${d.ref}. We'll reply to ${v.email}.`;
      form.hidden = true; $('#supportSent').hidden = false;
    } catch (err) {
      $('#sfError').textContent = err.message === 'Failed to fetch' ? "Couldn't reach the server. Check that it's running and try again." : err.message;
      $('#sfError').hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Send message'; }
  });
  $('#sfAgain').addEventListener('click', () => {
    form.reset(); $('#sfCount').textContent = '0 / 1000'; form.hidden = false; $('#supportSent').hidden = true; $('#sfName').focus();
  });

  // ---- pages ----------------------------------------------------------------
  function route() {
    const pages = ['dashboard', 'history', 'about', 'support'].concat(isAdmin ? ['admin'] : []);
    const page = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
    document.querySelectorAll('.page').forEach(p => { p.hidden = p.id !== 'page-' + page; });
    document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.page === page));
    window.scrollTo(0, 0);
    if (page === 'history') loadHistory().catch(() => { });
  }
  window.addEventListener('hashchange', route);
  route();

  // ---- simulator drawer -------------------------------------------------------
  const hhmm = h => String(Math.floor(h) % 24).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60) % 60).padStart(2, '0');
  const SPOTS = ['Closet', 'Dim corner', 'Bright room', 'Window sill', 'Direct sun'];
  const SLIDERS = [
    { k: 'soil', label: 'Soil moisture', min: 0, max: 100, step: 1, color: SENSORS.soil.color, fmt: v => Math.round(v) + '%' },
    { k: 'temp', label: 'Room temperature', min: 0, max: 45, step: 0.5, color: SENSORS.temp.color, fmt: v => (+v).toFixed(1) + ' °C' },
    { k: 'exposure', label: 'Where the pot sits', min: 0, max: 1, step: 0.01, color: SENSORS.light.color, fmt: v => SPOTS[Math.min(4, Math.floor(v * 5))] },
    { k: 'humidity', label: 'Air humidity', min: 10, max: 95, step: 1, color: SENSORS.humidity.color, fmt: v => Math.round(v) + '%' },
    { k: 'hour', label: 'Time of day', min: 0, max: 23.75, step: 0.25, color: '#a78bfa', fmt: v => hhmm(+v) },
  ];
  $('#sliders').innerHTML = SLIDERS.map(s => `
    <div class="slider-row"><label for="sl-${s.k}">${s.label}<output id="out-${s.k}"></output></label>
      <input type="range" id="sl-${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" style="--c:${s.color}"></div>`).join('');

  const busy = {};      // sliders the user is dragging: do not overwrite them from the server
  const pending = {}; let sendTimer = null;
  function paint(s, v) {
    const input = $(`#sl-${s.k}`);
    input.style.setProperty('--p', ((v - s.min) / (s.max - s.min) * 100) + '%');
    $(`#out-${s.k}`).textContent = s.fmt(v);
  }
  function send(values) {
    Object.assign(pending, values);
    if (sendTimer) return;
    sendTimer = setTimeout(() => { sendTimer = null; const body = { ...pending }; for (const k in pending) delete pending[k]; post('/api/sim', body).then(renderSim); }, 90);
  }
  SLIDERS.forEach(s => {
    const input = $(`#sl-${s.k}`);
    input.addEventListener('input', () => { busy[s.k] = Date.now(); paint(s, +input.value); send({ [s.k]: +input.value }); });
  });

  function renderSim(sim) {
    for (const s of SLIDERS) {
      if (busy[s.k] && Date.now() - busy[s.k] < 1200) continue;
      $(`#sl-${s.k}`).value = sim[s.k];
      paint(s, sim[s.k]);
    }
    $('#dayCycle').checked = sim.day_cycle;
    $('#wifiTgl').checked = sim.wifi;
    $('#speedSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.s - sim.speed) < 1e-6));
    $('#payload').textContent = sim.last_payload ? JSON.stringify(sim.last_payload, null, 2) : '--';
  }
  async function pollSim() {
    if (document.body.classList.contains('sim-open')) {
      try { renderSim(await (await fetch('/api/sim')).json()); } catch (err) { }
    }
    setTimeout(pollSim, 1000);
  }

  fetch('/api/sim/options').then(r => r.json()).then(o => {
    $('#scenarios').innerHTML = o.scenarios.map(s => `<button type="button" data-id="${s.id}"><b>${esc(s.label)}</b><span>${esc(s.desc)}</span></button>`).join('');
    $('#speedSeg').innerHTML = o.speeds.map(s => `<button type="button" data-s="${s.value}">${s.label}</button>`).join('');
    openSimIfWanted();   // only now: online there is no simulator, so the panel never flashes open
    pollSim();
  }).catch(() => {   // real pot mode: the backend has no simulator
    $('#simBtn').hidden = true;
    document.body.classList.remove('sim-open');
  });
  $('#scenarios').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    for (const k in busy) delete busy[k];
    post('/api/sim/scenario', { id: b.dataset.id }).then(renderSim);
  });
  $('#speedSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) post('/api/sim', { speed: +b.dataset.s }).then(renderSim); });
  $('#dayCycle').addEventListener('change', e => post('/api/sim', { day_cycle: e.target.checked }).then(renderSim));
  $('#wifiTgl').addEventListener('change', e => post('/api/sim', { wifi: e.target.checked }).then(renderSim));
  $('#waterBtn').addEventListener('click', () => { delete busy.soil; scene.water(); post('/api/sim/water').then(renderSim); });
  $('#resetBtn').addEventListener('click', async () => {
    await post('/api/reset'); clearFeed(); loadHistory().catch(() => { });
  });

  const setSim = open => {
    document.body.classList.toggle('sim-open', open);
    try { localStorage.setItem('sim-open', open ? '1' : '0'); } catch (err) { }
  };
  $('#simBtn').addEventListener('click', () => setSim(!document.body.classList.contains('sim-open')));
  $('#simClose').addEventListener('click', () => setSim(false));
  function openSimIfWanted() {
    let saved = null;
    try { saved = localStorage.getItem('sim-open'); } catch (err) { }
    const forced = new URLSearchParams(location.search).get('sim');
    if (forced ? forced === '1' : saved ? saved === '1' : window.innerWidth >= 1500) document.body.classList.add('sim-open');
  }
})();
