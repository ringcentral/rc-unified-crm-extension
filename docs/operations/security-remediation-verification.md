---
type: test-plan
title: Server Security Remediation Compatibility Verification
description: Automated coverage and staging checks for the server security remediation.
owner: NEEDS_OWNER
status: proposed
tags: [security, regression, verification]
---

# Server 安全修复兼容性验证

## 范围与通过标准

本清单覆盖本轮 Server 修复已识别的兼容性风险。自动化验证代码行为；手测验证实际发布包、网络、凭据、浏览器和第三方服务的组合。所有已识别风险都有验证路径，不代表覆盖所有输入、所有插件实现或未来依赖版本。

在预发布环境使用专用测试账号、CRM 记录和插件。先记录部署源码 SHA、Core 包来源、Node/npm 版本和实际安装依赖。仅看到包版本号不能证明部署包含本轮修复；通过 registry 安装时，还要确认内部镜像已同步所需版本。

每项记录 `PASS / FAIL / BLOCKED / N/A`、环境、部署 SHA、操作、预期与实际结果及脱敏证据。未执行项保持待验证，不能视为通过。N/A 必须注明该环境不使用此功能。存在 FAIL 或必测项 BLOCKED 时，不据此清单宣告可发布。

## 自动化验证映射

以下是测试位置，不是某一次执行的结果；执行结果以对应提交的测试日志为准。

| 已识别风险 | 自动化验证路径（仓库相对路径） | 仍需手测 |
| --- | --- | --- |
| 插件 HTTP、私有 IP、混合 DNS、重绑定、危险重定向 | `packages/core/test/lib/pluginHttp.test.ts` | A：部署环境 DNS、TLS、出站连接 |
| 301/302/303 改为 GET；307/308 保留 POST 正文；跳至另一域名时认证头剥离；全局 Axios/代理配置干扰 | 同上，使用真实 Axios 和 Nock；私有 DNS 拒绝另有本机 socket 验证 | A：实际代理、证书、插件重定向 |
| 注册、许可证、已有安装快照、版本更新、注册源变化 | `packages/core/test/handlers/plugin.test.ts`、`packages/core/test/routes/pluginRoutes.test.ts` | B：真实控制台和已安装测试账号 |
| 同步/异步 call、SMS、fax，令牌轮换及失败状态 | `packages/core/test/handlers/log.test.ts`、`tests/pluginRoutes.int.test.ts` | C：实际 CRM、插件、回调和凭据 |
| MinIO 显式配置、延迟初始化、存储失败返回、签名参数 | `packages/core/test/lib/s3ErrorLogConfig.test.ts`、`packages/core/test/lib/s3ErrorLogReport.test.ts`、`packages/core/test/routes/jsonResponseSecurity.test.ts` | D：真实 PUT、IAM、浏览器 CORS |
| 依赖兼容、SQLite/Sequelize UUID、Google multipart、Express 行为 | `tests/dependencySecurity.unit.test.ts` | E：使用中的真实 CRM/Google 流程 |
| Google Drive 输入校验与失败状态 | `tests/googleDrivePlugin.unit.test.ts` | E：实际录音文件上传（如使用） |
| 日期格式和偏移量、JSON MIME/正文与 debug 响应 | `packages/core/test/appointmentDateTimeContract.test.ts`、`packages/core/test/routes/jsonResponseSecurity.test.ts` | E：日期显示、现有客户端消费 |
| Google Sheets picker 的脚本嵌入与参数编码 | `tests/googleSheetsRoutes.int.test.ts` | E：真实 OAuth 与文件选择器 |
| 加密请求 ID 与 widget 产物一致性 | `packages/core/test/lib/debugTracer.test.ts`、`packages/core/test/mcp/uiBridgeEntropy.test.ts`、`tests/compiledWidgetAsset.unit.test.ts` | E：自定义日志解析器；widget 实际加载 |
| KaTeX 经两个 Markdown 渲染入口的依赖边界 | `packages/core/mcp/ui/test/dependencySecurity.test.cjs` | E：实际 widget 渲染 |
| 安装失败中止构建；模板生成、锁文件策略 | `tests/serverlessInstallFailure.unit.test.ts`、`tests/cliTemplateSecurity.unit.test.ts` | F：内部 registry、实际发布/构建产物 |
| Markdown / pymdown 升级 | `python -m mkdocs build --strict` | F：生成页面视觉检查 |

这些测试依照 `AGENTS.md` mock 外部服务，不会用生产凭据创建真实 CRM 记录，也不能代替供应商集成测试。

## A. 部署网络与插件服务器

1. 在运行 **Core 的同一容器/主机和网络**检查插件目录地址，以及 manifest 中 `endpointUrl`、`userRegisterEndpointUrl`、`licenseStatusUrl`、`tokenSyncUrl` 的所有已配置主机。四个字段即使暂时不用，也不能遗留非法地址。
2. 可用下面的命令查看一个主机的所有 DNS 结果。把 `plugins.example.com` 换成实际主机；逐一检查 IPv4 和 IPv6 是否均为公网地址。浏览器或个人电脑上的解析结果不能代替 Core 环境。

   ```powershell
   node -e "require('node:dns').lookup('plugins.example.com',{all:true},(e,a)=>{if(e){console.error(e.code);process.exitCode=1}else console.log(a)})"
   ```

