import { useState, type FormEvent, type ReactNode } from 'react';
import { saveConfig } from '../lib/supabase';
import * as V from '../lib/vault';
import { MIN_PASSWORD_LENGTH, signIn, signUp } from '../lib/vault';
import { RecoveryKeyCard } from './Recovery';
import { Field, Icon, KeyTag, Spinner } from './ui';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-art" aria-hidden="true">
        <div className="auth-brand"><span className="brand-mark"><Icon name="key" size={18} /></span> SiteKeep</div>
        <div className="key-ring">
          <svg className="strings" viewBox="0 0 320 330" aria-hidden="true">
            <circle cx="40" cy="34" r="28" />
            <path d="M40 62 L34 118 M40 62 L68 208 M40 62 L30 298" />
          </svg>
          <span className="hang h1"><KeyTag hue={36} size="lg" label="harbordental.com" /></span>
          <span className="hang h2"><KeyTag hue={200} size="lg" label="copperline.store" /></span>
          <span className="hang h3"><KeyTag hue={150} size="lg" label="studio.dev" /></span>
        </div>
        <p className="auth-tagline">Every site's logins, tasks and setup checklist on one ring. Encrypted before it leaves your device.</p>
      </div>
      <div className="auth-side">{children}</div>
    </div>
  );
}

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^https:\/\/.+/.test(url.trim())) return setErr('The project URL starts with https://');
    if (key.trim().length < 20) return setErr('That key looks too short. Copy the anon or publishable key.');
    saveConfig({ url, anonKey: key });
    onDone();
  };

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <h1 className="display">Connect your sync database</h1>
        <p className="lede">
          Run <code>supabase/schema.sql</code> in your Supabase project once, then paste the values from Project Settings › API.
          Each device asks for this only once.
        </p>
        <Field label="Project URL">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoFocus />
        </Field>
        <Field label="Anon or publishable key" hint="Safe to keep in an app. Never paste the service_role key here.">
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJ… or sb_publishable_…" />
        </Field>
        {err && <div className="notice notice-err">{err}</div>}
        <button className="btn btn-primary btn-block" type="submit">Connect</button>
      </form>
    </AuthLayout>
  );
}

