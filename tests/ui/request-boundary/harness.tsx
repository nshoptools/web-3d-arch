import { act, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BridgeProvider, useAsyncAction, useBridge, useRequestContext, useRunCommand, useSnapshot } from '../../../src/ui/core/bridge.tsx'
import { UiStateProvider, useUi, useUiActions } from '../../../src/ui/core/ui-state.tsx'
import { accountIdentity, requestKey } from '../../../src/ui/core/identity.ts'
import { useDroppedAnswerLog, useRequestOwner } from '../../../src/ui/core/request-owner.ts'
import { DialogHost } from '../../../src/ui/dialogs/DialogHost.tsx'
import { LiveRegions, Toasts } from '../../../src/ui/components/Feedback.tsx'
import { DeferredBridge } from './deferred-bridge.ts'
import { ExportConfiguration } from '../../../src/ui/sections/ExportConfiguration.tsx'
import type { CommandResult } from '../../../src/contracts/app-bridge.ts'

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
let root:Root|null=null, mock:DeferredBridge, observed:unknown, commits:string[]=[], contextRead:()=>unknown=()=>null
const track:Promise<unknown>[]=[]
function started(p:Promise<unknown>){track.push(p)}
function Observe(){const {state}=useUi();observed=state;return <><output data-testid="log">{state.log.map(l=><p key={l.id} data-code={l.code}>{l.text} {l.detail}</p>)}</output><output data-testid="state">{JSON.stringify(state)}</output></>}
function Context(){const s=useSnapshot(),c=useRequestContext();contextRead=c.read;useLayoutEffect(()=>{commits.push(JSON.stringify([s.session.user?.id,s.project.id,s.project.revision]))});return <output data-testid="context">{s.session.user?.id}/{s.project.id}/{s.project.revision}</output>}
function Raw(){const b=useBridge(),action=useAsyncAction(()=>b.importFile(new File(['synthetic'],'test.bin')),{success:'CURRENT_SUCCESS',announce:'CURRENT_ANNOUNCEMENT'});return <button data-testid="raw" onClick={()=>started(action.run())} aria-busy={action.pending}>Raw bridge action</button>}
function WrappedNavigation({id}:{id:string}){const run=useRunCommand();const action=useAsyncAction(async()=>{await run({type:'project.open',id})});return <button data-testid={'wrapped-'+id} onClick={()=>started(action.run())}>Wrapped navigation {id}</button>}
function AutoRequest(){const bridge=useBridge(),requests=useRequestContext();const action=useAsyncAction(()=>bridge.exportFile('synthetic-passive'));
 useEffect(()=>{if(!requests.read().active)throw Error('Provider context not active before child passive request');started(action.run())},[]);return <output>Passive request mounted</output>}
function Navigation(){const run=useRunCommand();return <>
 <button data-testid="nav1" onClick={()=>started(run({type:'project.open',id:'P2'},{success:'NAV1_SUCCESS'}))}>Open P2</button>
 <button data-testid="nav2" onClick={()=>started(run({type:'project.create',product:'keychain'},{success:'NAV2_SUCCESS'}))}>Create P3</button>
 <button data-testid="nav-delete" onClick={()=>started(run({type:'project.delete',id:'P1',confirmed:false},{success:'DELETE_SUCCESS'}))}>Delete P1</button>
 <button data-testid="save" onClick={()=>started(run({type:'project.save'},{success:'SAVE_SUCCESS'}))}>Save</button></>}
