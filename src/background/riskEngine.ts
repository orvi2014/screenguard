/**
 * The background-side facade over the risk modules.
 * Everything the worker needs to reach a verdict lives behind these two calls,
 * which makes swapping the local classifier for a remote reputation service a
 * one-file change.
 */
export { classifyUrl } from '../risk/riskClassifier';
export { evaluateUrl, isScreenShareOn } from '../risk/policy';
export { evaluateUrlWithReputation } from '../risk/reputationPolicy';
export type { Verdict } from '../shared/types';
