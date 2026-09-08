// Deliberate fault injection: a real dedicated Worker enters a call which
// never returns. Used only to verify watchdog termination/main responsiveness.
const memory=new SharedArrayBuffer(16);
self.onmessage=({data})=>{
  if(data.type==='init')postMessage({type:'ready',memory,controlOffset:0,abi:1});
  if(data.type==='build'){
    postMessage({type:'running',requestId:data.requestId,memory,controlOffset:0});
    while(true){Atomics.load(new Int32Array(memory),3);}
  }
};
