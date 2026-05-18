/**
 * AI灵签 2.0 - Telegram Mini App
 * GPT-4智能解签 + 广告变现 + 每日运势
 */

(function() {
    'use strict';

    // ========================================
    // 应用状态
    // ========================================
    const AppState = {
        currentFortune: null,
        currentFortuneType: null,
        isDrawing: false,
        // 🟢 P2: 用户数据（本地存储）
        userData: {
            freeDraws: 3,        // 免费抽签次数
            aiUses: 1,           // AI解签次数
            totalDraws: 0,       // 总抽签数
            isNewUser: true,     // 新用户标识
            dailyChecked: false, // 今日运势已查
            drawHistory: []      // 抽签历史
        },
        // 🟡 P1: 每日运势数据
        dailyFortune: null,
        dailyRating: null
    };

    // ========================================
    // 本地存储
    // ========================================
    const Storage = {
        KEY: 'ai_lingqian_data',
        
        load() {
            try {
                const data = localStorage.getItem(this.KEY);
                if (data) {
                    const parsed = JSON.parse(data);
                    // 合并默认数据
                    AppState.userData = { ...AppState.userData, ...parsed };
                    // 检查是否新的一天，重置每日次数
                    this.checkDailyReset();
                }
            } catch (e) {
                console.error('加载数据失败:', e);
            }
        },
        
        save() {
            try {
                localStorage.setItem(this.KEY, JSON.stringify(AppState.userData));
            } catch (e) {
                console.error('保存数据失败:', e);
            }
        },
        
        checkDailyReset() {
            const lastDate = AppState.userData.lastVisitDate;
            const today = new Date().toDateString();
            if (lastDate !== today) {
                // 新的一天，重置每日次数
                AppState.userData.freeDraws = 3;
                AppState.userData.aiUses = 1;
                AppState.userData.dailyChecked = false;
                AppState.userData.lastVisitDate = today;
            }
        },
        
        useFreeDraw() {
            if (AppState.userData.freeDraws > 0) {
                AppState.userData.freeDraws--;
                AppState.userData.totalDraws++;
                this.save();
                return true;
            }
            return false;
        },
        
        useAI() {
            if (AppState.userData.aiUses > 0) {
                AppState.userData.aiUses--;
                this.save();
                return true;
            }
            return false;
        }
    };

    // ========================================
    // Telegram WebApp
    // ========================================
    let tg = window.Telegram?.WebApp;

    function initTelegram() {
        if (tg) {
            tg.ready();
            tg.expand();
            tg.enableClosingConfirmation();
            
            // 隐藏加载界面
            const hideSplash = () => {
                document.querySelectorAll('[class*="splash"]').forEach(el => {
                    el.style.cssText = 'display: none !important';
                });
            };
            hideSplash();
            setTimeout(hideSplash, 100);
            setTimeout(hideSplash, 500);
            
            document.body.style.visibility = 'visible';
        } else {
            document.body.style.visibility = 'visible';
        }
    }

    // ========================================
    // API 服务
    // ========================================
    const API_BASE = '';

    const API = {
        async getFortuneTypes() {
            try {
                const response = await fetch(`${API_BASE}/api/fortune-types`);
                return await response.json();
            } catch (error) {
                console.error('获取签种失败:', error);
                return [];
            }
        },

        async drawFortune(type) {
            try {
                const response = await fetch(`${API_BASE}/api/draw/${type}`);
                return await response.json();
            } catch (error) {
                console.error('抽签失败:', error);
                return null;
            }
        },

        async getDailyFortune() {
            try {
                const userId = tg?.initDataUnsafe?.user?.id || 'anonymous';
                const response = await fetch(`${API_BASE}/api/daily/${userId}`);
                return await response.json();
            } catch (error) {
                console.error('获取每日运势失败:', error);
                return null;
            }
        },

        async getAIInterpretation(fortune, userQuestion) {
            try {
                const response = await fetch(`${API_BASE}/api/ai-interpret`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fortune, userQuestion })
                });
                return await response.json();
            } catch (error) {
                console.error('AI解签失败:', error);
                return null;
            }
        }
    };

    // ========================================
    // UI 组件
    // ========================================
    const UI = {
        showLoading(text = '诚心抽取中...') {
            const overlay = document.getElementById('loading-overlay');
            overlay.querySelector('p').textContent = text;
            overlay.classList.add('active');
        },

        hideLoading() {
            document.getElementById('loading-overlay').classList.remove('active');
        },

        showToast(message, duration = 2000) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.remove('hidden');
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                toast.classList.add('hidden');
            }, duration);
        },

        showScreen(screenId) {
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
            document.getElementById(screenId)?.classList.add('active');
        },

        updateStats() {
            document.getElementById('free-draws').textContent = AppState.userData.freeDraws;
            document.getElementById('ai-uses').textContent = AppState.userData.aiUses;
        },

        renderFortuneTypes(types) {
            const grid = document.getElementById('fortune-grid');
            grid.innerHTML = '';

            types.forEach(type => {
                const card = document.createElement('div');
                card.className = 'fortune-card' + (type.isPremium ? ' premium' : '');
                card.dataset.type = type.id;
                card.innerHTML = `
                    <div class="icon">${type.icon}</div>
                    <div class="name">${type.name}</div>
                    <div class="desc">${type.description}</div>
                    ${type.isPremium ? '<div class="premium-badge">PRO</div>' : ''}
                `;
                
                card.addEventListener('click', () => this.selectFortuneType(type));
                grid.appendChild(card);
            });
        },

        selectFortuneType(type) {
            AppState.currentFortuneType = type;
            
            // 检查是否有免费次数
            if (AppState.userData.freeDraws <= 0) {
                // 🟴 P0: 广告界面
                this.showScreen('ad-screen');
                this.startAdTimer();
                return;
            }
            
            this.showScreen('drawing-screen');
            const prayerText = document.querySelector('.prayer-text');
            prayerText.textContent = `请诚心默念${type.name}，求问心中疑惑`;
        },

        async performDraw() {
            if (AppState.isDrawing) return;
            
            const drawBtn = document.getElementById('draw-btn');
            const drawingContainer = document.querySelector('.drawing-container');
            
            AppState.isDrawing = true;
            drawBtn.disabled = true;
            
            // 摇晃动画
            drawingContainer.classList.add('shaking');
            const delay = Math.random() * 2000 + 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            drawingContainer.classList.remove('shaking');

            this.showLoading('抽取中...');
            
            const result = await API.drawFortune(AppState.currentFortuneType.id);
            
            this.hideLoading();

            if (result && result.success && result.fortune) {
                AppState.currentFortune = result.fortune;
                Storage.useFreeDraw();
                this.updateStats();
                this.showFortuneResult(result);
            } else {
                this.showToast('抽签出了点问题，请重试');
                drawBtn.disabled = false;
                AppState.isDrawing = false;
            }
        },

        showFortuneResult(result) {
            const fortune = result.fortune;
            const levelBadge = document.getElementById('fortune-level');
            const titleEl = document.getElementById('fortune-title');
            const poemEl = document.getElementById('fortune-poem');
            
            levelBadge.textContent = fortune.level;
            levelBadge.className = 'fortune-badge';
            if (fortune.level.includes('上')) {
                levelBadge.classList.add('level-upper');
            } else if (fortune.level.includes('中')) {
                levelBadge.classList.add('level-mid');
            } else {
                levelBadge.classList.add('level-lower');
            }
            
            titleEl.textContent = fortune.title;
            poemEl.textContent = fortune.poem;
            
            this.showScreen('result-screen');
            
            AppState.isDrawing = false;
            document.getElementById('draw-btn').disabled = false;
        },

        showInterpretation() {
            const fortune = AppState.currentFortune;
            if (!fortune) return;
            
            document.getElementById('inter-poem').textContent = fortune.poem;
            document.getElementById('inter-shi-yue').textContent = fortune.shiYue || '（无）';
            document.getElementById('inter-xian-ji').textContent = fortune.xianJi || '（无）';
            document.getElementById('inter-dian-gu').textContent = fortune.dianGu || '（无）';
            document.getElementById('inter-interpretation').textContent = fortune.interpretation;
            
            // 如果有预生成的AI解读，显示它
            const aiBox = document.getElementById('inter-ai');
            if (fortune.aiInterpretation) {
                aiBox.textContent = fortune.aiInterpretation;
                document.getElementById('ai-interpret-btn').style.display = 'none';
            }
            
            this.showScreen('interpretation-screen');
        },

        // 🟴 P0: GPT-4 AI 解签
        async requestAIInterpretation() {
            if (!Storage.useAI()) {
                this.showToast('AI解签次数已用完，请明天再来或观看广告');
                return;
            }
            this.updateStats();
            
            const fortune = AppState.currentFortune;
            this.showLoading('AI解读中...');
            
            const result = await API.getAIInterpretation(fortune, '');
            
            this.hideLoading();
            
            if (result && result.success && result.interpretation) {
                document.getElementById('inter-ai').textContent = result.interpretation;
                document.getElementById('ai-interpret-btn').style.display = 'none';
                this.showToast('AI解读完成！');
            } else {
                this.showToast('AI解签服务暂不可用');
            }
        },

        reshuffle() {
            AppState.currentFortune = null;
            this.showScreen('drawing-screen');
        },

        goHome() {
            AppState.currentFortune = null;
            AppState.currentFortuneType = null;
            AppState.isDrawing = false;
            this.showScreen('selection-screen');
            document.getElementById('draw-btn').disabled = false;
        },

        shareResult() {
            const fortune = AppState.currentFortune;
            const shareText = `🎋 AI灵签 2.0\n\n${fortune.title}\n${fortune.level}\n\n签诗：\n${fortune.poem}\n\n解签：\n${fortune.interpretation}\n\n👉 点击体验GPT-4智能解签`;
            
            if (navigator.clipboard) {
                navigator.clipboard.writeText(shareText).then(() => {
                    this.showToast('已复制到剪贴板');
                });
            }
            
            if (tg) {
                tg.HapticFeedback.impactOccurred('medium');
            }
        },

        // 🟴 P0: 广告系统
        startAdTimer() {
            let seconds = 5;
            const timerEl = document.getElementById('ad-timer');
            const watchBtn = document.getElementById('watch-ad');
            
            const timer = setInterval(() => {
                seconds--;
                timerEl.textContent = `${seconds}s`;
                watchBtn.textContent = `观看广告 (${seconds}s)`;
                
                if (seconds <= 0) {
                    clearInterval(timer);
                    watchBtn.textContent = '🎬 播放广告';
                    watchBtn.disabled = false;
                }
            }, 1000);
        },

        showAd() {
            // 模拟广告展示
            this.showToast('广告播放中...');
            
            // 实际项目中这里会调用广告SDK
            setTimeout(() => {
                // 广告看完，奖励次数
                AppState.userData.freeDraws += 1;
                Storage.save();
                this.updateStats();
                this.showToast('获得1次免费抽签！');
                this.showScreen('drawing-screen');
            }, 5000);
        },

        // 🟢 P2: 新手引导
        showGuide() {
            if (AppState.userData.isNewUser) {
                document.getElementById('guide-overlay').classList.remove('hidden');
            }
        },

        nextGuideStep() {
            const currentStep = document.querySelector('.guide-step:not(.hidden)');
            const nextStepNum = parseInt(currentStep.dataset.step) + 1;
            
            if (nextStepNum <= 3) {
                currentStep.classList.add('hidden');
                document.querySelector(`.guide-step[data-step="${nextStepNum}"]`).classList.remove('hidden');
            } else {
                this.closeGuide();
            }
        },

        closeGuide() {
            document.getElementById('guide-overlay').classList.add('hidden');
            AppState.userData.isNewUser = false;
            Storage.save();
            this.showGiftModal();
        },

        // 🟢 P2: 新手礼包
        showGiftModal() {
            document.getElementById('gift-modal').classList.remove('hidden');
        },

        claimGift() {
            AppState.userData.freeDraws = 3;
            AppState.userData.aiUses = 1;
            AppState.userData.isNewUser = false;
            Storage.save();
            this.updateStats();
            document.getElementById('gift-modal').classList.add('hidden');
            this.showToast('礼包已领取！');
        },

        closeGift() {
            document.getElementById('gift-modal').classList.add('hidden');
        },

        // 🟡 P1: 每日运势
        async loadDailyFortune() {
            if (AppState.userData.dailyChecked) return;
            
            const result = await API.getDailyFortune();
            if (result && result.success) {
                AppState.dailyFortune = result.fortune;
                AppState.dailyRating = result.rating;
                
                const dailyCard = document.getElementById('daily-card');
                const dailyDate = document.getElementById('daily-date');
                const dailyRating = document.getElementById('daily-rating');
                const dailyTip = document.getElementById('daily-tip');
                
                const today = new Date();
                dailyDate.textContent = `${today.getMonth() + 1}月${today.getDate()}日`;
                dailyRating.textContent = result.rating;
                dailyRating.className = 'daily-rating ' + (result.rating.includes('吉') ? 'good' : 'normal');
                dailyTip.textContent = result.tips?.join(' · ') || '';
                
                dailyCard.classList.remove('hidden');
            }
        }
    };

    // ========================================
    // 事件绑定
    // ========================================
    function bindEvents() {
        // 抽签按钮
        document.getElementById('draw-btn')?.addEventListener('click', () => UI.performDraw());
        
        // 解签按钮
        document.getElementById('interpret-btn')?.addEventListener('click', () => UI.showInterpretation());
        
        // AI解签按钮
        document.getElementById('ai-interpret-btn')?.addEventListener('click', () => UI.requestAIInterpretation());
        
        // 重新抽签
        document.getElementById('reshuffle-btn')?.addEventListener('click', () => UI.reshuffle());
        
        // 分享
        document.getElementById('share-btn')?.addEventListener('click', () => UI.shareResult());
        
        // 返回首页
        document.getElementById('back-home-btn')?.addEventListener('click', () => UI.goHome());
        
        // 🟴 P0: 广告按钮
        document.getElementById('watch-ad')?.addEventListener('click', () => UI.showAd());
        document.getElementById('skip-ad')?.addEventListener('click', () => {
            if (AppState.userData.freeDraws > 0) {
                UI.showScreen('drawing-screen');
            } else {
                UI.showToast('没有可用积分，请观看广告');
            }
        });
        
        // 🟢 P2: 新手引导
        document.getElementById('guide-next')?.addEventListener('click', () => UI.nextGuideStep());
        document.getElementById('guide-skip')?.addEventListener('click', () => UI.closeGuide());
        
        // 🟢 P2: 新手礼包
        document.getElementById('claim-gift')?.addEventListener('click', () => UI.claimGift());
        document.getElementById('close-gift')?.addEventListener('click', () => UI.closeGift());
        
        // Telegram返回按钮
        if (tg) {
            tg.onEvent('backButtonClicked', () => {
                const activeScreen = document.querySelector('.screen.active');
                if (activeScreen?.id === 'selection-screen') {
                    tg.close();
                } else if (activeScreen?.id === 'drawing-screen') {
                    UI.goHome();
                } else if (activeScreen?.id === 'result-screen') {
                    UI.reshuffle();
                } else if (activeScreen?.id === 'interpretation-screen') {
                    UI.showScreen('result-screen');
                }
            });
        }
    }

    // ========================================
    // 应用初始化
    // ========================================
    async function init() {
        initTelegram();
        Storage.load();
        bindEvents();
        
        // 加载签种
        const fortuneTypes = await API.getFortuneTypes();
        UI.renderFortuneTypes(fortuneTypes);
        
        // 更新统计显示
        UI.updateStats();
        
        // 🟢 P2: 显示新手引导
        setTimeout(() => UI.showGuide(), 500);
        
        // 🟡 P1: 加载每日运势
        UI.loadDailyFortune();
    }

    document.addEventListener('DOMContentLoaded', init);

})();