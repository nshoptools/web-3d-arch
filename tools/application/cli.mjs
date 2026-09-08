import {prepareApplication,verifyApplication,packageApplication} from './build.mjs';
import {need,safeCode} from './core.mjs';
try{
 const [action,...args]=process.argv.slice(2);let result;
 if(action==='prepare'){need(args.length===2,'CLI_ARGUMENTS');result=await prepareApplication(...args);}
 else if(action==='verify'){need(args.length===2,'CLI_ARGUMENTS');const {receipt,snapshot,...summary}=verifyApplication(...args);result=summary;}
 else if(action==='package'){need(args.length===3,'CLI_ARGUMENTS');result=await packageApplication(...args);}
 else need(false,'CLI_ACTION');
 console.log(JSON.stringify(result));
}catch(e){console.error(JSON.stringify({status:'failed',code:safeCode(e)}));process.exitCode=1;}
