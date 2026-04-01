// netlify/functions/login.js
//
// ── CARA SET ENV VARIABLES DI NETLIFY ──────────────────────────────────────
// Dashboard → Site → Site configuration → Environment variables → Add variable
//
// Wajib diisi:
//   SECRET_KEY     = kode rahasia bebas, misal: "kunci-lab-elektro-2024"
//                    (dipakai untuk enkripsi tambahan, jangan share ke siapapun)
//
//   PASS_ADMIN     = password plain admin,    misal: "Musiq1234"
//   PASS_LABTEK    = password plain labtek,   misal: "lab@elektro"
//   PASS_OPERATOR  = password plain operator, misal: "ops1234!"
//
// Password disimpan PLAIN di env var Netlify (aman karena tidak pernah ke browser).
// Di server, password di-hash SHA-256 lalu di-HMAC dengan SECRET_KEY sebelum dibandingkan.
// Browser hanya mengirim password plain lewat HTTPS — tidak ada hash yang bocor ke client.
//
// Untuk tambah user baru: tambah env var PASS_NAMABARU dan mapping di USER_ENV_MAP.
// ────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

// Header CORS — wajib untuk request dari browser
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Peta username → nama env variable password plain-nya
const USER_ENV_MAP = {
  admin:    'PASS_ADMIN',
  labtek:   'PASS_LABTEK',
  operator: 'PASS_OPERATOR',
};

exports.handler = async function (event) {
  // Handle OPTIONS preflight (browser mengirim ini sebelum POST cross-origin)
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

  // SECRET_KEY wajib ada — tanpanya semua login ditolak
  const secretKey = process.env.SECRET_KEY;
  if (!secretKey) {
    console.error('SECRET_KEY tidak ditemukan di Netlify Environment Variables!');
    await randomDelay();
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Konfigurasi server tidak lengkap' }),
    };
  }

  // Cek apakah username dikenali
  const envKey = USER_ENV_MAP[user.toLowerCase()];
  if (!envKey) {
    await randomDelay();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Kredensial salah' }),
    };
  }

  // Ambil password plain dari env var Netlify
  const storedPass = process.env[envKey];
  if (!storedPass) {
    console.error(`Env var ${envKey} tidak ditemukan di Netlify!`);
    await randomDelay();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Kredensial salah' }),
    };
  }

  // Enkripsi kedua sisi dengan cara yang sama:
  // HMAC-SHA256(SHA256(password), SECRET_KEY)
  // → SHA256 dulu agar panjang input seragam, lalu HMAC untuk binding ke secret server
  const inputToken  = computeToken(pass, secretKey);
  const storedToken = computeToken(storedPass.trim(), secretKey);

  const match = timingSafeCompare(inputToken, storedToken);

  await randomDelay();

  if (match) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, user: user.toLowerCase() }),
    };
  } else {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, msg: 'Kredensial salah' }),
    };
  }
};

// HMAC-SHA256( SHA256(password), secretKey ) — hasil hex string
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
