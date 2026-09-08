import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {ViewportError,readArchSnapshot,gpuPart,centerProposal} from './arch-view.mjs';

const world=([x,y,z])=>new THREE.Vector3(x,z,-y);
function disposeObject(group){group.traverse(node=>{node.geometry?.dispose();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());else node.material?.dispose();});}

/** Three owns presentation resources only. setModel borrows a snapshot lease
 * synchronously; this class never acquires, releases, or edits kernel memory. */
export class ThreeViewport {
  constructor(host,{onSelection=()=>{},onDiagnostic=()=>{}}={}) {
    if(!host?.appendChild)throw new ViewportError('VIEWPORT_HOST');
    this.host=host;this.onSelection=onSelection;this.onDiagnostic=onDiagnostic;
    this.disposed=false;this.visible=true;this.frame=0;this.model=null;this.revision=null;
    this.presentationRevision=0;this.instanceId=crypto.randomUUID();this.displayedLeaseId=null;this.contextLost=false;
    this.exploded=false;this.selection=null;this.printer=null;this.bounds=null;
    this.abort=new AbortController();
    try{this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'default'});}
    catch{throw new ViewportError('WEBGL_UNAVAILABLE');}
    const canvas=this.renderer.domElement;canvas.setAttribute('aria-hidden','true');
    Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',touchAction:'none'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2));
    this.renderer.setClearColor(0x101827,0);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(38,1,0.01,100000);
    this.camera.position.set(55,50,65);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=false;
    this.controls.minDistance=.01;this.controls.maxDistance=40000;
    this.controls.addEventListener('change',()=>this.invalidate());
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x6c7890,2.5));
    const light=new THREE.DirectionalLight(0xffffff,2.7);light.position.set(-25,60,40);this.scene.add(light);
    this.grid=new THREE.GridHelper(200,20,0x566174,0x8f99a9);this.grid.position.y=-.015;this.scene.add(this.grid);
    this.measure=new THREE.Box3Helper(new THREE.Box3(),0xf2b857);this.measure.visible=false;this.scene.add(this.measure);
    this.measureEnabled=false;this.pointer=null;this.raycaster=new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown',event=>{if(event.button===0)this.pointer={x:event.clientX,y:event.clientY,id:event.pointerId};},{signal:this.abort.signal});
    this.renderer.domElement.addEventListener('pointercancel',()=>{this.pointer=null;},{signal:this.abort.signal});
    this.renderer.domElement.addEventListener('pointerup',event=>{
      const down=this.pointer;this.pointer=null;
      if(!down||event.pointerId!==down.id||Math.hypot(event.clientX-down.x,event.clientY-down.y)>4)return;
      this.pick(event.clientX,event.clientY);
    },{signal:this.abort.signal});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.invalidate();this.onDiagnostic({code:'WEBGL_CONTEXT_LOST',severity:'error',message:'Khung 3D mất kết nối đồ họa. Dữ liệu dự án vẫn được giữ.'});},{signal:this.abort.signal});
    canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.invalidate();},{signal:this.abort.signal});
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    host.appendChild(canvas);this.resizeObserver.observe(host);this.resize();
  }
  resize(){if(this.disposed)return;const {width,height}=this.host.getBoundingClientRect();if(width<=0||height<=0)return;
    if(width===this.width&&height===this.height)return;
    this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.invalidate();}
  invalidate(){if(this.disposed)return;this.presentationRevision++;if(!this.visible||this.contextLost||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(!this.disposed&&this.visible&&!this.contextLost)this.renderer.render(this.scene,this.camera);});}
  setVisible(visible){if(this.visible===!!visible)return;this.visible=!!visible;this.renderer.domElement.hidden=!this.visible;this.renderer.domElement.style.display=this.visible?'block':'none';if(this.visible)this.resize();this.invalidate();}
  setModel({lease,revision,blocks=[]}) {
    if(this.disposed)throw new ViewportError('VIEWPORT_DISPOSED');
    if(!Number.isSafeInteger(revision)||revision<0)throw new ViewportError('PROJECT_REVISION');
    const snapshot=readArchSnapshot(lease.bytes());
    if(snapshot.generation!==lease.generation)throw new ViewportError('SNAPSHOT_GENERATION');
    const next=new THREE.Group();next.rotation.x=-Math.PI/2;
    try {
      for(const part of snapshot.parts) {
        const arrays=gpuPart(snapshot,part),geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.BufferAttribute(arrays.positions,3));
        geometry.setIndex(new THREE.BufferAttribute(arrays.indices,1));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
        const rgba=part.color,color=new THREE.Color().setRGB((rgba>>>24)/255,((rgba>>>16)&255)/255,((rgba>>>8)&255)/255,THREE.SRGBColorSpace);
        const material=new THREE.MeshStandardMaterial({color,roughness:.56,metalness:0,flatShading:true});
        const mesh=new THREE.Mesh(geometry,material),block=blocks[part.index];
        mesh.userData={blockId:block?.id??`part:${part.index}`,label:block?.label??`Khối ${part.index+1}`,part:part.index};
        next.add(mesh);
      }
    }catch(error){disposeObject(next);throw error;}
    const previous=this.model;this.scene.add(next);this.model=next;this.bounds=snapshot.bounds;this.revision=revision;this.displayedLeaseId=typeof lease.leaseId==='string'?lease.leaseId:null;this.exploded=false;
    if(previous){this.scene.remove(previous);disposeObject(previous);}
    this.setSelection(this.selection);this.updateMeasure();this.fit();
    return {generation:snapshot.generation,revision,parts:snapshot.parts.length,triangles:snapshot.triangles.length/3,boundsMm:snapshot.bounds};
  }
  setSelection(blockId){this.selection=blockId;this.model?.traverse(node=>{if(!node.isMesh)return;node.material.emissive.setHex(node.userData.blockId===blockId?0x253342:0x000000);});this.invalidate();}
  pick(clientX,clientY){if(!this.model)return null;const rect=this.renderer.domElement.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;
    this.raycaster.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),this.camera);
    this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);
    const hit=this.raycaster.intersectObjects(this.model.children,false)[0],id=hit?.object.userData.blockId??null;
    this.setSelection(id);this.onSelection(id);return id;}
  fit(direction=null){if(!this.bounds)return;
    this.model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(this.model);
    const center=box.getCenter(new THREE.Vector3()),radius=Math.max(.01,box.getSize(new THREE.Vector3()).length()/2);
    const vertical=THREE.MathUtils.degToRad(this.camera.fov)/2,horizontal=Math.atan(Math.tan(vertical)*this.camera.aspect);
    const distance=radius/Math.sin(Math.min(vertical,horizontal))*1.16;
    let ray=direction?new THREE.Vector3(...direction):this.camera.position.clone().sub(this.controls.target);
    if(ray.lengthSq()<1e-12)ray.set(1,1,1);ray.normalize();
    this.camera.position.copy(center).addScaledVector(ray,distance);this.controls.target.copy(center);
    this.camera.near=Math.max(.001,distance-radius*2);this.camera.far=Math.max(100,distance+radius*10);this.camera.updateProjectionMatrix();this.controls.update();this.invalidate();}
  setPrinter(profile){
    if(profile!==null)centerProposal({center:[0,0,0],min:[0,0,0]},profile.bedPolygonMm);
    if(this.bed){this.scene.remove(this.bed);disposeObject(this.bed);this.bed=null;}
    this.printer=profile===null?null:structuredClone(profile);
    if(profile){this.bed=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(profile.bedPolygonMm.map(([x,y])=>world([x,y,0]))),new THREE.LineBasicMaterial({color:0x5b94b5}));this.scene.add(this.bed);}
    this.invalidate();
  }
  action(action){if(this.disposed)throw new ViewportError('VIEWPORT_DISPOSED');
    switch(action){
      case 'fit':this.fit();break;
      case 'top':this.fit([0,1,.00001]);break;
      case 'front':this.fit([0,0,1]);break;
      case 'perspective':this.fit([1,.85,1]);break;
      case 'toggle-grid':this.grid.visible=!this.grid.visible;this.invalidate();break;
      case 'toggle-measure':this.measureEnabled=!this.measureEnabled;this.updateMeasure();break;
      case 'center':return centerProposal(this.bounds,this.printer?.bedPolygonMm);
      case 'explode':this.exploded=!this.exploded;this.model?.children.forEach((node,index)=>{node.position.z=this.exploded?index*Math.max(2,(this.bounds?.size[2]??2)*.65):0;});this.updateMeasure();this.fit();break;
      default:throw new ViewportError('VIEWPORT_ACTION');
    }
    return {ok:true};
  }
  updateMeasure(){if(this.model&&this.bounds){this.model.updateMatrixWorld(true);this.measure.box.setFromObject(this.model);this.measure.visible=this.measureEnabled;}else this.measure.visible=false;this.invalidate();}
  describeFrame(){
    const box=this.host.getBoundingClientRect();
    if(this.disposed||!this.visible||!this.model||box.width<=0||box.height<=0||this.contextLost||this.renderer.getContext().isContextLost())return {status:'disabled',reasonCode:'PNG_VIEWPORT_UNAVAILABLE',reason:'Cần khung 3D đang hiển thị và kết nối đồ họa hoạt động.'};
    const canvas=this.renderer.domElement,width=canvas.width,height=canvas.height;
    if(width<=0||height<=0||width*height>16777216)return {status:'disabled',reasonCode:'PNG_VIEWPORT_BUDGET',reason:'Kích thước ảnh vượt giới hạn 16 triệu pixel.'};
    const frameKey=this.instanceId+':'+this.presentationRevision;
    return {status:'ready',key:frameKey,frameKey,width,height,view:this.exploded?'assembly':'model',displayedRevision:this.revision,displayedLeaseId:this.displayedLeaseId,
      provenance:{renderer:'three-viewport/1',cameraPosition:this.camera.position.toArray(),cameraQuaternion:this.camera.quaternion.toArray(),target:this.controls.target.toArray(),fieldOfView:this.camera.fov,grid:this.grid.visible,measure:this.measureEnabled,selectedBlock:this.selection,scope:'Displayed GPU frame; no manufacturing geometry transformation.'}};
  }
  async capturePNG(descriptor,{signal}={}){
    const check=()=>{if(signal?.aborted)throw new ViewportError('CANCELLED');const live=this.describeFrame();if(live.status!=='ready'||live.key!==descriptor.key||live.frameKey!==descriptor.frameKey||live.width!==descriptor.width||live.height!==descriptor.height)throw new ViewportError('PNG_FRAME_STALE');};
    check();
    // Capture immediately after an actual draw; preserveDrawingBuffer is not needed.
    this.renderer.render(this.scene,this.camera);
    const blob=await new Promise((resolve,reject)=>{try{this.renderer.domElement.toBlob(resolve,'image/png');}catch{reject(new ViewportError('PNG_CAPTURE_FAILED'));}});
    check();if(!blob||blob.type!=='image/png'||blob.size>64*1024*1024)throw new ViewportError('PNG_CAPTURE_FAILED');
    const bytes=new Uint8Array(await blob.arrayBuffer());check();return {bytes,key:descriptor.key,frameKey:descriptor.frameKey};
  }
  clear(){if(this.model){this.scene.remove(this.model);disposeObject(this.model);}this.model=null;this.bounds=null;this.revision=null;this.displayedLeaseId=null;this.selection=null;this.updateMeasure();}
  dispose(){if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.frame);this.frame=0;this.abort.abort();this.resizeObserver.disconnect();this.controls.dispose();
    if(this.model)disposeObject(this.model);if(this.bed)disposeObject(this.bed);disposeObject(this.grid);disposeObject(this.measure);this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();this.scene.clear();this.model=null;}
}
