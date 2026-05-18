const express = require('express');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

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
// GPT-4 AI 解签服务
// ========================================
async function getAIInterpretation(fortune, userQuestion = '') {
    if (!OPENAI_API_KEY) {
        return null; // 没有API Key时返回null，使用默认解签
    }

    const prompt = `你是一位精通东方玄学的AI解签大师。用户抽到了以下签诗：

签名：${fortune.title}
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
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: '你是一位慈悲、智慧且幽默的东方玄学解签大师，说话温柔有智慧。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 500,
            temperature: 0.8
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (json.choices && json.choices[0]) {
                        resolve(json.choices[0].message.content);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    console.error('GPT解析失败:', e.message);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('GPT请求失败:', e.message);
            resolve(null);
        });

        req.write(data);
        req.end();
    });
}

// ========================================
// API 路由
// ========================================

// 签种列表（原有5种 + 新增3种）
const fortuneTypes = [
    {
        id: 'guanyin',
        name: '观音灵签',
        description: '祈求观世音菩萨指点迷津',
        icon: '🙏',
        totalCount: 100,
        isPremium: false
    },
    {
        id: 'guandi',
        name: '关帝灵签',
        description: '关圣帝君灵签，百求百应',
        icon: '⚔️',
        totalCount: 100,
        isPremium: false
    },
    {
        id: 'yuelao',
        name: '月老灵签',
        description: '求姻缘红线，觅得良缘',
        icon: '💕',
        totalCount: 60,
        isPremium: false
    },
    {
        id: 'tumigong',
        name: '土地公灵签',
        description: '祈求五谷丰登，平安吉祥',
        icon: '🏠',
        totalCount: 32,
        isPremium: false
    },
    {
        id: 'huangdaxian',
        name: '黄大仙灵签',
        description: '趋吉避凶，指点迷津',
        icon: '✨',
        totalCount: 61,
        isPremium: false
    },
    // 🟡 P1: 新增3种签种
    {
        id: 'wenchang',
        name: '文昌签',
        description: '学业进步，金榜题名',
        icon: '📚',
        totalCount: 32,
        isPremium: true, // 付费签种
        price: 'free' // 首抽免费
    },
    {
        id: 'caishen',
        name: '财神签',
        description: '招财进宝，财运亨通',
        icon: '💰',
        totalCount: 28,
        isPremium: true,
        price: 'free'
    },
    {
        id: 'taishui',
        name: '太岁签',
        description: '化解流年冲煞，趋吉避凶',
        icon: '🐰',
        totalCount: 60,
        isPremium: true,
        price: 'free'
    }
];

app.get('/api/fortune-types', (req, res) => {
    res.json(fortuneTypes);
});

// 抽签API
app.get('/api/draw/:type', async (req, res) => {
    const fortuneType = req.params.type;
    const fortunes = require('./data/fortunes.json');
    
    if (!fortunes[fortuneType]) {
        return res.status(404).json({ error: '签种不存在' });
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

// 🟡 P1: 每日运势
app.get('/api/daily/:userId', (req, res) => {
    const userId = req.params.userId;
    const fortunes = require('./data/fortunes.json');
    
    // 基于日期和用户ID生成固定但随机的每日签
    const today = new Date();
    const seed = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + 
                 today.getDate() + today.getMonth() * 31;
    
    // 选择签种（使用当日幸运签种）
    const luckyTypes = ['guanyin', 'guandi', 'yuelao'];
    const luckyType = luckyTypes[today.getDay() % luckyTypes.length];
    const typeFortunes = fortunes[luckyType] || fortunes['guanyin'];
    
    const fortune = typeFortunes[seed % typeFortunes.length];
    
    // 生成运势指数（基于seed）
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

function getDailyTips(dayOfWeek) {
    const tips = {
        0: ['注意休息', '不宜冒险', '适合学习'], // 周日
        1: ['早起有利', '工作顺利', '注意沟通'], // 周一
        2: ['财运上升', '贵人运佳', '桃花运来'], // 周二
        3: ['稳扎稳打', '防小人', '健康注意'], // 周三
        4: ['大胆行动', '有惊喜', '桃花旺'], // 周四
        5: ['总结计划', '注意财务', '人缘佳'], // 周五
        6: ['放松心情', '家庭和睦', '明日有运']  // 周六
    };
    return tips[dayOfWeek] || tips[0];
}

// 获取指定签
app.get('/api/fortune/:type/:index', (req, res) => {
    const fortuneType = req.params.type;
    const index = parseInt(req.params.index);
    const fortunes = require('./data/fortunes.json');
    
    if (!fortunes[fortuneType]) {
        return res.status(404).json({ error: '签种不存在' });
    }
    
    const typeFortunes = fortunes[fortuneType];
    if (index < 1 || index > typeFortunes.length) {
        return res.status(404).json({ error: '签号不存在' });
    }
    
    res.json({
        success: true,
        fortune: {
            ...typeFortunes[index - 1],
            type: fortuneType
        }
    });
});

// 🟡 P1: AI深度解签（需要用户问题）
app.post('/api/ai-interpret', async (req, res) => {
    const { fortune, userQuestion } = req.body;
    
    if (!fortune) {
        return res.status(400).json({ error: '缺少签诗信息' });
    }
    
    if (!OPENAI_API_KEY) {
        return res.status(503).json({ error: 'AI解签服务暂不可用' });
    }
    
    try {
        const interpretation = await getAIInterpretation(fortune, userQuestion);
        if (interpretation) {
            res.json({
                success: true,
                interpretation: interpretation
            });
        } else {
            res.status(500).json({ error: 'AI解签失败' });
        }
    } catch (e) {
        console.error('AI解签异常:', e);
        res.status(500).json({ error: '服务异常' });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hasGPT: !!OPENAI_API_KEY
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
        
        // 🟢 P2: 完善的Bot命令
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const welcomeMessage = `
🔮 *欢迎使用AI灵签*

✨ 功能：
• /抽签 - 随机抽取灵签
• /运势 - 今日运势
• /观音 - 观音灵签
• /关帝 - 关帝灵签  
• /月老 - 月老灵签
• /文昌 - 文昌签（学业）
• /财神 - 财神签（求财）

🎁 新用户首抽免费！
            `;
            bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
        });

        // 通用抽签命令
        bot.onText(/\/抽签/, async (msg) => {
            const chatId = msg.chat.id;
            const fortunes = require('./data/fortunes.json');
            const types = ['guanyin', 'guandi', 'yuelao', 'tumigong', 'huangdaxian'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            const typeFortunes = fortunes[randomType];
            const fortune = typeFortunes[Math.floor(Math.random() * typeFortunes.length)];
            
            const typeName = {
                guanyin: '观音灵签',
                guandi: '关帝灵签',
                yuelao: '月老灵签',
                tumigong: '土地公灵签',
                huangdaxian: '黄大仙灵签'
            }[randomType];
            
            const response = `
🎋 *${fortune.title}*

${fortune.level}

📜 *签诗：*
${fortune.poem}

🔮 *解签：*
${fortune.interpretation}

💡 点击 Mini App 获取完整解签服务！
            `;
            bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        });

        // 今日运势
        bot.onText(/\/运势/, (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id.toString();
            const today = new Date();
            const fortunes = require('./data/fortunes.json');
            const luckyType = ['guanyin', 'guandi', 'yuelao'][today.getDay() % 3];
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
            
            const response = `
📅 *${today.getMonth() + 1}月${today.getDate()}日运势*

🎯 今日运势：${rating}

🎋 今日幸运签：${fortune.title}

${fortune.level} - ${fortune.interpretation.substring(0, 50)}...

💡 今日提示：${tips[today.getDay()]}
            `;
            bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        });

        // 特定签种命令
        ['guanyin', '关帝', 'yuelao', 'tumigong', 'huangdaxian', 'wenchang', 'caishen', 'taishui'].forEach((type, idx) => {
            const typeMap = {
                'guanyin': { id: 'guanyin', name: '观音灵签' },
                '关帝': { id: 'guandi', name: '关帝灵签' },
                'yuelao': { id: 'yuelao', name: '月老灵签' },
                'tumigong': { id: 'tumigong', name: '土地公灵签' },
                'huangdaxian': { id: 'huangdaxian', name: '黄大仙灵签' },
                'wenchang': { id: 'wenchang', name: '文昌签' },
                'caishen': { id: 'caishen', name: '财神签' },
                'taishui': { id: 'taishui', name: '太岁签' }
            };
            const typeId = typeMap[type]?.id || typeMap[Object.keys(typeMap)[idx]]?.id;
            const typeName = typeMap[type]?.name || typeMap[type]?.name;
            
            bot.onText(new RegExp(`\\/${type}`), (msg) => {
                const chatId = msg.chat.id;
                const fortunes = require('./data/fortunes.json');
                const typeFortunes = fortunes[typeId];
                if (typeFortunes) {
                    const fortune = typeFortunes[Math.floor(Math.random() * typeFortunes.length)];
                    bot.sendMessage(chatId, `🎋 *${typeName}*\n\n${fortune.title}\n${fortune.level}\n\n📜 ${fortune.poem}\n\n🔮 ${fortune.interpretation}`, { parse_mode: 'Markdown' });
                }
            });
        });

        // 帮助命令
        bot.onText(/\/help/, (msg) => {
            bot.sendMessage(msg.chat.id, `
📖 *AI灵签使用指南*

🎯 *基础命令：*
/start - 开始使用
/抽签 - 随机灵签
/运势 - 今日运势

📿 *签种：*
/观音 - 观音灵签
/关帝 - 关帝灵签
/月老 - 月老灵签
/文昌 - 文昌签（学业）
/财神 - 财神签（求财）

💡 *进阶功能：*
在 Mini App 中可使用：
• AI智能解签（GPT-4）
• 广告免费解签
• 每日运势追踪
• 签文收藏分享
            `, { parse_mode: 'Markdown' });
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
    console.log('🔮 AI灵签 2.0 Mini App 运行中');
    console.log(`🚀 端口: http://localhost:${PORT}`);
    console.log(`🤖 GPT-4: ${OPENAI_API_KEY ? '已配置' : '未配置'}`);
});