import {readArchSnapshot,ViewportError} from '../viewport/arch-view.mjs';
import {encodeRasterPNG} from './png-encode.mjs';
const requireValue=(condition,code)=>{if(!condition)throw new ViewportError(code);};

/** Nonzero rings -> scanline sample coverage. Half-open edges and intervals
 * give a shared boundary to exactly one region. Increasing-Y normalization
 * makes reversed shared edges compute the same X. This is a preview sampler,
 * never a triangulator, manufacturing boolean or topology certificate. */
function sampleRegions(regions,width,height) {
  const buckets=Array.from({length:height},()=>[]),pixels=new Uint8ClampedArray(width*height*4);
  for(const region of regions)for(const ring of region.rings)for(let i=0;i<ring.length;i++){
    let [x0,y0]=ring[i], [x1,y1]=ring[(i+1)%ring.length];
    if(y0===y1)continue;const winding=y0<y1?1:-1;
    if(y0>y1){[x0,x1]=[x1,x0];[y0,y1]=[y1,y0];}
    const start=Math.max(0,Math.ceil(y0-.5)),end=Math.min(height,Math.ceil(y1-.5));
    if(start<end)buckets[start].push({x0,y0,x1,y1,end,winding,region:region.index});
  }
  let active=[],work=0;
  for(let y=0;y<height;y++){
    active=active.filter(e=>e.end>y);for(const e of buckets[y])active.push(e);
    work+=active.length;requireValue(work<=32_000_000,'PREVIEW_WORK_BUDGET');
    const hits=active.map(e=>({x:e.x0+(e.x1-e.x0)*((y+.5-e.y0)/(e.y1-e.y0)),w:e.winding,region:e.region}));
    hits.sort((a,b)=>a.region-b.region||a.x-b.x);
    let region=-1,winding=0,from=0;
    for(let i=0;i<hits.length;){
      const hit=hits[i];if(hit.region!==region){requireValue(winding===0,'PREVIEW_OPEN_RING');region=hit.region;}
      const before=winding;let sum=0;
      do{sum+=hits[i].w;i++;}while(i<hits.length&&hits[i].region===region&&hits[i].x===hit.x);
      winding+=sum;if(before===0&&winding!==0)from=hit.x;
      if(before!==0&&winding===0){
        const first=Math.max(0,Math.ceil(from-.5)),end=Math.min(width,Math.ceil(hit.x-.5)),color=regions[region].color;
        for(let x=first;x<end;x++){const offset=(y*width+x)*4;
          requireValue(pixels[offset+3]===0,'PREVIEW_REGION_OVERLAP');
          pixels[offset]=color>>>24;pixels[offset+1]=(color>>>16)&255;pixels[offset+2]=(color>>>8)&255;pixels[offset+3]=255;
        }
      }
    }
    requireValue(winding===0,'PREVIEW_OPEN_RING');
  }
  return pixels;
}

/** Only validated, clipped, opaque manufacturing contours are displayed.
 * Raw SVG never reaches a DOM/image decoder/object URL/browser SVG renderer.
 * Two samples per axis produce coverage without a platform canvas dependency.
 * Tiny features can be subpixel; conversion remains explicit and unqualified.
 * Caller retains the temporary ARCH lease until this Promise resolves. */
