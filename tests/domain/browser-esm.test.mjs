import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
test('all runtime ESM modules execute in a browser-like realm with no Node, DOM, network or dependencies',async()=>{
  assert.equal(typeof vm.SourceTextModule,'function','Run Node with --experimental-vm-modules.');
  const root=new URL('../../',import.meta.url);
  const context=vm.createContext({TextEncoder});
  const cache=new Map();
  const load=async url=>{
    assert.ok(url.href.startsWith(root.href));
    if(cache.has(url.href))return cache.get(url.href);
    const mod=new vm.SourceTextModule(await readFile(url,'utf8'),{context,identifier:url.href});
    cache.set(url.href,mod); return mod;
  };
  const entry=new vm.SourceTextModule(`
    import {createProject,createSchedule,previewCommand,commitPreview,effectiveValues,parseDecimal,
      serializeProjectDocument,openProjectDocument,layerBoundary} from './src/domain/index.mjs';
    const initial=createProject({content:{source:'browser fixture',overrides:{color:'#abcdef'}}});
    const preview=previewCommand(initial,{id:'product.switch',args:{product:'clicky'}});
    const next=commitPreview(initial,preview);
    const document=openProjectDocument(serializeProjectDocument(next.state));
    export const result=JSON.stringify({
      process:typeof globalThis.process,Buffer:typeof globalThis.Buffer,fetch:typeof globalThis.fetch,
      ok:next.ok,product:next.state.product,source:next.state.content.source,
      size:effectiveValues(next.state).size,decimal:parseDecimal('0,05').value,
      z:layerBoundary(12,createSchedule({firstLayerHeight:0.16})),reopened:document.status
    });
  `,{context,identifier:new URL('browser-fixture.mjs',root).href});
  await entry.link(async(specifier,parent)=>{
    assert.ok(specifier.startsWith('./')||specifier.startsWith('../'),'Runtime may only use relative ESM imports.');
    return load(new URL(specifier,parent.identifier));
  });
  await entry.evaluate();
  assert.deepEqual(JSON.parse(entry.namespace.result),{
    process:'undefined',Buffer:'undefined',fetch:'undefined',ok:true,product:'clicky',
    source:'browser fixture',size:40,decimal:0.05,z:2.36,reopened:'editable'
  });
});
