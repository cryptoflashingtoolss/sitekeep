// Data layer: login, sites, tasks, team sharing, settings.
// Everything is encrypted/decrypted here; Supabase only stores ciphertext.

import { sb } from './supabase';
import * as C from './crypto';
import {
  DEFAULT_SETTINGS,
  newId,
  normalizeSite,
  normalizeTask,
  type Member,
  type Role,
  type Settings,
  type Site,
  type SiteData,
  type Task,
  type TaskData,
} from './types';

interface Session {
  userId: string;
  email: string;
  displayName: string;
  encKey: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  settings: Settings;
  isAdmin: boolean;
  hasRecoveryKey: boolean;
}

let session: Session | null = null;

export function getSession(): Session {
  if (!session) throw new Error('Vault is locked');
  return session;
}

export function isUnlocked(): boolean {
  return session !== null;
}

function fail(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

// ---------------------------------------------------------------- auth

export const MIN_PASSWORD_LENGTH = 12;

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your master password.`);
  }
}

const NOT_INVITED = "This email hasn't been invited to this SiteKeep yet. Ask your SiteKeep admin to invite you, then try again.";

/** Creates keys + profile. Returns the new recovery key to show the person once. */
async function createProfile(userId: string, email: string, displayName: string, encKey: Uint8Array): Promise<string> {
  const kp = C.newKeyPair();
  const recoveryCode = C.newRecoveryCode();
  const { error } = await sb()
    .from('profiles')
    .insert({
      id: userId,
      email: email.trim().toLowerCase(),
      display_name: displayName || null,
      public_key: C.toB64(kp.publicKey),
      enc_private_key: C.encryptBytes(kp.privateKey, encKey),
      enc_private_key_recovery: C.encryptBytes(kp.privateKey, await C.recoveryKeyFromCode(recoveryCode)),
      enc_settings: C.encryptJson(DEFAULT_SETTINGS, encKey),
    });
  C.wipe(kp.privateKey);
  if (error?.code === '42501') {
    await sb().auth.signOut().catch(() => undefined);
    throw new Error(NOT_INVITED);
  }
  fail(error, 'Could not create your profile');
  return recoveryCode;
}

async function openSession(userId: string, encKey: Uint8Array) {
  const { data, error } = await sb().from('profiles').select('*').eq('id', userId).single();
  fail(error, 'Could not load your profile');
  let privateKey: Uint8Array;
  try {
    privateKey = C.decryptBytes(data.enc_private_key, encKey);
  } catch {
    throw new Error('Could not unlock your vault. Was your password changed outside the app?');
  }
  let settings: Settings = { ...DEFAULT_SETTINGS };
  if (data.enc_settings) {
    try {
      settings = { ...DEFAULT_SETTINGS, ...C.decryptJson<Partial<Settings>>(data.enc_settings, encKey) };
    } catch {
      /* fall back to defaults */
    }
  }
  const { data: admin } = await sb().rpc('is_admin');
  session = {
    userId,
    email: data.email,
    displayName: data.display_name ?? '',
    encKey,
    publicKey: C.fromB64(data.public_key),
    privateKey,
    settings,
    isAdmin: admin === true,
    hasRecoveryKey: !!data.enc_private_key_recovery,
  };
}

export interface SignUpResult {
  status: 'ok' | 'confirm';
  recoveryKey?: string;
}

export async function signUp(email: string, password: string, displayName: string): Promise<SignUpResult> {
  checkPassword(password);
  const keys = await C.deriveKeys(email, password);
  const { data, error } = await sb().auth.signUp({
    email: email.trim(),
    password: keys.authPassword,
    options: { data: { display_name: displayName } },
  });
  fail(error, 'Sign up failed');
  if (!data.session || !data.user) return { status: 'confirm' }; // email confirmation is on
  const recoveryKey = await createProfile(data.user.id, email, displayName, keys.encKey);
  await openSession(data.user.id, keys.encKey);
  return { status: 'ok', recoveryKey };
}

/** Returns a recovery key when this was the first sign-in (profile just created). */
export async function signIn(email: string, password: string): Promise<{ recoveryKey?: string }> {
  const keys = await C.deriveKeys(email, password);
  const { data, error } = await sb().auth.signInWithPassword({ email: email.trim(), password: keys.authPassword });
  if (error) {
    throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  }
  const user = data.user;
  const { data: prof, error: profErr } = await sb().from('profiles').select('id').eq('id', user.id).maybeSingle();
  fail(profErr, 'Could not load your profile');
  let recoveryKey: string | undefined;
  if (!prof) {
    // First login after confirming the email: create keys now.
    recoveryKey = await createProfile(user.id, email, (user.user_metadata?.display_name as string) ?? '', keys.encKey);
  }
  await openSession(user.id, keys.encKey);
  return { recoveryKey };
}

/** Make a new recovery key (replaces any older one). Returns it to show once. */
export async function createRecoveryKey(): Promise<string> {
  const s = getSession();
  const code = C.newRecoveryCode();
  const { error } = await sb()
    .from('profiles')
    .update({ enc_private_key_recovery: C.encryptBytes(s.privateKey, await C.recoveryKeyFromCode(code)) })
    .eq('id', s.userId);
  fail(error, 'Could not save the recovery key');
  s.hasRecoveryKey = true;
  return code;
}

// ------------------------------------------------------- forgot password

/** Step 1: email a 6-digit code (Supabase "Reset password" email). */
export async function sendResetCode(email: string): Promise<void> {
  const { error } = await sb().auth.resetPasswordForEmail(email.trim());
  fail(error, 'Could not send the code');
}

/** Step 2: check the code. Signs in to the sync database only; the vault stays locked. */
export async function verifyResetCode(email: string, code: string): Promise<{ hasRecoveryKey: boolean }> {
  const { data, error } = await sb().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
  if (error) throw new Error('That code is wrong or has expired. Request a new one.');
  const { data: prof } = await sb().from('profiles').select('enc_private_key_recovery').eq('id', data.user!.id).maybeSingle();
  return { hasRecoveryKey: !!prof?.enc_private_key_recovery };
}

/** Step 3a: unlock with the recovery key and set a new master password. Nothing is lost. */
export async function resetWithRecoveryKey(email: string, recoveryCode: string, newPassword: string): Promise<void> {
  checkPassword(newPassword);
  const { data: auth } = await sb().auth.getUser();
  if (!auth.user) throw new Error('Your reset code expired. Start again.');
  const { data: prof, error } = await sb().from('profiles').select('enc_private_key_recovery').eq('id', auth.user.id).single();
  fail(error, 'Could not load your profile');
  if (!prof?.enc_private_key_recovery) throw new Error("This account doesn't have a recovery key. Choose \"I don't have it\" instead.");
  let privateKey: Uint8Array;
  try {
    privateKey = C.decryptBytes(prof.enc_private_key_recovery, await C.recoveryKeyFromCode(recoveryCode));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('That recovery key')) throw e;
    throw new Error("That recovery key doesn't match this account. Check it and try again.");
  }
  const next = await C.deriveKeys(email, newPassword);
  const { error: upErr } = await sb()
    .from('profiles')
    .update({ enc_private_key: C.encryptBytes(privateKey, next.encKey), enc_settings: C.encryptJson(DEFAULT_SETTINGS, next.encKey) })
    .eq('id', auth.user.id);
  C.wipe(privateKey);
  fail(upErr, 'Could not save your new password');
  const { error: pwErr } = await sb().auth.updateUser({ password: next.authPassword });
  fail(pwErr, 'Could not save your new password');
  await openSession(auth.user.id, next.encKey);
}

/**
 * Step 3b: no recovery key. Start over with new keys. Shared sites come back
 * once a teammate restores access; sites only you could open are lost.
 * Returns a new recovery key.
 */
export async function startFreshVault(email: string, newPassword: string): Promise<string> {
  checkPassword(newPassword);
  const { data: auth } = await sb().auth.getUser();
  if (!auth.user) throw new Error('Your reset code expired. Start again.');
  const next = await C.deriveKeys(email, newPassword);
  const kp = C.newKeyPair();
  const recoveryCode = C.newRecoveryCode();
  const { error } = await sb().rpc('start_fresh_vault', {
    p_public_key: C.toB64(kp.publicKey),
    p_enc_private_key: C.encryptBytes(kp.privateKey, next.encKey),
    p_enc_settings: C.encryptJson(DEFAULT_SETTINGS, next.encKey),
    p_enc_private_key_recovery: C.encryptBytes(kp.privateKey, await C.recoveryKeyFromCode(recoveryCode)),
  });
  C.wipe(kp.privateKey);
  fail(error, 'Could not start a fresh vault');
  const { error: pwErr } = await sb().auth.updateUser({ password: next.authPassword });
  fail(pwErr, 'Could not save your new password');
  await openSession(auth.user.id, next.encKey);
  return recoveryCode;
}

export async function lock(): Promise<void> {
  if (session) {
    C.wipe(session.encKey);
    C.wipe(session.privateKey);
    session = null;
  }
  try {
    await sb().auth.signOut();
  } catch {
    /* offline is fine */
  }
}

/**
 * Change the master password. Re-encrypts your private key and settings
 * with the new password and updates the login key. Site data is untouched
 * (it's protected by your key pair, which doesn't change).
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const s = getSession();
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your master password.`);
  }
  const current = await C.deriveKeys(s.email, currentPassword);
  const same = C.toB64(current.encKey) === C.toB64(s.encKey);
  C.wipe(current.encKey);
  if (!same) throw new Error('Current password is wrong.');

  const next = await C.deriveKeys(s.email, newPassword);
  const { error } = await sb()
    .from('profiles')
    .update({
      enc_private_key: C.encryptBytes(s.privateKey, next.encKey),
      enc_settings: C.encryptJson(s.settings, next.encKey),
    })
    .eq('id', s.userId);
  fail(error, 'Could not re-encrypt your keys');
  const { error: authErr } = await sb().auth.updateUser({ password: next.authPassword });
  if (authErr) {
    // Roll back so the old password keeps working.
    await sb()
      .from('profiles')
      .update({
        enc_private_key: C.encryptBytes(s.privateKey, s.encKey),
        enc_settings: C.encryptJson(s.settings, s.encKey),
      })
      .eq('id', s.userId);
    throw new Error(`Could not change password: ${authErr.message}`);
  }
  C.wipe(s.encKey);
  s.encKey = next.encKey;
}

