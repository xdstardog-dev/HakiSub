export const GUEST_NAMES = [
  '高松灯', '千早爱音', '长崎素世', '椎名立希', '要乐奈', '丰川祥子', '三角初华', '喵姆',
  '若叶睦', '墨提斯', '八幡海铃', '三角初音', '初音未来', '哈基米', '曼波', '仓田真白',
  '羊宫妃那', '阿拉雷', '薇欧拉', '藤都子', '小哥', '史莱姆', 'yuno', 'ののk', '轻松明快',
  '弦卷心', '摩卡', '户山香澄', '市谷有咲', '花园多惠', '11', '志步', '天马咲希', '望月穗波',
  '小豆泽心羽', 'emu', '东云绘名', '晓山瑞希', '宵崎奏', '朝比奈真冬', '奶龙', '奶蛙', '奶龙2号', '奶龙3号',
] as const

const guestNameStorageKey = 'hakisub.guest-name.v1'
let currentGuestName: string | undefined

export function getGuestDisplayName(): string {
  if (currentGuestName) return currentGuestName
  try {
    const saved = sessionStorage.getItem(guestNameStorageKey)
    if (GUEST_NAMES.some(name => name === saved)) currentGuestName = saved!
  } catch { /* 禁用存储时，仍在本页保持名字稳定。 */ }
  currentGuestName ??= GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)]!
  // 标签页内刷新、重连与换房沿用名字，独立于账号昵称和旧房间缓存。
  try { sessionStorage.setItem(guestNameStorageKey, currentGuestName) } catch { /* 不影响入房。 */ }
  return currentGuestName
}
