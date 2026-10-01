import { beforeAll, describe, expect, it } from 'vitest';
import * as C from './crypto';
import { buildSafeContext } from './ai';
import { normalizeSite, type Site, type Task } from './types';

beforeAll(async () => {
  await C.sodiumReady();
});

describe('key derivation', () => {
  it('is deterministic and email-case-insensitive', async () => {
    const a = await C.deriveKeys('Me@Example.com', 'correct horse battery');
    const b = await C.deriveKeys(' me@example.com ', 'correct horse battery');
    expect(a.authPassword).toBe(b.authPassword);
    expect(C.toB64(a.encKey)).toBe(C.toB64(b.encKey));
  });

  it('auth password never equals the real password or the enc key', async () => {
    const k = await C.deriveKeys('me@example.com', 'correct horse battery');
    expect(k.authPassword).not.toContain('correct horse');
    expect(k.authPassword).not.toBe(Array.from(k.encKey, (b) => b.toString(16).padStart(2, '0')).join(''));
    expect(k.authPassword).toHaveLength(64);
  });

  it('different passwords give different keys', async () => {
    const a = await C.deriveKeys('me@example.com', 'password-one-long');
    const b = await C.deriveKeys('me@example.com', 'password-two-long');
    expect(a.authPassword).not.toBe(b.authPassword);
  });
});

describe('encryption', () => {
  it('round-trips JSON', () => {
    const key = C.randomKey();
    const value = { name: 'jacobengines.com', credentials: [{ password: 's3cr3t!' }] };
    const enc = C.encryptJson(value, key);
    expect(enc).not.toContain('s3cr3t');
    expect(C.decryptJson(enc, key)).toEqual(value);
  });

  it('rejects the wrong key and tampered data', () => {
    const enc = C.encryptJson({ a: 1 }, C.randomKey());
    expect(() => C.decryptJson(enc, C.randomKey())).toThrow();
    const raw = C.fromB64(enc);
    raw[raw.length - 1] ^= 1;
    expect(() => C.decryptJson(C.toB64(raw), C.randomKey())).toThrow();
  });

  it('uses a fresh nonce every time', () => {
    const key = C.randomKey();
    expect(C.encryptJson({ a: 1 }, key)).not.toBe(C.encryptJson({ a: 1 }, key));
  });
});

describe('team sharing', () => {
  it('only the intended member can open a sealed site key', () => {
    const alice = C.newKeyPair();
    const bob = C.newKeyPair();
    const siteKey = C.randomKey();
    const sealedForBob = C.sealKey(siteKey, bob.publicKey);
    expect(C.toB64(C.openSealedKey(sealedForBob, bob.publicKey, bob.privateKey))).toBe(C.toB64(siteKey));
    expect(() => C.openSealedKey(sealedForBob, alice.publicKey, alice.privateKey)).toThrow();
  });

  it('private key survives encryption with the master-derived key', async () => {
    const { encKey } = await C.deriveKeys('me@example.com', 'a long master password');
    const kp = C.newKeyPair();
    const stored = C.encryptBytes(kp.privateKey, encKey);
    expect(C.toB64(C.decryptBytes(stored, encKey))).toBe(C.toB64(kp.privateKey));
  });
});

describe('password generator', () => {
  it('has requested length and every character class', () => {
    for (let i = 0; i < 50; i++) {
      const p = C.generatePassword(20);
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%^&*\-_=+?]/);
    }
  });
});

describe('AI context', () => {
  it('never includes passwords, usernames, credential URLs or notes', () => {
    const site: Site = {
      id: 's1',
      ownerId: 'u1',
      role: 'owner',
      key: new Uint8Array(32),
      updatedAt: '',
      data: normalizeSite({
        name: 'Dave & Co Metals',
        url: 'https://daveandcometals.com',
        notes: 'backup code 998877',
        credentials: [
          { id: 'c1', kind: 'wp-admin', label: 'WP', url: 'https://secret-login.example/wp-admin', username: 'daveadmin', password: 'Hunter2!Hunter2!', notes: 'recovery 1234' },
        ],
      }),
    };
    const tasks: Task[] = [
      { id: 't1', siteId: 's1', createdBy: null, updatedAt: '', data: { title: 'Submit sitemap', notes: 'token abc', done: false, due: '', priority: 'high', assignee: '' } },
    ];
    const json = JSON.stringify(buildSafeContext([site], tasks));
    for (const secret of ['Hunter2', 'daveadmin', 'secret-login', 'recovery 1234', 'backup code', 'token abc']) {
      expect(json).not.toContain(secret);
    }
    expect(json).toContain('Dave & Co Metals');
    expect(json).toContain('Submit sitemap');
    expect(json).toContain('WordPress admin');
  });
});

describe('recovery key', () => {
  it('formats as 8 groups of 4 and normalizes typing mistakes', () => {
    const code = C.newRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    const sloppy = code.toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l').replace(/0/g, 'o');
    expect(C.normalizeRecoveryCode(sloppy)).toBe(code);
    expect(C.normalizeRecoveryCode(code.slice(0, 20))).toBeNull();
  });

  it('the same code always unlocks the same private key', async () => {
    const code = C.newRecoveryCode();
    const kp = C.newKeyPair();
    const stored = C.encryptBytes(kp.privateKey, await C.recoveryKeyFromCode(code));
    const back = C.decryptBytes(stored, await C.recoveryKeyFromCode(code.toLowerCase()));
    expect(C.toB64(back)).toBe(C.toB64(kp.privateKey));
    await expect(async () => C.decryptBytes(stored, await C.recoveryKeyFromCode(C.newRecoveryCode()))).rejects.toThrow();
  });
});
