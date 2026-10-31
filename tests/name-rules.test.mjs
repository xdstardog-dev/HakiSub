import assert from 'node:assert/strict'
import { countNameUnits, isValidAccountName, isValidDisplayName, truncateNameToUnits, defaultNickname, NICKNAME_MAXIMUM_UNITS, ROOM_NAME_MAXIMUM_UNITS } from '../accounts/shared/nameRules.mjs'
import { defaultAccountRoomName } from '../server/roomNames.mjs'

assert.equal(countNameUnits('你好abc123!'), 11)
assert.equal(countNameUnits('中文，。'), 8)
assert.equal(countNameUnits('ＡＢ'), 4)
assert.equal(countNameUnits('😀'), 2)
for (const [limit, chinese, english] of [[NICKNAME_MAXIMUM_UNITS, 8, 16], [ROOM_NAME_MAXIMUM_UNITS, 12, 24]]) {
  assert.equal(isValidDisplayName('中'.repeat(chinese), limit), true)
  assert.equal(isValidDisplayName('中'.repeat(chinese + 1), limit), false)
  assert.equal(isValidDisplayName('a'.repeat(english), limit), true)
  assert.equal(isValidDisplayName('a'.repeat(english + 1), limit), false)
  assert.equal(isValidDisplayName('中'.repeat(chinese - 1) + 'a1', limit), true)
  assert.equal(isValidDisplayName('中'.repeat(chinese - 1) + 'a12', limit), false)
  assert.equal(isValidDisplayName('😀'.repeat(chinese), limit), true)
  for (const invalid of ['', ' ', ' name', 'name ', '换\n行', '\u0000', '\u0085', '\u2029', null, 1]) assert.equal(isValidDisplayName(invalid, limit), false)
}
assert.equal(isValidAccountName('12345678901234567890'), true)
for (const invalid of ['ab', 'a'.repeat(21), '含中文的账号', 'abc def', 'abc!']) assert.equal(isValidAccountName(invalid), false)
assert.equal(defaultNickname('  ABCDEFGHIJKLMNOPQRST  '), 'abcdefgh')
assert.equal(defaultNickname('12345678901234567890'), '12345678')
assert.equal(truncateNameToUnits('abc😀中x', 6), 'abc😀')
assert.equal(defaultAccountRoomName('abcdefghijklmnop'), 'abcdefghijklmnop的房间')
assert.equal(defaultAccountRoomName('一二三四五六七八'), '一二三四五六七八的房间')
assert.equal(defaultAccountRoomName('一二三四五六七八九十'), '一二三四五六七八九的房间', '旧长昵称也为后缀预留空间')
console.log('通过：账号20位、昵称8汉字/16半角、房名12汉字/24半角、中英混合/标点/Unicode边界与默认昵称和房名。')