3. 执行 B、C 的真实操作。预期 Core 能直接建立 HTTPS 连接，插件收到请求，证书正常校验。仅 DNS 正确或 `curl` 成功还不能判定通过。
4. 如果环境依赖 `HTTPS_PROXY`、全局自定义 Agent、mTLS 或只支持 HTTP/2，标为待验证的部署依赖。当前插件 transport 强制直连 HTTP/1 并使用自己的 HTTPS Agent，不继承这些定制。测试发现必须依赖它们时，记录 BLOCKED，交由部署/安全负责人决定兼容方案；不要关闭证书校验来通过测试。
5. 仅对专用测试插件，把一个已配置服务 URL 改成 HTTP 或 localhost，重新尝试安装/调用。预期拒绝、目标服务未收到请求。恢复公网 HTTPS 配置后重试成功。无需手工重复测试中所有 IP 编码变体。

如果真实插件使用重定向，还需在 C 中确认业务请求最终成功。301/302/303 会把 POST 改成 GET 并去掉正文；307/308 保留正文。同源认证头保留，跨域跳转可能按原有 Axios/follow-redirects 规则剥离认证头，不能依赖跨域跳转继续携带令牌。

## B. 安装、许可证与旧快照

1. 按 [插件入门](../developers/plugins/getting-started.md)在预发布 Developer Console 创建或选用专用测试插件，配置实际公网 HTTPS 服务。可以使用带有效证书的公网 HTTPS 隧道访问本机插件。
2. 用测试管理员账号连接 CRM，在扩展的 **Admin → Plugins** 安装。预期注册成功，插件能识别正确的测试账号；插件日志确认注册调用，但不要打印收到的 token。
3. 对使用许可证的插件，分别让测试服务返回有效和无效的许可证状态，重新检查插件状态/提示。检查响应中的 `licenseStatus` 和 UI，不能只看 HTTP 200。模板默认只有有效许可证示例；无效状态需要测试插件实现或供应商提供测试账号。
4. 保留一个已安装账号，发布 **不同 version** 的测试 manifest，把执行端点改到另一条可识别的公网 HTTPS 测试路径。依照 [版本更新规则](../developers/plugins/manifest.md#publishing-a-new-version)等待缓存过期后触发调用，确认到达新路径、JWT 与用户配置仍有效。相同 version 的配置变化不应被当作更新。
5. 在专用测试副本上改变注册 URL 的 scheme、host 或 port。预期旧快照不自动迁移到另一注册源；恢复配置或卸载重装后验证。不要对真实客户安装执行此项。

同时覆盖环境实际使用的公开/私有目录可见性；“私有插件目录”不意味着允许插件服务使用私有 IP。验证完卸载临时测试插件。

## C. 插件业务、失败与令牌轮换

按实际使用的插件模式填写下表。不支持某活动类型时记录 N/A，不能用 call 成功代替 SMS/fax 成功。

| 操作 | 预期和检查位置 |
| --- | --- |
| 同步插件：分别创建 call、SMS、fax 测试日志 | 插件执行、预期转换体现在 CRM 对应记录；每个操作只产生预期的一条记录 |
| 异步插件：分别创建支持类型的日志 | CRM 先成功保存；插件收到任务和回调信息；回调后 CRM 被正确更新，无额外重复记录 |
| 令牌轮换 | 使用测试插件提供的过期/轮换机制，先触发刷新，再连续执行两次活动；确认后续调用使用新 token，未出现持续 401。供应商未提供机制时此项保持待验证，自动化只证明协议处理 |
| 同步插件失败 | 在专用测试插件返回一次 500 或使用被策略拒绝的端点；预期该次日志流程返回失败，恢复配置后重新操作成功 |
| 异步插件失败 | 在专用测试插件拒绝 dispatch，预期失败可在任务/服务日志中观察到；已经成功写入 CRM 的记录保留。恢复后新任务成功；不要预设系统会自动重试旧任务 |

通过插件接收日志、Core 日志/任务状态和 CRM 结果交叉确认完成状态；仅看到异步请求 accepted 或初次 CRM 写入成功不算回调链通过。对失败测试记录实际错误和请求 ID，避免把已有问题误记为本次回归。

## D. 错误报告：必须完成真实上传

1. 按 [部署环境变量](../developers/deploy.md#environment-variables)配置预发布存储。云环境检查 bucket、region、IAM；本地模式显式设置 `ERROR_REPORT_S3_LOCAL=true`，并向 MinIO 和 Core 提供相同的 `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`。改环境变量后重启测试实例。
2. 在本机进程环境中设置 `TEST_CORE_URL` 为该测试 Core 的 API 基址（不带末尾 `/`），`TEST_CRM_JWT` 为专用测试账号的有效 CRM 会话 JWT。不要把 token 写进命令历史或提交文件。执行：

   ```powershell
   $headers = @{ Authorization = "Bearer $env:TEST_CRM_JWT" }
   $upload = Invoke-RestMethod -Method Get -Uri "$env:TEST_CORE_URL/debug/report/url" -Headers $headers
   if (-not $upload.presignedUrl) { throw 'No upload URL returned' }
   $put = Invoke-WebRequest -Method Put -Uri $upload.presignedUrl -ContentType 'application/json' -Body '{"verification":"security-compat"}'
   $put.StatusCode
   ```

3. 预期获取 URL 为 200，PUT 为 2xx；在测试 bucket 确认内容存在。签名 URL 有效期较短，及时上传。获取 URL 为 200 不能证明凭据、IAM 或浏览器上传可用。命令不要输出签名 URL。
4. 再从实际客户端的报告功能上传一次，确认浏览器没有 CORS 错误。MinIO 的签名 URL 主机必须对客户端可达；服务端能访问容器内的 localhost 不代表浏览器也能访问。
5. 在**独立测试实例**移除存储配置并重启。预期服务仍能启动、`/isAlive` 可用；带有效会话请求 `/debug/report/url` 返回通用 503，既不挂起也不把内部凭据返回客户端。恢复配置重启后，重复上传应成功。

## E. 使用中的客户端与连接器

- Google Sheets：用测试 Google 账号完成 OAuth，打开文件选择器，选表并保存，刷新后仍能正常读取。包含空格、`&` 或非 ASCII 字符的文件名可用于兼容性检查；不要用真实用户数据做注入实验。
- Google Drive 录音：如果启用，使用已有可工作的业务入口上传一份测试录音，确认正确文件和 CRM 关联。输入验证的单测不证明现有业务入口本身没有其他问题；若失败，保留脱敏证据，并与上一部署比较后归因。
- 日期与 JSON：从现有客户端创建、修改带时区的测试预约，刷新后核对时间；打开一次 debug 流程确认客户端能处理 JSON 包装及错误状态。
- Widget：刷新实际 MCP 会话/页面，确认加载本轮构建产物，文字、数学公式和工具交互正常。自动测试已验证两处编译 widget 与源码产物一致；浏览器缓存和部署路径仍需检查。
- 自定义日志解析器：如果依赖 request ID 格式，触发一次 debug 请求，确认能按完整 ID 关联请求。随机后缀已变为 32 位十六进制；没有自定义解析器可记 N/A。

## F. 发布边界与文档

- 在实际支持的运行环境做一次全新安装和构建；至少在 Node 20 基线上验证一次。根仓库使用 `npm.cmd install` 生成本地锁；独立 UI 继续使用其已提交的锁和 `npm.cmd ci`。不要把根 `npm ci` 没有锁导致的失败当成产品回归。
- 使用内部 registry 安装生成的 connector/plugin 项目，运行其构建和 health check。单测中的本地包或 mock 不能证明镜像已发布所需 Core 版本。构建安装失败应中止；不要为验证执行生产部署脚本。
- 对准备发布的实际 Core npm 包/部署产物，确认包含新的网络 helper 及其依赖和编译 widget。保留源码 SHA、实际依赖图、Node/npm 版本、registry 身份和产物校验和，避免只扫描旧锁文件。
- 在隔离 Python 环境安装 `requirements.txt` 后运行 `python -m mkdocs build --strict`。打开生成的插件入门、API 参考和一个含代码块/提示框的页面，确认内容与排版。此步骤只构建，不执行 `gh-deploy`。

## Verification 与发布前人工检查点

自动化入口：

```powershell
npm.cmd test --workspace=@app-connect/core -- test/lib/pluginHttp.test.ts --runInBand
npm.cmd run typecheck
npm.cmd run typecheck:core
npm.cmd run typecheck:contracts
npm.cmd run lint:openapi
npm.cmd test
npm.cmd run test-coverage
npm.cmd run test:e2e
```

独立 UI 在 `packages/core/mcp/ui/` 执行 `npm.cmd ci`、`npm.cmd test`、`npx.cmd tsc --noEmit`、`npm.cmd run build`；它的测试不包含在根工作区总数中。文档构建使用上面的 Python 命令。

人工检查点：部署负责人确认 A/F 的运行时与镜像，插件/业务负责人确认 B/C/E 的实际使用组合，存储负责人确认 D 的权限与上传结果。负责人身份尚待指定（NEEDS_OWNER）；本清单尚未表示任何人工验收已经通过。

建议证据表：

| 项目 / 插件 / 活动类型 | 环境与部署 SHA | PASS / FAIL / BLOCKED / N/A | 请求 ID 与脱敏证据 | N/A 原因或失败跟进 |
| --- | --- | --- | --- | --- |
| A–F 各适用场景 | 待填写 | 待验证 | 待填写 | 待填写 |
