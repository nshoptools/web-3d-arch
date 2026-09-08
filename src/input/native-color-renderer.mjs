import {LIMITS,fail,finite,string,dimensions,hash} from './source-contract.mjs';

/**
 * Established renderer adapter, not a COLR-to-CanvasGradient approximation.
 * Supply the engine/version from the host's qualified runtime. Capability gaps are errors.
 * All work happens in the calling DedicatedWorker. This module has no I/O.
 */
export function createNativeColorRenderer(runtime){
  return createCanvasColorRenderer(runtime,{
    id:'browser-font-and-image/1',
    createCanvas(width,height){
      if(typeof OffscreenCanvas!=='function')fail('RENDERER_GAP','This Worker has no OffscreenCanvas',{feature:'OffscreenCanvas'});
      return new OffscreenCanvas(width,height);
    },
    fontSet:()=>globalThis.fonts,
  });
}
/** Internal platform hook for the explicitly installed, bounded main-thread bridge. */
export function createCanvasColorRenderer({engine,version},platform){
  string(engine,64,'renderer engine');string(version,64,'renderer version');
  if(!engine||!version)fail('INVALID_INPUT','Renderer engine and version required');
  const provenance={id:platform.id,engine,version,colorSpace:'srgb',storage:'unpremultiplied-rgba8'};
  return Object.freeze({
    provenance,
    async render(input,work){
      const {width,height}=input;dimensions(width,height);
      const canvas=platform.createCanvas(width,height),ctx=canvas.getContext('2d',{alpha:true,colorSpace:'srgb',willReadFrequently:true});
      if(!ctx)fail('RENDERER_GAP','Worker 2D canvas unavailable',provenance);
      const b=input.bounds;
      for(const key of ['minX','minY','maxX','maxY','width','height'])finite(b[key],-20000,20000,'render bounds');
      if(b.width<=0||b.height<=0)fail('INVALID_GEOMETRY','Empty render bounds');
      // Two pixels of transparent padding. One isotropic scale preserves the source aspect ratio.
      const pxPerMm=Math.min((width-4)/b.width,(height-4)/b.height);
      if(pxPerMm<=0)fail('INVALID_INPUT','Preview must be at least 5 pixels on each side');
      const dx=(width-b.width*pxPerMm)/2-b.minX*pxPerMm,dy=(height-b.height*pxPerMm)/2+b.maxY*pxPerMm;
      let metrics=null;
      const sync=(phase,fn)=>{const start=performance.now();const value=fn();platform.observeSync?.(phase,performance.now()-start);return value;};
      await work.step(1,'renderer-start');
      if(input.kind==='COLRv1'){
        const fontSet=platform.fontSet();
        if(typeof FontFace!=='function'||!fontSet)fail('RENDERER_GAP','Worker FontFaceSet unavailable',provenance);
        if(input.paint.paletteIndex!==0)fail('RENDERER_GAP','Native canvas cannot select a CPAL palette; choose a qualified renderer',{paletteIndex:input.paint.paletteIndex});
        if(Object.keys(input.variations??{}).length)fail('RENDERER_GAP','Variable color font requires a renderer with exact axis selection');
        const family='ArchExact_'+input.fontHash;
        const face=platform.acquireFont?await platform.acquireFont(family,input.fontBytes):new FontFace(family,input.fontBytes,{style:'normal',weight:'400'});
        try{
          await face.load();work.check();if(!platform.acquireFont)fontSet.add(face);
          const fontPx=input.unitsPerEm,fontToPx=input.emMm*pxPerMm/input.unitsPerEm;
          ctx.font=fontPx+'px "'+family+'"';ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.direction='ltr';
          ctx.fontKerning='normal';
          if('fontStretch' in ctx)ctx.fontStretch='normal';
          if('fontVariantCaps' in ctx)ctx.fontVariantCaps='normal';
          const measured=sync('measure-text',()=>ctx.measureText(input.text)),expected=input.advanceMm*pxPerMm,actual=measured.width*fontToPx;
          // One exact catalog token/glyph is shaped again by the established native renderer.
          // HarfBuzz offsets are not added: fillText applies its own full-run positioning once.
          if(Math.abs(actual-expected)>Math.max(.05,Math.abs(expected)*.0001))
            fail('RENDERER_GAP','Native advance differs from the verified HarfBuzz run',{expected,actual});
          const c=input.paint.foreground;ctx.fillStyle='rgba('+[c.red,c.green,c.blue,c.alpha/255].join(',')+')';
          // Integer UPEM font size avoids native fractional CSS font-size advance quantization.
          ctx.setTransform(fontToPx,0,0,fontToPx,dx,dy);sync('draw-color-font',()=>ctx.fillText(input.text,0,0));ctx.resetTransform();
          metrics={advancePx:actual,expectedAdvancePx:expected,nativeEmPx:fontPx};
        }catch(error){
          if(error?.code)throw error;
          fail('RENDERER_GAP','Exact color font failed to render',{reason:String(error?.message??error),...provenance});
        }finally{if(!platform.acquireFont)fontSet.delete(face);}
      }else if(input.kind==='CBDT/CBLC'){
        if(typeof createImageBitmap!=='function')fail('RENDERER_GAP','Worker PNG decoder unavailable',provenance);
        let bitmap;
        try{
          bitmap=await createImageBitmap(new Blob([input.pngBytes],{type:'image/png'}),{colorSpaceConversion:'default',premultiplyAlpha:'default'});
          work.check();
          if(bitmap.width!==input.pngWidth||bitmap.height!==input.pngHeight)fail('INVALID_BITMAP','PNG decoded dimensions differ');
          const e=input.bitmapBoxMm;
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
          sync('draw-bitmap',()=>ctx.drawImage(bitmap,dx+e.minX*pxPerMm,dy-e.maxY*pxPerMm,e.width*pxPerMm,e.height*pxPerMm));
        }catch(error){
          if(error?.code)throw error;fail('RENDERER_GAP','Original CBDT PNG failed to decode',{reason:String(error?.message??error),...provenance});
        }finally{bitmap?.close();}
      }else fail('RENDERER_GAP','This renderer only accepts original COLRv1 fonts or CBDT PNG');
      await work.step(width*height,'renderer-readback');
      const rgba=new Uint8Array(sync('read-rgba',()=>ctx.getImageData(0,0,width,height)).data);
      let visible=0;
      for(let i=3;i<rgba.length;i+=4)if(rgba[i])visible++;
      if(!visible)fail('RENDERER_GAP','Native renderer produced no visible pixels');
      platform.releaseCanvas?.(canvas);
      return {width,height,rgba,sha256:await hash(rgba),renderer:{...provenance},metrics,
        pixelToSourceMm:[1/pxPerMm,0,0,-1/pxPerMm,-dx/pxPerMm,dy/pxPerMm],
        sampling:{paddingPx:2,pxPerMm,filter:'native-antialias/image-smoothing-high',alpha:'straight-8bit-after-native-premultiplied-readback'}};
    },
  });
}
