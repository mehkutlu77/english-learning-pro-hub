/* ENGLISH LEARNING PRO HUB - APP SCRIPT */
/* (index.html içindeki <script> bloğunun TAMAMI buraya taşındı) */
/* --- ENGLISH PRO HUB MASTER SCRIPT (V35.0 STABLE) --- */

/* 1. VERİTABANI VE DEĞİŞKENLER */
function safeLoad(key, defaultVal) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultVal;
    } catch (e) {
        console.error("Veri yükleme hatası:", key, e);
        return defaultVal;
    }
}

let contentData = safeLoad('englishWorkbookData', []);
let userStats = safeLoad('userStats', { 
    booksRead:0, pagesTurned:0, quizzesTaken:0, wordsAdded:0, notesTaken:0, totalCorrect:0, totalWrong:0,
    dailyActivity: {} 
});
let userUnknownWords = safeLoad('userUnknownWords', []);
let userKnownVocabulary = safeLoad('userKnownVocabulary', []);
let userActivityLog = safeLoad('userActivityLog', []);
let userFavorites = safeLoad('userFavorites', []);

let globalLexicon = {}; 
let recognition; 
let isListening = false; 
let currentTargetId = "";
let currentLevelFolder = null; 

// GAME STATE
let wmState = 'setup';
let wmType = 'vocab';
let wmMode = 'learn';
let gameQueue = []; 
let gameIndex = 0;
let wmSessionCount = 0;
let fcSessionCount = 0;

// TIMER VARIABLES
let readingTimerInterval;
let activeReadingSeconds = 0; 
let currentQuizTime = 0;
let externalAppStartTime = parseInt(localStorage.getItem('tempExternalTimer')) || 0; 
let externalTimerInterval; 
let currentPenStyle = { color: '#2c3e50', size: '20' }; 
let isTogglingContext = false;
let ttsObj = null;

// PAGE STATE
let currentCategory='reading'; 
let currentBook=null; 
let pageIndex=0; 
let isTrMode=false; 
let quizAnswers={};

/* 2. BAŞLATMA VE GLOBAL EVENTLER */
window.onload = function() { 
    buildGlobalDictionary(); 
    switchCategory('reading'); 
    setupVoice(); 
    
    if(externalAppStartTime > 0) {
        document.getElementById('externalAppView').style.display = 'flex';
        startExternalTimerUI();
    }
};

// TOOLTIP EVENT LISTENER
document.addEventListener('mouseover', function(e) {
    if(e.target.classList.contains('interactive-word')) {
        let m = e.target.getAttribute('data-meaning');
        if(m && m !== 'null' && m !== 'undefined' && m !== '') {
            let t = document.getElementById('wordTooltip');
            t.innerHTML = m;
            t.style.display = 'block';
            t.style.left = (e.pageX + 10) + 'px';
            t.style.top = (e.pageY + 15) + 'px';
        }
    }
});

document.addEventListener('mouseout', function(e) {
    if(e.target.classList.contains('interactive-word')) {
        document.getElementById('wordTooltip').style.display = 'none';
    }
});