function Keyed({account=false}:{account?:boolean}){
 const [parts,setParts]=useState(['a\u001fb','c']),key=requestKey(parts),ref=useRef(key);ref.current=key
 const owner=useRequestOwner(key,account?accountIdentity:undefined),drop=useDroppedAnswerLog(),[answer,setAnswer]=useState(''),b=useBridge()
 async function begin(){const ticket=owner.begin();const result=await b.queryFonts('synthetic');const claim=owner.claim(ticket,ref.current);if(claim!=='owner'){drop(claim,'danh sách kiểm thử');return}setAnswer(JSON.stringify(result))}
 const p=account?'account-key':'project-key'
 return <section><button data-testid={p} onClick={()=>started(begin())}>Keyed request</button><button data-testid={p+'-change'} onClick={()=>setParts(['a','b\u001fc'])}>Change tuple</button><output data-testid={p+'-answer'}>{answer}</output></section>
}
function ExportControls(){const s=useSnapshot(),option=s.exports[0];return option?.configuration?<ExportConfiguration option={option} configuration={option.configuration} writeBlocked={null}/>:null}
function Driver(){const [provider,setProvider]=useState(true),[caller,setCaller]=useState(true),[auto,setAuto]=useState(false),[exports,setExports]=useState(false),actions=useUiActions();return <>
 <button data-testid="account-aba" onClick={()=>{mock.change('B');mock.change('A')}}>Account A B A in one handler</button>
 <button data-testid="project-aba" onClick={()=>{mock.change(undefined,'P2');mock.change(undefined,'P1')}}>Project P1 P2 P1 in one handler</button>
 <button data-testid="project-next" onClick={()=>mock.change(undefined,'P2')}>Project P2</button>
 <button data-testid="revision" onClick={()=>mock.change(undefined,undefined,mock.value.project.revision+1)}>Edit revision</button>
 <button data-testid="unmount" onClick={()=>setCaller(false)}>Unmount caller</button>
 <button data-testid="retire" onClick={()=>setProvider(false)}>Retire provider</button>
 <button data-testid="ai" onClick={()=>actions.openDialog({kind:'ai-generate'})}>Open actual AI dialog</button>
 <button data-testid="exports" onClick={()=>setExports(true)}>Open actual export fields</button>
 {provider&&<BridgeProvider bridge={mock.api}><Context/>{caller&&<><Raw/><Navigation/><WrappedNavigation id="P2"/><WrappedNavigation id="P3"/><Keyed/><Keyed account/>{exports&&<ExportControls/>}</>}{auto&&<AutoRequest/>}<DialogHost/></BridgeProvider>}
 <button data-testid="passive" onClick={()=>setAuto(true)}>Mount passive request</button><Toasts/><LiveRegions/><Observe/>
 </>}
async function change(fn:()=>void|Promise<void>){await act(async()=>{await fn()})}
export const boundary={
 async reset(){if(root)await change(()=>root!.unmount());mock=new DeferredBridge();track.length=0;commits=[];root=createRoot(document.getElementById('root')!);await change(()=>root!.render(<UiStateProvider><Driver/></UiStateProvider>));return this.read()},
 async click(selector:string){await change(()=>{const e=document.querySelector<HTMLButtonElement>(selector);if(!e)throw Error('Missing '+selector);e.click()})},
 async input(selector:string,value:string){await change(()=>{const e=document.querySelector<HTMLInputElement|HTMLTextAreaElement>(selector);if(!e)throw Error('Missing '+selector);const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))})},
 async inputSequence(selector:string,values:string[]){await change(()=>{const e=document.querySelector<HTMLInputElement|HTMLTextAreaElement>(selector);if(!e)throw Error('Missing '+selector);const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;for(const value of values){Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})},
 async file(bytes:number[]){await change(()=>{const input=document.querySelector<HTMLInputElement>('input[type=file]');if(!input)throw Error('Choose file through actual handler first');const d=new DataTransfer();d.items.add(new File([new Uint8Array(bytes)],'same.png',{type:'image/png',lastModified:1000}));input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}))})},
 async settle(id:number,value:unknown,rejected=false){await change(()=>mock.settle(id,value,rejected))},
 async changeProject(project:string){await change(()=>mock.change(undefined,project))},
 async exportFields(revision:number,values:{filename?:string;errorMm?:string;inspection?:boolean}={}){await change(()=>{
  mock.value={...mock.value,exports:[{id:'stl-union',label:'TEST export',extension:'stl',enabled:false,verdict:'unverified',prerequisite:'matching-model',configuration:{projectRevision:revision,fields:[
   {id:'filename',label:'TEST filename',kind:'text',value:values.filename??'Mô hình',enabled:true},
   {id:'errorMm',label:'TEST decimal',kind:'number',value:values.errorMm??'0.004',enabled:true,unit:'mm'},
   {id:'inspection',label:'TEST inspection',kind:'boolean',value:values.inspection??false,enabled:true},
  ]}}]};mock.change(undefined,undefined,revision)
 })},
 async key(selector:string,key:string){await change(()=>{const e=document.querySelector<HTMLInputElement>(selector);if(!e)throw Error('Missing input');e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))})},
 read(){return {state:observed,context:contextRead(),commits:[...commits],notifications:[...mock.notifications],calls:mock.calls.map(c=>({id:c.id,method:c.method,pending:c.pending,input:c.input instanceof File?{name:c.input.name}:c.input})),listeners:mock.listeners.size,html:document.body.innerText}},
 async referenceBytes(id:number){const r=mock.calls.find(c=>c.id===id)?.input as {reference?:File};return r?.reference?{bytes:Array.from(new Uint8Array(await r.reference.arrayBuffer())),name:r.reference.name,size:r.reference.size,type:r.reference.type,lastModified:r.reference.lastModified}:null},
 async dispose(){await change(()=>root?.unmount());root=null},
}
Object.assign(window,{boundary})
await boundary.reset()


