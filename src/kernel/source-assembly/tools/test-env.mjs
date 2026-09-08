import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export const root=fs.realpathSync(process.env.PROJECT_ROOT??'');
export const room=fs.realpathSync(process.env.PROJECT_REVIEW_RUN??'');
assert.ok(room.startsWith(root+path.sep),'Test room must be inside project');
assert.ok(fs.existsSync(path.join(root,'tools/project-env.ps1')),'Project environment required');
const id=process.env.ARCH_SOURCE_TEST_ID;
assert.match(id??'',/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/,'ARCH_SOURCE_TEST_ID required');
export const evidence=path.join(room,'evidence/source-assembly',id);
for(let dir=evidence;dir!==root;dir=path.dirname(dir)){
  assert.ok(dir!==path.dirname(dir),'Test path escaped project');
  if(fs.existsSync(dir))assert.ok(!fs.lstatSync(dir).isSymbolicLink(),'Test path has a link');
}
fs.mkdirSync(evidence,{recursive:true});
