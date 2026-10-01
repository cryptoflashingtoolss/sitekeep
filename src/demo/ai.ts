// Demo AI: answers from the sample data without calling Blackbox.
import { daysUntil, formatDue, upcomingRenewals } from '../lib/helpers';
import { kindLabel, type Settings, type Site, type Task } from '../lib/types';

export function isTauri(): boolean {
  return false;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function buildSafeContext(sites: Site[], _tasks: Task[]) {
  return { sites: sites.map((s) => ({ name: s.data.name, accounts: s.data.credentials.map((c) => kindLabel(c.kind)) })) };
}

export async function askAboutSites(_s: Settings, question: string, sites: Site[], tasks: Task[]): Promise<string> {
  await wait(900);
  const q = question.toLowerCase();
  const hostMatch = sites.map((s) => s.data.hostProvider).find((h) => h && q.includes(h.toLowerCase()));
  if (hostMatch) {
    const list = sites.filter((s) => s.data.hostProvider === hostMatch);
    return `${list.length} sites are on ${hostMatch}:\n${list.map((s) => `• ${s.data.name} (${s.data.url})`).join('\n')}`;
  }
  if (q.includes('search console') || q.includes('gsc')) {
    const missing = sites.filter((s) => s.data.checklist.some((c) => /search console/i.test(c.label) && !c.done));
    return missing.length
      ? `These sites still have Search Console setup unticked:\n${missing.map((s) => `• ${s.data.name}`).join('\n')}`
      : 'Every site has Search Console ticked off.';
  }
  if (q.includes('renew')) {
    const r = upcomingRenewals(sites, 60);
    return r.length ? `Renewing in the next 60 days:\n${r.map((x) => `• ${x.siteName}: ${x.label}, ${formatDue(x.date)}`).join('\n')}` : 'Nothing renews in the next 60 days.';
  }
  const counts = sites
    .map((s) => ({ s, n: tasks.filter((t) => t.siteId === s.id && !t.data.done).length }))
    .sort((a, b) => b.n - a.n)
    .filter((x) => x.n > 0);
  return `Open tasks by site:\n${counts.map((x) => `• ${x.s.data.name}: ${x.n}`).join('\n')}\n\n(Demo mode: in the real app this question goes to your Blackbox model.)`;
}

export async function dailyBrief(_s: Settings, sites: Site[], tasks: Task[]): Promise<string> {
  await wait(1100);
  const name = (id: string) => sites.find((s) => s.id === id)?.data.name ?? '';
  const open = tasks.filter((t) => !t.data.done);
  const overdue = open.filter((t) => t.data.due && daysUntil(t.data.due) < 0);
  const week = open.filter((t) => t.data.due && daysUntil(t.data.due) >= 0 && daysUntil(t.data.due) <= 7);
  const renewals = upcomingRenewals(sites, 14);
  const gaps = sites
    .map((s) => ({ s, missing: s.data.checklist.filter((c) => !c.done).length }))
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 3);
  return [
    'Urgent',
    ...overdue.map((t) => `• ${t.data.title} (${name(t.siteId)}, ${formatDue(t.data.due)})`),
    ...renewals.map((r) => `• ${r.siteName}: ${r.label} renews ${formatDue(r.date)}`),
    '',
    'This week',
    ...week.map((t) => `• ${t.data.title} (${name(t.siteId)})`),
    '',
    'Setup gaps',
    ...gaps.map((g) => `• ${g.s.data.name}: ${g.missing} checklist items open`),
  ].join('\n');
}

export async function suggestChecklistItems(_s: Settings, site: Site): Promise<string[]> {
  await wait(900);
  const ideas = [
    ...(site.data.tags.includes('woocommerce') ? ['Product schema on product pages', 'Abandoned cart emails tested', 'Checkout tested on mobile'] : []),
    ...(site.data.tags.includes('local-seo') ? ['Google Business Profile verified', 'NAP consistent across directories', 'LocalBusiness schema added'] : []),
    'Redirect old URLs after redesigns',
    'Broken link check scheduled monthly',
    'Privacy policy and cookie notice up to date',
  ];
  const have = new Set(site.data.checklist.map((c) => c.label.toLowerCase()));
  return ideas.filter((i) => !have.has(i.toLowerCase())).slice(0, 6);
}

export async function testConnection(_s: Settings): Promise<string> {
  await wait(500);
  return 'SiteKeep connected (demo)';
}
