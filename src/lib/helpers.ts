import { newId, type ChecklistItem, type Site, type Task } from './types';

/** Standard setup checklist every new site starts with. */
export const DEFAULT_CHECKLIST = [
  'SSL certificate active (https)',
  'Google Search Console property verified',
  'XML sitemap submitted to Search Console',
  'Google Analytics (GA4) installed',
  'Bing Webmaster Tools verified',
  'robots.txt reviewed',
  'Automatic backups configured',
  'Uptime monitoring set up',
  'Two-factor login on admin & hosting',
  'CMS, plugins and theme up to date',
  'Core Web Vitals checked',
  'Structured data (schema) added',
];

export function defaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST.map((label) => ({ id: newId(), label, done: false }));
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function daysUntil(dateISO: string): number {
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(dateISO + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function formatDue(dateISO: string): string {
  if (!dateISO) return '';
  const d = daysUntil(dateISO);
  if (d < -1) return `${-d} days overdue`;
  if (d === -1) return 'yesterday';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 14) return `in ${d} days`;
  return new Date(dateISO + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface Reminder {
  siteId: string;
  siteName: string;
  label: string;
  date: string;
  days: number;
}

/** Renewals due within `windowDays` (or already past). */
export function upcomingRenewals(sites: Site[], windowDays = 30): Reminder[] {
  const out: Reminder[] = [];
  for (const s of sites) {
    for (const r of s.data.renewals) {
      if (!r.date) continue;
      const days = daysUntil(r.date);
      if (days <= windowDays) out.push({ siteId: s.id, siteName: s.data.name, label: r.label, date: r.date, days });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

/** Unfinished tasks: overdue first, then by priority, then by due date. */
export function sortOpenTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.data.done)
    .sort((a, b) => {
      const ao = a.data.due && daysUntil(a.data.due) < 0 ? 0 : 1;
      const bo = b.data.due && daysUntil(b.data.due) < 0 ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const pr = PRIORITY_RANK[a.data.priority] - PRIORITY_RANK[b.data.priority];
      if (pr !== 0) return pr;
      if (a.data.due && b.data.due) return a.data.due.localeCompare(b.data.due);
      if (a.data.due) return -1;
      if (b.data.due) return 1;
      return a.data.title.localeCompare(b.data.title);
    });
}

export function matchesSearch(site: Site, q: string): boolean {
  if (!q.trim()) return true;
  const hay = [site.data.name, site.data.url, site.data.hostProvider, site.data.registrar, ...site.data.tags]
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Stable colour for a site's key tag, derived from its name. */
export function siteHue(name: string): number {
  let h = 0x811c9dc5;
  for (const c of name.toLowerCase()) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((Math.floor(h / 7) % 360) * 37) % 360;
}

export interface TaskGroups {
  overdue: Task[];
  soon: Task[]; // due within 7 days
  later: Task[]; // due later or no date
}

export function groupOpenTasks(tasks: Task[]): TaskGroups {
  const g: TaskGroups = { overdue: [], soon: [], later: [] };
  for (const t of sortOpenTasks(tasks)) {
    if (!t.data.due) g.later.push(t);
    else {
      const d = daysUntil(t.data.due);
      if (d < 0) g.overdue.push(t);
      else if (d <= 7) g.soon.push(t);
      else g.later.push(t);
    }
  }
  return g;
}
