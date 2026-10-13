/** Entry point — imports every suite, then prints one summary. */
import './utils.test';
import './classifier.test';
import './policy.test';
import './dnr.test';
import './patterns.test';
import './storage.test';
import './performance.test';
import './contrast.test';
import { report } from './harness';

await import('./bypass.test');
report();
