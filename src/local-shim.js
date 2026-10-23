// 数据层（公开网页版）
// · 默认「本机模式」：数据存在这个浏览器里（localStorage），附件存在 IndexedDB。
// · 「同步模式」：连接你自己的 Google 表格（Apps Script 数据接口 + 密钥），数据和附件存进你的表格 / 云端硬盘，
//   换电脑、换浏览器打开同一个网址，连上就能看到。本机数据在同步模式下原样保留，断开后回到本机数据。
(function(){
  const NS='sophias-desk:';const RNS='sophias-desk-remote:';const COLLS=['goals','events','notes','tasks','kb_items','kbmeta'];
  const CFG_KEY='sophias-desk-sync';
  const cfg=(()=>{try{return JSON.parse(localStorage.getItem(CFG_KEY)||'null')}catch(e){return null}})();
  const REMOTE=!!(cfg&&cfg.url&&cfg.key);
  const P=REMOTE?RNS:NS;
  const data={},subs={};
  const clone=o=>JSON.parse(JSON.stringify(o===undefined?{}:o));
  const gid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  const readColl=(c,pre)=>{try{return JSON.parse(localStorage.getItem((pre||P)+c)||'{}')||{}}catch(e){return {}}};
  for(const c of COLLS)data[c]=readColl(c);
  const notice=t=>{const n=document.getElementById('notice');if(n){n.hidden=!t;n.textContent=t||''}};
  let warned=false;
  function persist(c){try{localStorage.setItem(P+c,JSON.stringify(data[c]||{}))}catch(e){if(!warned){warned=true;notice('浏览器存储空间不够了，新内容可能没保存。请先「导出备份」，再删除一些旧记录。')}}}
  const snap=c=>({docs:Object.entries(data[c]||{}).map(([id,d])=>({id,data:()=>clone(d)}))});
  const notify=c=>{(subs[c]||[]).forEach(fn=>{try{fn(snap(c))}catch(e){console.error(e)}})};
  window.addEventListener('storage',e=>{if(e.key&&e.key.startsWith(P)){const c=e.key.slice(P.length);if(COLLS.includes(c)){data[c]=readColl(c);notify(c)}}});

  /* ---------- Google 数据接口 ---------- */
  async function api(url,key,action,args){
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key,action,args:args||[]})});
    let j;try{j=await r.json()}catch(e){throw new Error('接口没有返回数据，请检查网址是否是「任何人」可访问的部署')}
    if(!j.ok)throw new Error(j.error||'接口出错');return j.result;
  }
  const call=(a,...args)=>api(cfg.url,cfg.key,a,args);
  // 待上传的改动先存进「发件箱」，网络断了也不会丢，恢复后自动补传
  const OUT=RNS+'outbox';
  let outbox=(()=>{try{return JSON.parse(localStorage.getItem(OUT)||'[]')}catch(e){return []}})();
  const saveOut=()=>{try{localStorage.setItem(OUT,JSON.stringify(outbox))}catch(e){}};
  let flushing=false,stamp='',syncErr='';
  async function flush(){
    if(!REMOTE||flushing||!outbox.length)return;flushing=true;
    try{while(outbox.length){const batch=outbox.slice(0,20);stamp=await call('write',batch);outbox.splice(0,batch.length);saveOut()}syncErr='';setBadge()}
    catch(e){syncErr=String(e.message||e);setBadge()}
    finally{flushing=false}
  }
  async function pull(){
    const r=await call('listAll');stamp=r.stamp;
    // 还没传上去的本地改动，叠加在拉下来的数据上，避免被覆盖
    for(const c of COLLS){data[c]={};for(const d of r.collections[c]||[])data[c][d.id]=d.data}
    for(const o of outbox){const c=data[o.coll]=data[o.coll]||{};if(o.op==='delete')delete c[o.id];else if(o.op==='update')c[o.id]=Object.assign(c[o.id]||{},o.data);else c[o.id]=o.data}
    for(const c of COLLS){persist(c);notify(c)}
  }
  function enqueue(op){if(!REMOTE)return;outbox.push(op);saveOut();setBadge();setTimeout(flush,50)}
  if(REMOTE){
    const boot=async()=>{try{await flush();await pull();syncErr=''}catch(e){syncErr=String(e.message||e)}setBadge()};
    setTimeout(boot,0);
    setInterval(async()=>{if(document.hidden)return;try{await flush();if(!outbox.length){const s=await call('stamp');if(s!==stamp)await pull()}syncErr=''}catch(e){syncErr=String(e.message||e)}setBadge()},20000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)flush().then(()=>call('stamp')).then(s=>{if(s!==stamp&&!outbox.length)return pull()}).catch(()=>{})});
    window.addEventListener('online',flush);
  }

  function ref(c,id){return {id,
    async set(d){(data[c]=data[c]||{})[id]=clone(d);persist(c);setTimeout(()=>notify(c));enqueue({op:'set',coll:c,id,data:clone(d)})},
    async update(p){data[c]=data[c]||{};data[c][id]=Object.assign(data[c][id]||{},clone(p));persist(c);setTimeout(()=>notify(c));enqueue({op:'update',coll:c,id,data:clone(p)})},
    async delete(){if(data[c])delete data[c][id];persist(c);setTimeout(()=>notify(c));enqueue({op:'delete',coll:c,id})}}}
  const db={
    collection(c){return {
      onSnapshot(fn){(subs[c]=subs[c]||[]).push(fn);setTimeout(()=>fn(snap(c)));return()=>{subs[c]=subs[c].filter(x=>x!==fn)}},
      doc(id){return ref(c,id||gid())},
      async add(d){const r=ref(c,gid());await r.set(d);return r}}},
    doc(path){const [c,id]=path.split('/');return ref(c,id)}
  };

  /* ---------- 附件：本机用 IndexedDB，同步模式存云端硬盘 ---------- */
  let idbp=null;
  function idb(){if(!idbp)idbp=new Promise((res,rej)=>{const r=indexedDB.open('sophias-desk-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return idbp}
  async function tx(mode,fn){const d=await idb();return new Promise((res,rej)=>{const t=d.transaction('files',mode);const st=t.objectStore('files');let out;const r=fn(st);if(r)r.onsuccess=()=>{out=r.result};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
  const putFile=(name,type,blob)=>{const id='f'+gid();return tx('readwrite',st=>st.put({id,name,type,blob})).then(()=>id)};
  const getFile=async id=>{const r=await tx('readonly',st=>st.get(id));if(!r)throw new Error('找不到这个附件');return r};
  async function b64(blob){const u=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
  function fromB64(b){const s=atob(String(b).trim());const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
  function saveAs(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  const isLocalId=id=>/^f[0-9a-z]+$/.test(id||'')&&String(id).length<=22;
  const assets={
    async upload(blob,o){const type=(o&&o.type)||blob.type||'application/octet-stream';
      const id=REMOTE?await call('uploadB64',blob.name||'file',type,await b64(blob)):await putFile(blob.name||'file',type,blob);
      return {id,url:'#',sizeBytes:blob.size,contentType:type}},
    async delete(id){if(REMOTE&&!isLocalId(id))await call('trashFile',id);else await tx('readwrite',st=>st.delete(id));return {deleted:true}},
    async list(){return {assets:[],usage:{}}}
  };
  window.__DESK={kind:REMOTE?'sync':'local',
    openHint:REMOTE?'点击在 Google 云端硬盘打开原文件':'点击打开原文件（下载后用 Excel / Word / PPT 打开）',
    async openFile(id,name){
      if(REMOTE&&!isLocalId(id)){window.open('https://drive.google.com/file/d/'+id+'/view','_blank','noopener');return}
      const f=await getFile(id);const blob=new Blob([f.blob],{type:f.type});
      if(/^(application\/pdf|image\/|video\/|text\/)/.test(f.type))window.open(URL.createObjectURL(blob),'_blank','noopener');else saveAs(blob,name||f.name)},
    fileText:async id=>REMOTE&&!isLocalId(id)?call('fileText',id):(await getFile(id)).blob.text(),
    fileB64:async id=>REMOTE&&!isLocalId(id)?call('fileB64',id):b64((await getFile(id)).blob),
    uploadB64:(n,m,b)=>REMOTE?call('uploadB64',n,m,b):putFile(n,m,new Blob([fromB64(b)],{type:m})),
    uploadText:(n,t)=>REMOTE?call('uploadText',n,t):putFile(n,'application/json',new Blob([t],{type:'application/json'})),
    async saveBackup(n,j){saveAs(new Blob([j],{type:'application/json'}),n);return '已下载备份文件'},
    async importAll(cols){
      for(const c of COLLS){data[c]={};for(const d of cols[c]||[]){const x=Object.assign({},d);delete x.id;data[c][d.id]=x}persist(c);notify(c)}
      if(REMOTE){outbox=[];saveOut();await call('importAll',cols);stamp=await call('stamp')}
    }
  };
  window.claude={use:async n=>n==='db'?db:n==='assets'?assets:n==='user'?{can:async()=>true,isOwner:()=>true}:null};

  /* ---------- 同步设置（页面上的「同步」按钮和设置窗口） ---------- */
  function setBadge(){const b=document.getElementById('sync-btn');if(!b)return;
    if(!REMOTE){b.textContent='同步：本机';b.title='数据只存在这个浏览器里。点这里连接你的 Google 表格';return}
    b.textContent=syncErr?'同步出错':outbox.length?'同步中…':'已同步 Google 表格';b.classList.toggle('err',!!syncErr);b.title=syncErr||'数据同步到你的 Google 表格'}
  const localHasData=()=>COLLS.some(c=>Object.keys(readColl(c,NS)).length);
  // 把本机数据（含附件）整体搬到表格
  async function migrate(url,key,say){
    const cols={};for(const c of COLLS)cols[c]=Object.entries(readColl(c,NS)).map(([id,d])=>Object.assign({id},d));
    const map={};let n=0;
    for(const t of cols.tasks){for(const f of [...(t.bgFiles||[]),...(t.items||[]).flatMap(i=>i.files||[])]){
      for(const k of ['oid','aid']){const old=f[k];if(!old||!isLocalId(old))continue;
        if(!map[old]){try{const r=await getFile(old);map[old]=await api(url,key,'uploadB64',[r.name,r.type,await b64(r.blob)]);n++;say('正在上传附件 '+n+'…')}catch(e){}}
        if(map[old])f[k]=map[old]}}}
    say('正在上传数据…');await api(url,key,'importAll',[cols]);return n;
  }
  function openDialog(){
    const ov=document.createElement('div');ov.className='vw-overlay';
    const box=document.createElement('div');box.className='vw-box sync-box';box.setAttribute('role','dialog');box.setAttribute('aria-label','同步设置');
    const close=()=>ov.remove();ov.onclick=e=>{if(e.target===ov)close()};
    if(REMOTE){
      box.innerHTML='<div class="vw-head"><div class="vw-name">同步设置</div></div><div class="vw-body"><p>现在数据同步在你的 Google 表格里。</p><p class="hint">接口网址：<code></code></p><p class="hint">断开后回到这个浏览器里原来的本机数据，表格里的数据不会删除。</p><div class="sync-acts"><button type="button" class="btn" data-a="cancel">关闭</button><button type="button" class="btn" data-a="off">断开同步</button></div></div>';
      box.querySelector('code').textContent=cfg.url;
      box.querySelector('[data-a=off]').onclick=()=>{localStorage.removeItem(CFG_KEY);for(const c of COLLS)localStorage.removeItem(RNS+c);location.reload()};
    }else{
      box.innerHTML='<div class="vw-head"><div class="vw-name">连接 Google 表格</div></div><div class="vw-body"><p>连接后，数据和附件存进你自己的 Google 表格 / 云端硬盘；换电脑、换浏览器打开这个网址，再连一次就能看到同样的数据。</p><label class="fld">数据接口网址（以 /exec 结尾）<input id="sync-url" placeholder="https://script.google.com/macros/s/…/exec"></label><label class="fld">密钥<input id="sync-key" placeholder="运行 makeApiKey 得到的密钥"></label><div class="sync-q" hidden><p></p><label class="chk-line"><input type="radio" name="sync-mode" value="sheet" checked> 用表格里的数据（这个浏览器里的本机数据原样保留）</label><label class="chk-line"><input type="radio" name="sync-mode" value="upload"> 用这个浏览器里的数据覆盖表格</label></div><p class="hint sync-msg" role="status"></p><div class="sync-acts"><button type="button" class="btn" data-a="cancel">取消</button><button type="button" class="btn primary" data-a="go">连接</button></div></div>';
      const say=t=>{box.querySelector('.sync-msg').textContent=t};
      let checked=null;
      box.querySelector('[data-a=go]').onclick=async()=>{
        const url=box.querySelector('#sync-url').value.trim(),key=box.querySelector('#sync-key').value.trim();
        if(!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)){say('网址不对：应该以 https://script.google.com/ 开头、/exec 结尾');return}
        if(!key){say('请填写密钥');return}
        try{
          if(!checked){say('正在连接…');const r=await api(url,key,'listAll',[]);const remoteN=COLLS.reduce((s,c)=>s+(r.collections[c]||[]).length,0);
            checked={remoteN};
            if(!remoteN&&localHasData()){say('表格是空的，正在把这个浏览器里的数据上传…');const n=await migrate(url,key,say);say('已上传，共 '+n+' 个附件');}
            else if(remoteN&&localHasData()){const q=box.querySelector('.sync-q');q.hidden=false;q.querySelector('p').textContent='表格里已经有 '+remoteN+' 条记录，这个浏览器里也有数据。选一个：';say('选好后再点一次「连接」');return}
          }else if(box.querySelector('input[name=sync-mode]:checked').value==='upload'){say('正在上传…');await migrate(url,key,say)}
          localStorage.setItem(CFG_KEY,JSON.stringify({url,key,at:Date.now()}));say('连接成功，正在刷新…');setTimeout(()=>location.reload(),400);
        }catch(e){checked=null;say('连接没成功：'+(e.message||e))}
      };
    }
    box.querySelector('[data-a=cancel]').onclick=close;
    ov.append(box);document.body.append(ov);
  }
  function mount(){
    const tabs=document.querySelector('.tabs');if(!tabs||document.getElementById('sync-btn'))return;
    const b=document.createElement('button');b.type='button';b.id='sync-btn';b.className='tab bk sync';b.onclick=openDialog;tabs.append(b);setBadge();
    const st=document.createElement('style');st.textContent='.sync-box{height:auto;max-height:90vh;width:min(560px,100%)}.sync-box .vw-body{gap:10px}.sync-box p{margin:0}.sync-box .fld input{width:100%;box-sizing:border-box}.sync-acts{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}.tab.sync.err{color:var(--bad);border-color:var(--bad)}.sync-box code{word-break:break-all}';document.head.append(st);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else setTimeout(mount);
})();
