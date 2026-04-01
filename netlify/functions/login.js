// netlify/functions/login.js
//
// ── CARA SET ENV VARIABLES DI NETLIFY ──────────────────────────────────────
// Dashboard → Site → Site configuration → Environment variables → Add variable
//
// Wajib diisi:
//   TOKEN_SECRET   = kode rahasia bebas, misal: "kunci-lab-elektro-2024"
//                    (jangan share ke siapapun, dipakai untuk enkripsi HMAC)
//
// Untuk setiap user, tambahkan DUA variabel dengan format:
//   USER_1         = username,  misal: "admin"
//   PASS_1         = password,  misal: "Musiq1234"
//
//   USER_2         = username,  misal: "labtek"
//   PASS_2         = password,  misal: "lab@elektro"
//
//   USER_3         = username,  misal: "operator"
//   PASS_3         = password,  misal: "ops1234!"
//
// Untuk tambah user baru: cukup tambah pasangan USER_4 + PASS_4 di Netlify.
// Untuk hapus user: hapus pasangan USER_N + PASS_N dari Netlify.
// Tidak perlu edit kode sama sekali.
//
// Password disimpan PLAIN di env var Netlify — aman karena hanya bisa dibaca
// di server Netlify, tidak pernah dikirim ke browser.
// Di server, password di-hash SHA-256 lalu di-HMAC dengan TOKEN_SECRET.
// ────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

// Header CORS — wajib untuk request dari browser
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Request tidak valid' }),
    };
  }

  const { user, pass } = body;

  if (!user || !pass) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Username dan password wajib diisi' }),
    };
  }

  // TOKEN_SECRET wajib ada — tanpanya semua login ditolak
  const tokenSecret = process.env.TOKEN_SECRET;
  if (!tokenSecret) {
    console.error('TOKEN_SECRET tidak ditemukan di Netlify Environment Variables!');
    await randomDelay();
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Konfigurasi server tidak lengkap' }),
    };
  }

  // Baca semua pasangan USER_N + PASS_N dari environment variables
  // Sistem scan otomatis USER_1..USER_99 tanpa perlu hardcode username di kode
  const userLower = user.toLowerCase().trim();
  let storedPass  = null;

  for (let n = 1; n <= 99; n++) {
    const envUser = process.env[`USER_${n}`];
    if (!envUser) break; // tidak ada USER_N berikutnya, berhenti scan

    if (envUser.toLowerCase().trim() === userLower) {
      storedPass = process.env[`PASS_${n}`];
      break;
    }
  }

  if (!storedPass) {
    // Username tidak ditemukan atau PASS_N tidak diset
    await randomDelay();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Kredensial salah' }),
    };
  }

  // Bandingkan dengan HMAC-SHA256(SHA256(password), TOKEN_SECRET)
  // Kedua sisi diproses dengan cara identik sebelum dibandingkan
  const inputToken  = computeToken(pass,              tokenSecret);
  const storedToken = computeToken(storedPass.trim(), tokenSecret);

  const match = timingSafeCompare(inputToken, storedToken);

  await randomDelay();

  if (match) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, user: userLower }),
    };
  } else {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Kredensial salah' }),
    };
  }
};

// HMAC-SHA256( SHA256(password), tokenSecret ) — hasil hex string
function computeToken(password, secret) {
  const sha256 = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
  return crypto.createHmac('sha256', secret).update(sha256).digest('hex');
}

// Perbandingan string dengan waktu konstan (anti timing-attack)
function timingSafeCompare(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// Delay acak 300–700ms — memperlambat brute-force lewat jaringan
function randomDelay() {
  return new Promise(r => setTimeout(r, 300 + Math.random() * 400));
}
