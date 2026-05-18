const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-f2eb1ff67798fdd3b7128cfd5caf366d8d7444d4108236b85150bb1ceacec234';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'http://69.5.20.196:8080';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';

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

// 测试AI连接
async function testAIConnection() {
    if (!OPENAI_BASE_URL || !OPENAI_API_KEY) {
        return { success: false, error: '未配置API' };
    }
    
    return new Promise((resolve) => {
        const data = JSON.stringify({
            model: OPENAI_MODEL,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5
        });

        const urlMatch = OPENAI_BASE_URL.match(/^(?:https?:\/\/)?([^:/]+)(?::(\d+))?/);
        const hostname = urlMatch ? urlMatch[1] : '69.5.20.196';
        const port = urlMatch && urlMatch[2] ? parseInt(urlMatch[2]) : 8080;
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
            timeout: 10000
        };

        const reqModule = isHttps ? https : http;
        const req = reqModule.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (json.error) {
                        resolve({ success: false, error: json.error.message });
                    } else if (json.choices) {
                        resolve({ success: true, message: 'AI服务正常' });
                    } else {
                        resolve({ success: false, error: '响应格式异常' });
                    }
                } catch (e) {
                    resolve({ success: false, error: e.message });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '连接超时' }); });
        req.write(data);
        req.end();
    });
}

async function getAIInterpretation(fortune, userQuestion = '') {
    if (!OPENAI_BASE_URL || !OPENAI_API_KEY) {
        console.log('⚠️ AI配置不完整，跳过AI解签');
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

    return new Promise((resolve) => {
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
        const port = urlMatch && urlMatch[2] ? parseInt(urlMatch[2]) : 8080;
        const isHttps = OPENAI_BASE_URL.startsWith('https');
        
        console.log('[AI解签] 发起请求:', { hostname, port, isHttps, model: OPENAI_MODEL });
        
        const options = {
            hostname: hostname,
            port: port,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            timeout: 20000
        };

        const reqModule = isHttps ? https : http;
        const req = reqModule.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('[AI解签] 响应状态:', res.statusCode, 'body长度:', body.length);
                try {
                    const json = JSON.parse(body);
                    if (json.choices && json.choices[0] && json.choices[0].message) {
                        console.log('[AI解签] 成功!');
                        resolve(json.choices[0].message.content);
                    } else if (json.error) {
                        console.error('[AI解签] API错误:', json.error.code, json.error.message);
                        resolve(null);
                    } else {
                        console.error('[AI解签] 未知响应格式, body:', body.substring(0, 500));
                        resolve(null);
                    }
                } catch (e) {
                    console.error('[AI解签] JSON解析失败:', e.message, 'body:', body.substring(0, 500));
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('[AI解签] 请求错误:', e.message);
            resolve(null);
        });

        req.on('timeout', () => {
            req.destroy();
            console.error('[AI解签] 请求超时');
            resolve(null);
        });

        req.write(data);
        req.end();
    });
}

// 备用简化版AI调用（用于调试）
async function simpleAIRequest(prompt) {
    if (!OPENAI_BASE_URL || !OPENAI_API_KEY) {
        return null;
    }
    
    return new Promise((resolve) => {
        const data = JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: '你是一位慈悲、智慧且幽默的东方玄学解签大师。' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 300,
            temperature: 0.8
        });

        const urlMatch = OPENAI_BASE_URL.match(/^(?:https?:\/\/)?([^:/]+)(?::(\d+))?/);
        const hostname = urlMatch ? urlMatch[1] : '69.5.20.196';
        const port = urlMatch && urlMatch[2] ? parseInt(urlMatch[2]) : 8080;
        const isHttps = OPENAI_BASE_URL.startsWith('https');
        
        const options = {
            hostname: hostname,
            port: port,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            timeout: 20000
        };

        const reqModule = isHttps ? https : http;
        const req = reqModule.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log('[SimpleAI] Status:', res.statusCode, 'Body len:', body.length);
                try {
                    const json = JSON.parse(body);
                    // 检查各种可能的成功响应格式
                    if (json.choices && json.choices[0] && json.choices[0].message) {
                        resolve(json.choices[0].message.content);
                    } else if (json.output || json.text) {
                        resolve(json.output || json.text);
                    } else if (json.error) {
                        console.error('[SimpleAI] 错误:', json.error.message);
                        resolve(null);
                    } else {
                        console.error('[SimpleAI] 未知格式, body:', body.substring(0, 300));
                        resolve(null);
                    }
                } catch (e) {
                    console.error('[SimpleAI] 解析失败:', e.message, 'body:', body.substring(0, 300));
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('[SimpleAI] 请求错误:', e.message);
            resolve(null);
        });

        req.on('timeout', () => {
            req.destroy();
            console.error('[SimpleAI] 超时');
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

// 健康检查 + AI状态
app.get('/health', async (req, res) => {
    const aiStatus = await testAIConnection();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hasGPT: aiStatus.success,
        aiError: aiStatus.error || null,
        uptime: process.uptime()
    });
});

