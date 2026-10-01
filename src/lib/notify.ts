// Device reminders: overdue / due-today tasks and upcoming renewals.
//
// Android: reminders are scheduled with the OS for the next 14 days, so they
//          arrive even when SiteKeep is closed.
// Windows / browser: reminders are shown while the app is open (checked when
//          you unlock and every 15 minutes). Desktop can't schedule ahead.
//
// Privacy: notifications never include usernames or passwords. With
// "show details" off, they only say how many items need attention.

import {
  cancel as tauriCancel,
  isPermissionGranted,
  requestPermission as tauriRequestPermission,
  Schedule,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { daysUntil, todayISO } from './helpers';
import type { Site, Task } from './types';

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface ReminderPrefs {
  enabled: boolean;
  time: string; // HH:MM, local time for scheduled reminders
  showDetails: boolean;
  promptDismissedAt: number; // when "Not now" was pressed
}

const PREFS_KEY = 'sitekeep.reminders';
const SENT_KEY = 'sitekeep.reminders.sent';
const SCHEDULED_KEY = 'sitekeep.reminders.scheduled';
const DEFAULT_PREFS: ReminderPrefs = { enabled: false, time: '09:00', showDetails: true, promptDismissedAt: 0 };
export const RENEWAL_ALERT_DAYS = [14, 7, 3, 1, 0];

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const isMobile = () => /android|iphone|ipad/i.test(navigator.userAgent);

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: reminders still work for this session */
  }
}

export function getPrefs(): ReminderPrefs {
  return readLS(PREFS_KEY, DEFAULT_PREFS);
}
export function savePrefs(p: Partial<ReminderPrefs>): ReminderPrefs {
  const next = { ...getPrefs(), ...p };
  writeLS(PREFS_KEY, next);
  return next;
}

// ------------------------------------------------------------ permission

export async function getPermission(): Promise<NotifyPermission> {
  if (isTauri()) {
    try {
      if (await isPermissionGranted()) return 'granted';
      return readLS<{ v?: string }>('sitekeep.reminders.answer', {}).v === 'denied' ? 'denied' : 'default';
    } catch {
      return 'unsupported';
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotifyPermission;
}

/** Shows the system "Allow notifications?" dialog. */
export async function requestAccess(): Promise<NotifyPermission> {
  let result: NotifyPermission;
  if (isTauri()) {
    result = (await tauriRequestPermission()) as NotifyPermission;
    writeLS('sitekeep.reminders.answer', { v: result });
  } else if (typeof Notification !== 'undefined') {
    result = (await Notification.requestPermission()) as NotifyPermission;
  } else {
    result = 'unsupported';
  }
  if (result === 'granted') savePrefs({ enabled: true });
  return result;
}

/** Should the Today screen ask for permission? Re-asks at most every 14 days. */
export function shouldPrompt(permission: NotifyPermission): boolean {
  if (permission !== 'default') return false;
  const { promptDismissedAt } = getPrefs();
  return Date.now() - promptDismissedAt > 14 * 86400000;
}

async function show(title: string, body: string, id?: number, at?: Date) {
  if (isTauri()) {
    sendNotification({ id, title, body, ...(at ? { schedule: Schedule.at(at, false, true) } : {}) });
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body, tag: id ? String(id) : undefined });
  }
}

// ------------------------------------------------------------ what to remind

export interface ReminderItem {
  key: string; // stable id, used to avoid repeats
  kind: 'overdue' | 'today' | 'renewal';
  title: string;
  siteName: string;
  days: number;
}

/** Items that need attention on a given day (default: today). */
export function remindersFor(sites: Site[], tasks: Task[], dayOffset = 0): ReminderItem[] {
  const names = new Map(sites.map((s) => [s.id, s.data.name]));
  const out: ReminderItem[] = [];
  for (const t of tasks) {
    if (t.data.done || !t.data.due) continue;
    const d = daysUntil(t.data.due) - dayOffset;
    if (d < 0 && dayOffset === 0) out.push({ key: `t:${t.id}`, kind: 'overdue', title: t.data.title, siteName: names.get(t.siteId) ?? '', days: d });
    else if (d === 0) out.push({ key: `t:${t.id}`, kind: 'today', title: t.data.title, siteName: names.get(t.siteId) ?? '', days: 0 });
  }
  for (const s of sites) {
    for (const r of s.data.renewals) {
      if (!r.date) continue;
      const d = daysUntil(r.date) - dayOffset;
      if (RENEWAL_ALERT_DAYS.includes(d) || (d < 0 && dayOffset === 0)) {
        out.push({ key: `r:${s.id}:${r.id}:${d}`, kind: 'renewal', title: r.label || 'Renewal', siteName: s.data.name, days: d });
      }
    }
  }
  return out;
}

