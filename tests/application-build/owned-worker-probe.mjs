// Test-only observer; never compiled or copied into a release package.
const send=self.postMessage.bind(self);
self.onmessage=async({data})=>{
 const observed={fetches:[],instantiate:0,streaming:0,constructors:0,binarySHA256:null};
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const realFetch=self.fetch.bind(self);
 self.fetch=(...args)=>{const url=String(args[0]);observed.fetches.push(url);if(url.endsWith('.wasm')&&observed.fetches.filter(x=>x.endsWith('.wasm')).length>1)throw Error('TEST_SECOND_WASM_FETCH');return realFetch(...args);};
 const instantiate=WebAssembly.instantiate.bind(WebAssembly),streaming=WebAssembly.instantiateStreaming?.bind(WebAssembly),Instance=WebAssembly.Instance;
 WebAssembly.instantiate=async(bytes,imports)=>{observed.instantiate++;if(bytes instanceof WebAssembly.Module)throw Error('TEST_UNOWNED_COMPILED_MODULE');observed.binarySHA256=await digest(bytes);return instantiate(bytes,imports);};
 if(streaming)WebAssembly.instantiateStreaming=()=>{observed.streaming++;throw Error('TEST_STREAMING_FORBIDDEN');};
 WebAssembly.Instance=new Proxy(Instance,{construct(target,args){observed.constructors++;return Reflect.construct(target,args);}});
 self.postMessage=(event,transfers)=>send({event,observed:structuredClone(observed)},transfers);
 try{await import(data.workerURL);const handle=self.onmessage;self.onmessage=event=>handle(event);await handle({data:data.init});}
 catch(error){send({probeError:String(error),observed});}
};
