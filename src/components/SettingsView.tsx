import { useState, type FormEvent } from 'react';
import { testConnection } from '../lib/ai';
import { changePassword, MIN_PASSWORD_LENGTH } from '../lib/vault';
import type { Settings } from '../lib/types';
import { useStore } from './store';
import { ReminderSettings } from './Reminders';
import { RecoveryKeySettings } from './Recovery';
import { ConfirmButton, Field, Icon, Spinner, toast, toastError } from './ui';

export function SettingsView({ onBack, onDisconnect }: { onBack: () => void; onDisconnect: () => void }) {
  const store = useStore();
  const [s, setS] = useState<Settings>(store.settings);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await store.saveSettings({
        ...s,
        autoLockMinutes: Math.max(1, Math.min(240, Number(s.autoLockMinutes) || 10)),
        clipboardClearSeconds: Math.max(5, Math.min(600, Number(s.clipboardClearSeconds) || 30)),
      });
      toast('Settings saved');
    } catch (err) {
      toastError(err);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await testConnection(s);
      toast(`AI replied: ${r.slice(0, 60)}`);
    } catch (err) {
      toastError(err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="page narrow">
      <header className="page-header">
        <div>
          <h1 className="display">Settings</h1>
          <p className="lede">Signed in as {store.me.email}</p>
        </div>
      </header>

      <form className="panel form" onSubmit={save}>
        <h2>Blackbox AI</h2>
        <p className="fine-print">Your API key is stored encrypted with your vault, never in plain text.</p>
        <Field label="API base URL" hint="Public API: https://api.blackbox.ai · Enterprise: https://enterprise.blackbox.ai">
          <input value={s.aiBaseUrl} onChange={(e) => set('aiBaseUrl', e.target.value)} />
        </Field>
        <Field label="API key">
          <div className="input-group">
            <input type={showKey ? 'text' : 'password'} value={s.aiApiKey} onChange={(e) => set('aiApiKey', e.target.value)} autoComplete="off" className="mono" />
            <button type="button" className="icon-btn" onClick={() => setShowKey(!showKey)}><Icon name={showKey ? 'eyeOff' : 'eye'} /></button>
          </div>
        </Field>
        <Field label="Model" hint="Any chat model id from your Blackbox dashboard.">
          <input value={s.aiModel} onChange={(e) => set('aiModel', e.target.value)} />
        </Field>
        <button type="button" className="btn btn-sm" onClick={test} disabled={testing || !s.aiApiKey}>
          {testing ? <Spinner /> : <Icon name="spark" size={14} />} Test connection
        </button>

        <h2>Security</h2>
        <div className="row">
          <Field label="Auto-lock after (minutes idle)">
            <input type="number" min={1} max={240} value={s.autoLockMinutes} onChange={(e) => set('autoLockMinutes', Number(e.target.value))} />
          </Field>
          <Field label="Clear copied passwords after (seconds)">
            <input type="number" min={5} max={600} value={s.clipboardClearSeconds} onChange={(e) => set('clipboardClearSeconds', Number(e.target.value))} />
          </Field>
        </div>
        <div className="modal-actions"><span className="spacer" /><button className="btn btn-primary" type="submit">Save settings</button></div>
      </form>

      <ReminderSettings sites={store.sites} tasks={store.tasks} />

      <RecoveryKeySettings />

      <ChangePasswordCard />

      <section className="panel">
        <h2>Sync database</h2>
        <p className="fine-print">Disconnect this device from the current Supabase project. Your data stays in Supabase.</p>
        <ConfirmButton onConfirm={onDisconnect}>Disconnect this device</ConfirmButton>
      </section>
    </div>
  );
}

function ChangePasswordCard() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== next2) return toastError("New passwords don't match.");
    setBusy(true);
    try {
      await changePassword(cur, next);
      setCur(''); setNext(''); setNext2('');
      toast('Master password changed. Use the new one on all your devices.');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <h2>Change master password</h2>
      <Field label="Current password"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></Field>
      <div className="row">
        <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}><input type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" /></Field>
        <Field label="Repeat new password"><input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} required autoComplete="new-password" /></Field>
      </div>
      <div className="modal-actions"><span className="spacer" /><button className="btn" type="submit" disabled={busy}>{busy ? <Spinner /> : null} Change password</button></div>
    </form>
  );
}
