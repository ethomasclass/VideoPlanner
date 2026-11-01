import { useCallback, useEffect, useRef, useState } from 'react';
import type { Planner } from './types.ts';
import Calendar from './components/Calendar.tsx';
import Sidebar from './components/Sidebar.tsx';
import Ideas from './components/Ideas.tsx';
import Seasons from './components/Seasons.tsx';
import Stats from './components/Stats.tsx';
import IdeaPage from './components/IdeaPage.tsx';
import Schedule from './components/Schedule.tsx';
import type { YouTubeData } from './types.ts';
import { disconnectAnalytics, fetchYouTube, reconcile } from './lib/youtube.ts';
import { ApiError, loadPlanner, savePlanner } from './lib/api.ts';
import { todayISO } from './lib/dates.ts';

type SaveState = 'saved' | 'saving' | 'error';
type Tab = 'calendar' | 'ideas' | 'schedule' | 'seasons' | 'stats';
const TABS: Tab[] = ['calendar', 'ideas', 'schedule', 'seasons', 'stats'];
const tabFromHash = (): Tab => (location.hash.startsWith('#idea/') ? 'ideas' : TABS.find((t) => `#${t}` === location.hash) ?? 'calendar');
const ideaFromHash = () => (location.hash.startsWith('#idea/') ? decodeURIComponent(location.hash.slice(6)) : null);

