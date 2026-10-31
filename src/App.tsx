import { useCallback, useEffect, useRef, useState } from 'react';
import type { Planner } from './types.ts';
import Calendar from './components/Calendar.tsx';
import Sidebar from './components/Sidebar.tsx';

type SaveState = 'saved' | 'saving' | 'error';

export default function App() {
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');

  useEffect(() => {
    fetch('/api/planner')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(setPlanner)
      .catch((e) => setLoadError(String(e)));
  }, []);

  // The latest planner, so update() can work from it without side effects inside a state updater.
  const current = useRef<Planner | null>(null);
  current.current = planner;
  const saveSeq = useRef(0);

  /** Apply a change to a copy of the planner, show it at once, and save it to data/planner.json. */
  const update = useCallback((change: (draft: Planner) => void) => {
    if (!current.current) return;
    const next = structuredClone(current.current);
    change(next);
    current.current = next;
    setPlanner(next);
    setSaveState('saving');
    const seq = ++saveSeq.current;
    fetch('/api/planner', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
      .then((r) => seq === saveSeq.current && setSaveState(r.ok ? 'saved' : 'error'))
      .catch(() => seq === saveSeq.current && setSaveState('error'));
  }, []);

  if (loadError) return <p className="empty-note">couldn't load the planner: {loadError}</p>;
  if (!planner) return <p className="empty-note">opening the notebook…</p>;

  return (
    <div className="app">
      <header className="topbar">
        <img src="/brand/chunk-history-horizontal.svg" alt="Chunk History" className="logo" />
        <nav>
          <button className="tab active">Calendar</button>
          <button className="tab" disabled title="Step 2">Pipeline</button>
          <button className="tab" disabled title="Step 5">Ideas</button>
        </nav>
        <span className={`save-state ${saveState}`}>
          {saveState === 'saved' ? 'SAVED' : saveState === 'saving' ? 'SAVING…' : 'NOT SAVED'}
        </span>
      </header>
      <main className="layout">
        <Calendar planner={planner} update={update} />
        <Sidebar planner={planner} />
      </main>
    </div>
  );
}
