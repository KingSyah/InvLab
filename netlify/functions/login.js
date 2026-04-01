/* =============================================
   Inventaris Lab — login.js
   ============================================= */
(function () {
  'use strict';

  // ── KONFIGURASI ─────────────────────────────────────────────────
  // Kredensial dikelola di Netlify Environment Variables (PASS_ADMIN, dll.)
  // Autentikasi diproses oleh Netlify Function — password tidak pernah ke browser.

  const SESSION_KEY  = 'inv_auth';
  const MAX_ATTEMPTS = 3;
  const LOCKOUT_SEC  = 30;
  // ────────────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);

  // ── THEME ──────────────────────────────────────────────────────
  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    $('btn-theme').textContent = dark ? '☀️' : '🌙';
    try { localStorage.setItem('inv_theme', dark ? 'dark' : 'light'); } catch (e) {}
  }
  const savedTheme = (() => { try { return localStorage.getItem('inv_theme'); } catch (e) { return null; } })();
  applyTheme(savedTheme === 'dark');
  $('btn-theme').addEventListener('click', () =>
    applyTheme(!document.documentElement.classList.contains('dark')));

  // ── SESSION CHECK ──────────────────────────────────────────────
  function isAuthed() {
    try {
      const d = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      return d && d.ok === true && (Date.now() - d.ts) < 8 * 60 * 60 * 1000;
    } catch (e) { return false; }
  }

  if (isAuthed()) {
    window.location.replace('index.html');
    return;
  }

  // ── NOTICE: BARANG TERBARU ─────────────────────────────────────
  const FUNNY_LINES = [
    '— siap-siap jangan sampai hilang ya 👀',
    '— tolong jangan dijadiin kursi 🪑',
    '— semoga awet, amin 🙏',
    '— langsung dicatat biar nggak nyasar 📝',
    '— udah punya KTP belum nih? 🪪',
    '— welcome to the lab fam! 🎉',
    '— dijaga baik-baik ya, bukan punya sendiri 😅',
    '— jangan lupa charge kalau baterai 🔋',
    '— sudah dapat nama belum? 🏷️',
    '— siap bertugas! 💪',
    '— langsung masuk daftar VIP 😎',
    '— barang baru, semangat baru! ✨',
  ];
  const ICONS_MAP = {
    laptop: '💻', komputer: '🖥️', proyektor: '📽️',
    printer: '🖨️', kamera: '📷', meja: '🪑',
    kursi: '💺', keyboard: '⌨️', mouse: '🖱️',
    monitor: '🖥️', speaker: '🔊', kabel: '🔌',
    switch: '🔀', router: '📡', ups: '🔋',
    scanner: '🖨️', tablet: '📱', handphone: '📱',
    lemari: '🗄️', rak: '📚', default: '📦',
  };

  function getItemIcon(name) {
    const l = (name || '').toLowerCase();
    for (const [k, v] of Object.entries(ICONS_MAP)) {
      if (l.includes(k)) return v;
    }
    return ICONS_MAP.default;
  }

  function timeSince(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'baru saja';
    if (m < 60) return `${m} menit lalu`;
    if (h < 24) return `${h} jam lalu`;
    return `${d} hari lalu`;
  }

  function loadNotice() {
    try {
      const raw = localStorage.getItem('inv_state');
      if (!raw) {
        $('notice-icon').textContent  = '🗂️';
        $('notice-item').textContent  = 'Belum ada barang yang dicatat';
        $('notice-funny').textContent = ' — ayo mulai input data! 🚀';
        $('notice-time').textContent  = '';
        return;
      }
      const inv = (JSON.parse(raw).inventory) || [];
      if (!inv.length) {
        $('notice-icon').textContent  = '🕳️';
        $('notice-item').textContent  = 'Belum ada barang sama sekali';
        $('notice-funny').textContent = ' — database masih kosong melompong 😶';
        $('notice-time').textContent  = '';
        return;
      }
      // Selalu ambil barang dengan createdAt terbaru, bukan sekadar indeks [0]
      const latest = inv.reduce((newest, item) => {
        if (!newest) return item;
        const t1 = newest.createdAt ? new Date(newest.createdAt).getTime() : 0;
        const t2 = item.createdAt   ? new Date(item.createdAt).getTime()   : 0;
        return t2 > t1 ? item : newest;
      }, null);
      const qty    = latest.jumlah > 1 ? ` (${latest.jumlah} unit)` : '';
      const funny  = FUNNY_LINES[Math.floor(Math.random() * FUNNY_LINES.length)];
      $('notice-icon').textContent  = getItemIcon(latest.nama);
      $('notice-item').textContent  = `${latest.nama}${qty}`;
      $('notice-funny').textContent = ' ' + funny;
      $('notice-time').textContent  = `🕐 Ditambahkan ${timeSince(latest.createdAt)} · Kode: ${latest.kode || '—'}`;
    } catch (e) {
      $('notice-item').textContent  = 'Tidak dapat memuat data';
      $('notice-funny').textContent = '';
    }
  }

  loadNotice();

  // ── LOCKOUT ────────────────────────────────────────────────────
  let attempts = 0;
  let locked   = false;
  let timerId  = null;

  function startLockout() {
    locked = true;
    $('login-fields').style.display = 'none';
    $('locked-msg').classList.add('show');
    $('error-msg').classList.remove('show');

    let secs = LOCKOUT_SEC;
    $('countdown').textContent = secs;

    timerId = setInterval(() => {
      secs--;
      $('countdown').textContent = secs;
      if (secs <= 0) {
        clearInterval(timerId);
        locked   = false;
        attempts = 0;
        ['dot-1','dot-2','dot-3'].forEach(id => $( id).classList.remove('used'));
        $('locked-msg').classList.remove('show');
        $('login-fields').style.display = 'block';
        $('f-user').focus();
      }
    }, 1000);
  }

  function markAttempt() {
    attempts++;
    if (attempts >= 1) $('dot-1').classList.add('used');
    if (attempts >= 2) $('dot-2').classList.add('used');
    if (attempts >= 3) $('dot-3').classList.add('used');

    // Shake logo
    const logo = $('logo-icon');
    logo.classList.remove('shake');
    void logo.offsetWidth;
    logo.classList.add('shake');

    if (attempts >= MAX_ATTEMPTS) startLockout();
  }

  // ── HELPERS ────────────────────────────────────────────────────
  function showError(msg) {
    $('error-text').textContent = msg;
    $('error-msg').classList.remove('show');
    void $('error-msg').offsetWidth;
    $('error-msg').classList.add('show');
  }

  // ── LOGIN ──────────────────────────────────────────────────────
  async function doLogin() {
    if (locked) return;

    const user = $('f-user').value.trim();
    const pass = $('f-pass').value;

    if (!user || !pass) {
      showError('Username dan password wajib diisi!');
      return;
    }

    const btn = $('btn-login');
    btn.disabled = true;
    $('btn-login-text').innerHTML = '<span class="spinner"></span> Memeriksa...';

    let ok = false;
    let errMsg = 'Kredensial salah!';

    try {
      // Password dikirim ke server (HTTPS), diverifikasi di Netlify Function
      // Hash & enkripsi sepenuhnya terjadi di server — tidak ada credential di browser
      const res = await fetch('/.netlify/functions/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, pass }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      ok = data.ok === true;
      if (!ok && data.msg) errMsg = data.msg;
    } catch (e) {
      btn.disabled = false;
      $('btn-login-text').innerHTML = '🔓 Masuk';
      showError('Gagal terhubung ke server. Coba lagi.');
      return;
    }

    if (ok) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ok: true, user, ts: Date.now() }));
      } catch (e) {}
      $('btn-login-text').innerHTML = '✅ Berhasil! Mengalihkan...';
      setTimeout(() => window.location.replace('index.html'), 600);
    } else {
      btn.disabled = false;
      $('btn-login-text').innerHTML = '🔓 Masuk';
      $('f-pass').value = '';
      markAttempt();
      if (!locked) {
        const remaining = MAX_ATTEMPTS - attempts;
        showError(remaining > 0
          ? `${errMsg} Sisa ${remaining} percobaan.`
          : 'Akun dikunci sementara.');
      }
      $('f-pass').focus();
    }
  }

  // ── EVENT BINDINGS ─────────────────────────────────────────────
  $('btn-login').addEventListener('click', doLogin);
  $('f-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('f-user').addEventListener('keydown', e => { if (e.key === 'Enter') $('f-pass').focus(); });

  $('f-pass').addEventListener('keyup', e => {
    const caps = e.getModifierState && e.getModifierState('CapsLock');
    $('capslock-warn').classList.toggle('show', caps);
  });

  let pwVisible = false;
  $('pw-toggle').addEventListener('click', () => {
    pwVisible = !pwVisible;
    $('f-pass').type           = pwVisible ? 'text' : 'password';
    $('pw-toggle').textContent = pwVisible ? '🙈' : '👁️';
  });

  // Focus awal
  setTimeout(() => $('f-user').focus(), 300);

})();
