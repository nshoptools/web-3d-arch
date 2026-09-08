import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function fixtureData(root){
  const json=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
  const fonts=await json('src/assets/fonts/fonts-cat.json'),monoFonts=await json('src/assets/emoji/fonts-cat.json'),colorFonts=await json('src/assets/emoji/color/fonts-cat.json');
  const mono=await json('src/assets/emoji/emoji-cat.json'),color=await json('src/assets/emoji/color/emoji-cat.json'),registry=await json('src/assets/emoji/collections.json');
  const aliases=(await json('src/assets/emoji/color/input-aliases.json')).items,components=(await json('src/assets/emoji/color/components-cat.json')).items;
  const lock=await json('src/assets/emoji/color/assets-lock.json'),locked=new Map(lock.files.map(f=>[f.path,f]));
  const selected=['😀','👩🏽‍💻','🇻🇳','❤️','👨‍👩‍👧‍👦'];
  const entries={inter:fonts.find(f=>f.id==='inter'),mono:monoFonts.find(f=>f.id==='notoemoji'),colr:colorFonts.find(f=>f.id==='noto-colrv1'),cbdt:colorFonts.find(f=>f.id==='notocoloremoji')};
  const allFonts=[...fonts,entries.mono,entries.colr,entries.cbdt],assetFiles=new Map(),assetRecords=new Map(),previews=[];
  function add(sha256,bytes,mediaType,file){if(!assetFiles.has(sha256)){assetFiles.set(sha256,file);assetRecords.set(sha256,{sha256,bytes,mediaType});}}
  for(const f of fonts)add(f.sha256,f.bytes,'font/ttf',path.join(root,'src/assets/fonts',f.path));
  for(const [f,dir]of [[entries.mono,'src/assets/emoji'],[entries.colr,'src/assets/emoji/color'],[entries.cbdt,'src/assets/emoji/color']])add(f.sha256,f.bytes,'font/ttf',path.join(root,dir,f.path));
  for(const item of [...color.items,...components]){
    const png=item.rasters?.find(p=>p.width===128)??item.rasters?.[0];
    if(png){const f=locked.get(png.path);add(png.sha256,f.bytes,'image/png',path.join(root,'src/assets/emoji/color',png.path));previews.push({collectionId:'noto-color-emoji',itemId:item.id,sha256:png.sha256,sourceKind:'original-Noto-PNG-catalog-artwork'});}
    if(selected.includes(item.emoji))for(const v of item.vectors??[]){const f=locked.get(v.path);add(v.sha256,f.bytes,'image/svg+xml',path.join(root,'src/assets/emoji/color',v.path));}
  }
  const collections=[
    {...registry.collections[0],items:color.items,aliases,components,fonts:[entries.colr,entries.cbdt],selection:{kind:'COLRv1',fontId:entries.colr.id}},
    {...registry.collections[1],items:mono.items,aliases,fontHash:entries.mono.sha256,fonts:[entries.mono],selection:{kind:'outline',fontId:entries.mono.id}},
  ];
  const catalog={version:'arch-source-catalog/1',fonts:allFonts,collections,previews,defaultFontId:'inter',defaultCollectionId:registry.defaultCollection,
    labels:{version:'test-authored-vi/1',source:'Original labels authored for text-app test fixtures; not a product translation dataset',
      entries:[{collectionId:'noto-color-emoji',itemId:'1f600',vi:'Mặt cười',keywords:['vui vẻ']},{collectionId:'noto-color-emoji',itemId:'1f1fb-1f1f3',vi:'Cờ Việt Nam'}]}};
  const {newDocument}=await import(pathToFileURL(path.join(root,'src/app/documents.mjs')));
  const initialState=(await newDocument('keychain')).document.state;
  return {catalog,entries,selected,initialState,assetFiles,assetRecords};
}
export function mappedAssets(fixture,origin){return [...fixture.assetRecords.values()].map(r=>({...r,url:origin+'/library/'+r.sha256}));}
