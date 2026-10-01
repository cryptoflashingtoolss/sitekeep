import { useCallback, useEffect, useRef, useState } from 'react';
import { clearConfig, getConfig } from './lib/supabase';
import { getSession, lock } from './lib/vault';
import { sodiumReady } from './lib/crypto';
import { AuthScreen, SetupScreen } from './components/AuthScreens';
import { StoreProvider, useStore } from './components/store';
import { TodayView } from './components/TodayView';
import { SitesView } from './components/SitesView';
import { SiteView } from './components/SiteView';
import { SettingsView } from './components/SettingsView';
import { TeamView } from './components/TeamView';
import { AiPanel } from './components/AiPanel';
import { Icon, KeyTag, Toasts } from './components/ui';
import { useReminders } from './components/Reminders';
import { siteHue } from './lib/helpers';

const DEMO = import.meta.env.MODE === 'demo';

export default function App() {
  const [configured, setConfigured] = useState(() => !!getConfig());
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    sodiumReady().catch(() => undefined); // warm up the crypto library while the user types
  }, []);

  const disconnect = async () => {
    await lock();
    clearConfig();
    setUnlocked(false);
    setConfigured(false);
  };

  let screen;
  if (!configured) screen = <SetupScreen onDone={() => setConfigured(true)} />;
  else if (!unlocked) screen = <AuthScreen onUnlocked={() => setUnlocked(true)} onReconfigure={disconnect} demo={DEMO} />;
  else
    screen = (
      <StoreProvider>
        <Workspace onLocked={() => setUnlocked(false)} onDisconnect={disconnect} />
      </StoreProvider>
    );

  return (
    <>
      {screen}
      <Toasts />
    </>
  );
}

type View = { name: 'today' } | { name: 'sites' } | { name: 'site'; id: string } | { name: 'team' } | { name: 'settings' };

function Workspace({ onLocked, onDisconnect }: { onLocked: () => void; onDisconnect: () => void }) {
  const { settings, sites, tasks, loading, waiting } = useStore();
  const [view, setView] = useState<View>({ name: 'today' });
  const [aiOpen, setAiOpen] = useState<false | 'ask' | 'brief'>(false);
  const mainRef = useRef<HTMLElement>(null);

  const doLock = useCallback(async () => {
    await lock();
    onLocked();
  }, [onLocked]);

  useAutoLock(settings.autoLockMinutes, doLock);
  useReminders(sites, tasks, loading);

  const go = (v: View) => {
    setView(v);
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };
  const openSite = (id: string) => go({ name: 'site', id });

  // Android back button: return to the list instead of closing the app.
  useEffect(() => {
    if (view.name === 'today') return;
    history.pushState({ sk: true }, '');
    const onPop = () => setView(view.name === 'site' ? { name: 'sites' } : { name: 'today' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [view.name]);

  const me = getSession();
  const openCount = tasks.filter((t) => !t.data.done).length;
  const section = view.name === 'site' ? 'sites' : view.name;
  const currentSite = view.name === 'site' ? view.id : null;

  return (
    <div className="shell">
      {DEMO && <div className="demo-bar">Demo with sample data. Changes aren't saved.</div>}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark"><Icon name="key" size={18} /></span>
          SiteKeep
        </div>
        <nav className="side-nav">
          <button className={section === 'today' ? 'active' : ''} onClick={() => go({ name: 'today' })}>
            <Icon name="check" /> Today {openCount > 0 && <span className="nav-count">{openCount}</span>}
          </button>
          <button className={section === 'sites' ? 'active' : ''} onClick={() => go({ name: 'sites' })}>
            <Icon name="grid" /> All sites <span className="nav-count quiet">{sites.length}</span>
          </button>
          <button className={section === 'team' ? 'active' : ''} onClick={() => go({ name: 'team' })}>
            <Icon name="users" /> Team {waiting.length > 0 && <span className="nav-count">{new Set(waiting.map((w) => w.userId)).size}</span>}
          </button>
          <button onClick={() => setAiOpen('ask')}><Icon name="spark" /> Ask AI</button>
        </nav>
        <div className="side-sites">
          {sites.map((s) => (
            <button key={s.id} className={currentSite === s.id ? 'active' : ''} onClick={() => openSite(s.id)}>
              <KeyTag hue={siteHue(s.data.name)} size="dot" />
              <span className="truncate">{s.data.name}</span>
            </button>
          ))}
        </div>
        <div className="side-foot">
          <button className={section === 'settings' ? 'active' : ''} onClick={() => go({ name: 'settings' })}><Icon name="gear" /> Settings</button>
          <button onClick={doLock} title={me.email}><Icon name="lock" /> Lock</button>
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        {view.name === 'today' && <TodayView onOpenSite={openSite} onAskAi={() => setAiOpen('brief')} onOpenTeam={() => go({ name: 'team' })} onOpenSettings={() => go({ name: 'settings' })} />}
        {view.name === 'sites' && <SitesView onOpenSite={openSite} />}
        {view.name === 'site' && <SiteView siteId={view.id} onBack={() => go({ name: 'sites' })} />}
        {view.name === 'team' && <TeamView />}
        {view.name === 'settings' && <SettingsView onBack={() => go({ name: 'today' })} onDisconnect={onDisconnect} />}
      </main>

      <nav className="tabbar">
        <button className={section === 'today' ? 'active' : ''} onClick={() => go({ name: 'today' })}>
          <Icon name="check" size={22} /><span>Today</span>
          {openCount > 0 && <i className="tab-badge">{openCount}</i>}
        </button>
        <button className={section === 'sites' ? 'active' : ''} onClick={() => go({ name: 'sites' })}>
          <Icon name="grid" size={22} /><span>Sites</span>
        </button>
        <button className={section === 'team' ? 'active' : ''} onClick={() => go({ name: 'team' })}>
          <Icon name="users" size={22} /><span>Team</span>
          {waiting.length > 0 && <i className="tab-badge">{new Set(waiting.map((w) => w.userId)).size}</i>}
        </button>
        <button onClick={() => setAiOpen('ask')}><Icon name="spark" size={22} /><span>Ask AI</span></button>
        <button className={section === 'settings' ? 'active' : ''} onClick={() => go({ name: 'settings' })}>
          <Icon name="gear" size={22} /><span>Settings</span>
        </button>
        <button onClick={doLock}><Icon name="lock" size={22} /><span>Lock</span></button>
      </nav>

      {aiOpen && <AiPanel startWithBrief={aiOpen === 'brief'} onClose={() => setAiOpen(false)} />}
    </div>
  );
}

/** Lock the vault after N idle minutes, and when the app is hidden for that long. */
function useAutoLock(minutes: number, onLock: () => void) {
  const last = useRef(Date.now());
  useEffect(() => {
    const bump = () => (last.current = Date.now());
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last.current > minutes * 60000) onLock();
    }, 15000);
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - last.current > minutes * 60000) onLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [minutes, onLock]);
}
