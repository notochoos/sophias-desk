// Google 版数据层：把页面的 db / assets 调用接到 Google Apps Script（表格 + 云端硬盘）
(function(){
  const gs=(fn,...a)=>new Promise((res,rej)=>google.script.run.withSuccessHandler(res).withFailureHandler(e=>rej(e&&e.message?{code:'upstream_error',message:e.message}:e))[fn](...a));
  const data={},subs={};let stamp='',loaded=false,pending=0,q=Promise.resolve();
  const clone=o=>JSON.parse(JSON.stringify(o===undefined?{}:o));
  const gid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  const snap=c=>({docs:Object.entries(data[c]||{}).map(([id,d])=>({id,data:()=>clone(d)}))});
  const notify=c=>{(subs[c]||[]).forEach(fn=>{try{fn(snap(c))}catch(e){console.error(e)}})};
  const notifyAll=()=>Object.keys(subs).forEach(notify);
  async function load(){const r=await gs('listAll');stamp=r.stamp;for(const c in r.collections){data[c]={};for(const d of r.collections[c])data[c][d.id]=d.data}loaded=true;notifyAll()}
  function enqueue(op){pending++;const p=q.then(()=>gs('write',[op])).then(s=>{stamp=s},e=>{console.error(e);showErr(e)}).finally(()=>{pending--});q=p;return p}
  function showErr(e){const n=document.getElementById('notice');if(n){n.hidden=false;n.textContent='保存到 Google 表格失败：'+(e&&e.message||e)+'。刷新页面后再试。'}}
  function ref(c,id){return {id,
    set(d){(data[c]=data[c]||{})[id]=clone(d);setTimeout(()=>notify(c));return enqueue({op:'set',coll:c,id,data:clone(d)})},
    update(p){data[c]=data[c]||{};data[c][id]=Object.assign(data[c][id]||{},clone(p));setTimeout(()=>notify(c));return enqueue({op:'update',coll:c,id,data:clone(p)})},
    delete(){if(data[c])delete data[c][id];setTimeout(()=>notify(c));return enqueue({op:'delete',coll:c,id})}}}
  const db={
    collection(c){return {
      onSnapshot(fn){(subs[c]=subs[c]||[]).push(fn);if(loaded)setTimeout(()=>fn(snap(c)));return()=>{subs[c]=subs[c].filter(x=>x!==fn)}},
      doc(id){return ref(c,id||gid())},
      add(d){const r=ref(c,gid());return r.set(d).then(()=>r)}}},
    doc(path){const [c,id]=path.split('/');return ref(c,id)}
  };
  // 定时检查：表格被你或其他工具改过，就重新载入
  setInterval(async()=>{if(document.hidden||pending)return;try{const s=await gs('stamp');if(s!==stamp&&!pending)await load()}catch(e){}},20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!pending)gs('stamp').then(s=>{if(s!==stamp)load()},()=>{})});
  async function b64(blob){const u=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
  const assets={
    async upload(blob,o){const id=await gs('uploadB64',blob.name||'file',(o&&o.type)||blob.type||'application/octet-stream',await b64(blob));return {id,url:'https://drive.google.com/file/d/'+id+'/view',sizeBytes:blob.size,contentType:(o&&o.type)||blob.type}},
    async delete(id){await gs('trashFile',id);return {deleted:true}},
    async list(){return {assets:[],usage:{}}}
  };
  window.__DESK={kind:'google',openHint:'点击在 Google 云端硬盘打开原文件（可用 Google 表格 / 文档打开或下载）',
    openFile:id=>{window.open('https://drive.google.com/file/d/'+id+'/view','_blank','noopener')},
    fileText:id=>gs('fileText',id),fileB64:id=>gs('fileB64',id),
    uploadB64:(n,m,b)=>gs('uploadB64',n,m,b),uploadText:(n,t)=>gs('uploadText',n,t),
    saveBackup:async(n,j)=>{const url=await gs('saveBackup',n,j);window.open(url,'_blank','noopener');return '已保存到云端硬盘'},
    importAll:async c=>{await q;await gs('importAll',c);await load()}
  };
  const ready=load().catch(e=>{showErr(e)});
  window.claude={use:async n=>{if(n==='db'){await ready;return db}if(n==='assets')return assets;if(n==='user')return {can:async()=>true,isOwner:()=>true};return null}};
})();
