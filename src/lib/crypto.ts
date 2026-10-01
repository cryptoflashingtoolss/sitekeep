// All encryption happens here, on the device, using libsodium.
//
//  master password + email --Argon2id--> master key
//      master key --> auth password (sent to Supabase instead of your real password)
//      master key --> enc key (unlocks your private key and settings)
//  Each site has its own random key. That key is "sealed" to each member's
//  public key, so only members can open it.

import _sodium from 'libsodium-wrappers-sumo';

type Sodium = typeof _sodium;
let S: Sodium | null = null;

export async function sodiumReady(): Promise<Sodium> {
  if (!S) {
    await _sodium.ready;
    S = _sodium;
  }
  return S;
}

function so(): Sodium {
  if (!S) throw new Error('Encryption library not loaded yet');
  return S;
}

const SALT_CONTEXT = 'sitekeep|v1|';
// Argon2id cost: 3 passes, 64 MB. Strong, but still fast enough on phones.
const KDF_OPS = 3;
const KDF_MEM = 64 * 1024 * 1024;

export interface DerivedKeys {
  authPassword: string;
  encKey: Uint8Array;
}

export async function deriveKeys(email: string, password: string): Promise<DerivedKeys> {
  const s = await sodiumReady();
  const salt = s.crypto_generichash(s.crypto_pwhash_SALTBYTES, SALT_CONTEXT + email.trim().toLowerCase(), null);
  const master = s.crypto_pwhash(32, password, salt, KDF_OPS, KDF_MEM, s.crypto_pwhash_ALG_ARGON2ID13);
  const auth = s.crypto_generichash(32, 'sitekeep-auth-v1', master);
  const encKey = s.crypto_generichash(32, 'sitekeep-enc-v1', master);
  s.memzero(master);
  const authPassword = s.to_hex(auth);
  s.memzero(auth);
  return { authPassword, encKey };
}

export function randomKey(): Uint8Array {
  return so().randombytes_buf(so().crypto_secretbox_KEYBYTES);
}

export function encryptBytes(plain: Uint8Array, key: Uint8Array): string {
  const s = so();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(plain, nonce, key);
  const out = new Uint8Array(nonce.length + ct.length);
  out.set(nonce, 0);
  out.set(ct, nonce.length);
  return s.to_base64(out);
}

export function decryptBytes(payload: string, key: Uint8Array): Uint8Array {
  const s = so();
  const raw = s.from_base64(payload);
  const n = s.crypto_secretbox_NONCEBYTES;
  if (raw.length <= n) throw new Error('Encrypted data is corrupted');
  return s.crypto_secretbox_open_easy(raw.subarray(n), raw.subarray(0, n), key);
}

export function encryptJson(value: unknown, key: Uint8Array): string {
  return encryptBytes(so().from_string(JSON.stringify(value)), key);
}

export function decryptJson<T>(payload: string, key: Uint8Array): T {
  return JSON.parse(so().to_string(decryptBytes(payload, key))) as T;
}

export function newKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const kp = so().crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

export function sealKey(key: Uint8Array, recipientPublicKey: Uint8Array): string {
  return so().to_base64(so().crypto_box_seal(key, recipientPublicKey));
}

export function openSealedKey(sealed: string, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return so().crypto_box_seal_open(so().from_base64(sealed), publicKey, privateKey);
}

export function toB64(u: Uint8Array): string {
  return so().to_base64(u);
}

export function fromB64(s: string): Uint8Array {
  return so().from_base64(s);
}

export function wipe(u: Uint8Array | null | undefined): void {
  if (u && S) S.memzero(u);
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';

/** Strong random password from the Web Crypto RNG (works before libsodium loads). */
export function generatePassword(length = 20, symbols = true): string {
  const sets = [LOWER, UPPER, DIGITS, ...(symbols ? [SYMBOLS] : [])];
  const all = sets.join('');
  const uniform = (n: number) => {
    // rejection sampling: no modulo bias
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % n;
  };
  const pick = (chars: string) => chars[uniform(chars.length)];
  const out = sets.map(pick); // guarantee one of each class
  while (out.length < length) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = uniform(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

// ---------------------------------------------------------------- recovery key
// 20 random bytes shown as 8 groups of 4 characters (Crockford base32, no
// look-alike letters), e.g. "K7QM-2XPA-9TRB-...". Typos with I/L/O are forgiven.

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-');
}

export function normalizeRecoveryCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
  if (clean.length !== 32 || [...clean].some((c) => !B32.includes(c))) return null;
  return clean.match(/.{4}/g)!.join('-');
}

/** Turns the recovery code into an encryption key. */
export async function recoveryKeyFromCode(code: string): Promise<Uint8Array> {
  const s = await sodiumReady();
  const norm = normalizeRecoveryCode(code);
  if (!norm) throw new Error('That recovery key is not complete. It has 32 letters and numbers.');
  return s.crypto_generichash(32, 'sitekeep-recovery-v1|' + norm, null);
}
