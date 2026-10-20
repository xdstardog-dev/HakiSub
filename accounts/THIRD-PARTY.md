# 开源组件与选择记录

核查日期：2026-10-21。准确版本与传递依赖以 `package-lock.json` 为准；运行镜像复制完整生产 node_modules，保留依赖自带的许可证文件。

| 实际采用 | 许可证 | 复用范围 |
| --- | --- | --- |
| Fastify 5.12.7 | MIT | HTTP 路由、JSON Schema 请求校验、大小/超时控制 |
| @fastify/cookie 11.1.3 | MIT | Cookie 编解码与签名 |
| @fastify/cors 11.3.1 | MIT | 凭据 CORS 与预检响应 |
| @fastify/csrf-protection 7.1.0 | MIT | CSRF token 生成/验证，绑定会话和项目作用域 |
| @fastify/static 10.1.6 | MIT | 只公开账号构建目录，使用安全审计指出的修复版本 |
| argon2 0.45.1 | MIT（底层实现另有随包声明） | Argon2id、随机盐、PHC 字符串与验证；不自行实现密码算法 |
| better-sqlite3 13.0.3 | MIT（SQLite 随包声明） | SQLite、事务、参数绑定、一致性在线备份 |
| 原有 Vue/Vite | 沿用根锁文件及许可证 | 模板转义、响应式表单、独立账号页面构建 |

这些是成熟基础组件，并不意味着本服务已经使用了完整第三方账号框架。项目自行实现的部分包括：用户名/昵称业务规则、仅保存摘要的随机会话生命周期、UID 数据授权、三问挑战与撤销、精确滚动限额及成功注册事务、房间存档白名单、管理员定向解限。已为这些边界增加实际数据库/哈希/HTTP 模拟测试，仍需生产前复核。

评估后暂不引入：

- [Better Auth](https://better-auth.com/docs/plugins/username)：官方 username 插件现成注册示例仍要求 email；本期明确无邮箱，三问恢复也需额外扩展。为了接入而伪造邮箱或绕过其恢复生命周期会增加隐含耦合。将来邮箱上线或认证形式增加时可重新评估，不必改 UID 与存档外键。
- [Passport.js](https://www.passportjs.org/concepts/authentication/)：是请求认证中间件，仍需要应用编写账号存储、恢复、会话持久化和业务授权；本期没有 OAuth 策略需求，引入不能替代大部分必要逻辑。
- [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible)：有 SQLite 支持，并非不兼容 SQLite；其基础算法为 Flexible Fixed Window。本需求的滚动 24 小时成功数需要和账号插入同一 SQLite 事务，仍需业务配额代码。本期用同库短事务实现精确滚动事件窗口，避免两套额度状态与驱动；后续多实例/分布式防护时可引入。
- [LiveKit](https://docs.livekit.io/frontends/build/authentication/)：只参考身份与房间授权分离、服务端签发受限权限的思路；不安装、不改 WebSocket/ASR、不引入其媒体服务器或付费服务。房主暂停、销毁、配额与熔断留待后续。

Fastify 的 schema 和 CSRF 插件使用方式分别依据 [验证文档](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) 与 [插件文档](https://github.com/fastify/csrf-protection)；密码参数依据 [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。

已执行官方 npm registry 运行依赖审计：最初静态插件8.x被报告路径处理漏洞，升级10.1.6后审计为0项。国内镜像未实现审计端点，改为单次指定官方registry查询，没有修改全局registry。审计没有发现已知漏洞不等于完成安全审计；应用本身另拒绝编码、重复斜线和点路径，避免权限范围分类与路由解析不一致。