// ------------------------------------------------------------ settings

export async function saveSettings(settings: Settings): Promise<void> {
  const s = getSession();
  const { error } = await sb()
    .from('profiles')
    .update({ enc_settings: C.encryptJson(settings, s.encKey) })
    .eq('id', s.userId);
  fail(error, 'Could not save settings');
  s.settings = settings;
}

// --------------------------------------------------------------- sites

export async function loadSites(): Promise<Site[]> {
  const s = getSession();
  const { data, error } = await sb()
    .from('site_members')
    .select('role, sealed_key, sites(id, owner_id, data, updated_at)')
    .eq('user_id', s.userId);
  fail(error, 'Could not load sites');

  const sites: Site[] = [];
  for (const row of (data ?? []) as any[]) {
    const site = Array.isArray(row.sites) ? row.sites[0] : row.sites;
    if (!site) continue;
    try {
      const key = C.openSealedKey(row.sealed_key, s.publicKey, s.privateKey);
      sites.push({
        id: site.id,
        ownerId: site.owner_id,
        role: row.role as Role,
        key,
        data: normalizeSite(C.decryptJson<Partial<SiteData>>(site.data, key)),
        updatedAt: site.updated_at,
      });
    } catch (e) {
      console.warn('Skipping a site that could not be decrypted', site.id, e);
    }
  }
  sites.sort((a, b) => a.data.name.localeCompare(b.data.name));
  return sites;
}

