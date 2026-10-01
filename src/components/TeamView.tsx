import { useEffect, useState } from 'react';
import * as V from '../lib/vault';
import { getConfig } from '../lib/supabase';
import { copyText } from '../lib/clipboard';
import { useStore } from './store';
import { ConfirmButton, Icon, Spinner, toast, toastError } from './ui';

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hours ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

const initials = (name: string) => name.split(/[\s@.]/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export function TeamView() {
  const store = useStore();
  const { me, waiting } = store;
  const [people, setPeople] = useState<V.TeamPerson[] | null>(null);
  const [invites, setInvites] = useState<{ email: string; createdAt: string }[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!me.isAdmin) return;
    try {
      const [p, i] = await Promise.all([V.teamOverview(), V.listInvites()]);
      setPeople(p);
      setInvites(i);
    } catch (e) {
      toastError(e);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  // group waiting restores by person
  const byPerson = new Map<string, V.WaitingMember[]>();
  for (const w of waiting) byPerson.set(w.userId, [...(byPerson.get(w.userId) ?? []), w]);

  const inviteMessage = (to: string) => {
    const cfg = getConfig();
    return [
      `You're invited to SiteKeep, our team's app for website logins and tasks.`,
      ``,
      `1. Install SiteKeep (I'll send you the installer).`,
      `2. When it asks to connect, paste:`,
      `   Project URL: ${cfg?.url ?? '(ask me)'}`,
      `   Key: ${cfg?.anonKey ?? '(ask me)'}`,
      `3. Choose "Create your vault" and sign up with ${to}.`,
      `4. Save the recovery key it shows you somewhere safe.`,
    ].join('\n');
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="display">Team</h1>
          <p className="lede">{me.isAdmin ? 'Invite people, manage admins and help teammates who are locked out.' : 'Help teammates who reset their vault get their sites back.'}</p>
        </div>
      </header>

      <div className="team-stack">
        {byPerson.size > 0 && (
          <section className="panel attention">
            <div className="panel-head"><h2>Waiting for access</h2></div>
            <p className="fine-print top">
              These teammates forgot their password and started a fresh vault. Before you restore, check with them by phone or
              chat that it was really them. Someone who got into their email could also start a fresh vault.
            </p>
            <ul className="people">
              {[...byPerson.values()].map((list) => {
                const w = list[0];
                const name = w.displayName || w.email;
                return (
                  <li key={w.userId}>
                    <span className="avatar">{initials(name)}</span>
                    <span className="person">
                      <strong>{name}</strong>
                      <span className="person-sub">{list.map((x) => x.site.data.name).join(', ')}</span>
                    </span>
                    <button className="btn btn-sm btn-primary" disabled={busy === w.userId} onClick={() => act(w.userId, async () => {
                      for (const x of list) await V.restoreAccess(x);
                      await store.refreshWaiting();
                      await load();
                      toast(`${name} has access to ${list.length} ${list.length === 1 ? 'site' : 'sites'} again`);
                    })}>
                      {busy === w.userId ? <Spinner /> : `Restore access to ${list.length} ${list.length === 1 ? 'site' : 'sites'}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!me.isAdmin && byPerson.size === 0 && (
          <section className="panel">
            <p className="quiet-text">No one is waiting for access. Only admins can invite people and manage the team.</p>
          </section>
        )}

        {me.isAdmin && (
          <>
            <section className="panel">
              <div className="panel-head"><h2>Invite people</h2></div>
              <p className="fine-print top">Only invited emails can create a vault in your SiteKeep. Invitations are used up when the person joins.</p>
              <form className="share-form" onSubmit={(e) => {
                e.preventDefault();
                act('invite', async () => {
                  await V.addInvite(email);
                  const sent = email.trim().toLowerCase();
                  setEmail('');
                  await load();
                  await copyText(inviteMessage(sent)).catch(() => undefined);
                  toast(`${sent} invited. Setup message copied: paste it to them.`);
                });
              }}>
                <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Email to invite" />
                <button className="btn btn-primary btn-sm" disabled={busy === 'invite'} type="submit">Invite</button>
              </form>
              {invites.length > 0 && (
                <ul className="people compact">
                  {invites.map((i) => (
                    <li key={i.email}>
                      <span className="avatar ghost"><Icon name="plus" size={14} /></span>
                      <span className="person">
                        <span>{i.email}</span>
                        <span className="person-sub">Invited {ago(i.createdAt)}, hasn't joined yet</span>
                      </span>
                      <button className="btn btn-sm" onClick={() => copyText(inviteMessage(i.email)).then(() => toast('Setup message copied'), toastError)}>
                        <Icon name="copy" size={14} /> Copy setup message
                      </button>
                      <ConfirmButton className="icon-btn danger" onConfirm={() => act(i.email, async () => { await V.removeInvite(i.email); await load(); })}>
                        <Icon name="x" size={16} />
                      </ConfirmButton>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>People {people && <span className="count">{people.length}</span>}</h2></div>
              {!people && <div className="loading-row"><Spinner /></div>}
              <ul className="people">
                {people?.map((p) => {
                  const name = p.displayName || p.email;
                  const isMe = p.id === me.userId;
                  return (
                    <li key={p.id}>
                      <span className="avatar">{initials(name)}</span>
                      <span className="person">
                        <span className="person-name">
                          <strong>{name}</strong>
                          {isMe && <span className="you"> (you)</span>}
                          {p.isAdmin && <span className="role-badge admin">Admin</span>}
                          {p.waiting > 0 && <span className="role-badge warn">Reset vault {p.vaultResetAt ? ago(p.vaultResetAt) : ''}</span>}
                        </span>
                        <span className="person-sub">
                          {p.displayName && `${p.email}. `}{p.sites} {p.sites === 1 ? 'site' : 'sites'}{p.waiting > 0 && `, ${p.waiting} waiting for access`}
                        </span>
                      </span>
                      <span className="person-actions">
                        {!isMe && (
                          <button className="btn btn-sm" disabled={busy === `a${p.id}`} onClick={() => act(`a${p.id}`, async () => {
                            await V.setAdmin(p.id, !p.isAdmin);
                            await load();
                            toast(p.isAdmin ? `${name} is no longer an admin` : `${name} is now an admin`);
                          })}>{p.isAdmin ? 'Remove admin' : 'Make admin'}</button>
                        )}
                        {!isMe && (
                          <ConfirmButton className="btn btn-sm btn-danger-ghost" onConfirm={() => act(`r${p.id}`, async () => {
                            const r = await V.removeFromMySites(p.id, store.sites);
                            r.updated.forEach(store.replaceSite);
                            await load();
                            toast(r.count ? `${name} removed from ${r.count} of your sites. Change any passwords they saw.` : `${name} isn't on any of your sites`);
                          })}>Remove from my sites</ConfirmButton>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="fine-print">
                To delete someone's account completely, remove them from your sites here, then delete them in Supabase under
                Authentication › Users.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
