// 固定底栏使用聚焦前布局高度；只有字幕区使用键盘后的可见高度。
export function installRoomViewport() {
  const root = document.documentElement, viewport = window.visualViewport
  let stableHeight = window.innerHeight, editing = false, keyboardWasOpen = false
  const update = () => {
    const height = viewport?.height ?? window.innerHeight
    const top = viewport?.offsetTop ?? 0
    const keyboard = (editing || keyboardWasOpen) && stableHeight - height > 120 && (viewport?.scale ?? 1) === 1
    keyboardWasOpen = keyboard
    if (!editing && !keyboard) stableHeight = window.innerHeight
    root.style.setProperty('--room-screen-height', (keyboard ? stableHeight : window.innerHeight) + 'px')
    root.style.setProperty('--room-keyboard-inset', (keyboard ? Math.max(0, stableHeight - height - top) : 0) + 'px')
    root.classList.toggle('room-keyboard-open', keyboard)
  }
  const focus = () => {
    editing = document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT'
    update()
  }
  document.addEventListener('focusin', focus); document.addEventListener('focusout', focus)
  window.addEventListener('resize', update); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update)
  update()
  return () => {
    document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus)
    window.removeEventListener('resize', update); viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update)
    root.style.removeProperty('--room-screen-height'); root.style.removeProperty('--room-keyboard-inset'); root.classList.remove('room-keyboard-open')
  }
}
