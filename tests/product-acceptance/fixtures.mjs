// Original deterministic test inputs. They enter the production source pipeline unchanged.
import {deflateSync} from 'node:zlib';import {crc32} from './readback.mjs';import {sha256} from './artifact.mjs';
export const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path fill="#0099cc" fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/><path fill="#ee7733" d="M10 0H20V10H10Z"/></svg>');
export const vietnameseNFD='Việt Nam'.normalize('NFD');
function chunk(type,data){const t=Buffer.from(type),b=Buffer.alloc(12+data.length);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length);return b;}
export function png(){
 const w=32,h=16,ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
 const rows=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*(w*4+1)+1+x*4;const c=x<16?[0,153,204,255]:[238,119,51,255];if(x>=5&&x<10&&y>=5&&y<10)c[3]=0;for(let k=0;k<4;k++)rows[p+k]=c[k];}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export function syntheticProfile(){
 const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 const payload={schemaVersion:1,id:'acceptance-local-profile',label:'Synthetic local profile (not vendor/fit qualified)',adapterId:'export.3mf.bambu-project',
  slicer:{id:'BambuStudio',version:'02.08.02.60'},printer:{model:'Bambu Lab P1S',nozzleDiametersMm:[0.4],slotExtruders:[1],bedPolygonMm:[[0,0],[256,0],[256,256],[0,256]],maxZMm:256},
  settings:{printer_model:'Bambu Lab P1S',version:'02.08.02.60',nozzle_diameter:['0.4'],single_extruder_multi_material:'1',filament_colour:['#AABBCC'],filament_type:['PLA'],filament_diameter:['1.75']},
  source:{id:'synthetic-local-input',sha256:sha256(Buffer.from('Synthetic; no vendor or fit qualification.'))},rights:'internal-testing'};
 const record={payload,sha256:sha256(Buffer.from(canonical(payload)))},raw=Buffer.from(JSON.stringify(record,null,3)+'\r\n');
 return {record,raw,source:{profileHash:record.sha256,sha256:sha256(raw),filename:'synthetic-profile.json',byteLength:raw.length,encoding:'base64',data:raw.toString('base64')}};
}
