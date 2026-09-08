import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {zipSync} from 'fflate';
import {readZip,parseXml} from '../src/zip-inspect.mjs';
import {parseJson,sealed} from '../src/contracts.mjs';
import {validateProfile,validateMaterials,validateSchedule,normalizeSettings,layerZ,layerInterval} from '../src/profiles.mjs';
import {fixtureProfile,parseFixtureLiteral} from './profile-fixtures.mjs';
import {request} from './analytic-fixtures.mjs';
const repo=process.env.PROJECT_ROOT;
test('AT-013.2 profiles are JSON literals; JS/prototype keys do not execute',async()=>{
 const p=await fixtureProfile(repo,'u1');assert.equal(Object.keys(p.payload.settings).length,549);
 assert.throws(()=>parseFixtureLiteral('var MAU3MF_U1 = (()=>{throw 1})();','MAU3MF_U1'));
 assert.throws(()=>parseFixtureLiteral('var MAU3MF_U1 = {}; alert(1);','MAU3MF_U1'));
 assert.throws(()=>parseJson('{"__proto__":{"polluted":true}}'),/JSON_UNSAFE_KEY/);
 assert.equal({}.polluted,undefined);
});
test('GEO-02 .16/.20 versus .25/.20 and user override snapshot remains authoritative',async()=>{
 const p=await fixtureProfile(repo,'bambu'),a=await request(p,'cube',0.25),b=await request(p,'cube',0.16);
 const sa=await validateSchedule(a.schedule,p),sb=await validateSchedule(b.schedule,p);
 assert.equal(layerZ(12,sa),2.45);assert.equal(layerZ(12,sb),2.3600000000000003);
 assert.ok(Math.abs(layerInterval(1,12,sb)-2.2)<1e-12);
 assert.equal(p.payload.settings.initial_layer_print_height,'0.16');
 const bad=structuredClone(a.schedule);bad.payload.firstLayerHeight=.16;await assert.rejects(()=>validateSchedule(bad,p),/SNAPSHOT_HASH/);
 const adaptive=await sealed({...sa,kind:'adaptive'});await assert.rejects(()=>validateSchedule(adaptive,p),/UNSUPPORTED_SCHEDULE/);
});
test('OUT-01 slot, material count, physical head, version, nozzle and profile hashes gate output',async()=>{
 for(const kind of ['bambu','u1']){
  const p=await fixtureProfile(repo,kind);await validateProfile(p,p.payload.adapterId);
  const r=await request(p);validateMaterials(r.materialTable,p.payload);
  for(const materials of [[],Array.from({length:65},(_,i)=>({...r.materialTable.materials[0],id:String(i)}))])
   assert.throws(()=>validateMaterials({schemaVersion:1,materials},p.payload),/MATERIAL_COUNT/);
  const nozzle=structuredClone(p.payload);nozzle.printer.nozzleDiametersMm[0]=.6;
  await assert.rejects(()=>sealed(nozzle).then(x=>validateProfile(x,p.payload.adapterId)),/UNSUPPORTED_NOZZLE/);
  if(kind==='u1'){
   const mapping=structuredClone(p.payload);mapping.printer.slotExtruders=[1,1,3,4];
   await assert.rejects(()=>sealed(mapping).then(x=>validateProfile(x,p.payload.adapterId)),/U1_FOUR_HEAD_MAPPING/);
  }
  for(const [key,value,code] of [['slot',6,'MATERIAL_SLOT_MISMATCH'],['extruder',9,'MATERIAL_EXTRUDER_MISMATCH'],['color','#aabbcc00','MATERIAL_COLOR']]){
   const m=structuredClone(r.materialTable);m.materials[0][key]=value;assert.throws(()=>validateMaterials(m,p.payload),new RegExp(code));
  }
  const bad=await sealed({...p.payload,slicer:{...p.payload.slicer,version:'latest'}});
  await assert.rejects(()=>validateProfile(bad,p.payload.adapterId),/UNSUPPORTED_SLICER_VERSION/);
 }
});
test('normalization follows filament, extruder, matrix, multiple, fixed semantics',async()=>{
 const p=(await fixtureProfile(repo,'bambu')).payload;
 const keys=['filament_colour','filament_diameter','nozzle_diameter','printable_area','flush_volumes_matrix','flush_volumes_vector','nozzle_temperature','start_end_points'];
 const source=Object.fromEntries(keys.map(k=>[k,p.settings[k]]));
 const n=normalizeSettings(source,p.adapterId,[2,0],4,1);
 assert.deepEqual(n.settings.filament_colour,[source.filament_colour[2],source.filament_colour[0]]);
 assert.deepEqual(n.settings.nozzle_diameter,source.nozzle_diameter);
 assert.deepEqual(n.settings.printable_area,source.printable_area);
 assert.deepEqual(n.settings.start_end_points,source.start_end_points);
 assert.deepEqual(n.settings.flush_volumes_matrix,[source.flush_volumes_matrix[10],source.flush_volumes_matrix[8],source.flush_volumes_matrix[2],source.flush_volumes_matrix[0]]);
 assert.deepEqual(n.settings.flush_volumes_vector,[...source.flush_volumes_vector.slice(4,6),...source.flush_volumes_vector.slice(0,2)]);
 assert.deepEqual(n.settings.nozzle_temperature,[...source.nozzle_temperature.slice(4,6),...source.nozzle_temperature.slice(0,2)]);
 assert.throws(()=>normalizeSettings({...source,unclassified:['a','b','c','d']},p.adapterId,[2,0],4,1),/UNSUPPORTED_ARRAY_NORMALIZATION/);
 const m={schemaVersion:1,materials:[{id:'a',name:'a',slot:1,extruder:1,type:'PLA',color:'#FFFFFF'},{id:'alias',name:'alias',slot:1,extruder:1,type:'PLA',color:'#ffffff'}]};
 assert.equal(validateMaterials(m,p).materials.length,1);
 m.materials[1].color='#000000';assert.throws(()=>validateMaterials(m,p),/MATERIAL_SLOT_CONFLICT/);
});
test('SEC-01 unsafe ZIP paths, encryption, overlap, XML entities, expansion and corrupt CRC',()=>{
 const good=zipSync({'a.txt':new TextEncoder().encode('test')},{level:0});assert.equal(readZip(good).size,1);
 for(const name of ['../escape','/absolute','C:/x','a/../b','a\\b','a%2fb']){
  assert.throws(()=>readZip(zipSync({[name]:new Uint8Array([1])})),/ZIP_UNSAFE_PATH/);
 }
 const encrypted=good.slice();new DataView(encrypted.buffer).setUint16(6,1,true);
 assert.throws(()=>readZip(encrypted),/ZIP_LOCAL_MISMATCH/);
 const bad=good.slice();bad[35]^=1;assert.throws(()=>readZip(bad),/ZIP_CRC_OR_TOTAL/);
 const bomb=zipSync({'bomb':new Uint8Array(1000000)});assert.throws(()=>readZip(bomb),/ZIP_DECOMPRESS_BOUND/);
 const duplicate=zipSync({'A':new Uint8Array([1]),'a':new Uint8Array([2])});assert.throws(()=>readZip(duplicate),/ZIP_DUPLICATE_PATH/);
 assert.throws(()=>parseXml(new TextEncoder().encode('<!DOCTYPE model [<!ENTITY x SYSTEM "file:///secret">]><model>&x;</model>')),/XML_EXTERNAL_ENTITY/);
 assert.throws(()=>parseXml(new TextEncoder().encode('<root><bad></root>')),/XML_PARSE/);
});

test('material polymer and regular layer profile limits cannot be overridden by metadata',async()=>{
 const p=await fixtureProfile(repo,'bambu'),r=await request(p,'cube');
 r.materialTable.materials[0].type='PETG';assert.throws(()=>validateMaterials(r.materialTable,p.payload),/MATERIAL_PROFILE_MISMATCH/);
 const invalid=await sealed({...r.schedule.payload,layerHeight:0.35});
 await assert.rejects(()=>validateSchedule(invalid,p),/SCHEDULE_PROFILE_RANGE/);
});
