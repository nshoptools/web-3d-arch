import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createFontSource} from '../../src/input/font-source.mjs';
const execute=promisify(execFile),run=process.env.PROJECT_REVIEW_RUN;
if(!run)throw new Error('Project environment required');
const probe=path.join(run,'work/native-build/Release/arch_font_probe.exe');
const output=path.join(run,'evidence/harfbuzz-native');await mkdir(output,{recursive:true});
const fontCatalogURL=new URL('../../src/assets/fonts/fonts-cat.json',import.meta.url);
const colorCatalogURL=new URL('../../src/assets/emoji/color/fonts-cat.json',import.meta.url);
const catalog=JSON.parse(await readFile(fontCatalogURL,'utf8')),colors=JSON.parse(await readFile(colorCatalogURL,'utf8'));
test('native pinned HarfBuzz matches validated web shaping and outlines on Vietnamese, clusters and variations',{timeout:90000},async()=>{
  const entries=catalog;
  const cases=[];
  for(const entry of entries){
    const fontPath=fileURLToPath(new URL(entry.path,fontCatalogURL));
    const reference=await createFontSource(new Uint8Array(await readFile(fontPath)),entry);
    const variants=[entry.defaultVariation,Object.fromEntries(Object.entries(entry.axes).map(([tag,a])=>[tag,a.min])),Object.fromEntries(Object.entries(entry.axes).map(([tag,a])=>[tag,a.max]))];
    for(const variations of variants)for(const original of ['Tiếng Việt Đặng Ắ ầ ễ ộ ớ ự ỹ 3D','Tiếng Việt'.normalize('NFD'),'office fi ffi AV']){
      const text=original.normalize('NFC'),textPath=path.join(output,'input.utf16le');await writeFile(textPath,Buffer.from(text,'utf16le'));
      const expected=reference.shapeRun(original,{variations});
      const {stdout}=await execute(probe,[fontPath,textPath,'outline',...Object.entries(expected.variations).map(([k,v])=>`${k}=${v}`)],{maxBuffer:8*1024*1024});
      const actual=JSON.parse(stdout);assert.equal(actual.version,'14.4.0');assert.equal(actual.unitsPerEm,expected.unitsPerEm);
      assert.deepEqual(actual.glyphs,expected.glyphs.map(({x,y,...glyph})=>glyph));
      cases.push({fontId:entry.id,fontSha256:entry.sha256,text:original,variations,glyphs:actual.glyphs.length,status:'pass'});
    }
  }
  await writeFile(path.join(output,'outlines.json'),JSON.stringify({fontCount:entries.length,cases,scope:'all selected text font files, default/min/max axes and three text samples; not every glyph combination or print mesh'},null,2));
});
test('native HarfBuzz clusters and positions keep selected COLRv1 emoji sequences intact',async()=>{
  const entry=colors.find(e=>e.id==='noto-colrv1'),fontPath=fileURLToPath(new URL(entry.path,colorCatalogURL));
  const reference=await createFontSource(new Uint8Array(await readFile(fontPath)),entry),cases=[];
  for(const text of ['😀','👩🏽‍💻','🇻🇳','❤️','🧑‍🦰']){
    const textPath=path.join(output,'emoji.utf16le');await writeFile(textPath,Buffer.from(text,'utf16le'));
    const {stdout}=await execute(probe,[fontPath,textPath,'color']);const actual=JSON.parse(stdout),expected=reference.shapeRun(text);
    assert.deepEqual(actual.glyphs,expected.glyphs.map(({x,y,...glyph})=>glyph));cases.push({text,glyphs:actual.glyphs});
  }
  await writeFile(path.join(output,'emoji.json'),JSON.stringify({fontSha256:entry.sha256,cases,scope:'native sequence shaping parity; full paint graph parity separately tested in linked web module'},null,2));
});
