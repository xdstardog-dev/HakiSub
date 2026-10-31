import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

// 编译实际 SFC，供服务端模板断言使用；不复制子组件的渲染实现。
async function componentModuleUrl(url) {
  const { descriptor } = parse(readFileSync(url, 'utf8'))
  const result = compileScript(descriptor, { id: 'component-test', inlineTemplate: true })
  let javascript = ts.transpile(result.content, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })
    .replace(/from (['"])vue\1/g, `from ${JSON.stringify(import.meta.resolve('vue'))}`)
  for (const match of javascript.matchAll(/from (['"])([^'"]+\.vue)\1/g)) {
    javascript = javascript.replace(match[0], `from ${JSON.stringify(await componentModuleUrl(new URL(match[2], url)))}`)
  }
  return 'data:text/javascript;base64,' + Buffer.from(javascript).toString('base64')
}

export async function loadVueComponent(url) {
  return (await import(await componentModuleUrl(url))).default
}
