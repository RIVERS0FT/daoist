# Self-hosted 工作流迁移验证（2026-09-27）

## 范围

- 两个 GitHub Actions 工作流、三个 job 全部从 `ubuntu-latest` 改为 `[self-hosted, Linux, X64]`。
- 保留原有触发器、测试、构建、超时、产物传递、production 密钥与公网内容校验。
- 不修改游戏源码、应用版本或存档格式。

## 迁移依据

- PR #49 已按用户要求跳过 CI 检查 squash 合并，提交 `0be55f2dfcff39dc6b43d7fd329171e30be418a5`。
- 原 PR 验证运行 `36327232972` 与合并后的部署运行 `36327845257` 均因 GitHub 账号付款/额度限制未启动验证步骤，后者 publish 被跳过。
- GitHub runner API 确认仓库有在线且空闲的 `VM-0-10-debian`，标签为 `self-hosted`、`Linux`、`X64`。

## 验证边界

- 工作流静态检查通过：遍历全部 YAML，确认三个 job 均使用目标标签；逐字比较确认除 runner 选择外，工作流其余内容未变。
- `node --test tests/docs-structure.test.mjs`：4 / 4 通过。
- `git diff --check`：通过。

本次仅改变工作流执行环境，游戏全量本机验证沿用 [1.21.0 发布报告](TEST_REPORT_RELEASE_1.21.0.md)，不重复运行浏览器全量套件。迁移的远程运行与线上发布状态以对应 Actions 运行结果为准；runner 在线不等于测试或部署成功。

## 自托管运行中的后续发现

- PR #50 已合并为 `51dede0ab0f4082d4aca048d6e441554e1fc1747`。部署运行 `36328440289` 已在 `VM-0-10-debian` 实际执行，Checkout、Node 安装、源码检查通过；Node 测试退出码 1，发布未执行。
- GitHub 单 job 日志返回 404，整次运行日志 ZIP 为空；当时无法据此确认具体失败断言，不将其标记为已通过。
- 已取消的重复 PR 运行 `36328414517` 的注释明确报告 artifact 存储额度耗尽。迁移 runner 并未解除 artifact 限额。
- 因此发布改为同一个 self-hosted job 内先验证再直接发布 dist；保留失败阻断与 production 密钥作用域，移除 artifact 中转。Node 测试落盘并输出失败注释；源码、测试报告与构建清单保留在 runner 独立目录。
- 后续用户明确要求“暂时先提交推送合并，跳过检查”。本轮新增脚本的本地检查已中止，不宣称通过；直接交付当前配置，远程失败断言仍待后续排查。
