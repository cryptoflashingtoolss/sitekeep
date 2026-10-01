import { describe, expect, it } from 'vitest';
import { remindersFor, summarize } from './notify';
import { todayISO } from './helpers';
import { normalizeSite, type Site, type Task } from './types';

const day = (offset: number) => {
  const d = new Date(todayISO() + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const site: Site = {
  id: 's1', ownerId: 'u', role: 'owner', key: new Uint8Array(32), updatedAt: '',
  data: normalizeSite({
    name: 'Harbor Dental',
    credentials: [{ id: 'c', kind: 'wp-admin', label: 'WP', url: '', username: 'admin', password: 'TopSecret!9', notes: '' }],
    renewals: [{ id: 'r1', label: 'Domain', date: day(7) }, { id: 'r2', label: 'SSL', date: day(20) }],
  }),
};
const task = (id: string, due: string, done = false): Task => ({
  id, siteId: 's1', createdBy: null, updatedAt: '',
  data: { title: `Task ${id}`, notes: '', done, due, priority: 'normal', assignee: '' },
});

describe('reminders', () => {
  it('picks overdue and due-today tasks and renewals on alert days', () => {
    const items = remindersFor([site], [task('a', day(-2)), task('b', day(0)), task('c', day(3)), task('d', day(-1), true), task('e', '')]);
    expect(items.map((i) => `${i.kind}:${i.title}`).sort()).toEqual(['overdue:Task a', 'renewal:Domain', 'today:Task b']);
  });

  it('skips renewals that are not on an alert day', () => {
    expect(remindersFor([site], []).some((i) => i.title === 'SSL')).toBe(false);
  });

  it('looks ahead for scheduled days', () => {
    const in3 = remindersFor([site], [task('c', day(3))], 3);
    expect(in3.map((i) => i.title)).toEqual(['Task c']); // domain is 4 days out then: not an alert day
    expect(remindersFor([site], [], 6).map((i) => `${i.title}:${i.days}`)).toEqual(['Domain:1', 'SSL:14']);
  });

  it('never puts passwords or usernames in a notification, and hides names when asked', () => {
    const items = remindersFor([site], [task('a', day(-2)), task('b', day(0))]);
    const detailed = summarize(items, true);
    const hidden = summarize(items, false);
    for (const text of [detailed.title + detailed.body, hidden.title + hidden.body]) {
      expect(text).not.toContain('TopSecret');
      expect(text).not.toContain('admin');
    }
    expect(detailed.body).toContain('Harbor Dental');
    expect(hidden.title + hidden.body).not.toContain('Harbor Dental');
    expect(hidden.title + hidden.body).not.toContain('Task a');
    expect(hidden.body).toContain('1 overdue');
  });
});
