// Tilawa panel: a remote control for the worker, which owns playback (audio stops if a frame closes).
const api = (m, p) => orca.plugin.request(m, p || {}, { timeoutMs: 60000 })
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const attr = (o) => esc(JSON.stringify(o))

const I = {
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V5M9.500 13h.01M14.500 13h.01"/>',
  volume: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.500 9a4 4 0 0 1 0 6M19 7a7 7 0 0 1 0 10"/>',
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  bookmark: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>', pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  next: '<path d="M6 5l9 7-9 7zM17 5h2v14h-2z"/>', prev: '<path d="M18 5l-9 7 9 7zM5 5h2v14H5z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', down: '<path d="M6 9l6 6 6-6"/>',
  b10: '<path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5"/><path d="M4 4v4.5h4.5"/><text x="12" y="15.6" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text>',
  f10: '<path d="M20 12a8 8 0 1 1-2.6-5.9L20 8.5"/><path d="M20 4v4.5h-4.5"/><text x="12" y="15.6" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', dl: '<path d="M12 4v11M7.500 11l4.500 4.500 4.500-4.500M5 20h14"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>', star: '<path d="M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.800L12 16.800l-5.200 2.800 1-5.800L3.500 9.700l5.900-.8z"/>', trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>', folder: '<path d="M3.500 7a1 1 0 0 1 1-1H10l2 2.500h7.500a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/>'
}
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`
const fill = (n) => ic(n, 'fill')

const S = { catalog: [], settings: {}, favReciters: [], favTracks: [], playlists: [], downloads: {}, busy: [], recent: [], player: { state: 'idle', pos: 0, dur: 0 }, unmatched: 0 }
const nav = { tab: 'home', stack: [], chip: 'Home', bm: 'fav', q: '' }
const surahs = await (await fetch('surahs.json')).json()
const sInfo = (n) => surahs[n - 1]
const byKey = (k) => S.catalog.find((r) => r.key === k)
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const dlKey = (t) => t.key || `${t.reciterKey}:${t.mid}:${t.surah}`
const isFavT = (t) => S.favTracks.some((f) => f.reciterKey === t.reciterKey && f.surah === t.surah)

// ---------- artwork: photo if resolved, else a generated geometric medallion ----------
const photos = new Map()
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
function medallion(name) {
  const h = hue(name), ini = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(al|el|ibn|bin|abu|abd|abdul)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || name[0]
  return `<svg class="med" viewBox="0 0 100 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="100" height="120" fill="hsl(${h} 28% 16%)"/>
    <g transform="translate(50 52)" fill="none" stroke="hsl(${h} 48% 62%)" stroke-width=".9" opacity=".75">
      <rect x="-30" y="-30" width="60" height="60"/><rect x="-30" y="-30" width="60" height="60" transform="rotate(45)"/>
      <rect x="-21" y="-21" width="42" height="42" transform="rotate(22.5)"/><rect x="-21" y="-21" width="42" height="42" transform="rotate(67.5)"/>
      <circle r="12"/></g>
    <text x="50" y="58" text-anchor="middle" font-family="Figtree,sans-serif" font-weight="700" font-size="17" fill="hsl(${h} 60% 82%)">${esc(ini)}</text></svg>`
}
const art = (name, cls = '') => `<div class="av ${cls}" data-photo="${esc(name)}">${photos.get(name) ? `<img alt="" src="${photos.get(name)}">` : medallion(name)}</div>`
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); loadPhoto(e.target) } }), { rootMargin: '200px' })
function watchPhotos(root) { root.querySelectorAll('[data-photo]').forEach((el) => { const n = el.dataset.photo; if (photos.has(n)) { if (photos.get(n) && !el.querySelector('img')) el.insertAdjacentHTML('afterbegin', `<img alt="" src="${photos.get(n)}">`) } else io.observe(el) }) }
function showPhoto(name, src) {
  photos.set(name, src)
  document.querySelectorAll('[data-photo]').forEach((x) => { if (x.dataset.photo !== name) return; const im = x.querySelector('img'); if (im) im.src = src; else x.insertAdjacentHTML('afterbegin', `<img alt="" src="${src}">`) })
}
async function loadPhoto(el) {
  const name = el.dataset.photo
  if (photos.has(name) || pending.has(name)) return
  pending.add(name)
  try { const r = await api('photo', { name }); if (r.src) showPhoto(name, r.src); else if (!r.retry) photos.set(name, null) } catch {} finally { pending.delete(name) }
}
const pending = new Set()

// ---------- views ----------
const POPULAR = ['alafasi', 'afasy', 'sudais', 'sudays', 'husary', 'hussary', 'minshawi', 'abdul basit', 'abdulbasit', 'shuraim', 'ghamdi', 'maher', 'ajmi', 'basfar', 'rifai', 'dussary', 'dosari', 'muaiqly', 'shatri', 'qatami']
const popular = () => { const out = []; for (const p of POPULAR) { const r = S.catalog.find((x) => !x.localOnly && x.name.toLowerCase().includes(p) && !out.includes(x)); if (r) out.push(r) } return out.slice(0, 10) }
const riwayas = () => { const c = {}; S.catalog.forEach((r) => r.styles.forEach((s) => { c[s.riwaya] = (c[s.riwaya] || 0) + 1 })); return Object.entries(c).filter(([k]) => k !== 'Other').sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k) }
const scroller = (inner) => `<div class="scroller"><button class="sc prev" data-scroll="-1" aria-label="Scroll left" tabindex="-1">${ic('back')}</button><div class="row-h">${inner}</div><button class="sc next" data-scroll="1" aria-label="Scroll right" tabindex="-1" style="transform:scaleX(-1)">${ic('back')}</button></div>`
const chipsHtml = (items, active, act) => `<div class="chips" role="group">${items.map(([v, l]) => `<button class="chip" aria-pressed="${active === v}" data-act="${act}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`
// Equal-width chips in equal-length rows: pick a column count that divides the chip count and fits the width.
function layoutChips(root) {
  root.querySelectorAll('.chips').forEach((el) => {
    const n = el.children.length, w = el.clientWidth, max = Math.max(1, Math.floor((w + 8) / 84))
    let cols = 0
    for (let c = Math.min(max, n); c >= 1; c--) if (n % c === 0) { cols = c; break }
    if (cols < 2 && n > 2) { const rows = Math.ceil(n / max); cols = Math.ceil(n / rows) }
    el.style.gridTemplateColumns = `repeat(${cols || 1}, minmax(0, 1fr))`
  })
}
const card = (r) => `<button class="pc" data-act="open" data-key="${esc(r.key)}">${art(r.name)}${S.favReciters.includes(r.key) ? `<span class="star">${fill('star')}</span>` : ''}<span>${esc(r.name)}</span></button>`

function viewHome() {
  const hasLocal = S.catalog.some((r) => r.localCount > 0)
  const last = S.recent[0] && byKey(S.recent[0].reciterKey)
  let extras = riwayas(); let n = 2 + extras.length + (hasLocal ? 1 : 0)
  while (n > 3 && n % 2) { extras = extras.slice(0, -1); n-- } // keep the count tileable so every row is the same
  const chips = [['Home', 'Home'], ['all', 'All'], ...extras.map((x) => [x, x]), ...(hasLocal ? [['Local', 'My files']] : [])]
  let h = `<h1 class="title">Tilawa</h1><p class="sub">${S.catalog.length} reciters. Stream, save or bring your own files.</p>
  ${chipsHtml(chips, nav.chip, 'chip')}`
  if (nav.chip !== 'Home') {
    const list = S.catalog.filter((r) => nav.chip === 'all' || (nav.chip === 'Local' ? r.localCount > 0 : r.styles.some((s) => s.riwaya === nav.chip)))
    return h + `<div class="grid" style="margin-top:14px">${list.map(card).join('')}</div>`
  }
  if (last) h += `<button class="last" data-act="open" data-key="${esc(last.key)}">${art(last.name, '').replace('class="av ', 'class="av x ')}<span><small>Last seen</small><b>${esc(last.name)}</b></span></button>`.replace('<div class="av x', '<div style="width:42px;height:42px;border-radius:50%" class="av x')
  const favs = S.favReciters.map(byKey).filter(Boolean)
  if (favs.length) h += `<h2 class="sec">Your reciters</h2>${scroller(favs.map(card).join(''))}`
  const loc = S.catalog.filter((r) => r.localCount > 0)
  if (loc.length) h += `<h2 class="sec">My files</h2>${scroller(loc.map(card).join(''))}`
  const pop = popular(); if (pop.length) h += `<h2 class="sec">Popular reciters</h2>${scroller(pop.map(card).join(''))}`
  const rec = S.recent.slice(1).map((x) => byKey(x.reciterKey)).filter(Boolean)
  if (rec.length) h += `<h2 class="sec">Recently played</h2>${scroller(rec.map(card).join(''))}`
  h += `<h2 class="sec">All reciters</h2><div class="grid">${S.catalog.map(card).join('')}</div>`
  return h
}

const trackOf = (r, mid, n) => ({ reciterKey: r.key, reciterName: r.name, surah: n, surahEn: sInfo(n).en.trim(), surahAr: sInfo(n).ar, mid, source: 'any' })
function rowHtml(t, i, list, ctx) {
  const now = S.player.track && S.player.track.reciterKey === t.reciterKey && S.player.track.surah === t.surah && S.player.state !== 'idle'
  const dl = S.downloads[dlKey(t)], busy = S.busy.includes(dlKey(t))
  return `<li class="tr ${now ? 'now' : ''}">
    <span class="n">${now && S.player.state === 'playing' ? '<span class="eq"><i></i><i></i><i></i></span>' : t.surah}</span>
    <button class="main" data-act="${ctx}" data-i="${i}" aria-label="Play ${esc(t.surahEn)}"><b>Sura ${esc(t.surahEn)}${t.source === 'local' ? `<span class="tag" title="Your file">${ic('folder')}</span>` : ''}</b>${ctx === 'playlist-item' || ctx === 'fav-item' || ctx === 'off-item' ? `<small>${esc(t.reciterName)}</small>` : ''}</button>
    <span class="ar" lang="ar">${esc(t.surahAr)}</span>
    <button class="ic" data-act="heart" data-t='${attr(t)}' aria-pressed="${isFavT(t)}" aria-label="Save recitation">${ic('heart', isFavT(t) ? 'fill' : '')}</button>
    <button class="ic" data-act="addpl" data-t='${attr(t)}' aria-label="Add to playlist">${ic('plus')}</button>
    ${t.source === 'local' || t.reciterKey.startsWith('local:') ? '' : `<button class="ic" data-act="dl" data-t='${attr(t)}' aria-pressed="${!!dl}" aria-busy="${busy}" aria-label="${busy ? 'Downloading' : dl ? 'Remove from offline' : 'Save for offline'}" title="${busy ? 'Downloading' : dl ? 'Saved offline. Click to remove.' : 'Save for offline'}">${ic(dl ? 'check' : 'dl')}</button>`}
  </li>`
}

let reciterCache = {}
const defaultMid = (r) => { const s = r.styles.find((x) => /hafs/i.test(x.riwaya) && /murattal/i.test(x.name)) || r.styles.find((x) => /hafs/i.test(x.riwaya)) || r.styles[0]; return s ? s.mid : 0 }
const listKey = (r, mid, src) => `${r.key}:${mid}:${src}`
function viewReciter(f) {
  const r = byKey(f.key); if (!r) return '<p class="empty">Reciter not found.</p>'
  const online = r.styles.length > 0, mine = r.localCount > 0
  const mid = f.mid ?? defaultMid(r), src = f.source || 'any'
  const st = r.styles.find((s) => s.mid === mid) || r.styles[0]
  const list = reciterCache[listKey(r, mid, src)]
  const items = (list || []).map((x) => ({ ...trackOf(r, mid, x.n), source: x.local && src !== 'online' ? 'local' : 'online' }))
  f.items = items
  const sub = online ? `${esc(st.riwaya)}${mine ? ' and your files' : ''}` : 'Your files'
  const styleCtl = online && src !== 'local' ? (r.styles.length > 1 ? `<label class="style"><select data-act="style" aria-label="Recitation style">${r.styles.map((s) => `<option value="${s.mid}" ${s.mid === mid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : `<span class="style">${esc(st.name)}</span>`) : ''
  return `<div class="top"><button class="ghost" data-act="back" aria-label="Back">${ic('back')}</button><h1>Playlist</h1><span style="width:32px"></span></div>
  <div class="hero">${art(r.name)}<div><h2>${esc(r.name)}</h2><p>${sub}</p>${styleCtl}</div></div>
  <div class="actions"><button class="pill" data-act="playall"><span class="dot">${fill('play')}</span> Play</button>
    <button class="sq" data-act="favr" data-key="${esc(r.key)}" aria-pressed="${S.favReciters.includes(r.key)}" aria-label="Favorite reciter">${ic('star', S.favReciters.includes(r.key) ? 'fill' : '')}</button></div>
  ${online && mine ? chipsHtml([['any', 'All'], ['local', 'My files'], ['online', 'Online']], src, 'src') : ''}
  ${list ? (items.length ? `<ul class="list">${items.map((t, i) => rowHtml(t, i, items, 'play')).join('')}</ul>` : '<p class="empty"><b>Nothing here yet</b>This filter has no surahs. Try All.</p>') : '<p class="empty">Loading surahs...</p>'}`
}

function viewSearch() {
  const q = nav.q.trim().toLowerCase()
  let h = `<h1 class="title">Search</h1><label class="search">${ic('search')}<input id="q" type="search" placeholder="Reciter or surah" value="${esc(nav.q)}" autocomplete="off"></label>`
  if (!q) return h + '<p class="empty"><b>Find a recitation</b>Type a reciter such as Husary, or a surah such as Kahf.</p>'
  const rs = S.catalog.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 30)
  const ss = surahs.filter((s) => s.en.toLowerCase().replace(/[^a-z]/g, '').includes(q.replace(/[^a-z]/g, '')) || s.ar.includes(q) || String(s.n) === q).slice(0, 8)
  const lastR = S.recent[0] && byKey(S.recent[0].reciterKey)
  if (ss.length && lastR) h += `<h2 class="sec">Surahs with ${esc(lastR.name)}</h2><ul class="list">${ss.map((s) => { const t = trackOf(lastR, lastR.styles[0].mid, s.n); return rowHtml(t, s.n, [], 'search-surah') }).join('')}</ul>`
  if (rs.length) h += `<h2 class="sec">Reciters</h2><div class="grid">${rs.map(card).join('')}</div>`
  if (!rs.length && !ss.length) h += '<p class="empty"><b>No match</b>Check the spelling, or try the other transliteration.</p>'
  return h
}

function viewBookmarks() {
  const b = nav.bm
  let h = `<h1 class="title">Bookmarks</h1><div class="seg" role="group">${[['fav', 'Favorites'], ['pl', 'Playlists'], ['off', 'Offline']].map(([k, l]) => `<button data-act="bm" data-v="${k}" aria-pressed="${b === k}">${l}</button>`).join('')}</div>`
  if (b === 'fav') {
    const rs = S.favReciters.map(byKey).filter(Boolean)
    h += rs.length ? `<h2 class="sec">Reciters</h2><div class="grid">${rs.map(card).join('')}</div>` : ''
    h += S.favTracks.length ? `<h2 class="sec">Recitations</h2><ul class="list">${S.favTracks.map((t, i) => rowHtml(t, i, S.favTracks, 'fav-item')).join('')}</ul>` : ''
    if (!rs.length && !S.favTracks.length) h += '<p class="empty"><b>Nothing saved yet</b>Tap the star on a reciter or the heart on a surah to keep it here.</p>'
  } else if (b === 'pl') {
    h += `<button class="btn block" data-act="newpl" style="margin:14px 0 6px">${ic('plus')} Create playlist</button>`
    h += S.playlists.length ? `<ul class="list">${S.playlists.map((p) => `<li class="tr"><button class="main" data-act="openpl" data-id="${p.id}"><b>${esc(p.name)}</b><small>${p.items.length} recitation${p.items.length === 1 ? '' : 's'}</small></button><button class="ic" data-act="delpl" data-id="${p.id}" aria-label="Delete playlist">${ic('trash')}</button></li>`).join('')}</ul>` : '<p class="empty"><b>No playlists</b>Group recitations from different reciters, then play them in order.</p>'
  } else {
    const off = Object.keys(S.downloads).map((k) => offTrack(k)).filter(Boolean)
    h += off.length ? `<ul class="list" style="margin-top:8px">${off.map((t, i) => rowHtml(t, i, off, 'off-item')).join('')}</ul>` : '<p class="empty"><b>Nothing downloaded</b>Tap the download icon on a surah to keep it for offline listening.</p>'
    S._off = off
  }
  return h
}
function offTrack(k) { const [rk, mid, n] = k.split(':'), key = rk + ':' + mid.split(':')[0]; const m = /^(mq:\d+):(\d+):(\d+)$/.exec(k); if (!m) return null; const r = byKey(m[1]); return r ? { ...trackOf(r, +m[2], +m[3]), key: k } : null }

function viewPlaylist(f) {
  const p = S.playlists.find((x) => x.id === f.id); if (!p) return '<p class="empty">Playlist not found.</p>'
  f.items = p.items
  return `<div class="top"><button class="ghost" data-act="back" aria-label="Back">${ic('back')}</button><h1>${esc(p.name)}</h1><span style="width:32px"></span></div>
  <div class="actions" style="margin-top:8px"><button class="pill" data-act="playall"><span class="dot">${fill('play')}</span> Play</button></div>
  ${p.items.length ? `<ul class="list">${p.items.map((t, i) => `<li class="tr"><span class="n">${i + 1}</span><button class="main" data-act="pl-item" data-i="${i}"><b>Sura ${esc(t.surahEn)}</b><small>${esc(t.reciterName)}</small></button><span class="ar" lang="ar">${esc(t.surahAr)}</span><button class="ic" data-act="rmpl" data-id="${p.id}" data-k="${esc(t.key)}" aria-label="Remove">${ic('trash')}</button></li>`).join('')}</ul>` : '<p class="empty"><b>Empty playlist</b>Use the plus on any surah to add it here.</p>'}`
}

function viewSettings() {
  const s = S.settings, pc = (v, lo, hi) => ((v - lo) / (hi - lo)) * 100
  const mine = S.catalog.filter((r) => r.localCount > 0).length
  const slider = (key, label, hint, v, lo, hi, step, unit) => `<div class="fld"><div class="fld-h"><label for="s-${key}">${label}</label><span class="val" id="o-${key}">${v}${unit}</span></div>
    <input id="s-${key}" type="range" min="${lo}" max="${hi}" step="${step}" value="${v}" data-set="${key}" data-out="o-${key}" data-unit="${unit}" style="--p:${pc(v, lo, hi)}%">${hint ? `<p class="hint">${hint}</p>` : ''}</div>`
  const opt = (v, title, text) => `<button class="opt" data-act="mode" data-v="${v}" aria-pressed="${s.mode === v}"><b>${title}</b><small>${text}</small></button>`
  return `<h1 class="title">Settings</h1><p class="sub">Tune how Tilawa plays.</p>
  <section class="group"><header class="gh"><span class="gi">${ic('bot')}</span><div><h3>While agents work</h3><p>Let the recitation follow your agents instead of pressing play yourself.</p></div></header>
    <div class="opts" role="group" aria-label="Playback mode">${opt('manual', 'Manual', 'You press play and pause.')}${opt('follow', 'Follow agents', 'Plays while an agent works and pauses when one needs you.')}</div>
    ${s.mode === 'follow' ? slider('startDelay', 'Start after', 'Wait this long once an agent starts, so quick tasks do not restart it.', s.startDelay, 0, 120, 5, 's') + slider('linger', 'Keep playing after', 'How long it keeps going once the last agent finishes.', s.linger, 0, 300, 15, 's') : ''}
  </section>
  <section class="group"><header class="gh"><span class="gi">${ic('volume')}</span><div><h3>Volume</h3><p>Playback level for every recitation.</p></div></header>
    ${slider('volume', 'Level', '', Math.round(s.volume * 100), 0, 100, 5, '%')}
  </section>
  <section class="group"><header class="gh"><span class="gi">${ic('folder')}</span><div><h3>My files</h3><p>Choose a folder with your own recitations. They join the matching reciter, named by surah number or name, for example <i>002 Al-Baqarah Husary.mp3</i> or <i>Husary/36.mp3</i>.</p></div></header>
    <div class="row-f"><input class="text" id="folder" placeholder="C:\\Quran" aria-label="Folder path" value="${esc(s.localFolder || '')}" spellcheck="false"><button class="btn soft" data-act="scan">Scan</button></div>
    <p class="hint" id="scanout">${s.localFolder ? `${mine} reciter${mine === 1 ? '' : 's'} found${S.unmatched ? `, ${S.unmatched} file${S.unmatched === 1 ? '' : 's'} not matched` : ''}.` : 'No folder chosen yet.'}</p>
  </section>`
}

const TABS = [['home', 'Home', 'home'], ['search', 'Search', 'search'], ['bm', 'Bookmarks', 'bookmark'], ['settings', 'Settings', 'settings']]
function render(keepScroll) {
  const top = nav.stack[nav.stack.length - 1]
  const scr = $('screen'), y = scr.scrollTop
  scr.innerHTML = top ? (top.type === 'reciter' ? viewReciter(top) : viewPlaylist(top)) : ({ home: viewHome, search: viewSearch, bm: viewBookmarks, settings: viewSettings }[nav.tab])()
  if (keepScroll) scr.scrollTop = y; else scr.scrollTop = 0
  $('nav').innerHTML = TABS.map(([k, l, i]) => `<button data-act="tab" data-v="${k}" aria-current="${!top && nav.tab === k ? 'page' : 'false'}"><span class="pi">${ic(i)}</span>${l}</button>`).join('')
  watchPhotos(scr); enhanceScrollers(scr); layoutChips(scr); renderMini(); renderSheet()
  if (nav.tab === 'search' && !top) { const q = $('q'); if (q && !keepScroll) q.focus() }
}
function renderMini() {
  const p = S.player, t = p.track, m = $('mini')
  m.innerHTML = t ? `<div class="mp"><button class="mp-main" data-act="sheet" aria-label="Open player: Sura ${esc(t.surahEn)}, ${esc(t.reciterName)}">${art(t.reciterName)}<span class="t"><b>Sura ${esc(t.surahEn)}</b><small>${esc(t.reciterName)}</small></span></button>
    <div class="mp-ctl"><button class="skip" data-act="prev" aria-label="Previous surah">${fill('prev')}</button><button class="pp" data-act="toggle" aria-label="${p.state === 'playing' ? 'Pause' : 'Play'}">${fill(p.state === 'playing' ? 'pause' : 'play')}</button><button class="skip" data-act="next" aria-label="Next surah">${fill('next')}</button></div></div>` : ''
  watchPhotos(m)
}
const SLEEPS = [0, 15, 30, 60]
function renderSheet() {
  const p = S.player, t = p.track, sh = $('sheet')
  if (!t) { sh.innerHTML = ''; return }
  const sleepMin = p.sleepAt ? Math.max(1, Math.round((p.sleepAt - Date.now()) / 60000)) : 0
  sh.innerHTML = `<div class="grab"></div><div class="sh-top"><button class="ghost top-ghost" data-act="sheet-close" aria-label="Close player" style="width:36px;height:36px;display:grid;place-items:center">${ic('down')}</button><span style="color:var(--muted-fg);font-weight:600">Now playing</span><span style="width:36px"></span></div>
  <div class="art av ${p.state === 'playing' ? '' : ''}" data-photo="${esc(t.reciterName)}">${photos.get(t.reciterName) ? `<img alt="" src="${photos.get(t.reciterName)}">` : medallion(t.reciterName)}</div>
  <div class="nm"><div class="ar" lang="ar">${esc(t.surahAr)}</div><b>Sura ${esc(t.surahEn)}</b><small>${esc(t.reciterName)}</small></div>
  <div class="scrub"><input type="range" id="seek" min="0" max="${Math.max(1, p.dur)}" value="${p.pos}" aria-label="Seek" style="--p:${p.dur ? (p.pos / p.dur) * 100 : 0}%"><div class="times"><span id="tp">${fmt(p.pos)}</span><span>${fmt(p.dur)}</span></div></div>
  <div class="ctl"><button data-act="prev" aria-label="Previous">${fill('prev')}</button><button data-act="skip" data-by="-10" aria-label="Back 10 seconds">${ic('b10')}</button>
    <button class="big" data-act="toggle" aria-label="${p.state === 'playing' ? 'Pause' : 'Play'}">${fill(p.state === 'playing' ? 'pause' : 'play')}</button>
    <button data-act="skip" data-by="10" aria-label="Forward 10 seconds">${ic('f10')}</button><button data-act="next" aria-label="Next">${fill('next')}</button></div>
  <div class="tools">
    <button data-act="sleep" aria-pressed="${!!p.sleepAt}" aria-label="Sleep timer">${ic('moon')}${sleepMin ? sleepMin + 'm' : ''}</button>
    <button data-act="heart" data-t='${attr(t)}' aria-pressed="${isFavT(t)}" aria-label="Save recitation">${ic('heart', isFavT(t) ? 'fill' : '')}</button>
    <button data-act="addpl" data-t='${attr(t)}' aria-label="Add to playlist">${ic('plus')}</button></div>`
  watchPhotos(sh)
}

// ---------- horizontal scrollers: arrows, wheel and drag all work with a mouse ----------
function enhanceScrollers(root) {
  root.querySelectorAll('.scroller').forEach((sc) => {
    const row = sc.querySelector('.row-h')
    const sync = () => { sc.toggleAttribute('data-prev', row.scrollLeft > 4); sc.toggleAttribute('data-next', row.scrollLeft + row.clientWidth < row.scrollWidth - 4) }
    row.addEventListener('scroll', sync, { passive: true }); new ResizeObserver(sync).observe(row); requestAnimationFrame(sync)
    row.addEventListener('wheel', (e) => {
      if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const atStart = row.scrollLeft <= 0 && e.deltaY < 0, atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 && e.deltaY > 0
      if (atStart || atEnd) return // let the page scroll when the row has nothing left to give
      e.preventDefault(); row.scrollLeft += e.deltaY
    }, { passive: false })
    let down = null, moved = false
    row.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = { x: e.clientX, left: row.scrollLeft, id: e.pointerId }; moved = false })
    row.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x; if (!moved && Math.abs(dx) > 5) { moved = true; row.classList.add('drag'); row.setPointerCapture(down.id) } if (moved) row.scrollLeft = down.left - dx })
    const end = () => { down = null; row.classList.remove('drag') }
    row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end)
    row.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false } }, true)
    sc.querySelectorAll('[data-scroll]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); row.scrollBy({ left: +b.dataset.scroll * row.clientWidth * 0.85, behavior: 'smooth' }) }))
  })
}

