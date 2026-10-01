// Blackbox AI integration (OpenAI-compatible /chat/completions).
//
// PRIVACY RULE: the AI never receives passwords, usernames, credential URLs
// or free-text notes (people paste secrets into notes). It only gets the
// "shape" of your sites: names, domains, tags, providers, renewal dates,
// checklist status and task titles. See buildSafeContext().

import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { kindLabel, type Settings, type Site, type Task } from './types';
import { daysUntil, todayISO } from './helpers';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function chat(settings: Settings, messages: ChatMessage[], temperature = 0.3): Promise<string> {
  if (!settings.aiApiKey) throw new Error('Add your Blackbox API key in Settings first.');
  const base = settings.aiBaseUrl.trim().replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  // Inside the app we use Tauri's HTTP client, which isn't subject to browser CORS.
  const doFetch: typeof fetch = isTauri() ? (tauriFetch as unknown as typeof fetch) : fetch.bind(window);
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.aiApiKey}` },
    body: JSON.stringify({ model: settings.aiModel, messages, temperature }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}). ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('The AI returned an empty answer.');
  return content.trim();
}

/** Everything the AI is allowed to see. No secrets. */
export function buildSafeContext(sites: Site[], tasks: Task[]) {
  return {
    today: todayISO(),
    sites: sites.map((s) => ({
      name: s.data.name,
      url: s.data.url,
      tags: s.data.tags,
      host: s.data.hostProvider || undefined,
      registrar: s.data.registrar || undefined,
      myRole: s.role,
      accountsStored: [...new Set(s.data.credentials.map((c) => kindLabel(c.kind)))],
      renewals: s.data.renewals.map((r) => ({ what: r.label, date: r.date, daysLeft: r.date ? daysUntil(r.date) : null })),
      checklist: {
        done: s.data.checklist.filter((c) => c.done).map((c) => c.label),
        missing: s.data.checklist.filter((c) => !c.done).map((c) => c.label),
      },
      openTasks: tasks
        .filter((t) => t.siteId === s.id && !t.data.done)
        .map((t) => ({
          title: t.data.title,
          priority: t.data.priority,
          due: t.data.due || undefined,
          assignee: t.data.assignee || undefined,
        })),
    })),
  };
}

const SYSTEM = `You are the assistant inside SiteKeep, a private app a web developer and SEO specialist uses to manage client websites.
You receive a JSON summary of their sites (no passwords are ever included). Be concise, practical and specific.
Refer to sites by name. Use short bullet points when listing things. If the data doesn't contain the answer, say so plainly.`;

export async function askAboutSites(settings: Settings, question: string, sites: Site[], tasks: Task[]): Promise<string> {
  return chat(settings, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `My sites:\n${JSON.stringify(buildSafeContext(sites, tasks))}\n\nQuestion: ${question}` },
  ]);
}

export async function dailyBrief(settings: Settings, sites: Site[], tasks: Task[]): Promise<string> {
  return chat(settings, [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        `My sites:\n${JSON.stringify(buildSafeContext(sites, tasks))}\n\n` +
        'Give me a short brief for today in three parts: 1) Urgent (overdue tasks, renewals within 14 days), ' +
        '2) This week (what to focus on, max 5 items), 3) Setup gaps worth fixing (most important missing checklist items across sites, max 5). ' +
        'Skip any part that has nothing in it.',
    },
  ]);
}

/** Ask the AI which setup items are missing for one site. Returns plain labels. */
export async function suggestChecklistItems(settings: Settings, site: Site): Promise<string[]> {
  const ctx = buildSafeContext([site], []).sites[0];
  const answer = await chat(
    settings,
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content:
          `Site:\n${JSON.stringify(ctx)}\n\n` +
          'Suggest up to 8 additional setup or SEO checklist items this site should have that are NOT already in its checklist ' +
          '(done or missing). Tailor them to its tags and type. Reply with ONLY a JSON array of short strings, no other text.',
      },
    ],
    0.4,
  );
  const match = answer.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('The AI reply was not in the expected format. Try again.');
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error('The AI reply was not a list.');
  const existing = new Set(site.data.checklist.map((c) => c.label.toLowerCase()));
  return parsed
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 120))
    .filter((x) => !existing.has(x.toLowerCase()))
    .slice(0, 8);
}

export async function testConnection(settings: Settings): Promise<string> {
  return chat(settings, [{ role: 'user', content: 'Reply with exactly: SiteKeep connected' }], 0);
}
