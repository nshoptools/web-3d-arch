import {realpath,lstat,access,readFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,relative,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export function check(ok,code){if(!ok)throw Object.assign(new Error(code),{code});}
export function parseArgs(argv=process.argv.slice(2),allowed=['run-id']){
 const values={};for(let i=0;i<argv.length;i+=2){const key=argv[i]?.replace(/^--/,'');check(argv[i]?.startsWith('--')&&allowed.includes(key)&&!Object.hasOwn(values,key)&&typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'RUNNER_ARGUMENT');values[key]=argv[i+1];}
 check(typeof values['run-id']==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(values['run-id']),'RUN_ID_REQUIRED');return values;
}
export async function discoverRepo(start){
 start=await realpath(start);
 try{
  const output=execFileSync('git',['-C',start,'rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
  const root=await realpath(output);await access(join(root,'tools/project-env.ps1'));return root;
 }catch{}
 // Exported source trees can locate the actual environment script. Nested AGENTS.md is not a root marker.
 let dir=start;for(;;){try{await access(join(dir,'tools/project-env.ps1'));await access(join(dir,'tools/development/env.ps1'));return await realpath(dir);}catch{}
  const parent=dirname(dir);check(parent!==dir,'REPO_ROOT_NOT_FOUND');dir=parent;
 }
}
export async function ownPath(base,path){
 base=await realpath(base);path=resolve(path);
 check(path.startsWith(base+sep),'PATH_OUTSIDE_ROOT');
 const segments=relative(base,path).split(sep);let cursor=base;
 for(const part of segments){cursor=join(cursor,part);try{check(!(await lstat(cursor)).isSymbolicLink(),'LINKED_PATH');check((await realpath(cursor)).startsWith(base+sep),'RESOLVED_PATH_OUTSIDE_ROOT');}catch(e){if(e.code==='ENOENT')break;throw e;}}
 return path;
}
export async function loadContext(runId,{start,env=process.env}){
 check(typeof runId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId),'RUN_ID_REQUIRED');
 const root=await discoverRepo(start);check(env.PROJECT_ROOT&&env.PROJECT_REVIEW_RUN,'PROJECT_ENV_REQUIRED');
 check(await realpath(env.PROJECT_ROOT)===root,'ENV_ROOT_MISMATCH');
 const expectedRun=resolve(env.PROJECT_REVIEW_RUN),parts=relative(root,expectedRun).split(sep);
 check(parts.length===5&&parts[0]==='tmp'&&parts[1]==='reviews'&&['codex','opus','grok'].includes(parts[2])&&parts[3]==='runs'&&parts[4]===runId,'RUN_SCOPE_MISMATCH');
 await ownPath(root,expectedRun);const run=await realpath(expectedRun);
 for(const name of ['TEMP','TMP','TMPDIR'])check(env[name]&&resolve(env[name]).startsWith(run+sep),'TEMP_SCOPE_MISMATCH');
 return {root,run,runId,seat:parts[2]};
}
export async function loadStage(runtime,context){
 runtime=await ownPath(context.run,runtime);runtime=await realpath(runtime);
 check(relative(context.run,runtime).split(sep).slice(0,2).join('/')==='work/app-controller-tests','STAGE_SCOPE');
 const stage=JSON.parse(await readFile(join(runtime,'stage.json'),'utf8'));
 check(stage.kind==='arch-app-test-stage'&&stage.version===2&&stage.runId===context.runId&&stage.repoRoot===context.root&&stage.runtime===runtime,'STAGE_CONTEXT');
 check(/^[0-9]+-[a-f0-9-]{36}$/.test(stage.stageId),'STAGE_ID');
 for(const k of ['evidenceDirectory','temporaryDirectory'])await ownPath(context.run,stage[k]);
 return stage;
}

/** Test profiles only. Keep the deep evidence/staging tree out of Chromium's LevelDB path. */
export function chromiumProfileBudget(profile,origin,{platform=process.platform}={}){
 const u=new URL(origin);check(u.protocol==='https:'&&u.hostname==='127.0.0.1'&&u.origin===origin&&u.port,'PROFILE_LOOPBACK_ORIGIN');
 const manifestPath=join(profile,'Default','IndexedDB','https_127.0.0.1_'+u.port+'.indexeddb.leveldb','MANIFEST-000001');
 const manifestLength=manifestPath.length,limit=240; // 20 chars below the observed 260-char failure.
 check(platform!=='win32'||manifestLength<=limit,'PROFILE_PATH_BUDGET');
 return {absoluteLength:profile.length,estimatedLevelDBManifestLength:manifestLength,windowsManifestBudget:limit};
}
export async function allocateBrowserProfile({run},stage,browser,origin){
 check(['chromium','firefox','webkit'].includes(browser),'BROWSER_SELECTION');
 check(/^[0-9]+-[a-f0-9-]{36}$/.test(stage.stageId)&&Array.isArray(stage.files),'PROFILE_STAGE');
 const digest=createHash('sha256').update(JSON.stringify([stage.stageId,stage.files.map(f=>[f.path,f.sha256])])).digest('hex').slice(0,16);
 const parent=await ownPath(run,join(run,'p')),prefix=await ownPath(run,join(parent,digest+'-'+{chromium:'c',firefox:'f',webkit:'w'}[browser]+'-'));
 // mkdtemp adds exactly six characters; reject an impossible repo/run placement before allocating.
 if(browser==='chromium')chromiumProfileBudget(prefix+'xxxxxx',origin);
 await mkdir(parent,{recursive:true});const path=await mkdtemp(prefix);await ownPath(run,path);
 const budget=browser==='chromium'?chromiumProfileBudget(path,origin):{absoluteLength:path.length};
 return {path,relativePath:relative(run,path).replaceAll('\\','/'),stageDigest:digest,...budget};
}
