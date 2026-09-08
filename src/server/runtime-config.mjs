import {exact,fail,integer} from './core.mjs';

export const DEFAULT_RUNTIME=Object.freeze({
 version:'arch-backend-runtime/1',
 maintenance:Object.freeze({enabled:true,intervalMs:300_000,batchRows:100,batchBytes:32*1024*1024,
  maxBatchesPerTurn:4,catchUpDelayMs:25,failureDelayMs:30_000,maxClockStepMs:300_000,maxLagMs:3_600_000}),
 shutdownGraceMs:10_000
});
export function validateRuntime(value={}) {
 exact(value,['version','maintenance','shutdownGraceMs'],[]);
 fail(value.version===undefined||value.version===DEFAULT_RUNTIME.version,400,'RUNTIME_CONFIG_VERSION');
 exact(value.maintenance??{},Object.keys(DEFAULT_RUNTIME.maintenance),[]);
 const m={...DEFAULT_RUNTIME.maintenance,...value.maintenance};
 fail(typeof m.enabled==='boolean',400,'RUNTIME_CONFIG_INVALID');
 for(const [k,min,max] of [
  ['intervalMs',1000,86_400_000],['batchRows',1,500],['batchBytes',16*1024*1024,64*1024*1024],
  ['maxBatchesPerTurn',1,16],['catchUpDelayMs',1,10_000],['failureDelayMs',1000,3_600_000],
  ['maxClockStepMs',1000,3_600_000],['maxLagMs',1000,604_800_000]
 ])integer(m[k],max,min);
 fail(m.maxLagMs>=m.intervalMs,400,'RUNTIME_LAG_BELOW_INTERVAL');
 const shutdownGraceMs=value.shutdownGraceMs??DEFAULT_RUNTIME.shutdownGraceMs;
 integer(shutdownGraceMs,60_000,100);
 return Object.freeze({version:DEFAULT_RUNTIME.version,maintenance:Object.freeze(m),shutdownGraceMs});
}
