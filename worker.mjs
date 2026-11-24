// Tilawa worker. Owns everything that must outlive the panel: audio playback (a PowerShell
// MediaPlayer helper), the reciter catalog, photos, the user's library, favorites, playlists and
// the agent-following logic. The panel is only a remote control.
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync, readFileSync, renameSync, readdirSync, statSync, unlinkSync, createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join, dirname, basename, extname } from 'node:path'
import { homedir } from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { samePerson, matchReciter } from './names.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'orca-tilawa') // Orca withholds most env vars
const dirs = { audio: join(root, 'audio'), photos: join(root, 'photos') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
for (const f of readdirSync(dirs.audio)) if (f.endsWith('.part')) unlinkSync(join(dirs.audio, f)) // interrupted downloads
const UA = 'orca-tilawa/0.2 (Orca plugin)'
const surahs = JSON.parse(readFileSync(join(here, 'surahs.json'), 'utf8'))
const pad3 = (n) => String(n).padStart(3, '0')
const idle = () => ({ state: 'idle', pos: 0, dur: 0 })
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 20)

let proc = null
let proxy = null // loopback relay: Windows' media engine cannot open https:// itself
const DEFAULTS = { mode: 'manual', startDelay: 15, linger: 60, volume: 0.9, localFolder: '' }

