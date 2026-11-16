// DragTak V2 — service de tuiles hors ligne (repris de la V1, public/sw.js, partie « cartes » seulement).
// Il ne touche QUE les tuiles IGN (data.geopf.fr, GetTile) : cache d'abord, sinon réseau (mise en cache de ce qui est regardé),
// sinon agrandissement d'une tuile parente déjà en cache. L'appli et la console ne sont jamais mises en cache par lui.
const TUILES = 'dt-tuiles'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Clé de cache d'une tuile : sans le paramètre de nouvel essai « &r= »
const cle = url => url.replace(/&r=\d+$/, '')
const xyz = url => { const u = new URL(url); return { z: +u.searchParams.get('TILEMATRIX'), y: +u.searchParams.get('TILEROW'), x: +u.searchParams.get('TILECOL') } }
const avec = (url, z, x, y) => { const u = new URL(cle(url)); u.searchParams.set('TILEMATRIX', z); u.searchParams.set('TILEROW', y); u.searchParams.set('TILECOL', x); return u.toString() }

async function tuile(req) {
  const c = await caches.open(TUILES)
  const k = cle(req.url)
  const deja = await c.match(k)
  if (deja) return deja
  try {
    let r
    try { r = await fetch(k, { mode: 'cors', credentials: 'omit' }) }
    catch (e) {
      // Point d'accès privé (SCAN 25) sans en-tête CORS : on affiche la tuile sans la mettre en cache
      if (!navigator.onLine) throw e
      const o = await fetch(k, { mode: 'no-cors', credentials: 'omit' })
      if (o.type === 'opaque') return o
      throw e
    }
    if (r.ok) { c.put(k, r.clone()); return r }
    throw new Error('http ' + r.status)
  } catch (err) {
    // Hors ligne : on cherche une tuile parente (jusqu'à 5 niveaux au-dessus) et on l'agrandit
    try {
      const { z, x, y } = xyz(k)
      for (let d = 1; d <= 5 && z - d >= 0; d++) {
        const px = x >> d, py = y >> d
        const p = await c.match(avec(k, z - d, px, py))
        if (!p) continue
        const n = 1 << d, taille = 256 / n
        const img = await createImageBitmap(await p.blob())
        const cv = new OffscreenCanvas(256, 256); const g = cv.getContext('2d')
        g.imageSmoothingEnabled = true
        g.drawImage(img, (x - px * n) * taille, (y - py * n) * taille, taille, taille, 0, 0, 256, 256)
        return new Response(await cv.convertToBlob({ type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } })
      }
    } catch (e) { }
    return new Response('', { status: 504 })
  }
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const u = new URL(req.url)
  if (u.hostname === 'data.geopf.fr' && u.searchParams.get('REQUEST') === 'GetTile') e.respondWith(tuile(req))
})
