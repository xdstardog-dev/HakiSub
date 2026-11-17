function backdropDialog(event: MouseEvent) {
  const dialog = event.target
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open || dialog.getAttribute('closedby') !== 'any') return
  const { left, right, top, bottom } = dialog.getBoundingClientRect()
  // 原生对话框会把遮罩点击报告给 dialog 自身，需用边界排除窗内留白。
  if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) return dialog
}

export function installDialogBackdropFallback() {
  if ('closedBy' in HTMLDialogElement.prototype) return

  let pressedBackdrop: HTMLDialogElement | undefined
  document.addEventListener('pointerdown', event => {
    if (event.isPrimary) pressedBackdrop = event.button === 0 ? backdropDialog(event) : undefined
  }, true)
  document.addEventListener('pointercancel', event => {
    if (event.isPrimary) pressedBackdrop = undefined
  }, true)
  document.addEventListener('click', event => {
    const pressed = pressedBackdrop
    pressedBackdrop = undefined
    if (!pressed || event.detail === 0 || backdropDialog(event) !== pressed) return
    // 与 Escape 共用原有关闭流程，让 Vue 清理表单并恢复页面状态。
    if (pressed.dispatchEvent(new Event('cancel', { cancelable: true }))) pressed.close()
  }, true)
}
