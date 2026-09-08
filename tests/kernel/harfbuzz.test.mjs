import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFontSource} from '../../src/input/font-source.mjs';
import {createFontSourceWithHarfBuzz} from '../../src/input/font-source-core.mjs';
import * as unified from '../../src/input/harfbuzz-engine.mjs';

const modulePath=process.env.ARCH_WASM_MODULE,run=process.env.PROJECT_REVIEW_RUN;
if(!modulePath||!run)throw new Error('Project environment and ARCH_WASM_MODULE required.');
const engine=await (await import(pathToFileURL(modulePath).href)).default();
unified.initializeHarfBuzz(engine);
const catalogURL=new URL('../../src/assets/fonts/fonts-cat.json',import.meta.url);
const catalog=JSON.parse(await readFile(catalogURL,'utf8'));
const colorURL=new URL('../../src/assets/emoji/color/fonts-cat.json',import.meta.url);
const colors=JSON.parse(await readFile(colorURL,'utf8'));
const output=path.join(run,'evidence','unified-harfbuzz');await mkdir(output,{recursive:true});
async function pair(entry,base){
  const bytes=new Uint8Array(await readFile(new URL(entry.path,base)));
  return [await createFontSource(bytes,entry),await createFontSourceWithHarfBuzz(bytes,entry,unified)];
}
test('same linked HarfBuzz preserves validated Vietnamese shaping, kerning, outlines, clusters and variation extremes',async()=>{
  const entries=catalog;
  const observations=[];
  for(const entry of entries){
    assert.ok(entry);const [reference,actual]=await pair(entry,catalogURL);
    const variations=[{},Object.fromEntries(Object.entries(entry.axes).map(([tag,a])=>[tag,a.min])),Object.fromEntries(Object.entries(entry.axes).map(([tag,a])=>[tag,a.max]))];
    for(const text of ['Tiếng Việt Đặng Ắ ầ ễ ộ ớ ự ỹ 3D','Tiếng Việt'.normalize('NFD'),'office fi ffi AV'])for(const variation of variations){
      const expected=reference.shapeRun(text,{variations:variation}),result=actual.shapeRun(text,{variations:variation});
      assert.deepEqual(result,expected);observations.push({fontId:entry.id,text,variation,glyphs:result.glyphs.length});
    }
    for(const invalid of ['one\ntwo','\ud800','x\u202ey']){
      assert.throws(()=>reference.shapeRun(invalid));assert.throws(()=>actual.shapeRun(invalid));
    }
  }
  await writeFile(path.join(output,'shaping.json'),JSON.stringify({version:unified.versionString(),shared:engine.HEAPU8.buffer instanceof SharedArrayBuffer,observations,scope:'same pinned native revision, exact differential output including outlines'},null,2));
});
test('COLRv1 emoji preserves full sequence shaping and paint graph instead of substituting monochrome geometry',async()=>{
  const entry=colors.find(e=>e.id==='noto-colrv1');assert.ok(entry);
  const [reference,actual]=await pair(entry,colorURL);const observations=[];
  for(const text of ['😀','👩🏽‍💻','🇻🇳','❤️','🧑‍🦰']){
    const expected=reference.shapeRun(text),result=actual.shapeRun(text);assert.deepEqual(result,expected);
    for(const glyph of expected.glyphs){
      const paint=actual.colorPaint(glyph.glyphId),golden=reference.colorPaint(glyph.glyphId);
      assert.deepEqual(paint,golden);observations.push({text,glyphId:glyph.glyphId,operations:paint.operations.length,kinds:[...new Set(paint.operations.map(o=>o.op))]});
    }
  }
  await writeFile(path.join(output,'color.json'),JSON.stringify({observations,scope:'paint/clip/gradient/group/transform parity; not a color-to-material or mesh proof'},null,2));
});
test('font bindings follow shared-memory growth and geometry still publishes from the same allocator',async()=>{
  const before=engine.HEAPU8.buffer,pointer=engine._malloc(before.byteLength+64*1024*1024);assert.ok(pointer>0);
  try{
    assert.ok(engine.HEAPU8.buffer.byteLength>before.byteLength);
    const [reference,actual]=await pair(catalog.find(e=>e.id==='inter'),catalogURL);
    assert.deepEqual(actual.shapeRun('Đặng Ắ ễ'),reference.shapeRun('Đặng Ắ ễ'));
    assert.equal(engine._arch_control_reset(1),1);
    const id=engine._arch_test_fixture(0,1);assert.ok(id>0);
    const header=new DataView(engine.HEAPU8.buffer,engine._arch_snapshot_ptr(id),128);
    assert.equal(header.getUint32(0,true),0x48435241);assert.equal(header.getUint32(28,true),1);
    assert.equal(engine._arch_snapshot_release(id),1);
  }finally{engine._free(pointer);}
});
