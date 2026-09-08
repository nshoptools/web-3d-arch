import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {dirname,sep} from 'node:path';
import {X509Certificate,createHash} from 'node:crypto';
function need(ok,code){if(!ok)throw Object.assign(Error(code),{code});}
/** Tests only: authorize exactly this run's generated synthetic certificate key, never all HTTPS. */
export function syntheticChromiumTLSOptions(certificatePath,{runDirectory=process.env.PROJECT_REVIEW_RUN}={}){
 need(typeof runDirectory==='string'&&typeof certificatePath==='string','SYNTHETIC_TLS_PATH');
 const run=realpathSync(runDirectory),path=realpathSync(certificatePath);
 need(path.startsWith(run+sep),'SYNTHETIC_TLS_OUTSIDE_RUN');
 for(let p=certificatePath;p!==run;p=dirname(p)){need(p.startsWith(run+sep),'SYNTHETIC_TLS_OUTSIDE_RUN');need(!lstatSync(p).isSymbolicLink(),'SYNTHETIC_TLS_LINK');}
 const stat=lstatSync(path);need(stat.isFile()&&stat.size<=32768,'SYNTHETIC_TLS_BUDGET');
 const bytes=readFileSync(path),pem=bytes.toString('ascii');
 need((pem.match(/-----BEGIN CERTIFICATE-----/g)??[]).length===1&&!pem.includes('PRIVATE KEY'),'SYNTHETIC_TLS_PEM');
 const cert=new X509Certificate(bytes);
 need(!cert.ca&&cert.subject.includes('O=web-3d-arch synthetic host test')&&cert.checkHost('localhost')&&cert.checkIP('127.0.0.1'),'SYNTHETIC_TLS_IDENTITY');
 const now=Date.now();need(Date.parse(cert.validFrom)<=now&&Date.parse(cert.validTo)>now&&Date.parse(cert.validTo)-Date.parse(cert.validFrom)<=8*86400000,'SYNTHETIC_TLS_TIME');
 const spki=createHash('sha256').update(cert.publicKey.export({format:'der',type:'spki'})).digest('base64');
 return {ignoreHTTPSErrors:false,args:['--ignore-certificate-errors-spki-list='+spki]};
}