export async function createSite(data: SiteData): Promise<Site> {
  const s = getSession();
  const id = newId();
  const key = C.randomKey();
  // Insert without .select(): we aren't a member yet, so RLS would hide the row.
  const { error } = await sb().from('sites').insert({ id, owner_id: s.userId, data: C.encryptJson(data, key) });
  fail(error, 'Could not create site');
  const { error: memErr } = await sb()
    .from('site_members')
    .insert({ site_id: id, user_id: s.userId, role: 'owner', sealed_key: C.sealKey(key, s.publicKey) });
  if (memErr) {
    await sb().from('sites').delete().eq('id', id);
    fail(memErr, 'Could not create site');
  }
  return { id, ownerId: s.userId, role: 'owner', key, data, updatedAt: new Date().toISOString() };
}

export async function updateSite(site: Site, data: SiteData): Promise<Site> {
  const { error } = await sb().from('sites').update({ data: C.encryptJson(data, site.key) }).eq('id', site.id);
  fail(error, 'Could not save site');
  return { ...site, data, updatedAt: new Date().toISOString() };
}

export async function deleteSite(site: Site): Promise<void> {
  const { error } = await sb().from('sites').delete().eq('id', site.id);
  fail(error, 'Could not delete site');
}

// --------------------------------------------------------------- tasks

