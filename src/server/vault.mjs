import { createCipheriv, createDecipheriv, randomBytes, createHmac, createPublicKey, sign } from 'node:crypto';
import { fail, canonical, sha } from './core.mjs';
export class Vault {
  constructor(keys, active) {
    fail(keys instanceof Map && keys.has(active), 500, 'VAULT_KEY_MISSING');
    for (const [v,k] of keys) fail(/^[a-zA-Z0-9_-]{1,40}$/.test(v) && Buffer.isBuffer(k) && k.length===32,500,'VAULT_KEY_INVALID');
    this.keys=keys; this.active=active;
  }
  seal(context, plaintext) {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',this.keys.get(this.active),iv,{authTagLength:16});
    cipher.setAAD(Buffer.from(canonical({...context,keyVersion:this.active})));
    const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    return { keyVersion:this.active, sealed:canonical({iv:iv.toString('base64url'),data:encrypted.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')}) };
  }
  open(context, keyVersion, sealed) {
    try {
      fail(this.keys.has(keyVersion),503,'VAULT_KEY_MISSING');
      const v=JSON.parse(sealed), iv=Buffer.from(v.iv,'base64url'), tag=Buffer.from(v.tag,'base64url');
      fail(iv.length===12 && tag.length===16,503,'VAULT_UNAVAILABLE');
      const cipher=createDecipheriv('aes-256-gcm',this.keys.get(keyVersion),iv,{authTagLength:16});
      cipher.setAAD(Buffer.from(canonical({...context,keyVersion}))); cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(Buffer.from(v.data,'base64url')),cipher.final()]);
    } catch { throw Object.assign(new Error('VAULT_UNAVAILABLE'),{status:503,code:'VAULT_UNAVAILABLE'}); }
  }
}
export const credentialContext = c => ({type:'ai-credential-v1',id:c.id,userId:c.user_id,providerId:c.provider_id,endpointId:c.endpoint_id,version:c.version});
export class SessionCrypto {
  constructor(csrfKey, leaseKey) {
    fail(Buffer.isBuffer(csrfKey) && csrfKey.length===32 && leaseKey?.asymmetricKeyType==='ed25519',500,'AUTH_KEYS_REQUIRED');
    this.csrfKey=csrfKey; this.leaseKey=leaseKey;
    this.publicKey=createPublicKey(leaseKey).export({format:'jwk'});
    this.kid=sha(canonical(this.publicKey)).slice(0,24);
  }
  csrf(raw) { return createHmac('sha256',this.csrfKey).update('csrf-v1:').update(raw).digest('base64url'); }
  lease(user, session, now) {
    const claims={type:'offline-workspace-v1',userId:user.id,deviceId:session.device_id,authVersion:user.auth_version,issuedAt:now,expiresAt:now+86_400_000};
    const payload=Buffer.from(canonical(claims)).toString('base64url');
    return {kid:this.kid,payload,signature:sign(null,Buffer.from(payload),this.leaseKey).toString('base64url')};
  }
}

