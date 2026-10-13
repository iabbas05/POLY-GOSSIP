const enc=new TextEncoder(),COOKIE='gbh_partner',DAY=86400;
const out=(data,status=200,headers={})=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const uid=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const hash=async value=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const b64=a=>btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const password=async(p,salt=crypto.getRandomValues(new Uint8Array(16)))=>{const key=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveBits']),bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},key,256);return{hash:b64(new Uint8Array(bits)),salt:b64(salt)}};
const same=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0};
const token=req=>(req.headers.get('cookie')||'').match(/(?:^|;\s*)gbh_partner=([^;]+)/)?.[1]||'';
const cookie=(value,maxAge=DAY*30)=>`${COOKIE}=${value}; Path=/; Domain=.gossipbh.com; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const originOk=req=>req.headers.get('origin')===new URL(req.url).origin;
async function current(req,env,now){const t=token(req);if(!t)return null;return env.DB.prepare(`SELECT p.id,p.name,p.email,p.status FROM partner_sessions s JOIN partners p ON p.id=s.partner_id WHERE s.token_hash=? AND s.expires_at>? AND p.status='active'`).bind(await hash(t),now).first()}

export async function partnerApi(req,env,path){
 const now=Math.floor(Date.now()/1000),route=path.join('/');
 try{
  if(req.method==='POST'&&route==='login'){
   if(!originOk(req))return out({error:'Request origin could not be verified.'},403);const d=await req.json(),email=String(d.email||'').trim().toLowerCase(),pw=String(d.password||'');
   const p=await env.DB.prepare("SELECT id,name,email,status,password_hash,password_salt FROM partners WHERE email=?").bind(email).first();if(!p||p.status!=='active'||!p.password_hash)return out({error:'Email or password is incorrect.'},401);
   const check=await password(pw,bytes(p.password_salt));if(!same(check.hash,p.password_hash))return out({error:'Email or password is incorrect.'},401);const raw=uid();await env.DB.prepare('INSERT INTO partner_sessions(token_hash,partner_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await hash(raw),p.id,now+DAY*30,now).run();return out({partner:{name:p.name,email:p.email}},200,{'set-cookie':cookie(raw)});
  }
  const partner=await current(req,env,now);if(!partner)return out({error:'Partner sign in is required.'},401);
  if(req.method==='GET'&&route==='session')return out({partner:{name:partner.name,email:partner.email}});
  if(req.method==='POST'&&route==='logout'){await env.DB.prepare('DELETE FROM partner_sessions WHERE token_hash=?').bind(await hash(token(req))).run();return out({ok:true},200,{'set-cookie':cookie('',0)});}
  if(req.method==='GET'&&route==='validate'){
   const raw=new URL(req.url).searchParams.get('token')||'';if(raw.length<40)return out({error:'Invalid offer code.'},400);const claim=await env.DB.prepare(`SELECT c.id,c.expires_at,c.redeemed_at,o.title,o.description,p.name partner_name FROM offer_claims c JOIN offers o ON o.id=c.offer_id JOIN partners p ON p.id=o.partner_id WHERE c.token_hash=? AND o.partner_id=?`).bind(await hash(raw),partner.id).first();if(!claim)return out({error:'This code does not belong to your business.'},404);return out({claim:{...claim,valid:!claim.redeemed_at&&claim.expires_at>=now}});
  }
  if(req.method==='POST'&&route==='redeem'){
   if(!originOk(req))return out({error:'Request origin could not be verified.'},403);const d=await req.json(),raw=String(d.token||'');if(raw.length<40)return out({error:'Invalid offer code.'},400);const claim=await env.DB.prepare(`SELECT c.id,c.expires_at,c.redeemed_at FROM offer_claims c JOIN offers o ON o.id=c.offer_id WHERE c.token_hash=? AND o.partner_id=?`).bind(await hash(raw),partner.id).first();if(!claim)return out({error:'This code does not belong to your business.'},404);if(claim.redeemed_at)return out({error:'This offer was already redeemed.'},409);if(claim.expires_at<now)return out({error:'This offer code has expired.'},410);const done=await env.DB.prepare('UPDATE offer_claims SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL').bind(now,claim.id).run();if(!done.meta?.changes)return out({error:'This offer was already redeemed.'},409);return out({ok:true,message:'Valid student offer'});
  }
  if(req.method==='GET'&&route==='history'){const rows=await env.DB.prepare(`SELECT c.id,c.redeemed_at,o.title FROM offer_claims c JOIN offers o ON o.id=c.offer_id WHERE o.partner_id=? AND c.redeemed_at IS NOT NULL ORDER BY c.redeemed_at DESC LIMIT 100`).bind(partner.id).all();return out({redemptions:rows.results||[]});}
  return out({error:'Not found.'},404);
 }catch(error){console.error('Partner API',error?.message);return out({error:'Something went wrong. Try again.'},500)}
}

export { password };
