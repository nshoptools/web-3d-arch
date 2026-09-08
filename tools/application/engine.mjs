import {resolve} from 'node:path';
import {checked,hash,need,put,pin} from './core.mjs';
/** The sole permitted derivation. Quote styles and every other byte stay intact. */
export function deriveWrapper(moduleBytes,wasmBytes){
 need(moduleBytes instanceof Uint8Array&&wasmBytes instanceof Uint8Array,'ENGINE_BYTES_REQUIRED');
 const original=Buffer.from(moduleBytes),text=new TextDecoder('utf-8',{fatal:true}).decode(original),wasmSHA256=hash(wasmBytes);
 need(Buffer.from(text).equals(original),'ENGINE_UTF8');
 const matches=[...text.matchAll(/(["'])arch-kernel\.wasm\1/g)];need(matches.length===2,'ENGINE_LITERAL_COUNT');
 need([...text.matchAll(/arch-kernel\.wasm/g)].length===2,'ENGINE_UNEXPECTED_REFERENCE');
 const wasmName='arch-kernel.'+wasmSHA256+'.wasm',bytes=Buffer.from(text.replace(/(["'])arch-kernel\.wasm\1/g,(_,quote)=>quote+wasmName+quote));
 const moduleSHA256=hash(bytes),moduleName='arch-kernel.'+moduleSHA256+'.mjs';
 return {bytes,receipt:{version:'arch-engine-wrapper-derivation/1',sourceWrapperSHA256:hash(original),sourceWrapperBytes:original.length,wasmSHA256,wasmBytes:wasmBytes.length,
  occurrences:matches.map(m=>({offset:Buffer.byteLength(text.slice(0,m.index)),quote:m[1]})),replacementCount:2,originalLiteral:'arch-kernel.wasm',binaryRequest:wasmName,moduleSHA256,moduleBytes:bytes.length,moduleName,wasmName}};
}
export function writeEngine(owned,out){const wasm=checked(owned.wasm),d=deriveWrapper(checked(owned.module),wasm);put(resolve(out,d.receipt.moduleName),d.bytes);put(resolve(out,d.receipt.wasmName),wasm);
 return {...d.receipt,module:pin(resolve(out,d.receipt.moduleName)),wasm:pin(resolve(out,d.receipt.wasmName))};}
