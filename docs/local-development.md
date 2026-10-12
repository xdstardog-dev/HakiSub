# 本地开发与 GitHub 同步

本地目录：`F:\hakiSub`。远端：`https://github.com/xdstardog-dev/HakiSub.git`。
`main` 跟踪 `origin/main`。保存文件只会修改本地内容；提交保存本地版本，推送才会更新 GitHub。

## 手动上传修改

在项目目录打开 PowerShell，先检查修改以及是否包含敏感信息：

```powershell
git status
git diff
git add .
git diff --cached
git commit -m "描述这次修改"
git push
```

只有确认暂存内容可以上传后才提交和推送。不要用 `git add -f` 强行添加密钥文件。

开始下一次开发前，在工作区干净时获取远端更新：

```powershell
git pull --ff-only
```

如果提示分支分叉，应先处理两边修改，不要强制推送覆盖远端。

## 本地密钥

浏览器 Web Speech API 模式无需 API 密钥。豆包模式由 Node.js 网关读取根目录 `.env` 的 `DOUBAO_API_KEY`。
`.env.local` 已建立，仅包含说明。`.env`、`.env.*`（除 `.env.example`）、
`secrets/`、`.secrets/` 和常见私钥文件已加入 `.gitignore`。
可提交的 `.env.example` 只能放变量名和空值或占位符。

忽略规则只防止普通 Git 添加操作上传这些文件，不会加密磁盘文件，也不能清除已经提交的秘密。
不要把密钥写进源码、README 或提交说明。若密钥已提交，应撤销或轮换密钥，并另行处理历史。

这是 Vite 前端项目：`VITE_*` 环境变量会暴露给浏览器，不能用于私密 API 密钥。
豆包的本地 Node.js 网关读取根目录 `.env`，通过请求头向供应商鉴权；前端不接触 Key。
`.env.local` 不用于配置这个网关。

GitHub 登录凭据交给 Git Credential Manager 管理，不要放进项目文件或远端 URL。
需要磁盘加密保护时，应另行使用 Windows 设备加密或凭据保险库。

## 代理

本仓库的本地 Git 配置使用 `http://127.0.0.1:10808`，配置只保存在本机 `.git/config`。
代理端口变化时运行：

```powershell
git config --local http.proxy http://127.0.0.1:新端口
```

不再使用代理时运行：

```powershell
git config --local --unset http.proxy
```