export async function loadTasks(sites: Site[]): Promise<Task[]> {
  if (sites.length === 0) return [];
  const keys = new Map(sites.map((x) => [x.id, x.key]));
  const { data, error } = await sb()
    .from('tasks')
    .select('id, site_id, data, created_by, updated_at')
    .in('site_id', [...keys.keys()]);
  fail(error, 'Could not load tasks');
  const tasks: Task[] = [];
  for (const row of data ?? []) {
    const key = keys.get(row.site_id);
    if (!key) continue;
    try {
      tasks.push({
        id: row.id,
        siteId: row.site_id,
        data: normalizeTask(C.decryptJson<Partial<TaskData>>(row.data, key)),
        createdBy: row.created_by,
        updatedAt: row.updated_at,
      });
    } catch (e) {
      console.warn('Skipping a task that could not be decrypted', row.id, e);
    }
  }
  return tasks;
}

export async function createTask(site: Site, data: TaskData): Promise<Task> {
  const s = getSession();
  const id = newId();
  const { error } = await sb()
    .from('tasks')
    .insert({ id, site_id: site.id, data: C.encryptJson(data, site.key), created_by: s.userId });
  fail(error, 'Could not add task');
  return { id, siteId: site.id, data, createdBy: s.userId, updatedAt: new Date().toISOString() };
}

export async function updateTask(site: Site, task: Task, data: TaskData): Promise<Task> {
  const { error } = await sb().from('tasks').update({ data: C.encryptJson(data, site.key) }).eq('id', task.id);
  fail(error, 'Could not save task');
  return { ...task, data, updatedAt: new Date().toISOString() };
}

export async function deleteTask(task: Task): Promise<void> {
  const { error } = await sb().from('tasks').delete().eq('id', task.id);
  fail(error, 'Could not delete task');
}

// ---------------------------------------------------------------- team

export async function listMembers(site: Site): Promise<Member[]> {
  const { data, error } = await sb()
    .from('site_members')
    .select('user_id, role, stale, profiles(email, display_name)')
    .eq('site_id', site.id);
  fail(error, 'Could not load members');
  return ((data ?? []) as any[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return { userId: r.user_id, role: r.role, waiting: !!r.stale, email: p?.email ?? 'unknown', displayName: p?.display_name ?? null };
  });
}

export async function addMember(site: Site, email: string, role: Exclude<Role, 'owner'>): Promise<void> {
  const s = getSession();
  const { data, error } = await sb().rpc('find_profile_by_email', { p_email: email });
  fail(error, 'Could not look up that person');
  const p = (data as any[] | null)?.[0];
  if (!p) throw new Error('No SiteKeep account uses that email. Ask them to create an account in the app first.');
  if (p.id === s.userId) throw new Error("That's you. You already have access.");
  const { error: insErr } = await sb()
    .from('site_members')
    .insert({ site_id: site.id, user_id: p.id, role, sealed_key: C.sealKey(site.key, C.fromB64(p.public_key)) });
  if (insErr?.code === '23505') throw new Error('That person already has access to this site.');
  fail(insErr, 'Could not share the site');
}

export async function changeMemberRole(site: Site, userId: string, role: Exclude<Role, 'owner'>): Promise<void> {
  const { error } = await sb().from('site_members').update({ role }).eq('site_id', site.id).eq('user_id', userId);
  fail(error, 'Could not change role');
}

/**
 * Remove a teammate, then re-encrypt the site and its tasks with a brand-new
 * key so their old copy of the key is useless. Returns the updated site.
 * Note: they may still remember passwords they already saw, so change those.
 */
export async function removeMember(site: Site, userId: string): Promise<Site> {
  const { error } = await sb().from('site_members').delete().eq('site_id', site.id).eq('user_id', userId);
  fail(error, 'Could not remove member');
  return rotateSiteKey(site);
}

export async function rotateSiteKey(site: Site): Promise<Site> {
  const newKey = C.randomKey();

  const { data: taskRows, error: tErr } = await sb().from('tasks').select('id, data').eq('site_id', site.id);
  fail(tErr, 'Could not load tasks for re-encryption');
  const tasks = (taskRows ?? []).map((t) => ({
    id: t.id,
    data: C.encryptJson(C.decryptJson<TaskData>(t.data, site.key), newKey),
  }));

  const { data: memberRows, error: mErr } = await sb()
    .from('site_members')
    .select('user_id, profiles(public_key)')
    .eq('site_id', site.id);
  fail(mErr, 'Could not load members for re-encryption');
  const keys = ((memberRows ?? []) as any[]).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return { user_id: m.user_id, sealed_key: C.sealKey(newKey, C.fromB64(p.public_key)) };
  });

  const { error } = await sb().rpc('rotate_site_key', {
    p_site: site.id,
    p_data: C.encryptJson(site.data, newKey),
    p_tasks: tasks,
    p_keys: keys,
  });
  fail(error, 'Could not re-encrypt the site');
  return { ...site, key: newKey };
}

