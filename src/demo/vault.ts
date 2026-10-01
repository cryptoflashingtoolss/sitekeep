// Demo backend: same API as lib/vault.ts, but everything lives in memory with
// sample data. Used only by `npm run demo` / the online preview. Nothing is saved.

import { defaultChecklist, todayISO } from '../lib/helpers';
import { newRecoveryCode } from '../lib/crypto';
import {
  DEFAULT_SETTINGS,
  newId,
  normalizeSite,
  type Credential,
  type Member,
  type Role,
  type Settings,
  type Site,
  type SiteData,
  type Task,
  type TaskData,
} from '../lib/types';

export const MIN_PASSWORD_LENGTH = 12;
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const KEY = new Uint8Array(32);

function day(offset: number): string {
  const d = new Date(todayISO() + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const ME = { userId: 'me', email: 'alex@studio.dev', displayName: 'Alex Morgan' };
const TEAM: Record<string, { email: string; displayName: string }> = {
  me: { email: ME.email, displayName: ME.displayName },
  u2: { email: 'priya@studio.dev', displayName: 'Priya Nair' },
  u3: { email: 'sam@studio.dev', displayName: 'Sam Okafor' },
};

let session: { userId: string; email: string; displayName: string; settings: Settings; isAdmin: boolean; hasRecoveryKey: boolean } | null = null;

function cred(kind: Credential['kind'], label: string, url: string, username: string, password: string, notes = ''): Credential {
  return { id: newId(), kind, label, url, username, password, notes };
}

function checklist(doneCount: number) {
  return defaultChecklist().map((c, i) => ({ ...c, done: i < doneCount }));
}

function seedSites(): Site[] {
  const make = (data: Partial<SiteData>, role: Role = 'owner'): Site => ({
    id: newId(),
    ownerId: role === 'owner' ? 'me' : 'u2',
    role,
    key: KEY,
    data: normalizeSite(data),
    updatedAt: new Date().toISOString(),
  });
  return [
    make({
      name: 'Harbor Dental Clinic',
      url: 'https://harbordental.com',
      tags: ['client', 'wordpress', 'local-seo'],
      hostProvider: 'Hostinger',
      registrar: 'Namecheap',
      notes: 'Monthly SEO retainer. Report due on the 5th.',
      credentials: [
        cred('wp-admin', 'WordPress admin', 'https://harbordental.com/wp-admin', 'harbor_admin', 'Qm7#vT2pL9!xRw4z'),
        cred('hosting', 'Hostinger', 'https://hpanel.hostinger.com', 'it@harbordental.com', 'Hs8$kP3nB6@wQ1eY'),
        cred('gsc', 'Search Console', 'https://search.google.com/search-console', 'seo@studio.dev', 'shared via Google account'),
        cred('domain', 'Namecheap', 'https://namecheap.com', 'harbordental', 'Nc4^tY7mR2&vK8pL', '2FA backup: kept in the safe'),
      ],
      renewals: [
        { id: newId(), label: 'Domain', date: day(9) },
        { id: newId(), label: 'Hosting', date: day(120) },
      ],
      checklist: checklist(8),
    }),
    make({
      name: 'Copperline Outdoor Gear',
      url: 'https://copperline.store',
      tags: ['client', 'woocommerce'],
      hostProvider: 'SiteGround',
      registrar: 'GoDaddy',
      credentials: [
        cred('wp-admin', 'WooCommerce admin', 'https://copperline.store/wp-admin', 'cl_shopadmin', 'Wc5!rT8yU2#iO6pA'),
        cred('cpanel', 'SiteGround', 'https://tools.siteground.com', 'copperline', 'Sg3@dF6gH9$jK2lZ'),
        cred('analytics', 'GA4', 'https://analytics.google.com', 'seo@studio.dev', 'shared via Google account'),
        cred('api', 'Stripe restricted key', '', '', 'rk_live_demo_51NzXa9bQ7cD2eF'),
      ],
      renewals: [{ id: newId(), label: 'SSL', date: day(3) }],
      checklist: checklist(5),
    }),
    make({
      name: 'Studio portfolio',
      url: 'https://studio.dev',
      tags: ['internal', 'nextjs'],
      hostProvider: 'Vercel',
      registrar: 'Cloudflare',
      credentials: [
        cred('hosting', 'Vercel', 'https://vercel.com', ME.email, 'Vc7&bN4mQ1*wE8rT'),
        cred('domain', 'Cloudflare', 'https://dash.cloudflare.com', ME.email, 'Cf2%xC5vB8^nM3qW'),
      ],
      renewals: [{ id: newId(), label: 'Domain', date: day(26) }],
      checklist: checklist(11),
    }),
    make(
      {
        name: 'Meridian Law Partners',
        url: 'https://meridianlaw.co',
        tags: ['client', 'wordpress'],
        hostProvider: 'Hostinger',
        registrar: 'Namecheap',
        credentials: [
          cred('wp-admin', 'WordPress admin', 'https://meridianlaw.co/wp-admin', 'meridian_web', 'Ml9*kJ2hG5!fD8sA'),
          cred('ftp', 'SFTP', 'sftp://meridianlaw.co', 'u81234567', 'Ft6#yU3iO9@pL2kJ'),
        ],
        checklist: checklist(3),
      },
      'editor',
    ),
    make({
      name: 'Bloom & Basil Café',
      url: 'https://bloomandbasil.cafe',
      tags: ['client', 'local-seo'],
      hostProvider: 'Hostinger',
      credentials: [cred('wp-admin', 'WordPress admin', 'https://bloomandbasil.cafe/wp-admin', 'bloom', 'Bb4$nM7bV1#cX5zQ')],
      renewals: [{ id: newId(), label: 'Hosting', date: day(-2) }],
      checklist: checklist(6),
    }),
    make(
      {
        name: 'Northgate Logistics',
        url: 'https://northgate-logistics.com',
        tags: ['client', 'laravel'],
        hostProvider: 'DigitalOcean',
        credentials: [
          cred('hosting', 'DigitalOcean', 'https://cloud.digitalocean.com', 'ops@northgate-logistics.com', 'Do8^gT2fR6&yH4jK'),
          cred('database', 'MySQL (production)', 'db.northgate-logistics.com:3306', 'ng_app', 'Db1@wQ9eR3$tY7uI'),
        ],
        checklist: checklist(7),
      },
      'viewer',
    ),
  ];
}

let sites: Site[] = [];
let tasks: Task[] = [];
const members = new Map<string, { userId: string; role: Role; stale?: boolean }[]>();

function seedTasks(): Task[] {
  const by = (name: string) => sites.find((s) => s.data.name === name)!.id;
  const t = (site: string, data: Partial<TaskData>): Task => ({
    id: newId(),
    siteId: by(site),
    createdBy: 'me',
    updatedAt: new Date().toISOString(),
    data: { title: '', notes: '', done: false, due: '', priority: 'normal', assignee: '', ...data },
  });
  return [
    t('Bloom & Basil Café', { title: 'Renew hosting plan before the site goes down', due: day(-1), priority: 'high' }),
    t('Copperline Outdoor Gear', { title: 'Fix 404s from the old /shop/ URLs', due: day(-3), priority: 'high', assignee: 'priya@studio.dev' }),
    t('Harbor Dental Clinic', { title: 'Send September SEO report', due: day(2), assignee: ME.email }),
    t('Copperline Outdoor Gear', { title: 'Add product schema to category pages', due: day(5) }),
    t('Meridian Law Partners', { title: 'Submit sitemap to Search Console', due: day(4), priority: 'high' }),
    t('Harbor Dental Clinic', { title: 'Update Google Business Profile photos', due: day(14), priority: 'low' }),
    t('Studio portfolio', { title: 'Write case study for Copperline', priority: 'low', assignee: ME.email }),
    t('Northgate Logistics', { title: 'Check Core Web Vitals after the Laravel upgrade', due: day(10) }),
    t('Harbor Dental Clinic', { title: 'Compress hero images', done: true }),
  ];
}

function seed() {
  sites = seedSites();
  tasks = seedTasks();
  members.clear();
  for (const s of sites) {
    if (s.role === 'owner') members.set(s.id, [{ userId: 'me', role: 'owner' }]);
    else members.set(s.id, [{ userId: 'u2', role: 'owner' }, { userId: 'me', role: s.role }]);
  }
  const harbor = sites[0];
  members.get(harbor.id)!.push({ userId: 'u2', role: 'editor' }, { userId: 'u3', role: 'viewer', stale: true });
}

export function getSession() {
  if (!session) throw new Error('Vault is locked');
  return session;
}
export function isUnlocked() {
  return session !== null;
}

export async function signIn(_email: string, _password: string): Promise<{ recoveryKey?: string }> {
  await wait(500);
  if (sites.length === 0) seed();
  session = { ...ME, settings: { ...DEFAULT_SETTINGS, aiApiKey: 'demo' }, isAdmin: true, hasRecoveryKey: false };
  return {};
}
export async function signUp(email: string, password: string, _name: string): Promise<{ status: 'ok' | 'confirm'; recoveryKey?: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your master password.`);
  await signIn(email, password);
  getSession().hasRecoveryKey = true;
  return { status: 'ok', recoveryKey: newRecoveryCode() };
}
export async function createRecoveryKey(): Promise<string> {
  await wait(200);
  getSession().hasRecoveryKey = true;
  return newRecoveryCode();
}
export async function sendResetCode(_email: string) {
  await wait(400);
}
export async function verifyResetCode(_email: string, code: string) {
  await wait(300);
  if (code.trim().length < 6) throw new Error('That code is wrong or has expired. Request a new one. (Demo: any 6 digits work.)');
  return { hasRecoveryKey: true };
}
export async function resetWithRecoveryKey(email: string, _code: string, newPassword: string) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your master password.`);
  await signIn(email, newPassword);
}
export async function startFreshVault(email: string, newPassword: string): Promise<string> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your master password.`);
  await signIn(email, newPassword);
  return newRecoveryCode();
}
export async function lock() {
  session = null;
}
export async function changePassword(_c: string, _n: string) {
  await wait();
}
export async function saveSettings(s: Settings) {
  await wait();
  getSession().settings = s;
}

export async function loadSites(): Promise<Site[]> {
  await wait(300);
  return [...sites].sort((a, b) => a.data.name.localeCompare(b.data.name));
}
export async function createSite(data: SiteData): Promise<Site> {
  await wait();
  const s: Site = { id: newId(), ownerId: 'me', role: 'owner', key: KEY, data, updatedAt: new Date().toISOString() };
  sites.push(s);
  members.set(s.id, [{ userId: 'me', role: 'owner' }]);
  return s;
}
export async function updateSite(site: Site, data: SiteData): Promise<Site> {
  await wait(60);
  const u = { ...site, data, updatedAt: new Date().toISOString() };
  sites = sites.map((s) => (s.id === site.id ? u : s));
  return u;
}
export async function deleteSite(site: Site) {
  await wait();
  sites = sites.filter((s) => s.id !== site.id);
  tasks = tasks.filter((t) => t.siteId !== site.id);
}

export async function loadTasks(_s: Site[]): Promise<Task[]> {
  return [...tasks];
}
export async function createTask(site: Site, data: TaskData): Promise<Task> {
  await wait(60);
  const t: Task = { id: newId(), siteId: site.id, data, createdBy: 'me', updatedAt: new Date().toISOString() };
  tasks.push(t);
  return t;
}
export async function updateTask(_site: Site, task: Task, data: TaskData): Promise<Task> {
  await wait(40);
  const t = { ...task, data };
  tasks = tasks.map((x) => (x.id === t.id ? t : x));
  return t;
}
export async function deleteTask(task: Task) {
  tasks = tasks.filter((t) => t.id !== task.id);
}

export async function listMembers(site: Site): Promise<Member[]> {
  await wait(150);
  return (members.get(site.id) ?? []).map((m) => ({ userId: m.userId, role: m.role, waiting: !!m.stale, ...(TEAM[m.userId] ?? { email: 'unknown', displayName: null }) }));
}
export async function addMember(site: Site, email: string, role: Exclude<Role, 'owner'>) {
  await wait();
  const entry = Object.entries(TEAM).find(([, p]) => p.email === email.trim().toLowerCase());
  if (!entry) throw new Error('No SiteKeep account uses that email. In the demo, try priya@studio.dev or sam@studio.dev.');
  const list = members.get(site.id) ?? [];
  if (list.some((m) => m.userId === entry[0])) throw new Error('That person already has access to this site.');
  list.push({ userId: entry[0], role });
  members.set(site.id, list);
}
export async function changeMemberRole(site: Site, userId: string, role: Exclude<Role, 'owner'>) {
  const m = members.get(site.id)?.find((x) => x.userId === userId);
  if (m) m.role = role;
}
export async function removeMember(site: Site, userId: string): Promise<Site> {
  await wait(300);
  members.set(site.id, (members.get(site.id) ?? []).filter((m) => m.userId !== userId));
  return site;
}
export async function rotateSiteKey(site: Site) {
  return site;
}
export async function leaveSite(site: Site) {
  sites = sites.filter((s) => s.id !== site.id);
}

// ------------------------------------------------- restores & admin (demo)

export interface WaitingMember { site: Site; userId: string; email: string; displayName: string | null; publicKey: string }

export async function listWaiting(all: Site[]): Promise<WaitingMember[]> {
  const out: WaitingMember[] = [];
  for (const site of all.filter((x) => x.role !== 'viewer')) {
    for (const m of members.get(site.id) ?? []) {
      if (m.stale && m.userId !== 'me') out.push({ site, userId: m.userId, publicKey: 'demo', ...TEAM[m.userId] });
    }
  }
  return out;
}
export async function restoreAccess(w: WaitingMember) {
  await wait(300);
  const m = members.get(w.site.id)?.find((x) => x.userId === w.userId);
  if (m) m.stale = false;
}
export async function myWaitingCount() {
  return 0;
}

export interface TeamPerson { id: string; email: string; displayName: string | null; isAdmin: boolean; joined: string; sites: number; waiting: number; vaultResetAt: string | null }
const admins = new Set(['me']);
let invites = [{ email: 'jordan@harbordental.com', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() }];

export async function teamOverview(): Promise<TeamPerson[]> {
  await wait(200);
  return Object.entries(TEAM).map(([id, p], i) => {
    const mine = [...members.values()].flat().filter((m) => m.userId === id);
    return {
      id, email: p.email, displayName: p.displayName, isAdmin: admins.has(id),
      joined: new Date(Date.now() - (90 - i * 20) * 86400000).toISOString(),
      sites: mine.filter((m) => !m.stale).length + (id === 'u2' ? 2 : 0),
      waiting: mine.filter((m) => m.stale).length,
      vaultResetAt: mine.some((m) => m.stale) ? new Date(Date.now() - 3 * 3600000).toISOString() : null,
    };
  });
}
export async function listInvites() {
  return [...invites];
}
export async function addInvite(email: string) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a full email address, like name@company.com.');
  if (invites.some((i) => i.email === clean)) throw new Error('That email is already invited.');
  invites = [{ email: clean, createdAt: new Date().toISOString() }, ...invites];
}
export async function removeInvite(email: string) {
  invites = invites.filter((i) => i.email !== email);
}
export async function setAdmin(userId: string, admin: boolean) {
  if (!admin && admins.size === 1 && admins.has(userId)) throw new Error('SiteKeep needs at least one admin. Make someone else admin first.');
  if (admin) admins.add(userId);
  else admins.delete(userId);
}
export async function removeFromMySites(userId: string, all: Site[]) {
  let count = 0;
  for (const site of all.filter((x) => x.role === 'owner')) {
    const list = members.get(site.id) ?? [];
    if (list.some((m) => m.userId === userId)) {
      members.set(site.id, list.filter((m) => m.userId !== userId));
      count++;
    }
  }
  return { count, updated: [] as Site[] };
}
