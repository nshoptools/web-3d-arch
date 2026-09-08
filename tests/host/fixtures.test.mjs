import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers.mjs';
test('WEB-01 frozen synthetic build inputs match recorded bytes/SHA/MIME/routes',()=>{
  const expected=JSON.parse(readFileSync(new URL('./fixtures/host-v1.json',import.meta.url)));
  const f=fixture('input-verification');
  assert.equal(expected.fixtureVersion,1);
  assert.deepEqual(f.manifest.assets,expected.assets);
  assert.deepEqual(f.manifest.navigations,expected.navigations);
  assert.equal(expected.oracle.wasmResult,42);
});
