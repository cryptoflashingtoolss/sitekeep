import { useState } from 'react';
import { defaultChecklist, matchesSearch, siteHue } from '../lib/helpers';
import { normalizeSite } from '../lib/types';
import { useStore } from './store';
import { SiteForm } from './SiteForm';
import { Icon, KeyTag, Spinner, toast } from './ui';

export function SitesView({ onOpenSite }: { onOpenSite: (id: string) => void }) {
  const { sites, tasks, loading, addSite } = useStore();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const filtered = sites.filter((s) => matchesSearch(s, q));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="display">Sites</h1>
          <p className="lede">{sites.length} {sites.length === 1 ? 'site' : 'sites'} on your key ring</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add site</button>
      </header>

      <label className="searchbar">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, domain, host or tag" />
        {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear search"><Icon name="x" size={16} /></button>}
      </label>

      {loading && <div className="loading-row"><Spinner /></div>}

      {!loading && sites.length === 0 && (
        <div className="empty-state big">
          <KeyTag hue={42} size="lg" />
          <p>Your key ring is empty. Add a site to keep its logins, tasks and setup checklist together.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add your first site</button>
        </div>
      )}

      <div className="tag-grid">
        {filtered.map((s) => {
          const open = tasks.filter((t) => t.siteId === s.id && !t.data.done).length;
          const done = s.data.checklist.filter((c) => c.done).length;
          const total = s.data.checklist.length;
          return (
            <button key={s.id} className="site-tag" style={{ ['--h' as string]: siteHue(s.data.name) }} onClick={() => onOpenSite(s.id)}>
              <span className="site-tag-hole" />
              <span className="site-tag-body">
                <span className="site-tag-name">{s.data.name}</span>
                <span className="site-tag-url truncate">{s.data.url.replace(/^https?:\/\//, '') || 'No address yet'}</span>
                <span className="site-tag-facts">
                  <span title="Saved logins"><Icon name="key" size={14} /> {s.data.credentials.length}</span>
                  <span className={open ? 'has-open' : ''}>{open} open {open === 1 ? 'task' : 'tasks'}</span>
                  {s.role !== 'owner' && <span className="role-badge">{s.role === 'editor' ? 'Shared, can edit' : 'Shared, view only'}</span>}
                </span>
                {total > 0 && (
                  <span className="meter" title={`${done} of ${total} setup steps done`}>
                    <span style={{ width: `${(done / total) * 100}%` }} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {q && filtered.length === 0 && (
        <p className="quiet-text">No site matches "{q}". For questions like "which sites use Hostinger?", use Ask AI.</p>
      )}

      {adding && (
        <SiteForm
          title="Add site"
          initial={normalizeSite({ name: '', checklist: defaultChecklist() })}
          onClose={() => setAdding(false)}
          onSave={async (data) => {
            const site = await addSite(data);
            toast('Site added');
            onOpenSite(site.id);
          }}
        />
      )}
    </div>
  );
}
