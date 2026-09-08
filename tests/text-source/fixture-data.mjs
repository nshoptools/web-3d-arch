// Test-only filesystem adapter. Production modules never import this file.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function fixtureData(root){
  const json=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
  const entries={
    inter:(await json('src/assets/fonts/fonts-cat.json')).find(e=>e.id==='inter'),
    mono:(await json('src/assets/emoji/fonts-cat.json')).find(e=>e.id==='notoemoji'),
    colr:(await json('src/assets/emoji/color/fonts-cat.json')).find(e=>e.id==='noto-colrv1'),
    cbdt:(await json('src/assets/emoji/color/fonts-cat.json')).find(e=>e.id==='notocoloremoji'),
    analytic:JSON.parse(await readFile(new URL('./fixtures/analytic-colr.json',import.meta.url),'utf8')),
  };
  const collectionRegistry=await json('src/assets/emoji/collections.json'),mono=await json('src/assets/emoji/emoji-cat.json'),
    color=await json('src/assets/emoji/color/emoji-cat.json'),aliases=await json('src/assets/emoji/color/input-aliases.json'),
    components=await json('src/assets/emoji/color/components-cat.json'),lock=await json('src/assets/emoji/color/assets-lock.json');
  const selected=['😀','👩🏽‍💻','🇻🇳','❤️','👨‍👩‍👧‍👦'];
  const locks=new Map(lock.files.map(f=>[f.path,f]));
  // All collection membership is loaded; byte access remains a finite harness whitelist.
  const collections=[
    {...collectionRegistry.collections.find(c=>c.id==='noto-color-emoji'),items:color.items,components:components.items,
      aliases:aliases.items,fonts:[entries.colr,entries.cbdt]},
    {...collectionRegistry.collections.find(c=>c.id==='noto-emoji-monochrome'),items:mono.items,aliases:aliases.items,fontHash:entries.mono.sha256},
    {id:'analytic-color',style:'color',defaultFontId:'analytic-colr',fonts:[entries.analytic],
      items:['linear','radial','sweep','group','reflect','alpha','tied'].map((name,i)=>({id:name,emoji:String.fromCharCode(0xe000+i),glyphs:{'analytic-colr':i+1}}))},
  ];
  const assetFiles=new Map(),svgAssets={};
  for(const [key,base] of [['inter','src/assets/fonts'],['mono','src/assets/emoji'],['colr','src/assets/emoji/color'],['cbdt','src/assets/emoji/color']])
    assetFiles.set(entries[key].sha256,path.join(root,base,entries[key].path));
  assetFiles.set(entries.analytic.sha256,fileURLToPath(new URL('./fixtures/analytic-colr.ttf',import.meta.url)));
  for(const token of selected){
    const item=color.items.find(i=>i.emoji===token),v=item?.vectors?.[0];if(!v)throw Error('Missing fixture '+token);
    const pinned=locks.get(v.path);svgAssets[token]={...v,bytes:pinned.bytes};
    assetFiles.set(v.sha256,path.join(root,'src/assets/emoji/color',v.path));
  }
  const bytes=new Map();for(const [sha,file] of assetFiles)bytes.set(sha,new Uint8Array(await readFile(file)));
  const readBytes=async ref=>{const value=bytes.get(ref.sha256);if(!value)throw Error('Not on fixture whitelist');return new Uint8Array(value);};
  return {entries,collections,selected,svgAssets,assetFiles,bytes,readBytes};
}
