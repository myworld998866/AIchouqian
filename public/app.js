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
        userData: {
            freeDraws: 3,
            aiUses: 1,
            totalDraws: 0,
            isNewUser: true,
            dailyChecked: false,
            lastVisitDate: null,
            drawHistory: []
        },
        dailyFortune: null,
        dailyRating: null
    };

    // ========================================
    // 常量
    // ========================================
    const STORAGE_KEY = 'ai_lingqian_data';
    const AD_DURATION = 5000;
    const TOAST_DURATION = 2000;
    const DRAW_DELAY_MIN = 1000;
    const DRAW_DELAY_MAX = 3000;

    // ========================================
    // 本地存储
    // ========================================
    const Storage = {
        load() {
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                if (data) {
                    const parsed = JSON.parse(data);
                    AppState.userData = { ...AppState.userData, ...parsed };
                    this.checkDailyReset();
                }
            } catch (e) {
                console.error('加载数据失败:', e);
            }
        },

        save() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.userData));
            } catch (e) {
                console.error('保存数据失败:', e);
            }
        },

        checkDailyReset() {
            const lastDate = AppState.userData.lastVisitDate;
            const today = new Date().toDateString();
            if (lastDate !== today) {
                AppState.userData.freeDraws = 3;
                AppState.userData.aiUses = 1;
                AppState.userData.dailyChecked = false;
                AppState.userData.lastVisitDate = today;
                this.save();
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
        },

        resetNewUser() {
            AppState.userData.isNewUser = false;
            this.save();
        },

        setDailyChecked() {
            AppState.userData.dailyChecked = true;
            this.save();
        }
    };

    // ========================================
    // Telegram WebApp
    // ========================================
    const tg = window.Telegram?.WebApp;

    function initTelegram() {
        if (tg) {
            tg.ready();
            tg.expand();
            tg.enableClosingConfirmation();

            const hideSplash = () => {
                document.querySelectorAll('[class*="splash"], [id*="splash"]').forEach(el => {
                    el.style.cssText = 'display: none !important; visibility: hidden !important;';
                });
            };
            
            hideSplash();
            setTimeout(hideSplash, 100);
            setTimeout(hideSplash, 300);
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
                if (!response.ok) throw new Error('网络错误');
                return await response.json();
            } catch (error) {
                console.error('获取签种失败:', error);
                return [];
            }
        },

        async drawFortune(type) {
            try {
                const response = await fetch(`${API_BASE}/api/draw/${encodeURIComponent(type)}`);
                if (!response.ok) throw new Error('抽签失败');
                return await response.json();
            } catch (error) {
                console.error('抽签失败:', error);
                return null;
            }
        },

        async getDailyFortune(userId) {
            try {
                const response = await fetch(`${API_BASE}/api/daily/${encodeURIComponent(userId)}`);
                if (!response.ok) throw new Error('获取运势失败');
                return await response.json();
            } catch (error) {
                console.error('获取每日运势失败:', error);
                return null;
            }
        },

        async getAIInterpretation(fortune, userQuestion = '') {
            try {
                const response = await fetch(`${API_BASE}/api/ai-interpret`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fortune, userQuestion })
                });
                if (!response.ok) throw new Error('AI解签失败');
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
            if (overlay) {
                const textEl = overlay.querySelector('p');
                if (textEl) textEl.textContent = text;
                overlay.classList.add('active');
            }
        },

        hideLoading() {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
        },

        showToast(message, duration = TOAST_DURATION) {
            const toast = document.getElementById('toast');
            if (!toast) return;
            
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
            const targetScreen = document.getElementById(screenId);
            if (targetScreen) {
                targetScreen.classList.add('active');
            }
        },

        updateStats() {
            const freeDrawsEl = document.getElementById('free-draws');
            const aiUsesEl = document.getElementById('ai-uses');
            
            if (freeDrawsEl) freeDrawsEl.textContent = AppState.userData.freeDraws;
            if (aiUsesEl) aiUsesEl.textContent = AppState.userData.aiUses;
        },

        renderFortuneTypes(types) {
            const grid = document.getElementById('fortune-grid');
            if (!grid) return;
            
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
            
            if (AppState.userData.freeDraws <= 0) {
                this.showScreen('ad-screen');
                this.startAdTimer();
                return;
            }
            
            this.showScreen('drawing-screen');
            const prayerText = document.querySelector('.prayer-text');
            if (prayerText) {
                prayerText.textContent = `请诚心默念${type.name}，求问心中疑惑`;
            }
        },

        async performDraw() {
            if (AppState.isDrawing) return;
            if (!AppState.currentFortuneType) {
                this.showToast('请先选择签种');
                return;
            }
            
            const drawBtn = document.getElementById('draw-btn');
            const drawingContainer = document.querySelector('.drawing-container');
            
            if (!drawBtn || !drawingContainer) return;
            
            AppState.isDrawing = true;
            drawBtn.disabled = true;
            
            // 摇晃动画
            drawingContainer.classList.add('shaking');
            
            // 随机延迟
            const delay = DRAW_DELAY_MIN + Math.random() * (DRAW_DELAY_MAX - DRAW_DELAY_MIN);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            drawingContainer.classList.remove('shaking');
            this.showLoading('抽取中...');
            
            try {
                const result = await API.drawFortune(AppState.currentFortuneType.id);
                
                this.hideLoading();

                if (result && result.success && result.fortune) {
                    AppState.currentFortune = result.fortune;
                    if (Storage.useFreeDraw()) {
                        this.updateStats();
                    }
                    this.showFortuneResult(result);
                } else {
                    this.showToast('抽签出了点问题，请重试');
                    drawBtn.disabled = false;
                    AppState.isDrawing = false;
                }
            } catch (error) {
                this.hideLoading();
                this.showToast('网络错误，请检查网络连接');
                drawBtn.disabled = false;
                AppState.isDrawing = false;
            }
        },

        showFortuneResult(result) {
            const fortune = result.fortune;
            const levelBadge = document.getElementById('fortune-level');
            const titleEl = document.getElementById('fortune-title');
            const poemEl = document.getElementById('fortune-poem');
            
            if (!levelBadge || !titleEl || !poemEl) return;
            
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
            if (document.getElementById('draw-btn')) {
                document.getElementById('draw-btn').disabled = false;
            }
        },

        showInterpretation() {
            const fortune = AppState.currentFortune;
            if (!fortune) return;
            
            const elements = {
                'inter-poem': fortune.poem,
                'inter-shi-yue': fortune.shiYue || '（无）',
                'inter-xian-ji': fortune.xianJi || '（无）',
                'inter-dian-gu': fortune.dianGu || '（无）',
                'inter-interpretation': fortune.interpretation
            };
            
            Object.entries(elements).forEach(([id, text]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
            });
            
            // 如果有预生成的AI解读，显示它
            const aiBox = document.getElementById('inter-ai');
            const aiBtn = document.getElementById('ai-interpret-btn');
            
            if (fortune.aiInterpretation && aiBox) {
                aiBox.textContent = fortune.aiInterpretation;
                if (aiBtn) aiBtn.style.display = 'none';
            } else if (aiBtn && !fortune.aiInterpretation) {
                aiBtn.style.display = 'block';
            }
            
            this.showScreen('interpretation-screen');
        },

        async requestAIInterpretation() {
            if (!AppState.currentFortune) {
                this.showToast('请先抽签');
                return;
            }
            
            if (!Storage.useAI()) {
                this.showToast('AI解签次数已用完，请明天再来或观看广告');
                return;
            }
            
            this.updateStats();
            this.showLoading('AI解读中...');
            
            try {
                const result = await API.getAIInterpretation(AppState.currentFortune, '');
                this.hideLoading();
                
                if (result && result.success && result.interpretation) {
                    const aiBox = document.getElementById('inter-ai');
                    const aiBtn = document.getElementById('ai-interpret-btn');
                    
                    if (aiBox) aiBox.textContent = result.interpretation;
                    if (aiBtn) aiBtn.style.display = 'none';
                    
                    this.showToast('AI解读完成！');
                } else {
                    this.showToast('AI解签服务暂不可用');
                }
            } catch (error) {
                this.hideLoading();
                this.showToast('AI解签失败，请重试');
            }
        },

        reshuffle() {
            AppState.currentFortune = null;
            this.showScreen('drawing-screen');
            const drawBtn = document.getElementById('draw-btn');
            if (drawBtn) drawBtn.disabled = false;
        },

        goHome() {
            AppState.currentFortune = null;
            AppState.currentFortuneType = null;
            AppState.isDrawing = false;
            this.showScreen('selection-screen');
            const drawBtn = document.getElementById('draw-btn');
            if (drawBtn) drawBtn.disabled = false;
        },

        shareResult() {
            const fortune = AppState.currentFortune;
            if (!fortune) return;
            
            const shareText = `🎋 AI灵签 2.0\n\n${fortune.title}\n${fortune.level}\n\n签诗：\n${fortune.poem}\n\n解签：\n${fortune.interpretation}\n\n👉 点击体验GPT-4智能解签`;
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(shareText)
                    .then(() => this.showToast('已复制到剪贴板'))
                    .catch(() => this.showToast('分享功能暂不可用'));
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
        },

        startAdTimer() {
            let seconds = 5;
            const timerEl = document.getElementById('ad-timer');
            const watchBtn = document.getElementById('watch-ad');
            
            if (!timerEl || !watchBtn) return;
            
            watchBtn.disabled = true;
            
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
            this.showToast('广告播放中...');
            
            // 模拟广告展示（实际项目中调用广告SDK）
            setTimeout(() => {
                AppState.userData.freeDraws += 1;
                Storage.save();
                this.updateStats();
                this.showToast('获得1次免费抽签！');
                this.showScreen('drawing-screen');
            }, AD_DURATION);
        },

        showGuide() {
            if (AppState.userData.isNewUser) {
                const guideOverlay = document.getElementById('guide-overlay');
                if (guideOverlay) {
                    guideOverlay.classList.remove('hidden');
                }
            }
        },

        nextGuideStep() {
            const currentStep = document.querySelector('.guide-step:not(.hidden)');
            if (!currentStep) return;
            
            const nextStepNum = parseInt(currentStep.dataset.step) + 1;
            
            if (nextStepNum <= 3) {
                currentStep.classList.add('hidden');
                const nextStep = document.querySelector(`.guide-step[data-step="${nextStepNum}"]`);
                if (nextStep) nextStep.classList.remove('hidden');
            } else {
                this.closeGuide();
            }
        },

        closeGuide() {
            const guideOverlay = document.getElementById('guide-overlay');
            if (guideOverlay) guideOverlay.classList.add('hidden');
            
            AppState.userData.isNewUser = false;
            Storage.resetNewUser();
            
            // 显示新手礼包
            this.showGiftModal();
        },

        showGiftModal() {
            const giftModal = document.getElementById('gift-modal');
            if (giftModal) giftModal.classList.remove('hidden');
        },

        claimGift() {
            AppState.userData.freeDraws = 3;
            AppState.userData.aiUses = 1;
            AppState.userData.isNewUser = false;
            Storage.save();
            this.updateStats();
            
            const giftModal = document.getElementById('gift-modal');
            if (giftModal) giftModal.classList.add('hidden');
            
            this.showToast('礼包已领取！');
        },

        closeGift() {
            const giftModal = document.getElementById('gift-modal');
            if (giftModal) giftModal.classList.add('hidden');
        },

        async loadDailyFortune() {
            if (AppState.userData.dailyChecked) return;
            
            const userId = tg?.initDataUnsafe?.user?.id?.toString() || 'anonymous';
            
            try {
                const result = await API.getDailyFortune(userId);
                
                if (result && result.success) {
                    AppState.dailyFortune = result.fortune;
                    AppState.dailyRating = result.rating;
                    
                    const dailyCard = document.getElementById('daily-card');
                    const dailyDate = document.getElementById('daily-date');
                    const dailyRating = document.getElementById('daily-rating');
                    const dailyTip = document.getElementById('daily-tip');
                    
                    if (dailyCard && dailyDate && dailyRating && dailyTip) {
                        const today = new Date();
                        dailyDate.textContent = `${today.getMonth() + 1}月${today.getDate()}日`;
                        dailyRating.textContent = result.rating;
                        dailyRating.className = 'daily-rating ' + (result.rating.includes('吉') ? 'good' : 'normal');
                        dailyTip.textContent = (result.tips || []).join(' · ') || '';
                        
                        dailyCard.classList.remove('hidden');
                    }
                    
                    Storage.setDailyChecked();
                }
            } catch (error) {
                console.error('加载每日运势失败:', error);
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
        
        // 广告相关
        document.getElementById('watch-ad')?.addEventListener('click', () => UI.showAd());
        document.getElementById('skip-ad')?.addEventListener('click', () => {
            if (AppState.userData.freeDraws > 0) {
                UI.showScreen('drawing-screen');
            } else {
                UI.showToast('没有可用积分，请观看广告');
            }
        });
        
        // 新手引导
        document.getElementById('guide-next')?.addEventListener('click', () => UI.nextGuideStep());
        document.getElementById('guide-skip')?.addEventListener('click', () => UI.closeGuide());
        
        // 新手礼包
        document.getElementById('claim-gift')?.addEventListener('click', () => UI.claimGift());
        document.getElementById('close-gift')?.addEventListener('click', () => UI.closeGift());
        
        // Telegram返回按钮
        if (tg?.onEvent) {
            tg.onEvent('backButtonClicked', () => {
                const activeScreen = document.querySelector('.screen.active');
                if (!activeScreen) return;
                
                switch (activeScreen.id) {
                    case 'selection-screen':
                        tg.close();
                        break;
                    case 'drawing-screen':
                        UI.goHome();
                        break;
                    case 'result-screen':
                        UI.reshuffle();
                        break;
                    case 'interpretation-screen':
                        UI.showScreen('result-screen');
                        break;
                    case 'ad-screen':
                        UI.goHome();
                        break;
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
        if (fortuneTypes.length > 0) {
            UI.renderFortuneTypes(fortuneTypes);
        }
        
        UI.updateStats();
        
        // 新手引导
        setTimeout(() => UI.showGuide(), 800);
        
        // 每日运势
        UI.loadDailyFortune();
    }

    // DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();