// AI测试端点
app.get('/api/test-ai', async (req, res) => {
    console.log('[TestAI] 开始测试');
    console.log('[TestAI] OPENAI_API_KEY:', OPENAI_API_KEY ? '已配置' : '未配置');
    console.log('[TestAI] OPENAI_BASE_URL:', OPENAI_BASE_URL);
    console.log('[TestAI] OPENAI_MODEL:', OPENAI_MODEL);
    
    const urlMatch = OPENAI_BASE_URL.match(/^(?:https?:\/\/)?([^:/]+)(?::(\d+))?/);
    const hostname = urlMatch ? urlMatch[1] : '69.5.20.196';
    const port = urlMatch && urlMatch[2] ? parseInt(urlMatch[2]) : 8080;
    console.log('[TestAI] 解析结果 - hostname:', hostname, 'port:', port);
    
    const data = JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
    });
    
    const options = {
        hostname: hostname,
        port: port,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + OPENAI_API_KEY
        },
        timeout: 10000
    };
    
    const httpModule = OPENAI_BASE_URL.startsWith('https') ? https : http;
    const aiReq = httpModule.request(options, (aiRes) => {
        let body = '';
        aiRes.on('data', chunk => body += chunk);
        aiRes.on('end', () => {
            console.log('[TestAI] 响应状态:', aiRes.statusCode);
            console.log('[TestAI] body:', body.substring(0, 500));
            res.json({
                status: aiRes.statusCode,
                body: body.substring(0, 1000)
            });
        });
    });
    
    aiReq.on('error', (e) => {
        console.error('[TestAI] 错误:', e.message);
        res.json({ error: e.message });
    });
    
    aiReq.write(data);
    aiReq.end();
});

// Mini App 入口
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 管理后台入口
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ========================================
// 用户积分管理 API
// ========================================

// 简单的内存存储（生产环境应使用数据库）
const userCredits = new Map();

// 初始化默认积分
function getUserCredits(userId) {
    if (!userCredits.has(userId)) {
        userCredits.set(userId, {
            freeDraws: 3,
            aiUses: 1,
            totalDraws: 0
        });
    }
    return userCredits.get(userId);
}

// 获取用户积分
app.get('/api/credits/:userId', (req, res) => {
    const userId = req.params.userId;
    const credits = getUserCredits(userId);
    res.json({
        success: true,
        userId: userId,
        credits: credits
    });
});

// 管理员设置用户积分 (通过查询参数)
app.post('/api/credits/:userId', (req, res) => {
    const userId = req.params.userId;
    const { freeDraws, aiUses, action, adminKey } = req.body;
    
    // 简单的管理员验证（生产环境需要更安全的验证）
    const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: '无权限', code: 'FORBIDDEN' });
    }
    
    const credits = getUserCredits(userId);
    
    if (action === 'add') {
        // 增加积分
        if (typeof freeDraws === 'number') credits.freeDraws += freeDraws;
        if (typeof aiUses === 'number') credits.aiUses += aiUses;
        res.json({
            success: true,
            message: '积分已增加',
            credits: credits
        });
    } else if (action === 'set') {
        // 设置积分
        if (typeof freeDraws === 'number') credits.freeDraws = freeDraws;
        if (typeof aiUses === 'number') credits.aiUses = aiUses;
        res.json({
            success: true,
            message: '积分已设置',
            credits: credits
        });
    } else if (action === 'reset') {
        // 重置为默认值
        credits.freeDraws = 3;
        credits.aiUses = 1;
        res.json({
            success: true,
            message: '积分已重置',
            credits: credits
        });
    } else if (action === 'deduct') {
        // 扣减积分
        if (typeof freeDraws === 'number' && credits.freeDraws >= freeDraws) {
            credits.freeDraws -= freeDraws;
        }
        if (typeof aiUses === 'number' && credits.aiUses >= aiUses) {
            credits.aiUses -= aiUses;
        }
        res.json({
            success: true,
            message: '积分已扣减',
            credits: credits
        });
    } else {
        res.status(400).json({ error: '未知操作', code: 'INVALID_ACTION' });
    }
});

// ========================================
// Telegram Bot 命令处理
// ========================================
let bot = null;

function initBot() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.log('⚠️ 未配置 Telegram Bot Token');
        return;
    }
    
    try {
        const TelegramBot = require('node-telegram-bot-api');
        bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
            polling: {
                interval: 1000,
                autoStart: true,
                params: { timeout: 60 }
            },
            filepath: false,
            batchPolling: false
        });
        
        // 错误处理
        bot.on('polling_error', (error) => {
            console.error('⚠️ Telegram Bot Polling错误:', error.message);
            // 409错误表示有其他实例在运行，尝试清理
            if (error.message.includes('409')) {
                console.log('检测到冲突，尝试清理旧连接...');
                try {
                    bot.stopPolling();
                    setTimeout(() => {
                        console.log('重新启动Bot...');
                        initBot();
                    }, 5000);
                } catch (e) {
                    console.error('清理失败:', e.message);
                }
            }
        });
        
        bot.on('error', (error) => {
            console.error('⚠️ Telegram Bot错误:', error.message);
        });
        
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
        
    } catch (e) {
        console.log('⚠️ Telegram Bot 初始化失败:', e.message);
    }
}

// 初始化Bot
initBot();

// ========================================
// 启动服务
// ========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('🔮 AI好签 2.0 Mini App 运行中');
    console.log(`🚀 端口: http://localhost:${PORT}`);
    console.log(`🤖 AI模型: ${OPENAI_MODEL}`);
    console.log(`🔗 API端点: ${OPENAI_BASE_URL}`);
});