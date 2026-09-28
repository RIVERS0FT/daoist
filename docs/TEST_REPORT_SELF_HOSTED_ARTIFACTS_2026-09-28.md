# Self-hosted 构件存储验证（2026-09-28）

本次基于最新 main 的 1.21.0 / schema v24，保留全 self-hosted 执行与单 deploy job，不修改玩法。

## 配置范围

- PR 与部署仍在 VM-0-10-debian 执行，保留完整 Node、浏览器、地图接缝、章节与帧预算检查，以及原有报告归档。
- 构件另存于 `/home/git-runner/.local/share/daoist-actions/meviu523/daoist/`。发布包保留 1 天，PR 源码快照 3 天；保存时清理已到期且元数据有效的条目。
- 发布前从本次持久构件恢复并校验 SHA-256，只有成功后才进入 RIVERSOFT 发布及公网逐文件验收。
- Python 3.12 与 Playwright/Pillow 使用 uv 独立环境；不依赖系统 pip/ensurepip 或 sudo。

## 已定位的部署失败

此前运行 `36329418356` 的服务器报告显示，仅原城区数据库哈希断言失败：Linux checkout 为 `f846988...`，已发布 Windows 原始字节为 `804b67e...`。两者仅相差 8 个 CR 字节。本次将 `public/js/city-data.js` 按已发布字节保存，并添加 Git `-text` 属性，保留原数据与坐标，不放宽测试断言。

## 验证证据

- 最新 main 基础上 `npm run check`、完整 `npm test` **1204 / 1204**、`npm run build` 均通过；静态包检查通过，共 159 个文件。
- 新增 8 项存储边界测试，覆盖完整性校验、run/SHA/attempt 隔离、重跑、过期、路径穿越与符号链接保护、清理范围和源码排除项。
- actionlint 1.7.12 与 `git diff --check` 通过。
- Windows checkout 还会转换生成文档换行，已对六份导出文件固定 LF，导出内容与可信源码一致；未修改剧情或文档正文。
- 本次未改变 UI 行为，不重复本机浏览器套件；真实 PR 与部署仍保留完整浏览器、接缝、章节和帧预算检查。
- 本机测试日志：忽略目录 `artifacts/self-hosted-artifacts-rebased-tests.log`。

## 远端边界

SSH 只读确认 Debian 13、runner 2.337.0、服务账户 git-runner。当前系统 Python 没有 pip/ensurepip，账户不能免密 sudo，现有 Chromium 1243 的 ldd 未报告缺失依赖。真实 CI、构件落盘及部署以本次 PR / Actions 运行记录为准。

PR #52 首轮 `36393759196` 已在服务器通过全部 1204 项 Node 测试与构建，并落盘 `validation-source`（262 文件，11,517,632 字节），独立逐文件 SHA-256 检查全部匹配。浏览器依赖安装失败源于 runner 代理拒绝 PyPI；同一代理还阻止 Actions 日志上传。备份 daoist runner 的 `.env` 后，给依赖/日志域名添加 no_proxy，保留 GitHub 所需代理路由。

后续直连 PyPI 实测 Pillow 索引 12 秒只收取 527,059 / 1,865,449 字节；阿里云 PyPI 镜像完整索引 0.21 秒。仅为该 runner 配置 `UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple` 并将镜像加入 no_proxy，五个依赖解析在 476 ms 完成。服务器配置有原文件备份；密钥和完整环境配置未进入仓库。浏览器完整结果与线上验收仍以后续成功运行记录为准。

## PR 验证与单次性能例外

运行 `36395121246` 的源码、1204 项 Node 测试、构建、257 项浏览器交互、地图接缝及章节区域全部通过。帧统计自测 4 项通过；性能场景 4 / 16 通过，12 / 16 超限，桌面 panel P95 148.263 ms、region-detail P95 91.880 ms。更换完整 Chromium 的专项复测仍失败，不将其认定为偶发通过。报告已留存在 runner 的原报告目录，本次没有更改预算或为通过而修改游戏界面。

用户明确选择“本次跳过性能门槛，继续合并部署”。因此增加默认关闭的手动部署参数 `performance_report_only`，本次启用以保留真实性能数据并继续交付；PR 与日常 push 仍执行原严格门槛。此授权不代表上述性能问题已修复。
