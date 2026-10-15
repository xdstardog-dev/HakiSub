# HakiSub 受控测试部署执行手册

状态（2026-10-16）：私有测试版已部署，容器healthy，本机SSH隧道HTTP检查通过；豆包Key为空，真实语音验收待完成。后续由Codex通过Windows原生OpenSSH直接管理，服务器文件删除、服务重启与开放端口按用户要求先确认。本文保留首次部署流程供审计，不应对已运行服务重复执行。

2026-10-16 实际执行：用户授权优先复用服务器现有阿里云加速器，失败再本地构建、SSH上传。Codex使用Windows系统OpenSSH，核对原有known_hosts与现有密钥路径，通过本机标准ssh-add窗口解锁现有私钥，未读取或输出私钥内容；启用本机Windows ssh-agent为自动启动。先执行whoami/hostname确认admin与目标主机，成功后新建用户级 `hakisub-server` 别名并验证登录，不改服务器SSH登录配置或覆盖密钥。后续镜像拉取、上传、Docker管理与日志检查均由Codex直接完成。用户另行明确批准了容器启动、服务器回环映射与本机隧道。

## 已完成的实际部署

- 服务器现有阿里云加速器对 `node:22-bookworm-slim` 的三次实际docker pull均返回not found。未改daemon、未重装Docker、未更换Node标签。
- 本机无Docker，使用已按官方checksums核验的crane 0.22.1组装Linux/amd64完整镜像。原标签解析为官方Node22.23.3，基础摘要 `node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562`；运行依赖ws8.22.0按锁文件SHA512校验。没有执行Dockerfile的npm安装阶段，也未安装本机Docker。
- 复用发布 `hakisub-20261015T160310Z`，应用、dist、Dockerfile与包文件28项与当前已测内容逐项匹配。运行镜像只添加server、dist与ws；不含真实.env、SSH密钥或音频历史。
- 归档85,066,240字节，SHA256 `b1766599a7f9d4d377845b6c3613e765605b47e212a072aff310c56b6927d38a`，经原生SCP上传到项目images目录并在服务器复核后docker load。镜像配置摘要 `sha256:836502a049818f093919d09a597827be58e0d7f1324903c7a44d74a1b80d199d`；Docker29 containerd显示的镜像manifest ID为 `sha256:f9c6bf8ca6a05e8e3f4422d69ee014c97549b55fb2df20bfed86126ba3a4f832`。原始配置摘要及全部六层均已核对，二者不能混作同一种ID。
- 无网络、无宿主端口的临时容器通过Node版本、UID1000、生产HTTP、模型/MJS/WASM类型、设置404、无令牌ASR403、非许可Origin403、房间创建/加入/字幕广播检查。没有调用真实ASR或麦克风。
- 经用户明确批准，执行 `docker compose up -d --no-build --pull never`。当前容器 `hakisub-test-hakisub-1` 为healthy，实际发布仅 `127.0.0.1:18787 -> 8787/tcp`；确认只读根目录、node用户、512MiB内存/不额外Swap、0.75CPU及64PID。首次空闲快照约24.9MiB、0.01%CPU，不代表多人负载结果。服务器发布配置已固定上述基础摘要，无服务重启。
- 本机隐藏Windows SSH进程建立 `127.0.0.1:18787 -> 服务器127.0.0.1:18787` 隧道，访问 [http://localhost:18787](http://localhost:18787) 返回200，health为configured:false。隧道PID记录在本机忽略目录 `artifacts/hakisub-server-tunnel.local`，关闭进程或本机重启后需重建；服务器容器独立常驻。没有修改安全组、防火墙、SSH登录规则或其他项目。

后续管理使用 `hakisub-server` 别名；当前代理凭据来自已存在的私钥。读取日志仅限本项目，Compose配置继续使用 `config --quiet`；禁止输出完整容器环境或带session参数的URL。真实豆包Key、账户并发额度、两位参与者真实同时讲话、噪声/串音、断网及长时间运行仍须单独验收。

设置页应在私有模式显示服务器只读配置状态，通过health刷新；不应出现“保存在这台电脑”、本机密钥操作按钮、用量轮询或要求重启npm run dev的提示。私有设置接口404为预期策略，不通过开放写接口修复前端提示。设置页修复的更新镜像须沿用已固定的Node22.23.3摘要，完成测试及临时容器验收后，按用户要求另行确认替换运行服务。

### 设置页修复已更新（2026-10-16）

当前镜像为 `hakisub-test:hakisub-20261015T172741Z`，Docker29 manifest ID为 `sha256:20c61690ace0b9fc5ea831a3097522059f21d240b4f1f988d32504ee16a9e0fc`，config摘要为 `sha256:3ac01612c299c96c0c2a9d2fab3b5fadc370be9fad91615bc34c2506799f9504`。基础镜像继续固定Node22.23.3原摘要，未升级Node。完整镜像归档SHA256 `bb48897d86439991dfadc277f2b5f05b94cf2fa4a0e129baaa61fb91d7398f52`。

`npm test`、`npm run build`、设置页模拟请求与实际Vue模板渲染、本机私有模式浏览器、服务器无网络临时容器均通过后，用户明确允许更新服务；仅修改.env的发布标识并以--no-build --pull never替换容器，保留原端口、资源和密钥配置，以及旧镜像以便回滚。更新后healthy，隧道中的实际设置页显示“尚未配置API Key”和服务器统一管理说明，点击刷新后仍正常；无真实ASR或麦克风验收。

本次按镜像部署，当前运行版本以.env发布标识、容器镜像及 `images/hakisub-20261015T172741Z/RELEASE.json` 为准；该目录保留完整发布包、镜像、摘要及构建记录。项目根目录最初解压的运行文件仍为旧快照，后续从对应新版本发布包获取构建输入。

## 现有镜像加速器与重试

用 `sudo -n docker info --format '{{json .RegistryConfig.Mirrors}}'` 检查daemon实际生效的镜像加速器。用户已提供一个阿里云加速器的输出。继续使用 `docker pull node:22-bookworm-slim`，由daemon按现有配置访问；不修改镜像标签、daemon或Docker安装。`docker manifest inspect`直接访问registry，不通过daemon镜像加速器，其直连超时不能单独证明加速器不可用。参见 [Docker官方镜像加速器说明](https://docs.docker.com/docker-hub/image-library/mirror/)。

本地最新版 `deploy/start-private-test.sh` 对此拉取最多重试3次，每次90秒、间隔5秒；成功后照旧验证并固定Node镜像摘要，三次失败则停止。旧服务器脚本不会因本机修改而更新。也可以先在已登录会话单独执行：

```bash
for attempt in 1 2 3; do
  printf '\nNode pull attempt %s/3\n' "$attempt"
  if timeout 90s sudo -n docker pull node:22-bookworm-slim; then
    sudo -n docker image inspect --format '{{json .RepoDigests}}' node:22-bookworm-slim
    break
  fi
  [ "$attempt" = 3 ] || sleep 5
done
```

失败后再采用本地Linux/amd64完整运行镜像归档，经SSH上传到本项目目录、核对SHA256、`docker load`并验证镜像身份与平台；启动时使用 `docker compose up -d --no-build --pull never`，避免导入后再次访问失败的远端仓库。构建仍使用相同Node基础镜像与锁文件，真实Key只在服务器运行时注入。普通 `docker save` / `docker load` 的归档流程见 [导出](https://docs.docker.com/reference/cli/docker/image/save/) 与 [导入](https://docs.docker.com/reference/cli/docker/image/load/)；本机当前没有Docker，离线完整镜像的实际生成和验收尚未完成，不安装或重装Docker来冒充已具备构建环境。

## 已收到的实机检查结果

用户已通过MobaXterm使用独立SSH密钥登录Ubuntu的admin账户，并核验主机指纹。用户粘贴的检查结果显示：x86_64、内存总量约1.6GiB/可用约1.1GiB、Swap2GiB未使用、磁盘剩余约33GB；Docker29.9.1、Compose v5.6.0。admin直接访问Docker socket被拒，`sudo docker ps`成功且没有运行中的容器。`/srv/projects/hakisub`不存在。没有更改Docker用户组，不因没有运行容器就推断其他项目不存在。

## 本地发布包

先 `npm test`、`npm run build`，再运行 `npm run package:private-test`。`artifacts/`生成带版本号的文件夹、tar.gz及sha256；RELEASE.json逐项记录文件的长度和哈希。包内含构建好的网页、网关源码、锁文件及Docker配置，包含当前尚未提交的新房间代码。不含真实.env、密钥、Git、Windows依赖或独立Sites项目。前端模型及WASM已包含，不在服务器执行前端构建。

本地无Docker；本次完整镜像通过上述免安装工具生成。服务器Compose解析、镜像导入、Linux运行和资源参数已实测，不以源码检查替代Docker运行；Dockerfile的远端npm安装构建路线仍未验证成功。

## 第一个远程变更确认点：创建目标目录并上传

向用户明确申请：仅创建本项目目录及上传发布包，不启动服务、不调整公网端口、不操作其他项目。确认后执行：

```bash
sudo install -d -o admin -m 0750 /srv/projects/hakisub
```

MobaXterm左侧SFTP路径切换到`/srv/projects/hakisub`，上传生成的tar.gz及对应sha256文件。只上传这两个文件，不上传本机.env或私钥。后续对照实际文件名在目标目录运行 `sha256sum -c 文件名.tar.gz.sha256`，正确后检查 `tar -tzf 文件名.tar.gz`，再解压。解压是项目写操作，须包含在当次确认范围内；首次包中不含真实.env或secrets。目标目录下已有内容与预期不符时停止，不覆盖。

## 第二个确认点：初始化配置、构建及启动

已提供 `deploy/start-private-test.sh` 自动化首次部署。无参数仅显示计划；获得用户对构建、启动及回环端口映射的确认后，在admin会话执行 `bash deploy/start-private-test.sh --apply`。脚本限制实际项目路径、拒绝配置符号链接、已有本项目容器及占用端口；不覆盖已有密钥文件；固定官方Node镜像摘要、静默校验Compose、构建启动并轮询HTTP。若已有部分配置而尚未创建容器，可以检查失败原因后重试；已有容器则停止，避免擅自覆盖运行服务。它不设置SSH隧道、不录入Key，也不修改SSH或防火墙。

旧发布包 `hakisub-20261015T160310Z` 未包含此脚本，服务器此前手动补传的版本运行到base-image失败。本次沿用其运行文件，通过完整离线镜像启动；不要在已有容器上再次执行首次部署脚本。本机最新版三次重试逻辑尚未覆盖服务器旧脚本。

明确说明：写入本项目配置、拉取Node镜像和npm依赖、构建一个Linux镜像及创建一个Compose容器/专用网络；仅映射宿主机127.0.0.1:18787到容器8787。须确认18787未占用并获得批准。无需修改安全组或防火墙，不公开80/443/8787/18787。

在项目目录内，确认`.env`与`secrets/server.env`尚不存在后，逐步执行：

```bash
umask 077
install -m 600 deploy/release.env .env
install -d -m 700 secrets
install -m 600 deploy/server.env.example secrets/server.env
sudo docker compose config --quiet
```

以上安装命令只用于首次初始化；已有配置时不要重复覆盖。初始Key留空，先验收网页和房间，不产生ASR调用费用。`sudo docker compose config`不加`--quiet`可能显示展开的Key，禁止输出到聊天。

构建前拉取并核验官方`node:22-bookworm-slim`，记录它的RepoDigest；将`.env`中的HAKISUB_NODE_IMAGE固定为该摘要后再构建，避免使用浮动基础镜像作为已验证发布记录。示例中的浮动标签仅作为首次获取入口，尚未完成镜像摘要固定或容器验证。

获准后用`sudo docker compose build`、`sudo docker compose up -d`运行。本地Node默认仍绑定127.0.0.1，只有Compose显式配置容器监听0.0.0.0；私有模式只接受明确的localhost:18787和127.0.0.1:18787 Origin，仅允许一个房间、默认最多两路ASR，禁止未绑定成员的ASR及网页设置接口。先空Key检查，再添加Key。并发上限与账户实际额度分别确认，不能仅改成8就认为上游允许8人。

## 第三个确认点：SSH隧道

MobaXterm隧道设置目标为：SSH服务器使用已核验的同一主机和admin密钥；本地监听127.0.0.1:18787，远程目标127.0.0.1:18787。隧道操作仍须用户确认。浏览器打开`http://localhost:18787`。不停止Windows本地8787服务，不以公网HTTP IP访问麦克风页面。

第二位测试者需自己的SSH授权及密钥，同样转发到该服务器；禁止复制admin私钥给其他人。手机测试不直接包含在这个SSH隧道方案中，需另外设计私有HTTPS访问。

## 安全录入豆包Key

先完成无Key的网页/房间测试，再由用户在服务器终端本地隐藏输入Key，不能发到聊天。Key写入权限0600的`secrets/server.env`（环境文件是明文，root和Docker管理员仍可读取）。读取输入可使用`read -r -s`，用shell内建printf写入，随后unset变量；实际命令在录入前另行展示和确认，不能把Key作为命令字面量留在历史中。

更新env_file后需要经用户确认重建本项目容器（`up -d --force-recreate`），单纯restart不会重新注入环境；会中断现有房间。网页设置接口已禁用，因此不能通过用户页面修改/测试Key。

## 运行保障与边界

Compose设置512MiB内存、128MiB软预留、0.75CPU、64PID、256MiB Node堆、只读根目录、非root、cap_drop及no-new-privileges。`memswap_limit`与内存上限相同，容器不额外使用Swap，宿主机Swap保留给系统；这些是初值，需观察实测后调整。运行镜像只复制网关第三方依赖ws及dist，不带Vite/ONNX推理运行环境到Node进程。

日志仅stdout/stderr，json-file每份10MB最多3份，默认关闭ASR调试。不写音频、字幕、Key或带成员令牌的URL。自动重启unless-stopped，健康检查仅本地HTTP，不调用豆包；unhealthy本身不会触发自动重启。服务升级/重启会终止识别、清空内存房间及统计。

只用本项目目录和Compose项目`hakisub-test`，不挂Docker socket或宿主机根目录，不改daemon、其他容器或另外三个项目。不做全局prune或删除目录。保留发布包、校验值、已验证基础镜像摘要及旧版本镜像；有旧版时确认后可切回旧镜像和对应配置，无数据库迁移。第一次上线前无旧版可回滚，只能停止本项目容器。

## 验收记录要求

先检查：Compose解析、镜像构建、非root/资源/日志参数、回环端口发布、健康检查、dist模型与MJS/WASM类型、两条WebSocket、无令牌ASR拒绝、设置404、SSH隧道仅授权访问。

双人真实测试需两台设备/两位参与者，分别及同时说不同短句，确认各自卡片和两端内容；测试静音停止上传/再次开口、关麦不影响另一人、离房/断网清理、原字幕时间规则。记录版本、设备、时间、资源峰值和结果，不录音或保留识别文本。未执行的项目明确标为待验收。

8人先准备假上游压测，再核对账户并发额度与费用/时长范围，逐级2→4→8人真机测试。不得将8个WebSocket、8路假ASR或一台电脑8个标签页写成8人真实讲话已通过。

修正记录（2026-10-16）：用户遇到sudo -v要求admin密码。脚本改为sudo -n docker的实际只读权限检查，后续Docker调用也使用-n；权限不足直接停止，不等待密码或修改sudoers。sudo -n true成功不代表其他命令必然免密。容器列表及端口查询失败会停止，不将查询失败当作空列表。
