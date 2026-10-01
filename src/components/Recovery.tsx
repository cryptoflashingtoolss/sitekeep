import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { createRecoveryKey } from '../lib/vault';
import { useStore } from './store';
import { ConfirmButton, Icon, Modal, Spinner, toast, toastError } from './ui';

/** Shows a new recovery key once, and makes the person confirm they saved it. */
export function RecoveryKeyCard({ code, onDone, doneLabel = 'Continue' }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="recovery-card">
      <p className="lede">
        If you ever forget your master password, this key gets you back in without losing anything. It's shown only once.
        Write it down or keep it in a safe place that isn't this app.
      </p>
      <div className="recovery-code" aria-label="Your recovery key">
        {code.split('-').map((g, i) => <span key={i}>{g}</span>)}
      </div>
      <button type="button" className="btn btn-sm" onClick={() => copyText(code, 120).then(() => toast('Recovery key copied. Clipboard clears in 2 minutes.'), () => toast('Copy failed. Write the key down instead.', 'err'))}>
        <Icon name="copy" size={14} /> Copy recovery key
      </button>
      <label className="confirm-check">
        <span className="tick">
          <input id="recovery-saved" type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span className="tick-box"><Icon name="check" size={14} /></span>
        </span>
        <span>I saved my recovery key somewhere safe</span>
      </label>
      <button type="button" className="btn btn-primary btn-block" disabled={!saved} onClick={onDone}>{doneLabel}</button>
    </div>
  );
}

/** Settings section: create or replace the recovery key. */
export function RecoveryKeySettings() {
  const store = useStore();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const has = store.me.hasRecoveryKey;

  const make = async () => {
    setBusy(true);
    try {
      setCode(await createRecoveryKey());
      store.markRecoveryKey();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel form">
      <h2>Recovery key</h2>
      <p className={`status-line ${has ? 'on' : ''}`}>
        <Icon name="key" size={16} />
        {has ? 'You have a recovery key. Keep it somewhere safe outside this app.' : "You don't have a recovery key. If you forget your password, you'd have to start over."}
      </p>
      <p className="fine-print">
        With the recovery key and access to your email you can set a new master password without losing anything.
        Making a new key stops the old one from working.
      </p>
      <div>
        {has ? (
          <ConfirmButton className="btn" onConfirm={make}>{busy ? <Spinner /> : 'Replace recovery key'}</ConfirmButton>
        ) : (
          <button type="button" className="btn btn-primary" onClick={make} disabled={busy}>{busy ? <Spinner /> : 'Create recovery key'}</button>
        )}
      </div>
      {code && (
        <Modal title="Save your recovery key" onClose={() => setCode(null)}>
          <RecoveryKeyCard code={code} onDone={() => { setCode(null); toast('Recovery key saved'); }} doneLabel="Done" />
        </Modal>
      )}
    </section>
  );
}
