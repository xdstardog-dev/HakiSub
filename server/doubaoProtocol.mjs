import { gzipSync, gunzipSync } from 'node:zlib'

export const DOUBAO_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
export const DOUBAO_RESOURCE_ID = 'volc.seedasr.sauc.duration'

// 官方 v3 协议：长度/序号为大端；PCM 样本自身是小端，二者不要混淆。
function encodePacket(messageType, flags, serialization, payload) {
  const compressed = gzipSync(payload)
  const header = Buffer.from([0x11, (messageType << 4) | flags, (serialization << 4) | 1, 0])
  const size = Buffer.alloc(4)
  size.writeUInt32BE(compressed.length)
  return Buffer.concat([header, size, compressed])
}

export function createRecognitionRequest(sessionId) {
  return encodePacket(1, 0, 1, Buffer.from(JSON.stringify({
    user: { uid: sessionId },
    audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
    // 双向接口使用默认中英文模型（包含普通话），不发送 nostream 专用 language 字段。
    request: { model_name: 'bigmodel', show_utterances: true, result_type: 'full',
      enable_itn: true, enable_punc: true, enable_nonstream: true },
  })))
}

export function createAudioPacket(pcm, isLast = false) {
  return encodePacket(2, isLast ? 2 : 0, 0, pcm)
}

export function parseRecognitionResponse(packet) {
  if (packet.length < 8 || packet[0] >> 4 !== 1) throw Error('无效协议头')
  let offset = (packet[0] & 15) * 4
  const messageType = packet[1] >> 4, flags = packet[1] & 15
  const serialization = packet[2] >> 4, compression = packet[2] & 15
  if (offset < 4 || offset > packet.length || ![9, 15].includes(messageType) || flags > 3) throw Error('不支持的响应类型')
  const readInteger = (signed = false) => {
    if (offset + 4 > packet.length) throw Error('响应被截断')
    const value = signed ? packet.readInt32BE(offset) : packet.readUInt32BE(offset)
    offset += 4
    return value
  }
  const errorCode = messageType === 15 ? readInteger() : undefined
  const sequence = messageType === 9 && (flags & 1) ? readInteger(true) : undefined
  const size = readInteger()
  if (offset + size !== packet.length || size > 1024 * 1024) throw Error('响应长度错误')
  let payload = packet.subarray(offset)
  if (compression === 1) payload = gunzipSync(payload, { maxOutputLength: 1024 * 1024 })
  else if (compression !== 0) throw Error('不支持的压缩格式')
  // 不向浏览器转发供应商错误原文，避免其中意外包含请求凭据。
  if (errorCode !== undefined) return { errorCode }
  if (serialization !== 1) throw Error('识别结果必须为 JSON')
  return { payload: JSON.parse(payload.toString('utf8')), sequence, isLast: !!(flags & 2) }
}
