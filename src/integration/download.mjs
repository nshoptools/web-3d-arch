/** Delivery of an explicitly requested artifact. Keep each handed-off URL alive
 * for the browser, while bounding both retained bytes and small receipt URLs. */
export function createBrowserDownload(){
  const urls=new Map(),maxBytes=256*1024*1024;let retainedBytes=0;
  function revoke(url){const entry=urls.get(url);if(!entry)return;clearTimeout(entry.timer);urls.delete(url);retainedBytes-=entry.bytes;URL.revokeObjectURL(url);}
  return {async save({bytes,mimeType,filename,signal}){
    if(signal.aborted)throw Object.assign(new Error('CANCELLED'),{code:'CANCELLED'});
    if(!(bytes instanceof Uint8Array)||bytes.byteLength>maxBytes||typeof filename!=='string'||!filename||/[\x00-\x1f/\\]/.test(filename))throw Object.assign(new Error('DOWNLOAD_SCHEMA'),{code:'DOWNLOAD_SCHEMA'});
    // Geometry and its small receipt are separate requested files. A four-URL
    // limit incorrectly blocked the third ordinary export within30 seconds.
    if(urls.size>=32||retainedBytes+bytes.byteLength>maxBytes)throw Object.assign(new Error('Đang giữ nhiều tệp tải xuống; hãy thử lại sau ít giây.'),{code:'DOWNLOAD_BUSY'});
    const url=URL.createObjectURL(new Blob([bytes],{type:mimeType}));
    urls.set(url,{bytes:bytes.byteLength,timer:setTimeout(()=>revoke(url),30000)});retainedBytes+=bytes.byteLength;
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.hidden=true;document.body.appendChild(anchor);
    try{anchor.click();}catch(error){revoke(url);throw error;}finally{anchor.remove();}
  },reset(){for(const url of urls.keys())revoke(url);}};
}
