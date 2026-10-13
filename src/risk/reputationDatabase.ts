import type { RiskCategory } from '../shared/types';
import { getHostname } from '../shared/utils';

type Category = Extract<RiskCategory, 'ADULT' | 'GAMBLING'>;

let database: Map<string, Category> | null = null;
let loading: Promise<Map<string, Category>> | null = null;

/**
 * Loads ScreenGuard's packaged category data. This is an extension resource,
 * not a network request: neither URLs nor page content leave the browser.
 */
async function load(): Promise<Map<string, Category>> {
  if (database) return database;
  if (loading) return loading;
  loading = (async () => {
    const url = chrome.runtime.getURL('reputation/categories.tsv.gz');
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error('Could not load local reputation data');
    const text = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
    const records = new Map<string, Category>();
    for (const line of text.split('\n')) {
      const [domain, category] = line.split('\t');
      if (domain && (category === 'ADULT' || category === 'GAMBLING')) records.set(domain, category);
    }
    database = records;
    return records;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Returns a category for the hostname or any parent domain in the local feed. */
export async function lookupReputation(url: string): Promise<Category | null> {
  const host = getHostname(url);
  if (!host) return null;
  const records = await load();
  let candidate = host;
  while (candidate.includes('.')) {
    const category = records.get(candidate);
    if (category) return category;
    candidate = candidate.slice(candidate.indexOf('.') + 1);
  }
  return records.get(candidate) ?? null;
}

export function clearReputationDatabaseForTests(): void {
  database = null;
  loading = null;
}
