import { useEffect, useState, type FormEvent } from 'react';
import { kindLabel, newId, type Credential, type Member, type Role, type Site } from '../lib/types';
import * as V from '../lib/vault';
import { suggestChecklistItems } from '../lib/ai';
import { copyText } from '../lib/clipboard';
import { daysUntil, formatDue, siteHue, sortOpenTasks } from '../lib/helpers';
import { canEdit, useStore } from './store';
import { SiteForm } from './SiteForm';
import { TaskEditor, TaskList } from './Tasks';
import { ConfirmButton, Icon, KeyTag, Spinner, toast, toastError } from './ui';

export function SiteView({ siteId, onBack }: { siteId: string; onBack: () => void }) {
  const store = useStore();
  const site = store.siteById(siteId);
  const [editing, setEditing] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [showDone, setShowDone] = useState(false);

  if (!site) {
    return (
      <div className="page">
        <button className="back-link" onClick={onBack}><Icon name="back" size={18} /> All sites</button>
        <p className="quiet-text">This site is no longer on your key ring.</p>
      </div>
    );
  }

  const editable = canEdit(site);
  const siteTasks = store.tasks.filter((t) => t.siteId === site.id);
  const open = sortOpenTasks(siteTasks);
  const done = siteTasks.filter((t) => t.data.done);
  const hue = siteHue(site.data.name);
  const facts = [
    site.data.hostProvider && { k: 'Hosting', v: site.data.hostProvider },
    site.data.registrar && { k: 'Domain', v: site.data.registrar },
    site.role !== 'owner' && { k: 'Access', v: site.role === 'editor' ? 'Shared with you, can edit' : 'Shared with you, view only' },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <div className="page">
      <button className="back-link" onClick={onBack}><Icon name="back" size={18} /> All sites</button>

      <header className="site-hero" style={{ ['--h' as string]: hue }}>
        <KeyTag hue={hue} size="lg" />
        <div className="site-hero-text">
          <h1 className="display">{site.data.name}</h1>
          {site.data.url && <p className="site-url">{site.data.url.replace(/^https?:\/\//, '')}</p>}
          {facts.length > 0 && (
            <dl className="facts">
              {facts.map((f) => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
            </dl>
          )}
          {site.data.tags.length > 0 && <div className="tags">{site.data.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>}
        </div>
        {editable && <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit site</button>}
      </header>

      <div className="site-cols">
        <div className="col">
          <section className="panel">
            <div className="panel-head">
              <h2>Tasks {open.length > 0 && <span className="count">{open.length}</span>}</h2>
              {editable && <button className="btn btn-sm btn-primary" onClick={() => setAddingTask(true)}><Icon name="plus" size={14} /> New task</button>}
            </div>
            <TaskList tasks={open} emptyText="Nothing pending on this site." />
            {done.length > 0 && (
              <>
                <button className="link-btn" onClick={() => setShowDone(!showDone)}>
                  {showDone ? 'Hide' : 'Show'} {done.length} finished
                </button>
                {showDone && <TaskList tasks={done} emptyText="" />}
              </>
            )}
          </section>
          <ChecklistPanel site={site} />
        </div>

        <div className="col">
          <section className="panel">
            <div className="panel-head">
              <h2>Logins & keys {site.data.credentials.length > 0 && <span className="count">{site.data.credentials.length}</span>}</h2>
              {editable && <button className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="plus" size={14} /> Add</button>}
            </div>
            {site.data.credentials.length === 0 ? (
              <p className="quiet-text">No logins saved yet.{editable && ' Add the wp-admin, hosting and Search Console logins first.'}</p>
            ) : (
              <ul className="cred-list">{site.data.credentials.map((c) => <CredentialRow key={c.id} cred={c} />)}</ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Renewals</h2></div>
            {site.data.renewals.length === 0 ? <p className="quiet-text">No renewal dates saved.</p> : (
              <ol className="timeline compact">
                {[...site.data.renewals].sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
                  const d = r.date ? daysUntil(r.date) : 999;
                  return (
                    <li key={r.id} className={d < 0 ? 'late' : d <= 14 ? 'near' : ''}>
                      <span className="tl-when">{r.date ? formatDue(r.date) : 'No date'}</span>
                      <span className="tl-what"><strong>{r.label || 'Renewal'}</strong></span>
                    </li>
                  );
                })}
              </ol>
            )}
            {site.data.notes && <p className="site-notes">{site.data.notes}</p>}
          </section>

          <TeamPanel site={site} onLeft={onBack} />
        </div>
      </div>

      {site.role === 'owner' && (
        <div className="danger-zone">
          <ConfirmButton onConfirm={async () => {
            try { await store.removeSite(site); toast('Site deleted'); onBack(); } catch (e) { toastError(e); }
          }}>
            <Icon name="trash" size={16} /> Delete site for everyone
          </ConfirmButton>
        </div>
      )}

      {editing && (
        <SiteForm title="Edit site" initial={site.data} onClose={() => setEditing(false)}
          onSave={async (data) => { await store.saveSite(site, data); toast('Site saved'); }} />
      )}
      {addingTask && <TaskEditor site={site} onClose={() => setAddingTask(false)} />}
    </div>
  );
}

function CredentialRow({ cred }: { cred: Credential }) {
  const { settings } = useStore();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 20000); // hide again automatically
    return () => clearTimeout(t);
  }, [show]);

  const copy = async (value: string, what: string, secret: boolean) => {
    try {
      await copyText(value, secret ? settings.clipboardClearSeconds : undefined);
      toast(secret ? `${what} copied. Clipboard clears in ${settings.clipboardClearSeconds}s` : `${what} copied`);
    } catch (e) {
      toastError(e);
    }
  };
  const kind = kindLabel(cred.kind);
  const secretName = cred.kind === 'api' ? 'Key' : 'Password';

  return (
    <li className="cred">
      <div className="cred-head">
        <span className="cred-name">{cred.label || kind}</span>
        {cred.label && cred.label !== kind && <span className="cred-kind">{kind}</span>}
      </div>
      {cred.url && (
        <div className="cred-field">
          <span className="cred-k">Address</span>
          <span className="cred-v truncate">{cred.url.replace(/^https?:\/\//, '')}</span>
          <button className="icon-btn" onClick={() => copy(cred.url, 'Address', false)} aria-label="Copy address"><Icon name="copy" size={16} /></button>
        </div>
      )}
      {cred.username && (
        <div className="cred-field">
          <span className="cred-k">User</span>
          <span className="cred-v truncate">{cred.username}</span>
          <button className="icon-btn" onClick={() => copy(cred.username, 'Username', false)} aria-label="Copy username"><Icon name="copy" size={16} /></button>
        </div>
      )}
      {cred.password && (
        <div className="cred-field">
          <span className="cred-k">{secretName}</span>
          <span className={`cred-v secret truncate ${show ? 'shown' : ''}`}>{show ? cred.password : '•••••••••••••'}</span>
          <button className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? `Hide ${secretName}` : `Show ${secretName}`}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
          </button>
          <button className="icon-btn" onClick={() => copy(cred.password, secretName, true)} aria-label={`Copy ${secretName}`}><Icon name="copy" size={16} /></button>
        </div>
      )}
      {cred.notes && (show ? <p className="cred-notes">{cred.notes}</p> : <p className="cred-hint">Has private notes. Show the {secretName.toLowerCase()} to read them.</p>)}
    </li>
  );
}

function ChecklistPanel({ site }: { site: Site }) {
  const store = useStore();
  const editable = canEdit(site);
  const [newItem, setNewItem] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const done = site.data.checklist.filter((c) => c.done).length;
  const total = site.data.checklist.length;

  const save = async (checklist: Site['data']['checklist']) => {
    try {
      await store.saveSite(site, { ...site.data, checklist });
    } catch (e) {
      toastError(e);
    }
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const items = await suggestChecklistItems(store.settings, site);
      setSuggestions(items);
      if (items.length === 0) toast('No new suggestions. This checklist looks complete.');
    } catch (e) {
      toastError(e);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Setup checklist</h2>
        {editable && (
          <button className="btn btn-sm" onClick={suggest} disabled={suggesting}>
            {suggesting ? <Spinner /> : <Icon name="spark" size={14} />} Suggest items
          </button>
        )}
      </div>
      {total > 0 && (
        <div className="progress-line">
          <span className="meter wide"><span style={{ width: `${(done / total) * 100}%` }} /></span>
          <span className="progress-text">{done} of {total} done</span>
        </div>
      )}
      <ul className="checklist">
        {site.data.checklist.map((c) => (
          <li key={c.id}>
            <label className="tick-row">
              <span className="tick">
                <input type="checkbox" checked={c.done} disabled={!editable}
                  onChange={() => save(site.data.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} />
                <span className="tick-box"><Icon name="check" size={14} /></span>
              </span>
              <span className={c.done ? 'is-done' : ''}>{c.label}</span>
            </label>
            {editable && (
              <button className="icon-btn subtle" aria-label={`Remove "${c.label}"`}
                onClick={() => save(site.data.checklist.filter((x) => x.id !== c.id))}><Icon name="x" size={14} /></button>
            )}
          </li>
        ))}
      </ul>
      {suggestions.length > 0 && (
        <div className="suggestions">
          <p>Suggested for this site. Tap to add:</p>
          <div className="suggestion-list">
            {suggestions.map((s) => (
              <button key={s} className="suggestion" onClick={() => {
                save([...site.data.checklist, { id: newId(), label: s, done: false }]);
                setSuggestions((x) => x.filter((y) => y !== s));
              }}><Icon name="plus" size={12} /> {s}</button>
            ))}
          </div>
        </div>
      )}
      {editable && (
        <form className="inline-add" onSubmit={(e) => {
          e.preventDefault();
          if (!newItem.trim()) return;
          save([...site.data.checklist, { id: newId(), label: newItem.trim(), done: false }]);
          setNewItem('');
        }}>
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a checklist item" />
          <button className="btn btn-sm" type="submit">Add</button>
        </form>
      )}
    </section>
  );
}

function TeamPanel({ site, onLeft }: { site: Site; onLeft: () => void }) {
  const store = useStore();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('editor');
  const [busy, setBusy] = useState(false);
  const isOwner = site.role === 'owner';

  const load = async () => {
    try {
      setMembers(await V.listMembers(site));
    } catch (e) {
      toastError(e);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await V.addMember(site, email.trim(), role);
      setEmail('');
      toast('Site shared');
      await load();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Member) => {
    setBusy(true);
    try {
      const updated = await V.removeMember(site, m.userId);
      store.replaceSite(updated);
      toast(`${m.email} removed and the site re-locked with a new key. Change any passwords they saw.`);
      await load();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const initials = (m: Member) => (m.displayName || m.email).split(/[\s@.]/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const roleName: Record<Role, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' };

  return (
    <section className="panel">
      <div className="panel-head"><h2>Who has access</h2></div>
      {!members && <div className="loading-row"><Spinner /></div>}
      <ul className="members">
        {members?.map((m) => (
          <li key={m.userId}>
            <span className="avatar">{initials(m)}</span>
            <span className="member-who">
              <span>{m.displayName || m.email}{m.userId === store.me.userId && <span className="you"> (you)</span>}</span>
              {m.displayName && <span className="member-mail">{m.email}</span>}
            </span>
            {m.waiting && m.userId !== store.me.userId && site.role !== 'viewer' ? (
              <span className="member-actions">
                <span className="role-badge warn">Reset vault</span>
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const w = store.waiting.find((x) => x.userId === m.userId && x.site.id === site.id);
                    if (!w) throw new Error('Refresh and try again.');
                    await V.restoreAccess(w);
                    await store.refreshWaiting();
                    await load();
                    toast(`${m.displayName || m.email} has access again`);
                  } catch (err) { toastError(err); } finally { setBusy(false); }
                }}>Restore access</button>
              </span>
            ) : isOwner && m.role !== 'owner' ? (
              <span className="member-actions">
                <select value={m.role} disabled={busy} aria-label={`Access for ${m.email}`} onChange={async (e) => {
                  try { await V.changeMemberRole(site, m.userId, e.target.value as 'editor' | 'viewer'); await load(); } catch (err) { toastError(err); }
                }}>
                  <option value="editor">Can edit</option>
                  <option value="viewer">View only</option>
                </select>
                <ConfirmButton className="icon-btn danger" onConfirm={() => remove(m)}><Icon name="trash" size={16} /></ConfirmButton>
              </span>
            ) : (
              <span className="role-badge">{roleName[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form className="share-form" onSubmit={add}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Teammate's email" aria-label="Teammate's email" />
          <select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="viewer">View only</option>
          </select>
          <button className="btn btn-sm btn-primary" disabled={busy} type="submit">Share</button>
        </form>
      ) : (
        <ConfirmButton onConfirm={async () => {
          try { await V.leaveSite(site); store.dropSite(site.id); toast('You left the site'); onLeft(); } catch (e) { toastError(e); }
        }}>Leave this site</ConfirmButton>
      )}
      <p className="fine-print">Teammates need their own SiteKeep account before you can share with them.</p>
    </section>
  );
}