export default function App() {
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [fatal, setFatal] = useState<ApiError | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [notice, setNotice] = useState('');
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [yt, setYt] = useState<YouTubeData | null>(null);
  const [ytError, setYtError] = useState('');
  const [ytSyncing, setYtSyncing] = useState(false);
  const [openIdea, setOpenIdea] = useState<string | null>(ideaFromHash);
  const setTab = (t: Tab) => {
    history.replaceState(null, '', t === 'calendar' ? location.pathname : `#${t}`);
    setTabState(t);
    setOpenIdea(null);
  };
  const openIdeaPage = (id: string) => {
    history.pushState(null, '', `#idea/${encodeURIComponent(id)}`);
    setTabState('ideas');
    setOpenIdea(id);
    window.scrollTo(0, 0);
  };
  // The browser's Back button leaves an idea's page.
  useEffect(() => {
    const onPop = () => {
      setTabState(tabFromHash());
      setOpenIdea(ideaFromHash());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Saving: one request at a time. Changes made while a save is running are sent right after it,
  // on top of the new revision.
  const current = useRef<Planner | null>(null);
  const rev = useRef(0);
  const pending = useRef<Planner | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    try {
      const data = await loadPlanner();
      rev.current = data.rev;
      current.current = data.planner;
      setPlanner(data.planner);
      setFatal(null);
    } catch (e) {
      setFatal(e instanceof ApiError ? e : new ApiError(0, String(e)));
    }
  }, []);

  const flush = useCallback(async () => {
    if (inFlight.current || !pending.current) return;
    const doc = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSaveState('saving');
    try {
      rev.current = await savePlanner(doc, rev.current);
      inFlight.current = false;
      if (pending.current) flush();
      else setSaveState('saved');
    } catch (e) {
      inFlight.current = false;
      if (e instanceof ApiError && e.status === 409) {
        pending.current = null;
        await reload();
        setSaveState('saved');
        setNotice('The planner was changed on another device, so this page now shows the latest version. Your last change was not saved; make it again.');
      } else {
        pending.current ??= doc; // keep it for Retry
        setSaveState('error');
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setFatal(e);
      }
    }
  }, [reload]);

  /** Apply a change to a copy of the planner, show it at once, and save it. */
  const update = useCallback(
    (change: (draft: Planner) => void) => {
      if (!current.current) return;
      const next = structuredClone(current.current);
      change(next);
      current.current = next;
      setPlanner(next);
      pending.current = next;
      flush();
    },
    [flush],
  );

  const loadYouTube = useCallback(async (sync = false) => {
    if (sync) setYtSyncing(true);
    try {
      setYt(await fetchYouTube(sync));
      setYtError('');
    } catch (e) {
      setYtError(e instanceof Error ? e.message : String(e));
    } finally {
      setYtSyncing(false);
    }
  }, []);

  // Once both are loaded (and after every YouTube refresh), link confident matches and mark published videos.
  const plannerReady = planner !== null;
  useEffect(() => {
    if (!yt || !current.current) return;
    const change = reconcile(current.current, yt);
    if (change) update(change);
  }, [yt, plannerReady, update]);

  useEffect(() => {
    reload();
    loadYouTube();
    // Coming back to the tab picks up changes made on another device.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !inFlight.current && !pending.current) reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const download = () => {
    if (!current.current) return;
    const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chunk-planner-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = async (file: File) => {
    try {
      const doc = JSON.parse(await file.text()) as Planner;
      if (doc?.version !== 1 || !Array.isArray(doc.videos) || !Array.isArray(doc.releases)) throw new Error('not a planner backup');
      const msg = `Replace everything in the planner with this backup (${doc.videos.length} videos, ${doc.releases.length} releases)?`;
      if (!confirm(msg)) return;
      update((draft) => {
        for (const k of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[k];
        Object.assign(draft, doc);
      });
      setNotice('Backup restored.');
    } catch (e) {
      setNotice(`Couldn't restore that file: ${e instanceof Error ? e.message : e}`);
    }
  };

  if (fatal) {
    return (
      <div className="gate">
        <img src="/brand/chunk-history-horizontal.svg" alt="Chunk History" className="logo" />
        {fatal.setup ? (
          <p className="hand">almost there: {fatal.message.toLowerCase()}</p>
        ) : fatal.status === 401 || fatal.status === 403 ? (
          <>
            <p className="hand">you're signed out. {fatal.message.toLowerCase()}</p>
            <button className="primary" onClick={() => location.reload()}>Sign in again</button>
          </>
        ) : (
          <>
            <p className="hand">couldn't open the planner: {fatal.message}</p>
            <button className="primary" onClick={reload}>Try again</button>
          </>
        )}
      </div>
    );
  }
  if (!planner) return <p className="empty-note">opening the notebook…</p>;

  return (
    <div className="app">
      <header className="topbar">
        <img src="/brand/chunk-history-horizontal.svg" alt="Chunk History" className="logo" />
        <nav>
          <button className={`tab${tab === 'calendar' ? ' active' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
          <button className={`tab${tab === 'ideas' ? ' active' : ''}`} onClick={() => setTab('ideas')}>
            Ideas{planner.ideas.some((i) => !i.videoId) ? ` (${planner.ideas.filter((i) => !i.videoId).length})` : ''}
          </button>
          <button className={`tab${tab === 'schedule' ? ' active' : ''}`} onClick={() => setTab('schedule')}>Schedule</button>
          <button className={`tab${tab === 'seasons' ? ' active' : ''}`} onClick={() => setTab('seasons')}>Seasons</button>
          <button className={`tab${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')}>Stats</button>
        </nav>
        <div className="top-actions">
          <span className={`save-state ${saveState}`}>
            {saveState === 'saved' ? 'SAVED' : saveState === 'saving' ? 'SAVING…' : 'NOT SAVED'}
          </span>
          {saveState === 'error' && (
            <button className="link" onClick={flush}>Retry</button>
          )}
          <button className="link" onClick={download} title="Download all your plans as a file">Backup</button>
          <label className="link" title="Replace your plans with a backup file">
            Restore
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) restore(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button className="link" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}
      {tab === 'calendar' ? (
        <main className="layout">
          <Calendar planner={planner} update={update} yt={yt} onEditSchedule={() => setTab('schedule')} />
          <Sidebar planner={planner} />
        </main>
      ) : tab === 'ideas' ? (
        <main className="layout-full">
          {openIdea ? (
            <IdeaPage key={openIdea} planner={planner} ideaId={openIdea} update={update} onBack={() => setTab('ideas')} />
          ) : (
            <Ideas planner={planner} update={update} onOpen={openIdeaPage} />
          )}
        </main>
      ) : tab === 'schedule' ? (
        <main className="layout-full">
          <Schedule planner={planner} update={update} yt={yt} />
        </main>
      ) : tab === 'seasons' ? (
        <main className="layout-full">
          <Seasons planner={planner} update={update} />
        </main>
      ) : (
        <main className="layout-full">
          <Stats planner={planner} update={update} yt={yt} ytError={ytError} syncing={ytSyncing} onSync={() => loadYouTube(true)} onDisconnect={async () => setYt(await disconnectAnalytics())} />
        </main>
      )}
    </div>
  );
}
