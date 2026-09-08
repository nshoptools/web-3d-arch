import {act,useLayoutEffect,StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BridgeProvider} from '@review/ui/core/bridge.tsx';
import {UiStateProvider,useUi,useUiActions} from '@review/ui/core/ui-state.tsx';
import {AppShell} from '@review/ui/AppShell.tsx';
import {DeferredBridge} from './deferred-bridge.ts';
import '@review/ui/styles/tokens.css';import '@review/ui/styles/base.css';import '@review/ui/styles/layout.css';import '@review/ui/styles/components.css';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:false});
let root:any=null,mock:any,observed:any,actions:any;
const fields=()=>[
{id:'filename',label:'Tên tệp',kind:'text',value:'Mô hình',enabled:true,hint:'Nhập tên nguyên văn.'},
{id:'errorMm',label:'Sai số hình học',kind:'number',value:'0.004',unit:'mm',min:'0.000001',max:'1',step:'0.000001',enabled:true,hint:'Giá trị tính bằng milimét.'},
{id:'inspection',label:'Xuất để kiểm tra',kind:'boolean',value:false,enabled:true,hint:'Bật rõ ràng để xuất kết quả chưa đạt.'},
{id:'orientation',label:'Hướng chế tạo',kind:'select',value:'up',options:[{value:'up',label:'Hoa văn hướng lên'},{value:'down',label:'Lật hoa văn xuống và đặt đáy trên bàn'}],enabled:true},
];
const option=(revision=0,values:any={})=>({id:'stl-union',label:'STL hợp nhất',extension:'stl',enabled:true,verdict:'unverified',prerequisite:'matching-model',configuration:{projectRevision:revision,fields:fields().map(f=>({...f,...(f.id in values?{value:values[f.id]}:{})}))}});
function Observe(){const {state}=useUi();observed=state;actions=useUiActions();useLayoutEffect(()=>actions.setSection('export',true),[]);return null}
async function change(fn:()=>unknown){globalThis.IS_REACT_ACT_ENVIRONMENT=true;try{await act(async()=>{await fn()})}finally{globalThis.IS_REACT_ACT_ENVIRONMENT=false}}
const ui={
async reset(){if(root)await change(()=>root.unmount());mock=new DeferredBridge();mock.value={...mock.value,version:'Independent frontend fixture / captured source',project:{...mock.value.project,step:2,visibleModelRevision:0,visibleModelStale:false},exports:[option()],exportReceipts:[]};root=createRoot(document.getElementById('root')!);await change(()=>root.render(<StrictMode><BridgeProvider bridge={mock.api}><UiStateProvider><Observe/><AppShell/></UiStateProvider></BridgeProvider></StrictMode>));return this.read()},
async publish(revision:number,values:any={}){await change(()=>{const prev=mock.value.exports[0]??option();mock.value={...mock.value,exports:[{...prev,configuration:{...prev.configuration,projectRevision:revision,fields:prev.configuration.fields.map((f:any)=>({...f,...(f.id in values?{value:values[f.id]}:{})}))}}]};mock.change(undefined,undefined,revision)})},
async update(patch:any){await change(()=>{mock.value={...mock.value,...patch,project:{...mock.value.project,...patch.project},session:{...mock.value.session,...patch.session}};mock.change()})},
async aba(kind:string){await change(()=>{if(kind==='account'){mock.change('B');mock.change('A')}else{mock.change(undefined,'P2');mock.change(undefined,'P1')}})},
async identity(account?:string,project?:string){await change(()=>mock.change(account,project))},
async settle(id:number,result:any,rejected=false){await change(()=>mock.settle(id,result,rejected))},
async section(section:string){await change(()=>actions.setSection(section,true))},
async emitInput(selector:string,value:string){await change(()=>{const e=document.querySelector(selector) as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))})},
read(){return {state:observed,snapshot:mock.value,calls:mock.calls.map((c:any)=>({id:c.id,method:c.method,input:c.input,pending:c.pending})),notifications:mock.notifications,html:document.body.innerText}},
async dispose(){if(root)await change(()=>root.unmount());root=null}
};Object.assign(window,{review:ui});await ui.reset();



