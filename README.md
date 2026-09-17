# Daoist-Delivery / 外卖修仙

白天送外卖，晚上修仙。一个以“时间永远不够用”为核心压力的单机 Web RPG。

## 当前可玩内容

- 行动驱动的连续时间与昼夜阶段
- 晴 / 多云 / 雨 / 雷暴天气
- 随机配送订单、高峰收益、车辆电量
- 金钱、精力、健康、压力、信誉、房租
- 夜间修炼、灵气、悟性、炼气一至九层突破
- 60+ 数据驱动随机事件与连续剧情
- 5 名核心 NPC 与多维关系系统
- 友情、恋爱、同道、伙伴、家人式关系与疏远路线
- 第 30 天后可主动选择已解锁的多结局
- IndexedDB v2 自动存档与 v1 旧存档迁移
- 可选 AI NPC 对白 / 氛围增强，不影响核心数值与结局
- 响应式桌面 / 手机界面
- GitHub Pages 自动部署

## 本地运行

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
```

## 可选 AI 叙事增强

游戏默认完全离线可玩。若要接入 AI，在构建环境设置：

```bash
VITE_NARRATIVE_AI_ENDPOINT=https://your-relay.example.com/narrative
```

浏览器会向该 endpoint POST 当前虚构剧情的最小上下文，并期望返回：

```json
{ "text": "一小段 NPC 对白或氛围描写" }
```

不要把 OpenAI、Anthropic 或其他模型供应商的 API key 放进 `VITE_*` 环境变量、前端源码或 IndexedDB。生产环境应由服务端 relay 持有供应商密钥。

设计规则见 `AGENTS.md` 与 `docs/`。
