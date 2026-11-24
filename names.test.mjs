// Run: node names.test.mjs
import assert from 'node:assert/strict'
import { sameName, samePerson, matchReciter } from './names.mjs'

const same = [
  ['Mohammed Siddiq Al-Minshawi', 'Muhammad Siddiq al-Minshawi'],
  ['Mishary Alafasi', 'Mishari bin Rashid Alafasy'],
  ['Abdulrahman Alsudaes', 'Abdur-Rahman as-Sudais'],
  ['Abdulbasit Abdulsamad', 'AbdulBaset AbdulSamad'],
  ['Mahmoud Khalil Al-Hussary', 'Mahmoud Khalil Al-Husary'],
  ['Hani Arrifai', 'Hani ar-Rifai'],
  ['Saud Al-Shuraim', "Sa'ud ash-Shuraim"],
  ['Yasser Al-Dosari', 'Yasser Ad Dussary'],
  ['Maher Al Meaqli', 'Maher al-Muaiqly'],
  ['محمد صديق المنشاوي', 'محمد صديق المنشاوي'],
  ['ماهر المعيقلي', 'الشيخ ماهر المعيقلي'],
  ['Husary', 'Mahmoud Khalil Al-Hussary'],
]
const different = [
  ['Noreen Mohammad Siddiq', 'Muhammad Siddiq Al-Minshawi'], // the reported mix-up
  ['Noreen Mohammad Siddiq', 'Mohammed Siddiq Al-Minshawi'],
  ['Ahmad Alhuthaifi', 'Ali Al-Hudhaifi'],
  ['Yasser Al-Dosari', 'Sami Al-Dosari'],
  ['Khalid Al-Shoraimy', 'Saud Al-Shuraim'],
  ['أحمد الحذيفي', 'علي الحذيفي'],
]
for (const [a, b] of same.filter(([a]) => a !== 'Husary' && a !== 'Mishary Alafasi')) assert.ok(samePerson(a, b), `same person: ${a} / ${b}`)
assert.ok(sameName('Ali Jaber', 'Abdullah Ali Jabir') && !samePerson('Ali Jaber', 'Abdullah Ali Jabir'), 'merge is loose, photos are strict')
for (const [a, b] of same) assert.ok(sameName(a, b) && sameName(b, a), `should match: ${a} / ${b}`)
for (const [a, b] of different) assert.ok(!sameName(a, b) && !sameName(b, a), `must not match: ${a} / ${b}`)

const catalog = [{ name: 'Mohammed Siddiq Al-Minshawi' }, { name: 'Noreen Mohammad Siddiq' }, { name: 'Yasser Al-Dosari' }, { name: 'Sami Al-Dosari' }]
assert.equal(matchReciter('Minshawi', catalog), catalog[0])
assert.equal(matchReciter('Noreen Siddiq', catalog), catalog[1])
assert.equal(matchReciter('Dosari', catalog), null, 'ambiguous names are left alone')
console.log(`names: ${same.length + different.length} pair checks and 3 catalog checks passed`)
