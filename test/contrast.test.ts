import { readFileSync } from 'node:fs';
import { check, describe, group } from './harness';

/**
 * Reads the real stylesheet rather than a copy of the values, so this suite
 * fails if someone lightens a token in theme.css without rechecking it.
 */
const css = readFileSync('src/ui/theme.css', 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --${name} not found in theme.css`);
  return match[1];
}

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const surface = token('sg-surface');
const surface2 = token('sg-surface-2');
const canvas = token('sg-canvas');

describe('Text contrast clears WCAG AA on every surface it is used on');
{
  const textTokens: Array<[string, string[]]> = [
    ['sg-text', [surface, surface2, canvas]],
    ['sg-text-2', [surface, surface2, canvas]],
    ['sg-muted', [surface, surface2, canvas]],
    ['sg-primary', [surface, surface2, canvas]],
  ];
  let ok = 0;
  for (const [name, backgrounds] of textTokens) {
    for (const bg of backgrounds) {
      const ratio = contrast(token(name), bg);
      const pass = ratio >= 4.5;
      check(`--${name} on ${bg} = ${ratio.toFixed(2)}`, pass, pass ? '' : 'needs 4.5:1');
      if (pass) ok++;
    }
  }
  if (ok === 12) group('body and secondary text are readable everywhere', 12);
}

describe('Status colours are readable on white and on their own pill');
{
  const pairs: Array<[string, string]> = [
    ['sg-safe', 'sg-safe-soft'],
    ['sg-warn', 'sg-warn-soft'],
    ['sg-risk', 'sg-risk-soft'],
  ];
  let ok = 0;
  for (const [fg, soft] of pairs) {
    for (const bg of [surface, token(soft)]) {
      const ratio = contrast(token(fg), bg);
      const pass = ratio >= 4.5;
      check(`--${fg} on ${bg} = ${ratio.toFixed(2)}`, pass, pass ? '' : 'needs 4.5:1');
      if (pass) ok++;
    }
  }
  if (ok === 6) group('safe, warning and risk text pass on both grounds', 6);
}

describe('Controls are distinguishable from their background');
{
  // WCAG 1.4.11: anything that identifies a control needs 3:1.
  for (const bg of [surface, canvas]) {
    const ratio = contrast(token('sg-control'), bg);
    check(`--sg-control on ${bg} = ${ratio.toFixed(2)}`, ratio >= 3, 'needs 3:1');
  }
  const onPrimary = contrast('#ffffff', token('sg-primary'));
  check(`white on --sg-primary = ${onPrimary.toFixed(2)}`, onPrimary >= 4.5);
  const focus = contrast(token('sg-primary'), surface);
  check(`focus ring on ${surface} = ${focus.toFixed(2)}`, focus >= 3);
  group('inputs, switches and focus rings are visible', 4);
}

describe('Motion and layering are tokenised, not hard-coded');
{
  check('a shared easing curve exists', css.includes('--sg-ease:'));
  check('durations are tokenised', css.includes('--sg-fast:') && css.includes('--sg-base:'));
  check('a z-index scale is defined', css.includes('--sg-z-overlay:'));
  check('reduced motion is honoured', css.includes('prefers-reduced-motion'));
  group('the system owns motion, not individual components', 4);
}
