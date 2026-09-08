import assert from 'node:assert/strict';
import {join,basename,dirname,resolve} from 'node:path';
const quote=value=>"'"+value.replaceAll("'","''")+"'";
export function cliCommand(cli,action){
  const run=process.env.PROJECT_REVIEW_RUN,root=process.env.PROJECT_ROOT;
  assert.ok(run&&root,'dot-source project-env before running CLI tests');
  const runId=basename(run),seat=basename(dirname(dirname(run)));
  assert.match(runId,/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
  assert.ok(['codex','opus','grok'].includes(seat));
  assert.equal(resolve(run),resolve(root,'tmp','reviews',seat,'runs',runId),'CLI tests must stay in the caller room');
  return '. '+quote(join(root,'tools','project-env.ps1'))+' -Seat '+quote(seat)+' -RunId '+quote(runId)+'; & '+quote(process.execPath)+' '+quote(cli)+' '+quote(action)+'; exit $LASTEXITCODE';
}
