
'use strict';
const TICKET_PDF_BASE='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
let ticketDBPromise, ticketRows=[], ticketReady=false, ticketError='', ticketBusy=false;
let ticketFilterDate='', ticketFilterKind='', ticketEditing=null;
let ticketOpenFiles=null, ticketPage=0, ticketZoom=1, ticketURL='', ticketOpenToken=0;
const ticketKinds=['항공','기차','셔틀','관광지','숙소','기타'];
function ticketDB(){
 if(!ticketDBPromise)ticketDBPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(Error('이 브라우저에서는 기기 저장을 사용할 수 없습니다.'));return;}
  const q=indexedDB.open('honeymoon_ticket_wallet',1);
  q.onupgradeneeded=()=>{q.result.createObjectStore('tickets',{keyPath:'id'});q.result.createObjectStore('files',{keyPath:'id'});};
  q.onsuccess=()=>{q.result.onversionchange=()=>{q.result.close();ticketDBPromise=null;};resolve(q.result);};
  q.onerror=()=>reject(q.error);q.onblocked=()=>{ticketError='다른 앱 창을 닫고 다시 열어 주세요.';};
 });
 return ticketDBPromise;
}
async function ticketRead(storeName,key){
 const db=await ticketDB();return new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,'readonly'),s=tx.objectStore(storeName),q=key===undefined?s.getAll():s.get(key);
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
async function ticketWrite(meta,files,remove=false){
 const db=await ticketDB();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['tickets','files'],'readwrite');
  if(remove){tx.objectStore('tickets').delete(meta.id);tx.objectStore('files').delete(meta.id);}
  else{tx.objectStore('tickets').put(meta);tx.objectStore('files').put(files);}
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('저장이 취소됐습니다.'));
 });
}
function ticketMessage(e){
 return e?.name==='QuotaExceededError'?'기기 저장공간이 부족합니다. 불필요한 탑승권을 삭제하거나 더 작은 파일을 등록해 주세요.':e?.message||'파일을 처리하지 못했습니다.';
}
async function ticketRefresh(){
 try{ticketRows=(await ticketRead('tickets')).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));ticketReady=true;ticketError='';}
 catch(e){ticketError=ticketMessage(e);}
 if(tab==='tickets'||tab==='travel')render();
}
function ticketCard(r){
 return '<div class="row"><div class="grow"><h3>'+esc(r.title)+'</h3><p>'+esc(r.date)+' · '+esc(r.kind)+(r.time?' · '+esc(r.time):'')+'</p><span class="status done">기기에 저장됨 · '+r.pages+'페이지</span><div class="ticket-buttons"><button data-ticket="open" data-id="'+esc(r.id)+'">탑승권 보기</button><button class="edit" data-ticket="edit" data-id="'+esc(r.id)+'">수정·교체</button><button class="edit" data-ticket="download" data-id="'+esc(r.id)+'">원본 저장</button><button class="edit" data-ticket="delete" data-id="'+esc(r.id)+'">삭제</button></div></div></div>';
}
function ticketDay(){
 const rows=ticketRows.filter(r=>r.date===selected);
 return '<section class="card" id="ticketDaySection"><div class="head"><h2>탑승권 · 예약서</h2><button data-ticket="add">+ 등록</button></div>'+
 (ticketError?'<p class="warning">'+esc(ticketError)+'</p>':!ticketReady?'<p class="muted">기기 저장 확인 중…</p>':rows.length?rows.map(ticketCard).join(''):'<p class="muted">이 날짜의 PDF·이미지를 미리 저장하세요.</p>')+'</section>';
}
function tickets(){
 const rows=ticketRows.filter(r=>(!ticketFilterDate||r.date===ticketFilterDate)&&(!ticketFilterKind||r.kind===ticketFilterKind));
 return '<section class="card"><div class="head"><h2>탑승권 · 예약서</h2><button data-ticket="add">+ 등록</button></div><p class="body-text">이 휴대폰에만 저장됩니다. GitHub나 다른 기기로 전송되지 않습니다.</p><p class="hint" id="ticketOfflineStatus">오프라인 준비 상태 확인 중…</p><div class="ticket-buttons"><button data-ticket="prepare">오프라인 준비 확인</button></div><div class="ticket-filters"><label>이용 날짜<input id="ticketDateFilter" type="date" value="'+esc(ticketFilterDate)+'"></label><label>종류<select id="ticketKindFilter"><option value="">전체</option>'+ticketKinds.map(k=>'<option'+(k===ticketFilterKind?' selected':'')+'>'+k+'</option>').join('')+'</select></label></div><button class="edit" data-ticket="clearFilter">전체 날짜 보기</button></section><section class="card">'+(ticketError?'<p class="warning">'+esc(ticketError)+'</p>':!ticketReady?'<p class="muted">기기 저장 확인 중…</p>':rows.length?rows.map(ticketCard).join(''):'<p class="zero">등록된 파일이 없습니다.</p>')+'</section><section class="card"><h3>보관 안내</h3><p class="body-text">실제로 사용할 홈 화면 앱에서 등록하세요. 브라우저 데이터 삭제·저장공간 정리로 파일이 사라질 수 있으니 원본은 휴대폰 파일 앱에도 보관하세요.</p><p class="hint">일정 JSON 백업에는 탑승권이 포함되지 않습니다. PDF는 페이지 미리보기를 함께 저장하며, 처음 PDF를 등록할 때는 인터넷 연결이 필요할 수 있습니다. 등록 후 비행기 모드에서 한 번 열어 보세요.</p></section>';
}
async function ticketOfflineStatus(){
 const el=document.getElementById('ticketOfflineStatus');if(!el)return;
 try{
  const cached='caches' in window&&await caches.match(new URL('./tickets.js',location.href).href);
  const shell='caches' in window&&await caches.match(new URL('./index.html',location.href).href);
  const controlled=!!navigator.serviceWorker?.controller;
  const persistent=await navigator.storage?.persisted?.();
  el.textContent=(cached&&shell&&controlled?'오프라인 열람 준비됨':'온라인에서 앱을 다시 열어 오프라인 준비를 완료하세요.')+(persistent?' · 저장 유지 허용됨':' · 원본 별도 보관 권장');
 }catch(e){el.textContent='오프라인 준비 상태를 확인하지 못했습니다. 비행기 모드에서 파일을 열어 확인하세요.';}
}
function ticketEditor(id){
 const r=ticketRows.find(x=>x.id===id);ticketEditing=r||null;
 document.getElementById('ticketForm').reset();
 document.getElementById('ticketEditTitle').textContent=r?'탑승권 수정·교체':'탑승권 등록';
 document.getElementById('ticketDate').value=r?.date||selected;
 document.getElementById('ticketKind').value=r?.kind||'항공';
 document.getElementById('ticketTitle').value=r?.title||'';
 document.getElementById('ticketTime').value=r?.time||'';
 document.getElementById('ticketFile').required=!r;
 document.getElementById('ticketFileHint').textContent=r?'파일을 선택하면 교체합니다. 선택하지 않으면 기존 파일을 유지합니다.':'PDF·JPG·PNG·WebP / 파일당 최대 20MB, PDF 최대 30페이지';
 document.getElementById('ticketProgress').textContent='';
 document.getElementById('ticketEditor').showModal();
}
async function ticketMime(file){
 const a=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(a[0]===37&&a[1]===80&&a[2]===68&&a[3]===70&&a[4]===45)return 'application/pdf';
 if(a[0]===255&&a[1]===216&&a[2]===255)return 'image/jpeg';
 if(a[0]===137&&a[1]===80&&a[2]===78&&a[3]===71)return 'image/png';
 if(String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP')return 'image/webp';
 throw Error('PDF·JPG·PNG·WebP 파일을 선택해 주세요. HEIC 사진은 JPG 또는 화면 캡처로 저장해 주세요.');
}
function ticketImage(blob){
 return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(blob);
 img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('이미지를 열 수 없습니다. 다른 파일을 선택해 주세요.'));};img.src=url;});
}
async function ticketPrepareFile(file){
 if(!file.size||file.size>20*1024*1024)throw Error('0바이트 초과, 20MB 이하 파일을 선택해 주세요.');
 const mime=await ticketMime(file),original=file.slice(0,file.size,mime),pages=[];
 if(mime!=='application/pdf'){const img=await ticketImage(original);if(!img.naturalWidth)throw Error('이미지를 확인할 수 없습니다.');return {original,pages,mime,count:1};}
 let lib;
 try{lib=await import(TICKET_PDF_BASE+'pdf.min.mjs');lib.GlobalWorkerOptions.workerSrc=TICKET_PDF_BASE+'pdf.worker.min.mjs';}
 catch(e){throw Error('PDF 열람 기능을 준비하지 못했습니다. 인터넷 연결 후 다시 등록해 주세요. 이미지 등록은 오프라인에서도 가능합니다.');}
 let task,doc;
 try{
  task=lib.getDocument({data:new Uint8Array(await original.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,disableAutoFetch:true});
  doc=await task.promise;
  if(doc.numPages>30)throw Error('PDF는 30페이지까지 등록할 수 있습니다. 필요한 탑승권 페이지만 저장해 주세요.');
  let total=original.size;
  for(let n=1;n<=doc.numPages;n++){
   document.getElementById('ticketProgress').textContent='PDF '+n+' / '+doc.numPages+'페이지를 기기에 저장할 준비 중…';
   const p=await doc.getPage(n),v=p.getViewport({scale:1});
   const scale=Math.min(3,2048/Math.max(v.width,v.height)),vp=p.getViewport({scale});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
   await p.render({canvasContext:canvas.getContext('2d'),viewport:vp,background:'rgb(255,255,255)'}).promise;
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=0;p.cleanup();
   if(!blob)throw Error('PDF 미리보기를 만들지 못했습니다.');
   total+=blob.size;if(total>100*1024*1024)throw Error('미리보기 용량이 너무 큽니다. PDF를 나누어 등록해 주세요.');
   pages.push(blob);
  }
  return {original,pages,mime,count:pages.length};
 }catch(e){if(e.name==='PasswordException')throw Error('암호가 설정된 PDF입니다. 암호를 해제한 사본 또는 탑승권 이미지를 등록해 주세요.');throw e;}
 finally{if(doc)await doc.destroy();else if(task)await task.destroy();}
}
async function ticketSubmit(e){
 e.preventDefault();if(ticketBusy)return;ticketBusy=true;
 const form=document.getElementById('ticketForm'),button=document.getElementById('ticketSave');
 button.disabled=true;document.getElementById('ticketCancel').disabled=true;
 try{
  const date=document.getElementById('ticketDate').value,title=document.getElementById('ticketTitle').value.trim();
  if(!isoValid(date)||!title)throw Error('날짜와 제목을 입력해 주세요.');
  const picked=document.getElementById('ticketFile').files[0],id=ticketEditing?.id||crypto.randomUUID();
  const prior=ticketEditing?await ticketRead('files',id):null;
  if(!picked&&!prior)throw Error('파일을 선택해 주세요.');
  const prepared=picked?await ticketPrepareFile(picked):null;
  const data=prepared?{id,original:prepared.original,pages:prepared.pages}:prior;
  const meta={id,date,title,kind:document.getElementById('ticketKind').value,time:document.getElementById('ticketTime').value,
   filename:picked?.name||ticketEditing.filename,mime:prepared?.mime||ticketEditing.mime,pages:prepared?.count||ticketEditing.pages,updatedAt:Date.now()};
  document.getElementById('ticketProgress').textContent='기기에 저장 중…';
  await ticketWrite(meta,data);
  const check=await ticketRead('files',id);
  if(!check?.original?.size)throw Error('저장한 파일을 확인하지 못했습니다. 다시 등록해 주세요.');
  navigator.storage?.persist?.().catch(()=>{});
  document.getElementById('ticketEditor').close();await ticketRefresh();toast('탑승권을 이 기기에 저장했습니다.');
 }catch(err){document.getElementById('ticketProgress').textContent=ticketMessage(err);}
 finally{ticketBusy=false;button.disabled=false;document.getElementById('ticketCancel').disabled=false;}
}
function ticketCleanup(){
 ticketOpenToken++;if(ticketURL){URL.revokeObjectURL(ticketURL);ticketURL='';}
 ticketOpenFiles=null;document.getElementById('ticketImage').removeAttribute('src');
}
function ticketShowPage(){
 if(!ticketOpenFiles)return;
 if(ticketURL)URL.revokeObjectURL(ticketURL);
 const pages=ticketOpenFiles.pages?.length?ticketOpenFiles.pages:[ticketOpenFiles.original];
 ticketPage=Math.max(0,Math.min(ticketPage,pages.length-1));
 ticketURL=URL.createObjectURL(pages[ticketPage]);document.getElementById('ticketImage').src=ticketURL;
 document.getElementById('ticketPageLabel').textContent=(ticketPage+1)+' / '+pages.length;
 document.getElementById('ticketPrev').disabled=ticketPage===0;document.getElementById('ticketNext').disabled=ticketPage===pages.length-1;
 ticketZoom=1;ticketApplyZoom();document.querySelector('.ticket-stage').scrollTo(0,0);
}
function ticketApplyZoom(){
 const img=document.getElementById('ticketImage');img.style.width=(ticketZoom*100)+'%';
 document.getElementById('ticketZoomLabel').textContent=Math.round(ticketZoom*100)+'%';
}
async function ticketOpen(id){
 const r=ticketRows.find(x=>x.id===id);if(!r)return;ticketCleanup();
 const token=ticketOpenToken;
 document.getElementById('ticketViewerTitle').textContent=r.title;
 document.getElementById('ticketViewerNote').textContent='기기에서 파일을 여는 중…';
 document.getElementById('ticketViewer').showModal();
 try{const files=await ticketRead('files',id);if(token!==ticketOpenToken)return;if(!files?.original)throw Error('파일이 없습니다. 다시 등록해 주세요.');
 ticketOpenFiles=files;ticketPage=0;ticketShowPage();document.getElementById('ticketViewerNote').textContent='확대 후 화면을 움직여 QR을 보여주세요. PDF 원본은 목록에서 저장할 수 있습니다.';
 }catch(e){if(token===ticketOpenToken)document.getElementById('ticketViewerNote').textContent=ticketMessage(e);}
}
async function ticketDownload(id){
 const r=ticketRows.find(x=>x.id===id),f=await ticketRead('files',id);if(!r||!f?.original)throw Error('원본 파일이 없습니다.');
 const url=URL.createObjectURL(f.original),a=document.createElement('a');a.href=url;a.download=r.filename||'ticket';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function ticketAction(action,id){
 if(action==='add')return ticketEditor();
 if(action==='edit')return ticketEditor(id);
 if(action==='open')return ticketOpen(id);
 if(action==='download')return ticketDownload(id);
 if(action==='delete'){const r=ticketRows.find(x=>x.id===id);if(r&&confirm('이 기기에서 "'+r.title+'" 파일을 삭제할까요?')){await ticketWrite(r,null,true);await ticketRefresh();}return;}
 if(action==='clearFilter'){ticketFilterDate='';ticketFilterKind='';render();return;}
 if(action==='prepare'){
  const el=document.getElementById('ticketOfflineStatus');if(el)el.textContent='오프라인 준비 확인 중…';
  try{await navigator.storage?.persist?.();const reg=await navigator.serviceWorker?.getRegistration();if(reg&&navigator.onLine)await reg.update();}
  catch(e){toast('네트워크 또는 저장 권한을 확인해 주세요.');}
  await ticketOfflineStatus();return;
 }
}
function initTickets(){
 document.addEventListener('click',e=>{const b=e.target.closest('[data-ticket]');if(b){e.preventDefault();ticketAction(b.dataset.ticket,b.dataset.id).catch(err=>toast(ticketMessage(err)));}});
 document.addEventListener('change',e=>{
  if(e.target.id==='ticketDateFilter'){ticketFilterDate=e.target.value;render();}
  if(e.target.id==='ticketKindFilter'){ticketFilterKind=e.target.value;render();}
  if(e.target.id==='ticketFile'&&!document.getElementById('ticketTitle').value)document.getElementById('ticketTitle').value=e.target.files[0]?.name.replace(/\.[^.]+$/,'')||'';
 });
 document.getElementById('ticketForm').onsubmit=ticketSubmit;
 document.getElementById('ticketCancel').onclick=()=>document.getElementById('ticketEditor').close();
 document.getElementById('ticketEditor').addEventListener('cancel',e=>{if(ticketBusy)e.preventDefault();});
 document.getElementById('ticketClose').onclick=()=>document.getElementById('ticketViewer').close();
 document.getElementById('ticketViewer').addEventListener('close',ticketCleanup);
 document.getElementById('ticketPrev').onclick=()=>{ticketPage--;ticketShowPage();};
 document.getElementById('ticketNext').onclick=()=>{ticketPage++;ticketShowPage();};
 document.getElementById('ticketZoomIn').onclick=()=>{ticketZoom=Math.min(4,ticketZoom+.5);ticketApplyZoom();};
 document.getElementById('ticketZoomOut').onclick=()=>{ticketZoom=Math.max(1,ticketZoom-.5);ticketApplyZoom();};
 document.getElementById('ticketZoomReset').onclick=()=>{ticketZoom=1;ticketApplyZoom();};
 document.getElementById('ticketImage').onerror=()=>{document.getElementById('ticketViewerNote').textContent='미리보기를 열지 못했습니다. 목록에서 원본을 저장하거나 다시 등록해 주세요.';};
 window.addEventListener('focus',ticketRefresh);
 navigator.serviceWorker?.addEventListener('controllerchange',ticketOfflineStatus);
 ticketRefresh();
}
