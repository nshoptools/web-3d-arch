import {VERSION,LIMITS,fail,finite,string,choice,keys,fontEntry,variations,color,outline,multiply,transform,emptyBounds,extendBounds,finishBounds} from './source-contract.mjs';

export function normalizeText(originalText){
  string(originalText,LIMITS.textCodeUnits,'text');
  if(!globalThis.Intl?.Segmenter)fail('CORE_UNAVAILABLE','Intl.Segmenter required');
  for(const c of originalText){const n=c.codePointAt(0);if(n>=0xd800&&n<=0xdfff)fail('INVALID_TEXT','Unpaired surrogate');}
  if(/[\t\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(originalText))fail('ITEMIZATION_REQUIRED','Control characters/tabs require an explicit host layout policy');
  const mapping=[],segments=new Intl.Segmenter('und',{granularity:'grapheme'}).segment(originalText);let text='';
  for(const s of segments){
    if(mapping.length>=LIMITS.graphemes)fail('RESOURCE_LIMIT','Text exceeds 500 graphemes');
    const value=s.segment.normalize('NFC').replace(/\r\n?|\u2028|\u2029/gu,'\n');
    mapping.push({originalStart:s.index,originalEnd:s.index+s.segment.length,start:text.length,end:text.length+value.length});
    text+=value;
  }
  return {originalText,text,normalization:'NFC+line-breaks-LF',mapping,graphemes:mapping.length};
}
function validateScript(v){if(typeof v!=='string'||!/^[A-Za-z]{4}$/.test(v))fail('INVALID_INPUT','Expected four-letter ISO script tag');return v;}
function originalRange(mapping,start,end){
  const spans=mapping.filter(s=>s.end>start&&s.start<end);
  return spans.length?{start:spans[0].originalStart,end:spans.at(-1).originalEnd}:{start:0,end:0};
}
export function validateText(request){
  keys(request,['version','id','expected','text','font','size','variations','language','script','direction','lineSpacing','letterSpacingMm','align','bendDegrees','placement','color','layout'],'text request');
  if(request.version!==VERSION)fail('VERSION_MISMATCH','Unsupported source version');
  const normalized=normalizeText(request.text),font=fontEntry(request.font);
  keys(request.size,['value','unit'],'size');
  const emMm=finite(request.size.value,.001,1000,'em size')*(choice(request.size.unit,['mm','pt'],'size unit')==='pt'?25.4/72:1);
  finite(emMm,.001,1000,'em size in mm');
  const placement=request.placement??{};
  keys(placement,['xMm','yMm','rotationDegrees'],'placement');
  const options={
    emMm,size:{...request.size},variations:variations(request.variations,font),language:string(request.language??'vi',32,'language'),
    script:request.script??'Latn',direction:choice(request.direction??'ltr',['ltr','rtl'],'direction'),
    lineSpacing:finite(request.lineSpacing??1.2,.25,8,'line spacing'),
    letterSpacingMm:finite(request.letterSpacingMm??0,-2*emMm,10*emMm,'letter spacing'),
    align:choice(request.align??'left',['left','center','right'],'alignment'),
    bendDegrees:finite(request.bendDegrees??0,-180,180,'bend degrees'),
    placement:{xMm:finite(placement.xMm??0,-10000,10000,'placement.x'),yMm:finite(placement.yMm??0,-10000,10000,'placement.y'),rotationDegrees:finite(placement.rotationDegrees??0,-360,360,'rotation')},
    color:color(request.color),
  };
  if(typeof options.script!=='string'||!/^[A-Za-z]{4}$/.test(options.script))fail('INVALID_INPUT','Expected four-letter ISO script tag');
  const rawLines=normalized.text.split('\n');if(rawLines.length>LIMITS.lines)fail('RESOURCE_LIMIT','Too many lines');
  if(request.layout!==undefined&&(!Array.isArray(request.layout)||request.layout.length!==rawLines.length))fail('INVALID_INPUT','Layout must describe every canonical line');
  // Automatic mode is deliberately a horizontal single script run, not a homemade bidi algorithm.
  if(!request.layout&&(/[\u202a-\u202e\u2066-\u2069]/u.test(normalized.text)||(options.script==='Latn'&&/[^\p{Script_Extensions=Latin}\p{Script_Extensions=Common}\p{Script_Extensions=Inherited}\n]/u.test(normalized.text))))
    fail('ITEMIZATION_REQUIRED','Supply explicit script/direction runs for non-Latin or mixed-direction text');
  let start=0,runCount=0;
  const lines=rawLines.map((text,lineIndex)=>{
    const plan=request.layout?.[lineIndex];
    if(plan)keys(plan,['runs','visualOrder'],'line plan');
    let runs=plan?.runs??(text.length?[{start:0,end:text.length}]:[]);
    if(!Array.isArray(runs)||runs.length>LIMITS.runs)fail('RESOURCE_LIMIT','Run limit');
    let end=0;
    const boundaries=new Set(normalized.mapping.filter(g=>g.start>=start&&g.end<=start+text.length).flatMap(g=>[g.start-start,g.end-start]));boundaries.add(0);boundaries.add(text.length);
    runs=runs.map(r=>{
      keys(r,['start','end','direction','script','language','font','variations'],'run');
      if(r.start!==end||!boundaries.has(r.start)||!boundaries.has(r.end)||r.end<=r.start)fail('INVALID_INPUT','Runs must exactly partition the line at grapheme boundaries');
      end=r.end;const f=r.font?fontEntry(r.font):font;
      return {...r,font:f,variations:variations(r.variations??(r.font?{}:options.variations),f),
        direction:choice(r.direction??options.direction,['ltr','rtl'],'run direction'),script:validateScript(r.script??options.script),language:string(r.language??options.language,32,'run language')};
    });
    if(end!==text.length)fail('INVALID_INPUT','Line partition is incomplete');
    const order=plan?.visualOrder??runs.map((_,i)=>i);
    if(!Array.isArray(order)||order.length!==runs.length||new Set(order).size!==runs.length||order.some(i=>!Number.isInteger(i)||i<0||i>=runs.length))fail('INVALID_INPUT','visualOrder must be a permutation');
    runCount+=runs.length;if(runCount>LIMITS.runs)fail('RESOURCE_LIMIT','Total run limit');
    const line={index:lineIndex,text,start,runs,visualOrder:[...order]};start+=text.length+1;return line;
  });
  return {normalized,font,options,lines};
}
function clusterRanges(shape){
  const sorted=[...new Set(shape.glyphs.map(g=>g.cluster))].sort((a,b)=>a-b);
  return new Map(sorted.map((n,i)=>[n,sorted[i+1]??shape.text.length]));
}
export async function layoutText(validated,getFont,work){
  const {normalized,options,lines}=validated,shapedLines=[],fontSources=new Map();
  // Verify and retain the selected default font even when the text currently has no ink.
  const defaultFont=await getFont(validated.font,work);fontSources.set(validated.font.sha256,defaultFont);
  let glyphCount=0;
  for(const line of lines){
    const runs=[];
    for(const r of line.runs){
      await work.step(1,'shape-run');
      const loaded=await getFont(r.font,work),shape=loaded.source.shapeRun(line.text.slice(r.start,r.end),{language:r.language,script:r.script,direction:r.direction,variations:r.variations});
      if(shape.geometryKind!=='outline')fail('COLOR_FONT_REQUIRES_EMOJI_SOURCE','Use selected color emoji source processing');
      glyphCount+=shape.glyphs.length;if(glyphCount>LIMITS.glyphs)fail('RESOURCE_LIMIT','Glyph limit');
      finite(shape.advanceX,-100000000,100000000,'run advance');finite(shape.advanceY,0,0,'horizontal advanceY');
      fontSources.set(r.font.sha256,loaded);
      const ends=clusterRanges(shape),scale=options.emMm/shape.unitsPerEm,clusters=[];
      let last=null;
      for(const g of shape.glyphs){
        finite(g.cluster,0,Math.max(0,shape.text.length-1),'cluster',true);
        for(const k of ['x','y','xOffset','yOffset','xAdvance','yAdvance'])finite(g[k],-100000000,100000000,'glyph '+k);
        // x/y already contain HarfBuzz offsets; pen is used only to define cluster's bend anchor.
        if(last?.cluster!==g.cluster){last={cluster:g.cluster,end:ends.get(g.cluster),pen:g.x-g.xOffset,advance:0,glyphs:[]};clusters.push(last);}
        last.advance+=g.xAdvance;last.glyphs.push(g);
      }
      runs.push({plan:r,shape,scale,clusters});
    }
    const clusterCount=runs.reduce((n,r)=>n+r.clusters.length,0);
    const naturalWidth=runs.reduce((n,r)=>n+r.shape.advanceX*r.scale,0);
    const width=naturalWidth+Math.max(0,clusterCount-1)*options.letterSpacingMm;
    shapedLines.push({...line,shapedRuns:runs,advanceMm:width,baselineY:-line.index*options.emMm*options.lineSpacing,clusterCount});
  }
  const maxAdvance=Math.max(0,...shapedLines.map(l=>l.advanceMm));
  if(options.bendDegrees&&maxAdvance<=0)fail('INVALID_LAYOUT','Bend needs positive line advance');
  const curvature=options.bendDegrees?options.bendDegrees*Math.PI/180/maxAdvance:0;
  const rotation=options.placement.rotationDegrees*Math.PI/180,cs=Math.cos(rotation),sn=Math.sin(rotation);
  const placement=[cs,sn,-sn,cs,options.placement.xMm,options.placement.yMm];
  const paths=[],instances=[],pathPool=new Map(),bounds=emptyBounds();
  for(const line of shapedLines){
    const align=options.align==='center'?-line.advanceMm/2:options.align==='right'?-line.advanceMm:0;
    let runOrigin=0,trackingIndex=0;
    for(const index of line.visualOrder){
      const run=line.shapedRuns[index],ranges=clusterRanges(run.shape);
      for(const cluster of run.clusters){
        const track=trackingIndex*options.letterSpacingMm;
        const anchor=align+runOrigin+(cluster.pen+cluster.advance/2)*run.scale+track;
        const angle=curvature*anchor;
        const bx=curvature?Math.sin(angle)/curvature:anchor;
        const by=(curvature?(1-Math.cos(angle))/curvature:0)+line.baselineY;
        const c=Math.cos(angle),s=Math.sin(angle);
        for(const g of cluster.glyphs){
          const globalStart=line.start+run.plan.start+g.cluster,globalEnd=line.start+run.plan.start+ranges.get(g.cluster);
          const key=JSON.stringify([run.plan.font.sha256,run.shape.variations,g.glyphId,options.emMm]);
          let pathId=pathPool.get(key);
          if(pathId===undefined){
            outline(g.outline,work);pathId='path-'+paths.length;
            paths.push({id:pathId,fillRule:'nonzero',fontId:run.plan.font.id,fontHash:run.plan.font.sha256,glyphId:g.glyphId,
              variations:{...run.shape.variations},commands:g.outline.map(cmd=>({type:cmd.type,values:cmd.values.map(v=>v*run.scale)}))});
            pathPool.set(key,pathId);
          }
          const localX=align+runOrigin+g.x*run.scale+track-anchor,localY=g.y*run.scale;
          const matrix=multiply(placement,[c,s,-s,c,curvature?bx+c*localX-s*localY:align+runOrigin+g.x*run.scale+track,curvature?by+s*localX+c*localY:line.baselineY+g.y*run.scale]);
          const path=paths[Number(pathId.slice(5))];
          for(const cmd of path.commands)for(let i=0;i<cmd.values.length;i+=2){const p=transform(matrix,cmd.values[i],cmd.values[i+1]);extendBounds(bounds,...p);}
          instances.push({id:'glyph-'+instances.length,pathId,matrix,line:line.index,run:index,glyphId:g.glyphId,
            cluster:{start:globalStart,end:globalEnd,unit:'utf16-code-unit-NFC',original:originalRange(normalized.mapping,globalStart,globalEnd)},
            shaping:{x:g.x,y:g.y,xOffset:g.xOffset,yOffset:g.yOffset,xAdvance:g.xAdvance,yAdvance:g.yAdvance},bendAnchorMm:anchor,bendAngle:angle});
        }
        trackingIndex++;
      }
      runOrigin+=run.shape.advanceX*run.scale;
    }
    await work.step(instances.length,'place-line');
  }
  return {coordinateSpace:{unit:'mm',yAxis:'up',origin:'first-line-baseline-before-placement'},paths,instances,bounds:finishBounds(bounds),
    lineMetrics:shapedLines.map(l=>({line:l.index,start:l.start,text:l.text,baselineY:l.baselineY,advanceMm:l.advanceMm,clusters:l.clusterCount})),
    shapedRuns:shapedLines.flatMap(l=>l.shapedRuns.map((r,i)=>({line:l.index,run:i,...r.shape}))),
    text:normalized,options,sourceAssets:[...fontSources.values()].map(f=>({record:structuredClone(f.entry),bytes:new Uint8Array(f.bytes)}))};
}
export function geometryToSvg(geometry,fill=[0,0,0,255]){
  fill=color(fill);
  if(!Array.isArray(geometry?.paths)||!Array.isArray(geometry?.instances)||geometry.paths.length>LIMITS.glyphs||geometry.instances.length>LIMITS.glyphs)fail('RESOURCE_LIMIT','SVG shape count limit');
  const svgWork={commands:0};for(const p of geometry.paths)outline(p.commands,svgWork);
  const b=geometry.bounds;
  if(!b||b.width<=0||b.height<=0)return null;
  for(const k of ['minX','minY','maxX','maxY','width','height'])finite(b[k],-20000,20000,'SVG bounds');
  let expanded=0;
  const paths=new Map(geometry.paths.map(p=>[p.id,p]));
  let svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+b.width+'mm" height="'+b.height+'mm" viewBox="'+[b.minX,-b.maxY,b.width,b.height].join(' ')+'">';
  for(const instance of geometry.instances){
    const p=paths.get(instance.pathId),m=instance.matrix;
    if(!p||!Array.isArray(m)||m.length!==6)fail('INVALID_GEOMETRY','Invalid SVG instance');
    m.forEach(v=>finite(v,-1000000,1000000,'SVG matrix'));
    expanded+=p.commands.length;if(expanded>16384)fail('RESOURCE_LIMIT','SVG expanded segment budget exceeds parent parser limit');
    if(!p.commands.length)continue; // Empty spacing/selector glyphs remain in layout, not SVG paint nodes.
    const d=p.commands.map(c=>c.type+c.values.join(' ')).join(' ');
    svg+='<path fill="rgb('+fill.slice(0,3).join(',')+')" fill-opacity="'+fill[3]/255+'" fill-rule="nonzero" transform="matrix('+[m[0],-m[1],m[2],-m[3],m[4],-m[5]].join(' ')+')" d="'+d+'"/>';
    if(svg.length>LIMITS.svgBytes)fail('RESOURCE_LIMIT','Generated SVG exceeds parent parser byte limit');
  }
  return new TextEncoder().encode(svg+'</svg>');
}

/** Shared curves remain available if optional SVG serialization exceeds the parser's lower limits. */
export function svgEnvelope(geometry,fill){
  try{
    const svg=geometryToSvg(geometry,fill),b=geometry.bounds;
    return {svg,svgExport:svg?{status:'ready',parserViewportToSourceMm:[1,0,0,-1,b.minX,b.maxY],expandedSegmentLimit:16384}:
      {status:'empty',parserViewportToSourceMm:null}};
  }catch(error){
    if(error.code!=='RESOURCE_LIMIT')throw error;
    return {svg:null,svgExport:{status:'resource-limit',code:error.code,message:error.message,route:'shared-prepared-curves'}};
  }
}