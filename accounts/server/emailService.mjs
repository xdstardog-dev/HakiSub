import nodemailer from 'nodemailer'
import { domainToASCII } from 'node:url'
import { problem } from './requestSecurity.mjs'

// 第一阶段支持普通 ASCII 邮箱及 IDN 域名；不折叠点号和 + 标签。
export function requireEmail(value) {
  if (typeof value !== 'string') throw problem(400, '请填写有效邮箱。')
  const parts = value.trim().split('@')
  const local = parts[0], domain = parts.length === 2 ? domainToASCII(parts[1]) : ''
  if (!local || local.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !domain.includes('.') || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) || local.length + domain.length + 1 > 254) throw problem(400, '请填写有效邮箱（暂不支持国际化本地名称）。')
  return local + '@' + domain.toLowerCase()
}

export function canonicalEmailIdentifier(value) {
  try { return requireEmail(value).toLowerCase() } catch { return value }
}

export function createEmailService(configuration, createTransport = nodemailer.createTransport) {
  const smtp = configuration.smtp
  if (!smtp) return { async sendMail() { throw Error('SMTP unavailable') } }
  if (!smtp.from || !smtp.user || !smtp.password) throw Error('SMTP 配置需要 FROM、USER 和 PASSWORD。')
  requireEmail(smtp.from)
  const transport = createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure,
    requireTLS: !smtp.secure, auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false })
  return { sendMail: message => transport.sendMail({ ...message, from: smtp.from }), close: () => transport.close() }
}