function line(i: ReminderItem): string {
  if (i.kind === 'renewal') {
    if (i.days < 0) return `${i.title} for ${i.siteName} was due ${-i.days === 1 ? 'yesterday' : `${-i.days} days ago`}`;
    const when = i.days === 0 ? 'today' : i.days === 1 ? 'tomorrow' : `in ${i.days} days`;
    return `${i.title} for ${i.siteName} renews ${when}`;
  }
  return `${i.title} (${i.siteName})`;
}

/** Turn a list of items into one notification's title and body. */
export function summarize(items: ReminderItem[], showDetails: boolean): { title: string; body: string } {
  const overdue = items.filter((i) => i.kind === 'overdue').length;
  const today = items.filter((i) => i.kind === 'today').length;
  const renewals = items.filter((i) => i.kind === 'renewal').length;
  const parts = [
    overdue && `${overdue} overdue`,
    today && `${today} due today`,
    renewals && `${renewals} ${renewals === 1 ? 'renewal' : 'renewals'} coming up`,
  ].filter(Boolean) as string[];
  const title = items.length === 1 && showDetails
    ? items[0].kind === 'renewal' ? 'Renewal coming up' : items[0].kind === 'overdue' ? 'Task overdue' : 'Task due today'
    : `SiteKeep: ${parts.join(', ')}`;
  if (!showDetails) return { title: 'SiteKeep reminder', body: `${parts.join(', ')}. Open SiteKeep to see them.` };
  const lines = items.slice(0, 4).map(line);
  if (items.length > 4) lines.push(`and ${items.length - 4} more`);
  return { title, body: lines.join('\n') };
}

// ------------------------------------------------------------ delivering

/** Show reminders for anything not already notified today. Call on unlock and periodically. */
export async function notifyNow(sites: Site[], tasks: Task[]): Promise<number> {
  const prefs = getPrefs();
  if (!prefs.enabled || (await getPermission()) !== 'granted') return 0;
  const today = todayISO();
  const sent = readLS<{ day: string; keys: string[] }>(SENT_KEY, { day: today, keys: [] });
  const already = new Set(sent.day === today ? sent.keys : []);
  const fresh = remindersFor(sites, tasks).filter((i) => !already.has(i.key));
  if (fresh.length === 0) return 0;
  const { title, body } = summarize(fresh, prefs.showDetails);
  await show(title, body);
  writeLS(SENT_KEY, { day: today, keys: [...already, ...fresh.map((i) => i.key)] });
  return fresh.length;
}

/**
 * Android only: schedule one reminder per day for the next 14 days at the
 * chosen time, so they arrive even when the app is closed. Replaces any
 * reminders scheduled earlier.
 */
export async function scheduleAhead(sites: Site[], tasks: Task[]): Promise<number> {
  if (!isTauri() || !isMobile()) return 0;
  const previous = readLS<{ ids: number[] }>(SCHEDULED_KEY, { ids: [] }).ids;
  if (previous.length) await tauriCancel(previous).catch(() => undefined);
  const prefs = getPrefs();
  if (!prefs.enabled || (await getPermission()) !== 'granted') {
    writeLS(SCHEDULED_KEY, { ids: [] });
    return 0;
  }
  const [hh, mm] = prefs.time.split(':').map(Number);
  const ids: number[] = [];
  for (let offset = 1; offset <= 14; offset++) {
    const items = remindersFor(sites, tasks, offset);
    if (items.length === 0) continue;
    const at = new Date(todayISO() + 'T00:00:00');
    at.setDate(at.getDate() + offset);
    at.setHours(hh || 9, mm || 0, 0, 0);
    const { title, body } = summarize(items, prefs.showDetails);
    const id = 7300 + offset;
    await show(title, body, id, at);
    ids.push(id);
  }
  writeLS(SCHEDULED_KEY, { ids });
  return ids.length;
}

/** Turn reminders off on this device and remove anything scheduled. */
export async function disableReminders(): Promise<void> {
  savePrefs({ enabled: false });
  if (isTauri() && isMobile()) {
    const ids = readLS<{ ids: number[] }>(SCHEDULED_KEY, { ids: [] }).ids;
    if (ids.length) await tauriCancel(ids).catch(() => undefined);
  }
  writeLS(SCHEDULED_KEY, { ids: [] });
}

export async function sendTest(showDetails: boolean): Promise<void> {
  await show(
    showDetails ? 'Reminders are on' : 'SiteKeep reminder',
    showDetails ? 'SiteKeep will tell you about overdue tasks and upcoming renewals.' : 'Reminders are on for this device.',
  );
}

export const canScheduleWhenClosed = () => isTauri() && isMobile();
