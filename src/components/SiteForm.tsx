import { useState, type FormEvent } from 'react';
import {
  CREDENTIAL_KINDS,
  emptyCredential,
  kindLabel,
  newId,
  type Credential,
  type CredentialKind,
  type Renewal,
  type SiteData,
} from '../lib/types';
import { generatePassword } from '../lib/crypto';
import { Field, Icon, Modal, toastError } from './ui';

export function SiteForm({ initial, title, onSave, onClose }: {
  initial: SiteData;
  title: string;
  onSave: (data: SiteData) => Promise<void>;
  onClose: () => void;
}) {
  const [d, setD] = useState<SiteData>(() => structuredClone(initial));
  const [tagText, setTagText] = useState(initial.tags.join(', '));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SiteData>(k: K, v: SiteData[K]) => setD((x) => ({ ...x, [k]: v }));

  const setCred = (id: string, patch: Partial<Credential>) =>
    set('credentials', d.credentials.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setRenewal = (id: string, patch: Partial<Renewal>) =>
    set('renewals', d.renewals.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) return toastError('Give the site a name.');
    setBusy(true);
    try {
      const tags = tagText.split(',').map((t) => t.trim()).filter(Boolean);
      await onSave({
        ...d,
        name: d.name.trim(),
        url: d.url.trim(),
        tags: [...new Set(tags)],
        renewals: d.renewals.filter((r) => r.label.trim() || r.date),
      });
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="form">
        <div className="row">
          <Field label="Site name"><input value={d.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
          <Field label="Website URL"><input value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://example.com" /></Field>
        </div>
        <div className="row">
          <Field label="Hosting provider"><input value={d.hostProvider} onChange={(e) => set('hostProvider', e.target.value)} placeholder="e.g. Hostinger" /></Field>
          <Field label="Domain registrar"><input value={d.registrar} onChange={(e) => set('registrar', e.target.value)} placeholder="e.g. Namecheap" /></Field>
        </div>
        <Field label="Tags" hint="Comma separated, e.g. client, woocommerce, seo-retainer">
          <input value={tagText} onChange={(e) => setTagText(e.target.value)} />
        </Field>

        <h3 className="form-section">Logins & keys</h3>
        {d.credentials.length === 0 && <p className="quiet-text">No logins yet.</p>}
        {d.credentials.map((c) => (
          <fieldset key={c.id} className="cred-edit">
            <div className="row">
              <Field label="Type">
                <select value={c.kind} onChange={(e) => {
                  const kind = e.target.value as CredentialKind;
                  setCred(c.id, { kind, label: c.label === kindLabel(c.kind) ? kindLabel(kind) : c.label });
                }}>
                  {CREDENTIAL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="Label"><input value={c.label} onChange={(e) => setCred(c.id, { label: e.target.value })} /></Field>
            </div>
            <Field label="Login URL"><input value={c.url} onChange={(e) => setCred(c.id, { url: e.target.value })} placeholder="https://example.com/wp-admin" /></Field>
            <div className="row">
              <Field label="Username / email"><input value={c.username} onChange={(e) => setCred(c.id, { username: e.target.value })} autoComplete="off" /></Field>
              <Field label={c.kind === 'api' ? 'Key / token' : 'Password'}>
                <div className="input-group">
                  <input value={c.password} onChange={(e) => setCred(c.id, { password: e.target.value })} autoComplete="off" spellCheck={false} className="mono" />
                  <button type="button" className="icon-btn" title="Generate strong password"
                    onClick={() => setCred(c.id, { password: generatePassword(20) })}><Icon name="dice" /></button>
                </div>
              </Field>
            </div>
            <Field label="Notes (2FA backup codes, security questions...)">
              <textarea rows={2} value={c.notes} onChange={(e) => setCred(c.id, { notes: e.target.value })} />
            </Field>
            <button type="button" className="btn btn-danger-ghost btn-sm"
              onClick={() => set('credentials', d.credentials.filter((x) => x.id !== c.id))}>
              <Icon name="trash" size={14} /> Remove this login
            </button>
          </fieldset>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => set('credentials', [...d.credentials, emptyCredential()])}>
          <Icon name="plus" size={14} /> Add login
        </button>

        <h3 className="form-section">Renewal dates</h3>
        {d.renewals.map((r) => (
          <div className="row renewal-row" key={r.id}>
            <input value={r.label} onChange={(e) => setRenewal(r.id, { label: e.target.value })} placeholder="Domain / SSL / Hosting" />
            <input type="date" value={r.date} onChange={(e) => setRenewal(r.id, { date: e.target.value })} />
            <button type="button" className="icon-btn" aria-label="Remove renewal"
              onClick={() => set('renewals', d.renewals.filter((x) => x.id !== r.id))}><Icon name="trash" size={16} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => set('renewals', [...d.renewals, { id: newId(), label: '', date: '' }])}>
          <Icon name="plus" size={14} /> Add renewal
        </button>

        <h3 className="form-section">Notes</h3>
        <textarea rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything else about this site" />

        <div className="modal-actions sticky">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Save site</button>
        </div>
      </form>
    </Modal>
  );
}
