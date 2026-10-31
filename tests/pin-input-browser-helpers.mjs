import assert from 'node:assert/strict'

export async function assertPinInput(input, value = '') {
  const pin = input.locator('..')
  assert.equal(await pin.getAttribute('class'), 'pin-code-input')
  assert.deepEqual(await pin.locator('.pin-code-character').allTextContents(), Array.from({ length: 4 }, (_, index) => value[index] ?? '●'))
  assert.equal(await input.inputValue(), value)
  assert.equal(await input.getAttribute('type'), 'text')
  assert.equal(await input.getAttribute('inputmode'), 'numeric')
  assert.equal(await input.getAttribute('maxlength'), '4')
  const layout = await pin.evaluate(element => {
    const bounds = element.getBoundingClientRect(), parent = element.parentElement.getBoundingClientRect()
    const input = element.querySelector('input'), native = getComputedStyle(input)
    return { offset: bounds.x + bounds.width / 2 - parent.x - parent.width / 2,
      borders: [element, input, ...element.querySelectorAll('span')].map(node => {
        const style = getComputedStyle(node)
        return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.backgroundColor, style.boxShadow]
      }),
      outline: native.outlineStyle, fontSize: parseFloat(native.fontSize),
      characters: [...element.querySelectorAll('span')].map(node => {
        const rect = node.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }),
    }
  })
  assert.ok(Math.abs(layout.offset) < 1, '整排PIN位于内容区中央')
  for (const style of layout.borders) assert.deepEqual(style, ['0px', '0px', '0px', '0px', 'rgba(0, 0, 0, 0)', 'none'])
  assert.equal(layout.outline, 'none')
  assert.ok(layout.fontSize >= 16, '避免手机聚焦时放大输入框')
  const positions = layout.characters
  for (let index = 1; index < positions.length; index++) {
    assert.equal(positions[index].y, positions[0].y)
    assert.equal(positions[index].height, positions[0].height)
    assert.ok(Math.abs(positions[index].width - positions[0].width) < .1)
    if (index > 1) assert.ok(Math.abs(positions[index].x - positions[index - 1].x - positions[1].x + positions[0].x) < .1)
  }
  return positions
}

export async function exercisePinInput(page, input, confirm) {
  const positions = await assertPinInput(input)
  assert.equal(await confirm.isDisabled(), true)
  const bounds = await input.boundingBox()
  for (const fraction of [.1, .35, .65, .9]) {
    const position = { x: bounds.width * fraction, y: bounds.height / 2 }
    if (page.viewportSize().width < 480) await input.tap({ position })
    else await input.click({ position })
    assert.equal(await input.evaluate(node => node === document.activeElement), true)
  }
  await input.press('0'); await assertPinInput(input, '0')
  await input.press('a'); await assertPinInput(input, '0')
  await input.press('1'); await assertPinInput(input, '01')
  await input.press('2'); await input.press('3')
  assert.deepEqual(await assertPinInput(input, '0123'), positions, '输入过程中位置保持稳定')
  assert.equal(await confirm.isEnabled(), true)
  await input.press('9'); await assertPinInput(input, '0123')
  await input.press('Backspace'); await assertPinInput(input, '012')
  assert.equal(await confirm.isDisabled(), true)
  await input.press('Control+A'); await input.press('Backspace'); await assertPinInput(input)
  // 合成剪贴板事件，不读取或改写用户的系统剪贴板。
  await input.evaluate(node => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'a00 01 99')
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  await assertPinInput(input, '0001')
  await input.press('ArrowLeft'); await input.press('Backspace'); await assertPinInput(input, '001')
  await input.press('2'); await assertPinInput(input, '0021')
  await input.press('Control+A')
  await page.keyboard.insertText('0123'); await assertPinInput(input, '0123')
  assert.equal(await input.evaluate(node => node === document.activeElement), true, '输入、删除、粘贴均保留原生焦点')
  await input.fill('')
  await input.evaluate(node => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    node.value = '中'
    node.dispatchEvent(new InputEvent('input', { data: '中', isComposing: true, bubbles: true }))
    node.dispatchEvent(new CompositionEvent('compositionend', { data: '中', bubbles: true }))
  })
  await assertPinInput(input)
  await input.fill('')
}
