import test from 'node:test';import assert from 'node:assert/strict';
import {encodeFinalExportOptions} from '../runtime-helper.mjs';import {configuration,pack} from './options.mjs';
test('AFEX helper matches the independent wire fixture, preserving source identity and bigint revision',()=>{
 const c=configuration(12,{format:2,revision:'18446744073709551615',expectedRevision:'18446744073709551615'});const before=structuredClone(c);
 assert.deepEqual(encodeFinalExportOptions(c),pack(c));assert.deepEqual(c,before);
});
test('trusted gate/verdict inputs are mandatory, not fabricated by helper defaults',()=>{for(const key of ['gates','verdict','generation','revision','expectedRevision']){const c=configuration(1);delete c[key];assert.throws(()=>encodeFinalExportOptions(c),/REQUIRED/);}});
test('no fractional-u32 cast, unsafe revision number, or NaN matrix',()=>{
 const a=configuration(1);a.mapping[0].slot=1.9;assert.throws(()=>encodeFinalExportOptions(a),/U32/);
 const b=configuration(1,{revision:9007199254740992});assert.throws(()=>encodeFinalExportOptions(b),/REVISION/);
 const c=configuration(1);c.matrix[0]=NaN;assert.throws(()=>encodeFinalExportOptions(c),/F64/);
});
test('UTF-8 user filename and material-source IDs retained byte for byte',()=>{
 const c=configuration(1,{filename:'Tiếng Việt / mặt sau'}),wire=encodeFinalExportOptions(c),d=new DataView(wire.buffer);
 assert.equal(new TextDecoder().decode(wire.subarray(256+24*c.mapping.length)),c.filename);assert.equal(d.getUint32(272,true),900);
});
