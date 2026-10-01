import { useEffect, useRef, useState } from 'react';
import * as N from '../lib/notify';
import type { Site, Task } from '../lib/types';
import { Icon, Spinner, toast, toastError } from './ui';

/** Keeps device reminders up to date while the vault is unlocked. */
export function useReminders(sites: Site[], tasks: Task[], loading: boolean) {
  const latest = useRef({ sites, tasks });
  latest.current = { sites, tasks };

  // Show anything due now, right after unlocking and every 15 minutes.
  useEffect(() => {
    if (loading) return;
    const tick = () => N.notifyNow(latest.current.sites, latest.current.tasks).catch(() => undefined);
    tick();
    const t = setInterval(tick, 15 * 60000);
    return () => clearInterval(t);
  }, [loading]);

  // Re-schedule upcoming reminders (Android) shortly after any change.
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => N.scheduleAhead(sites, tasks).catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, [sites, tasks, loading]);
}

/** The "allow notifications" card shown on Today until answered. */
export function ReminderPrompt({ sites, tasks }: { sites: Site[]; tasks: Task[] }) {
  const [perm, setPerm] = useState<N.NotifyPermission | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    N.getPermission().then(setPerm);
  }, []);

  if (hidden || !perm || !N.shouldPrompt(perm)) return null;

  const allow = async () => {
    setBusy(true);
    try {
      const r = await N.requestAccess();
      setPerm(r);
      if (r === 'granted') {
        toast('Reminders are on for this device');
        await N.notifyNow(sites, tasks);
        await N.scheduleAhead(sites, tasks);
      } else {
        toast('Notifications are blocked. You can allow them later in your device settings.', 'err');
        N.savePrefs({ promptDismissedAt: Date.now() });
      }
      setHidden(true);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reminder-prompt" aria-label="Turn on reminders">
      <span className="bell"><Icon name="bell" size={22} /></span>
      <div className="reminder-text">
        <h2>Get reminders on this device</h2>
        <p>
          SiteKeep can alert you when a task is due or overdue, and before a domain, SSL or hosting plan renews.
          Your device will ask for permission to show notifications.
        </p>
      </div>
      <div className="reminder-actions">
        <button className="btn btn-primary" onClick={allow} disabled={busy}>
          {busy ? <Spinner /> : <Icon name="bell" size={16} />} Turn on reminders
        </button>
        <button className="btn" onClick={() => { N.savePrefs({ promptDismissedAt: Date.now() }); setHidden(true); }}>Not now</button>
      </div>
    </section>
  );
}

/** Settings section for reminders on this device. */
export function ReminderSettings({ sites, tasks }: { sites: Site[]; tasks: Task[] }) {
  const [perm, setPerm] = useState<N.NotifyPermission | null>(null);
  const [prefs, setPrefs] = useState(N.getPrefs());

  useEffect(() => {
    N.getPermission().then(setPerm);
  }, []);

  const update = async (p: Partial<N.ReminderPrefs>) => {
    const next = N.savePrefs(p);
    setPrefs(next);
    await N.scheduleAhead(sites, tasks).catch(() => undefined);
  };

  const turnOn = async () => {
    try {
      const r = perm === 'granted' ? 'granted' : await N.requestAccess();
      setPerm(r);
      if (r === 'granted') {
        await update({ enabled: true });
        toast('Reminders are on for this device');
      } else toast('Notifications are blocked. Allow them for SiteKeep in your device settings.', 'err');
    } catch (e) {
      toastError(e);
    }
  };

  const active = prefs.enabled && perm === 'granted';
  let status: string;
  if (perm === 'unsupported') status = "This device can't show notifications.";
  else if (perm === 'denied') status = 'Notifications are blocked for SiteKeep. Allow them in your device settings, then come back here.';
  else if (active) status = N.canScheduleWhenClosed()
    ? 'On. Reminders arrive even when SiteKeep is closed.'
    : 'On. Reminders show while SiteKeep is open on this computer.';
  else status = 'Off on this device.';

  return (
    <section className="panel form">
      <h2>Reminders on this device</h2>
      <p className={`status-line ${active ? 'on' : ''}`}><Icon name="bell" size={16} /> {status}</p>
      {perm !== 'unsupported' && (
        active ? (
          <>
            <div className="row">
              {N.canScheduleWhenClosed() && (
                <label className="field">
                  <span className="field-label">Daily reminder time</span>
                  <input id="reminder-time" type="time" value={prefs.time} onChange={(e) => update({ time: e.target.value || '09:00' })} />
                </label>
              )}
              <label className="switch field-switch">
                <input id="reminder-details" type="checkbox" checked={prefs.showDetails} onChange={(e) => update({ showDetails: e.target.checked })} />
                <span>Show task and site names in notifications</span>
              </label>
            </div>
            <p className="fine-print">
              You'll hear about tasks due today or overdue, and renewals 14, 7, 3 and 1 days before. Passwords and usernames
              are never put in a notification. Turn names off if others can see your lock screen.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-sm" onClick={() => N.sendTest(prefs.showDetails).then(() => toast('Test reminder sent'))}>
                Send a test reminder
              </button>
              <span className="spacer" />
              <button type="button" className="btn btn-sm btn-danger-ghost" onClick={async () => { await N.disableReminders(); setPrefs(N.getPrefs()); toast('Reminders are off for this device'); }}>
                Turn off
              </button>
            </div>
          </>
        ) : (
          perm !== 'denied' && <div><button type="button" className="btn btn-primary" onClick={turnOn}><Icon name="bell" size={16} /> Turn on reminders</button></div>
        )
      )}
    </section>
  );
}
