const crypto = require('crypto');

function adler32(str) {
  const MOD_ADLER = 65521;
  let a = 1, b = 0;
  for (let i = 0; i < str.length; i++) {
    a = (a + str.charCodeAt(i)) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return (b << 16) | a;
}

function gameHashPassword(authname, password) {
    authname = authname.toLowerCase();
    const a32 = adler32(authname);
    const a32hex = a32.toString(16).padStart(8, '0');
    const rearranged = a32hex.slice(6, 8) + a32hex.slice(4, 6) + a32hex.slice(2, 4) + a32hex.slice(0, 2);
    const digest = crypto.createHash('sha512').update(password + rearranged, 'utf8').digest();
    return digest; // already a Buffer
  }

// The salt the client hashes with, as user_auth.salt holds it (a signed
// 32-bit int). AuthServer salts with this column when it checks a password
// itself (its admin port, password changes), so rows CityVault writes keep
// it right rather than 0.
function gameSalt(authname) {
  const a32 = adler32(authname.toLowerCase()) >>> 0;
  const swapped = (((a32 & 0xff) << 24) | ((a32 >>> 8 & 0xff) << 16) | ((a32 >>> 16 & 0xff) << 8) | (a32 >>> 24)) >>> 0;
  return swapped >= 0x80000000 ? swapped - 0x100000000 : swapped;
}

module.exports = { gameHashPassword, gameSalt };