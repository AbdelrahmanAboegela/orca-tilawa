// One name matcher for everything: joining local folders to online reciters, and accepting a
// Wikipedia page as a reciter's photo. Two names are the same person only when every word of the
// shorter one appears in the longer one, so a shared first name alone is never enough.

const ARABIC = /[؀-ۿ]/
const ARTICLE = /^(al|el|ash|as|an|ar|ad|at)(?=[a-z]{3})/ // glued article: alsudaes, arrifai
const GLUED = /^(abdul|abdur|abdus|abdel|abdal)(?=[a-z]{4})/ // abdulbasit -> basit (abdullah stays whole)
const SKIP = /^(al|el|ash|abu|abd|abdul|abdur|abdus|abdel|abdal|bin|ibn|ben|sheikh|shaykh|shaik|shaikh|dr)$/

function latinTokens(s) {
  return s.toLowerCase().replace(/[`'‘’]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/)
    .map((w) => w.replace(GLUED, '').replace(ARTICLE, '').replace(/y/g, 'i').replace(/ee/g, 'i').replace(/oo|ou/g, 'u').replace(/([a-z])\1+/g, '$1'))
    .filter((w) => w.length >= 3 && !SKIP.test(w))
}

function arabicTokens(s) {
  return s.replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .split(/[^ء-ي]+/)
    .map((w) => w.replace(/^عبد(?=.{3})/, '').replace(/^ال(?=.{3})/, ''))
    .filter((w) => w.length >= 3 && !['عبد', 'شيخ', 'ابو', 'بن'].includes(w))
}

export const tokens = (s) => (ARABIC.test(s) ? arabicTokens(s) : latinTokens(s))

const skeleton = (t) => t.replace(/[aeiou]/g, '')
// Transliterations disagree (Sudais / Alsudaes, Baset / Basit): same word, or same consonants (3+).
const sameToken = (a, b) => a === b || (!ARABIC.test(a) && skeleton(a).length >= 3 && skeleton(a) === skeleton(b))

function overlap(a, b) {
  const x = tokens(a), y = tokens(b)
  if (!x.length || !y.length) return null
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return { fits: short.every((t) => long.some((u) => sameToken(t, u))), equal: x.length === y.length }
}

// Merging your own folder ("Husary") into the catalog: every word of the shorter name is in the longer.
export const sameName = (a, b) => !!overlap(a, b)?.fits
// Accepting a photo: the same words on both sides, so "Ali Jaber" never gets "Abdullah Ali Jabir".
export const samePerson = (a, b) => { const o = overlap(a, b); return !!o && o.fits && o.equal }

// The one catalog entry that is `name`, or null when none or several match (never guess).
export function matchReciter(name, reciters) {
  const hits = reciters.filter((r) => sameName(name, r.name) || (r.ar && sameName(name, r.ar)))
  return hits.length === 1 ? hits[0] : null
}
