const CACHE='natzor-v2.5.8';const ASSETS=['/','/styles.css','/app.js','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/'))return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});

self.addEventListener('push',event=>{let d={};try{d=event.data.json()}catch{}event.waitUntil(self.registration.showNotification(d.title||'נצור לשונך',{body:d.body||'',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',data:{url:d.url||'/'}}))});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow(event.notification.data?.url||'/'))});
