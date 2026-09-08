import test from 'node:test';
import {checks} from './suite.mjs';
for (const check of checks) test(check.name, {timeout: 30000}, check.run);
