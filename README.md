# AI灵签 2.0 - GPT-4智能解签 Telegram Mini App

🎋 基于原项目重构，集成GPT-4智能解签、广告变现、每日运势等商业化功能。

## ✨ 新版本功能

### 🔴 P0 优先级
- **GPT-4 AI解签** - 智能深度解读，结合用户问题个性化解答
- **广告系统** - 看广告解锁完整解签，积分兑换机制

### 🟡 P1 优先级
- **新增3种签种** - 文昌签(学业)、财神签(求财)、太岁签(化解)
- **每日运势** - 每日运势追踪，个性化建议

### 🟢 P2 优先级
- **新手引导** - 三步引导教程，新用户礼包
- **Telegram Bot命令完善** - /抽签、/运势、/观音、/关帝等完整命令

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 复制环境变量配置
cp .env.example .env
# 编辑 .env 填入你的 API Keys

# 启动服务
npm start

# 访问 http://localhost:3000
```

## ⚙️ 配置说明

编辑 `.env` 文件：

```env
# OpenAI API Key (GPT-4)
OPENAI_API_KEY=sk-your-openai-api-key

# Telegram Bot Token
TELEGRAM_BOT_TOKEN=your-bot-token

# 端口
PORT=3000
```

## 📱 Telegram Bot 命令

| 命令 | 说明 |
|------|------|
| `/start` | 开始使用 |
| `/抽签` | 随机抽取灵签 |
| `/运势` | 今日运势 |
| `/观音` | 观音灵签 |
| `/关帝` | 关帝灵签 |
| `/月老` | 月老灵签 |
| `/文昌` | 文昌签(学业) |
| `/财神` | 财神签(求财) |
| `/help` | 帮助信息 |

## 📂 项目结构

```
newAIchouqian/
├── server.js              # Express服务器 + GPT-4 API + Bot命令
├── package.json           # 依赖配置
├── .env.example           # 环境变量模板
├── public/
│   ├── index.html         # Mini App主页面
│   ├── styles.css         # 样式文件
│   ├── app.js             # 应用逻辑
│   └── manifest.json      # Mini App配置
└── data/
    └── fortunes.json      # 签诗数据库(8种签种)
```

## 🎯 签种列表

| 签种 | 数量 | 类型 |
|------|------|------|
| 观音灵签 | 100首 | 免费 |
| 关帝灵签 | 100首 | 免费 |
| 月老灵签 | 60首 | 免费 |
| 土地公灵签 | 32首 | 免费 |
| 黄大仙灵签 | 61首 | 免费 |
| 文昌签 | 32首 | PRO(首抽免费) |
| 财神签 | 28首 | PRO(首抽免费) |
| 太岁签 | 60首 | PRO(首抽免费) |

## 💰 商业模式

1. ** Freemium** - 免费用户有限次数，付费解锁完整功能
2. **广告变现** - 看广告获得抽签次数
3. **AI增值服务** - GPT-4深度解签按次收费

## 📖 API 接口

| 端点 | 说明 |
|------|------|
| `GET /` | Mini App主页 |
| `GET /api/fortune-types` | 获取所有签种 |
| `GET /api/draw/:type` | 随机抽签(带AI解读) |
| `GET /api/daily/:userId` | 每日运势 |
| `POST /api/ai-interpret` | GPT-4深度解签 |
| `GET /health` | 健康检查 |

## 📝 许可证

MIT License
