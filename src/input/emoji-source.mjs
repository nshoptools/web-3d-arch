import {VERSION,LIMITS,fail,finite,string,choice,keys,id,sha,fontEntry,variations,color,outline,multiply,transform,emptyBounds,extendBounds,finishBounds,hash} from './source-contract.mjs';
import {validatePaint} from './paint-contract.mjs';
import {validateText,layoutText,svgEnvelope} from './text-layout.mjs';

export function createCollectionIndex(entries){
  if(!Array.isArray(entries)||entries.length>32)fail('RESOURCE_LIMIT','Collection limit');
  const collections=new Map();
  for(const config of entries){
    const collection=structuredClone(config);id(collection.id);
    choice(collection.style,['color','monochrome'],'collection style');
    if(collections.has(collection.id))fail('INVALID_CATALOG','Duplicate collection');
    if(!Array.isArray(collection.items)||collection.items.length>10000)fail('RESOURCE_LIMIT','Emoji catalog limit');
    const items=new Map(),forms=new Map();
    for(const item of [...collection.items,...(collection.components??[])]){
      id(item.id);string(item.emoji,128,'catalog emoji');
      if(items.has(item.id)||forms.has(item.emoji))fail('INVALID_CATALOG','Duplicate emoji entry');
      items.set(item.id,item);forms.set(item.emoji,item);
    }
    if((collection.aliases??[]).length>10000)fail('RESOURCE_LIMIT','Alias limit');
    for(const a of collection.aliases??[]){
      string(a.emoji,128,'alias');const target=items.get(a.canonicalId);
      if(!target)continue;
      if(forms.has(a.emoji)&&forms.get(a.emoji)!==target)fail('INVALID_CATALOG','Ambiguous emoji alias');
      forms.set(a.emoji,target);
    }
    collections.set(collection.id,{...collection,items,forms});
  }
  return collections;
}
function matrixFor(placement={}){
  keys(placement,['xMm','yMm','rotationDegrees'],'placement');
  const angle=finite(placement.rotationDegrees??0,-360,360,'rotation')*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return [c,s,-s,c,finite(placement.xMm??0,-10000,10000,'xMm'),finite(placement.yMm??0,-10000,10000,'yMm')];
}
function placeBounds(b,m){
  const out=emptyBounds();for(const [x,y] of [[b.minX,b.minY],[b.maxX,b.minY],[b.minX,b.maxY],[b.maxX,b.maxY]])extendBounds(out,...transform(m,x,y));
  return {...finishBounds(out),kind:'conservative-transformed-source-box'};
}
export function pngDimensions(bytes){
  const magic=[137,80,78,71,13,10,26,10];
  if(bytes.length<33||magic.some((b,i)=>bytes[i]!==b)||new TextDecoder().decode(bytes.subarray(12,16))!=='IHDR')fail('INVALID_BITMAP','Expected PNG with IHDR');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=v.getUint32(16),height=v.getUint32(20);
  finite(width,1,4096,'source PNG width',true);finite(height,1,4096,'source PNG height',true);
  if(width*height>4194304)fail('RESOURCE_LIMIT','Source PNG pixel limit');
  return {width,height};
}
export async function prepareEmoji(request,collections,getFont,getAsset,work){
  keys(request,['version','kind','id','expected','collectionId','text','source','size','variations','paletteIndex','foreground','placement','raster'],'emoji request');
  if(request.version!==VERSION)fail('VERSION_MISMATCH','Unsupported source version');
  const collection=collections.get(request.collectionId);if(!collection)fail('UNKNOWN_COLLECTION','Select an installed catalog collection');
  string(request.text,128,'emoji token');
  const item=collection.forms.get(request.text);if(!item)fail('UNKNOWN_EMOJI','Exact token is absent from the selected collection');
  const selection=request.source;keys(selection,['kind','font','asset'],'emoji source');
  const kind=choice(selection.kind,['outline','svg','COLRv1','CBDT/CBLC'],'emoji source kind');
  if(collection.style==='monochrome'&&kind!=='outline'||collection.style==='color'&&kind==='outline')
    fail('COLLECTION_SOURCE_MISMATCH','Source type does not match the explicitly selected collection');
  keys(request.size,['value','unit'],'size');
  const emMm=finite(request.size.value,.001,1000,'size')*(choice(request.size.unit,['mm','pt'],'size unit')==='pt'?25.4/72:1);
  finite(emMm,.001,1000,'emMm');const matrix=matrixFor(request.placement);
  const selectionRecord={collectionId:collection.id,style:collection.style,item:structuredClone(item),originalText:request.text,canonicalText:item.emoji,sourceKind:kind};
  if(kind==='outline'){
    const font=fontEntry(selection.font);
    if(font.id!==collection.defaultFontId||font.sha256!==collection.fontHash||font.color)fail('COLLECTION_SOURCE_MISMATCH','Wrong monochrome collection font');
    const req={version:VERSION,id:request.id,expected:request.expected,text:item.emoji,font,size:request.size,variations:request.variations,script:'Zyyy',language:'und',placement:request.placement,color:request.foreground};
    const geometry=await layoutText(validateText(req),getFont,work);
    const ink=geometry.instances.filter(i=>geometry.paths.find(p=>p.id===i.pathId).commands.length);
    if(ink.length!==1||ink[0].glyphId!==item.glyphId||geometry.instances.some(i=>i!==ink[0]&&(i.shaping.xAdvance!==0||i.shaping.yAdvance!==0)))fail('CATALOG_GLYPH_MISMATCH','Monochrome token did not shape to the selected glyph');
    return {kind:'paths',selection:selectionRecord,geometry,...svgEnvelope(geometry,geometry.options.color),sourceAssets:geometry.sourceAssets,conversion:null};
  }
  if(kind==='svg'){
    if(request.variations!==undefined||request.paletteIndex!==undefined||request.foreground!==undefined)fail('INVALID_INPUT','Font paint options do not apply to original SVG');
    const asset=selection.asset;
    if(!asset||(item.vectors??[]).every(v=>v.path!==asset.path||v.sha256!==asset.sha256))fail('COLLECTION_SOURCE_MISMATCH','SVG is not an original asset of the selected catalog item');
    const vector=item.vectors.find(v=>v.path===asset.path&&v.sha256===asset.sha256);
    if(vector.externalReferences?.length)fail('EXTERNAL_REFERENCE','Original SVG requires external resources; host must resolve in a separate validated adapter');
    const values=String(vector.viewBox??'').trim().split(/[\s,]+/u).map(Number);
    if(values.length!==4)fail('INVALID_CATALOG','SVG catalog needs a viewBox');
    values.forEach(n=>finite(n,-1e7,1e7,'viewBox'));const [x,y,w,h]=values;
    if(w<=0||h<=0)fail('INVALID_CATALOG','Invalid viewBox dimensions');
    const bytes=await getAsset(asset,work,LIMITS.svgBytes),scale=emMm/h;
    // SVG top maps to +em and bottom maps to the baseline; preserve its original encoded viewport.
    const sourceToMm=multiply(matrix,[scale,0,0,-scale,-x*scale,(y+h)*scale]);
    const b={minX:0,minY:0,maxX:w*scale,maxY:emMm,width:w*scale,height:emMm};
    return {kind:'svg',selection:selectionRecord,originalSvg:bytes,sourceToMm,
      bounds:placeBounds(b,matrix),coordinateSpace:{unit:'mm',yAxis:'up',origin:'asset-bottom-left-before-placement'},
      sourceAssets:[{record:structuredClone(asset),bytes:new Uint8Array(bytes)}],
      svgContract:{route:'existing-validated-svg-parser',viewBox:values,features:structuredClone(vector),notSanitized:true},
      conversion:null};
  }
  const font=fontEntry(selection.font);
  if(font.colorFormat!==kind||!font.color||!item.glyphs?.[font.id]||
    !collection.fonts?.some(f=>f.id===font.id&&f.sha256===font.sha256))fail('COLLECTION_SOURCE_MISMATCH','Color font is not selected catalog source');
  const axes=variations(request.variations,font),loaded=await getFont(font,work);
  await work.step(1,'shape-emoji');
  const shape=loaded.source.shapeRun(item.emoji,{language:'und',script:'Zyyy',direction:'ltr',variations:axes});
  if(shape.glyphs.length!==1||shape.glyphs[0].glyphId!==item.glyphs[font.id])fail('CATALOG_GLYPH_MISMATCH','Token did not shape to selected color glyph');
  const glyph=shape.glyphs[0],scale=emMm/font.unitsPerEm;
  for(const k of ['x','y','xOffset','yOffset','xAdvance','yAdvance'])finite(glyph[k],-1e8,1e8,'glyph '+k);
  const origin=[1,0,0,1,glyph.x*scale,glyph.y*scale],sourceToMm=multiply(matrix,origin);
  let source,localBounds,renderInput;
  if(kind==='COLRv1'){
    const foreground=color(request.foreground);
    const paint=loaded.source.colorPaint(glyph.glyphId,{variations:axes,paletteIndex:finite(request.paletteIndex??0,0,255,'paletteIndex',true),
      foreground:{red:foreground[0],green:foreground[1],blue:foreground[2],alpha:foreground[3]}});
    const paintBounds=validatePaint(paint,scale,work);
    localBounds={...paintBounds,minX:paintBounds.minX+glyph.x*scale,maxX:paintBounds.maxX+glyph.x*scale,minY:paintBounds.minY+glyph.y*scale,maxY:paintBounds.maxY+glyph.y*scale};
    source={paint,paintToSourceMm:multiply(sourceToMm,[scale,0,0,scale,0,0])};
    renderInput={kind,text:item.emoji,fontHash:font.sha256,fontBytes:loaded.bytes,paint,variations:axes,emMm,unitsPerEm:font.unitsPerEm,advanceMm:shape.advanceX*scale,bounds:localBounds};
  }else{
    if(request.paletteIndex!==undefined||request.foreground!==undefined)fail('INVALID_INPUT','CBDT has fixed encoded colors');
    const bitmap=loaded.source.bitmap(glyph.glyphId),png=pngDimensions(bitmap.bytes),e=bitmap.extents;
    for(const k of ['xBearing','yBearing','width','height'])finite(e?.[k],-1e8,1e8,'bitmap extents');
    if(e.width<=0||e.height>=0)fail('INVALID_BITMAP','Expected positive width and negative Y-up bitmap height');
    localBounds={minX:(glyph.x+e.xBearing)*scale,maxX:(glyph.x+e.xBearing+e.width)*scale,
      maxY:(glyph.y+e.yBearing)*scale,minY:(glyph.y+e.yBearing+e.height)*scale,width:e.width*scale,height:-e.height*scale};
    source={bitmap:{...bitmap,pngSha256:await hash(bitmap.bytes),pngWidth:png.width,pngHeight:png.height},bitmapBoxMm:localBounds};
    renderInput={kind,fontHash:font.sha256,pngHash:source.bitmap.pngSha256,pngBytes:bitmap.bytes,pngWidth:png.width,pngHeight:png.height,bitmapBoxMm:localBounds,bounds:localBounds};
  }
  await work.step(kind==='COLRv1'?source.paint.operations.length:1,'extract-emoji');
  return {kind:'color-source',selection:selectionRecord,shape,source,emMm,placement:matrix,localBounds,bounds:placeBounds(localBounds,matrix),
    coordinateSpace:{unit:'mm',yAxis:'up',origin:'glyph-baseline-before-placement'},
    sourceAssets:[{record:structuredClone(font),bytes:new Uint8Array(loaded.bytes)}],
    renderInput};
}
