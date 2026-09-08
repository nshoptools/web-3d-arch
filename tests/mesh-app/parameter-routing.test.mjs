import test from 'node:test';import assert from 'node:assert/strict';import {createProductTransactions} from '../../src/integration/product-transactions.mjs';import {FIELD_SCHEMA} from '../../src/domain/index.mjs';
const transactions=createProductTransactions({sourceContexts:{prepareUpdate(){}},context:()=>({})}),state={content:{app:{source:{}}}};
test('mesh controls stage edits until explicit Apply; generated controls keep native transaction',()=>{
 const imported=FIELD_SCHEMA.filter(f=>f.group==='imported_mesh');assert.ok(imported.length>=10);
 for(const field of imported)for(const type of ['parameter.set','parameter.reset'])assert.equal(transactions.handles({state,command:{type,id:field.id}}),false,field.id);
 for(const type of ['parameter.set','parameter.reset'])assert.equal(transactions.handles({state,command:{type,id:'size'}}),true);
 assert.equal(transactions.handles({state,command:{type:'material.update'}}),true);
});
