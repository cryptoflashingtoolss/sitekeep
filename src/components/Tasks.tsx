import { useState, type FormEvent } from 'react';
import { emptyTask, type Priority, type Site, type Task, type TaskData } from '../lib/types';
import { daysUntil, formatDue, siteHue } from '../lib/helpers';
import { canEdit, useStore } from './store';
import { ConfirmButton, Field, Icon, KeyTag, Modal, toastError } from './ui';

export function TaskList({ tasks, showSite, onOpenSite, emptyText }: {
  tasks: Task[];
  showSite?: boolean;
  onOpenSite?: (siteId: string) => void;
  emptyText: string;
}) {
  const { siteById, saveTask } = useStore();
  const [editing, setEditing] = useState<Task | null>(null);

  if (tasks.length === 0) return <p className="empty">{emptyText}</p>;

  const toggle = async (t: Task) => {
    try {
      await saveTask(t, { ...t.data, done: !t.data.done });
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <>
      <ul className="task-list">
        {tasks.map((t) => {
          const site = siteById(t.siteId);
          const editable = site ? canEdit(site) : false;
          const overdue = !t.data.done && t.data.due && daysUntil(t.data.due) < 0;
          return (
            <li key={t.id} className={`task ${t.data.done ? 'done' : ''}`}>
              <label className="tick">
                <input type="checkbox" checked={t.data.done} disabled={!editable} onChange={() => toggle(t)}
                  aria-label={`Mark "${t.data.title}" ${t.data.done ? 'not done' : 'done'}`} />
                <span className="tick-box"><Icon name="check" size={14} /></span>
              </label>
              <button className="task-main" onClick={() => editable && setEditing(t)} disabled={!editable}>
                <span className="task-title">{t.data.title}</span>
                <span className="task-meta">
                  {t.data.priority === 'high' && <span className="prio-high">High priority</span>}
                  {t.data.due && <span className={overdue ? 'overdue' : ''}>Due {formatDue(t.data.due)}</span>}
                  {t.data.assignee && <span>For {t.data.assignee.split('@')[0]}</span>}
                </span>
              </button>
              {showSite && site && (
                <button className="site-chip" onClick={() => onOpenSite?.(site.id)}>
                  <KeyTag hue={siteHue(site.data.name)} size="dot" />
                  <span className="truncate">{site.data.name}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editing && siteById(editing.siteId) && (
        <TaskEditor site={siteById(editing.siteId)!} task={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

/** Add or edit a task. If `site` is omitted, the user picks one. */
export function TaskEditor({ site, task, onClose }: { site?: Site; task?: Task; onClose: () => void }) {
  const { sites, addTask, saveTask, removeTask } = useStore();
  const editableSites = sites.filter(canEdit);
  const [siteId, setSiteId] = useState(site?.id ?? editableSites[0]?.id ?? '');
  const [d, setD] = useState<TaskData>(task?.data ?? emptyTask());
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskData>(k: K, v: TaskData[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!d.title.trim()) return;
    const target = sites.find((s) => s.id === siteId);
    if (!target) return toastError('Pick a site first.');
    setBusy(true);
    try {
      const clean = { ...d, title: d.title.trim(), assignee: d.assignee.trim() };
      if (task) await saveTask(task, clean);
      else await addTask(target, clean);
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!site && editableSites.length === 0) {
    return (
      <Modal title="New task" onClose={onClose}>
        <p>Add a site first. Tasks always belong to a site.</p>
      </Modal>
    );
  }

  return (
    <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {!site && !task && (
          <Field label="Site">
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {editableSites.map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="What needs doing?">
          <input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Fix 404s from old blog URLs" autoFocus required />
        </Field>
        <div className="row">
          <Field label="Due date">
            <input type="date" value={d.due} onChange={(e) => set('due', e.target.value)} />
          </Field>
          <Field label="Priority">
            <select value={d.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </Field>
        </div>
        <Field label="Assigned to (email, optional)">
          <input type="email" value={d.assignee} onChange={(e) => set('assignee', e.target.value)} placeholder="teammate@example.com" />
        </Field>
        <Field label="Notes">
          <textarea rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="modal-actions">
          {task && (
            <ConfirmButton onConfirm={async () => {
              try { await removeTask(task); onClose(); } catch (e) { toastError(e); }
            }}>
              <Icon name="trash" size={16} /> Delete
            </ConfirmButton>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{task ? 'Save' : 'Add task'}</button>
        </div>
      </form>
    </Modal>
  );
}
