# 2026-10-29 阿里云生产维护

用户明确授权通过现有 `hakisub-server` SSH 别名维护，并允许必要重启。北京时间19:48开始检查，19:55重启恢复，随后完成真实HTTPS和Chrome验收。本次不部署新应用代码，不提交/推送GitHub。

## PHP检查

依据[PHP官方公告](https://www.php.net/archive/2026.php#2026-10-21-5)、[阿里云公告](https://help.aliyun.com/zh/functioncompute/security-notice-function-compute-php-runtime-vulnerability)及Ubuntu的[CVE-2026-109618](https://ubuntu.com/security/CVE-2026-109618)、[CVE-2026-109619](https://ubuntu.com/security/CVE-2026-109619)检查。没有取得原始通知正文或云控制台告警记录。

宿主机dpkg没有已安装PHP包，`php-crypt-gpg`的`un`为未安装；PATH无php，无PHP/FPM/Apache/Nginx服务、进程或监听。全根文件系统名称排查（排除伪文件系统及容器存储，再分别检查容器）只有编辑器语法、Pygments词法、AppArmor抽象等辅助文件。三个生产容器的/usr、/opt、/app无PHP、FPM、libphp或.php文件。生产使用Node和Caddy，因此此实例不受上述PHP漏洞影响，无需安装、升级或卸载PHP。结论不覆盖其他云产品或实例。

## 更新与重启

- Ubuntu 24.04.5 LTS原内核为6.8.0-63，且无内核更新元包。补装官方linux-virtual及七项依赖，保留旧内核。新内核virtio磁盘/网卡/PCI、ext4均内建，启动镜像和GRUB正常。
- 升级14个已有包：Docker CE/CLI/rootless extras、containerd.io、Buildx、Compose、四项GLib、snapd、tmux、两项Ubuntu Pro客户端。Docker29.9.1→29.9.2，Compose5.6.0→5.6.1，Buildx0.38.0→0.38.1，containerd.io2.4.2-2→2.4.2-3。
- 保留cloud-init原有hold：当前23.2.2-8，可用26.2-0ubuntu1~24.04.2；没有擅自解除锁定或执行autoremove。
- Docker更新期间服务自动重启，之后重启服务器一次，19:55恢复SSH。新内核6.8.0-147-generic，Docker/containerd active，三个原容器自动恢复，账号/网关healthy、Caddy正常；无failed unit，dpkg audit无异常，无剩余重启要求。
- 业务镜像仍为captions-20261029T0853Z、account-workspace-20261029T1139Z和原Caddy；四个持久卷、镜像和挂载保持。网关重启按既有规则清空房间内存Key，合法房主需重新填写。

## 清理与空间

清理阶段根分区已用8,764,624,896→6,790,819,840字节，实际释放**1,973,805,056字节（1.97GB / 1.84GiB）**。此为清理阶段净变化，内核安装另占空间。

| 对象 | 实际操作 |
| --- | --- |
| 九份旧镜像.tar传输包 | 10-15三份、10-20六份，逐份解析Docker manifest/config，与仍保留的镜像逐层、平台、启动命令核对后删除。镜像、源码包、校验清单、回滚脚本均保留；历史文档中的这些.tar路径已不存在，需要时从保留镜像重新导出。 |
| 相同临时文档/截图 | 两个account-workspace临时目录的文件与发布目录逐字节一致才删除；与上述.tar合计786,532,989字节。 |
| 构建缓存 | docker builder prune --all --force，仅构建缓存，报告959.3MB，最终0B。 |
| hello-world:latest | 无任何容器引用，按确切标签删除，约25KB。 |
| APT下载缓存 | 升级成功后apt-get clean，约209MB。 |
| 七天前归档journal | rotate后vacuum-time=7d，释放41.0MiB；不截断活动Docker日志。 |

未执行system/image/volume全局prune、down -v、数据卷删除或不加判断的临时目录递归清理。重启时系统自身还清理了/tmp，最终约64KB，/var/tmp约52KB。16个现用/历史业务及Caddy镜像保留；其中约197.8MB虽被Docker标为可回收，仍因回滚/审计用途保留。其他发布包、备份、未知用途资源保留。容器日志原有10m×3轮换保持。

最终根分区约17%已用、31GiB可用，维护前约21%已用。最终已用6,781,681,664字节，较维护前备份快照净减少约1.50GB（包括新增内核及运行变化）。Docker镜像约812.1MB、四卷约164KB；重启后空闲快照三容器CPU接近0，内存合计约206MiB，不代表负载性能。

## 备份和数据核验

服务器`/srv/projects/hakisub/maintenance/20261029/`保存脚本、清单和回执。归档AES-256-CBC/PBKDF2，目录0700、归档/口令0600；口令只在服务器secrets/maintenance-20261029-backup.key。SQLite使用在线backup API，明文仅在服务器内存传递，未下载生产数据库或凭据。

| 归档 | SHA-256 |
| --- | --- |
| before.tar.enc | ba073605ed34f0a9284e44cd2089462a73de4875d9a6c3063bcef5c53c59db27 |
| certificates-before.tar.enc | 465e5f65b3873233101c7a5c5784c1bf05f6aa28580b59da8c4339bc930768bd |
| after.tar.enc（重启前） | 62bc31bd85e3a0a7adc287814664a37301928cebceb6b2787f2560b3e74c37d4 |
| verified-final.tar.enc（验收后） | e654d99fca0f76a2d2055c6fc3eec594d9f7d31aa44703485f26cf767eeb109b |

实际解密比对通过；SQLite schema2，integrity_check=ok、foreign_key_check无异常。原5个用户全部列/UID、密保、存档、项目关联及23房元数据逐项保留。env、原secrets、Compose、代理文件、证书/ACME凭据未变，镜像及挂载未变。首次最终核验发现Caddy的caddy/last_clean.json因正常启动更新清理时间戳，定位后只允许该运行时间戳差异，其他文件逐字节一致；首次final.tar.enc保留，另名verified-final完成最终核验，不覆盖备份。这些仍是同机加密备份。

## 功能与本地验证

正式HTTPS、真实Chrome桌面1440px和移动视口480px通过：主页/账号/HakiSub和两服务健康200；环境、内部管理、服务源码404；实际两步注册、六位UID登录、刷新会话、退出；主站Cookie host-only/Secure/HttpOnly/SameSite=Lax；HakiSub跨域身份；点击建房、自动账号绑定、独立游客加入、成员同步、打字字幕跨浏览器同步；双方离房后重进无历史字幕；无页面JS错误。

新增明确标注的maintenance_probe_20261029（服务器维护自检（合成））和**730385**房，未配置Key，随机密码/答案只在测试内存。原账号和原房设置未修改，合成数据保留，最终**6账号/24房**，全部测试客户端已关闭。证据为本地ignored artifacts/maintenance-20261029/public-browser.json及账号/房间三张截图，服务器维护目录verification/有副本。真实物理手机、麦克风、付费豆包API未调用。

本地npm test、npm run build全通过。首次测试因沙箱阻止room-renaming CLI子进程失败，正常环境完整重跑通过；浏览器脚本初次缺括号，在实际执行前修正语法后正式流程通过。维护只改项目文档，没有修改生产程序。

## 待后续确认

保留cloud-init锁定。新内核报告retbleed=Vulnerable，Spectre v2为Retpolines，未发现显式关闭缓解的启动参数，实例呈现Intel Xeon Platinum/KVM。需阿里云确认宿主机微码、虚拟CPU特性和相应缓解状态；本次未修改云平台或启动缓解参数，未将PHP结论扩大为整机无漏洞结论。
