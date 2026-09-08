import {fail,exact,uuid,str,integer,sha,canonical,period,DAY} from './core.mjs';
import {base64Bytes,CODEC_VERSION,IMAGE_LIMITS,OUTPUT_LIMITS,THUMB_MAX_BYTES} from './image-codec.mjs';
import {checkImage} from './image-workers.mjs';
export const REFERENCE_VERSION='arch-ai-reference/1';
export const REFERENCE_LIMITS=Object.freeze({...IMAGE_LIMITS,stagedCount:8,storedBytes:32_000_000,uploadsPerDay:40,uploadBytesPerDay:64_000_000,expiresInMs:1_800_000});
export class ImageAssets{
 constructor(s,policy,accounts,clock){Object.assign(this,{s,policy,accounts,clock});this.uploading=false;}
 admitUpload(){fail(!this.uploading,429,'IMAGE_UPLOAD_BUSY');this.uploading=true;let done=false;return()=>{if(!done){done=true;this.uploading=false;}};}
 owned(user,id){const row=this.s.get('SELECT * FROM image_references WHERE id=? AND user_id=?',id,user);fail(row,404,'NOT_FOUND');return row;}
 descriptor(r){return {version:REFERENCE_VERSION,id:r.id,revision:1,sha256:r.hash,byteLength:r.byte_length,mediaType:r.media_type,width:r.width,height:r.height,projectId:r.project_id,projectRevision:r.project_revision,expiresAt:r.expires};}
 available(r){fail(r.bytes&&r.deleted===null&&r.revision===1,410,'REFERENCE_DELETED');fail(r.codec===CODEC_VERSION&&sha(r.bytes)===r.hash,409,'IMAGE_HASH_MISMATCH');return r;}
 async upload(a,b,{signal}={}){
  exact(b,['uploadId','projectId','projectRevision','mediaType','byteLength','sha256','base64']);uuid(b.uploadId);uuid(b.projectId);str(b.projectRevision,128);integer(b.byteLength,IMAGE_LIMITS.maxBytes,1);
  fail(/^[a-f0-9]{64}$/.test(b.sha256),400,'IMAGE_HASH_INVALID');fail(['image/png','image/jpeg'].includes(b.mediaType),415,'IMAGE_FORMAT_UNSUPPORTED');
  const bytes=base64Bytes(b.base64,IMAGE_LIMITS.maxBytes);fail(bytes.length===b.byteLength&&sha(bytes)===b.sha256,422,'IMAGE_HASH_MISMATCH');
  const reuse=()=>{
   const r=this.s.get('SELECT * FROM image_references WHERE id=?',b.uploadId);if(!r)return null;
   fail(r.user_id===a.user.id,409,'UPLOAD_CONFLICT');fail(r.hash===b.sha256&&r.byte_length===b.byteLength&&r.media_type===b.mediaType&&r.project_id===b.projectId&&r.project_revision===b.projectRevision&&r.session_id===a.session.public_id,409,'UPLOAD_CONFLICT');
   this.available(r);return {reference:this.descriptor(r),reused:true};
  };
  const old=reuse();if(old)return old;
  const usage=this.s.get('SELECT count(*) n,COALESCE(SUM(length(bytes)+length(thumbnail)),0) b FROM image_references WHERE user_id=? AND bytes IS NOT NULL',a.user.id);
  fail(usage.n<REFERENCE_LIMITS.stagedCount&&usage.b+b.byteLength+THUMB_MAX_BYTES<=REFERENCE_LIMITS.storedBytes,429,'REFERENCE_STORAGE_LIMIT');
  this.policy.storage(a.user.id,bytes.length+THUMB_MAX_BYTES+512,1);
  this.s.tx(()=>{const day=period(this.clock()).day;this.policy.addCounter(a.user.id,'image-upload-count',day,1,REFERENCE_LIMITS.uploadsPerDay);this.policy.addCounter(a.user.id,'image-upload-bytes',day,bytes.length,REFERENCE_LIMITS.uploadBytesPerDay);});
  const decoded=await checkImage(bytes,b.mediaType,IMAGE_LIMITS,{signal});
  const auth=this.accounts.authenticate(a.raw,false);fail(auth.user.id===a.user.id&&auth.session.public_id===a.session.public_id,401,'SESSION_INVALID');
  fail(!signal?.aborted,409,'IMAGE_CANCELLED');
  return this.s.tx(()=>{
   const old=reuse();if(old)return old;this.policy.storage(a.user.id,bytes.length+decoded.thumbnail.bytes.length+512,1);
   const now=this.clock(),expires=now+REFERENCE_LIMITS.expiresInMs;
   this.s.run('INSERT INTO image_references VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,NULL)',b.uploadId,a.user.id,a.session.public_id,b.projectId,b.projectRevision,b.mediaType,b.sha256,bytes.length,decoded.width,decoded.height,now,expires,expires,bytes,decoded.thumbnail.bytes,decoded.thumbnail.sha256,CODEC_VERSION);
   return {reference:this.descriptor(this.owned(a.user.id,b.uploadId)),reused:false};
  });
 }
 resolve(a,reference,projectId,projectRevision){
  exact(reference,['version','id','revision','sha256','byteLength','mediaType','width','height','projectId','projectRevision','expiresAt']);uuid(reference.id);
  const r=this.available(this.owned(a.user.id,reference.id));
  fail(canonical(reference)===canonical(this.descriptor(r)),409,'REFERENCE_CHANGED');
  fail(r.session_id===a.session.public_id&&r.project_id===projectId&&r.project_revision===projectRevision,409,'REFERENCE_CONTEXT_CHANGED');
  fail(r.expires>this.clock(),409,'REFERENCE_EXPIRED');return Buffer.from(r.bytes);
 }
 retain(reference){if(reference)this.s.run('UPDATE image_references SET retain_until=MAX(retain_until,?) WHERE id=?',this.clock()+90*DAY,reference.id);}
 remove(user,id,b){
  exact(b,['revision','confirm']);const r=this.owned(user,id);fail(b.revision===1&&b.confirm==='delete:'+id,400,'CONFIRMATION_REQUIRED');
  if(r.deleted===null)this.s.run('UPDATE image_references SET bytes=NULL,thumbnail=NULL,revision=revision+1,deleted=? WHERE id=?',this.clock(),id);
  return {deleted:true,id};
 }
 cleanup(){
  this.s.run('UPDATE image_references SET bytes=NULL,thumbnail=NULL,revision=revision+1,deleted=? WHERE bytes IS NOT NULL AND retain_until<=?',this.clock(),this.clock());
  this.s.run("DELETE FROM counters WHERE dimension IN ('image-upload-count','image-upload-bytes') AND period<?",period(this.clock()-90*DAY).day);
 }
 async checkArtifact(artifact,signal){return checkImage(artifact.bytes,artifact.mediaType,OUTPUT_LIMITS,{signal});}
 storeArtifact(id,image){this.s.run('INSERT INTO artifact_images VALUES(?,?,?,?,?,?)',id,image.width,image.height,image.thumbnail.bytes,image.thumbnail.sha256,CODEC_VERSION);}
 artifact(user,id){
  const r=this.s.get('SELECT a.*,j.project_id,j.project_revision,j.payload_hash,j.provider_id,j.model_id,j.model_version,j.adapter_version,j.request_id FROM artifacts a JOIN jobs j ON j.id=a.job_id AND j.user_id=a.user_id WHERE a.id=? AND a.user_id=?',id,user);
  fail(r,404,'NOT_FOUND');fail(sha(r.bytes)===r.hash,409,'IMAGE_HASH_MISMATCH');return r;
 }
 async checkedArtifact(a,id){
  let r=this.artifact(a.user.id,id),image=this.s.get('SELECT * FROM artifact_images WHERE id=?',id);
  if(!image||image.codec!==CODEC_VERSION){
   const decoded=await this.checkArtifact({bytes:Buffer.from(r.bytes),mediaType:r.media_type});
   this.accounts.authenticate(a.raw,false);r=this.artifact(a.user.id,id);fail(r.hash===decoded.sha256,409,'IMAGE_HASH_MISMATCH');
   this.s.tx(()=>{if(!this.s.get('SELECT id FROM artifact_images WHERE id=?',id)){this.policy.storage(a.user.id,decoded.thumbnail.bytes.length);this.storeArtifact(id,decoded);}});
   image=this.s.get('SELECT * FROM artifact_images WHERE id=?',id);
  }
  fail(image.codec===CODEC_VERSION&&sha(image.thumbnail)===image.thumbnail_hash,409,'IMAGE_HASH_MISMATCH');
  return {row:r,image,metadata:{id,version:'arch-ai-artifact/1',revision:1,mediaType:r.media_type,sha256:r.hash,byteLength:r.bytes.length,jobId:r.job_id,projectId:r.project_id,projectRevision:r.project_revision,width:image.width,height:image.height,thumbnailAvailable:true,thumbnail:{mediaType:'image/png',sha256:image.thumbnail_hash,byteLength:image.thumbnail.length,maxDimension:256,method:'nearest-center/1'},provenance:{codec:CODEC_VERSION,payloadHash:r.payload_hash,providerId:r.provider_id,modelId:r.model_id,modelVersion:r.model_version,adapterVersion:r.adapter_version,requestId:r.request_id},validation:'decoded-image-only; geometry-and-fit-unverified'}};
 }
}
