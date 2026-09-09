import test from 'node:test';import assert from 'node:assert/strict';
import {newDocument,contentEdit} from '../../src/app/documents.mjs';
import {previewProductCommand,slotForColour} from '../../src/integration/product-transactions.mjs';

// Codex, release round 3: changing the body colour was refused outright (PRODUCT_UPDATE_BINDINGS_BLOCKED /
// PRODUCT_SLOT_CONFLICT) because every other role — including roles of product types the project does
// not print — shares the body's logical slot and keeps the old colour. The preview now moves a
// recoloured material to the slot that already carries its new colour, else to the lowest free slot,
// the same rule the kernel uses when it assigns provisional slots; a slot given in the command is kept.
const material=(id,color,slot,role='other',extra={})=>({id,label:id,color,slot,role,overridden:false,backgroundEligible:false,excluded:false,...extra});
const materials=()=>[
 material('palette-1','#0099cc',null,'region'),
 material('palette-2','#ee7733',null,'region'),
 material('adopted:1','#0099cc',1,'region',{backgroundEligible:true}),
 material('adopted:2','#ee7733',2,'region',{backgroundEligible:true}),
 material('body','#30353b',3,'body'),
 material('artwork','#30353b',3),
 material('rim','#ffffff',4),
 material('skirt','#30353b',3),
 material('stem','#30353b',3,'stem'),
 material('tray','#30353b',3,'tray'),
 material('fastener','#30353b',3),
 material('text','#ffffff',4,'text'),
 material('textBase','#30353b',3,'textBase'),
];
async function state(){
 const {document}=await newDocument('keychain');
 return contentEdit(document.state,a=>{a.materials=materials();a.materialDefaults=materials();});
}
const after=(s,command)=>previewProductCommand(s,{type:'material.update',...command}).content.app.materials;
const slotOf=(list,id)=>list.find(m=>m.id===id).slot;

test('a recoloured material leaves a slot that other materials still hold in the old colour, to the lowest free slot',async()=>{
 const list=after(await state(),{id:'body',color:'#123456'});
 assert.equal(slotOf(list,'body'),5,'slots 1–4 are taken by other colours');
 assert.equal(list.find(m=>m.id==='body').color,'#123456');
 assert.equal(list.find(m=>m.id==='body').overridden,true);
 for(const id of ['artwork','skirt','stem','tray','fastener','textBase'])assert.equal(slotOf(list,id),3,'the others keep their slot and colour');
 // No slot in the whole table carries two colours afterwards.
 const colours=new Map();for(const m of list)if(m.slot!==null){colours.set(m.slot,(colours.get(m.slot)??new Set()).add(m.color));}
 assert.ok([...colours.values()].every(set=>set.size===1),JSON.stringify([...colours]));
});

test('a recoloured material joins the slot that already carries the new colour',async()=>{
 const list=after(await state(),{id:'body',color:'#ee7733'});
 assert.equal(slotOf(list,'body'),2,'same colour as adopted:2 → same filament');
 const rim=after(await state(),{id:'rim','color':'#000000'});
 assert.equal(slotOf(rim,'rim'),5,'text still holds slot 4 in white');assert.equal(slotOf(rim,'text'),4);
});

test('a material alone on its slot, or on a slot that already has its colour, keeps the slot',async()=>{
 const alone=after(await state(),{id:'adopted:1',color:'#ff0000'});
 assert.equal(slotOf(alone,'adopted:1'),1);
 const same=after(await state(),{id:'textBase',color:'#30353B'});
 assert.equal(slotOf(same,'textBase'),3,'case-insensitive: the slot already carries this colour');
});

test('a slot given in the same command is kept as given; excluded or slotless materials do not take slots',async()=>{
 const given=after(await state(),{id:'body',color:'#123456',slot:3});
 assert.equal(slotOf(given,'body'),3,'the person chose the slot; the kernel reports the conflict, the preview does not override');
 const s=await state();
 const list=after(contentEdit(s,a=>{for(const m of a.materials)if(['rim','text'].includes(m.id))m.slot=null;}),{id:'body',color:'#123456'});
 assert.equal(slotOf(list,'body'),4,'slot 4 is free once rim and text carry no slot');
 const full=Array.from({length:16},(_,i)=>material('m'+i,'#'+String(100000+i*7).slice(-6),i+1));
 assert.equal(slotForColour(full,{...full[0],color:'#abcdef'},'#abcdef'),1,'no free slot: the slot is kept and the kernel decides');
});
