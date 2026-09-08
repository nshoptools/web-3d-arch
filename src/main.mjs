import {bootProductApplication} from './integration/product-entry.mjs';
const host=document.getElementById('app');
const abort=new AbortController();let application;
window.addEventListener('pagehide',()=>{abort.abort();void application?.dispose();},{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
try{application=await bootProductApplication({element:host,entryURL:import.meta.url,signal:abort.signal});}
catch(error){if(!abort.signal.aborted&&host){const message=document.createElement('p');message.className='bootstrap-message';message.setAttribute('role','alert');message.textContent='Không mở được ứng dụng. Hãy tải lại trang hoặc báo chủ dự án mã lỗi: '+String(error.code??error.message??'APPLICATION_START_FAILED').slice(0,100);host.replaceChildren(message);}}
