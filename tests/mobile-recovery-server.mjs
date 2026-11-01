import { createAsrGateway } from '../server/asrGateway.mjs'
import { createStaticWebsite } from '../server/staticWebsite.mjs'
import { fileURLToPath } from 'node:url'
import { hashRoomPassword } from '../server/roomPassword.mjs'
const port = Number(process.argv[2] ?? 5177)
const gateway = createAsrGateway({ allowedOrigins: [`http://127.0.0.1:${port}`], roomStore: { list: () => [{ code: '123456', name: '游客刷新验收', ownerHash: '0'.repeat(64), passwordHash: hashRoomPassword('0042'), accessVersion: 'fixture-v1' }], save: async () => {} }, serveWebsite: createStaticWebsite(fileURLToPath(new URL('../dist/', import.meta.url))), connectUpstream() { throw Error('禁止真实ASR') } })
const connections = new Set()
gateway.server.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)) })
process.stdin.on('data', data => { if (data.toString().trim() === 'drop') for (const socket of connections) socket.destroy() })
gateway.server.listen(port, '127.0.0.1', () => console.log(`isolated browser fixture http://127.0.0.1:${port}; stdin: drop`))
