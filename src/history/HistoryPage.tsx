import { useEffect, useMemo, useState } from 'react';
import type { HistoryAction, HistoryEntry } from '../shared/types';
import { CATEGORY_LABELS } from '../shared/constants';
import { relativeTime } from '../shared/utils';
import { clearHistory, getHistory } from '../storage/storageService';
import { Shield } from '../ui/Shield';
import { TrashIcon } from '../ui/icons';

const TONE: Record<HistoryAction, 'risk' | 'warn' | 'safe'> = {
  blocked: 'risk',
  warned: 'warn',
  allowed: 'safe',
};

const LABEL: Record<HistoryAction, string> = {
  blocked: 'Blocked',
  warned: 'Warned',
  allowed: 'Allowed',
};

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [filter, setFilter] = useState<'all' | HistoryAction>('all');

  useEffect(() => {
    getHistory().then(setEntries).catch(() => setEntries([]));
  }, []);

  const groups = useMemo(() => {
    const list = (entries ?? []).filter((e) => filter === 'all' || e.action === filter);
    const map = new Map<string, HistoryEntry[]>();
    for (const entry of list) {
      const key = dayLabel(entry.ts);
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()];
  }, [entries, filter]);

  const [confirming, setConfirming] = useState(false);

  // Clearing is irreversible and there is no undo, so it asks first.
  const onClear = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await clearHistory();
    setEntries([]);
    setConfirming(false);
  };

  return (
    <div className="page fade-in">
      <header className="page-header">
        <Shield size={24} tone="primary" filled />
        <div className="title">ScreenGuard</div>
        <div className="spacer" />
        <a className="btn quiet" href={chrome.runtime.getURL('settings.html')}>Settings</a>
      </header>

      <div className="row" style={{ marginBottom: 20, alignItems: 'flex-end' }}>
        <h1>Protection history</h1>
        <div className="spacer" />
        {(entries?.length ?? 0) > 0 && (
          <button
            className={confirming ? 'btn danger' : 'btn quiet'}
            onClick={onClear}
            onBlur={() => setConfirming(false)}
          >
            <TrashIcon size={15} />
            {confirming ? 'Clear everything?' : 'Clear history'}
          </button>
        )}
      </div>

      <p className="muted small" style={{ marginBottom: 20 }}>
        Stored on this device only. Clearing it here removes it for good.
      </p>

      <div className="row" style={{ gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['all', 'blocked', 'warned', 'allowed'] as const).map((key) => (
          <button
            key={key}
            className={`btn ${filter === key ? 'primary' : 'secondary'}`}
            style={{ padding: '6px 13px', fontSize: 13 }}
            onClick={() => setFilter(key)}
          >
            {key === 'all' ? 'Everything' : LABEL[key]}
          </button>
        ))}
      </div>

      {entries === null && <div className="card"><div className="list-empty">Loading…</div></div>}

      {entries !== null && groups.length === 0 && (
        <div className="card">
          <div className="list-empty">
            Nothing here yet — that’s a good sign.<br />
            <a href={chrome.runtime.getURL('demo.html')}>Try the demo page</a> to see ScreenGuard work.
          </div>
        </div>
      )}

      {groups.map(([day, items]) => (
        <section key={day} style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 10 }}>{day}</h3>
          <div className="card">
            {items.map((entry) => (
              <div className="history-row" key={entry.id}>
                <span className={`dot ${TONE[entry.action]}`} />
                <div style={{ minWidth: 0 }}>
                  <div className="history-head">
                    <span className="history-domain">{entry.domain || entry.url}</span>
                    <span className={`pill ${TONE[entry.action]}`}>{LABEL[entry.action]}</span>
                  </div>
                  <div className="history-why">
                    {entry.category === 'UNKNOWN'
                      ? entry.reason
                      : `${CATEGORY_LABELS[entry.category] ?? 'Checked'} · ${entry.reason}`}
                  </div>
                </div>
                <time className="history-time" dateTime={new Date(entry.ts).toISOString()}>
                  {relativeTime(entry.ts)}
                </time>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
