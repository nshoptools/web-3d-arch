import { DAY,HOUR,id,token,sha,fail,exact,str,publicUser } from './core.mjs';
export function bootstrap(s,{issuer,subject,policy,now=Date.now()}) {
  str(issuer,512);str(subject,255);
  return s.tx(()=>{
    fail(!s.get('SELECT id FROM users LIMIT 1'),409,'BOOTSTRAP_ALREADY_INITIALIZED');
    const userId=id();
    s.run("INSERT INTO users(id,issuer,subject,role,status,created) VALUES(?,?,?,'owner','active',?)",userId,issuer,subject,now);
    s.run('INSERT INTO policy VALUES(1,1,?)',JSON.stringify(policy));s.audit(null,userId,'bootstrap.owner',now);
    return userId;
  });
}
export class Accounts {
  constructor(s,crypto,clock) {this.s=s;this.crypto=crypto;this.clock=clock;this.onRevoke=()=>{};}
  authenticate(raw,touch=true) {
    fail(typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw),401,'AUTH_REQUIRED');
    const session=this.s.get('SELECT * FROM sessions WHERE hash=?',sha(raw));
    const user=session&&this.s.get('SELECT * FROM users WHERE id=?',session.user_id);
    fail(session&&user&&user.status==='active'&&session.auth_version===user.auth_version&&this.clock()<session.created+12*HOUR&&this.clock()<session.last_seen+HOUR,401,'SESSION_INVALID');
    if(touch){session.last_seen=this.clock();this.s.run('UPDATE sessions SET last_seen=? WHERE hash=?',session.last_seen,session.hash);}
    return {session,user,raw};
  }
  owner(a) {fail(a.user.role==='owner',403,'OWNER_REQUIRED');}
  fresh(a) {fail(a.session.reauth_until>this.clock(),403,'REAUTH_REQUIRED');}
  login(identity,flow) {
    return this.s.tx(()=>{
      let user=this.s.get('SELECT * FROM users WHERE issuer=? AND subject=?',identity.issuer,identity.subject);
      fail(user&&['invited','active'].includes(user.status),403,'MEMBERSHIP_REQUIRED');
      if(flow.session) {
        const current=this.s.get('SELECT * FROM sessions WHERE hash=?',flow.session.hash);
        const original=this.s.get('SELECT * FROM users WHERE id=?',flow.session.user_id);
        fail(current&&original?.status==='active'&&current.auth_version===original.auth_version&&this.clock()<current.created+12*HOUR&&this.clock()<current.last_seen+HOUR,401,'SESSION_INVALID');
        if(flow.reauth)fail(user.id===current.user_id,403,'REAUTH_IDENTITY_MISMATCH');
      }
      if(user.status==='invited') {
        const inv=this.s.get('SELECT * FROM invites WHERE token_hash=? AND user_id=?',flow.inviteHash??'',user.id);
        fail(inv&&!inv.revoked&&!inv.consumed&&inv.expires>this.clock(),403,'INVITATION_INVALID');
        this.s.run('UPDATE invites SET consumed=? WHERE id=?',this.clock(),inv.id);
        this.s.run("UPDATE users SET status='active',auth_version=auth_version+1 WHERE id=?",user.id);
        this.s.audit(user.id,user.id,'invite.accept',this.clock());
        user=this.s.get('SELECT * FROM users WHERE id=?',user.id);
      } else if(flow.inviteHash) {
        // An invitation is neither a reusable login token nor a way to switch identities.
        fail(false,403,'INVITATION_INVALID');
      }
      const raw=token(),publicId=id(),now=this.clock();
      if(flow.session)this.s.run('DELETE FROM sessions WHERE hash=?',flow.session.hash);
      this.s.run('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?)',sha(raw),publicId,user.id,user.auth_version,flow.deviceId,now,now,flow.reauth?now+5*60_000:0);
      return {raw,user:publicUser(user),sessionId:publicId,csrfToken:this.crypto.csrf(raw)};
    });
  }
  logout(a) {this.s.run('DELETE FROM sessions WHERE hash=?',a.session.hash);this.onRevoke(a.user.id,a.session.public_id);}
  invite(a,body) {
    this.owner(a);exact(body,['issuer','subject','confirm']);fail(body.confirm==='invite',400,'CONFIRMATION_REQUIRED');str(body.issuer,512);str(body.subject,255);
    return this.s.tx(()=>{
      fail(!this.s.get('SELECT id FROM users WHERE issuer=? AND subject=?',body.issuer,body.subject),409,'IDENTITY_ALREADY_KNOWN');
      const userId=id(),inviteId=id(),raw=token(),now=this.clock();
      this.s.run("INSERT INTO users(id,issuer,subject,role,status,created) VALUES(?,?,?,'member','invited',?)",userId,body.issuer,body.subject,now);
      this.s.run('INSERT INTO invites VALUES(?,?,?,?,NULL,NULL)',inviteId,userId,sha(raw),now+7*DAY);
      this.s.audit(a.user.id,userId,'invite.create',now);
      return {inviteId,userId,inviteToken:raw,expiresAt:now+7*DAY};
    });
  }
  invitation(a,inviteId,action,confirm) {
    this.owner(a);fail(confirm===action+':'+inviteId,400,'CONFIRMATION_REQUIRED');
    return this.s.tx(()=>{
      const inv=this.s.get('SELECT * FROM invites WHERE id=?',inviteId);
      fail(inv&&!inv.consumed,404,'NOT_FOUND');
      const user=this.s.get('SELECT * FROM users WHERE id=?',inv.user_id);fail(user.status==='invited',409,'INVITATION_INVALID');
      this.s.run('UPDATE invites SET revoked=? WHERE id=?',this.clock(),inv.id);
      this.s.audit(a.user.id,user.id,'invite.'+action,this.clock());
      if(action==='revoke')return {revoked:true};
      const raw=token(),next=id(),expiresAt=this.clock()+7*DAY;
      this.s.run('INSERT INTO invites VALUES(?,?,?,?,NULL,NULL)',next,user.id,sha(raw),expiresAt);
      return {inviteId:next,userId:user.id,inviteToken:raw,expiresAt};
    });
  }
  impact(a,userId) {
    this.owner(a);
    fail(this.s.get('SELECT id FROM users WHERE id=?',userId),404,'NOT_FOUND');
    return {userId,imageReferences:this.s.get('SELECT count(*) n FROM image_references WHERE user_id=? AND bytes IS NOT NULL',userId).n,settings:this.s.get('SELECT count(*) n FROM settings WHERE user_id=?',userId).n,artifacts:this.s.get('SELECT count(*) n FROM artifacts WHERE user_id=?',userId).n,credentials:this.s.get("SELECT count(*) n FROM credentials WHERE user_id=? AND sealed IS NOT NULL",userId).n,backupPurgeDays:30,auditRetentionDays:90,downloadedCopiesRevocable:false};
  }
  mutate(a,userId,body) {
    this.owner(a);exact(body,['action','confirm','role'],['action','confirm']);
    const action=body.action;
    fail(['suspend','restore','delete','revoke-sessions','role'].includes(action),400,'INVALID_ACTION');
    fail(body.confirm===action+':'+userId,400,'CONFIRMATION_REQUIRED');
    if(action==='role'){this.fresh(a);fail(['owner','member'].includes(body.role),400,'INVALID_ROLE');}
    const result=this.s.tx(()=>{
      const u=this.s.get('SELECT * FROM users WHERE id=?',userId);fail(u&&u.status!=='deleted',404,'NOT_FOUND');
      if(['suspend','delete','role'].includes(action))fail(['active','suspended'].includes(u.status),409,'INVALID_TRANSITION');
      if(action==='restore')fail(u.status==='suspended',409,'INVALID_TRANSITION');
      if(u.role==='owner'&&u.status==='active'&&(action==='delete'||action==='suspend'||action==='role'&&body.role==='member')) {
        fail(this.s.get("SELECT count(*) n FROM users WHERE role='owner' AND status='active'").n>1,409,'LAST_OWNER');
      }
      const status=action==='delete'?'deleted':action==='suspend'?'suspended':action==='restore'?'active':u.status;
      this.s.run('UPDATE users SET status=?,role=?,auth_version=auth_version+1,deleted=? WHERE id=?',status,action==='role'?body.role:u.role,action==='delete'?this.clock():null,userId);
      this.s.run('DELETE FROM sessions WHERE user_id=?',userId);
      if(action==='delete'){
        this.s.run("UPDATE credentials SET sealed=NULL,status='revoked',version=version+1,label='[deleted]',checked=NULL WHERE user_id=?",userId);
        for(const table of ['artifacts','image_references','settings','conflicts','budgets'])this.s.run('DELETE FROM '+table+' WHERE user_id=?',userId);
        this.s.run('UPDATE jobs SET payload=NULL,closed_reason=NULL WHERE user_id=?',userId);
        this.s.run('INSERT INTO deletion_tasks VALUES(?,?,?,?)',userId,this.clock(),this.clock()+30*DAY,'backup-purge-required');
      }
      this.s.audit(a.user.id,userId,'user.'+action+(action==='role'?'.'+u.role+'-to-'+body.role:''),this.clock());
      return publicUser(this.s.get('SELECT * FROM users WHERE id=?',userId));
    });
    this.onRevoke(userId,null);
    return result;
  }
}
