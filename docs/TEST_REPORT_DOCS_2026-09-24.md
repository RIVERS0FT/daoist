# 文档结构整理验证报告 · 2026-09-24

本次修改不形成新的游戏应用版本。应用仍为 **1.18.0**，存档 schema 仍为 **v21**。

Pull Request：#44  
首轮验证：Validate pull request #95（run `35942514152`）

## 目标

- 清理 README，只保留项目入口、运行、文档导航、验证和发布摘要。
- 将历史版本内容集中到 `docs/VERSIONS.md`。
- 将当前有效玩法集中到 `docs/GAME_DESIGN.md`。
- 将 `docs/ARCHITECTURE.md` 改为当前技术架构，不继续按版本堆叠实现历史。
- 将 `PROJECT_MEMORY.md` 改为当前项目状态和长期约束。
- 从下一个新应用版本开始，版本说明固定按“新增 / 修复 / 优化”三段记录。

## 自动化验证

首轮 PR CI 完整通过：

- `npm run check`：通过。
- `node --test tests/*.test.mjs`：**1074 / 1074 通过，0 失败**。
- `npm run build`：通过。
- Chromium 全量交互回归：通过。

新增 `tests/docs-structure.test.mjs` 四项检查均通过：

1. README 不再承载版本历史或完整玩法章节。
2. 版本历史集中在 `VERSIONS.md`，并存在未来版本“新增 / 修复 / 优化”模板。
3. `GAME_DESIGN.md` 的当前应用版本、schema、NPC、章节、药材、丹方和药鼎规模与可信源码配置一致。
4. `AGENTS.md` 明确文档职责，并强制下一版本三段式记录顺序。

## 文档迁移结果

### README

从长期版本/玩法混合手册缩减为简短项目入口。README 只保留：

- 如何运行。
- 文档入口。
- 开发验证。
- RIVERSOFT 发布摘要。
- 项目边界。

### VERSIONS

现有历史版本从旧 README / 架构记录迁移到 `docs/VERSIONS.md`。历史条目保持原有语义，不强制追溯改成新格式。

从**下一个新版本**起必须固定使用：

```markdown
### 新增
### 修复
### 优化
```

三个部分都必须存在；无内容时写“无”。

### GAME_DESIGN

`docs/GAME_DESIGN.md` 成为当前玩法设计入口，集中描述配送、时间、房租、系统解锁、修仙、炼药、拍卖、宗门、NPC、十二章主线、结局、AI、存档与 UI 边界。

历史版本说明与当前玩法冲突时，不再从旧 README 判断当前规则。

### ARCHITECTURE / PROJECT_MEMORY

两者删除重复版本块：

- ARCHITECTURE 只描述当前技术实现、状态推进、存档、AI、测试与部署。
- PROJECT_MEMORY 只保存当前版本状态、用户确认方向和长期约束。

## 兼容与发布边界

本次不修改 `public/` 游戏运行时代码，不改变：

- 应用版本 1.18.0。
- 存档 v21。
- 地图、经济、人物、剧情、玩法解锁。
- RIVERSOFT 发布逻辑。

GitHub Pages 继续保持已移除状态。合并到 `main` 后只验证 RIVERSOFT verify / publish 与公网 SHA-256。
