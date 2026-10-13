import {
  domainMatches, getDomain, getHostname, isWebUrl, normaliseDomainInput,
  prettyUrl, relativeTime, safeUrl,
} from '../src/shared/utils';
import { check, describe, equal, group } from './harness';

describe('Domain parsing');
{
  equal('simple domain', getDomain('https://example.com/a'), 'example.com');
  equal('subdomain collapses', getDomain('https://a.b.example.com/'), 'example.com');
  equal('www is stripped', getDomain('https://www.example.com/'), 'example.com');
  equal('multi-part suffix kept whole', getDomain('https://bbc.co.uk/news'), 'bbc.co.uk');
  equal('subdomain on multi-part suffix', getDomain('https://news.bbc.co.uk/'), 'bbc.co.uk');
  equal('japanese suffix', getDomain('https://shop.rakuten.co.jp/'), 'rakuten.co.jp');
  equal('private public suffix keeps a hosted site distinct',
    getDomain('https://account.user.github.io/'), 'user.github.io');
  equal('port is ignored', getDomain('https://example.com:8443/'), 'example.com');
  equal('trailing dot is normalised', getHostname('https://example.com./'), 'example.com');
  equal('case is normalised', getHostname('https://EXAMPLE.com/'), 'example.com');
  equal('ip address is its own domain', getDomain('http://203.0.113.5/'), '203.0.113.5');
  group('domain parsing handles real-world shapes', 11);
}

describe('Domain matching');
{
  check('exact match', domainMatches('example.com', 'example.com'));
  check('subdomain match', domainMatches('a.example.com', 'example.com'));
  check('www match', domainMatches('www.example.com', 'example.com'));
  check('suffix trap rejected', !domainMatches('notexample.com', 'example.com'));
  check('a domain used as a prefix of another is rejected', !domainMatches('example.com.evil.test', 'example.com'));
  check('parent does not match child', !domainMatches('example.com', 'a.example.com'));
  group('matching never confuses a look-alike for the real domain', 6);
}

describe('URL guards');
{
  check('http is a web url', isWebUrl('http://example.com'));
  check('https is a web url', isWebUrl('https://example.com'));
  check('javascript is not', !isWebUrl('javascript:alert(1)'));
  check('data is not', !isWebUrl('data:text/html,x'));
  check('chrome is not', !isWebUrl('chrome://settings'));
  check('garbage is not', !isWebUrl('¯\\_(ツ)_/¯'));
  check('safeUrl returns null instead of throwing', safeUrl('nonsense') === null);
  group('only real web pages reach the risk engine', 7);
}

describe('Settings input');
{
  equal('bare domain', normaliseDomainInput('Example.COM'), 'example.com');
  equal('with scheme', normaliseDomainInput('https://example.com/page'), 'example.com');
  equal('with www', normaliseDomainInput('www.example.com'), 'example.com');
  equal('whitespace trimmed', normaliseDomainInput('  example.com  '), 'example.com');
  equal('rejects a bare word', normaliseDomainInput('example'), null);
  equal('rejects empty', normaliseDomainInput(''), null);
  equal('rejects a sentence', normaliseDomainInput('hello there'), null);
  group('the domain input field cannot store junk', 7);
}

describe('Display helpers');
{
  equal('short url unchanged', prettyUrl('https://example.com/'), 'example.com');
  check('long url truncated', prettyUrl('https://example.com/' + 'a'.repeat(200)).length <= 64);
  check('never throws on junk', typeof prettyUrl('nonsense') === 'string');
  equal('just now', relativeTime(Date.now()), 'just now');
  equal('minutes', relativeTime(Date.now() - 5 * 60_000), '5 minutes ago');
  equal('one hour', relativeTime(Date.now() - 60 * 60_000), '1 hour ago');
  equal('days', relativeTime(Date.now() - 3 * 86_400_000), '3 days ago');
  group('display helpers are safe and readable', 7);
}
