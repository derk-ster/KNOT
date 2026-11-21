'use strict';
// Account layer on top of the anonymous session system.
// Passwords: Node's built-in scrypt with per-user random salt (no home-made crypto, no plaintext,
// no third-party dependency). Sessions stay HttpOnly cookies; a signed-in session user gains an
// account_id, which is how identity follows a person across devices.
// NOTE: without an email provider there is no automated password recovery; see docs/SETUP.md.
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString('hex');
  return `s1$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [v, N, r, p, salt, hash] = String(stored).split('$');
    if (v !== 's1') return false;
    const check = crypto.scryptSync(String(password), salt, Buffer.from(hash, 'hex').length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), check);
  } catch { return false; }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validEmail(e) { return EMAIL_RE.test(String(e || '')); }
function passwordProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Mix letters and numbers so it is harder to guess.';
  return null;
}

module.exports = { hashPassword, verifyPassword, validEmail, passwordProblem };