export default async function activate(orca) {
  const store = {
    get: async (k, d) => { const v = await orca.storage.get(k); return v == null ? d : v },
    set: (k, v) => orca.storage.set(k, v)
  }
  let settings = { ...DEFAULTS, ...(await store.get('settings', {})) }
  let favReciters = await store.get('favReciters', []) // [reciterKey]
  let favTracks = await store.get('favTracks', []) // [{key,...track}]
  let playlists = await store.get('playlists', []) // [{id,name,items:[track]}]
  let downloads = await store.get('downloads', {}) // key -> true
  let recent = await store.get('recent', []) // [{reciterKey,name}]
  let last = await store.get('last', null) // {queue, idx}

  // ---------------- catalog (mp3quran) + local library ----------------
  let reciters = [] // {key,id,name,styles:[{mid,name,riwaya,count,server,list:Set}]}
  const byKey = new Map()
  const catalogFile = join(root, 'catalog.json')

  async function loadCatalog() {
    let raw
    try {
      if (existsSync(catalogFile) && Date.now() - statSync(catalogFile).mtimeMs < 6 * 864e5) raw = JSON.parse(readFileSync(catalogFile, 'utf8'))
    } catch {}
    if (!raw) {
      try {
        const res = await fetch('https://www.mp3quran.net/api/v3/reciters?language=eng', { headers: { 'user-agent': UA } })
        if (!res.ok) throw new Error(String(res.status))
        raw = await res.json()
        writeFileSync(catalogFile, JSON.stringify(raw))
      } catch (e) {
        orca.log(`catalog fetch failed: ${e.message}`)
        try { raw = JSON.parse(readFileSync(catalogFile, 'utf8')) } catch { raw = { reciters: [] } }
      }
    }
    // Arabic names (same ids) make photo matching far more reliable than English transliterations.
    const arFile = join(root, 'catalog-ar.json'); let arNames = {}
    try {
      let rawAr
      if (existsSync(arFile) && Date.now() - statSync(arFile).mtimeMs < 30 * 864e5) rawAr = JSON.parse(readFileSync(arFile, 'utf8'))
      else {
        const res = await fetch('https://www.mp3quran.net/api/v3/reciters?language=ar', { headers: { 'user-agent': UA } })
        if (res.ok) { rawAr = await res.json(); writeFileSync(arFile, JSON.stringify(rawAr)) }
      }
      for (const r of rawAr?.reciters || []) arNames[r.id] = r.name
    } catch (e) { orca.log(`arabic names unavailable: ${e.message}`) }
    const out = []
    for (const r of raw.reciters) {
      const styles = r.moshaf.map((m) => ({
        mid: m.id, name: m.name, server: m.server,
        riwaya: (/Rewayat\s+([\w'-]+)/i.exec(m.name) || [, 'Other'])[1].replace(/^A.?n$/i, 'Other'),
        count: m.surah_total, list: new Set(String(m.surah_list).split(',').map(Number).filter(Boolean))
      }))
      out.push({ key: `mq:${r.id}`, id: r.id, name: r.name, ar: arNames[r.id], styles })
    }
    reciters = out
    byKey.clear(); out.forEach((r) => byKey.set(r.key, r))
  }

  // local files: parse "<surah number or name> + reciter" from names
  const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, '')
  const surahIndex = surahs.map((s) => ({ n: s.n, keys: [norm(s.en).replace(/^(al|an|ash|as|ad|ar|at|az)/, ''), norm(s.en), norm(s.ar)].filter((k) => k.length > 2) }))
  const AUDIO = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.flac', '.aac', '.opus'])
  const NOISE = /^(surah|sura|surat|سورة|سوره|quran|qur'an|mp3|hq|kbps)$/i

  function parseName(file, parent) {
    const base = basename(file, extname(file))
    const tokens = base.split(/[_\-\s.()[\]]+/).filter(Boolean)
    let surah = null; let used = new Set()
    tokens.forEach((t, i) => { if (surah == null && /^\d{1,3}$/.test(t) && +t >= 1 && +t <= 114) { surah = +t; used.add(i) } })
    if (surah == null) {
      const nb = norm(base)
      let best = null
      for (const s of surahIndex) for (const k of s.keys) if (nb.includes(k) && (!best || k.length > best.len)) best = { n: s.n, len: k.length, k }
      if (best) {
        surah = best.n
        tokens.forEach((t, i) => { if (best.k.includes(norm(t)) && norm(t).length > 1) used.add(i) })
      }
    }
    if (surah == null) return null
    // Drop the surah's own name from the leftovers, however it is spelled ("Al-Baqarah", "baqara").
    const own = surahIndex[surah - 1].keys
    const ARTICLE = /^(al|an|ash|as|ad|ar|at|az|el)$/i
    tokens.forEach((t, i) => {
      const n = norm(t)
      if (n.length >= 3 && own.some((k) => k.includes(n) || n.includes(k))) { used.add(i); if (i > 0 && ARTICLE.test(tokens[i - 1])) used.add(i - 1) }
    })
    let name = tokens.filter((t, i) => !used.has(i) && !NOISE.test(t) && !/^\d+$/.test(t)).join(' ').trim()
    if (!name) name = parent
    return { surah, reciter: name || 'Local files' }
  }

  let localUnmatched = 0
  function scanLocal() {
    const folder = settings.localFolder
    localUnmatched = 0
    const groups = new Map()
    if (!folder || !existsSync(folder)) return []
    const walk = (dir, depth, parent) => {
      let ents = []
      try { ents = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of ents) {
        const p = join(dir, e.name)
        if (e.isDirectory()) { if (depth < 3) walk(p, depth + 1, e.name) }
        else if (AUDIO.has(extname(e.name).toLowerCase())) {
          const parsed = parseName(p, depth === 0 ? '' : parent)
          if (!parsed) { localUnmatched++; continue }
          if (!groups.has(parsed.reciter)) groups.set(parsed.reciter, new Map())
          groups.get(parsed.reciter).set(parsed.surah, p)
        }
      }
    }
    walk(folder, 0, '')
    return [...groups].map(([name, files]) => ({ name, files }))
  }
  let localReciters = [] // local-only profiles (no online match)
  // A local folder/file name joins the matching online reciter so there is one profile per person.
  // Style words (Murattal, Hafs...) are not part of the name.
  const STYLE = /\b(murattal|mujawwad|mojawwad|tarteel|tartil|hafs|warsh|qalon|qaloon|duri|doori|recitation|full|complete)\b|مرتل|مجود|ترتيل|حفص|ورش|قالون/gi
  function rescan() {
    for (const r of reciters) r.localFiles = null
    for (const k of [...byKey.keys()]) if (k.startsWith('local:')) byKey.delete(k)
    localReciters = []
    for (const g of scanLocal()) {
      const r = matchReciter(g.name.replace(STYLE, ' '), reciters)
      if (r) r.localFiles = new Map([...(r.localFiles || []), ...g.files])
      else { const lr = { key: `local:${g.name}`, id: g.name, name: g.name, styles: [], localFiles: g.files, localOnly: true }; localReciters.push(lr); byKey.set(lr.key, lr) }
    }
  }

  // ---------------- photos ----------------
  // Wikipedia (English, then Arabic by the reciter's Arabic name) is the source. Lookups run one at a
  // time with a gap, a 429 pauses everything, a throttled lookup is never cached as "no photo", and a
  // background crawler fills in every reciter slowly so nothing is requested in a burst.
  const photoMem = new Map(); const photoWait = []; let photoActive = 0; let blockedUntil = 0
  const acquire = () => new Promise((res) => { if (photoActive < 1) { photoActive++; res() } else photoWait.push(res) })
  const release = () => setTimeout(() => { const n = photoWait.shift(); if (n) n(); else photoActive-- }, 700)
  const wiki = async (url) => {
    const wait = blockedUntil - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    const res = await fetch(url, { headers: { 'user-agent': UA } })
    if (res.status === 429 || res.status === 503) { blockedUntil = Date.now() + (Number(res.headers.get('retry-after')) || 60) * 1000 + 2000; throw new Error('throttled') }
    if (!res.ok) throw new Error(`wikipedia ${res.status}`)
    return res
  }
  const nameKey = (n) => n.replace(/\s+/g, ' ').trim()
  const bare = (title) => title.replace(/\s*\(.*\)\s*$/, '') // "Name (reciter)" -> "Name"
  const saved = (f) => 'data:image/jpeg;base64,' + readFileSync(f + '.jpg').toString('base64')

  async function searchWiki(host, query, isMatch, isReciter) {
    const q = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: query, gsrlimit: '5', prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '360', exintro: '1', explaintext: '1', exlimit: '5', origin: '*' })
    const j = await (await wiki(`https://${host}/w/api.php?${q}`)).json()
    const pages = Object.values(j?.query?.pages || {}).sort((a, b) => a.index - b.index)
    const hit = pages.find((p) => p.thumbnail && isReciter.test(p.extract || '') && isMatch(p.title))
    if (hit) hit.__host = host
    return hit
  }

  // Returns a data URI, null (checked, no photo found) or throws 'throttled' (try again later).
  const EN_RECITER = /(reciter|qari|qāriʾ|qari')[^.]{0,120}(qur|koran)|(qur|koran)[^.]{0,80}(reciter|recitation|qari)/i
  async function photoFor(name, ar) {
    const k = nameKey(name)
    if (photoMem.has(k)) return photoMem.get(k)
    const f = join(dirs.photos, hash(k))
    if (existsSync(f + '.jpg')) { const u = saved(f); photoMem.set(k, u); return u }
    if (existsSync(f + '.none') && Date.now() - statSync(f + '.none').mtimeMs < 60 * 864e5) { photoMem.set(k, null); return null }
    await acquire()
    try {
      let hit = null
      const toks = k.split(' ')
      const variants = [...new Set([k, toks.map((w) => w.replace(/i$/i, 'y')).join(' '), `${toks[0]} ${toks[toks.length - 1]}`])]
      for (const v of variants) {
        hit = await searchWiki('en.wikipedia.org', v, (t) => samePerson(k, bare(t)), EN_RECITER)
        if (hit) break
      }
      if (!hit && ar) {
        hit = await searchWiki('ar.wikipedia.org', ar, (t) => samePerson(ar, bare(t)), /قارئ|مقرئ|قراء/)
      }
      if (!hit) { writeFileSync(f + '.none', ''); photoMem.set(k, null); return null }
      const buf = Buffer.from(await (await wiki(hit.thumbnail.source)).arrayBuffer())
      writeFileSync(f + '.jpg', buf)
      writeFileSync(f + '.src.json', JSON.stringify({ name: k, page: hit.title, host: hit.__host, image: hit.thumbnail.source }))
      orca.log(`photo ${k} -> ${hit.title}`)
      const u = saved(f); photoMem.set(k, u); return u
    } finally { release() }
  }
  const photoOf = (r) => photoFor(r.name, r.ar).catch((e) => { if (e.message !== 'throttled') orca.log(`photo ${r.name}: ${e.message}`); return undefined })

  // Slow background pass over the whole catalog, popular names first, so photos fill in on their own.
  let crawling = false
  async function crawlPhotos() {
    if (crawling) return; crawling = true
    const hot = /afasi|afasy|sudais|sudaes|husar|hussar|minshawi|basit|shuraim|ghamdi|maher|ajmi|basfar|rifai|dossary|dussary|muaiqly|shatri|qatami/i
    const order = [...reciters, ...localReciters].sort((a, b) => hot.test(b.name) - hot.test(a.name))
    let found = 0
    for (const r of order) {
      const u = await photoOf(r)
      if (u) { found++; orca.panels.post('photo.ready', { name: r.name }) }
      if (u === undefined) await new Promise((res) => setTimeout(res, 15000)) // throttled: back off, move on
    }
    orca.log(`photo crawl done: ${found}/${order.length} reciters have a photo`)
    crawling = false
  }

  // ---------------- playback ----------------
  let ps = idle() // idle | loading | playing | paused
  let queue = last?.queue || []
  let qi = last?.idx ?? -1
  let sleepAt = 0; let sleepTimer = null
  let startedByAgent = false

  const cur = () => (qi >= 0 ? queue[qi] : null)
  function snapshot() { return { ...ps, track: cur(), queue, index: qi, volume: settings.volume, sleepAt } }
  function emit() {
    orca.panels.post('player.state', snapshot())
    const t = cur()
    const name = t ? `${t.surahEn}` : 'Tilawa'
    orca.host.call('statusBar.update', {
      id: 'now', text: ps.state === 'playing' ? `${name}` : t ? `${name} (paused)` : 'Tilawa',
      icon: ps.state === 'playing' ? 'pause' : 'play', tone: ps.state === 'playing' ? 'accent' : 'neutral',
      tooltip: t ? `${t.surahEn} - ${t.reciterName}` : 'Open the Tilawa panel'
    }).catch(() => {})
  }
  const saveLast = () => store.set('last', { queue: queue.slice(0, 300), idx: qi })

  function ensureProc() {
    if (proc) return proc
    proc = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'player.ps1')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let buf = ''
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (d) => {
      buf += d; let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
        const [c, a, b] = line.split(' ')
        if (c === 'ready') send(`vol ${settings.volume}`)
        else if (c === 'started') { ps = { ...ps, state: 'playing', dur: +a || 0, pos: 0 }; emit() }
        else if (c === 'pos') { ps.pos = +a; ps.dur = +b || ps.dur; orca.panels.post('player.pos', { pos: ps.pos, dur: ps.dur }) }
        else if (c === 'ended') { next(true) }
        else if (c === 'error') { ps = idle(); emit(); orca.panels.post('toast', { text: 'Could not play this recitation. Check your connection and try again.' }) }
      }
    })
    proc.stderr.on('data', (d) => orca.log(`[player:err] ${String(d).trim().slice(0, 300)}`))
    proc.on('exit', () => { proc = null; ps = idle(); emit() })
    return proc
  }
  const send = (line) => { try { ensureProc().stdin.write(line + '\n', 'utf8') } catch {} }

  // Playback streams from the URL (a full surah can be 100 MB), unless it is already saved.
  // Only an explicit Download writes to disk.
  // The media engine fails on https:// (NullReferenceException) but plays http:// and files, so remote
  // audio goes through a loopback relay: the engine reads http://127.0.0.1, the worker fetches over
  // HTTPS. Only mp3quran hosts are relayed, only for this plugin (secret path), range requests pass
  // through so seeking works.
  async function ensureProxy() {
    if (proxy) return proxy
    const token = randomBytes(10).toString('hex')
    const server = createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1')
        if (u.pathname !== `/${token}`) return void res.writeHead(404).end()
        const target = new URL(u.searchParams.get('u') || '')
        if (target.protocol !== 'https:' || !/(^|\.)mp3quran\.net$/.test(target.hostname)) return void res.writeHead(403).end()
        const headers = { 'user-agent': UA }
        if (req.headers.range) headers.range = req.headers.range
        const up = await fetch(target, { headers })
        const out = {}
        for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const v = up.headers.get(k); if (v) out[k] = v }
        res.writeHead(up.status, out)
        if (req.method === 'HEAD' || !up.body) return void res.end()
        const reader = up.body.getReader()
        res.on('close', () => reader.cancel().catch(() => {}))
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!res.write(value)) await new Promise((r) => res.once('drain', r))
        }
        res.end()
      } catch { try { res.destroy() } catch {} }
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    proxy = { server, token, port: server.address().port }
    return proxy
  }
  const cachePath = (t) => join(dirs.audio, `${hash(t.url)}.mp3`)
  // Streams to disk (a surah can be 100 MB), and only appears under its final name when complete.
  async function download(t) {
    const res = await fetch(t.url, { headers: { 'user-agent': UA } })
    if (!res.ok) throw new Error(`server answered ${res.status}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(cachePath(t) + '.part'))
    renameSync(cachePath(t) + '.part', cachePath(t))
  }
  async function playSource(t) {
    if (t.kind === 'local') return t.path
    if (existsSync(cachePath(t))) return cachePath(t)
    const px = await ensureProxy()
    return `http://127.0.0.1:${px.port}/${px.token}?u=${encodeURIComponent(t.url)}`
  }
  let loadToken = 0
  async function playIndex(i, byAgent = false) {
    if (i < 0 || i >= queue.length) { ps = idle(); emit(); return }
    qi = i; const t = queue[i]; const token = ++loadToken
    ps = { state: 'loading', pos: 0, dur: 0 }; emit()
    try {
      const file = await playSource(t)
      if (token !== loadToken) return
      send(`load ${file}`)
      ps = { state: 'playing', pos: 0, dur: 0 }; emit() // streams start before the duration is known
      startedByAgent = byAgent
      remember(t); saveLast()
    } catch (e) {
      orca.log(`play failed: ${e.message}`)
      ps = idle(); emit()
      orca.panels.post('toast', { text: `Could not play ${t.surahEn}: ${e.message}` })
    }
  }
  function remember(t) {
    recent = [{ reciterKey: t.reciterKey, name: t.reciterName }, ...recent.filter((r) => r.reciterKey !== t.reciterKey)].slice(0, 12)
    store.set('recent', recent)
  }
  function next(auto) {
    if (qi + 1 < queue.length) return playIndex(qi + 1, startedByAgent)
    if (auto) { ps = idle(); emit() }
  }
  const pause = () => { if (ps.state === 'playing') { send('pause'); ps.state = 'paused'; emit() } }
  const resume = () => { if (ps.state === 'paused') { send('resume'); ps.state = 'playing'; emit() } else if (ps.state === 'idle' && cur()) return playIndex(qi) }
  const stop = () => { loadToken++; send('stop'); ps = idle(); emit() }
  const toggle = () => { startedByAgent = false; return ps.state === 'playing' ? pause() : resume() }

  // ---------------- track construction ----------------
  const sInfo = (n) => surahs[n - 1]
  const onlineStyle = (r, mid) => (r.styles.length ? r.styles.find((x) => x.mid === mid) || r.styles[0] : null)
  // source: 'any' prefers your own file when you have one, 'local' / 'online' force a side.
  function mkTrack(reciterKey, surah, mid, source = 'any') {
    const r = byKey.get(reciterKey); const s = sInfo(surah)
    if (!r || !s) return null
    const base = { reciterKey, reciterName: r.name, surah, surahEn: s.en.trim(), surahAr: s.ar }
    const path = r.localFiles?.get(surah); const st = onlineStyle(r, mid); const remote = st && st.list.has(surah)
    const use = source === 'local' ? (path ? 'local' : null) : source === 'online' ? (remote ? 'remote' : null) : (path ? 'local' : remote ? 'remote' : null)
    if (use === 'local') return { ...base, key: `${reciterKey}:L:${surah}`, kind: 'local', path, source: 'local', style: 'Your file' }
    if (use === 'remote') return { ...base, key: `${reciterKey}:${st.mid}:${surah}`, mid: st.mid, kind: 'remote', url: `${st.server}${pad3(surah)}.mp3`, source: 'online', style: st.name }
    return null
  }
  const resolveTrack = (t) => mkTrack(t.reciterKey, t.surah, t.mid, t.source === 'local' ? 'local' : t.source === 'online' ? 'online' : 'any') || mkTrack(t.reciterKey, t.surah, t.mid, 'any')
  function surahsOf(r, mid, source = 'any') {
    const st = onlineStyle(r, mid); const out = []
    for (let n = 1; n <= 114; n++) {
      const local = !!r.localFiles?.has(n); const remote = !!(st && st.list.has(n))
      if (source === 'local' ? local : source === 'online' ? remote : local || remote) out.push({ n, local, remote })
    }
    return out
  }

  // ---------------- following agents ----------------
  const agents = new Map()
  let startTimer = null; let lingerTimer = null
  function onAgents() {
    if (settings.mode !== 'follow') return
    const states = [...agents.values()]
    const attention = states.some((s) => s === 'blocked' || s === 'waiting')
    const working = states.some((s) => s === 'working')
    clearTimeout(startTimer); clearTimeout(lingerTimer)
    if (attention) { if (ps.state === 'playing') { pause() } return }
    if (working) {
      startTimer = setTimeout(() => {
        if (ps.state === 'paused') { startedByAgent = true; resume() }
        else if (ps.state === 'idle') { if (!cur() && last?.queue?.length) { queue = last.queue; qi = last.idx } if (cur()) playIndex(qi, true) }
      }, Math.max(0, settings.startDelay) * 1000)
    } else {
      lingerTimer = setTimeout(() => { if (ps.state === 'playing' && startedByAgent) pause() }, Math.max(0, settings.linger) * 1000) // never cut off music you started yourself
    }
  }
  orca.events.on('agent.status.changed', (p) => {
    const key = p.paneKey
    if (p.state === 'done') agents.delete(key); else agents.set(key, p.state)
    onAgents()
  })

  // ---------------- panel API ----------------
  const light = (r) => ({ key: r.key, name: r.name, fav: favReciters.includes(r.key), styles: r.styles.map((s) => ({ mid: s.mid, name: s.name, riwaya: s.riwaya, count: s.count })), localCount: r.localFiles?.size || 0, localOnly: !!r.localOnly })
  const catalogPayload = () => ({ catalog: [...reciters, ...localReciters].map(light), unmatched: localUnmatched })
  const H = (n, fn) => orca.panels.handle(n, fn)

  H('init', async () => ({
    settings, favReciters, favTracks, playlists, downloads, busy: [...downloading], recent, player: snapshot(), ...catalogPayload()
  }))
  H('reciter.surahs', async ({ key, mid, source }) => { const r = byKey.get(key); return { surahs: r ? surahsOf(r, mid, source) : [] } })
  H('photo', async ({ name }) => { const r = [...reciters, ...localReciters].find((x) => x.name === name) || { name }; const src = await photoOf(r); return { src: src ?? null, retry: src === undefined } })
  H('play', async ({ key, mid, source, surah }) => {
    const r = byKey.get(key); if (!r) return { ok: false }
    const list = surahsOf(r, mid, source); const items = list.map((x) => mkTrack(key, x.n, mid, source)).filter(Boolean)
    queue = items; await playIndex(Math.max(0, items.findIndex((t) => t.surah === surah))); return { ok: true }
  })
  H('play.queue', async ({ items, index }) => {
    queue = items.map(resolveTrack).filter(Boolean)
    await playIndex(Math.min(index || 0, queue.length - 1)); return { ok: true }
  })
  H('pause', async () => (pause(), { ok: true }))
  H('resume', async () => { startedByAgent = false; await resume(); return { ok: true } })
  H('stop', async () => (stop(), { ok: true }))
  H('next', async () => (await next(false), { ok: true }))
  H('prev', async () => { if (ps.pos > 4) send('seek 0'); else await playIndex(Math.max(0, qi - 1)); return { ok: true } })
  H('seek', async ({ to }) => { send(`seek ${to}`); ps.pos = to; return { ok: true } })
  H('skip', async ({ by }) => { const to = Math.max(0, Math.min(ps.dur - 1, ps.pos + by)); send(`seek ${to}`); ps.pos = to; return { ok: true } })
  H('volume', async ({ v }) => { settings.volume = v; send(`vol ${v}`); await store.set('settings', settings); return { ok: true } })
  H('sleep', async ({ minutes }) => {
    clearTimeout(sleepTimer); sleepAt = minutes ? Date.now() + minutes * 60000 : 0
    if (minutes) sleepTimer = setTimeout(() => { sleepAt = 0; pause() }, minutes * 60000)
    emit(); return { sleepAt }
  })
  H('settings.set', async (patch) => {
    settings = { ...settings, ...patch }; await store.set('settings', settings)
    if ('localFolder' in patch) { rescan(); orca.panels.post('catalog.changed', catalogPayload()) }
    if ('mode' in patch || 'startDelay' in patch || 'linger' in patch) onAgents()
    return { settings, unmatched: localUnmatched }
  })
  H('fav.reciter', async ({ key }) => {
    favReciters = favReciters.includes(key) ? favReciters.filter((k) => k !== key) : [...favReciters, key]
    await store.set('favReciters', favReciters); return { favReciters }
  })
  H('fav.track', async ({ track }) => {
    const t = resolveTrack(track)
    const same = (f) => f.reciterKey === t.reciterKey && f.surah === t.surah
    favTracks = favTracks.some(same) ? favTracks.filter((f) => !same(f)) : [...favTracks, t]
    await store.set('favTracks', favTracks); return { favTracks }
  })
  const downloading = new Set()
  const downloadsChanged = () => orca.panels.post('downloads.changed', { downloads, busy: [...downloading] })
  H('download', async ({ track }) => {
    const t = resolveTrack(track)
    if (t.kind === 'local' || downloading.has(t.key)) return { downloads }
    if (downloads[t.key]) { // remove: delete the file, not just the mark
      delete downloads[t.key]
      try { unlinkSync(cachePath(t)) } catch {}
      await store.set('downloads', downloads); downloadsChanged()
      return { downloads }
    }
    downloading.add(t.key)
    download(t).then(async () => {
      downloads[t.key] = true; await store.set('downloads', downloads)
      orca.panels.post('toast', { text: `Sura ${t.surahEn} saved for offline` })
    }).catch((e) => orca.panels.post('toast', { text: `Could not download Sura ${t.surahEn}: ${e.message}` }))
      .finally(() => { downloading.delete(t.key); downloadsChanged() })
    downloadsChanged()
    return { downloads }
  })
  H('playlist.create', async ({ name, items }) => {
    const p = { id: hash(name + Date.now()), name: name.trim() || 'Untitled', items: (items || []).map(resolveTrack).filter(Boolean) }
    playlists = [...playlists, p]; await store.set('playlists', playlists); return { playlists }
  })
  H('playlist.add', async ({ id, track }) => {
    const t = resolveTrack(track)
    playlists = playlists.map((p) => (p.id === id && !p.items.some((x) => x.key === t.key) ? { ...p, items: [...p.items, t] } : p))
    await store.set('playlists', playlists); return { playlists }
  })
  H('playlist.remove', async ({ id, key }) => {
    playlists = key ? playlists.map((p) => (p.id === id ? { ...p, items: p.items.filter((x) => x.key !== key) } : p)) : playlists.filter((p) => p.id !== id)
    await store.set('playlists', playlists); return { playlists }
  })

  orca.commands.register('toggle', async () => { toggle(); return ps.state })

  await loadCatalog(); rescan(); emit()
  orca.panels.post('catalog.changed', catalogPayload())
  setTimeout(() => crawlPhotos(), 8000)
  orca.log(`ready: ${reciters.length} reciters, ${localReciters.length} local`)
}

export function deactivate() {
  try { proc?.stdin.write('quit' + String.fromCharCode(10)); proc?.kill() } catch {}
  try { proxy?.server.close() } catch {}
}
