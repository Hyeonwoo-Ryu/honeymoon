
'use strict';
const PREFIX='honeymoon-'+self.registration.scope+'-',CACHE=PREFIX+'v3-3-tickets';
const ASSETS=['./','./index.html','./tickets.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const PDF_ASSETS=['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs','https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'];
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const c=await caches.open(CACHE);
 await c.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));
 // The PDF library contains no user files. Saved previews need no library to open.
 try{await c.addAll(PDF_ASSETS.map(url=>new Request(url,{mode:'cors',credentials:'omit'})));}catch(e){}
 await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(PDF_ASSETS.includes(u.href)){
  e.respondWith((async()=>{const c=await caches.open(CACHE),hit=await c.match(e.request);if(hit)return hit;const r=await fetch(e.request);if(r.ok)await c.put(e.request,r.clone());return r;})());return;
 }
 if(u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put('./index.html',copy)));return r;}return caches.match('./index.html').then(c=>c||r);}).catch(()=>caches.match('./index.html')));return;
 }
 e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});
