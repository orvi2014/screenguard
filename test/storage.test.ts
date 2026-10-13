import { check, describe, equal, group } from './harness';

/** A minimal in-memory chrome.storage so the real service can be exercised. */
const store: Record<string, unknown> = {};
let failReads = false;

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string) => {
        if (failReads) throw new Error('storage unavailable');
        return { [key]: store[key] };
      },
      set: async (obj: Record<string, unknown>) => Object.assign(store, obj),
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

const {
  mergeSettings, getSettings, saveSettings, addToList, removeFromList,
  addHistoryEntry, getHistory, clearHistory, getTodayStats, bumpStats,
} = await import('../src/storage/storageService');
const { DEFAULT_SETTINGS, HISTORY_LIMIT } = await import('../src/shared/constants');

describe('Settings survive corrupt or partial storage');
{
  equal('undefined falls back to defaults',
    mergeSettings(undefined).protectionEnabled, DEFAULT_SETTINGS.protectionEnabled);
  equal('null falls back to defaults', mergeSettings(null).warnBeforeRisky, true);
  equal('a string instead of an object does not crash',
    mergeSettings('nonsense' as unknown).protectionEnabled, true);
  equal('a missing allowlist becomes an array', mergeSettings({}).allowlist.length, 0);
  equal('a non-array allowlist is discarded',
    mergeSettings({ allowlist: 'oops' as unknown as string[] }).allowlist.length, 0);
  equal('a partial category map is filled in',
    mergeSettings({ categories: { adult: false } as never }).categories.gambling, true);
  equal('an explicit false is preserved',
    mergeSettings({ categories: { adult: false } as never }).categories.adult, false);
  equal('unknown keys do not remove known ones',
    mergeSettings({ nonsense: 1 } as never).protectionEnabled, true);
  group('a corrupt settings blob can never brick the extension', 8);
}

describe('A failing storage read degrades gracefully');
{
  failReads = true;
  const settings = await getSettings();
  equal('defaults are returned instead of throwing', settings.protectionEnabled, true);
  failReads = false;
  group('reads never reject', 1);
}

describe('Allow and block lists');
{
  await saveSettings({ allowlist: [], blocklist: [] });
  await addToList('allowlist', 'example.com');
  await addToList('allowlist', 'example.com');
  equal('adding twice does not duplicate', (await getSettings()).allowlist.length, 1);

  await addToList('blocklist', 'example.com');
  const s = await getSettings();
  equal('moving to the blocklist removes it from the allowlist', s.allowlist.length, 0);
  equal('and adds it to the blocklist', s.blocklist[0], 'example.com');

  await removeFromList('blocklist', 'example.com');
  equal('removal works', (await getSettings()).blocklist.length, 0);
  await removeFromList('blocklist', 'not-there.com');
  equal('removing something absent is harmless', (await getSettings()).blocklist.length, 0);
  group('a domain can never sit on both lists at once', 5);
}

describe('Concurrent settings and list writes');
{
  await saveSettings({
    categories: { ...DEFAULT_SETTINGS.categories }, allowlist: [], blocklist: [],
  });
  await Promise.all([
    saveSettings({ categories: { adult: false } as never }),
    saveSettings({ categories: { gambling: false } as never }),
    addToList('allowlist', 'first.example'),
    addToList('allowlist', 'second.example'),
  ]);
  const settings = await getSettings();
  equal('both category changes survive', settings.categories.adult, false);
  equal('independent category change survives', settings.categories.gambling, false);
  check('both list additions survive', settings.allowlist.includes('first.example') && settings.allowlist.includes('second.example'));
  group('queued writes preserve independent changes', 3);
}

describe('Protection history');
{
  await clearHistory();
  for (let i = 0; i < HISTORY_LIMIT + 25; i++) {
    await addHistoryEntry({
      url: `https://site${i}.example/`, domain: `site${i}.example`, action: 'blocked',
      level: 'RISKY', category: 'ADULT', reason: 'test',
    });
  }
  const history = await getHistory();
  equal('history is capped', history.length, HISTORY_LIMIT);
  equal('newest entry is first', history[0].domain, `site${HISTORY_LIMIT + 24}.example`);
  check('every entry has an id', history.every((e) => !!e.id));
  check('ids are unique', new Set(history.map((e) => e.id)).size === history.length);
  check('timestamps are present', history.every((e) => e.ts > 0));

  await clearHistory();
  equal('clearing empties it', (await getHistory()).length, 0);
  group('history is bounded, ordered and clearable', 6);
}

describe('Daily counters');
{
  const start = await getTodayStats();
  await bumpStats({ blocked: 1 });
  await bumpStats({ blocked: 2, linksChecked: 10 });
  const now = await getTodayStats();
  equal('blocked accumulates', now.blocked, start.blocked + 3);
  equal('links accumulate', now.linksChecked, start.linksChecked + 10);
  equal('untouched counters stay put', now.warned, start.warned);

  // A stored blob from a previous day must not leak into today.
  store['sg:stats'] = { day: '2000-01-01', linksChecked: 999, blocked: 999, warned: 999 };
  equal('yesterday\'s counters reset', (await getTodayStats()).blocked, 0);
  group('counters roll over at midnight', 4);
}

describe('Concurrent telemetry writes');
{
  await clearHistory();
  await Promise.all([
    addHistoryEntry({ url: 'https://one.example', domain: 'one.example', action: 'blocked', level: 'RISKY', category: 'ADULT', reason: 'test' }),
    addHistoryEntry({ url: 'https://two.example', domain: 'two.example', action: 'blocked', level: 'RISKY', category: 'ADULT', reason: 'test' }),
  ]);
  equal('simultaneous history events are retained', (await getHistory()).length, 2);
  const before = await getTodayStats();
  await Promise.all([bumpStats({ warned: 1 }), bumpStats({ warned: 1 })]);
  equal('simultaneous counter updates accumulate', (await getTodayStats()).warned, before.warned + 2);
  group('history and counters are serialized', 2);
}

describe('First-run initialisation does not clobber concurrent writes');
{
  delete store['sg:settings'];
  const { ensureSettingsInitialised } = await import('../src/storage/storageService');

  const fresh = await ensureSettingsInitialised();
  equal('defaults are written when nothing is stored', fresh.protectionEnabled, true);

  // Simulate the onboarding tab saving a choice while the worker starts up.
  await saveSettings({ sensitiveMode: 'always', onboardingComplete: true });
  await ensureSettingsInitialised();
  const after = await getSettings();
  equal('a concurrent change survives re-initialisation', after.sensitiveMode, 'always');
  equal('and so does the onboarding flag', after.onboardingComplete, true);
  group('installing never overwrites settings that already exist', 3);
}