/** Leave a site someone else shared with you. */
export async function leaveSite(site: Site): Promise<void> {
  const s = getSession();
  const { error } = await sb().from('site_members').delete().eq('site_id', site.id).eq('user_id', s.userId);
  fail(error, 'Could not leave site');
}

// ------------------------------------------------- restoring reset teammates

export interface WaitingMember {
  site: Site;
  userId: string;
  email: string;
  displayName: string | null;
  publicKey: string;
}

/** Teammates who reset their vault and are waiting for access to sites you can edit. */
export async function listWaiting(sites: Site[]): Promise<WaitingMember[]> {
  const editable = sites.filter((x) => x.role !== 'viewer');
  if (editable.length === 0) return [];
  const { data, error } = await sb()
    .from('site_members')
    .select('site_id, user_id, profiles(email, display_name, public_key)')
    .eq('stale', true)
    .in('site_id', editable.map((x) => x.id));
  fail(error, 'Could not check for teammates waiting for access');
  const me = getSession().userId;
  return ((data ?? []) as any[])
    .filter((r) => r.user_id !== me)
    .map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return { site: editable.find((x) => x.id === r.site_id)!, userId: r.user_id, email: p?.email ?? '', displayName: p?.display_name ?? null, publicKey: p?.public_key ?? '' };
    })
    .filter((w) => w.publicKey);
}

/** Give a reset teammate their access back (seals the site key to their new key). */
export async function restoreAccess(w: WaitingMember): Promise<void> {
  const { error } = await sb().rpc('restore_member', {
    p_site: w.site.id,
    p_user: w.userId,
    p_sealed_key: C.sealKey(w.site.key, C.fromB64(w.publicKey)),
  });
  fail(error, 'Could not restore access');
}

/** How many of my own memberships are waiting for a teammate to restore them. */
export async function myWaitingCount(): Promise<number> {
  const s = getSession();
  const { count } = await sb().from('site_members').select('site_id', { count: 'exact', head: true }).eq('user_id', s.userId).eq('stale', true);
  return count ?? 0;
}

// ------------------------------------------------------------------- admin

export interface TeamPerson {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  joined: string;
  sites: number;
  waiting: number;
  vaultResetAt: string | null;
}

export async function teamOverview(): Promise<TeamPerson[]> {
  const { data, error } = await sb().rpc('team_overview');
  fail(error, 'Could not load the team');
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, email: r.email, displayName: r.display_name, isAdmin: r.is_admin, joined: r.joined,
    sites: r.sites, waiting: r.waiting, vaultResetAt: r.vault_reset_at,
  }));
}

export async function listInvites(): Promise<{ email: string; createdAt: string }[]> {
  const { data, error } = await sb().from('invites').select('email, created_at').order('created_at', { ascending: false });
  fail(error, 'Could not load invitations');
  return (data ?? []).map((r) => ({ email: r.email, createdAt: r.created_at }));
}

export async function addInvite(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a full email address, like name@company.com.');
  const { error } = await sb().from('invites').insert({ email: clean, invited_by: getSession().userId });
  if (error?.code === '23505') throw new Error('That email is already invited.');
  fail(error, 'Could not invite');
}

export async function removeInvite(email: string): Promise<void> {
  const { error } = await sb().from('invites').delete().eq('email', email);
  fail(error, 'Could not cancel the invitation');
}

export async function setAdmin(userId: string, admin: boolean): Promise<void> {
  const { error } = admin
    ? await sb().from('app_admins').insert({ user_id: userId })
    : await sb().from('app_admins').delete().eq('user_id', userId);
  if (error && /at least one admin/i.test(error.message)) throw new Error('SiteKeep needs at least one admin. Make someone else admin first.');
  fail(error, 'Could not change admin rights');
}

/** Remove someone from every site you own (re-locks each with a new key). Returns how many. */
export async function removeFromMySites(userId: string, sites: Site[]): Promise<{ count: number; updated: Site[] }> {
  const owned = sites.filter((x) => x.role === 'owner');
  if (owned.length === 0) return { count: 0, updated: [] };
  const { data, error } = await sb().from('site_members').select('site_id').eq('user_id', userId).in('site_id', owned.map((x) => x.id));
  fail(error, 'Could not look up their sites');
  const updated: Site[] = [];
  for (const row of data ?? []) {
    const site = owned.find((x) => x.id === row.site_id)!;
    updated.push(await removeMember(site, userId));
  }
  return { count: updated.length, updated };
}
