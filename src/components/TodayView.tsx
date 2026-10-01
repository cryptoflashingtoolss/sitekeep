import { useMemo, useState } from 'react';
import { formatDue, groupOpenTasks, siteHue, upcomingRenewals } from '../lib/helpers';
import { useStore } from './store';
import { TaskEditor, TaskList } from './Tasks';
import { Icon, KeyTag, Spinner } from './ui';
import { ReminderPrompt } from './Reminders';

export function TodayView({ onOpenSite, onAskAi, onOpenTeam, onOpenSettings }: {
  onOpenSite: (id: string) => void; onAskAi: () => void; onOpenTeam: () => void; onOpenSettings: () => void;
}) {
  const { sites, tasks, loading, me, siteById, waiting, myWaiting } = useStore();
  const waitingPeople = [...new Set(waiting.map((w) => w.displayName || w.email))];
  const [addingTask, setAddingTask] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);

  const groups = useMemo(() => {
    const scoped = onlyMine ? tasks.filter((t) => t.data.assignee.toLowerCase() === me.email.toLowerCase()) : tasks;
    return groupOpenTasks(scoped);
  }, [tasks, onlyMine, me.email]);
  const renewals = useMemo(() => upcomingRenewals(sites, 30), [sites]);
  const total = groups.overdue.length + groups.soon.length + groups.later.length;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = me.displayName.split(' ')[0];

  let summary: string;
  if (loading) summary = 'Opening your vault…';
  else if (total === 0) summary = 'Nothing is waiting on you. Every task is done.';
  else if (groups.overdue.length > 0)
    summary = `${groups.overdue.length} overdue, ${total - groups.overdue.length} more open across ${sites.length} sites.`;
  else summary = `${total} open tasks across ${sites.length} sites. Nothing overdue.`;

  return (
    <div className="page">
      <header className="today-head">
        <div>
          <p className="date-line">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="display">{greeting}{first ? `, ${first}` : ''}</h1>
          <p className="lede">{summary}</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={onAskAi}><Icon name="spark" size={16} /> Today's brief</button>
          <button className="btn btn-primary" onClick={() => setAddingTask(true)}><Icon name="plus" size={16} /> New task</button>
        </div>
      </header>

      {waitingPeople.length > 0 && (
        <div className="banner">
          <Icon name="users" size={18} />
          <span><strong>{waitingPeople.join(', ')}</strong> {waitingPeople.length === 1 ? 'reset their vault and is' : 'reset their vaults and are'} waiting for you to restore access.</span>
          <button className="btn btn-sm" onClick={onOpenTeam}>Review</button>
        </div>
      )}
      {myWaiting > 0 && (
        <div className="banner">
          <Icon name="lock" size={18} />
          <span>{myWaiting} shared {myWaiting === 1 ? 'site is' : 'sites are'} waiting for a teammate to restore your access. Ask the site's owner or an editor to open SiteKeep.</span>
        </div>
      )}
      {!loading && !me.hasRecoveryKey && (
        <div className="banner">
          <Icon name="key" size={18} />
          <span>You don't have a recovery key yet. Without one, a forgotten password means starting over.</span>
          <button className="btn btn-sm" onClick={onOpenSettings}>Create one</button>
        </div>
      )}
      {!loading && <ReminderPrompt sites={sites} tasks={tasks} />}

      <div className="today-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Unfinished tasks</h2>
            <label className="switch">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              <span>Assigned to me</span>
            </label>
          </div>
          {loading ? <div className="loading-row"><Spinner /></div> : total === 0 ? (
            <div className="empty-state">
              <p>{onlyMine ? 'Nothing is assigned to you.' : 'You\'re all caught up.'}</p>
              <button className="btn btn-sm" onClick={() => setAddingTask(true)}><Icon name="plus" size={14} /> Add a task</button>
            </div>
          ) : (
            <>
              {groups.overdue.length > 0 && (
                <div className="task-group overdue-group">
                  <h3>Overdue</h3>
                  <TaskList tasks={groups.overdue} showSite onOpenSite={onOpenSite} emptyText="" />
                </div>
              )}
              {groups.soon.length > 0 && (
                <div className="task-group">
                  <h3>Next 7 days</h3>
                  <TaskList tasks={groups.soon} showSite onOpenSite={onOpenSite} emptyText="" />
                </div>
              )}
              {groups.later.length > 0 && (
                <div className="task-group">
                  <h3>Later</h3>
                  <TaskList tasks={groups.later} showSite onOpenSite={onOpenSite} emptyText="" />
                </div>
              )}
            </>
          )}
        </section>

        <section className="panel panel-renewals">
          <div className="panel-head"><h2>Renewing soon</h2></div>
          {renewals.length === 0 ? (
            <p className="quiet-text">Nothing renews in the next 30 days.</p>
          ) : (
            <ol className="timeline">
              {renewals.map((r) => {
                const site = siteById(r.siteId);
                return (
                  <li key={r.siteId + r.label + r.date} className={r.days < 0 ? 'late' : r.days <= 7 ? 'near' : ''}>
                    <span className="tl-when">{formatDue(r.date)}</span>
                    <button className="tl-what" onClick={() => onOpenSite(r.siteId)}>
                      <KeyTag hue={siteHue(site?.data.name ?? r.siteName)} size="dot" />
                      <span><strong>{r.label || 'Renewal'}</strong> for {r.siteName}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {addingTask && <TaskEditor onClose={() => setAddingTask(false)} />}
    </div>
  );
}
