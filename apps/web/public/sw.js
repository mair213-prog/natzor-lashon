const CACHE='kidum-plus-shell-v8860';
const SHELL=['/manifest.webmanifest'];
const STATIC_PREFIXES=['/_next/static/','/icons/','/media/'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return;

  // Never serve stale application HTML. Navigation is always network-first.
  if(req.mode==='navigate' || req.destination==='document'){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req).then(hit=>hit||caches.match('/'))));
    return;
  }

  // Next.js hashed assets are immutable. Cache after first network fetch.
  const isStatic=STATIC_PREFIXES.some(prefix=>url.pathname.startsWith(prefix));
  if(isStatic){
    event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}
      return res;
    })));
    return;
  }

  // Everything else stays fresh.
  event.respondWith(fetch(req));
});
