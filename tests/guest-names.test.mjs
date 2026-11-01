import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { isValidDisplayName, NICKNAME_MAXIMUM_UNITS } from '../accounts/shared/nameRules.mjs'

const source = readFileSync(new URL('../src/guestNames.ts', import.meta.url), 'utf8').replace(/^export /gm, '')
const code = ts.transpile(source + '\nglobalThis.model = { GUEST_NAMES, getGuestDisplayName }', { target: ts.ScriptTarget.ES2022 })
function load(storage = new Map(), random = 0) {
  const context = vm.createContext({ Math: { random: () => random, floor: Math.floor }, sessionStorage: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
  } })
  vm.runInContext(code, context)
  return context.model
}
const expected = '高松灯，千早爱音，长崎素世，椎名立希，要乐奈，丰川祥子，三角初华，喵姆，若叶睦，墨提斯，八幡海铃，三角初音，初音未来，哈基米，曼波，仓田真白，羊宫妃那，阿拉雷，薇欧拉，藤都子，小哥，史莱姆，yuno，ののk，轻松明快，弦卷心，摩卡，户山香澄，市谷有咲，花园多惠，11，志步，天马咲希，望月穗波，小豆泽心羽，emu，东云绘名，晓山瑞希，宵崎奏，朝比奈真冬，奶龙，奶蛙，奶龙2号，奶龙3号'.split('，')
assert.deepEqual([...load().GUEST_NAMES], expected)
for (const [index, name] of expected.entries()) {
  assert.ok(isValidDisplayName(name, NICKNAME_MAXIMUM_UNITS))
  assert.equal(load(new Map(), (index + 0.5) / expected.length).getGuestDisplayName(), name)
}
const storage = new Map(), first = load(storage)
assert.equal(first.getGuestDisplayName(), expected[0])
assert.equal(load(storage, 0.999999).getGuestDisplayName(), expected[0], '刷新沿用标签页名字')
assert.equal(load(new Map(), 0.999999).getGuestDisplayName(), expected.at(-1), '独立标签页可抽到不同名字')
for (const invalid of ['游客', '原账号昵称', '<script>', '']) {
  assert.equal(load(new Map([['hakisub.guest-name.v1', invalid]]), 0).getGuestDisplayName(), expected[0])
}
const unavailable = vm.createContext({})
vm.runInContext(code, unavailable)
const fallback = unavailable.model.getGuestDisplayName()
assert.ok(expected.includes(fallback))
assert.equal(unavailable.model.getGuestDisplayName(), fallback, '存储不可用仍在内存沿用名字')
console.log('通过：44个游客名完整匹配、随机区间、名称校验、刷新保留、独立存储、旧名字迁移和存储禁用。')
