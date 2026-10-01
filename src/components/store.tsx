import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as V from '../lib/vault';
import type { Settings, Site, SiteData, Task, TaskData } from '../lib/types';
import { toastError } from './ui';

interface Store {
  sites: Site[];
  tasks: Task[];
  loading: boolean;
  settings: Settings;
  me: { userId: string; email: string; displayName: string; isAdmin: boolean; hasRecoveryKey: boolean };
  waiting: V.WaitingMember[];
  myWaiting: number;
  refreshWaiting: () => Promise<void>;
  markRecoveryKey: () => void;
  refresh: () => Promise<void>;
  addSite: (data: SiteData) => Promise<Site>;
  saveSite: (site: Site, data: SiteData) => Promise<void>;
  removeSite: (site: Site) => Promise<void>;
  replaceSite: (site: Site) => void;
  dropSite: (siteId: string) => void;
  addTask: (site: Site, data: TaskData) => Promise<void>;
  saveTask: (task: Task, data: TaskData) => Promise<void>;
  removeTask: (task: Task) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  siteById: (id: string) => Site | undefined;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const session = V.getSession();
  const [sites, setSites] = useState<Site[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(session.settings);
  const [waiting, setWaiting] = useState<V.WaitingMember[]>([]);
  const [myWaiting, setMyWaiting] = useState(0);
  const [hasRecoveryKey, setHasRecoveryKey] = useState(session.hasRecoveryKey);

  const loadWaiting = useCallback(async (s: Site[]) => {
    try {
      setWaiting(await V.listWaiting(s));
      setMyWaiting(await V.myWaitingCount());
    } catch {
      /* not critical */
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await V.loadSites();
      setSites(s);
      setTasks(await V.loadTasks(s));
      loadWaiting(s);
    } catch (e) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  }, [loadWaiting]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const siteById = useCallback((id: string) => sites.find((s) => s.id === id), [sites]);

  const store: Store = useMemo(
    () => ({
      sites,
      tasks,
      loading,
      settings,
      me: { userId: session.userId, email: session.email, displayName: session.displayName, isAdmin: session.isAdmin, hasRecoveryKey },
      waiting,
      myWaiting,
      refreshWaiting: () => loadWaiting(sites),
      markRecoveryKey: () => setHasRecoveryKey(true),
      refresh,
      siteById,
      addSite: async (data) => {
        const site = await V.createSite(data);
        setSites((x) => [...x, site].sort((a, b) => a.data.name.localeCompare(b.data.name)));
        return site;
      },
      saveSite: async (site, data) => {
        const updated = await V.updateSite(site, data);
        setSites((x) => x.map((s) => (s.id === site.id ? updated : s)));
      },
      removeSite: async (site) => {
        await V.deleteSite(site);
        setSites((x) => x.filter((s) => s.id !== site.id));
        setTasks((x) => x.filter((t) => t.siteId !== site.id));
      },
      replaceSite: (site) => setSites((x) => x.map((s) => (s.id === site.id ? site : s))),
      dropSite: (siteId) => {
        setSites((x) => x.filter((s) => s.id !== siteId));
        setTasks((x) => x.filter((t) => t.siteId !== siteId));
      },
      addTask: async (site, data) => {
        const t = await V.createTask(site, data);
        setTasks((x) => [...x, t]);
      },
      saveTask: async (task, data) => {
        const site = sites.find((s) => s.id === task.siteId);
        if (!site) throw new Error('Site not found');
        const t = await V.updateTask(site, task, data);
        setTasks((x) => x.map((o) => (o.id === t.id ? t : o)));
      },
      removeTask: async (task) => {
        await V.deleteTask(task);
        setTasks((x) => x.filter((t) => t.id !== task.id));
      },
      saveSettings: async (s) => {
        await V.saveSettings(s);
        setSettings(s);
      },
    }),
    [sites, tasks, loading, settings, refresh, siteById, session, waiting, myWaiting, hasRecoveryKey, loadWaiting],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export const canEdit = (site: Site) => site.role === 'owner' || site.role === 'editor';
