import { classifyUrl, clearClassifierCache } from '../src/risk/riskClassifier';
import { findSensitiveRanges } from '../src/content/patterns';
import { check, describe, group } from './harness';

/**
 * The classifier runs on every link that scrolls into view, so it has to be
 * cheap enough that a page full of links costs nothing noticeable.
 */

describe('Classification speed');
{
  // Raw throughput: every URL distinct, so nothing is served from the cache.
  const urls = Array.from({ length: 5000 }, (_, i) =>
    `https://sub${i % 50}.example${i}.com/path/${i}?q=${i}`);

  clearClassifierCache();
  const coldStart = performance.now();
  for (const url of urls) classifyUrl(url);
  const cold = performance.now() - coldStart;
  const perUrl = (cold / urls.length) * 1000;

  // Cache benefit: a page that repeats the same links, kept under the cache
  // limit so the measurement is actually about caching.
  const repeated = urls.slice(0, 1000);
  clearClassifierCache();
  const firstStart = performance.now();
  for (const url of repeated) classifyUrl(url);
  const first = performance.now() - firstStart;
  const secondStart = performance.now();
  for (const url of repeated) classifyUrl(url);
  const second = performance.now() - secondStart;

  check(`5000 fresh URLs in ${cold.toFixed(0)}ms`, cold < 1000, `too slow: ${cold.toFixed(0)}ms`);
  check(`repeat lookups are served from cache (${first.toFixed(1)}ms → ${second.toFixed(1)}ms)`,
    second < first, `first=${first.toFixed(1)}ms second=${second.toFixed(1)}ms`);
  group(`5000 URLs in ${cold.toFixed(0)}ms — ${perUrl.toFixed(1)}µs each; repeats ${(first / Math.max(second, 0.001)).toFixed(0)}× faster from cache`, 2);
}

describe('Sensitive scanning speed');
{
  const paragraph =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Contact us on ' +
    '+1 415 555 0142 or team@example.com. Reference 2024 2025 and order 100200300. ';
  const page = paragraph.repeat(400); // ~60k characters, a very long article

  const start = performance.now();
  const ranges = findSensitiveRanges(page);
  const elapsed = performance.now() - start;

  check(`60k characters scanned in ${elapsed.toFixed(0)}ms`, elapsed < 500, `too slow: ${elapsed.toFixed(0)}ms`);
  check(`found ${ranges.length} values across the page`, ranges.length === 800, `got ${ranges.length}`);
  group(`60k characters scanned in ${elapsed.toFixed(0)}ms, ${ranges.length} values found`, 2);
}

describe('Pathological input does not hang the page');
{
  const nasty = [
    'a'.repeat(50_000),
    '1 '.repeat(20_000),
    ('sk_live_' + 'x'.repeat(200) + ' ').repeat(200),
    ('user@' + 'sub.'.repeat(200) + 'example.com ').repeat(50),
    '+'.repeat(20_000),
  ];
  const start = performance.now();
  for (const text of nasty) findSensitiveRanges(text);
  const elapsed = performance.now() - start;
  check(`5 pathological strings in ${elapsed.toFixed(0)}ms`, elapsed < 2000, `took ${elapsed.toFixed(0)}ms`);
  group(`5 pathological strings handled in ${elapsed.toFixed(0)}ms — no backtracking blowup`, 1);
}
