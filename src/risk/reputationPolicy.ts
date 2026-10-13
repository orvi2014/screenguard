import type { RiskResult, Settings, Verdict } from '../shared/types';
import { getDomain } from '../shared/utils';
import { evaluateClassification, evaluateUrl } from './policy';
import { lookupReputation } from './reputationDatabase';

/**
 * The asynchronous, full-dataset verdict used by the service worker. The
 * content script retains the small synchronous heuristic for hover feedback;
 * navigation protection uses this exact local database before it permits a
 * long-tail adult or gambling page to remain open.
 */
export async function evaluateUrlWithReputation(url: string, settings: Settings): Promise<Verdict> {
  const heuristic = evaluateUrl(url, settings);
  if (heuristic.enforcement !== 'allow') return heuristic;

  const category = await lookupReputation(url);
  if (!category) return heuristic;

  const domain = getDomain(url);
  const result: RiskResult = {
    level: 'RISKY',
    category,
    confidence: 0.96,
    reason: `${domain} matches ScreenGuard's local ${category.toLowerCase()} category data`,
    domain,
  };
  return evaluateClassification(result, url, settings);
}
