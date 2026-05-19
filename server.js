const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MiniMax API 配置
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_API_URL = 'https://api.minimax.io/v1/text/chatcompletion_v2';

// 保留旧的 OpenAI 配置作为备用
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || '';
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
// MiniMax AI 解签功能
// ========================================

// 签种名称映射
const fortuneTypeNames = {
    'guanyin': '观音灵签',
    'guandi': '关帝灵签',
    'yuelao': '月老灵签',
    'tumigong': '土地公灵签',
    'huangdaxian': '黄大仙灵签',
    'wenchang': '文昌签',
    'caishen': '财神签',
    'taishui': '太岁签'
};

async function getMiniMaxInterpretation(fortune, userQuestion = '') {
    if (!MINIMAX_API_KEY) {
        console.log('[AI解签] 未配置 MiniMax API Key');
        return null;
    }

    const typeName = fortuneTypeNames[fortune.type] || fortune.type;

    const prompt = `你是东方玄学大师，擅长解签。请为以下${typeName}进行详细解读：

签号：第${fortune.index}签
签名：${fortune.title}
签级：${fortune.level}
签诗：${fortune.poem}
${fortune.shiYue ? `诗曰：${fortune.shiYue}` : ''}
${fortune.xianJi ? `仙机：${fortune.xianJi}` : ''}
${fortune.dianGu ? `典故：${fortune.dianGu}` : ''}
${userQuestion ? `用户求问：${userQuestion}` : ''}

请从以下几个方面进行解读（输出JSON格式）：
{
  "interpretation": "详细解签（300-500字，涵盖事业、感情、财运、健康等方面）",
  "shiYue": "诗曰内容（简洁的运势描述）",
  "xianJi": "仙机内容（行动指引）",
  "dianGu": "典故内容（历史典故或故事背景）"
}`;

    try {
        const response = await fetch(MINIMAX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MINIMAX_API_KEY}`
            },
            body: JSON.stringify({
                model: 'MiniMax-M2.7',
                tokens_to_generate: 1024,
                temperature: 0.7,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            console.error('[AI解签] MiniMax API error:', response.status);
            return null;
        }

        const data = await response.json();
        
        // 解析响应
        const content = data.choices?.[0]?.messages?.[0]?.text || 
                        data.choices?.[0]?.messages?.[0]?.content;

        if (content) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                console.log('[AI解签] MiniMax 解签成功');
                return JSON.parse(jsonMatch[0]);
            }
        }

        return null;
    } catch (error) {
        console.error('[AI解签] MiniMax API error:', error);
        return null;
    }
}

// ========================================
// GPT-4 AI 解签服务（备用）
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

// 内置智能解签函数（当外部API不可用时使用）
function getBuiltinInterpretation(fortune) {
    const levelEmoji = {
        '上上': '🌟✨', '上吉': '✨🌟', '吉': '🌟', '中吉': '👍✨', 
        '中平': '👍', '中': '👍', '平': '⚖️', '下下': '⚠️'
    };
    
    const levelAdvice = {
        '上上': '运势极佳！把握时机，勇往直前，会有意外惊喜。',
        '上吉': '运势很好，贵人多助，适合进取。',
        '吉': '运势顺畅，稳扎稳打，有望达成心愿。',
        '中吉': '运势平稳，循序渐进，耐心等待时机。',
        '中平': '运势一般，顺其自然，不宜强求。',
        '中': '运势平稳，保守行事，随遇而安。',
        '平': '运势平淡，保持平常心，静待时机。',
        '下下': '运势低迷，宜守不宜动，谨慎行事。'
    };
    
    const fortuneTypeAdvice = {
        'guanyin': '观音菩萨慈悲为怀，会指引你找到答案。',
        'guandi': '关帝爷忠诚正义，会护佑你渡过难关。',
        'yuelao': '月老红线牵引，有缘人自会相遇。',
        'tumigong': '土地公护佑一方，风调雨顺，平安吉祥。',
        'huangdaxian': '黄大仙指点迷津，趋吉避凶，化险为夷。',
        'wenchang': '文昌帝君庇佑，学业进步，金榜题名。',
        'caishen': '财神眷顾，财源广进，金玉满堂。',
        'taishui': '太岁年宜静不宜动，化解冲煞，平安度过。'
    };
    
    const emoji = levelEmoji[fortune.level] || '🌟';
    const advice = levelAdvice[fortune.level] || levelAdvice['中平'];
    const typeAdvice = fortuneTypeAdvice[fortune.type] || '神明庇佑。';
    
    // 生成3个行动指引
    const actions = {
        '上上': ['今天适合做重大决定', '这周可以主动出击', '这个月把握机会大展拳脚'],
        '上吉': ['今天运势正旺', '这周适合洽谈合作', '这个月财运事业双丰收'],
        '吉': ['今天适合稳步推进', '这周保持好节奏', '这个月有贵人相助'],
        '中吉': ['今天稳扎稳打', '这周继续努力', '这个月收获可期'],
        '中平': ['今天保持平常心', '这周不宜冒进', '这个月静待时机'],
        '下下': ['今天宜静不宜动', '这周谨慎行事', '这个月低调积累']
    };
    const levelActions = actions[fortune.level] || actions['中平'];
    
    return `🎋 ${fortune.title}\n\n签级：${fortune.level} ${emoji}\n\n📜 签诗：\n${fortune.poem}\n\n💡 智能解读：\n${fortune.interpretation}\n\n🙏 ${typeAdvice}\n\n🌈 综合建议：${advice}\n\n📋 行动指引：\n• ${levelActions[0]}\n• ${levelActions[1]}\n• ${levelActions[2]}\n\n✨ 记住：心诚则灵，积极行动，命运掌握在自己手中！`;
}

async function getAIInterpretation(fortune, userQuestion = '') {
    // 优先使用 MiniMax API
    if (MINIMAX_API_KEY) {
        const miniMaxResult = await getMiniMaxInterpretation(fortune, userQuestion);
        if (miniMaxResult) {
            // 格式化 MiniMax 结果
            const levelEmoji = {
                '上上': '🌟✨', '上吉': '✨🌟', '吉': '🌟', '中吉': '👍✨', 
                '中平': '👍', '中': '👍', '平': '⚖️', '下下': '⚠️'
            };
            
            const typeAdvice = {
                'guanyin': '观音菩萨慈悲为怀，会指引你找到答案。',
                'guandi': '关帝爷忠诚正义，会护佑你渡过难关。',
                'yuelao': '月老红线牵引，有缘人自会相遇。',
                'tumigong': '土地公护佑一方，风调雨顺，平安吉祥。',
                'huangdaxian': '黄大仙指点迷津，趋吉避凶，化险为夷。',
                'wenchang': '文昌帝君庇佑，学业进步，金榜题名。',
                'caishen': '财神眷顾，财源广进，金玉满堂。',
                'taishui': '太岁年宜静不宜动，化解冲煞，平安度过。'
            };
            
            const emoji = levelEmoji[fortune.level] || '🌟';
            const advice = typeAdvice[fortune.type] || '神明庇佑。';
            
            return `🎋 ${fortune.title}\n\n签级：${fortune.level} ${emoji}\n\n📜 签诗：\n${fortune.poem}\n\n💡 MiniMax AI 智能解读：\n${miniMaxResult.interpretation || miniMaxResult}\n\n🙏 ${advice}\n\n📋 ${miniMaxResult.shiYue || ''}\n📋 ${miniMaxResult.xianJi || ''}\n📖 ${miniMaxResult.dianGu || ''}`;
        }
    }
    
    // 备用：使用 OpenAI API
    if (OPENAI_BASE_URL && OPENAI_API_KEY) {
        try {
            return await callOpenAIInterpretation(fortune, userQuestion);
        } catch (e) {
            console.error('[AI解签] OpenAI 调用失败:', e.message);
        }
    }
    
    // 最后备用：使用内置解签
    console.log('[AI解签] 使用内置解签');
    return getBuiltinInterpretation(fortune);
}

async function callOpenAIInterpretation(fortune, userQuestion) {
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
                try {
                    const json = JSON.parse(body);
                    if (json.choices && json.choices[0] && json.choices[0].message) {
                        resolve(json.choices[0].message.content);
                    } else if (json.error) {
                        reject(new Error(json.error.message));
                    } else {
                        reject(new Error('未知响应格式'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
        req.write(data);
        req.end();
    });
}

        req.on('error', (e) => {
            console.error('[AI解签] 请求错误:', e.message);
            // 网络错误时使用内置解签
            resolve(getBuiltinInterpretation(fortune));
        });

        req.on('timeout', () => {
            req.destroy();
            console.error('[AI解签] 请求超时');
            // 超时时使用内置解签
            resolve(getBuiltinInterpretation(fortune));
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
// 用户数据管理（持久化）
// ========================================

const USERS_FILE = path.join(__dirname, 'data', 'users.json');

function initUsersFile() {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users: {}, defaultTimes: 3 }, null, 2));
    }
}

function getUsersData() {
    initUsersFile();
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return { users: {}, defaultTimes: 3 };
    }
}

function saveUsersData(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function getOrCreateUser(userId) {
    const data = getUsersData();
    if (!data.users[userId]) {
        data.users[userId] = {
            freeDraws: data.defaultTimes,
            aiUses: 1,
            totalDraws: 0,
            createdAt: new Date().toISOString(),
            lastDrawAt: null
        };
        saveUsersData(data);
    }
    return data.users[userId];
}

// ========================================
// 用户积分管理 API（持久化版本）
// ========================================

// 获取用户积分
app.get('/api/credits/:userId', (req, res) => {
    const userId = req.params.userId;
    const credits = getOrCreateUser(userId);
    res.json({
        success: true,
        userId: userId,
        credits: credits
    });
});

// 使用抽签次数
app.post('/api/credits/:userId/draw', (req, res) => {
    const userId = req.params.userId;
    const data = getUsersData();
    
    let user = data.users[userId];
    if (!user) {
        user = {
            freeDraws: data.defaultTimes,
            aiUses: 1,
            totalDraws: 0,
            createdAt: new Date().toISOString(),
            lastDrawAt: null
        };
        data.users[userId] = user;
    }
    
    if (user.freeDraws <= 0) {
        return res.json({
            success: false,
            error: '抽签次数已用完',
            credits: user
        });
    }
    
    user.freeDraws -= 1;
    user.totalDraws += 1;
    user.lastDrawAt = new Date().toISOString();
    saveUsersData(data);
    
    res.json({
        success: true,
        credits: user
    });
});

// 管理员设置用户积分
app.post('/api/admin/credits/:userId', (req, res) => {
    const userId = req.params.userId;
    const { freeDraws, aiUses, action, adminKey } = req.body;
    
    // 简单的管理员验证（生产环境需要更安全的验证）
    const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: '无权限', code: 'FORBIDDEN' });
    }
    
    const data = getUsersData();
    let user = data.users[userId];
    
    if (!user) {
        user = {
            freeDraws: data.defaultTimes,
            aiUses: 1,
            totalDraws: 0,
            createdAt: new Date().toISOString(),
            lastDrawAt: null
        };
        data.users[userId] = user;
    }
    
    if (action === 'add') {
        if (typeof freeDraws === 'number') user.freeDraws += freeDraws;
        if (typeof aiUses === 'number') user.aiUses += aiUses;
        res.json({ success: true, message: '积分已增加', credits: user });
    } else if (action === 'set') {
        if (typeof freeDraws === 'number') user.freeDraws = freeDraws;
        if (typeof aiUses === 'number') user.aiUses = aiUses;
        res.json({ success: true, message: '积分已设置', credits: user });
    } else if (action === 'reset') {
        user.freeDraws = data.defaultTimes;
        user.aiUses = 1;
        res.json({ success: true, message: '积分已重置', credits: user });
    } else if (action === 'deduct') {
        if (typeof freeDraws === 'number' && user.freeDraws >= freeDraws) user.freeDraws -= freeDraws;
        if (typeof aiUses === 'number' && user.aiUses >= aiUses) user.aiUses -= aiUses;
        res.json({ success: true, message: '积分已扣减', credits: user });
    } else {
        return res.status(400).json({ error: '未知操作', code: 'INVALID_ACTION' });
    }
    
    saveUsersData(data);
});

// 获取所有用户（管理员）
app.get('/api/admin/users', (req, res) => {
    const data = getUsersData();
    const usersList = Object.entries(data.users).map(([id, info]) => ({
        userId: id,
        freeDraws: info.freeDraws,
        aiUses: info.aiUses,
        totalDraws: info.totalDraws,
        createdAt: info.createdAt,
        lastDrawAt: info.lastDrawAt
    }));
    
    res.json({
        success: true,
        users: usersList,
        total: usersList.length,
        defaultTimes: data.defaultTimes
    });
});

// 设置默认次数
app.post('/api/admin/default-times', (req, res) => {
    const { times, adminKey } = req.body;
    
    const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
    if (adminKey !== ADMIN_KEY) {
        return res.status(403).json({ error: '无权限', code: 'FORBIDDEN' });
    }
    
    if (typeof times !== 'number' || times < 0) {
        return res.status(400).json({ success: false, error: '次数必须是大于等于0的数字' });
    }
    
    const data = getUsersData();
    data.defaultTimes = times;
    saveUsersData(data);
    
    res.json({ success: true, defaultTimes: times });
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