// 素材加载：自动发现 materials/ 目录下的所有 JSON 素材包并校验。
// 新增素材包只需在该目录放入一个 JSON 文件，无需改动任何代码。
import type { MaterialPack } from './types'
import { parseMaterialPack } from './types'

const records = import.meta.glob('../../materials/*.json', { eager: true, import: 'default' })

export type MaterialState = { packs: MaterialPack[]; errors: string[] }

function discover(): MaterialState {
  const packs: MaterialPack[] = []
  const errors: string[] = []
  for (const [path, raw] of Object.entries(records).sort(([a], [b]) => a.localeCompare(b))) {
    const fileName = path.split('/').pop() ?? path
    try {
      packs.push(parseMaterialPack(raw))
    } catch (error) {
      errors.push(`素材包 ${fileName}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { packs, errors }
}

export const materialState: MaterialState = discover()
