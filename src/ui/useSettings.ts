import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { getSettings, onSettingsChanged, saveSettings } from '../storage/storageService';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    const off = onSettingsChanged((s) => alive && setSettings(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch })); // optimistic, keeps toggles instant
    try {
      const next = await saveSettings(patch);
      setSettings(next);
    } catch {
      const fresh = await getSettings();
      setSettings(fresh);
    }
  }, []);

  return { settings, update, loading };
}