// ---------- actions ----------
function toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600) }
async function open(key) {
  const r = byKey(key); if (!r) return
  const f = { type: 'reciter', key, mid: defaultMid(r), source: 'any' }
  nav.stack.push(f); render()
  await ensureList(r, f.mid, f.source); render(true)
}
async function ensureList(r, mid, src) { const k = listKey(r, mid, src); if (!reciterCache[k]) reciterCache[k] = (await api('reciter.surahs', { key: r.key, mid, source: src })).surahs }
const topFrame = () => nav.stack[nav.stack.length - 1]
const sheet = (open) => { $('sheet').classList.toggle('open', open); $('sheet').setAttribute('aria-hidden', String(!open)) }

function pickPlaylist(track) {
  const m = $('modal')
  m.hidden = false
  m.innerHTML = `<div class="msheet" role="dialog" aria-label="Add to playlist"><h3>Add Sura ${esc(track.surahEn)} to</h3>
    ${S.playlists.map((p) => `<button class="pl" data-act="pickpl" data-id="${p.id}"><span class="n" style="width:40px;height:40px;border-radius:10px;background:var(--soft);display:grid;place-items:center;font-weight:700">${p.items.length}</span><span><b>${esc(p.name)}</b></span></button>`).join('')}
    <div class="field" style="display:flex;gap:8px;margin-top:10px"><input class="text" id="plname" placeholder="New playlist name" maxlength="60"><button class="btn" data-act="mkpl">Create</button></div>
    <button class="btn soft block" data-act="closemodal" style="margin-top:10px">Cancel</button></div>`
  m._track = track; setTimeout(() => $('plname')?.focus(), 30)
}
const closeModal = () => { $('modal').hidden = true; $('modal').innerHTML = '' }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) { if (e.target.id === 'modal') closeModal(); return }
  const a = b.dataset.act
  try {
    if (a === 'tab') { nav.stack = []; nav.tab = b.dataset.v; sheet(false); render() }
    else if (a === 'chip') { nav.chip = b.dataset.v; render() }
    else if (a === 'src') { const f = topFrame(); f.source = b.dataset.v; await ensureList(byKey(f.key), f.mid ?? defaultMid(byKey(f.key)), f.source); render(true) }
    else if (a === 'open') await open(b.dataset.key)
    else if (a === 'back') { nav.stack.pop(); render() }
    else if (a === 'bm') { nav.bm = b.dataset.v; render() }
    else if (a === 'playall') { const f = topFrame(); if (f.type === 'reciter') await api('play', { key: f.key, mid: f.mid ?? defaultMid(byKey(f.key)), source: f.source || 'any', surah: f.items[0]?.surah }); else await api('play.queue', { items: f.items, index: 0 }) }
    else if (a === 'play') { const f = topFrame(); await api('play', { key: f.key, mid: f.mid ?? defaultMid(byKey(f.key)), source: f.source || 'any', surah: f.items[+b.dataset.i].surah }) }
    else if (a === 'pl-item') { const f = topFrame(); await api('play.queue', { items: f.items, index: +b.dataset.i }) }
    else if (a === 'fav-item') await api('play.queue', { items: S.favTracks, index: +b.dataset.i })
    else if (a === 'off-item') await api('play.queue', { items: S._off, index: +b.dataset.i })
    else if (a === 'search-surah') { const t = trackOf(byKey(S.recent[0].reciterKey), byKey(S.recent[0].reciterKey).styles[0].mid, +b.dataset.i); await api('play.queue', { items: [t], index: 0 }) }
    else if (a === 'toggle') await api(S.player.state === 'playing' ? 'pause' : 'resume')
    else if (a === 'next') await api('next'); else if (a === 'prev') await api('prev')
    else if (a === 'skip') await api('skip', { by: +b.dataset.by })
    else if (a === 'sheet') sheet(true); else if (a === 'sheet-close') sheet(false)
    else if (a === 'sleep') { const c = S.player.sleepAt ? SLEEPS.findIndex((m) => m && Math.abs(S.player.sleepAt - Date.now() - m * 60000) < 90000) : 0; const m = SLEEPS[(c + 1) % SLEEPS.length]; await api('sleep', { minutes: m }); toast(m ? `Pausing in ${m} minutes` : 'Sleep timer off') }
    else if (a === 'favr') { S.favReciters = (await api('fav.reciter', { key: b.dataset.key })).favReciters; render(true) }
    else if (a === 'heart') { S.favTracks = (await api('fav.track', { track: JSON.parse(b.dataset.t) })).favTracks; render(true); toast(isFavT(JSON.parse(b.dataset.t)) ? 'Saved to favorites' : 'Removed from favorites') }
    else if (a === 'dl') { const t = JSON.parse(b.dataset.t); const had = !!S.downloads[dlKey(t)]; await api('download', { track: t }); toast(had ? 'Removed from offline' : `Downloading Sura ${t.surahEn}...`) }
    else if (a === 'addpl') pickPlaylist(JSON.parse(b.dataset.t))
    else if (a === 'pickpl') { const t = $('modal')._track; S.playlists = (await api('playlist.add', { id: b.dataset.id, track: t })).playlists; closeModal(); toast('Added to playlist'); render(true) }
    else if (a === 'mkpl') { const name = $('plname').value.trim(); if (!name) return $('plname').focus(); const t = $('modal')._track; S.playlists = (await api('playlist.create', { name, items: t ? [t] : [] })).playlists; closeModal(); toast(`Created ${name}`); render(true) }
    else if (a === 'newpl') { $('modal')._track = null; $('modal').hidden = false; $('modal').innerHTML = `<div class="msheet" role="dialog" aria-label="New playlist"><h3>New playlist</h3><div class="field" style="display:flex;gap:8px"><input class="text" id="plname" placeholder="Name" maxlength="60"><button class="btn" data-act="mkpl">Create</button></div><button class="btn soft block" data-act="closemodal" style="margin-top:10px">Cancel</button></div>`; $('plname').focus() }
    else if (a === 'closemodal') closeModal()
    else if (a === 'openpl') { nav.stack.push({ type: 'playlist', id: b.dataset.id }); render() }
    else if (a === 'delpl') { S.playlists = (await api('playlist.remove', { id: b.dataset.id })).playlists; render(true) }
    else if (a === 'rmpl') { S.playlists = (await api('playlist.remove', { id: b.dataset.id, key: b.dataset.k })).playlists; render(true) }
    else if (a === 'mode') { S.settings = (await api('settings.set', { mode: b.dataset.v })).settings; render(true) }
    else if (a === 'scan') { const r = await api('settings.set', { localFolder: $('folder').value.trim() }); S.settings = r.settings; S.unmatched = r.unmatched; render(true) }
  } catch (err) { toast(err.message || 'Something went wrong') }
})
document.addEventListener('change', async (e) => {
  if (e.target.dataset.act === 'style') { const f = topFrame(); f.mid = +e.target.value; const r = byKey(f.key); await ensureList(r, f.mid, f.source || 'any'); render(true) }
  if (e.target.id === 'seek') await api('seek', { to: +e.target.value })
  if (e.target.id === 'folder') document.querySelector('[data-act=scan]')?.click()
})
document.addEventListener('input', (e) => {
  const t = e.target
  if (t.id === 'q') { nav.q = t.value; clearTimeout(input.h); input.h = setTimeout(() => { const pos = t.selectionStart; render(true); const q = $('q'); q.focus(); q.setSelectionRange(pos, pos) }, 160) }
  else if (t.dataset.set) {
    const v = +t.value; t.style.setProperty('--p', ((v - t.min) / (t.max - t.min)) * 100 + '%')
    if (t.dataset.out) $(t.dataset.out).textContent = v + (t.dataset.unit || '')
    clearTimeout(input.s); input.s = setTimeout(() => (t.dataset.set === 'volume' ? api('volume', { v: v / 100 }) : api('settings.set', { [t.dataset.set]: v })).then((r) => r.settings && (S.settings = r.settings)), 200)
  } else if (t.id === 'seek') { t.style.setProperty('--p', (t.value / t.max) * 100 + '%'); $('tp').textContent = fmt(+t.value); seeking = true; clearTimeout(input.k); input.k = setTimeout(() => (seeking = false), 800) }
})
const input = {}; let seeking = false
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('modal').hidden) closeModal(); else sheet(false) } if (e.key === 'Enter' && e.target.id === 'plname') document.querySelector('[data-act=mkpl]').click() })

