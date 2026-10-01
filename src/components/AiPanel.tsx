import { useEffect, useState } from 'react';
import { askAboutSites, dailyBrief } from '../lib/ai';
import { useStore } from './store';
import { Icon, Modal, Spinner } from './ui';

const EXAMPLES = [
  'Which sites are hosted on Hostinger?',
  'Which sites still need Search Console set up?',
  'What renews in the next 2 months?',
  'Which client sites have the most open tasks?',
];

export function AiPanel({ onClose, startWithBrief }: { onClose: () => void; startWithBrief?: boolean }) {
  const { sites, tasks, settings } = useStore();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setErr('');
    setAnswer('');
    try {
      setAnswer(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (startWithBrief) run(() => dailyBrief(settings, sites, tasks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = (question: string) => {
    if (!question.trim()) return;
    setQ(question);
    run(() => askAboutSites(settings, question, sites, tasks));
  };

  return (
    <Modal title="Ask about your sites" onClose={onClose} wide>
      <p className="privacy-note">
        <Icon name="lock" size={14} /> Only site names, domains, tags, providers, dates, checklist and task titles are sent to
        Blackbox. Passwords, usernames and notes never leave your device.
      </p>
      <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about your sites…" autoFocus />
        <button className="btn btn-primary" disabled={busy || !q.trim()} type="submit">Ask</button>
      </form>
      <div className="ai-examples">
        <button className="suggestion strong" disabled={busy} onClick={() => run(() => dailyBrief(settings, sites, tasks))}>
          <Icon name="spark" size={12} /> Today's brief
        </button>
        {EXAMPLES.map((e) => <button key={e} className="suggestion" onClick={() => ask(e)} disabled={busy}>{e}</button>)}

      </div>
      {busy && <div className="ai-answer thinking"><Spinner /> Reading your sites…</div>}
      {err && <div className="notice notice-err">{err}</div>}
      {answer && <div className="ai-answer">{answer}</div>}
    </Modal>
  );
}