export function AuthScreen({ onUnlocked, onReconfigure, demo }: { onUnlocked: () => void; onReconfigure: () => void; demo?: boolean }) {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in');
  const [email, setEmail] = useState(demo ? 'alex@studio.dev' : '');
  const [name, setName] = useState('');
  const [pw, setPw] = useState(demo ? 'demo-password-123' : '');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    if (mode === 'up' && pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    try {
      if (mode === 'in') {
        const r = await signIn(email, pw);
        if (r.recoveryKey) setNewKey(r.recoveryKey);
        else onUnlocked();
      } else {
        const r = await signUp(email, pw, name);
        if (r.status === 'confirm') {
          setInfo('Confirm your email from the link in your inbox, then unlock here.');
          setMode('in');
          setPw2('');
        } else if (r.recoveryKey) setNewKey(r.recoveryKey);
        else onUnlocked();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (newKey) {
    return (
      <AuthLayout>
        <div className="auth-form">
          <h1 className="display">Save your recovery key</h1>
          <RecoveryKeyCard code={newKey} onDone={onUnlocked} doneLabel="Open my vault" />
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'forgot') {
    return (
      <AuthLayout>
        <ForgotPassword initialEmail={email} onBack={() => setMode('in')} onUnlocked={onUnlocked} demo={demo} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <h1 className="display">{mode === 'in' ? 'Unlock your vault' : 'Create your vault'}</h1>
        <p className="lede">
          {mode === 'in'
            ? 'Your master password opens your sites on this device.'
            : 'Your master password encrypts everything. Only you know it.'}
        </p>
        {demo && <div className="notice">Demo: the details are filled in. Press Unlock.</div>}

        {mode === 'up' && (
          <Field label="Your name">
            <input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
        )}
        <Field label="Email">
          <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus={!demo} />
        </Field>
        <Field label="Master password" hint={mode === 'up' ? `At least ${MIN_PASSWORD_LENGTH} characters. A short sentence works well.` : undefined}>
          <input id="auth-password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </Field>
        {mode === 'up' && (
          <>
            <Field label="Repeat master password">
              <input id="auth-password2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" />
            </Field>
            <div className="notice">
              You'll get a recovery key next. Keep it safe: it's the only way back in if you forget this password.
            </div>
          </>
        )}

        {err && <div className="notice notice-err">{err}</div>}
        {info && <div className="notice">{info}</div>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? <><Spinner /> Unlocking…</> : mode === 'in' ? 'Unlock' : 'Create vault'}
        </button>
        {mode === 'in' && (
          <button type="button" className="link-btn center" onClick={() => { setMode('forgot'); setErr(''); }}>Forgot your password?</button>
        )}
        <p className="auth-switch">
          {mode === 'in' ? 'Invited to SiteKeep?' : 'Already have a vault?'}{' '}
          <button type="button" className="link-btn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); }}>
            {mode === 'in' ? 'Create your vault' : 'Unlock instead'}
          </button>
        </p>
        {!demo && <button type="button" className="link-btn quiet" onClick={onReconfigure}>Use a different sync database</button>}
      </form>
    </AuthLayout>
  );
}

type ForgotStep = 'email' | 'code' | 'choose' | 'with-key' | 'fresh' | 'new-key';

function ForgotPassword({ initialEmail, onBack, onUnlocked, demo }: {
  initialEmail: string; onBack: () => void; onUnlocked: () => void; demo?: boolean;
}) {
  const [step, setStep] = useState<ForgotStep>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [hasKey, setHasKey] = useState(true);
  const [recovery, setRecovery] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await fn();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  const checkPw = () => {
    if (pw !== pw2) throw new Error("The two passwords don't match.");
  };

  const errBox = err && <div className="notice notice-err">{err}</div>;
  const back = <button type="button" className="back-link" onClick={onBack}><Icon name="back" size={18} /> Back to unlock</button>;

  if (step === 'email') return (
    <form className="auth-form" onSubmit={run(async () => { await V.sendResetCode(email); setStep('code'); })}>
      {back}
      <h1 className="display">Forgot your password</h1>
      <p className="lede">We'll email you a reset link to prove it's you.</p>
      <Field label="Email"><input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
      {errBox}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner /> : 'Email me a reset link'}</button>
    </form>
  );

  if (step === 'code') return (
    <form className="auth-form" onSubmit={run(async () => { const r = await V.verifyResetCode(email, code); setHasKey(r.hasRecoveryKey); setStep(r.hasRecoveryKey ? 'choose' : 'fresh'); })}>
      {back}
      <h1 className="display">Check your email</h1>
      <p className="lede">
        We sent a "Reset your password" email to {email}. Don't open the link in your browser. Copy it instead
        (right-click or long-press it, then Copy link) and paste it here.{demo && ' Demo: any 6 digits work.'}
      </p>
      <Field label="Reset link or code" hint="If you already clicked the link, copy the full address of the page it opened and paste that.">
        <input id="forgot-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus
          placeholder="https://…supabase.co/auth/v1/verify?token=…" className="mono" autoComplete="off" spellCheck={false} />
      </Field>
      {errBox}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner /> : 'Continue'}</button>
      <button type="button" className="link-btn center" onClick={() => V.sendResetCode(email).then(() => setErr(''), () => undefined)}>Send a new email</button>
    </form>
  );

  if (step === 'choose') return (
    <div className="auth-form">
      {back}
      <h1 className="display">Do you have your recovery key?</h1>
      <p className="lede">It's the 32-character key you saved when you created your vault.</p>
      <button className="choice" onClick={() => setStep('with-key')}>
        <strong>Yes, I have it</strong>
        <span>Set a new password and keep everything.</span>
      </button>
      <button className="choice" onClick={() => setStep('fresh')}>
        <strong>No, I don't have it</strong>
        <span>Start a fresh vault. Teammates can give you back access to shared sites.</span>
      </button>
    </div>
  );

  if (step === 'with-key') return (
    <form className="auth-form" onSubmit={run(async () => { checkPw(); await V.resetWithRecoveryKey(email, recovery, pw); onUnlocked(); })}>
      {back}
      <h1 className="display">Set a new password</h1>
      <Field label="Recovery key"><input id="recovery-input" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-…" required autoFocus className="mono" /></Field>
      <Field label="New master password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}><input id="new-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" /></Field>
      <Field label="Repeat new password"><input id="new-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" /></Field>
      {errBox}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner /> : 'Save password and unlock'}</button>
    </form>
  );

  if (step === 'fresh') return (
    <form className="auth-form" onSubmit={run(async () => { checkPw(); setNewKey(await V.startFreshVault(email, pw)); setStep('new-key'); })}>
      {back}
      <h1 className="display">Start a fresh vault</h1>
      {!hasKey && <p className="lede">This account has no recovery key, so your old vault can't be unlocked.</p>}
      <div className="notice notice-warn">
        Sites shared with teammates come back after one of them taps <strong>Restore access</strong> for you.
        Sites and tasks that only you could open are lost.
      </div>
      <Field label="New master password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}><input id="fresh-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" autoFocus /></Field>
      <Field label="Repeat new password"><input id="fresh-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" /></Field>
      {errBox}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner /> : 'Start fresh vault'}</button>
    </form>
  );

  return (
    <div className="auth-form">
      <h1 className="display">Save your new recovery key</h1>
      <RecoveryKeyCard code={newKey} onDone={onUnlocked} doneLabel="Open my vault" />
    </div>
  );
}
