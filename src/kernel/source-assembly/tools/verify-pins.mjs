import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.env.PROJECT_ROOT,room=process.env.PROJECT_REVIEW_RUN;
assert.ok(room&&root&&fs.realpathSync(room).startsWith(fs.realpathSync(root)+path.sep),'Project environment required');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
const lock=JSON.parse(fs.readFileSync(path.join(root,'docs/development/toolchain-lock.json'),'utf8'));
const base=path.join(root,'.toolchain/clipper2-derived'),rows=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){assert.ok(!ent.isSymbolicLink());const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else rows.push(path.relative(base,p).replaceAll('\\','/')+':'+sha(p));}}
walk(base);rows.sort();const tree=createHash('sha256').update(rows.join('\n')+'\n').digest('hex').toUpperCase();
assert.equal(tree,lock.clipper2.derivedTreeSha256);
assert.equal(sha(path.join(root,`.toolchain/archives/clipper2-${lock.clipper2.revision}.tar.gz`)),lock.clipper2.archiveSha256);
assert.equal(sha(path.join(root,'docs/licenses/kernel/clipper2-no-iostream.patch')),lock.clipper2.patchSha256);
console.log('Pinned Clipper2 original archive / derived tree verified; downloads OFF');
