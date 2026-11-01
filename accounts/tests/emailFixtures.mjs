import { createAccountServer } from '../server/accountServer.mjs'
export async function createMailTestServer(configuration, options = {}) {
  const messages = []
  const server = await createAccountServer(configuration, { ...options, mailer: { async sendMail(message) { messages.push(message) } } })
  return Object.assign(server, { messages })
}
export function mailToken(server, purpose, email) {
  const message = server.messages.findLast(message => (!email || message.to.toLowerCase() === email.toLowerCase()) && message.text.includes('#' + purpose + '='))
  return message?.text.match(new RegExp('#' + purpose + '=([A-Za-z0-9_-]{43})'))[1]
}
// 房间回归测试使用真实注册/验证/登录接口，仅邮件传输由内存收件箱替代。
export async function registerMailFixture(server, send, body) {
  const { questions, ...registration } = body
  registration.email = body.username.toLowerCase() + '@example.test'
  const result = await send('/api/account/register', registration)
  if (result.status !== 200) return result
  await server.flushMail()
  const token = mailToken(server, 'register', registration.email)
  const confirmation = await send('/api/account/email/confirm', { purpose: 'register', token })
  if (confirmation.status !== 200) return confirmation
  const login = await send('/api/account/login', { username: registration.username, password: registration.password })
  return { ...login, status: login.status === 200 ? 201 : login.status }
}
