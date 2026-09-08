import {LIMITS,fail,finite,outline,emptyBounds,extendBounds,finishBounds,multiply,transform} from './source-contract.mjs';

const identity=[1,0,0,1,0,0];
const rgba=c=>{for(const k of ['red','green','blue','alpha'])finite(c?.[k],0,255,'paint '+k,true);};
const numbers=(a,n)=>{if(!Array.isArray(a)||a.length!==n)fail('INVALID_PAINT','Paint parameter arity');a.forEach(v=>finite(v,-10000000,10000000,'paint parameter'));};
/** Validation only: no graph flattening, reordering, boolean or gradient conversion. */
export function validatePaint(paint,scale,work){
  const ops=paint?.operations;
  if(!Array.isArray(ops)||ops.length>LIMITS.paintOperations)fail('RESOURCE_LIMIT','Paint operation limit');
  const stack=[],bounds=emptyBounds();let matrix=identity,paintCount=0,stops=0,rootClip=false;
  for(const op of ops){
    const type=op?.op;
    if(type==='pushTransform'){
      numbers(op.matrix,6);stack.push({type:'transform',matrix});matrix=multiply(matrix,op.matrix);
      numbers(matrix,6);
    }else if(type==='popTransform'){
      const frame=stack.pop();if(frame?.type!=='transform')fail('INVALID_PAINT','Unbalanced transform');matrix=frame.matrix;
    }else if(type==='pushClipOutline'||type==='pushClipRectangle'){
      if(type==='pushClipOutline')outline(op.outline,work);else{
        numbers(op.rectangle,4);const [x0,y0,x1,y1]=op.rectangle;
        if(x1<=x0||y1<=y0)fail('INVALID_PAINT','Empty/reversed clip box');
      }
      // Use an outermost clip's conservative transformed control hull. Nested clips can only reduce it.
      if(!stack.some(s=>s.type==='clip')){
        const pts=type==='pushClipOutline'?op.outline.flatMap(c=>c.values):
          [op.rectangle[0],op.rectangle[1],op.rectangle[2],op.rectangle[1],op.rectangle[2],op.rectangle[3],op.rectangle[0],op.rectangle[3]];
        for(let i=0;i<pts.length;i+=2){const [x,y]=transform(matrix,pts[i],pts[i+1]);extendBounds(bounds,x*scale,y*scale);}
        rootClip=true;
      }
      stack.push({type:'clip'});
    }else if(type==='popClip'){
      if(stack.pop()?.type!=='clip')fail('INVALID_PAINT','Unbalanced clip');
    }else if(type==='pushGroup')stack.push({type:'group'});
    else if(type==='popGroup'){
      if(stack.pop()?.type!=='group')fail('INVALID_PAINT','Unbalanced group');
      finite(op.mode,0,27,'COLR composite mode',true);
    }else if(type==='solid'){rgba(op.color);paintCount++;}
    else if(['linearGradient','radialGradient','sweepGradient'].includes(type)){
      const line=op.colorLine;finite(line?.extend,0,2,'COLR extend',true);
      if(!Array.isArray(line.colorStops)||!line.colorStops.length)fail('INVALID_PAINT','Missing gradient stops');
      stops+=line.colorStops.length;if(stops>LIMITS.gradientStops)fail('RESOURCE_LIMIT','Gradient stop limit');
      let last=-Infinity;
      for(const stop of line.colorStops){finite(stop.offset,-65536,65536,'gradient offset');if(stop.offset<last)fail('INVALID_PAINT','Unsorted stops');last=stop.offset;rgba(stop.color);}
      if(type==='linearGradient')numbers(op.points,6);
      if(type==='radialGradient'){numbers(op.circles,6);finite(op.circles[2],0,10000000,'radius');finite(op.circles[5],0,10000000,'radius');}
      if(type==='sweepGradient'){numbers(op.center,2);numbers(op.angles,2);}
      paintCount++;
    }else fail('UNSUPPORTED_PAINT','Unknown paint operation; no partial graph returned',{op:type});
    if((type==='solid'||type?.endsWith('Gradient'))&&!stack.some(s=>s.type==='clip'))fail('INVALID_PAINT','Unbounded paint operation');
    if(stack.length>LIMITS.paintDepth)fail('RESOURCE_LIMIT','Paint nesting limit');
  }
  if(stack.length||!paintCount||!rootClip)fail('INVALID_PAINT','Paint must be balanced, nonempty and bounded by clips');
  const b=finishBounds(bounds);if(!b||!b.width||!b.height)fail('INVALID_PAINT','Empty paint bounds');
  return {...b,kind:'conservative-outer-clip-hull'};
}
