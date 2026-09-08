// Test-only dedicated Worker. Bulk evidence is a transferred ArrayBuffer.
self.onmessage=async ({data})=>{
    try {
        importScripts(data.moduleUrl);
        const module=await RasterParity({noInitialRun:true,print:()=>{},printErr:()=>{}});
        const offset=module._raster_parity_run();
        const length=module._raster_parity_len();
        // Calls may grow memory: retrieve the CURRENT view after both calls.
        const bytes=module.HEAPU8.slice(offset,offset+length);
        self.postMessage({bytes:bytes.buffer},[bytes.buffer]);
    } catch(e) {self.postMessage({error:String(e.stack||e)});}
};