export async function previewPlanarSnapshot(bytes,{resolution=520,includeRGBA=false,sourceAxis='x-right-y-up',sourceHeightMm=null}={}) {
  requireValue(Number.isInteger(resolution)&&resolution>=32&&resolution<=1280,'PREVIEW_RESOLUTION');
  // The contours are in the manufacturing frame (X right, Y up: text wrappers,
  // framed contexts) unless the caller says they are a parsed SVG viewport (X
  // right, Y down). The picture always shows the manufacturing frame, so a
  // Y-down source is drawn as its author drew it and its top row is the
  // viewport height above the manufacturing origin.
  requireValue(sourceAxis==='x-right-y-up'||sourceAxis==='x-right-y-down','PREVIEW_SOURCE_AXIS');
  const reflected=sourceAxis==='x-right-y-down';
  requireValue(!reflected||typeof sourceHeightMm==='number'&&Number.isFinite(sourceHeightMm)&&sourceHeightMm>0&&sourceHeightMm<=10000,'PREVIEW_SOURCE_HEIGHT');
  const snapshot=readArchSnapshot(bytes),data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  requireValue(snapshot.bounds&&snapshot.parts.length>0,'PREVIEW_EMPTY');
  const u=offset=>data.getUint32(offset,true),pointCount=u(32),contourCount=u(36),indexCount=u(40);
  const pointOffset=u(60),contourOffset=u(64),indexOffset=u(68),[sizeX,sizeY]=snapshot.bounds.size;
  requireValue(sizeX>0&&sizeY>0,'PREVIEW_BOUNDS');
  const pixelSizeMm=Math.max(sizeX,sizeY)/resolution;
  const width=Math.max(1,Math.ceil(sizeX/pixelSizeMm-1e-9)),height=Math.max(1,Math.ceil(sizeY/pixelSizeMm-1e-9));
  requireValue(width<=1280&&height<=1280,'PREVIEW_SIZE');
  const left=snapshot.bounds.min[0],colors=[],regions=[];
  const rowOf=reflected?y=>2*(y-snapshot.bounds.min[1])/pixelSizeMm:y=>2*(snapshot.bounds.max[1]-y)/pixelSizeMm;
  const topMm=reflected?sourceHeightMm-snapshot.bounds.min[1]:snapshot.bounds.max[1];
  let previousContourEnd=0;
  for(const part of snapshot.parts) {
    requireValue(part.contourCount>0&&part.contourStart===previousContourEnd,'PREVIEW_PLANAR_REQUIRED');previousContourEnd+=part.contourCount;
    const rgba=part.color;requireValue((rgba&255)===255,'PREVIEW_OPAQUE_REQUIRED');
    const color='#'+(rgba>>>8).toString(16).padStart(6,'0');if(!colors.includes(color))colors.push(color);
    const rings=[];
    for(let ci=part.contourStart;ci<previousContourEnd;ci++) {
      const c=contourOffset+ci*16,start=u(c),count=u(c+4);requireValue(count>=3&&start+count<=indexCount&&u(c+8)===part.index,'PREVIEW_CONTOUR');
      const ring=[];
      for(let i=0;i<count;i++) {
        const point=u(indexOffset+4*(start+i));requireValue(point<pointCount,'PREVIEW_POINT');const offset=pointOffset+point*16;
        const x=Number(data.getBigInt64(offset,true))/1e6,y=Number(data.getBigInt64(offset+8,true))/1e6;
        requireValue(Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=10000&&Math.abs(y)<=10000,'PREVIEW_COORDINATE');
        ring.push([2*(x-left)/pixelSizeMm,rowOf(y)]);
      }
      rings.push(ring);
    }
    regions.push({index:part.index,color:rgba,rings});
  }
  requireValue(previousContourEnd===contourCount,'PREVIEW_UNOWNED_CONTOUR');
  const samples=sampleRegions(regions,width*2,height*2),rgba=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let red=0,green=0,blue=0,count=0;
    for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){const p=((2*y+sy)*(2*width)+2*x+sx)*4;
      if(samples[p+3]){red+=samples[p];green+=samples[p+1];blue+=samples[p+2];count++;}}
    const p=(y*width+x)*4;if(count){rgba[p]=Math.round(red/count);rgba[p+1]=Math.round(green/count);rgba[p+2]=Math.round(blue/count);rgba[p+3]=Math.round(count*255/4);}
  }
  // All shared views were consumed synchronously. Encoding reads owned RGBA.
  const png=await encodeRasterPNG({width,height,data:rgba});
  return {version:1,width,height,pixelSizeMm,png,mediaType:'image/png',...(includeRGBA?{rgba}:{}),colors,
    frame:{kind:'manufacturing-bounds',leftMm:left,topMm,widthMm:sizeX,heightMm:sizeY,yDirection:'down',sourceAxis},
    derivation:{kind:'opaque-canonical-contours-scanline-2x2-v1',resolution,includesPixelAntialias:true,
      sourceGeometryChanged:false,totalErrorBoundMm:null,topologyPreservation:'unverified'}};
}
