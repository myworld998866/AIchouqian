const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-5a01f0b335954cc650109a7b59d3144fa5a5465c4bbbb74090182f0e38ef09b2';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo';

// ========================================
// 中间件
// ========================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========================================
// 签种数据缓存（避免重复加载文件）
// ========================================
let fortunesCache = null;
function getFortunes() {
    if (!fortunesCache) {
        fortunesCache = require('./data/fortunes.json');
    }
    return fortunesCache;
}

// ========================================
// 签种配置
// ========================================
const fortuneTypes = [
    { id: 'guanyin', name: '观音灵签', description: '祈求观世音菩萨指点迷津', icon: '🙏', totalCount: 100, isPremium: false },
    { id: 'guandi', name: '关帝灵签', description: '关圣帝君灵签，百求百应', icon: '⚔️', totalCount: 100, isPremium: false },
    { id: 'yuelao', name: '月老灵签', description: '求姻缘红线，觅得良缘', icon: '💕', totalCount: 60, isPremium: false },
    { id: 'tumigong', name: '土地公灵签', description: '祈求五谷丰登，平安吉祥', icon: '🏠', totalCount: 32, isPremium: false },
    { id: 'huangdaxian', name: '黄大仙灵签', description: '趋吉避凶，指点迷津', icon: '✨', totalCount: 61, isPremium: false },
    { id: 'wenchang', name: '文昌签', description: '学业进步，金榜题名', icon: '📚', totalCount: 32, isPremium: true, price: 'free' },
    { id: 'caishen', name: '财神签', description: '招财进宝，财运亨通', icon: '💰', totalCount: 28, isPremium: true, price: 'free' },
    { id: 'taishui', name: '太岁签', description: '化解流年冲煞，趋吉避凶', icon: '🐰', totalCount: 60, isPremium: true, price: 'free' }
];

// 签种名称映射（中文命令 -> 英文ID）
const fortuneTypeMap = {
    'guanyin': { id: 'guanyin', name: '观音灵签' },
    '关帝': { id: 'guandi', name: '关帝灵签' },
    'yuelao': { id: 'yuelao', name: '月老灵签' },
    'tumigong': { id: 'tumigong', name: '土地公灵签' },
    'huangdaxian': { id: 'huangdaxian', name: '黄大仙灵签' },
    'wenchang': { id: 'wenchang', name: '文昌签' },
    'caishen': { id: 'caishen', name: '财神签' },
    'taishui': { id: 'taishui', name: '太岁签' },
    '文昌': { id: 'wenchang', name: '文昌签' },
    '财神': { id: 'caishen', name: '财神签' },
    '太岁': { id: 'taishui', name: '太岁签' }
};

// ========================================
// GPT-4 AI 解签服务
// ========================================
const GPT_TIMEOUT = 15000; // 15秒超时

async function getAIInterpretation(fortune, userQuestion = '') {
    if (!OPENAI_BASE_URL) {
        return null;
    }

    const prompt = `你是一位精通东方玄学的AI解签大师。用户抽到了以下签诗：

签文：${fortune.title}
签级：${fortune.level}
签诗：${fortune.poem}
${fortune.shiYue ? `诗曰：${fortune.shiYue}` : ''}
${fortune.xianJi ? `仙机：${fortune.xianJi}` : ''}
${fortune.dianGu ? `典故：${fortune.dianGu}` : ''}

${userQuestion ? `用户求问：${userQuestion}` : '（用户未指定求问事项，请给出通用解读）'}

请作为一位慈悲智慧的解签大师，给出：
1. 签诗的白话文解读（适合现代年轻人理解）
2. 对用户问题的针对性建议
3. 3个具体的行动指引（今日/本周/本月）
4. 一句鼓励或警示的话

用温柔、鼓励的语气，控制在200字以内。`;

    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: '你是一位慈悲、智慧且幽默的东方玄学解签大师，说话温柔有智慧。' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.8
        });

        // 解析自定义API URL
        const urlMatch = OPENAI_BASE_URL.match(/^(?:https?:\/\/)?([^:/]+)(?::(\d+))?/);
        const hostname = urlMatch ? urlMatch[1] : '69.5.20.196';
        const port = urlMatch && urlMatch[2] ? parseInt(urlMatch[2]) : (OPENAI_BASE_URL.startsWith('https') ? 443 : 80);
        const isHttps = OPENAI_BASE_URL.startsWith('https');
        
        const options = {
            hostname: hostname,
            port: port,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            timeout: GPT_TIMEOUT
        };

        const reqModule = isHttps ? https : http;
        const req = reqModule.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (json.choices && json.choices[0]) {
                        resolve(json.choices[0].message.content);
                    } else if (json.error) {
                        // 记录详细错误以便调试
                        console.error('AI服务错误:', json.error.code, json.error.message);
                        resolve(null); // 返回null让前端显示默认解签
                    } else {
                        console.error('AI响应格式异常:', body.substring(0, 200));
                        resolve(null);
                    }
                } catch (e) {
                    console.error('GPT解析失败:', e.message, 'body:', body.substring(0, 200));
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('GPT请求失败:', e.message);
            resolve(null);
        });

        req.on('timeout', () => {
            req.destroy();
            console.error('GPT请求超时');
            resolve(null);
        });

        req.write(data);
        req.end();
    });
}