// ---------- live updates ----------
orca.plugin.on('player.state', (st) => {
  S.player = st
  renderMini(); renderSheet()
  if (topFrame()?.type === 'reciter' || nav.tab === 'bm') render(true)
})
orca.plugin.on('player.pos', ({ pos, dur }) => {
  S.player.pos = pos; S.player.dur = dur
  const s = $('seek'); if (s && !seeking) { s.max = Math.max(1, dur); s.value = pos; s.style.setProperty('--p', (dur ? (pos / dur) * 100 : 0) + '%'); $('tp').textContent = fmt(pos) }
})
orca.plugin.on('photo.ready', ({ name }) => { if (document.querySelector(`[data-photo="${CSS.escape(name)}"]`)) api('photo', { name }).then((r) => r.src && showPhoto(name, r.src)).catch(() => {}) })
orca.plugin.on('downloads.changed', (d) => { S.downloads = d.downloads; S.busy = d.busy; render(true) })
orca.plugin.on('toast', ({ text }) => toast(text))
orca.plugin.on('catalog.changed', async ({ catalog, unmatched }) => { reciterCache = {}; S.catalog = catalog; S.unmatched = unmatched; render(true) })

new ResizeObserver(() => layoutChips($('screen'))).observe($('screen'))
// ---------- boot ----------
$('screen').innerHTML = '<p class="empty"><b>Loading reciters...</b>The first launch downloads the catalog.</p>'
let init
for (let i = 0; i < 6; i++) { try { init = await api('init'); if (init.catalog.length || i > 3) break } catch {} await new Promise((r) => setTimeout(r, 1500)) }
if (!init) { $('screen').innerHTML = '<p class="empty"><b>Could not reach the player</b>Restart the plugin and reopen this panel.</p>' } else {
  Object.assign(S, init); S.player = init.player; render()
}