// KELİME TIKLAMA (KAYDETME/SİLME)
document.addEventListener('click', function(e) {
    if(e.target.classList.contains('interactive-word')) {
        let word = e.target.innerText.replace(/[^a-zA-Z0-9'çÇğĞıİöÖşŞüÜ]/g, '');
        let meaning = e.target.getAttribute('data-meaning');
        toggleUnknown(e.target, word, meaning);
    }
});

function trackStat(key, val=1) { 
    userStats[key]=(userStats[key]||0)+val; 
    localStorage.setItem('userStats',JSON.stringify(userStats)); 
}

function showToast(msg, err=false) { 
    const t=document.getElementById('toast'); 
    if(t) {
        t.textContent=msg; 
        t.className=err?'toast error':'toast'; 
        t.style.display='block'; 
        setTimeout(()=>t.style.display='none',3000); 
    }
}

/* 3. LOGLAMA */
function logActivity(type, title, detail, durationSeconds = 0, points = 0) {
    const date = new Date().toLocaleDateString('tr-TR');
    userActivityLog.push({ 
        date, type, title, detail, 
        timestamp: Date.now(), 
        duration: durationSeconds, 
        points: points 
    });
    localStorage.setItem('userActivityLog', JSON.stringify(userActivityLog));
}

function calculateDetailedScore(dateStr) {
    const logs = userActivityLog.filter(l => l.date === dateStr);
    let report = { totalScore: 0, vocabCount: 0, questionCount: 0, timeMinutes: 0, gameMinutes: 0, pageCount: 0 };

    logs.forEach(l => {
        let pts = Number(l.points) || 0;
        if(pts > 0) report.totalScore += pts;
        
        if(l.duration) {
            if(l.type === 'external_game') report.gameMinutes += Math.floor(l.duration / 60);
            else report.timeMinutes += Math.floor(l.duration / 60);
        }
    });

    if(userStats.dailyActivity && userStats.dailyActivity[dateStr]) {
        report.pageCount = userStats.dailyActivity[dateStr].pages || 0;
    }
    report.totalScore += (report.pageCount * 10);
    return report;
}

function calculateLifetimeScore() {
    let total = 0;
    userActivityLog.forEach(l => {
        let pts = Number(l.points) || 0;
        if(pts > 0) total += pts;
    });
    let totalPages = 0;
    if(userStats.dailyActivity) {
        for(let date in userStats.dailyActivity) {
            totalPages += (userStats.dailyActivity[date].pages || 0);
        }
    }
    total += (totalPages * 10);
    return total;
}

/* ANALYTICS */
function openAnalytics() {
    document.getElementById('libraryGrid').style.display='none'; 
    document.getElementById('libraryHeader').style.display='none'; 
    document.getElementById('openBookView').style.display='none';
    document.getElementById('analyticsView').style.display='block';
    
    const today = new Date(); const todayStr = today.toLocaleDateString('tr-TR');
    const reportToday = calculateDetailedScore(todayStr);
    const lifetimeScore = calculateLifetimeScore();
    const currentLevel = Math.floor(lifetimeScore / 1000) + 1;
    const progressPercent = (lifetimeScore % 1000) / 10;

    let scoreboardHtml = `
        <div class="level-dashboard">
            <div class="total-score-card">
                <div class="level-label">⭐ TOPLAM PUAN (SEVİYE ${currentLevel})</div>
                <div class="total-points">${lifetimeScore}</div>
                <div class="level-progress-container">
                    <div class="level-bar-bg"><div class="level-bar-fill" style="width:${progressPercent}%"></div></div>
                    <div class="level-text"><span>Sonraki Seviye: ${currentLevel + 1}</span><span>%${Math.round(progressPercent)}</span></div>
                </div>
            </div>
            <div class="daily-score-card">
                <div class="daily-title">BUGÜNÜN KAZANCI</div>
                <div class="daily-val">+${reportToday.totalScore}</div>
                <div class="daily-time">${Math.floor((reportToday.timeMinutes + reportToday.gameMinutes)/60)}sa ${(reportToday.timeMinutes + reportToday.gameMinutes)%60}dk</div>
            </div>
        </div>
        <div style="text-align:center; margin-bottom:20px;">
             <button class="score-rules-toggle" style="position:static;" onclick="toggleScoreRules()">❓ Puanlama Sistemi</button>
        </div>
        <div id="scoreRules" class="score-rules-box">
             <h4 style="margin-top:0; color:var(--primary);">📊 Puanlama Sistemi</h4>
            <table class="rules-table"><thead><tr><th>Aktivite</th><th>Puan Değeri</th></tr></thead><tbody><tr><td><span class="rule-icon">📄</span> Sayfa Çevirme</td><td><strong>10 Puan</strong> / sayfa</td></tr><tr><td><span class="rule-icon">✅</span> Soru Çözümü</td><td><strong>15 Puan</strong> / doğru</td></tr><tr><td><span class="rule-icon">🧠</span> Kelime Ezberi</td><td><strong>10 Puan</strong> / kelime</td></tr><tr><td><span class="rule-icon">🚀</span> Oyunlar & Pratik</td><td><strong>20 Puan</strong> / dakika</td></tr><tr><td><span class="rule-icon">📖</span> Okuma Tamamlama</td><td><strong>10 Puan</strong></td></tr></tbody></table>
        </div>
    `;

    let weeklyHtml = `<h4 style="margin:20px 0 10px 0; color:var(--primary); opacity:0.7;">📅 Haftalık Performans</h4><div class="weekly-score-container">`;
    const daysShort = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    for (let i = 6; i >= 0; i--) {
        let d = new Date(); d.setDate(d.getDate() - i);
        let dStr = d.toLocaleDateString('tr-TR');
        let dName = daysShort[d.getDay()];
        let dScore = calculateDetailedScore(dStr).totalScore;
        let activeClass = (i === 0) ? 'today' : '';
        weeklyHtml += `<div class="weekly-day-box ${activeClass}"><div class="w-day-name">${dName}</div><div class="w-day-score">${dScore}</div></div>`;
    }
    weeklyHtml += `</div>`;

    let monthlyHtml = `<div class="monthly-chart-container"><div style="font-weight:700; color:var(--primary);">📅 Aylık Aktivite Yoğunluğu (Son 30 Gün)</div><div class="chart-bars">`;
    let maxMonthScore = 1;
    let monthData = [];
    for(let i=29; i>=0; i--){
        let d = new Date(); d.setDate(d.getDate() - i);
        let dStr = d.toLocaleDateString('tr-TR');
        let s = calculateDetailedScore(dStr).totalScore;
        if(s > maxMonthScore) maxMonthScore = s;
        monthData.push({date: dStr, score: s});
    }
    monthData.forEach(day => {
        let h = (day.score / maxMonthScore) * 100;
        if(h < 5 && day.score > 0) h = 5; 
        monthlyHtml += `<div class="chart-bar" style="height:${h}%" data-date="${day.date.split('.')[0]}" data-score="${day.score}"></div>`;
    });
    monthlyHtml += `</div></div>`;

    const rTot = contentData.filter(i=>i.category==='reading').length; 
    const rComp = contentData.filter(i=>i.category==='reading' && i.completed).length;
    const qTot = contentData.filter(i=>i.category==='question').length; 
    const qComp = contentData.filter(i=>i.category==='question' && i.completed).length;
    const gTot = contentData.filter(i=>i.category==='grammar').length; 
    const gComp = contentData.filter(i=>i.category==='grammar' && i.completed).length;

    let activityInnerHtml = "";
    const sortedLogs = [...userActivityLog].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    const groupedLogs = {};
    sortedLogs.forEach(log => { if (!groupedLogs[log.date]) groupedLogs[log.date] = []; groupedLogs[log.date].push(log); });

    if (Object.keys(groupedLogs).length === 0) {
        activityInnerHtml += `<div style="text-align:center; color:#999; padding:20px;">Kayıt yok.</div>`;
    } else {
        for (const date in groupedLogs) {
            activityInnerHtml += `<div class="activity-date-header" style="background:#f1f2f6; margin-top:10px;">📅 ${date}</div>`;
            groupedLogs[date].forEach(log => {
                 let icon = '🔹'; 
                if(log.type === 'reading') icon = '📖'; 
                if(log.type === 'quiz') icon = '❓'; 
                if(log.type === 'vocab') icon = '🧠'; 
                if(log.type === 'grammar') icon = '📘'; 
                if(log.type === 'external_game') icon = '🚀';
                let durText = log.duration ? ` <span class="log-duration">(${Math.floor(log.duration/60)}dk ${log.duration%60}sn)</span>` : "";
                let pts = log.points || 0;
                let pointBadge = pts ? `<span class="log-point-badge">+${pts} Puan</span>` : "";
                activityInnerHtml += `<div class="activity-item"><div><span class="activity-type-icon">${icon}</span> ${log.title} <span class="log-detail-text">${log.detail || ''}</span></div><div class="log-meta">${durText} ${pointBadge}</div></div>`;
            });
        }
    }
    
    let activitySection = `
        <div class="accordion-box">
            <div class="accordion-header" onclick="toggleAccordion('actLogs')">
                <span>📋 Günlük Hareket Dökümü</span>
                <span class="arrow-icon">▼</span>
            </div>
            <div id="actLogs" class="accordion-content">
                <div style="padding:15px; max-height:400px; overflow-y:auto;">${activityInnerHtml}</div>
            </div>
        </div>
    `;

    const createLevelTable = (title, keyword) => {
        let html = `<div style="flex:1;"><div class="section-title">${title}</div><table class="vocab-stats-table"><thead><tr><th>Seviye</th><th>Toplam</th><th>Bildiğin</th><th>Durum</th></tr></thead><tbody>`;
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        
        levels.forEach(lvl => {
            let lvlWords = [];
            const relevantBooks = contentData.filter(b => {
                if (b.category !== 'vocabulary') return false;
                const titleUpper = b.title.toUpperCase();
                if (!titleUpper.includes(lvl)) return false;
                if (keyword === 'Idioms') return titleUpper.includes('IDIOMS');
                if (keyword === 'Phrases') return titleUpper.includes('PHRASES');
                return !titleUpper.includes('IDIOMS') && !titleUpper.includes('PHRASES');
            });

            relevantBooks.forEach(b => { 
                if(b.words) lvlWords = lvlWords.concat(b.words.map(w => w.en)); 
            });
            
            lvlWords = [...new Set(lvlWords)];
            const total = lvlWords.length;

            if(total > 0) {
                const knownCount = lvlWords.filter(w => {
                    return userKnownVocabulary.some(known => known.toLowerCase() === w.toLowerCase());
                }).length;

                const percent = Math.round((knownCount / total) * 100);
                html += `<tr><td><strong>${lvl}</strong></td><td>${total}</td><td style="color:#27ae60">${knownCount}</td><td><div class="progress-track"><div class="progress-fill-know" style="width:${percent}%"></div></div></td></tr>`;
            } else { 
                html += `<tr><td>${lvl}</td><td colspan="3" style="color:#ccc;">Veri Yok</td></tr>`; 
            }
        });
        return html + `</tbody></table></div>`;
    };

    const v = document.getElementById('analyticsView');
    v.innerHTML = `
        <div class="analytics-header"><h2>📈 Performans Merkezi</h2></div>
        ${scoreboardHtml}
        ${weeklyHtml}
        <div class="stats-grid">
            <div class="stat-card" style="border-bottom-color:#e67e22;"><div class="stat-number" style="color:#e67e22">${rComp}/${rTot}</div><div class="stat-label">Okunan Kitap</div></div>
            <div class="stat-card" style="border-bottom-color:#27ae60;"><div class="stat-number" style="color:#27ae60">${qComp}/${qTot}</div><div class="stat-label">Bitirilen Test</div></div>
            <div class="stat-card" style="border-bottom-color:#f1c40f;"><div class="stat-number" style="color:#f1c40f">${gComp}/${gTot}</div><div class="stat-label">Tamamlanan Gramer</div></div>
            <div class="stat-card" style="border-bottom-color:#3498db;"><div class="stat-number" style="color:#3498db">${userKnownVocabulary.length}</div><div class="stat-label">Ezberlenen Kelime</div></div>
        </div>
        ${activitySection}
        <div class="analytics-grid-row" style="margin-top:30px;">
            ${createLevelTable('📗 Kelime Analizi', 'Vocab')}
            ${createLevelTable('🔮 Deyim Analizi', 'Idioms')}
            ${createLevelTable('💬 Kalıp Analizi', 'Phrases')}
        </div>
    `;
}

function toggleAccordion(id) {
    const el = document.getElementById(id);
    if(el.classList.contains('open')) el.classList.remove('open');
    else el.classList.add('open');
}

function toggleScoreRules() {
    const box = document.getElementById('scoreRules');
    if(box.style.display === 'block') box.style.display = 'none';
    else box.style.display = 'block';
}

function speakWord(text) {
    if('speechSynthesis' in window){
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
    }
}

function toggleFavorite(en, tr) {
    const idx = userFavorites.findIndex(f => f.en === en);
    if(idx > -1) { 
        userFavorites.splice(idx, 1); 
        showToast("Favorilerden çıkarıldı");
    } else { 
        userFavorites.push({en, tr}); 
        showToast("Favorilere eklendi"); 
    }
    localStorage.setItem('userFavorites', JSON.stringify(userFavorites));
    if(currentCategory === 'wordmaster' || currentCategory === 'favorites_flashcard' || currentCategory === 'unknowns_flashcard') {
        renderSpread();
    }
}
function isFavorite(en) { return userFavorites.some(f => f.en === en); }

/* 4. HARİCİ OYUNLAR */
function openExternalGame(url, title) {
    document.getElementById('libraryGrid').style.display = 'none'; 
    document.getElementById('libraryHeader').style.display = 'none'; 
    document.getElementById('analyticsView').style.display = 'none'; 
    document.getElementById('openBookView').style.display = 'none';
    
    stopReadingTimer();

    const view = document.getElementById('externalAppView'); 
    const frame = document.getElementById('appFrame'); 
    const titleEl = document.getElementById('appTitle');
    
    if(titleEl) titleEl.innerText = title; 
    if(frame) frame.src = url; 
    view.style.display = 'flex';
    
    if (externalAppStartTime === 0) {
        externalAppStartTime = Date.now();
        localStorage.setItem('tempExternalTimer', externalAppStartTime);
    }
    startExternalTimerUI();
}

function startExternalTimerUI() {
    clearInterval(externalTimerInterval);
    updateExternalTimerDisplay();
    externalTimerInterval = setInterval(updateExternalTimerDisplay, 1000);
}

function updateExternalTimerDisplay() {
    if(!externalAppStartTime) return;
    const diff = Math.floor((Date.now() - externalAppStartTime) / 1000);
    const m = Math.floor(diff / 60).toString().padStart(2,'0');
    const s = (diff % 60).toString().padStart(2,'0');
    const el = document.getElementById('externalTimerDisplay');
    if(el) el.innerText = `${m}:${s}`;
}

function finishExternalGame() {
    closeExternalApp();
}

function closeExternalApp() { 
    clearInterval(externalTimerInterval);

    let savedStartTime = parseInt(localStorage.getItem('tempExternalTimer'));
    if(savedStartTime > 0) {
        const duration = Math.round((Date.now() - savedStartTime) / 1000);
        const titleEl = document.getElementById('appTitle');
        const title = titleEl ? titleEl.innerText : "External App";

        if(duration > 5) { 
            let points = Math.round((duration / 60) * 20); 
            if(points < 1 && duration > 30) points = 1; 

            logActivity('external_game', title, 'Çalışma Süresi', duration, points);
            showToast(`${title} Kaydedildi: ${Math.floor(duration/60)}dk ${duration%60}sn (+${points} Puan)`);
        }
    }

    externalAppStartTime = 0;
    localStorage.removeItem('tempExternalTimer');
    const timerDisplay = document.getElementById('externalTimerDisplay');
    if(timerDisplay) timerDisplay.innerText = "00:00";

    const view = document.getElementById('externalAppView');
    const frame = document.getElementById('appFrame');
    if(view) view.style.display = 'none'; 
    if(frame) frame.src = "";
    
    switchCategory('reading'); 
    renderLibrary(); 
}

/* 5. WORD MASTER */
function openWordMasterApp() {
    closeBook();
    currentCategory = 'wordmaster';
    wmState = 'setup';
    wmSessionCount = 0;
    document.getElementById('libraryGrid').style.display='none';
    document.getElementById('libraryHeader').style.display='none';
    document.getElementById('openBookView').style.display='flex';
    document.getElementById('bookHeaderTitle').innerText = "🎮 Word Master";
    
    ['myNoteTitleDisplay','langToggle','addPageBtn','flashcardBtn','ttsControls','ttsSpeed','liveStats','notebookTools'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display='none';
    });
    
    document.querySelector('.nav-arrow.prev').style.display='none'; 
    document.querySelector('.nav-arrow.next').style.display='none';
    renderSpread();
}

function startWordGame(level) {
    let candidates = [];
    const books = contentData.filter(b => {
        if(b.category !== 'vocabulary') return false;
        if(!b.title.includes(level)) return false;
        if(wmType === 'idioms') return b.title.includes('Idioms');
        else if(wmType === 'phrasals') return b.title.includes('Phrases');
        else return !b.title.includes('Idioms') && !b.title.includes('Phrases');
    });
    books.forEach(b => { candidates = candidates.concat(b.words); });
    
    if(candidates.length === 0) return alert("Bu seviyede kelime bulunamadı!");
    
    if (wmMode === 'learn') {
        gameQueue = candidates.filter(w => !userKnownVocabulary.includes(w.en));
        if(gameQueue.length === 0) return alert("Hepsini biliyorsun! Tekrar modunu dene.");
    } else {
        gameQueue = candidates.filter(w => userKnownVocabulary.includes(w.en));
        if(gameQueue.length === 0) return alert("Henüz bildiğin kelime yok.");
    }
    
    gameQueue = gameQueue.sort(() => Math.random() - 0.5); 
    gameIndex = 0;
    wmState = 'playing';
    renderSpread();
}

function handleGameResult(isKnown) {
    wmSessionCount++;
    const w = gameQueue[gameIndex];
    if(isKnown) {
        if(!userKnownVocabulary.includes(w.en)) { 
            userKnownVocabulary.push(w.en); 
            localStorage.setItem('userKnownVocabulary', JSON.stringify(userKnownVocabulary)); 
        }
        const uIdx = userUnknownWords.findIndex(u => u.en === w.en);
        if(uIdx > -1) { 
            userUnknownWords.splice(uIdx, 1); 
            localStorage.setItem('userUnknownWords', JSON.stringify(userUnknownWords)); 
        }
    } else {
        if(!isUnknown(w.en)) { 
            userUnknownWords.push({en: w.en, tr: w.tr}); 
            localStorage.setItem('userUnknownWords', JSON.stringify(userUnknownWords)); 
        }
        const kIdx = userKnownVocabulary.indexOf(w.en);
        if(kIdx > -1) { 
            userKnownVocabulary.splice(kIdx, 1); 
            localStorage.setItem('userKnownVocabulary', JSON.stringify(userKnownVocabulary)); 
            showToast("Unutulanlara eklendi", true);
        }
    }
    trackStat('wordsAdded', 0);
    gameIndex++; 
    if(gameIndex >= gameQueue.length) wmState = 'result';
    renderSpread();
}

function finishWordMasterSession() {
    let score = wmSessionCount;
    wmSessionCount = 0; 
    if (score > 0) {
        logActivity('vocab', 'Word Master', `${score} Kelime`, 0, score * 10);
        showToast(`${score} kelime işlendi!`);
    }
    wmState = 'setup';
    renderSpread();
}

function renderWordMasterGame(pL, pR) {
    if(wmState === 'setup') {
        pL.style.flex = "1"; pL.style.borderRight = "1px solid #f1f2f6"; pL.style.alignItems = "stretch"; pL.style.justifyContent = "flex-start";
        pR.style.display = "flex";
        pL.innerHTML = `
            <div class="wm-setup-title">1. Mod ve Tür</div>
            <div class="wm-mode-toggle">
                <div class="wm-mode-opt ${wmMode==='learn'?'active':''}" onclick="setWmMode('learn')">Öğren</div>
                <div class="wm-mode-opt ${wmMode==='review'?'active':''}" onclick="setWmMode('review')">Tekrar Et</div>
            </div>
            <button class="wm-type-btn ${wmType==='vocab'?'selected':''}" onclick="selectWmType('vocab')">📗 Kelime</button>
            <button class="wm-type-btn ${wmType==='idioms'?'selected':''}" onclick="selectWmType('idioms')">🔮 Deyim</button>
            <button class="wm-type-btn ${wmType==='phrasals'?'selected':''}" onclick="selectWmType('phrasals')">💬 Kalıp</button>
        `;
        pR.innerHTML = `
            <div class="wm-setup-title">2. Seviye Seç</div>
            <div class="wm-level-grid">
                ${['A1','A2','B1','B2','C1','C2'].map(l => `<button class="wm-level-btn" onclick="startWordGame('${l}')">${l}</button>`).join('')}
            </div>
        `;
    } 
    else if(wmState === 'playing') {
        const w = gameQueue[gameIndex];
        let favClass = isFavorite(w.en) ? 'active' : '';
        pL.style.flex = "2"; pL.style.borderRight = "none"; pL.style.alignItems = "center"; pL.style.justifyContent = "center";
        pR.style.display = "none";
        
        pL.innerHTML = `
            <div style="width:100%; max-width:500px; display:flex; flex-direction:column; align-items:center;">
                <div class="wm-count-display">${wmMode === 'review' ? 'Tekrar' : 'Öğrenme'} | Kalan: ${gameQueue.length - gameIndex}</div>
                <div class="wm-card-container" onclick="this.classList.toggle('wm-flipped')">
                    <div class="wm-flip-inner">
                        <div class="wm-card-front">
                            <div style="margin-bottom:15px;">${w.en}</div>
                            <div class="card-action-wrapper">
                                <span class="card-tool-btn btn-listen" onmousedown="event.stopPropagation(); speakWord('${w.en}')">🔊</span>
                                <span class="card-tool-btn btn-fav ${favClass}" onmousedown="event.stopPropagation(); toggleFavorite('${w.en}', '${w.tr}')">★</span>
                            </div>
                        </div>
                        <div class="wm-card-back">${w.tr}</div>
                    </div>
                </div>
                <div class="wm-controls">
                    <button class="wm-btn wm-btn-unknow" onmousedown="handleGameResult(false)" ontouchstart="handleGameResult(false); event.preventDefault();">❌ Bilmiyorum</button>
                    <button class="wm-btn wm-btn-know" onmousedown="handleGameResult(true)" ontouchstart="handleGameResult(true); event.preventDefault();">✅ Biliyorum</button>
                </div>
                <button onclick="finishWordMasterSession()" style="margin-top:20px; border:none; background:none; color:#95a5a6; cursor:pointer;">Bitir ve Kaydet</button>
            </div>
        `;
    }
    else if(wmState === 'result') {
        pL.style.flex = "2"; pL.style.alignItems = "center"; pL.style.justifyContent = "center"; pR.style.display = "none";
        pL.innerHTML = `<div style="text-align:center;"><h1>🎉 Bitti!</h1><button class="wm-btn" style="background:var(--primary);" onclick="finishWordMasterSession()">Menüye Dön</button></div>`;
    }
}
function selectWmType(type) { wmType = type; renderSpread(); }
function setWmMode(mode) { wmMode = mode; renderSpread(); }

/* 6. READING & PAGINATION (BUG FIX) */
function openBook(i) {
    stopReadingTimer();
    currentQuizTime = 0; 
    activeReadingSeconds = 0;
    
    // Index sıfırla
    pageIndex = 0; 
    
    if(currentCategory !== 'unknowns') trackStat('booksRead');
    currentBook=i; 
    isTrMode=false; 
    quizAnswers={};
    
    // GÖRÜNÜRLÜK AYARLARI (Önce ekranı aç, sonra hesapla)
    document.getElementById('libraryGrid').style.display='none'; 
    document.getElementById('libraryHeader').style.display='none'; 
    document.getElementById('openBookView').style.display='flex'; // ÖNCE BUNU AÇIYORUZ
    document.getElementById('bookHeaderTitle').innerText=i.title;
    
    // Araçları gizle/göster
    const toolIds = ['myNoteTitleDisplay','langToggle','addPageBtn','flashcardBtn','ttsControls','ttsSpeed','liveStats','notebookTools'];
    toolIds.forEach(id => { 
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    document.querySelector('.nav-arrow.prev').style.display='flex'; 
    document.querySelector('.nav-arrow.next').style.display='flex';
    
    if(currentCategory==='reading') { 
        document.getElementById('langToggle').style.display='block'; 
        document.getElementById('ttsControls').style.display='flex'; 
        document.getElementById('ttsSpeed').style.display='block';
        document.getElementById('liveStats').style.display='flex'; 
        const cleanText = i.enText ? i.enText.replace(/<[^>]*>/g, '') : "";
        const wCount = document.getElementById('liveWordCount');
        if(wCount) wCount.innerText = cleanText.trim().split(/\s+/).length;
        startReadingTimer(); 
    }
    else if(currentCategory==='grammar') {
        document.getElementById('notebookTools').style.display='flex'; 
        document.getElementById('liveStats').style.display='flex';
        startReadingTimer(); 
    }
    else if(currentCategory==='question') {
        document.getElementById('liveStats').style.display='flex';
        document.querySelector('.nav-arrow.prev').style.display='none'; 
        document.querySelector('.nav-arrow.next').style.display='none';
        startReadingTimer(); 
    }
    else if(currentCategory==='unknowns' || currentCategory==='favorites') {
        const fb = document.getElementById('flashcardBtn');
        if(fb) fb.style.display='block';
    }
    
    // DOM'un render edilmesi için minik bir gecikme ile sayfaları oluştur
    setTimeout(() => {
        renderSpread();
    }, 50);
}

function renderSpread() {
    if ('speechSynthesis' in window) speechSynthesis.cancel(); 
    const pL=document.getElementById('pageLeft'); 
    const pR=document.getElementById('pageRight'); 
    pL.innerHTML=""; pR.innerHTML="";
    
    pL.style.flex = "1"; pL.style.borderRight = "1px solid #f1f2f6"; pL.style.alignItems = "stretch"; pL.style.justifyContent = "flex-start";
    pR.style.display = "flex";

    if(currentCategory === 'wordmaster') { renderWordMasterGame(pL, pR); return; }
    if(currentCategory === 'unknowns_flashcard' || currentCategory === 'favorites_flashcard') { renderUnknownFlashcards(pL, pR); return; }
    if(currentCategory==='question'){ 
        pL.style.borderRight = "none"; pL.style.alignItems = "center"; pL.style.justifyContent = "center"; pR.style.display = "none";
        renderQuizSingleMode(pL); return; 
    }
    
    // GRAMMAR
    if(currentCategory==='grammar'){ 
        let completeBtn = !currentBook.completed ? 
            `<button onclick="markAsCompleted()" style="width:100%; margin-top:15px; padding:15px; background:#f1c40f; color:#fff; border:none; border-radius:15px; cursor:pointer; font-weight:bold;">✔ KONUYU TAMAMLA</button>` : 
            `<div style="margin-top:15px; text-align:center; color:#27ae60; font-weight:bold; border:1px solid #27ae60; padding:5px; border-radius:12px;">✔ TAMAMLANDI</div>`;
        
        pL.innerHTML=`<div class="content-text">${currentBook.content}</div>${completeBtn}`; 
        pR.innerHTML=`<div class="notebook-wrapper"><textarea id="t" class="notebook-paper" oninput="saveTopicNote(this.value)" placeholder="Notlarınız...">${currentBook.userNotes||""}</textarea></div>`; 
        applyStyleToElement(document.getElementById('t'));
        document.querySelector('.nav-arrow.prev').style.visibility='hidden'; 
        document.querySelector('.nav-arrow.next').style.visibility='hidden'; 
        return; 
    }

    // READING
    let pages=[];
    if(currentCategory==='vocabulary') pages=paginateVocab(currentBook.words, false);
    else if(currentCategory==='unknowns' || currentCategory==='favorites') pages=paginateVocab(currentBook.words, true); 
    else if(currentCategory==='reading') { 
        let txt = isTrMode ? (currentBook.trText || "Çeviri yok.") : currentBook.enText; 
        pages = paginateText(txt, true); 
    }

    if(pages.length === 0) pages = ["<p>İçerik yok.</p>"];
    if(pageIndex >= pages.length) pageIndex = pages.length > 0 ? pages.length - (pages.length % 2 === 0 ? 2 : 1) : 0;
    if(pageIndex < 0) pageIndex = 0;

    pL.innerHTML = pages[pageIndex] || "";
    pR.innerHTML = pages[pageIndex+1] || "";

    // TESTE GEÇİŞ BUTONU DÜZELTMESİ (ID KONTROLÜ)
    if(currentCategory === 'reading' && (pageIndex + 2) >= pages.length) {
        let finishBtn = !currentBook.completed ? 
            `<button onclick="markAsCompleted()" style="width:100%; margin-top:20px; padding:15px; background:var(--success); color:white; border:none; border-radius:50px; cursor:pointer; font-weight:bold;">✅ OKUMAYI TAMAMLA</button>` : 
            `<div style="margin-top:20px; text-align:center; color:var(--success); font-weight:bold; border:2px solid var(--success); padding:10px; border-radius:12px;">🎉 OKUMA TAMAMLANDI</div>`;
        
        // İsme göre eşleştirme (Boşlukları sil, küçük harf yap)
        const currentTitleClean = currentBook.title.trim().toLowerCase();
        const linkedQuiz = contentData.find(q => q.category === 'question' && q.title.trim().toLowerCase() === currentTitleClean);
        
        if (linkedQuiz) { 
            let qText = linkedQuiz.completed ? "↺ TESTİ TEKRAR ÇÖZ" : "🧠 İLGİLİ TESTİ ÇÖZ"; 
            let qColor = linkedQuiz.completed ? "#7f8c8d" : "#e67e22"; 
            // ID'yi tırnak içinde gönder
            finishBtn += `<div style="margin-top:15px; padding-top:15px; border-top:1px dashed #ccc;"><p style="text-align:center; color:#555; font-size:0.9em;">İlgili test mevcut:</p><button onclick="switchFromReadingToQuiz('${linkedQuiz.id}')" style="width:100%; padding:15px; background:${qColor}; color:white; border:none; border-radius:50px; cursor:pointer; font-weight:bold;">${qText}</button></div>`; 
        }
        
        if(pR.innerHTML.trim() === "") pR.innerHTML = `<div class="single-page" style="justify-content:center;">${finishBtn}</div>`;
        else pR.innerHTML += finishBtn;
    }
    
    updateNav(pages.length);
}

// GÜVENLİ SAYFALAMA VE DONMA ÖNLEMİ
/* --- GÜÇLENDİRİLMİŞ SAYFALAMA MOTORU (V35.1) --- */
function paginateText(html, makeInteractive) {
    // 1. İçeriği Hazırla
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Kelime Etkileşimi (Tıklanabilir yapma)
    if (makeInteractive) {
        let paragraphs = tempDiv.querySelectorAll('p, li, h1, h2, h3, h4');
        if(paragraphs.length === 0 && tempDiv.innerText.trim().length > 0) {
             // Eğer p tagi yoksa düz metni p içine al
             tempDiv.innerHTML = `<p>${tempDiv.innerHTML}</p>`;
             paragraphs = tempDiv.querySelectorAll('p');
        }
        
        paragraphs.forEach(p => {
            if(!p.innerText.trim()) return;
            // HTML yapısını bozmadan sadece metinleri işle
            p.innerHTML = p.innerText.split(' ').map(w => {
                let cl = w.replace(/[^a-zA-Z0-9'çÇğĞıİöÖşŞüÜ]/g, ''); 
                if (cl.length <= 1) return w;
                let m = getWordMeaning(cl);
                let savedClass = isUnknown(cl) ? 'saved' : '';
                // data-meaning null gelirse boş string yap
                return `<span class="interactive-word ${savedClass}" data-meaning="${m || ''}">${w}</span>`;
            }).join(' ');
            p.style.marginBottom = "15px"; 
            p.style.lineHeight = "1.8";
        });
    }

    // 2. Sayfa Boyutlarını Al (Hata Önleyici Fallback)
    // Eğer sayfa gizliyse genişlik 0 gelir, bunu önlemek için varsayılan değerler atıyoruz.
    let pL = document.getElementById('pageLeft');
    let contentWidth = (pL && pL.clientWidth > 50) ? pL.clientWidth : 500; // Varsayılan 500px
    let maxPageHeight = (window.innerHeight * 0.75) - 60; 
    if(maxPageHeight < 300) maxPageHeight = 500; // Çok küçük ekran koruması

    // 3. Ölçüm Kutusunu Oluştur
    let measureBox = document.createElement('div');
    measureBox.className = 'single-page';
    measureBox.style.position = 'fixed';
    measureBox.style.visibility = 'hidden';
    measureBox.style.width = contentWidth + "px";
    measureBox.style.padding = "50px 70px"; // CSS ile aynı olmalı
    document.body.appendChild(measureBox);

    let pages = [];
    let currentPageHTML = "";
    let allElements = Array.from(tempDiv.children); 

    // Eğer hiç child element yoksa (düz metin geldiyse)
    if(allElements.length === 0) {
        document.body.removeChild(measureBox);
        return [`<p>${tempDiv.innerHTML}</p>`]; 
    }

    try {
        allElements.forEach(el => {
            let elHTML = el.outerHTML;
            measureBox.innerHTML = currentPageHTML + elHTML;
            
            // Yükseklik taştı mı?
            if (measureBox.offsetHeight > maxPageHeight) {
                // Taştıysa, mevcut sayfayı kaydet
                if (currentPageHTML !== "") {
                    pages.push(currentPageHTML);
                    currentPageHTML = elHTML; // Yeni sayfaya taşan elementi koy
                    
                    // Eğer tek bir element (örn: çok uzun bir paragraf) tek başına sayfadan büyükse?
                    measureBox.innerHTML = currentPageHTML;
                    if(measureBox.offsetHeight > maxPageHeight) {
                        // Mecburen ekle, CSS scroll edecek
                        pages.push(currentPageHTML);
                        currentPageHTML = "";
                    }
                } else {
                    // Sayfa boşken bile sığmıyorsa (dev element)
                    pages.push(elHTML);
                }
            } else {
                // Taşmadıysa eklemeye devam et
                currentPageHTML += elHTML;
            }
        });

        if (currentPageHTML !== "") pages.push(currentPageHTML);

    } catch(err) {
        console.error("Pagination Error:", err);
        // Hata olursa tüm metni tek sayfada göster (Çökmemesi için)
        return [tempDiv.innerHTML];
    } finally {
        if(document.body.contains(measureBox)) document.body.removeChild(measureBox);
    }
    
    return pages.length > 0 ? pages : ["<p>İçerik yüklenemedi veya boş.</p>"];
}
function updateNav(len) { 
    const pNL = document.getElementById('pageNumL');
    const pNR = document.getElementById('pageNumR');
    if(pNL) pNL.innerText = pageIndex+1; 
    if(pNR) pNR.innerText = pageIndex+2; 
    
    const prev = document.querySelector('.nav-arrow.prev');
    const next = document.querySelector('.nav-arrow.next');
    
    if(prev) prev.style.visibility = (pageIndex<=0) ? 'hidden' : 'visible'; 
    if(next) next.style.visibility = (pageIndex + 2 >= len) ? 'hidden' : 'visible'; 
}

function turnPage(d){ 
    let newIndex = pageIndex + d;
    if(newIndex < 0) newIndex = 0;
    pageIndex = newIndex;

    if(d > 0) { 
        trackStat('pagesTurned'); 
        const today = new Date().toLocaleDateString('tr-TR');
        if(!userStats.dailyActivity) userStats.dailyActivity = {};
        if(!userStats.dailyActivity[today]) userStats.dailyActivity[today] = { pages: 0 };
        userStats.dailyActivity[today].pages += 1;
        localStorage.setItem('userStats', JSON.stringify(userStats));
    }
    renderSpread(); 
}

function toggleLang(){ 
    isTrMode = !isTrMode; 
    renderSpread(); 
}

function switchFromReadingToQuiz(quizId) {
    saveReadingProgress();
    let targetQuiz = contentData.find(x => x.id == quizId);
    
    if(targetQuiz) {
        currentCategory = 'question';
        closeBook(); 
        setTimeout(() => { 
            // Menü butonunu aktif yap
            document.querySelectorAll('.nav-btn').forEach(b=>{ 
                b.classList.remove('active'); 
                if(b.getAttribute('onclick') && b.getAttribute('onclick').includes('question')) b.classList.add('active'); 
            });
            openBook(targetQuiz); 
        }, 100);
    } else {
        alert("İlgili test verisi bulunamadı! (Başlıklar birebir aynı olmalı)");
    }
}

function markAsCompleted() { 
    if(!currentBook) return; 

    let durationText = activeReadingSeconds > 0 ? ` (${getFormattedTime(activeReadingSeconds)})` : "";
    let pts = 10;
    
    if(currentCategory === 'reading') {
        if(!currentBook.completed) showToast("Reading Tamamlandı: +10 Puan"); 
        trackStat('booksRead');
        logActivity('reading', currentBook.title, 'Okuma Tamamlandı' + durationText, activeReadingSeconds, pts);
    }
    else if(currentCategory === 'grammar') {
        if(!currentBook.completed) showToast("Gramer Tamamlandı: +10 Puan"); 
        logActivity('grammar', currentBook.title, 'Gramer Tamamlandı' + durationText, activeReadingSeconds, pts);
    }

    currentBook.readingDuration = (currentBook.readingDuration || 0) + activeReadingSeconds;
    activeReadingSeconds = 0; 
    currentBook.completed = true;
    
    saveToDB();
    renderSpread(); 
    renderLibrary(); // Yeşil tık için arayüzü güncelle
}

/* 7. FLASHCARDS & UNKNOWNS */
function startFlashcardMode() { 
    let list = (currentCategory === 'favorites') ? userFavorites : userUnknownWords;
    if(list.length === 0) return alert("Liste boş!");
    
    currentCategory = (currentCategory === 'favorites') ? 'favorites_flashcard' : 'unknowns_flashcard';
    fcSessionCount = 0;
    fcIndex = 0;
    document.querySelector('.nav-arrow.prev').style.display='none'; 
    document.querySelector('.nav-arrow.next').style.display='none';
    renderSpread();
}

function renderUnknownFlashcards(pL, pR) {
    const isFavMode = currentCategory === 'favorites_flashcard';
    const list = isFavMode ? userFavorites : userUnknownWords;
    if (!list || list.length === 0) {
        switchCategory(isFavMode ? 'favorites' : 'unknowns');
        return;
    }
    if (fcIndex >= list.length) fcIndex = 0;
    const w = list[fcIndex];
    let favClass = isFavorite(w.en) ? 'active' : '';

    pL.style.flex = "2"; pL.style.borderRight = "none"; pL.style.alignItems = "center"; pL.style.justifyContent = "center";
    pR.style.display = "none";
    
    let btnLeftText = isFavMode ? "★ Çıkar" : "✅ Öğrendim (Sil)";
    let hintHtml = w.hint ? `<div class="hint-section" style="margin:5px 0;"><button onclick="event.stopPropagation(); toggleHint()" class="hint-btn">💡 İpucu</button><div id="hintText" class="hint-text-box" style="position:absolute;bottom:60px;left:20px;right:20px;z-index:20;background:rgba(0,0,0,0.8);color:#fff;display:none;">${w.hint}</div></div>` : `<div class="hint-section"><button onclick="event.stopPropagation(); addHint()" class="hint-btn">➕ İpucu Ekle</button></div>`;

    pL.innerHTML = `
        <div style="width:100%; max-width:500px; display:flex; flex-direction:column; align-items:center;">
            <div class="wm-count-display">${isFavMode ? 'Favori' : 'Bilinmeyen'}: ${fcIndex + 1} / ${list.length}</div>
            <div class="wm-card-container" onclick="this.classList.toggle('wm-flipped')">
                <div class="wm-flip-inner">
                    <div class="wm-card-front">
                        <div style="margin-bottom:5px;">${w.en}</div>${hintHtml}
                        <div class="card-action-wrapper">
                            <span class="card-tool-btn btn-listen" onmousedown="event.stopPropagation(); speakWord('${w.en}')">🔊</span>
                            <span class="card-tool-btn btn-fav ${favClass}" onmousedown="event.stopPropagation(); toggleFavorite('${w.en}', '${w.tr}')">★</span>
                        </div>
                    </div>
                    <div class="wm-card-back">${w.tr}</div>
                </div>
            </div>
            <div class="wm-controls">
                <button class="wm-btn wm-btn-know" onmousedown="handleUnknownFlashcardResult('delete')" ontouchstart="handleUnknownFlashcardResult('delete'); event.preventDefault();">${btnLeftText}</button>
                <button class="wm-btn" style="background:#95a5a6;" onmousedown="handleUnknownFlashcardResult('next')" ontouchstart="handleUnknownFlashcardResult('next'); event.preventDefault();">➡️ Sıradaki</button>
            </div>
            <button onclick="switchCategory('${isFavMode ? 'favorites' : 'unknowns'}')" style="margin-top:20px; border:none; background:none; color:#95a5a6; cursor:pointer;">Listeye Dön</button>
        </div>
    `;
}

function handleUnknownFlashcardResult(action) {
    fcSessionCount++;
    const isFavMode = currentCategory === 'favorites_flashcard';
    const list = isFavMode ? userFavorites : userUnknownWords;
    const storageKey = isFavMode ? 'userFavorites' : 'userUnknownWords';

    if(action === 'delete') {
        const w = list[fcIndex];
        list.splice(fcIndex, 1);
        localStorage.setItem(storageKey, JSON.stringify(list));
        if (!isFavMode) { 
             logActivity('vocab', 'Kelime Öğrenildi', w.en, 0, 10); 
             showToast("+10 Puan");
        }
        if(list.length === 0) { alert("Liste bitti."); switchCategory(isFavMode ? 'favorites' : 'unknowns'); return; }
        if(fcIndex >= list.length) fcIndex = 0;
    } else {
        fcIndex++;
        if(fcIndex >= list.length) fcIndex = 0;
    }
    renderSpread();
}

function toggleHint() { const el = document.getElementById('hintText'); el.style.display = el.style.display === 'block' ? 'none' : 'block'; }
function addHint() {
    const list = currentCategory === 'favorites_flashcard' ? userFavorites : userUnknownWords;
    const hint = prompt("İpucu girin:");
    if(hint) { list[fcIndex].hint = hint; localStorage.setItem(currentCategory === 'favorites_flashcard'?'userFavorites':'userUnknownWords', JSON.stringify(list)); renderSpread(); }
}

/* 8. QUIZ SİSTEMİ */
function renderQuizSingleMode(container) {
    let qs = currentBook.questions || [];
    if(pageIndex >= qs.length) { finishQuizSingleMode(container); return; }

    let q = qs[pageIndex];
    let qNum = pageIndex + 1;
    let progress = Math.round((qNum / qs.length) * 100);
    
    let optsHtml = q.options.map(o => {
        let key = o.charAt(0);
        let selected = quizAnswers[qNum] === key ? 'selected' : '';
        return `<div class="quiz-opt ${selected}" onclick="selAnsSingle(${qNum}, '${key}')">${o}</div>`;
    }).join('');

    let isAnswered = quizAnswers[qNum] ? true : false;
    let btnText = (pageIndex === qs.length - 1) ? "Testi Bitir" : "Sonraki Soru";
    
    container.innerHTML = `
        <div class="quiz-centered-container">
            <div class="quiz-question-card">
                <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${progress}%"></div></div>
                <div class="quiz-q-text"><span style="color:var(--accent); margin-right:5px;">Soru ${qNum}:</span> ${q.text}</div>
                <div class="quiz-options-area">${optsHtml}</div>
                <button id="qNextBtn" class="quiz-next-btn" onclick="nextQuestionSingle()" ${isAnswered ? '' : 'disabled'}>${btnText} ➡️</button>
            </div>
        </div>
    `;
}

function selAnsSingle(n, k) { quizAnswers[n] = k; renderSpread(); }
function nextQuestionSingle() { pageIndex++; renderSpread(); }

function finishQuizSingleMode(container) { 
    stopReadingTimer();
    let correct=0, wrong=0; 
    let qs=currentBook.questions; 
    let reviewHtml = "";
    
    qs.forEach((q,i)=>{ 
        let userAnsKey = quizAnswers[i+1];
        let correctAnsText = q.options.find(o => o.startsWith(q.correct)) || q.correct;
        
        if(userAnsKey === q.correct) { 
            correct++; 
            reviewHtml += `<div class="review-item correct"><span>${i+1}. ${q.text}</span><span style="color:green">✔ Doğru</span></div>`; 
        } else { 
            wrong++; 
            reviewHtml += `<div class="review-item wrong"><span>${i+1}. ${q.text}</span><span>❌ Yanlış (Doğru: ${correctAnsText})</span></div>`; 
        } 
    });
    
    let score = Math.round((correct/qs.length)*100);
    const earnedPoints = correct * 15; 

    if (!currentBook.completed) {
        currentBook.completed = true;
        trackStat('quizzesTaken');
        logActivity('quiz', currentBook.title, `Quiz: ${correct}D / ${wrong}Y`, currentQuizTime, earnedPoints);
    } else {
        logActivity('quiz', currentBook.title, `Tekrar: ${correct}D / ${wrong}Y`, currentQuizTime, 0);
    }
    
    currentBook.stats = { readingTime: 0, quizTime: currentQuizTime, score: score };
    saveToDB();
    userStats.totalCorrect = (userStats.totalCorrect || 0) + correct; 
    userStats.totalWrong = (userStats.totalWrong || 0) + wrong; 
    localStorage.setItem('userStats', JSON.stringify(userStats));
    
    let color = score >= 70 ? '#27ae60' : (score >= 50 ? '#f39c12' : '#c0392b');
    container.style.justifyContent = "flex-start"; container.style.overflowY = "auto"; 

    container.innerHTML = `
        <div class="quiz-final-wrapper">
            <div class="quiz-sticky-header">
                <div style="display:flex; align-items:center; gap:20px;">
                    <div class="result-circle-score" style="background:${color}; width:60px; height:60px; display:flex; justify-content:center; align-items:center; color:white; font-weight:bold; font-size:1.2rem; border-radius:50%; border:3px solid white;">%${score}</div>
                    <div><h3 style="margin:0; color:var(--primary);">Test Sonucu</h3><div>✅ ${correct} D | ❌ ${wrong} Y</div></div>
                </div>
                <div><button onclick="closeBook()" style="padding:10px 25px; background:var(--primary); color:white; border:none; border-radius:50px; cursor:pointer;">ÇIKIŞ ➔</button></div>
            </div>
            <div class="quiz-detail-content">
                <div style="background:#fff; border-radius:20px; border:1px solid #eee; padding:10px;">${reviewHtml}</div>
            </div>
        </div>
    `;
}

/* 9. STANDART FONKSİYONLAR (SÖZLÜK, ADMİN, VB.) */
function paginateVocab(w, isListMode = false){ 
    if(!w)return[]; 
    const itemsPerPage = isListMode ? 13 : 69; 
    let p=[]; 
    for(let i=0;i<w.length;i+=itemsPerPage){
        let c=w.slice(i,i+itemsPerPage); 
        let h = "";
        if(isListMode) {
             h = `<div>`;
             c.forEach(x=> {
                 let favClass = isFavorite(x.en) ? 'active' : '';
                 h+=`<div class="unknown-list-item"><strong>${x.en} <span class="tts-small" onclick="speakWord('${x.en}')">🔊</span> <span class="fav-btn ${favClass}" onclick="toggleFavorite('${x.en}', '${x.tr}')">★</span></strong> : ${x.tr}</div>`;
             });
             h += `</div>`;
        } else {
             h=`<div class="vocab-layout">`; 
             c.forEach(x=> {
                 let favClass = isFavorite(x.en) ? 'active' : '';
                 h+=`<div class="vocab-item"><span class="vocab-en">${x.en} <span class="tts-small" onclick="speakWord('${x.en}')">🔊</span> <span class="fav-btn ${favClass}" onclick="toggleFavorite('${x.en}', '${x.tr}')">★</span></span><span class="vocab-tr">${x.tr}</span></div>`;
             });
             h+=`</div>`;
        }
        p.push(h);
    } 
    return p; 
}

function switchCategory(cat) {
    currentCategory=cat; currentLevelFolder = null; closeBook();
    document.querySelectorAll('.nav-btn').forEach(b=>{ b.classList.remove('active'); if(b.getAttribute('onclick').includes(cat)) b.classList.add('active'); });
    
    if(cat === 'unknowns') { openBook({ title: "Bilmediğim Kelimeler", words: userUnknownWords }); document.getElementById('libraryGrid').style.display='none'; return; }
    if(cat === 'favorites') { openBook({ title: "⭐ Favorilerim", words: userFavorites }); document.getElementById('libraryGrid').style.display='none'; return; }
    
    const s=document.getElementById('mainSearch'); s.value="";
    s.placeholder = (cat==='vocabulary') ? "Kelime Ara..." : "Kütüphanede Ara...";
    
    if(cat==='analytics') openAnalytics(); else renderLibrary();
}

function renderLibrary(q="") {
    document.getElementById('analyticsView').style.display='none'; 
    document.getElementById('libraryHeader').style.display='flex'; 
    document.getElementById('externalAppView').style.display='none';
    const g=document.getElementById('libraryGrid'); 
    g.className='library-grid'; g.style.display='grid'; g.innerHTML='';
    let f=contentData.filter(i=>i.category===currentCategory); 
    if(q) f=f.filter(i=>i.title.toLowerCase().includes(q.toLowerCase()));

    if(currentCategory==='reading' || currentCategory==='question' || currentCategory==='vocabulary'){
        const levels = {"A1":1, "A2":2, "B1":3, "B2":4, "C1":5, "C2":6};
        f.sort((a, b) => {
            const getVal = (t) => { let m = t.match(/\b(A1|A2|B1|B2|C1|C2)\b/i); return m ? levels[m[0].toUpperCase()] : 99; };
            let valA = getVal(a.title); let valB = getVal(b.title);
            if(valA !== valB) return valA - valB; return a.title.localeCompare(b.title, 'tr', {numeric:true});
        });
    }

    if((currentCategory === 'reading' || currentCategory === 'question' || currentCategory === 'vocabulary') && !q) {
        if(currentLevelFolder === null) {
            ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].forEach(lvl => {
                const count = f.filter(i => new RegExp(`\\b${lvl}\\b`, 'i').test(i.title)).length;
                if(count > 0) {
                    const folder = document.createElement('div'); folder.className = 'book-card folder-card';
                    folder.innerHTML = `<div class="folder-icon">📂</div><div class="folder-info"><div class="book-title">${lvl} Seviyesi</div><div class="folder-count">${count} Öge</div></div>`;
                    folder.onclick = () => { currentLevelFolder = lvl; renderLibrary(); };
                    g.appendChild(folder);
                }
            });
            f.forEach(i => { if(!/\b(A1|A2|B1|B2|C1|C2)\b/i.test(i.title)) renderBookCard(i, g); });
        } else {
            const backBtn = document.createElement('div'); backBtn.className = 'book-card new-item-card'; 
            backBtn.innerHTML = '<div>⬅ GERİ DÖN</div>'; backBtn.onclick = () => { currentLevelFolder = null; renderLibrary(); }; g.appendChild(backBtn);
            f.filter(i => new RegExp(`\\b${currentLevelFolder}\\b`, 'i').test(i.title)).forEach(i => { renderBookCard(i, g); });
        }
    } else { f.forEach(i => renderBookCard(i, g)); }

    if(currentCategory==='question' && currentLevelFolder === null){ 
        const n=document.createElement('div'); n.className='book-card new-item-card'; n.innerHTML='<div>+ TEST EKLE</div>'; n.onclick=()=>document.getElementById('quickQuizModal').style.display='flex'; g.appendChild(n); 
    }
    if(currentCategory==='notes'){ 
        const n=document.createElement('div'); n.className='book-card new-item-card'; n.innerHTML='<div>+ NOT EKLE</div>'; n.onclick=createNewNote; g.appendChild(n); 
    }
}

function renderBookCard(i, container) {
    const d=document.createElement('div'); d.className='book-card';
    if(i.completed) d.classList.add('completed');
    
    let color = "#2c3e50";
    if(currentCategory==='grammar') color="#f1c40f";
    else if(currentCategory==='vocabulary') color = i.title.includes('Idioms') ? "#9b59b6" : (i.title.includes('Phrases') ? "#17a2b8" : "#e74c3c");
    else if(currentCategory==='question' && !i.completed) color="#27ae60";
    else if(currentCategory==='notes') color="#8e44ad";
    
    d.style.borderLeftColor = color;
    d.innerHTML=`<div class="book-title">${i.title}</div><button class="delete-btn" onclick="deleteItem(event,'${i.id}')">&times;</button>`;
    d.onclick=()=>openBook(i); 
    container.appendChild(d);
}

function saveReadingProgress() { 
    if(currentBook && currentCategory === 'reading') { 
        currentBook.readingDuration = (currentBook.readingDuration || 0) + activeReadingSeconds; 
        activeReadingSeconds = 0; 
        saveToDB(); 
    }
}
function saveToDB(){ 
    let i = contentData.findIndex(x => x.id == currentBook.id); 
    if(i !== -1) {
        contentData[i] = currentBook; 
        localStorage.setItem('englishWorkbookData', JSON.stringify(contentData)); 
    }
}
function closeBook() { 
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    stopDictation(); 
    saveReadingProgress(); 
    stopReadingTimer(); 
    
    if(currentCategory === 'wordmaster' && wmSessionCount > 0) {
        logActivity('vocab', 'Word Master', `${wmSessionCount} Kelime Çalışıldı`);
        wmSessionCount = 0;
    }
    if((currentCategory === 'unknowns_flashcard' || currentCategory === 'favorites_flashcard') && fcSessionCount > 0) {
        logActivity('vocab', 'Flashcard Session', `${fcSessionCount} Kelime Çalışıldı`);
        fcSessionCount = 0;
    }

    document.getElementById('openBookView').style.display='none'; 
    document.getElementById('libraryGrid').style.display='grid'; 
    document.getElementById('libraryHeader').style.display='flex'; 
    document.getElementById('mainSearch').value=""; 
    if(currentCategory !== 'unknowns') renderLibrary(); 
}
function saveQuickQuiz() {
    let raw=document.getElementById('quickQuizInput').value; if(!raw.trim())return alert("Veri?"); let tm=raw.match(/Başlık:\s*(.*)/i); let t=tm?tm[1].trim():"Test "+Date.now(); let cl=raw.replace(/###SORULAR###/g,'').replace(/Başlık:.*\n?/g,''); let qb=cl.split(/Q\d+:/).slice(1); let qs=[]; qb.forEach(b=>{ let l=b.trim().split('\n'); let qt=l[0].trim(); let op=[]; let cor="A"; l.forEach(x=>{x=x.trim(); if(/^[A-D]\)/.test(x))op.push(x); if(x.toLowerCase().startsWith('correct:'))cor=x.split(':')[1].trim().toUpperCase();}); if(qt)qs.push({text:qt,options:op,correct:cor}); }); if(!qs.length)return alert("Hata!");
    contentData.push({id:Date.now().toString(), category:'question', title:t, questions:qs, completed: false}); localStorage.setItem('englishWorkbookData', JSON.stringify(contentData)); document.getElementById('quickQuizModal').style.display='none'; document.getElementById('quickQuizInput').value=""; showToast("Test eklendi!"); if(currentCategory==='question') renderLibrary();
}
function stopReadingTimer() { clearInterval(readingTimerInterval); }
function startReadingTimer() {
    clearInterval(readingTimerInterval);
    if(!isTogglingContext) { activeReadingSeconds = 0; currentQuizTime = 0; }
    isTogglingContext = false;
    document.getElementById('liveTimer').innerText = "00:00";
    readingTimerInterval = setInterval(() => {
        if(currentCategory === 'reading' || currentCategory === 'grammar') {
            activeReadingSeconds++;
            updateTimerDisplay(activeReadingSeconds + (currentCategory==='reading' ? (currentBook.readingDuration || 0) : 0)); 
        } else if(currentCategory === 'question') {
            currentQuizTime++;
            updateTimerDisplay(currentQuizTime);
        }
    }, 1000);
}
function updateTimerDisplay(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    document.getElementById('liveTimer').innerText = `${mins}:${secs}`;
}
function handleQuickDict(e) {
    if(e.key === 'Enter') {
        let val = document.getElementById('quickDic').value.trim().toLowerCase(); if(!val) return;
        let meaning = getWordMeaning(val);
        if(meaning) alert(`📖 ${val.toUpperCase()}:\n${meaning}`); 
        else if(confirm(`"${val}" sözlükte yok. Eklemek ister misin?`)) { 
            let def = prompt("Anlamı:"); if(def) toggleUnknown(document.createElement('div'), val, def); 
        }
        document.getElementById('quickDic').value = "";
    }
}
function buildGlobalDictionary() { globalLexicon={}; contentData.filter(i=>i.category==='vocabulary').forEach(b=>{b.words.forEach(w=>globalLexicon[w.en.trim().toLowerCase()]=w.tr);}); }
function getWordMeaning(raw) {
    let w = raw.toLowerCase().replace(/[^a-z]/g,''); if(!w)return null; if(globalLexicon[w])return globalLexicon[w];
    const sfx=["ing","ies","es","ed","ly","er","est","s","d"];
    for(let s of sfx) { if(w.endsWith(s)){ let stem=w.slice(0,-s.length); if(globalLexicon[stem])return globalLexicon[stem]; } } return null;
}
function toggleUnknown(el, word, meaning) {
    if(meaning === 'null' || !meaning) { let userDef = prompt(`"${word}" anlamı?`); if(userDef) meaning = userDef; else return; }
    const index = userUnknownWords.findIndex(u => u.en === word);
    if(index > -1) { 
        userUnknownWords.splice(index, 1); 
        if(el.classList) el.classList.remove('saved'); 
        showToast("Çıkarıldı."); 
    }
    else { 
        userUnknownWords.push({en: word, tr: meaning}); 
        if(el.classList) el.classList.add('saved'); 
        showToast("Eklendi."); 
    }
    localStorage.setItem('userUnknownWords', JSON.stringify(userUnknownWords));
}
function isUnknown(word) { return userUnknownWords.some(u => u.en.toLowerCase() === word.toLowerCase()); }
function closeAdmin(){document.getElementById('adminModal').style.display='none';}
function saveData() {
    let c=document.getElementById('inputCategory').value; 
    let r=document.getElementById('bulkInput').value; 
    if(!r.trim()) return alert("Veri?");
    
    if(c === 'reading' && r.includes('###SORULAR###')) {
        let parts = r.split('###SORULAR###');
        let lines = parts[0].trim().split('\n');
        let title = lines[0].trim();
        let body = lines.slice(1).join('\n');
        contentData.push({ id: Date.now().toString(), category: 'reading', title: title, enText: body, trText: "", completed: false });
        
        let qb=parts[1].trim().split(/Q\d+:/).slice(1); 
        let qs=[]; 
        qb.forEach(b=>{ let l=b.trim().split('\n'); let qt=l[0].trim(); let op=[]; let cor="A"; l.forEach(x=>{x=x.trim(); if(/^[A-D]\)/.test(x))op.push(x); if(x.toLowerCase().startsWith('correct:'))cor=x.split(':')[1].trim().toUpperCase();}); if(qt)qs.push({text:qt,options:op,correct:cor}); });
        
        contentData.push({id: (Date.now()+1).toString(), category:'question', title: title, questions: qs, completed: false});
        showToast("Reading + Quiz Eklendi");
    } else if(c==='grammar'){ 
        let l=r.split('\n'); let ti=null, co=""; 
        const fg=()=>{ if(ti){ if(!contentData.some(x => x.category === 'grammar' && x.title === ti)) { contentData.push({id:Date.now()+Math.random(), category:'grammar', title:ti, content:co}); } } }; 
        l.forEach(x=>{ let cx=x.trim(); if(/^\d+\./.test(cx)){fg(); ti=cx; co=`<h3>${cx}</h3>`;} else if(cx){ if(/^(Gramer|Örnek)/.test(cx))co+=`<span class="highlight-header">${cx}</span>`; else if(cx.startsWith('·'))co+=`<li>${cx.replace('·','')}</li>`; else co+=`<p>${cx}</p>`; } }); fg(); showToast("Gramer eklendi!"); 
    } else {
         contentData.push({id:Date.now().toString(), category:c, title:"Yeni İçerik", content:r});
         showToast("İçerik Eklendi");
    }
    localStorage.setItem('englishWorkbookData', JSON.stringify(contentData)); 
    closeAdmin(); renderLibrary();
}
function removeDuplicates() {
    if(!confirm("Temizle?")) return;
    const unique = []; const map = new Map();
    contentData.forEach(item => { if(!map.has(item.id)){ map.set(item.id, true); unique.push(item); }});
    contentData = unique;
    localStorage.setItem('englishWorkbookData', JSON.stringify(contentData));
    location.reload();
}
function createNewNote() { contentData.push({id:Date.now().toString(),category:'notes',title:'Yeni Not',pages:["",""], styles:[]}); localStorage.setItem('englishWorkbookData',JSON.stringify(contentData)); openBook(contentData[contentData.length-1]); }
function deleteItem(e,id){ e.stopPropagation(); if(confirm("Sil?")){contentData=contentData.filter(x=>x.id!==id); localStorage.setItem('englishWorkbookData',JSON.stringify(contentData)); renderLibrary();} }
function setupVoice() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SR(); recognition.interimResults=false; recognition.continuous=false;
        recognition.onresult = function(e) { const t=e.results[0][0].transcript; const el=document.getElementById(currentTargetId); if(el){el.value+=(el.value.length>0?" ":"")+t; el.dispatchEvent(new Event('input'));} stopDictation(); };
        recognition.onend = function(){stopDictation();};
    }
}
function toggleDictation(id, lang) { if(!recognition)return alert("Desteklenmiyor"); const btn=document.getElementById(`mic-${lang}-${id}`); if(isListening)stopDictation(); else { currentTargetId=id; recognition.lang=(lang==='tr')?'tr-TR':'en-US'; recognition.start(); isListening=true; if(btn)btn.classList.add('listening'); } }
function stopDictation(){ if(isListening&&recognition){recognition.stop(); isListening=false; document.querySelectorAll('.mic-btn').forEach(b=>b.classList.remove('listening'));} }
function addPageToNote(){ currentBook.pages.push("",""); saveToDB(); pageIndex=currentBook.pages.length-2; renderSpread(); }
function saveTopicNote(v){ if(currentBook){currentBook.userNotes=v; trackStat('notesTaken'); saveToDB();} }
function saveMyPage(idx,val){ currentBook.pages[idx]=val; saveToDB(); }
function saveNoteTitle(val){ currentBook.title=val; saveToDB(); }
function clearCategoryData(){ if(confirm("Sil?")){contentData=contentData.filter(i=>i.category!==document.getElementById('inputCategory').value); localStorage.setItem('englishWorkbookData',JSON.stringify(contentData)); switchCategory(currentCategory);} }
function exportData() {
    const data = { 
        data: localStorage.getItem('englishWorkbookData'), 
        stats: localStorage.getItem('userStats'), 
        notes: localStorage.getItem('myGeneralNotes'), 
        unknowns: localStorage.getItem('userUnknownWords'), 
        knowns: localStorage.getItem('userKnownVocabulary'), 
        favorites: localStorage.getItem('userFavorites'),
        grammarStats: localStorage.getItem('grammarGameStats'), 
        phraseStats: localStorage.getItem('phraseMasterStats'),
        activityLog: localStorage.getItem('userActivityLog')
    };
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'english_pro_system_full_backup.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); showToast("Yedeklendi!");
}
function importData(input) {
    const file = input.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try { const json = JSON.parse(e.target.result);
            if(json.data) localStorage.setItem('englishWorkbookData', json.data);
            if(json.stats) localStorage.setItem('userStats', json.stats);
            if(json.notes) localStorage.setItem('myGeneralNotes', json.notes);
            if(json.unknowns) localStorage.setItem('userUnknownWords', json.unknowns);
            if(json.knowns) localStorage.setItem('userKnownVocabulary', json.knowns);
            if(json.favorites) localStorage.setItem('userFavorites', json.favorites);
            if(json.grammarStats) localStorage.setItem('grammarGameStats', json.grammarStats);
            if(json.phraseStats) localStorage.setItem('phraseMasterStats', json.phraseStats);
            if(json.activityLog) localStorage.setItem('userActivityLog', json.activityLog);
            showToast("Yüklendi!"); setTimeout(() => location.reload(), 1500);
        } catch(err) { showToast("Hata!", true); }
    }; reader.readAsText(file);
}
function resetProgress() {
    if(!confirm("⚠️ DİKKAT! Tüm ilerleme SIFIRLANACAK.\n\nEmin misin?")) return;
    userStats = { booksRead:0, pagesTurned:0, quizzesTaken:0, wordsAdded:0, notesTaken:0, totalCorrect:0, totalWrong:0 };
    localStorage.setItem('userStats', JSON.stringify(userStats));
    userUnknownWords = []; userKnownVocabulary = []; userFavorites = []; userActivityLog = [];
    localStorage.setItem('userUnknownWords', JSON.stringify([]));
    localStorage.setItem('userKnownVocabulary', JSON.stringify([]));
    localStorage.setItem('userFavorites', JSON.stringify([]));
    localStorage.setItem('userActivityLog', JSON.stringify([]));
    contentData.forEach(book => { book.completed = false; if(book.stats) delete book.stats; });
    localStorage.setItem('englishWorkbookData', JSON.stringify(contentData));
    showToast("Tüm ilerleme sıfırlandı!"); setTimeout(() => location.reload(), 1500);
}
function applyGlobalStyle(type, val) {
    if(type === 'color') currentPenStyle.color = val;
    if(type === 'size') currentPenStyle.size = val;
    const pages = document.querySelectorAll('.notebook-paper');
    pages.forEach(p => {
        if(type === 'color') p.style.color = val;
        if(type === 'size') {
            p.style.fontSize = val + 'px';
            const lh = val * 1.5;
            p.style.lineHeight = lh + 'px';
            p.style.backgroundSize = `100% ${lh}px`;
        }
    });
}
function applyStyleToElement(el) {
    el.style.color = currentPenStyle.color;
    el.style.fontSize = currentPenStyle.size + 'px';
    const lh = currentPenStyle.size * 1.5;
    el.style.lineHeight = lh + 'px';
    el.style.backgroundSize = `100% ${lh}px`;
}
function handleTTS(action) {
    if (!('speechSynthesis' in window)) return alert("Tarayıcınız seslendirmeyi desteklemiyor.");
    
    const pauseBtn = document.getElementById('ttsPauseBtn');

    // 1. RESTART
    if (action === 'restart') {
        speechSynthesis.cancel();
        
        let txt = document.getElementById('pageLeft').innerText + " " + document.getElementById('pageRight').innerText;
        txt = txt.replace("✔ KONUYU TAMAMLA", "").replace("✅ OKUMAYI TAMAMLA", "").replace("🔄 Tekrar Okudum (+1)", "").replace("🧠 İLGİLİ TESTİ ÇÖZ", "").replace("↺ İLGİLİ TESTİ TEKRAR ÇÖZ", "");
        
        ttsObj = new SpeechSynthesisUtterance(txt);
        ttsObj.lang = isTrMode ? 'tr-TR' : 'en-US';
        ttsObj.rate = parseFloat(document.getElementById('ttsSpeed').value) || 0.9;
        
        ttsObj.onend = function() {
            if(pauseBtn) {
                pauseBtn.innerHTML = "⏸";
                pauseBtn.classList.remove('paused');
            }
        };

        speechSynthesis.speak(ttsObj);
        
        if(pauseBtn) {
            pauseBtn.innerHTML = "⏸";
            pauseBtn.classList.remove('paused');
        }
    } 
    // 2. PAUSE / RESUME
    else if (action === 'pause') {
        if (speechSynthesis.paused) {
            speechSynthesis.resume();
            pauseBtn.innerHTML = "⏸";
            pauseBtn.classList.remove('paused');
        } else if (speechSynthesis.speaking) {
            speechSynthesis.pause();
            pauseBtn.innerHTML = "▶";
            pauseBtn.classList.add('paused');
        } else {
            handleTTS('restart');
        }
    }
}
function getFormattedTime(seconds) { const m = Math.floor(seconds / 60); const s = Math.round(seconds % 60); return `${m}dk ${s}sn`; }
/* --- EKSİK FONKSİYON DÜZELTMESİ (ADMIN) --- */
function openAdmin() {
    document.getElementById('adminModal').style.display = 'flex';
    document.getElementById('bulkInput').value = ""; // Temiz aç
}