// ========================================
// API 路由
// ========================================

// 获取所有签种
app.get('/api/fortune-types', (req, res) => {
    res.json(fortuneTypes);
});

// 抽签API
app.get('/api/draw/:type', async (req, res) => {
    const fortuneType = req.params.type;
    const fortunes = getFortunes();
    
    if (!fortunes[fortuneType]) {
        return res.status(404).json({ error: '签种不存在', code: 'INVALID_TYPE' });
    }
    
    const typeFortunes = fortunes[fortuneType];
    const randomIndex = Math.floor(Math.random() * typeFortunes.length);
    const fortune = typeFortunes[randomIndex];
    
    // 获取AI解签（如果有API Key）
    let aiInterpretation = null;
    if (OPENAI_API_KEY) {
        try {
            aiInterpretation = await getAIInterpretation(fortune);
        } catch (e) {
            console.error('AI解签失败:', e);
        }
    }
    
    res.json({
        success: true,
        fortune: {
            ...fortune,
            type: fortuneType
        },
        aiInterpretation: aiInterpretation,
        hasGPT: !!OPENAI_API_KEY
    });
});

// 每日运势
app.get('/api/daily/:userId', (req, res) => {
    const userId = req.params.userId || 'anonymous';
    const fortunes = getFortunes();
    
    if (!userId || userId === 'anonymous') {
        return res.status(400).json({ error: '需要用户ID', code: 'INVALID_USER' });
    }
    
    const today = new Date();
    // 基于日期和用户ID生成固定但随机的每日签
    const seed = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + 
                 today.getDate() + today.getMonth() * 31;
    
    const luckyTypes = ['guanyin', 'guandi', 'yuelao'];
    const luckyType = luckyTypes[today.getDay() % luckyTypes.length];
    const typeFortunes = fortunes[luckyType] || fortunes['guanyin'];
    
    if (!typeFortunes || typeFortunes.length === 0) {
        return res.status(500).json({ error: '签种数据为空', code: 'EMPTY_DATA' });
    }
    
    const fortune = typeFortunes[seed % typeFortunes.length];
    const ratings = ['大吉', '吉', '中吉', '小吉', '平'];
    const rating = ratings[seed % 5];
    
    res.json({
        success: true,
        userId: userId,
        date: today.toISOString().split('T')[0],
        luckyType: luckyType,
        fortune: {
            ...fortune,
            type: luckyType
        },
        rating: rating,
        tips: getDailyTips(today.getDay())
    });
});

// 获取指定签
app.get('/api/fortune/:type/:index', (req, res) => {
    const fortuneType = req.params.type;
    const index = parseInt(req.params.index);
    const fortunes = getFortunes();
    
    if (!fortunes[fortuneType]) {
        return res.status(404).json({ error: '签种不存在', code: 'INVALID_TYPE' });
    }
    
    const typeFortunes = fortunes[fortuneType];
    if (index < 1 || index > typeFortunes.length) {
        return res.status(404).json({ error: '签号不存在', code: 'INVALID_INDEX' });
    }
    
    res.json({
        success: true,
        fortune: {
            ...typeFortunes[index - 1],
            type: fortuneType
        }
    });
});

// AI深度解签
app.post('/api/ai-interpret', async (req, res) => {
    const { fortune, userQuestion } = req.body;
    
    if (!fortune) {
        return res.status(400).json({ error: '缺少签诗信息', code: 'MISSING_FORTUNE' });
    }
    
    if (!OPENAI_API_KEY) {
        return res.status(503).json({ error: 'AI解签服务暂不可用', code: 'NO_API_KEY' });
    }
    
    try {
        const interpretation = await getAIInterpretation(fortune, userQuestion);
        if (interpretation) {
            res.json({
                success: true,
                interpretation: interpretation
            });
        } else {
            res.status(500).json({ error: 'AI解签失败', code: 'INTERPRET_FAILED' });
        }
    } catch (e) {
        console.error('AI解签异常:', e);
        res.status(500).json({ error: '服务异常', code: 'SERVER_ERROR' });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hasGPT: !!OPENAI_API_KEY,
        uptime: process.uptime()
    });
});

