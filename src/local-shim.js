// 浏览器本地版数据层：数据存在这个浏览器里（localStorage），附件存在 IndexedDB。
// 换电脑或清理浏览器数据前，请先点「导出备份」。
(function(){
  const NS='sophias-desk:';const COLLS=['goals','events','notes','tasks','kb_items','kbmeta'];
  const data={},subs={};
  const clone=o=>JSON.parse(JSON.stringify(o===undefined?{}:o));
  const gid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  const readColl=c=>{try{return JSON.parse(localStorage.getItem(NS+c)||'{}')||{}}catch(e){return {}}};
  for(const c of COLLS)data[c]=readColl(c);
  let warned=false;
  function persist(c){try{localStorage.setItem(NS+c,JSON.stringify(data[c]||{}))}catch(e){if(!warned){warned=true;const n=document.getElementById('notice');if(n){n.hidden=false;n.textContent='浏览器存储空间不够了，新内容可能没保存。请先「导出备份」，再删除一些旧记录。'}}}}
  const snap=c=>({docs:Object.entries(data[c]||{}).map(([id,d])=>({id,data:()=>clone(d)}))});
  const notify=c=>{(subs[c]||[]).forEach(fn=>{try{fn(snap(c))}catch(e){console.error(e)}})};
  // 同一浏览器开了多个标签页时互相同步
  window.addEventListener('storage',e=>{if(e.key&&e.key.startsWith(NS)){const c=e.key.slice(NS.length);if(COLLS.includes(c)){data[c]=readColl(c);notify(c)}}});
  function ref(c,id){return {id,
    async set(d){(data[c]=data[c]||{})[id]=clone(d);persist(c);setTimeout(()=>notify(c))},
    async update(p){data[c]=data[c]||{};data[c][id]=Object.assign(data[c][id]||{},clone(p));persist(c);setTimeout(()=>notify(c))},
    async delete(){if(data[c])delete data[c][id];persist(c);setTimeout(()=>notify(c))}}}
  const db={
    collection(c){return {
      onSnapshot(fn){(subs[c]=subs[c]||[]).push(fn);setTimeout(()=>fn(snap(c)));return()=>{subs[c]=subs[c].filter(x=>x!==fn)}},
      doc(id){return ref(c,id||gid())},
      async add(d){const r=ref(c,gid());await r.set(d);return r}}},
    doc(path){const [c,id]=path.split('/');return ref(c,id)}
  };
  // 附件：IndexedDB
  let idbp=null;
  function idb(){if(!idbp)idbp=new Promise((res,rej)=>{const r=indexedDB.open('sophias-desk-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return idbp}
  async function tx(mode,fn){const d=await idb();return new Promise((res,rej)=>{const t=d.transaction('files',mode);const st=t.objectStore('files');let out;const r=fn(st);if(r)r.onsuccess=()=>{out=r.result};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
  const putFile=(name,type,blob)=>{const id='f'+gid();return tx('readwrite',st=>st.put({id,name,type,blob})).then(()=>id)};
  const getFile=async id=>{const r=await tx('readonly',st=>st.get(id));if(!r)throw new Error('找不到这个附件');return r};
  async function b64(blob){const u=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
  function fromB64(b){const s=atob(String(b).trim());const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
  function saveAs(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  const assets={
    async upload(blob,o){const type=(o&&o.type)||blob.type||'application/octet-stream';const id=await putFile(blob.name||'file',type,blob);return {id,url:'#',sizeBytes:blob.size,contentType:type}},
    async delete(id){await tx('readwrite',st=>st.delete(id));return {deleted:true}},
    async list(){return {assets:[],usage:{}}}
  };
  window.__DESK={kind:'local',openHint:'点击打开原文件（下载后用 Excel / Word / PPT 打开）',
    async openFile(id,name){const f=await getFile(id);const blob=new Blob([f.blob],{type:f.type});
      if(/^(application\/pdf|image\/|video\/|text\/)/.test(f.type)){window.open(URL.createObjectURL(blob),'_blank','noopener')}else saveAs(blob,name||f.name)},
    fileText:async id=>(await getFile(id)).blob.text(),
    fileB64:async id=>b64((await getFile(id)).blob),
    uploadB64:(n,m,b)=>putFile(n,m,new Blob([fromB64(b)],{type:m})),
    uploadText:(n,t)=>putFile(n,'application/json',new Blob([t],{type:'application/json'})),
    async saveBackup(n,j){saveAs(new Blob([j],{type:'application/json'}),n);return '已下载备份文件'},
    async importAll(cols){for(const c of COLLS){data[c]={};for(const d of cols[c]||[]){const x=Object.assign({},d);delete x.id;data[c][d.id]=x}persist(c);notify(c)}}
  };
  window.claude={use:async n=>n==='db'?db:n==='assets'?assets:n==='user'?{can:async()=>true,isOwner:()=>true}:null};
})();
