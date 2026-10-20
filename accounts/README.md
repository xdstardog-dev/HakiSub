# XDstar 统一账号服务

独立于实时语音网关的 Fastify + SQLite 服务，页面使用现有 Vue/Vite 工具链。只在本地完成实现，未部署生产。设计与风险见 [审查方案](../docs/ACCOUNT-SYSTEM-PLAN.md)，执行与验收见 [账号部署手册](../docs/ACCOUNT-DEPLOYMENT.md)。

**Windows 本地 PowerShell，项目根 `F:\hakiSub`：**

```powershell
npm ci
npm ci --prefix accounts
npm run test:accounts
npm run build:accounts
npm run preview:accounts
```

预览地址为 `http://127.0.0.1:8790/account/` 和 `http://127.0.0.1:5179/`。预览使用 `artifacts/account-preview/accounts.sqlite` 的专用测试库和无 Key 的独立内存房间网关；不访问生产或本机 8787，不包含真实语音能力。Ctrl+C 停止。不要填真实密码、密保或 Key。预览每次生成新的随机签名密钥，因此重启后需要刷新 CSRF Cookie，预览限流索引不作为生产重启验收依据；自动测试使用固定的合成密钥验证持久性。

普通本地开发可先构建页面，再运行 `npm --prefix accounts run dev`；默认账号库为根 `secrets/accounts.sqlite`。要让开发重启后的 CSRF 与限流索引稳定，在根 `.env` 或服务端环境配置随机 `XDSTAR_ACCOUNT_SECRET`，不要用 `VITE_*`。真实密码无需发给开发者。

后端可直接传 `createAccountServer(configuration, { now })` 做时间边界和真实 SQLite/Argon2id 的隔离测试。UID 只来自服务端会话；身份接口不返回登录账号，存档不接受 Key、ownerToken 或成员凭据。恢复方式是传统三问，无法消除熟人猜中答案和自定义问题枚举风险。

账号服务无需也不持有豆包凭据。现有 HakiSub 语音授权、房主和匿名凭据属于独立边界。
