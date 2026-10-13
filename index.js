import { socialApi } from "./social.js";
import { partnerApi, password as partnerPassword } from "./partner.js";
const COOKIE = "gbh_session";
// First-party, HttpOnly sessions stay signed in for six months and renew on use.
const SESSION_SECONDS = 60 * 60 * 24 * 180;
const OTP_SECONDS = 600;
const RESET_SECONDS = 1800;
const EMAIL_RE = /^(?:[a-z0-9._%+-]+@student\.polytechnic\.bh|iabbas05@icloud\.com)$/;
const ADMIN_EMAIL = "iabbas05@icloud.com";
const encoder = new TextEncoder();
let schemaReady;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS students (email TEXT PRIMARY KEY NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, verified_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT, token_hash TEXT, expires_at INTEGER NOT NULL, attempts INTEGER DEFAULT 0 NOT NULL, consumed_at INTEGER, created_at INTEGER NOT NULL)"),
      db.prepare("CREATE INDEX IF NOT EXISTS auth_tokens_email_purpose_idx ON auth_tokens (email, purpose)"),
      db.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"),
      db.prepare("CREATE INDEX IF NOT EXISTS sessions_email_idx ON sessions (email)"),
      db.prepare("CREATE TABLE IF NOT EXISTS auth_limits (bucket TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)")
      ,db.prepare("CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY NOT NULL, author_email TEXT NOT NULL, tag TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)")
      ,db.prepare("CREATE INDEX IF NOT EXISTS posts_status_created_idx ON posts (status, created_at DESC)")
      ,db.prepare("CREATE TABLE IF NOT EXISTS post_votes (post_id TEXT NOT NULL, email TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (post_id, email))")
      ,db.prepare("CREATE TABLE IF NOT EXISTS post_reports (id TEXT PRIMARY KEY NOT NULL, post_id TEXT NOT NULL, reporter_email TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL)")
    ]).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

