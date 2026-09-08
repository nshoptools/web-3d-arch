import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnostic} from '../../src/app/common.mjs';
import {profile,rig,asFile} from './printer-fixtures.mjs';
import {sealed} from '../../src/printing/src/contracts.mjs';

test('public profile errors and row reasons are actionable Vietnamese without imported error bodies',async()=>{
 const secret='PRIVATE_IMPORTED_VALUE_MUST_NOT_RENDER';
 for(const code of ['PROFILE_ORIGINAL_INVALID','PROFILE_PROPOSAL_EXPIRED','PROFILE_SETTINGS_CHANGED','SETTINGS_CONFLICT','PROFILE_FILE_LIMIT','PROFILE_DUPLICATE_ID','UNSUPPORTED_SLICER_VERSION']){
  const d=diagnostic(Object.assign(new Error(secret),{code,details:{body:secret}}));
  assert.equal(d.code,code);assert.notEqual(d.message,code);assert.match(d.message,/[àáạảãâầấậẩẫăằắặẳẵđèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹ]/i);
  assert.ok(!JSON.stringify(d).includes(secret));assert.ok(d.message.length<=400);
 }
 const cancelled=diagnostic(new DOMException(secret,'AbortError'));assert.equal(cancelled.code,'CANCELLED');assert.match(cancelled.message,/hủy/);assert.ok(!cancelled.message.includes(secret));
 const r=rig();await assert.rejects(r.lib.prepare(asFile({},'invalid.json',new Uint8Array([255]))),{code:'PROFILE_FILE_ENCODING'});
 await assert.rejects(r.lib.prepare({name:'unreadable.json',size:1,arrayBuffer:async()=>{throw new Error(secret);}}),{code:'PROFILE_FILE_READ'});
 const p=await profile('same'),q=await profile('same',{label:'Duplicate'}),rr=rig({printerProfiles:[p,q]});await rr.lib.refresh();
 assert.match(rr.lib.snapshot().items[0].reason,/cùng ID/);assert.equal(rr.lib.snapshot().items[0].qualified,false);
});
test('valid slot arrays preserve explicit 1-based U1 head order; invalid rows never invent a complete join',async()=>{
 const base=(await profile()).payload;
 const p=await sealed({...base,id:'synthetic-u1',adapterId:'export.3mf.snapmaker-project',slicer:{id:'SnapmakerOrca',version:'2.2.1'},
  printer:{...base.printer,model:'Snapmaker U1',nozzleDiametersMm:[.4,.4,.4,.4],slotExtruders:[4,2,1,3]},
  settings:{...base.settings,printer_model:'Snapmaker U1',version:'2.2.1',nozzle_diameter:['.4','.4','.4','.4'],single_extruder_multi_material:'0',
   filament_colour:['#112233','#AABBCCFF','#445566','#778899'],filament_type:['PLA','PETG','ABS','TPU'],filament_diameter:['1.75','1.75','1.75','1.75']}});
 const bad=await sealed({...p.payload,id:'bad-u1',printer:{...p.payload.printer,slotExtruders:[0,2,1,3]},settings:{...p.payload.settings,filament_type:['PLA']}});
 const r=rig({printerProfiles:[p,bad]});await r.lib.refresh();const [valid,invalid]=r.lib.snapshot().items;
 assert.equal(valid.valid,true);assert.deepEqual(valid.slotExtruders,[4,2,1,3]);assert.deepEqual(valid.filamentTypes,['PLA','PETG','ABS','TPU']);assert.deepEqual(valid.nozzleDiametersMm,[.4,.4,.4,.4]);assert.equal(valid.filamentColors[1],'#AABBCCFF');
 assert.equal(valid.qualified,false);assert.equal(invalid.valid,false);assert.deepEqual(invalid.slotExtruders,[]);assert.equal(invalid.filamentTypes.length,1);
});
