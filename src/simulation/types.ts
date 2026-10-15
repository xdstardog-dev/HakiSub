// 素材包的类型与校验。校验在本模块集中处理，普通人在 JSON 里写错字段时，
// 会得到带路径的中文错误提示，而不是让网页崩溃。

export type MaterialCharacter = { id: string; name: string; color?: string }

// at / duration 是可选的发言时间信息（毫秒）：在「素材对话（时间轴）」场景里，
// 不填时按语速与句间停顿自动生成，填写时精确指定（允许重叠）。
export type MaterialLine = { character: string; text: string; at?: number; duration?: number }

// 自动时间轴参数（可省略，默认语速 30ms/字、句间停顿 500ms）。
export type MaterialTiming = { speechRateMs?: number; gapMs?: number }

export type MaterialPack = {
  name: string
  timing?: MaterialTiming
  characters: MaterialCharacter[]
  lines: MaterialLine[]
  scenarios: {
    rapid: string[]
    eight: { followUp: string }
    long: string
    fade: string[]
    overflow: string
    interim: string[]
    stress: string[][]
  }
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function checkStringArray(value: unknown, path: string, problems: string[]): void {
  if (!Array.isArray(value)) {
    problems.push(`${path} 必须是数组（由多条台词组成）`)
    return
  }
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) problems.push(`${path}[${index}] 必须是非空字符串`)
  })
}

// 解析并校验一个素材包。校验失败时抛出带全部问题的中文错误信息。
export function parseMaterialPack(raw: unknown): MaterialPack {
  const problems: string[] = []
  if (!isObject(raw)) throw new Error('素材包必须是 JSON 对象（以 { 开头、以 } 结尾）')

  if (!isNonEmptyString(raw.name)) problems.push('name 必须是非空字符串（素材包名称）')

  if (raw.timing !== undefined) {
    if (!isObject(raw.timing)) {
      problems.push('timing 必须是对象（自动时间轴参数，可省略）')
    } else {
      const timing = raw.timing as JsonObject
      if (timing.speechRateMs !== undefined && (typeof timing.speechRateMs !== 'number' || !Number.isFinite(timing.speechRateMs) || timing.speechRateMs < 0)) problems.push('timing.speechRateMs 必须是非负数字（可省略）')
      if (timing.gapMs !== undefined && (typeof timing.gapMs !== 'number' || !Number.isFinite(timing.gapMs) || timing.gapMs < 0)) problems.push('timing.gapMs 必须是非负数字（可省略）')
    }
  }

  const characterIds = new Set<string>()
  if (!Array.isArray(raw.characters)) {
    problems.push('characters 必须是数组（角色列表）')
  } else {
    raw.characters.forEach((character, index) => {
      const path = `characters[${index}]`
      if (!isObject(character)) { problems.push(`${path} 必须是对象（例如 { "id": "a", "name": "小明" }）`); return }
      if (!isNonEmptyString(character.id)) problems.push(`${path}.id 必须是非空字符串（角色唯一编号）`)
      else if (characterIds.has(character.id)) problems.push(`${path}.id 与前面的角色重复，请改成不同编号`)
      else characterIds.add(character.id)
      if (!isNonEmptyString(character.name)) problems.push(`${path}.name 必须是非空字符串（角色名称）`)
      if (character.color !== undefined && typeof character.color !== 'string') problems.push(`${path}.color 必须是字符串（可省略）`)
    })
  }

  if (!Array.isArray(raw.lines)) {
    problems.push('lines 必须是数组（台词列表）')
  } else {
    raw.lines.forEach((line, index) => {
      const path = `lines[${index}]`
      if (!isObject(line)) { problems.push(`${path} 必须是对象（例如 { "character": "a", "text": "你好" }）`); return }
      if (!isNonEmptyString(line.character) || !characterIds.has(line.character)) {
        problems.push(`${path}.character 必须指向 characters 中已存在的角色 id`)
      }
      if (!isNonEmptyString(line.text)) problems.push(`${path}.text 必须是非空字符串（这句台词的内容）`)
      if (line.at !== undefined && (typeof line.at !== 'number' || !Number.isFinite(line.at) || line.at < 0)) problems.push(`${path}.at 必须是非负数字（可省略）`)
      if (line.duration !== undefined && (typeof line.duration !== 'number' || !Number.isFinite(line.duration) || line.duration < 0)) problems.push(`${path}.duration 必须是非负数字（可省略）`)
    })
  }

  if (!isObject(raw.scenarios)) {
    problems.push('scenarios 必须是对象（七种测试场景各自使用的台词）')
  } else {
    const scenarios = raw.scenarios as JsonObject
    checkStringArray(scenarios.rapid, 'scenarios.rapid', problems)
    if (!isObject(scenarios.eight) || !isNonEmptyString((scenarios.eight as JsonObject).followUp)) {
      problems.push('scenarios.eight 必须是对象，且其中的 followUp 是非空字符串（每人追加的那句话）')
    }
    if (!isNonEmptyString(scenarios.long)) problems.push('scenarios.long 必须是非空字符串（长句测试台词）')
    checkStringArray(scenarios.fade, 'scenarios.fade', problems)
    if (!isNonEmptyString(scenarios.overflow)) problems.push('scenarios.overflow 必须是非空字符串（溢出测试的重复台词）')
    checkStringArray(scenarios.interim, 'scenarios.interim', problems)
    if (!Array.isArray(scenarios.stress)) {
      problems.push('scenarios.stress 必须是数组（压力测试按段存放的台词）')
    } else {
      scenarios.stress.forEach((phase, index) => {
        if (!Array.isArray(phase)) { problems.push(`scenarios.stress[${index}] 必须是数组`); return }
        phase.forEach((text, j) => {
          if (!isNonEmptyString(text)) problems.push(`scenarios.stress[${index}][${j}] 必须是非空字符串`)
        })
      })
    }
  }

  if (problems.length) throw new Error(`素材包校验失败：${problems.join('；')}`)
  return raw as unknown as MaterialPack
}