function id(){return b64(crypto.getRandomValues(new Uint8Array(18)));}
function safeTag(v){const tag=typeof v==='string'?v.trim().toUpperCase():'';return ['CAMPUS','POLYGOSSIP','CONFESSION','HELP'].includes(tag)?tag:'POLYGOSSIP';}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
async function sha(s) { return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)))); }
async function mac(env, s) { const k = await crypto.subtle.importKey("raw", encoder.encode(env.AUTH_SECRET), {name:"HMAC",hash:"SHA-256"}, false,["sign"]); return b64(new Uint8Array(await crypto.subtle.sign("HMAC",k,encoder.encode(s)))); }
async function password(s, salt = crypto.getRandomValues(new Uint8Array(16))) { const key = await crypto.subtle.importKey("raw",encoder.encode(s),"PBKDF2",false,["deriveBits"]); const bits = await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:100000},key,256); return {salt:b64(salt), hash:b64(new Uint8Array(bits))}; }
function response(data,status=200,headers={}) { return Response.json(data,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff",...headers}}); }
function cookie(value,req,age=SESSION_SECONDS) { const url=new URL(req.url),shared=url.hostname==="gossipbh.com"||url.hostname.endsWith(".gossipbh.com")?"; Domain=.gossipbh.com":"";return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${shared}${url.protocol==="https:"?"; Secure":""}`; }
function getCookie(req) { return (req.headers.get("cookie")||"").match(/(?:^|;\s*)gbh_session=([^;]+)/)?.[1]||""; }
function getSessionCookies(req) { return [...(req.headers.get("cookie")||"").matchAll(/(?:^|;\s*)gbh_session=([^;]+)/g)].map(match=>match[1]).filter(Boolean); }
function emailOf(v) { return typeof v==="string"?v.trim().toLowerCase():""; }
async function limited(env,req,id) { const now=Math.floor(Date.now()/1000), end=now+900; for(const raw of ["mail:"+id,"ip:"+(req.headers.get("cf-connecting-ip")||"unknown")]) { const bucket=await sha(env.AUTH_SECRET+":"+raw); const row=await env.DB.prepare("INSERT INTO auth_limits (bucket,count,reset_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN auth_limits.reset_at<=? THEN 1 ELSE auth_limits.count+1 END,reset_at=CASE WHEN auth_limits.reset_at<=? THEN excluded.reset_at ELSE auth_limits.reset_at END RETURNING count").bind(bucket,end,now,now).first(); if(!row||row.count>(raw.startsWith("ip:")?30:6)) return false; } return true; }
function mail(env,title,text,action,foot) { const logo=(env.PUBLIC_APP_URL||"")+"/logo-512.png"; return `<!doctype html><html><body style="margin:0;background:#f2f5f8;font-family:Arial,sans-serif;color:#343a40"><table width="100%" style="padding:28px 12px;background:#f2f5f8"><tr><td align="center"><table width="100%" style="max-width:520px;background:white;border:1px solid #dfe3e7"><tr><td style="padding:22px 24px;border-bottom:1px solid #e8ecef"><img src="${logo}" width="42" height="42" style="vertical-align:middle;object-fit:contain"><b style="margin-left:10px;font-size:17px">Gossip BH</b><div style="margin:5px 0 0 52px;color:#74808a;font-size:11px">Bahrain Polytechnic student community</div></td></tr><tr><td style="padding:28px 24px"><div style="font-size:28px">✉️</div><h1 style="font-size:22px">${title}</h1><p style="font-size:14px;line-height:1.6;color:#66717b">${text}</p>${action}<p style="font-size:12px;color:#7b858d">${foot}</p></td></tr><tr><td style="padding:17px 24px;background:#f7f8f9;border-top:1px solid #e8ecef;color:#7e8992;font-size:11px">If you did not request this, ignore this message.<br>© Gossip BH</td></tr></table></td></tr></table></body></html>`; }
async function send(env,to,subject,html,from=env.MAIL_FROM) { if(!env.RESEND_API_KEY||!from) throw Error("MAIL_CONFIG"); const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:"Bearer "+env.RESEND_API_KEY,"content-type":"application/json"},body:JSON.stringify({from,to:[to],subject,html})}); if(!r.ok){const detail=(await r.text()).slice(0,500);console.error("Resend rejected email",r.status,detail);throw Error("MAIL_SEND");} }
function same(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
async function auth(req,env,path){ const db=env.DB,now=Math.floor(Date.now()/1000),route=path.join("/"); if(!db||!env.AUTH_SECRET||env.AUTH_SECRET.length<32)return response({error:"Authentication is not configured."},503); await ensureSchema(db);
 if(req.method==="GET"&&route==="session"){const t=getCookie(req);if(!t)return response({student:null});const tokenHash=await sha(t),r=await db.prepare("SELECT students.email,sessions.expires_at FROM sessions JOIN students ON students.email=sessions.email WHERE sessions.token_hash=? AND sessions.expires_at>? AND students.verified_at>0 LIMIT 1").bind(tokenHash,now).first();if(!r)return response({student:null});const renewed=now+SESSION_SECONDS;if(r.expires_at<now+SESSION_SECONDS-86400)await db.prepare("UPDATE sessions SET expires_at=? WHERE token_hash=?").bind(renewed,tokenHash).run();return response({student:{email:r.email,verified:true}},200,{"set-cookie":cookie(t,req)});}
 if(req.method!=="POST"||req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403); let d;try{if(!req.headers.get("content-type")?.includes("application/json"))throw 0;const raw=await req.text();if(raw.length>10000)throw 0;d=JSON.parse(raw);}catch{return response({error:"Invalid request."},400)}
 if(route==="register/request"){const email=emailOf(d.email);if(!EMAIL_RE.test(email))return response({error:"Use your @student.polytechnic.bh email."},400);const cfg=await db.prepare("SELECT key,value FROM app_settings WHERE key IN ('registration_enabled','verification_subject','mail_sender_name','mail_sender_address')").all(),settings=Object.fromEntries((cfg.results||[]).map(x=>[x.key,x.value])),from=settings.mail_sender_address?`${settings.mail_sender_name||'Gossip BH'} <${settings.mail_sender_address}>`:env.MAIL_FROM;if(settings.registration_enabled==="false"&&email!==ADMIN_EMAIL)return response({error:"New registrations are temporarily closed."},403);if(!(await limited(env,req,email)))return response({error:"Too many attempts. Try later."},429);if(await db.prepare("SELECT email FROM students WHERE email=?").bind(email).first())return response({error:"Account already exists. Sign in or reset your password."},409);const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1e6).padStart(6,"0"),id=b64(crypto.getRandomValues(new Uint8Array(18)));await db.batch([db.prepare("DELETE FROM auth_tokens WHERE email=? AND purpose='verify'").bind(email),db.prepare("INSERT INTO auth_tokens (id,email,purpose,code_hash,expires_at,attempts,created_at) VALUES (?,?,'verify',?,?,0,?)").bind(id,email,await mac(env,email+":"+code),now+OTP_SECONDS,now)]);try{await send(env,email,settings.verification_subject||"Verify your Gossip BH student account",mail(env,"Verify your student email","Enter this code to finish creating your verified Bahrain Polytechnic student account.",`<div style="margin:22px 0;padding:17px;background:#eef6fd;border-left:4px solid #0f6cbf;text-align:center;font-size:30px;font-weight:bold;letter-spacing:8px;color:#075493">${code}</div>`,"The code expires in 10 minutes. Do not share it."),from);}catch{await db.prepare("DELETE FROM auth_tokens WHERE id=?").bind(id).run();return response({error:"Email delivery is not configured."},503)}return response({ok:true});}
 if(route==="register/verify"){const email=emailOf(d.email),code=typeof d.code==="string"?d.code.trim():"",pw=typeof d.password==="string"?d.password:"";if(!EMAIL_RE.test(email)||!/^\d{6}$/.test(code)||pw.length<10||pw.length>128||!/[a-z]/i.test(pw)||!/[0-9]/.test(pw))return response({error:"Check your code and use a password with 10+ characters, a letter and a number."},400);if(!(await limited(env,req,email)))return response({error:"Too many attempts. Try later."},429);const row=await db.prepare("SELECT id,code_hash,expires_at,attempts FROM auth_tokens WHERE email=? AND purpose='verify' AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(email).first();if(!row||row.expires_at<now||row.attempts>=6)return response({error:"Code expired. Request a new one."},400);if(!same(row.code_hash,await mac(env,email+":"+code))){await db.prepare("UPDATE auth_tokens SET attempts=attempts+1 WHERE id=?").bind(row.id).run();return response({error:"That code is incorrect."},400)}const h=await password(pw),token=b64(crypto.getRandomValues(new Uint8Array(32)));await db.batch([db.prepare("INSERT INTO students (email,password_hash,password_salt,verified_at,created_at) VALUES (?,?,?,?,?)").bind(email,h.hash,h.salt,now,now),db.prepare("DELETE FROM auth_tokens WHERE id=?").bind(row.id),db.prepare("INSERT INTO sessions (token_hash,email,expires_at,created_at) VALUES (?,?,?,?)").bind(await sha(token),email,now+SESSION_SECONDS,now)]);return response({student:{email,verified:true}},201,{"set-cookie":cookie(token,req)});}
 if(route==="login"){const email=emailOf(d.email),pw=typeof d.password==="string"?d.password:"";if(!EMAIL_RE.test(email)||!pw)return response({error:"Email or password is incorrect."},401);if(!(await limited(env,req,email)))return response({error:"Too many attempts. Try later."},429);const row=await db.prepare("SELECT email,password_hash,password_salt FROM students WHERE email=? AND verified_at>0").bind(email).first();if(!row)return response({error:"Email or password is incorrect."},401);const h=await password(pw,unb64(row.password_salt));if(!same(h.hash,row.password_hash))return response({error:"Email or password is incorrect."},401);const token=b64(crypto.getRandomValues(new Uint8Array(32)));await db.prepare("INSERT INTO sessions (token_hash,email,expires_at,created_at) VALUES (?,?,?,?)").bind(await sha(token),email,now+SESSION_SECONDS,now).run();return response({student:{email,verified:true}},200,{"set-cookie":cookie(token,req)});}
 if(route==="forgot-password"){const email=emailOf(d.email);if(!EMAIL_RE.test(email))return response({error:"Use your @student.polytechnic.bh email."},400);if(!(await limited(env,req,email)))return response({error:"Too many attempts. Try later."},429);const row=await db.prepare("SELECT email FROM students WHERE email=? AND verified_at>0").bind(email).first();if(row){const token=b64(crypto.getRandomValues(new Uint8Array(32))),id=b64(crypto.getRandomValues(new Uint8Array(18)));await db.batch([db.prepare("DELETE FROM auth_tokens WHERE email=? AND purpose='reset'").bind(email),db.prepare("INSERT INTO auth_tokens (id,email,purpose,token_hash,expires_at,attempts,created_at) VALUES (?,?,'reset',?,?,0,?)").bind(id,email,await sha(token),now+RESET_SECONDS,now)]);const link=(env.PUBLIC_APP_URL||new URL(req.url).origin)+"/app.html?reset="+encodeURIComponent(token);try{await send(env,email,"Reset your Gossip BH password",mail(env,"Reset your password","We received a request to reset your Gossip BH password. Use the secure button below to choose a new one.",`<p style="margin:23px 0"><a href="${link}" style="display:inline-block;background:#0f6cbf;color:#fff;text-decoration:none;padding:13px 21px;font-weight:bold">Choose a new password</a></p>`,"The link expires in 30 minutes and works once."));}catch{await db.prepare("DELETE FROM auth_tokens WHERE id=?").bind(id).run();return response({error:"Email delivery is not configured."},503)}}return response({ok:true,message:"If the account exists, a reset message has been sent."});}
 if(route==="reset-password"){const token=typeof d.token==="string"?d.token:"",pw=typeof d.password==="string"?d.password:"";if(token.length<32||pw.length<10||pw.length>128||!/[a-z]/i.test(pw)||!/[0-9]/.test(pw))return response({error:"Reset link or new password is invalid."},400);if(!(await limited(env,req,token)))return response({error:"Too many attempts. Try later."},429);const row=await db.prepare("SELECT id,email,expires_at FROM auth_tokens WHERE token_hash=? AND purpose='reset' AND consumed_at IS NULL LIMIT 1").bind(await sha(token)).first();if(!row||row.expires_at<now)return response({error:"Reset link is invalid or expired."},400);const h=await password(pw),res=await db.batch([db.prepare("UPDATE auth_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>=?").bind(now,row.id,now),db.prepare("UPDATE students SET password_hash=?,password_salt=? WHERE email=?").bind(h.hash,h.salt,row.email),db.prepare("DELETE FROM sessions WHERE email=?").bind(row.email)]);if(!res[0]?.meta.changes||!res[1]?.meta.changes)return response({error:"Reset link is invalid or expired."},400);return response({ok:true});}
 if(route==="logout"){const tokens=[...new Set(getSessionCookies(req))];if(tokens.length)await db.batch(await Promise.all(tokens.map(async token=>db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(token)))));const headers=new Headers({"cache-control":"no-store","content-type":"application/json","x-content-type-options":"nosniff"}),domainCookie=cookie("",req,0);headers.append("set-cookie",domainCookie);headers.append("set-cookie",domainCookie.replace("; Domain=.gossipbh.com",""));return new Response(JSON.stringify({ok:true}),{status:200,headers});}return response({error:"Not found."},404); }


async function currentStudent(req,db,now){
 const token=getCookie(req);
 if(!token)return null;
 return db.prepare("SELECT students.email,students.role,students.status FROM sessions JOIN students ON students.email=sessions.email WHERE sessions.token_hash=? AND sessions.expires_at>? AND students.verified_at>0 LIMIT 1").bind(await sha(token),now).first();
}
async function publicConfig(req,env){
 const now=Math.floor(Date.now()/1000);await ensureSchema(env.DB);
 const student=await currentStudent(req,env.DB,now);
 const [settings,announcements]=await Promise.all([
  env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('registration_enabled','posting_enabled','comments_enabled','require_post_approval','announcement_en','announcement_ar')").all(),
  env.DB.prepare("SELECT id,body,image_key,action_label,action_url,created_at FROM announcements WHERE active=1 ORDER BY created_at DESC LIMIT 8").all()
 ]);
 const values=Object.fromEntries((settings.results||[]).map(x=>[x.key,x.value])),items=(announcements.results||[]).map(a=>({...a,image_url:a.image_key?'/media/'+a.image_key:null}));if(!items.length&&values.announcement_en)items.push({id:'settings-announcement',body:values.announcement_en,action_label:'',action_url:'',image_url:null,created_at:now});return response({authenticated:!!student,settings:values,announcements:items});
}
async function community(req,env,path){
 const db=env.DB,now=Math.floor(Date.now()/1000),route=path.join('/');
 if(!db||!env.AUTH_SECRET||env.AUTH_SECRET.length<32)return response({error:'Community is not configured.'},503);
 await ensureSchema(db); const student=await currentStudent(req,db,now); if(!student)return response({error:'Sign in is required.'},401);
 if(req.method==='GET'&&route==='posts'){
  const rows=await db.prepare("SELECT p.id,p.tag,p.body,p.created_at,COUNT(DISTINCT v.email) AS votes FROM posts p LEFT JOIN post_votes v ON v.post_id=p.id WHERE p.status='published' GROUP BY p.id ORDER BY p.created_at DESC LIMIT 100").all();
  return response({posts:(rows.results||[]).map(p=>({...p,votes:Number(p.votes||0),replies:0}))});
 }
 if(req.method==='POST'&&route==='posts'){
  if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Request origin could not be verified.'},403);
  let d;try{d=await req.json()}catch{return response({error:'Invalid request.'},400)}
  const body=typeof d.body==='string'?d.body.trim():'';if(body.length<3||body.length>1000)return response({error:'Write between 3 and 1000 characters.'},400);
  const postId=id();await db.prepare("INSERT INTO posts (id,author_email,tag,body,status,created_at,updated_at) VALUES (?,?,?,?,'published',?,?)").bind(postId,student.email,safeTag(d.tag),body,now,now).run();return response({ok:true,post:{id:postId,tag:safeTag(d.tag),body,created_at:now,votes:0,replies:0}},201);
 }
 if(req.method==='POST'&&route.match(/^posts\/[^/]+\/vote$/)){
  if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Request origin could not be verified.'},403);const postId=path[1];const post=await db.prepare("SELECT id FROM posts WHERE id=? AND status='published'").bind(postId).first();if(!post)return response({error:'Post not found.'},404);const existing=await db.prepare('SELECT post_id FROM post_votes WHERE post_id=? AND email=?').bind(postId,student.email).first();if(existing)await db.prepare('DELETE FROM post_votes WHERE post_id=? AND email=?').bind(postId,student.email).run();else await db.prepare('INSERT INTO post_votes (post_id,email,created_at) VALUES (?,?,?)').bind(postId,student.email,now).run();const count=await db.prepare('SELECT COUNT(*) AS total FROM post_votes WHERE post_id=?').bind(postId).first();return response({ok:true,voted:!existing,votes:Number(count?.total||0)});
 }
 if(req.method==='POST'&&route==='reports'){
  if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Request origin could not be verified.'},403);let d;try{d=await req.json()}catch{return response({error:'Invalid request.'},400)}const postId=typeof d.postId==='string'?d.postId:'';const reason=typeof d.reason==='string'?d.reason.trim().slice(0,200):'Other';if(!postId)return response({error:'Post is required.'},400);await db.prepare('INSERT INTO post_reports (id,post_id,reporter_email,reason,created_at) VALUES (?,?,?,?,?)').bind(id(),postId,student.email,reason,now).run();return response({ok:true},201);
 }
 return response({error:'Not found.'},404);
}
async function admin(req,env,path){
 const db=env.DB,now=Math.floor(Date.now()/1000),route=path.join("/");
 if(!db||!env.AUTH_SECRET||env.AUTH_SECRET.length<32)return response({error:"Administration is not configured."},503);
 await ensureSchema(db);
 const student=await currentStudent(req,db,now);
 if(!student)return response({error:"Sign in is required."},401);
 if(student.email!==ADMIN_EMAIL&&student.role!=="admin")return response({error:"This area is restricted to administrators."},403);
 if(req.method==="GET"&&route==="overview"){
  const [students,sessions,pending,limitedRows,latest]=await Promise.all([
   db.prepare("SELECT COUNT(*) AS total FROM students WHERE role <> 'system'").first(),
   db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE expires_at>?").bind(now).first(),
   db.prepare("SELECT COUNT(*) AS total FROM auth_tokens WHERE consumed_at IS NULL AND expires_at>?").bind(now).first(),
   db.prepare("SELECT COUNT(*) AS total FROM auth_limits WHERE reset_at>?").bind(now).first(),
   db.prepare("SELECT email,role,status,suspended_until,suspension_reason,verified_at,created_at FROM students WHERE role <> 'system' ORDER BY created_at DESC LIMIT 10").all()
  ]);
  return response({admin:{email:student.email},stats:{students:Number(students?.total||0),activeSessions:Number(sessions?.total||0),pendingTokens:Number(pending?.total||0),activeRateLimits:Number(limitedRows?.total||0)},latestStudents:latest.results||[]});
 }
 if(req.method==="GET"&&route==="students"){
  const q=(new URL(req.url).searchParams.get("q")||"").trim().toLowerCase().slice(0,100);
  const rows=q
   ? await db.prepare("SELECT email,role,status,suspended_until,suspension_reason,verified_at,created_at FROM students WHERE role <> 'system' AND email LIKE ? ORDER BY created_at DESC LIMIT 100").bind("%"+q+"%").all()
   : await db.prepare("SELECT email,role,status,suspended_until,suspension_reason,verified_at,created_at FROM students WHERE role <> 'system' ORDER BY created_at DESC LIMIT 100").all();
  return response({students:rows.results||[]});
 }
 if(req.method==="GET"&&route==="settings"){
  const rows=await db.prepare("SELECT key,value,updated_at FROM app_settings ORDER BY key").all();
  return response({settings:Object.fromEntries((rows.results||[]).map(x=>[x.key,x.value])),mail:{provider:'Resend',configured:!!env.RESEND_API_KEY,from:env.MAIL_FROM||''}});
 }
 if(req.method==="PUT"&&route==="settings"){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);
  let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}
  const allowed=new Set(['registration_enabled','posting_enabled','comments_enabled','require_post_approval','announcement_en','announcement_ar','mail_sender_name','mail_sender_address','verification_subject','reset_subject']);
  const statements=[];for(const [key,raw] of Object.entries(data.settings||{})){if(!allowed.has(key))continue;const value=String(raw).trim().slice(0,500);statements.push(db.prepare("INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(key,value,student.email,now));}
  if(statements.length)await db.batch(statements);return response({ok:true,updated:statements.length});
 }
 if(req.method==="POST"&&route==="email/test"){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);
  await send(env,ADMIN_EMAIL,"Gossip BH email test",mail(env,"Email delivery is working","This message confirms that the verified Gossip BH domain and encrypted Resend key are working.","","Sent from the Super Admin control center."));
  return response({ok:true,sentTo:ADMIN_EMAIL});
 }
 if(req.method==="POST"&&route==="students/status"){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}
  const email=emailOf(data.email),status=data.status==='active'?'active':'suspended',reason=String(data.reason||'').trim().slice(0,300),until=status==='suspended'&&Number.isFinite(Number(data.suspendedUntil))?Number(data.suspendedUntil):null;
  if(!email||email===ADMIN_EMAIL||status==='suspended'&&!reason)return response({error:"Choose a student and provide a suspension reason."},400);
  const result=await db.prepare("UPDATE students SET status=?,suspended_until=?,suspension_reason=? WHERE email=?").bind(status,until,status==='suspended'?reason:null,email).run();if(!result.meta?.changes)return response({error:"Student not found."},404);
  if(status==='suspended')await db.prepare("DELETE FROM sessions WHERE email=?").bind(email).run();return response({ok:true});
 }
 if(req.method==="GET"&&route==="posts"){
  const status=(new URL(req.url).searchParams.get('status')||'published').slice(0,20);const rows=await db.prepare("SELECT p.id,p.author_email,p.body,p.status,p.created_at,pr.username,pr.display_name FROM social_posts p LEFT JOIN profiles pr ON pr.email=p.author_email WHERE p.status=? ORDER BY p.created_at DESC LIMIT 100").bind(status).all();return response({posts:rows.results||[]});
 }
 if(req.method==="PATCH"&&path[0]==="posts"&&path[1]){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const status=['published','pending','removed'].includes(data.status)?data.status:null;if(!status)return response({error:"Invalid status."},400);await db.prepare("UPDATE social_posts SET status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,updated_at=? WHERE id=?").bind(status,status,now,now,path[1]).run();return response({ok:true});
 }
 if(req.method==="GET"&&route==="reports"){
  const status=(new URL(req.url).searchParams.get('status')||'open').slice(0,20);const rows=await db.prepare("SELECT * FROM reports WHERE status=? ORDER BY created_at DESC LIMIT 100").bind(status).all();return response({reports:rows.results||[]});
 }
 if(req.method==="GET"&&route==="gossip"){
  const status=(new URL(req.url).searchParams.get('status')||'pending').slice(0,20);const rows=await db.prepare("SELECT g.id,g.sender_email,g.body,g.status,g.reply_body,g.replied_by,g.replied_at,g.created_at FROM gossip_messages g WHERE g.status=? ORDER BY g.created_at DESC LIMIT 100").bind(status).all(),messages=rows.results||[];for(const item of messages){const media=await db.prepare("SELECT m.object_key,m.kind FROM gossip_media gm JOIN media m ON m.id=gm.media_id WHERE gm.gossip_id=? ORDER BY gm.position").bind(item.id).all();item.media=(media.results||[]).map(m=>({url:'/media/'+m.object_key,kind:m.kind}))}return response({messages});
 }
 if(req.method==="PATCH"&&path[0]==="gossip"&&path[1]){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const reply=typeof data.reply==='string'?data.reply.trim().slice(0,1000):'';if(!reply)return response({error:"Write a reply before publishing."},400);const message=await db.prepare("SELECT sender_email FROM gossip_messages WHERE id=? AND status='pending'").bind(path[1]).first();if(!message)return response({error:"Message not found."},404);await db.batch([db.prepare("UPDATE gossip_messages SET status='published',reply_body=?,replied_by=?,replied_at=?,published_at=? WHERE id=?").bind(reply,student.email,now,now,path[1]),db.prepare("INSERT INTO notifications(id,recipient_email,actor_email,type,entity_type,entity_id,payload,created_at) VALUES(?,?,?,'gossip_reply','gossip',?,'{}',?)").bind(id(),message.sender_email,student.email,path[1],now)]);return response({ok:true});
 }
 if(req.method==="PATCH"&&path[0]==="reports"&&path[1]){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const status=['open','resolved','dismissed'].includes(data.status)?data.status:null;if(!status)return response({error:"Invalid status."},400);await db.prepare("UPDATE reports SET status=?,resolution=?,resolved_by=?,resolved_at=? WHERE id=?").bind(status,String(data.resolution||'').slice(0,500),student.email,status==='open'?null:now,path[1]).run();return response({ok:true});
 }
 if(req.method==="POST"&&route==="sessions/revoke"){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);
  let data;try{data=await req.json();}catch{return response({error:"Invalid request."},400)}
  const email=emailOf(data.email);
  if(!EMAIL_RE.test(email))return response({error:"Invalid student email."},400);
  const result=await db.prepare("DELETE FROM sessions WHERE email=?").bind(email).run();
  return response({ok:true,revoked:Number(result.meta?.changes||0)});
 }
 if(req.method==="GET"&&route==="team"){
  const rows=await db.prepare("SELECT email,role,status,created_at FROM students WHERE role IN ('admin','super_admin') OR email=? ORDER BY created_at").bind(ADMIN_EMAIL).all();return response({members:(rows.results||[]).map(x=>({...x,role:x.email===ADMIN_EMAIL?'super_admin':x.role})),can_manage:student.email===ADMIN_EMAIL});
 }
 if(req.method==="POST"&&route==="team"){
  if(student.email!==ADMIN_EMAIL)return response({error:"Only the Super Admin can manage the admin team."},403);if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const email=emailOf(data.email),role=data.role==='admin'?'admin':'student';if(email===ADMIN_EMAIL)return response({error:"The Super Admin role cannot be changed."},400);const target=await db.prepare("SELECT email FROM students WHERE email=?").bind(email).first();if(!target)return response({error:"That person must create a Gossip BH account first."},404);await db.prepare("UPDATE students SET role=? WHERE email=?").bind(role,email).run();return response({ok:true});
 }
 if(req.method==="GET"&&route==="offers"){
  const rows=await db.prepare("SELECT o.id,o.title,o.description,o.active,o.one_time_only,o.created_at,p.name partner_name,p.email partner_email,(SELECT COUNT(*) FROM offer_claims c WHERE c.offer_id=o.id) claims,(SELECT COUNT(*) FROM offer_claims c WHERE c.offer_id=o.id AND c.redeemed_at IS NOT NULL) redeemed FROM offers o JOIN partners p ON p.id=o.partner_id ORDER BY o.created_at DESC").all();return response({offers:rows.results||[]});
 }
 if(req.method==="POST"&&route==="offers"){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const title=String(data.title||'').trim().slice(0,80),description=String(data.description||'').trim().slice(0,500),partnerName=String(data.partner_name||'').trim().slice(0,80),partnerEmail=emailOf(data.partner_email);if(!title||!description||!partnerName||!partnerEmail)return response({error:"Complete the partner and offer details."},400);let partner=await db.prepare("SELECT id FROM partners WHERE email=?").bind(partnerEmail).first();if(!partner){partner={id:id()};await db.prepare("INSERT INTO partners(id,name,email,status,created_by,created_at) VALUES(?,?,?,'active',?,?)").bind(partner.id,partnerName,partnerEmail,student.email,now).run()}else await db.prepare("UPDATE partners SET name=?,status='active' WHERE id=?").bind(partnerName,partner.id).run();const offerId=id();await db.prepare("INSERT INTO offers(id,partner_id,title,description,active,one_time_only,created_at,updated_at) VALUES(?,?,?,?,1,1,?,?)").bind(offerId,partner.id,title,description,now,now).run();return response({ok:true,id:offerId},201);
 }
 if(req.method==="PATCH"&&path[0]==="offers"&&path[1]){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}await db.prepare("UPDATE offers SET active=?,updated_at=? WHERE id=?").bind(data.active?1:0,now,path[1]).run();return response({ok:true});
 }
 if(req.method==="POST"&&route==="partners/password"){
  if(student.email!==ADMIN_EMAIL)return response({error:"Only the Super Admin can manage partner access."},403);if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const email=emailOf(data.email),pw=String(data.password||"");if(!email||pw.length<10||!/[A-Za-z]/.test(pw)||!/[0-9]/.test(pw))return response({error:"Use a 10+ character password with a letter and a number."},400);const partner=await db.prepare("SELECT id FROM partners WHERE email=?").bind(email).first();if(!partner)return response({error:"Partner not found. Create an offer for this partner first."},404);const h=await partnerPassword(pw);await db.batch([db.prepare("UPDATE partners SET password_hash=?,password_salt=?,status='active' WHERE id=?").bind(h.hash,h.salt,partner.id),db.prepare("DELETE FROM partner_sessions WHERE partner_id=?").bind(partner.id),db.prepare("INSERT INTO admin_audit_log(id,admin_email,action,target_type,target_id,metadata,created_at) VALUES(?,?,'partner_password_reset','partner',?,'{}',?)").bind(id(),student.email,partner.id,now)]);return response({ok:true});
 }
 if(req.method==="GET"&&route==="deletions"){
  if(student.email!==ADMIN_EMAIL)return response({error:"Only the Super Admin can review account deletion requests."},403);const rows=await db.prepare("SELECT id,student_email,status,requested_at FROM deletion_requests ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,requested_at DESC LIMIT 100").all();return response({requests:rows.results||[]});
 }
 if(req.method==="DELETE"&&path[0]==="deletions"&&path[1]){
  if(student.email!==ADMIN_EMAIL)return response({error:"Only the Super Admin can delete accounts."},403);if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);const request=await db.prepare("SELECT student_email FROM deletion_requests WHERE id=? AND status='pending'").bind(path[1]).first();if(!request||request.student_email===ADMIN_EMAIL)return response({error:"Deletion request not found."},404);const media=await db.prepare('SELECT object_key FROM media WHERE owner_email=?').bind(request.student_email).all();for(const item of media.results||[])await env.MEDIA?.delete(item.object_key);const emailHash=await sha(request.student_email);await db.batch([db.prepare('DELETE FROM students WHERE email=?').bind(request.student_email),db.prepare('INSERT OR REPLACE INTO account_deletion_audit(email_hash,requested_at,completed_at) VALUES(?,?,?)').bind(emailHash,now,now),db.prepare("INSERT INTO admin_audit_log(id,admin_email,action,target_type,target_id,metadata,created_at) VALUES(?,?,'account_deleted','student',?,'{}',?)").bind(id(),student.email,emailHash,now)]);return response({ok:true});
 }
 if(req.method==="GET"&&route==="announcements"){
  const rows=await db.prepare("SELECT id,body,action_label,action_url,active,created_at FROM announcements ORDER BY created_at DESC LIMIT 50").all();return response({announcements:rows.results||[]});
 }
 if(req.method==="POST"&&route==="announcements"){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const body=String(data.body||'').trim().slice(0,500),label=String(data.action_label||'').trim().slice(0,40),url=String(data.action_url||'').trim().slice(0,300);if(!body)return response({error:"Write the announcement."},400);const announcementId=id();await db.prepare("INSERT INTO announcements(id,body,action_label,action_url,active,created_by,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)").bind(announcementId,body,label,url,student.email,now,now).run();return response({ok:true,id:announcementId},201);
 }
 if(req.method==="PATCH"&&path[0]==="announcements"&&path[1]){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}await db.prepare("UPDATE announcements SET active=?,updated_at=? WHERE id=?").bind(data.active?1:0,now,path[1]).run();return response({ok:true});
 }
 if(req.method==="GET"&&route==="offers/validate"){
  const token=new URL(req.url).searchParams.get('token')||'';if(token.length<40)return response({error:"Invalid offer code."},400);const claim=await db.prepare("SELECT c.id,c.expires_at,c.redeemed_at,c.student_email,o.title,p.name partner_name FROM offer_claims c JOIN offers o ON o.id=c.offer_id JOIN partners p ON p.id=o.partner_id WHERE c.token_hash=?").bind(await sha(token)).first();if(!claim)return response({error:"Offer code not found."},404);return response({claim:{...claim,valid:!claim.redeemed_at&&claim.expires_at>=now}});
 }
 if(req.method==="POST"&&route==="offers/redeem"){
  if(req.headers.get("origin")!==new URL(req.url).origin)return response({error:"Request origin could not be verified."},403);let data;try{data=await req.json()}catch{return response({error:"Invalid request."},400)}const token=String(data.token||'');if(token.length<40)return response({error:"Invalid offer code."},400);const tokenHash=await sha(token),claim=await db.prepare("SELECT id,expires_at,redeemed_at FROM offer_claims WHERE token_hash=?").bind(tokenHash).first();if(!claim)return response({error:"Offer code not found."},404);if(claim.redeemed_at)return response({error:"This offer was already redeemed."},409);if(claim.expires_at<now)return response({error:"This offer code expired. Ask the student to generate a new one."},410);await db.prepare("UPDATE offer_claims SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL").bind(now,claim.id).run();return response({ok:true,message:"Valid student offer"});
 }
 return response({error:"Not found."},404);
}

async function cleanup(env){const cutoff=Math.floor(Date.now()/1000)-86400,rows=await env.DB.prepare(`SELECT m.id,m.object_key FROM media m LEFT JOIN post_media p ON p.media_id=m.id LEFT JOIN gossip_media g ON g.media_id=m.id WHERE p.media_id IS NULL AND g.media_id IS NULL AND m.created_at<? LIMIT 500`).bind(cutoff).all();for(const item of rows.results||[]){await env.MEDIA?.delete(item.object_key);await env.DB.prepare('DELETE FROM media WHERE id=?').bind(item.id).run()}await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Math.floor(Date.now()/1000)),env.DB.prepare('DELETE FROM partner_sessions WHERE expires_at<?').bind(Math.floor(Date.now()/1000)),env.DB.prepare('DELETE FROM auth_tokens WHERE expires_at<?').bind(cutoff)]);}
export default { async fetch(req,env){const u=new URL(req.url),host=u.hostname.toLowerCase(),isAdminHost=host==="admin.gossipbh.com",isPartnerHost=host==="partner.gossipbh.com";if(/(?:^|\/)\.|\.(?:sql|map|toml|jsonc|md|mjs)$/i.test(u.pathname)||u.pathname==="/package.json")return response({error:"Not found."},404);if(u.pathname.startsWith('/api/partner/')){if(!isPartnerHost)return response({error:'Partner access is available only on partner.gossipbh.com.'},404);return partnerApi(req,env,u.pathname.slice(13).split('/'))}if(req.method==="GET"&&u.pathname==="/api/config")try{return await publicConfig(req,env)}catch{return response({error:"Configuration is unavailable."},500)}if(u.pathname.startsWith("/api/social/"))return socialApi(req,env,u.pathname.slice(12).split("/"));if(u.pathname.startsWith("/api/admin/")){if(!isAdminHost)return response({error:"Administration is available only on admin.gossipbh.com."},404);try{return await admin(req,env,u.pathname.slice("/api/admin/".length).split("/"));}catch(error){console.error("Admin API error",error?.message);return response({error:"Something went wrong. Try again."},500)}}if(u.pathname.startsWith("/api/auth/"))try{return await auth(req,env,u.pathname.slice("/api/auth/".length).split("/"));}catch(error){console.error("Authentication API error",error?.message,error?.stack);return response({error:"Something went wrong. Try again."},500)}if(u.pathname.startsWith("/api/community/"))try{return await community(req,env,u.pathname.slice("/api/community/".length).split("/"));}catch{return response({error:"Something went wrong. Try again."},500)}if(u.pathname.startsWith('/media/')&&env.MEDIA){const key=decodeURIComponent(u.pathname.slice(7));if(!key||key.includes('..'))return response({error:'Not found.'},404);const object=await env.MEDIA.get(key);if(!object)return response({error:'Not found.'},404);return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'application/octet-stream','cache-control':'public,max-age=31536000,immutable','x-content-type-options':'nosniff'}})}if(isPartnerHost&&(u.pathname==='/'||u.pathname==='/partner.html'))return env.ASSETS.fetch(new Request(new URL('/partner.html',req.url)));if(isAdminHost&&(u.pathname==="/"||u.pathname==="/admin.html"))return env.ASSETS.fetch(new Request(new URL("/admin.html",req.url)));if(u.pathname==="/"||u.pathname==="/app.html"||u.pathname.startsWith('/post/'))return env.ASSETS.fetch(new Request(new URL("/index.html",req.url)));return env.ASSETS.fetch(req);},scheduled(_event,env,ctx){ctx.waitUntil(cleanup(env))} };
