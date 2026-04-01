/* =============================================
   Inventaris Lab — app.js  (fixed)
   ============================================= */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────
  let state = {
    inventory: [],
    nextId: 1,
    // URL default sudah diisi — bisa diganti di halaman Pengaturan
    apiUrl: 'https://script.google.com/macros/s/AKfycbxkneqXsAA8J4ZXCOw1a7uu9L_hlrA165GEn34PfQLmuoOXFE9oePn4kSr-HziRB491FQ/exec',
    report: {
      title: 'Laporan Inventaris Barang',
      location: '',
      idate: new Date().toISOString().slice(0, 10),
      rdate: new Date().toISOString().slice(0, 10),
      prefix: 'INV',
    },
    sigs: {
      resp: { role: 'Penanggung Jawab', title: '', name: '', nip: '' },
      appr: { role: 'Menyetujui',       title: '', name: '', nip: '' },
      witn: { role: 'Mengetahui',       title: '', name: '', nip: '' },
    },
  };

  let isSyncing = false;

  // ── DOM helper ─────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Escape HTML ────────────────────────────────────────────────────
  const esc = s => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ── Date formatter ─────────────────────────────────────────────────
  const fmtDate = d => {
    try { return d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'; }
    catch { return d || '-'; }
  };

  // ── Code generator ─────────────────────────────────────────────────
  const genCode = n => `${(state.report.prefix || 'INV').toUpperCase()}-${String(n).padStart(4, '0')}`;

  // ── Condition badge ────────────────────────────────────────────────
  const badgeCls = c => {
    if (!c) return 'b-def';
    const l = c.toLowerCase();
    if (l.includes('baru'))   return 'b-baru';
    if (l.includes('baik'))   return 'b-baik';
    if (l.includes('layak'))  return 'b-layak';
    if (l.includes('ringan')) return 'b-ringan';
    if (l.includes('berat'))  return 'b-berat';
    return 'b-def';
  };

  // ══════════════════════════════════════════════════════════════════
  //  TOAST
  // ══════════════════════════════════════════════════════════════════
  function toast(msg, type = 'info', dur = 4200) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast t-${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    $('toasts').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, dur);
  }

  // ══════════════════════════════════════════════════════════════════
  //  PERSISTENCE
  // ══════════════════════════════════════════════════════════════════
  function save() {
    try { localStorage.setItem('inv_state', JSON.stringify(state)); } catch (e) { }
  }

  function load() {
    try {
      const raw = localStorage.getItem('inv_state');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.inventory) {
        // Urutkan terbaru di atas saat load dari localStorage
        state.inventory = p.inventory.slice().sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
      }
      if (p.nextId)    state.nextId    = p.nextId;
      // Hanya timpa apiUrl dari storage jika ada dan tidak kosong
      if (p.apiUrl && p.apiUrl.trim())    state.apiUrl    = p.apiUrl;
      if (p.report)    state.report    = { ...state.report, ...p.report };
      if (p.sigs)      state.sigs      = {
        resp: { ...state.sigs.resp, ...(p.sigs.resp || {}) },
        appr: { ...state.sigs.appr, ...(p.sigs.appr || {}) },
        witn: { ...state.sigs.witn, ...(p.sigs.witn || {}) },
      };
    } catch (e) { console.warn('Load error:', e); }
  }

  function populateForms() {
    $('rep-title').value  = state.report.title    || '';
    $('rep-loc').value    = state.report.location || '';
    $('rep-prefix').value = state.report.prefix   || 'INV';
    $('rep-idate').value  = state.report.idate    || new Date().toISOString().slice(0, 10);
    $('rep-rdate').value  = state.report.rdate    || new Date().toISOString().slice(0, 10);
    $('cfg-api').value    = state.apiUrl          || '';
  }

  function saveReport() {
    state.report.title    = $('rep-title').value;
    state.report.location = $('rep-loc').value;
    state.report.prefix   = $('rep-prefix').value || 'INV';
    state.report.idate    = $('rep-idate').value;
    state.report.rdate    = $('rep-rdate').value;
    save();
  }

  // ══════════════════════════════════════════════════════════════════
  //  STATS
  // ══════════════════════════════════════════════════════════════════
  function updateStats() {
    const inv = state.inventory;
    const qty = inv.reduce((s, i) => s + (parseInt(i.jumlah) || 0), 0);
    const un  = inv.filter(i => !i.synced).length;
    $('stat-items').textContent    = inv.length;
    $('stat-qty').textContent      = qty.toLocaleString('id-ID');
    $('stat-unsynced').textContent = un;
    const chip = $('unsync-chip');
    chip.textContent    = un > 0 ? `${un} belum sinkron` : '';
    chip.style.display  = un > 0 ? 'inline-flex' : 'none';
  }

  // ══════════════════════════════════════════════════════════════════
  //  PENDING RETRY PANEL
  // ══════════════════════════════════════════════════════════════════
  function renderRetryPanel() {
    const panel   = $('retry-panel');
    const list    = $('retry-list');
    const counter = $('retry-count');
    const pending = state.inventory.filter(i => !i.synced);

    if (!pending.length) {
      panel.classList.remove('visible');
      return;
    }

    panel.classList.add('visible');
    counter.textContent = pending.length;

    list.innerHTML = pending.map(item => `
      <div class="retry-item">
        <span class="retry-item-name">${esc(item.nama)}</span>
        <span class="retry-item-meta">${esc(item.kode)} · ${item.jumlah} unit</span>
        <button class="btn btn-warn btn-sm" data-retry="${item.id}">
          🔄 Kirim Ulang
        </button>
      </div>
    `).join('');
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER TABLE
  // ══════════════════════════════════════════════════════════════════
  function renderTable() {
    const term  = ($('search').value || '').toLowerCase().trim();
    const items = term
      ? state.inventory.filter(i =>
          `${i.nama} ${i.kode} ${i.spesifikasi} ${i.kondisi} ${i.sumber}`
            .toLowerCase().includes(term))
      : state.inventory;

    const tbody = $('tbody');

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="10">
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <p>${term ? 'Tidak ada barang yang cocok.' : 'Belum ada data. Klik "✨ Tambah Barang".'}</p>
        </div>
      </td></tr>`;
      $('total-qty').textContent = 0;
      updateStats();
      renderRetryPanel();
      return;
    }

    let total = 0;
    tbody.innerHTML = items.map((item, i) => {
      total += parseInt(item.jumlah) || 0;
      const syncEl = item.synced
        ? `<span class="sync-badge sync-yes" title="Tersinkron: ${esc(item.syncedAt || '')}">☁️ Tersinkron</span>`
        : `<span class="sync-badge sync-no" data-retry="${item.id}" title="Klik untuk kirim ulang">⏳ Pending</span>`;

      return `<tr>
        <td class="col-no">${i + 1}</td>
        <td class="col-code">${esc(item.kode || '')}</td>
        <td class="col-name">${esc(item.nama)}</td>
        <td style="font-size:11.5px;color:var(--t3)">${esc(item.spesifikasi || '—')}</td>
        <td style="font-family:var(--mono);font-weight:600">${item.jumlah}</td>
        <td style="font-size:11.5px;color:var(--t3)">${esc(item.sumber || '—')}</td>
        <td style="color:var(--t3)">${item.tahun || '—'}</td>
        <td><span class="badge ${badgeCls(item.kondisi)}">${esc(item.kondisi || '—')}</span></td>
        <td>${syncEl}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm btn-icon" data-act="edit"  data-id="${item.id}" title="Edit">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" data-act="del"  data-id="${item.id}" title="Hapus">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    $('total-qty').textContent = total.toLocaleString('id-ID');
    updateStats();
    renderRetryPanel();
  }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER SIGNATURES
  // ══════════════════════════════════════════════════════════════════
  function renderSigs() {
    const boxes = ['resp', 'appr', 'witn']
      .filter(k => state.sigs[k].name || state.sigs[k].title)
      .map(k => {
        const s = state.sigs[k];
        return `<div class="sig-box">
          <div class="sig-role">${esc(s.role)},</div>
          <div class="sig-title">${esc(s.title) || '&nbsp;'}</div>
          <div style="height:55px"></div>
          <div class="sig-name">${esc(s.name) || '&nbsp;'}</div>
          <div class="sig-nip">${esc(s.nip) || ''}</div>
        </div>`;
      }).join('');

    const empty = '<p style="color:var(--t3);font-size:13px">Belum ada penanda tangan.</p>';
    $('sig-inv').innerHTML    = boxes || '';
    $('sig-report').innerHTML = boxes || empty;
  }

  // ══════════════════════════════════════════════════════════════════
  //  ITEM MODAL
  // ══════════════════════════════════════════════════════════════════
  function openModal(item) {
    $('item-form').reset();
    $('f-qty').value = 1;
    if (item) {
      $('modal-title').textContent = '✏️ Edit Barang';
      $('f-id').value     = item.id;
      $('f-name').value   = item.nama         || '';
      $('f-spec').value   = item.spesifikasi  || '';
      $('f-source').value = item.sumber       || '';
      $('f-year').value   = item.tahun        || '';
      $('f-cond').value   = item.kondisi      || '';
      $('f-qty').value    = item.jumlah       || 1;
      $('f-notes').value  = item.keterangan   || '';
    } else {
      $('modal-title').textContent = '✨ Tambah Barang';
      $('f-id').value = '';
    }
    $('item-overlay').classList.add('open');
    setTimeout(() => $('f-name').focus(), 80);
  }

  function closeModal() { $('item-overlay').classList.remove('open'); }

  function submitItem() {
    const nama   = $('f-name').value.trim();
    const jumlah = parseInt($('f-qty').value);
    if (!nama)               { toast('Nama barang wajib diisi!', 'warn');    $('f-name').focus(); return; }
    if (!jumlah || jumlah < 1) { toast('Jumlah harus minimal 1!', 'warn'); $('f-qty').focus();  return; }

    const btn = $('btn-submit-item');
    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Menyimpan...';

    const id   = $('f-id').value;
    const data = {
      nama,
      spesifikasi: $('f-spec').value.trim(),
      sumber:      $('f-source').value.trim(),
      tahun:       $('f-year').value.trim(),
      kondisi:     $('f-cond').value.trim(),
      jumlah,
      keterangan:  $('f-notes').value.trim(),
    };

    // Simpan item ke lokal dulu, tutup modal, baru sync — tidak perlu setTimeout lama
    btn.disabled  = false;
    btn.innerHTML = '💾 Simpan Barang';

    if (id) {
      const idx = state.inventory.findIndex(i => i.id == id);
      if (idx !== -1) {
        state.inventory[idx] = { ...state.inventory[idx], ...data, synced: false };
        save(); renderTable(); closeModal();
        toast('Barang diperbarui! Mengirim ke Sheets...', 'success');
        syncOne(state.inventory[idx]);
      }
    } else {
      const item = {
        id:        state.nextId++,
        kode:      genCode(state.nextId - 1),
        ...data,
        synced:    false,
        createdAt: new Date().toISOString(),
      };
      state.inventory.unshift(item);
      save(); renderTable(); closeModal();
      toast('Barang ditambahkan! Mengirim ke Sheets...', 'success');
      syncOne(item);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  SIGNATURE MODAL
  // ══════════════════════════════════════════════════════════════════
  function openSigModal() {
    const s = state.sigs;
    $('s-resp-title').value = s.resp.title || '';
    $('s-resp-name').value  = s.resp.name  || '';
    $('s-resp-nip').value   = s.resp.nip   || '';
    $('s-appr-title').value = s.appr.title || '';
    $('s-appr-name').value  = s.appr.name  || '';
    $('s-appr-nip').value   = s.appr.nip   || '';
    $('s-witn-title').value = s.witn.title || '';
    $('s-witn-name').value  = s.witn.name  || '';
    $('s-witn-nip').value   = s.witn.nip   || '';
    $('sig-overlay').classList.add('open');
  }

  function closeSigModal() { $('sig-overlay').classList.remove('open'); }

  function submitSig() {
    state.sigs.resp = { role: 'Penanggung Jawab', title: $('s-resp-title').value, name: $('s-resp-name').value, nip: $('s-resp-nip').value };
    state.sigs.appr = { role: 'Menyetujui',       title: $('s-appr-title').value, name: $('s-appr-name').value, nip: $('s-appr-nip').value };
    state.sigs.witn = { role: 'Mengetahui',        title: $('s-witn-title').value, name: $('s-witn-name').value, nip: $('s-witn-nip').value };
    save(); renderSigs(); closeSigModal();
    toast('✅ Penanda tangan disimpan!', 'success');
  }

  // ══════════════════════════════════════════════════════════════════
  //  GOOGLE SHEETS SYNC  ← PERBAIKAN UTAMA DI SINI
  // ══════════════════════════════════════════════════════════════════
  async function syncOne(item) {
    if (!state.apiUrl) {
      toast('⚠️ URL Apps Script belum diset! Buka menu ⚙️ Pengaturan.', 'warn', 6000);
      item.synced = false; save(); renderTable();
      return false;
    }

    setStatus('syncing');

    const payload = {
      kode:        item.kode        || '',
      nama:        item.nama        || '',
      spesifikasi: item.spesifikasi || '',
      sumber:      item.sumber      || '',
      tahun:       item.tahun       || '',
      kondisi:     item.kondisi     || '',
      jumlah:      item.jumlah      || 0,
      keterangan:  item.keterangan  || '',
    };

    try {
      const resp = await fetch(state.apiUrl, {
        method:  'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      let result = { status: 'success' };
      try { result = await resp.json(); } catch (_) {}

      if (result.status === 'error') throw new Error(result.message || 'Server error');

      item.synced   = true;
      item.syncedAt = new Date().toISOString();
      save(); renderTable(); setStatus('online');
      const action = result.action === 'update' ? 'diperbarui' : 'ditambahkan';
      toast(`☁️ "${item.nama}" berhasil ${action} di Google Sheets!`, 'success');
      return true;

    } catch (err) {
      console.error('[syncOne]', err.message);
      item.synced = false;
      save(); renderTable(); setStatus('offline');
      toast(`❌ Gagal kirim "${item.nama}". Cek koneksi atau URL Apps Script.`, 'error', 6000);
      return false;
    }
  }

  async function syncAll() {
    if (isSyncing) { toast('⏳ Sinkronisasi sedang berjalan...', 'info'); return; }
    if (!state.apiUrl) { toast('⚠️ URL Apps Script belum diset!', 'warn', 6000); return; }

    const pending = state.inventory.filter(i => !i.synced);
    if (!pending.length) { toast('✅ Semua data sudah tersinkron!', 'info'); return; }

    isSyncing = true;
    setStatus('syncing');

    const progress = $('retry-progress');
    const bar      = $('retry-progress-bar');
    if (progress) { progress.classList.add('active'); bar.style.width = '0%'; }

    toast(`☁️ Menyinkron ${pending.length} data ke Sheets...`, 'info');

    let done = 0, failed = 0;
    for (const item of pending) {
      const ok = await syncOne(item);
      if (ok) done++; else failed++;
      const pct = Math.round(((done + failed) / pending.length) * 100);
      if (bar) bar.style.width = pct + '%';
      await new Promise(r => setTimeout(r, 400));
    }

    if (progress) setTimeout(() => { progress.classList.remove('active'); bar.style.width = '0%'; }, 800);

    isSyncing = false;
    setStatus(failed > 0 ? 'offline' : 'online');

    if (failed === 0)      toast(`✅ Semua ${done} data berhasil tersinkron!`, 'success');
    else if (done === 0)   toast(`❌ Semua ${failed} data gagal dikirim.`, 'error', 6000);
    else                   toast(`⚠️ ${done} berhasil, ${failed} gagal. Cek koneksi.`, 'warn', 6000);

    renderRetryPanel();
  }

  async function retryOne(id) {
    const item = state.inventory.find(i => i.id == id);
    if (!item) return;
    toast(`🔄 Mengirim ulang "${item.nama}"...`, 'info');
    await syncOne(item);
  }

  // ══════════════════════════════════════════════════════════════════
  //  LOAD FROM SHEETS  ← FITUR BARU: baca data dari Google Sheets
  // ══════════════════════════════════════════════════════════════════
  async function loadFromSheets() {
    if (!state.apiUrl) return;
    setStatus('syncing');
    toast('☁️ Memuat data dari Google Sheets...', 'info', 3000);
    try {
      const r = await fetch(state.apiUrl + '?action=getAll', { method: 'GET', redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.status !== 'success') throw new Error(d.message || 'Gagal baca data');

      const rows = d.data || [];
      if (!rows.length) {
        toast('ℹ️ Sheets kosong, tidak ada data yang dimuat.', 'info');
        setStatus('online');
        return;
      }

      // Rebuild inventory dari Sheets — tetap pertahankan data lokal yang belum tersinkron
      const unsynced = state.inventory.filter(i => !i.synced);
      const fromSheets = rows.map((r, idx) => ({
        ...r,
        id: r.kode || (idx + 1),
      }));

      // Gabung: data Sheets + data lokal yang pending
      const allKodes = new Set(fromSheets.map(i => i.kode));
      const pendingNew = unsynced.filter(i => !allKodes.has(i.kode));

      // Urutkan terbaru di atas berdasarkan createdAt setelah digabung
      const merged = [...pendingNew, ...fromSheets];
      merged.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      state.inventory = merged;

      // Hitung nextId dari nomor kode tertinggi yang ada (misal INV-0023 → nextId = 24)
      const maxId = fromSheets.reduce((max, item) => {
        const n = parseInt((item.kode || '').replace(/\D/g, '')) || 0;
        return n > max ? n : max;
      }, 0);
      state.nextId = Math.max(state.nextId, maxId + 1);
      save();
      renderTable();
      renderRetryPanel();
      setStatus('online');
      toast(`✅ ${fromSheets.length} barang dimuat dari Google Sheets!`, 'success');
    } catch (err) {
      console.warn('[loadFromSheets]', err.message);
      setStatus('offline');
      toast('⚠️ Gagal memuat dari Sheets. Menampilkan data lokal.', 'warn', 5000);
    }
  }

  async function testApi() {
    const url = $('cfg-api').value.trim();
    if (!url) { toast('Masukkan URL terlebih dahulu', 'warn'); return; }
    const btn = $('btn-test-api');
    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Testing...';
    try {
      const r = await fetch(url + '?test=1', { method: 'GET', redirect: 'follow' });
      const d = await r.json();
      toast(`✅ Koneksi OK! Response: ${JSON.stringify(d)}`, 'success', 7000);
    } catch (e) {
      toast('⚠️ Tidak dapat menjangkau URL. Pastikan deployment sudah benar dan akses "Anyone".', 'warn', 8000);
    }
    btn.disabled  = false;
    btn.innerHTML = '🔌 Test Koneksi';
  }

  function setStatus(s) {
    const dot = $('status-dot'), lbl = $('status-lbl');
    if (!dot) return;
    dot.className   = `dot dot-${s === 'online' ? 'on' : s === 'offline' ? 'off' : 'sync'}`;
    lbl.textContent = s === 'online' ? 'Terhubung' : s === 'offline' ? 'Offline' : 'Menyinkron...';
  }

  // ══════════════════════════════════════════════════════════════════
  //  EXPORT / IMPORT
  // ══════════════════════════════════════════════════════════════════
  function exportJSON() {
    saveReport();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${(state.report.title || 'inventaris').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('💾 File JSON berhasil diunduh', 'success');
  }

  function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!Array.isArray(d.inventory)) throw new Error('Format file tidak valid');
        if (!confirm('Data saat ini akan ditimpa. Lanjutkan?')) return;
        if (d.inventory) {
          // Urutkan terbaru di atas
          state.inventory = d.inventory.slice().sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
          });
        }
        if (d.nextId)    state.nextId    = d.nextId;
        if (d.apiUrl)    state.apiUrl    = d.apiUrl;
        if (d.report)    state.report    = { ...state.report, ...d.report };
        if (d.sigs)      state.sigs      = {
          resp: { ...state.sigs.resp, ...(d.sigs.resp || {}) },
          appr: { ...state.sigs.appr, ...(d.sigs.appr || {}) },
          witn: { ...state.sigs.witn, ...(d.sigs.witn || {}) },
        };
        save(); populateForms(); renderTable(); renderSigs();
        toast('📁 Data berhasil dimuat!', 'success');
      } catch (err) {
        toast(`❌ Gagal memuat: ${err.message}`, 'error');
      } finally { e.target.value = ''; }
    };
    reader.readAsText(file);
  }

  // ══════════════════════════════════════════════════════════════════
  //  PRINT
  // ══════════════════════════════════════════════════════════════════
  function printReport() {
    saveReport();
    $('print-title').textContent = state.report.title    || 'Laporan Inventaris';
    $('print-loc').textContent   = state.report.location || '-';
    $('print-idate').textContent = fmtDate(state.report.idate);
    $('print-rdate').textContent = fmtDate(state.report.rdate);
    window.print();
  }

  // ══════════════════════════════════════════════════════════════════
  //  NAVIGATION
  // ══════════════════════════════════════════════════════════════════
  function navigate(page) {
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.page').forEach(p =>
      p.classList.toggle('active', p.id === `page-${page}`));
    closeSidebar();
    if (page === 'inventory') { renderTable(); renderRetryPanel(); }
    if (page === 'report')    renderSigs();
  }

  function openSidebar()  { $('sidebar').classList.add('open');    $('sb-overlay').classList.add('vis'); }
  function closeSidebar() { $('sidebar').classList.remove('open'); $('sb-overlay').classList.remove('vis'); }

  // ══════════════════════════════════════════════════════════════════
  //  THEME
  // ══════════════════════════════════════════════════════════════════
  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    $('btn-theme').textContent = dark ? '☀️' : '🌙';
    $('btn-theme').title = dark ? 'Mode Terang' : 'Mode Gelap';
    try { localStorage.setItem('inv_theme', dark ? 'dark' : 'light'); } catch(e) {}
  }

  function toggleTheme() {
    applyTheme(!document.documentElement.classList.contains('dark'));
  }

  // ══════════════════════════════════════════════════════════════════
  //  APPS SCRIPT CODE TEMPLATE
  // ══════════════════════════════════════════════════════════════════
  const APPSCRIPT_CODE = `const SHEET_NAME = "Inv.Lab";

// ══════════════════════════════════════════════════════════════════
//  doPost — Simpan / Update data (anti-duplikat berdasarkan Kode)
// ══════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return buildResponse({ status: "error", message: "Sheet tidak ditemukan: " + SHEET_NAME });

    migrateIfNeeded(sheet);

    const kode = String(data.kode || "").trim();

    // Kode wajib ada — tolak request tanpa kode untuk mencegah data hantu
    if (!kode) {
      return buildResponse({ status: "error", message: "Kode barang wajib diisi" });
    }

    // Cari baris berdasarkan Kode (kolom A) — EXACT MATCH
    const lastRow = sheet.getLastRow();
    let targetRow = -1;

    if (lastRow >= 2) {
      const kodeRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < kodeRange.length; i++) {
        if (String(kodeRange[i][0]).trim() === kode) {
          targetRow = i + 2;
          break;
        }
      }
    }

    const rowData = [
      kode,
      String(data.nama        || ""),
      String(data.spesifikasi || ""),
      String(data.sumber      || ""),
      String(data.tahun       || ""),
      String(data.kondisi     || ""),
      parseInt(data.jumlah)   || 0,
      String(data.keterangan  || ""),
      new Date().toISOString()
    ];

    if (targetRow > 0) {
      // UPDATE baris yang sudah ada — tidak pernah duplikat
      sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
      return buildResponse({ status: "success", message: "Data diperbarui", action: "update", row: targetRow });
    } else {
      // INSERT baris baru
      sheet.appendRow(rowData);
      return buildResponse({ status: "success", message: "Data ditambahkan", action: "insert" });
    }

  } catch (err) {
    return buildResponse({ status: "error", message: err.toString() });
  }
}

// ══════════════════════════════════════════════════════════════════
//  doGet — Baca semua data / ping
// ══════════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;

    if (action === "getAll") {
      const ss    = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) return buildResponse({ status: "error", message: "Sheet tidak ditemukan: " + SHEET_NAME });

      migrateIfNeeded(sheet);

      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return buildResponse({ status: "success", data: [] });

      const rows = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

      const inventory = rows
        .filter(r => String(r[1] || "").trim() !== "")
        .map((r, i) => ({
          id:          i + 1,
          kode:        String(r[0] || ""),
          nama:        String(r[1] || ""),
          spesifikasi: String(r[2] || ""),
          sumber:      String(r[3] || ""),
          tahun:       String(r[4] || ""),
          kondisi:     String(r[5] || ""),
          jumlah:      parseInt(r[6]) || 0,
          keterangan:  String(r[7] || ""),
          createdAt:   String(r[8] || ""),
          synced:      true,
          syncedAt:    String(r[8] || "")
        }));

      return buildResponse({ status: "success", data: inventory });
    }

    return buildResponse({ status: "ok", message: "API aktif \u2713" });

  } catch (err) {
    return buildResponse({ status: "error", message: err.toString() });
  }
}

// ══════════════════════════════════════════════════════════════════
//  migrateIfNeeded — Deteksi & konversi format lama ke format baru
// ══════════════════════════════════════════════════════════════════
function migrateIfNeeded(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) { ensureHeader(sheet); return; }

  const headerA = String(sheet.getRange(1, 1).getValue()).toLowerCase().trim();
  if (headerA === "kode") return; // sudah format baru

  const numCols = sheet.getLastColumn();
  const headerB = numCols >= 2 ? String(sheet.getRange(1, 2).getValue()).toLowerCase().trim() : "";
  const hasKodeB = headerB === "kode";

  const readCols = Math.min(numCols, 10);
  const dataRows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, readCols).getValues()
    : [];

  sheet.clearContents();
  sheet.appendRow(["Kode", "Nama Barang", "Spesifikasi", "Sumber", "Tahun", "Kondisi", "Jumlah", "Keterangan", "Timestamp"]);

  let counter = 1;
  dataRows.forEach(r => {
    let timestamp, kode, nama, spesifikasi, sumber, tahun, kondisi, jumlah, keterangan;

    if (hasKodeB) {
      timestamp = r[0]; kode = String(r[1] || "").trim();
      nama = String(r[2] || "").trim(); spesifikasi = String(r[3] || "").trim();
      sumber = String(r[4] || "").trim(); tahun = String(r[5] || "").trim();
      kondisi = String(r[6] || "").trim(); jumlah = parseInt(r[7]) || 0;
      keterangan = String(r[8] || "").trim();
    } else {
      timestamp = r[0]; kode = "";
      nama = String(r[1] || "").trim(); spesifikasi = String(r[2] || "").trim();
      sumber = String(r[3] || "").trim(); tahun = String(r[4] || "").trim();
      kondisi = String(r[5] || "").trim(); jumlah = parseInt(r[6]) || 0;
      keterangan = String(r[7] || "").trim();
    }

    if (!nama) return;
    if (!kode) kode = "INV-" + String(counter).padStart(4, "0");
    counter++;

    const tsStr = timestamp instanceof Date ? timestamp.toISOString() : String(timestamp || "");
    sheet.appendRow([kode, nama, spesifikasi, sumber, tahun, kondisi, jumlah, keterangan, tsStr]);
  });
}

// ══════════════════════════════════════════════════════════════════
//  Helper
// ══════════════════════════════════════════════════════════════════
function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Kode", "Nama Barang", "Spesifikasi", "Sumber", "Tahun", "Kondisi", "Jumlah", "Keterangan", "Timestamp"]);
  }
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  // ══════════════════════════════════════════════════════════════════
  //  EVENT BINDINGS
  // ══════════════════════════════════════════════════════════════════
  function bindEvents() {
    $('hamburger').addEventListener('click', openSidebar);
    $('sb-overlay').addEventListener('click', closeSidebar);
    document.querySelectorAll('.nav-btn[data-page]').forEach(b =>
      b.addEventListener('click', () => navigate(b.dataset.page)));

    $('btn-add').addEventListener('click',       () => openModal());
    $('btn-add2').addEventListener('click',      () => openModal());
    $('btn-sync').addEventListener('click',      syncAll);
    $('btn-export').addEventListener('click',    exportJSON);
    $('btn-import-tr').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change',   importJSON);
    $('btn-print').addEventListener('click', printReport);
    $('btn-theme').addEventListener('click', toggleTheme);

    $('search').addEventListener('input', renderTable);

    $('item-overlay').addEventListener('click', e => { if (e.target === $('item-overlay')) closeModal(); });
    $('modal-x').addEventListener('click',      closeModal);
    $('modal-cancel').addEventListener('click', closeModal);
    $('btn-submit-item').addEventListener('click', submitItem);

    $('sig-overlay').addEventListener('click', e => { if (e.target === $('sig-overlay')) closeSigModal(); });
    $('sig-x').addEventListener('click',       closeSigModal);
    $('sig-cancel').addEventListener('click',  closeSigModal);
    $('btn-submit-sig').addEventListener('click', submitSig);
    $('btn-edit-sig').addEventListener('click',   openSigModal);

    $('tbody').addEventListener('click', e => {
      const actBtn = e.target.closest('[data-act]');
      if (actBtn) {
        const item = state.inventory.find(i => i.id == actBtn.dataset.id);
        if (!item) return;
        if (actBtn.dataset.act === 'edit') openModal(item);
        if (actBtn.dataset.act === 'del') {
          if (confirm(`Hapus "${item.nama}"?`)) {
            state.inventory = state.inventory.filter(i => i.id != item.id);
            save(); renderTable();
            toast('🗑️ Barang dihapus', 'info');
          }
        }
        return;
      }
      const badge = e.target.closest('[data-retry]');
      if (badge) retryOne(badge.dataset.retry);
    });

    $('retry-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-retry]');
      if (btn) retryOne(btn.dataset.retry);
    });

    $('btn-retry-all').addEventListener('click', syncAll);

    ['rep-title', 'rep-loc', 'rep-prefix', 'rep-idate', 'rep-rdate'].forEach(id =>
      $(id) && $(id).addEventListener('input', saveReport));

    $('btn-save-api').addEventListener('click', () => {
      const url = $('cfg-api').value.trim();
      if (!url) { toast('URL tidak boleh kosong!', 'warn'); return; }
      state.apiUrl = url;
      save();
      toast('✅ URL disimpan!', 'success');
    });
    $('btn-test-api').addEventListener('click', testApi);
    $('btn-copy-code').addEventListener('click', () => {
      navigator.clipboard.writeText(APPSCRIPT_CODE)
        .then(() => toast('📋 Kode disalin!', 'success'))
        .catch(() => toast('Gagal menyalin — salin manual dari kotak kode', 'warn'));
    });

    $('appscript-code').textContent = APPSCRIPT_CODE;

    // Logout
    const logoutBtn = $('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  // ══════════════════════════════════════════════════════════════════
  //  AUTH GUARD
  // ══════════════════════════════════════════════════════════════════
  function checkAuth() {
    try {
      const s = sessionStorage.getItem('inv_auth');
      if (!s) return false;
      const d = JSON.parse(s);
      return d.ok === true && (Date.now() - d.ts) < 8 * 60 * 60 * 1000;
    } catch(e) { return false; }
  }

  function logout() {
    try { sessionStorage.removeItem('inv_auth'); } catch(e) {}
    window.location.replace('login.html');
  }

  function getLoggedUser() {
    try {
      const d = JSON.parse(sessionStorage.getItem('inv_auth'));
      return d.user || 'admin';
    } catch(e) { return 'admin'; }
  }

  // ══════════════════════════════════════════════════════════════════
  //  BOOT
  // ══════════════════════════════════════════════════════════════════
  function boot() {
    // Auth guard: redirect ke login jika belum masuk
    if (!checkAuth()) {
      window.location.replace('login.html');
      return;
    }

    $('yr').textContent = new Date().getFullYear();

    // Tampilkan nama user
    const userEl = $('logged-user');
    if (userEl) userEl.textContent = getLoggedUser();

    load();
    const savedTheme = (() => { try { return localStorage.getItem('inv_theme'); } catch(e) { return null; } })();
    applyTheme(savedTheme === 'dark');
    bindEvents();
    populateForms();
    renderTable();
    renderSigs();
    renderRetryPanel();
    setStatus(state.apiUrl ? 'online' : 'offline');

    // Muat data dari Google Sheets saat aplikasi dibuka
    if (state.apiUrl) loadFromSheets();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
