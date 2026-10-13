import type { Message, Settings, Verdict } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { getSettings, onSettingsChanged } from '../storage/storageService';
import { evaluateClassification } from '../risk/policy';
import { classifyLinkContext } from '../risk/riskClassifier';

/**
 * Settings are read straight from chrome.storage in the content script and
 * classification runs locally, so hovering a link never costs a round-trip to
 * the service worker (or the network).
 */

let settings: Settings = DEFAULT_SETTINGS;
let ready = false;
const listeners = new Set<(s: Settings) => void>();

export async function initState(): Promise<Settings> {
  settings = await getSettings();
  ready = true;
  onSettingsChanged((s) => {
    settings = s;
    listeners.forEach((fn) => fn(s));
  });
  return settings;
}

export function currentSettings(): Settings {
  return settings;
}

export function isReady(): boolean {
  return ready;
}

export function onSettings(fn: (s: Settings) => void): void {
  listeners.add(fn);
}

export function verdictFor(url: string, visibleText = ''): Verdict {
  return evaluateClassification(classifyLinkContext(url, visibleText), url, settings);
}

export function send(message: Message): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        // Reading lastError prevents "Unchecked runtime.lastError" noise when
        // the worker is asleep or the page is being torn down.
        void chrome.runtime.lastError;
        resolve(res);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/* Batched counter so we never write storage once per link. */
let pending = 0;
let timer: number | undefined;

export function countLinkChecked(n = 1): void {
  pending += n;
  if (timer !== undefined) return;
  timer = window.setTimeout(() => {
    const count = pending;
    pending = 0;
    timer = undefined;
    if (count > 0) void send({ type: 'LINKS_CHECKED', count });
  }, 4000);
}