// Mini App 入口
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================
// Telegram Bot 命令处理
// ========================================
let bot = null;
try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
        const TelegramBot = require('node-telegram-bot-api');
        bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
        
        // /start 命令
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `
🔮 *欢迎使用AI好签 2.0*

✨ 功能：
• /抽签 - 随机抽取灵签
• /运势 - 今日运势
• /观音 - 观音灵签
• /关帝 - 关帝灵签  
• /月老 - 月老灵签
• /文昌 - 文昌签（学业）
• /财神 - 财神签（求财）
• /太岁 - 太岁签（化解）

🎁 新用户首抽免费！
            `, { parse_mode: 'Markdown' });
        });

        // /help 命令
        bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, `
📖 *AI好签使用指南*

🎯 *基础命令：*
/start - 开始使用
/抽签 - 随机灵签
/运势 - 今日运势

📿 *签种命令：*
/观音 - 观音灵签
/关帝 - 关帝灵签
/月老 - 月老灵签
/文昌 - 文昌签
/财神 - 财神签
/太岁 - 太岁签

💡 *进阶功能：*
在 Mini App 中可使用：
• AI智能解签（GPT-4）
• 广告免费解签
• 每日运势追踪
• 签文收藏分享
            `, { parse_mode: 'Markdown' });
        });

        // /抽签 命令
        bot.onText(/\/抽签/, (msg) => {
            const chatId = msg.chat.id;
            const fortunes = getFortunes();
            const types = ['guanyin', 'guandi', 'yuelao', 'tumigong', 'huangdaxian'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            const typeFortunes = fortunes[randomType];
            const fortune = typeFortunes[Math.floor(Math.random() * typeFortunes.length)];
            
            const typeNames = {
                guanyin: '观音灵签',
                guandi: '关帝灵签',
                yuelao: '月老灵签',
                tumigong: '土地公灵签',
                huangdaxian: '黄大仙灵签'
            };
            
            bot.sendMessage(chatId, `🎋 *${fortune.title}*\n\n${fortune.level}\n\n📜 *签诗：*\n${fortune.poem}\n\n🔮 *解签：*\n${fortune.interpretation}\n\n💡 点击 Mini App 获取完整解签服务！`, { parse_mode: 'Markdown' });
        });

        // /运势 命令
        bot.onText(/\/运势/, (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id.toString();
            const today = new Date();
            const fortunes = getFortunes();
            const luckyTypes = ['guanyin', 'guandi', 'yuelao'];
            const luckyType = luckyTypes[today.getDay() % luckyTypes.length];
            const fortune = fortunes[luckyType][(today.getDate() + userId.charCodeAt(0)) % 60];
            
            const ratings = ['大吉 ✨', '吉 🎯', '中吉 🌟', '小吉 ⚡', '平 📊'];
            const rating = ratings[userId.charCodeAt(0) % 5];
            
            const tips = {
                0: '💤 注意休息，不宜冒险',
                1: '🌅 早起有利，工作顺利',
                2: '💰 财运上升，贵人运佳',
                3: '📋 稳扎稳打，注意小人',
                4: '🚀 大胆行动，有惊喜',
                5: '📝 总结计划，注意财务',
                6: '🏠 放松心情，家庭和睦'
            };
            
            bot.sendMessage(chatId, `📅 *${today.getMonth() + 1}月${today.getDate()}日运势*\n\n🎯 今日运势：${rating}\n\n🎋 今日幸运签：${fortune.title}\n\n${fortune.level} - ${fortune.interpretation.substring(0, 50)}...\n\n💡 今日提示：${tips[today.getDay()]}`, { parse_mode: 'Markdown' });
        });

        // 特定签种命令 - 修复逻辑，使用正确的映射
        const botCommands = [
            { pattern: /\/guanyin/, typeId: 'guanyin', typeName: '观音灵签' },
            { pattern: /\/关帝/, typeId: 'guandi', typeName: '关帝灵签' },
            { pattern: /\/yuelao/, typeId: 'yuelao', typeName: '月老灵签' },
            { pattern: /\/tumigong/, typeId: 'tumigong', typeName: '土地公灵签' },
            { pattern: /\/huangdaxian/, typeId: 'huangdaxian', typeName: '黄大仙灵签' },
            { pattern: /\/wenchang/, typeId: 'wenchang', typeName: '文昌签' },
            { pattern: /\/caishen/, typeId: 'caishen', typeName: '财神签' },
            { pattern: /\/taishui/, typeId: 'taishui', typeName: '太岁签' },
            { pattern: /\/文昌/, typeId: 'wenchang', typeName: '文昌签' },
            { pattern: /\/财神/, typeId: 'caishen', typeName: '财神签' },
            { pattern: /\/太岁/, typeId: 'taishui', typeName: '太岁签' }
        ];

        botCommands.forEach(cmd => {
            bot.onText(cmd.pattern, (msg) => {
                const chatId = msg.chat.id;
                const fortunes = getFortunes();
                const typeFortunes = fortunes[cmd.typeId];
                
                if (typeFortunes && typeFortunes.length > 0) {
                    const fortune = typeFortunes[Math.floor(Math.random() * typeFortunes.length)];
                    bot.sendMessage(chatId, `🎋 *${cmd.typeName}*\n\n${fortune.title}\n${fortune.level}\n\n📜 ${fortune.poem}\n\n🔮 ${fortune.interpretation}`, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(chatId, '❌ 签种数据暂不可用，请稍后重试。');
                }
            });
        });

        console.log('🤖 Telegram Bot 已启动');
    }
} catch (e) {
    console.log('⚠️ Telegram Bot 初始化失败:', e.message);
}

// ========================================
// 启动服务
// ========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('🔮 AI好签 2.0 Mini App 运行中');
    console.log(`🚀 端口: http://localhost:${PORT}`);
    console.log(`🤖 AI模型: ${OPENAI_MODEL}`);
    console.log(`🔗 API端点: ${OPENAI_BASE_URL}`);
});