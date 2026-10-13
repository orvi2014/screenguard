/** A tiny assertion harness — no test framework, no extra dependencies. */

let passed = 0;
const failures: string[] = [];
let suite = '';

export function describe(name: string): void {
  suite = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

export function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
  } else {
    failures.push(`${suite} › ${label}${detail ? `\n    ${detail}` : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

export function equal(label: string, actual: unknown, expected: unknown): void {
  check(label, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

export function group(label: string, count: number): void {
  console.log(`  \x1b[32m✓\x1b[0m ${label} \x1b[2m(${count})\x1b[0m`);
}

export function report(): void {
  console.log(`\n${'─'.repeat(58)}`);
  if (failures.length === 0) {
    console.log(`\x1b[32m✓ ${passed} assertions passed\x1b[0m`);
    process.exit(0);
  }
  console.log(`\x1b[31m✗ ${failures.length} failed\x1b[0m, ${passed} passed\n`);
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
