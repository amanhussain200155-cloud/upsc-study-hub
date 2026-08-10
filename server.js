const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { fetchCurrentAffairs } = require('./src/fetcher');
const { generateAndSaveMCQs } = require('./src/mcq-generator');
const { generateSyllabusQuestions, generateSyllabusFlashcards } = require('./src/syllabus-generator');
const { generateFromWikipedia } = require('./src/wiki-generator');
const { dailyStaticBankGrowth } = require('./src/daily-static-builder');
const { generateMainsQuestions, generateEssayTopics, generateInterviewQuestions } = require('./src/daily-mains-builder');
const { recordAttempt, addBookmark, removeBookmark, getDueRevisions, getRevisionSummary, loadRevisionData } = require('./src/revision-manager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ API ROUTES ============

// API: Get detailed stats with daily additions
app.get('/api/stats/detailed', async (req, res) => {
    try {
        const stats = { prelims: {}, mains: 0, interview: 0, flashcards: 0, essays: 0, modelEssays: 0 };
        const today = new Date().toISOString().split('T')[0];
        let totalPrelims = 0;
        let addedToday = 0;

        // Count prelims by subject
        const allQuestions = [];
        const staticFiles = ['prelims.json', 'prelims-part2.json', 'maps.json', 'generated-mcqs.json'];
        for (const file of staticFiles) {
            const filePath = path.join(__dirname, 'data', file);
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const qs = data.questions || [];
                qs.forEach(q => { if (q.source && q.source.includes('Current Affairs')) q.subject = 'Current Affairs'; });
                allQuestions.push(...qs);
            }
        }
        const subjectsDir = path.join(__dirname, 'data', 'subjects');
        if (fs.existsSync(subjectsDir)) {
            fs.readdirSync(subjectsDir).filter(f => f.endsWith('.json')).forEach(file => {
                const data = JSON.parse(fs.readFileSync(path.join(subjectsDir, file), 'utf8'));
                allQuestions.push(...(data.questions || []));
            });
        }

        // Count by subject and today's additions
        const subjectCounts = {};
        const todayBySubject = {};
        for (const q of allQuestions) {
            const s = q.subject || 'Unknown';
            subjectCounts[s] = (subjectCounts[s] || 0) + 1;
            if ((q.generatedAt && q.generatedAt.startsWith(today)) || (q.addedAt && q.addedAt.startsWith(today))) {
                addedToday++;
                todayBySubject[s] = (todayBySubject[s] || 0) + 1;
            }
        }
        // Add unique DB questions to prelims count (same as /api/questions/prelims)
        try {
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState === 1) {
                const { getGeneratedQuestions } = require('./src/db-storage');
                const dbQuestions = await getGeneratedQuestions();
                const existingIds = new Set(allQuestions.map(q => q.id));
                const uniqueDBQs = dbQuestions.filter(q => !existingIds.has(q.qid));
                for (const q of uniqueDBQs) {
                    const s = q.source?.includes('Current Affairs') ? 'Current Affairs' : q.subject;
                    subjectCounts[s] = (subjectCounts[s] || 0) + 1;
                }
                stats.prelims = { total: allQuestions.length + uniqueDBQs.length, bySubject: subjectCounts, addedToday, todayBySubject, staticCount: allQuestions.length };
            } else {
                stats.prelims = { total: allQuestions.length, bySubject: subjectCounts, addedToday, todayBySubject, staticCount: allQuestions.length };
            }
        } catch(e) {
            stats.prelims = { total: allQuestions.length, bySubject: subjectCounts, addedToday, todayBySubject, staticCount: allQuestions.length };
        }

        // Mains
        const mainsPath = path.join(__dirname, 'data', 'mains.json');
        let mainsToday = 0;
        if (fs.existsSync(mainsPath)) {
            const d = JSON.parse(fs.readFileSync(mainsPath, 'utf8'));
            let mainsTotal = d.questions?.length || 0;
            try {
                const mongoose = require('mongoose');
                if (mongoose.connection.readyState === 1) {
                    const { getGeneratedMains } = require('./src/db-storage');
                    const dbMains = await getGeneratedMains();
                    const existingQs = new Set((d.questions||[]).map(q => q.question?.substring(0,50)));
                    mainsTotal += dbMains.filter(q => !existingQs.has(q.question?.substring(0,50))).length;
                }
            } catch(e) {}
            stats.mains = mainsTotal;
            mainsToday = (d.questions || []).filter(q => q.generatedAt && q.generatedAt.startsWith(today)).length;
        }
        stats.mainsToday = mainsToday;

        // Interview
        const intPath = path.join(__dirname, 'data', 'interview.json');
        let interviewToday = 0;
        if (fs.existsSync(intPath)) {
            const d = JSON.parse(fs.readFileSync(intPath, 'utf8'));
            let intTotal = d.questions?.length || 0;
            try {
                const mongoose = require('mongoose');
                if (mongoose.connection.readyState === 1) {
                    const { getGeneratedInterview } = require('./src/db-storage');
                    const dbInt = await getGeneratedInterview();
                    const existingQs = new Set((d.questions||[]).map(q => q.question?.substring(0,50)));
                    intTotal += dbInt.filter(q => !existingQs.has(q.question?.substring(0,50))).length;
                }
            } catch(e) {}
            stats.interview = intTotal;
            interviewToday = (d.questions || []).filter(q => q.generatedAt && q.generatedAt.startsWith(today)).length;
        }
        stats.interviewToday = interviewToday;

        // Flashcards - count same way as /api/flashcards endpoint (file + unique DB)
        const fcPath = path.join(__dirname, 'data', 'flashcards.json');
        let flashcardsToday = 0;
        let flashcardTotal = 0;
        if (fs.existsSync(fcPath)) {
            const d = JSON.parse(fs.readFileSync(fcPath, 'utf8'));
            flashcardTotal = (d.prelims?.length || 0) + (d.mains?.length || 0) + (d.interview?.length || 0);
            // Count unique DB flashcards not in file
            try {
                const mongoose = require('mongoose');
                if (mongoose.connection.readyState === 1) {
                    const { getGeneratedFlashcards } = require('./src/db-storage');
                    const dbCards = await getGeneratedFlashcards();
                    const existingFronts = new Set((d.prelims||[]).map(c => c.front?.substring(0,40)));
                    const uniqueDB = dbCards.filter(c => !existingFronts.has(c.front?.substring(0,40)));
                    flashcardTotal += uniqueDB.length;
                }
            } catch(e) {}
        }
        stats.flashcards = flashcardTotal;

        // Essays
        const essayPath = path.join(__dirname, 'data', 'essays.json');
        let modelEssaysToday = 0;
        if (fs.existsSync(essayPath)) {
            const d = JSON.parse(fs.readFileSync(essayPath, 'utf8'));
            stats.essays = Object.values(d.categories || {}).flat().length;
            stats.modelEssays = Object.keys(d.modelEssays || {}).length;
            // Track today's essays using a separate counter file
            const essayCounterPath = path.join(__dirname, 'data', '.essay-counter.json');
            let counter = {};
            if (fs.existsSync(essayCounterPath)) counter = JSON.parse(fs.readFileSync(essayCounterPath, 'utf8'));
            const prevCount = counter.lastCount || 0;
            const prevDate = counter.date || '';
            if (prevDate === today) {
                modelEssaysToday = Math.max(0, stats.modelEssays - (counter.baseCount || 0));
            } else {
                // New day — save baseline
                counter = { date: today, baseCount: stats.modelEssays, lastCount: stats.modelEssays };
                fs.writeFileSync(essayCounterPath, JSON.stringify(counter));
            }
        }
        stats.modelEssaysToday = modelEssaysToday;

        // Current affairs
        const caPath = path.join(__dirname, 'data', 'auto-current-affairs.json');
        let caToday = 0;
        if (fs.existsSync(caPath)) {
            const d = JSON.parse(fs.readFileSync(caPath, 'utf8'));
            stats.currentAffairs = { articles: d.totalArticles || 0, lastUpdated: d.lastUpdated };
            // Count today's articles
            caToday = (d.articles || []).filter(a => a.date && a.date.startsWith(today)).length;
        }
        stats.caToday = caToday;

        // Add MongoDB counts (persistent AI-generated content)
        try {
            const { getGeneratedQuestions, getGeneratedFlashcards, getGeneratedMains, getGeneratedInterview, Article, GeneratedEssay } = require('./src/db-storage');
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState === 1) {
                const dbQCount = await require('./src/db-storage').GeneratedQuestion.countDocuments();
                const dbFCount = await require('./src/db-storage').GeneratedFlashcard.countDocuments();
                const dbMCount = await require('./src/db-storage').GeneratedMains.countDocuments();
                const dbICount = await require('./src/db-storage').GeneratedInterview.countDocuments();
                const dbECount = await GeneratedEssay.countDocuments();
                const dbACount = await Article.countDocuments();
                
                // Today's DB additions (only genuinely new items)
                const todayStart = new Date(today + 'T00:00:00.000Z');
                const dbQToday = await require('./src/db-storage').GeneratedQuestion.countDocuments({ createdAt: { $gte: todayStart } });
                const dbFToday = await require('./src/db-storage').GeneratedFlashcard.countDocuments({ createdAt: { $gte: todayStart } });
                const dbMToday = await require('./src/db-storage').GeneratedMains.countDocuments({ createdAt: { $gte: todayStart } });
                const dbIToday = await require('./src/db-storage').GeneratedInterview.countDocuments({ createdAt: { $gte: todayStart } });
                const dbEToday = await GeneratedEssay.countDocuments({ createdAt: { $gte: todayStart } });
                const dbAToday = await Article.countDocuments({ createdAt: { $gte: todayStart } });
                
                // Use DB today counts directly (single source of truth)
                stats.prelims.addedToday = dbQToday;
                stats.mainsToday = dbMToday;
                stats.interviewToday = dbIToday;
                stats.flashcardsToday = dbFToday;
                stats.modelEssaysToday = dbEToday;
                stats.caToday = dbAToday;
                stats.essayTopicsToday = 0;
            }
        } catch(e) {}

        res.json(stats);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all prelims questions (merges all sources)
app.get('/api/questions/prelims', async (req, res) => {
    try {
        const questions = [];
        // Static files
        const staticFiles = ['prelims.json', 'prelims-part2.json', 'maps.json', 'generated-mcqs.json'];
        for (const file of staticFiles) {
            const filePath = path.join(__dirname, 'data', file);
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const qs = data.questions || [];
                // Tag current affairs questions with "Current Affairs" subject for filtering
                for (const q of qs) {
                    if (q.source && q.source.includes('Current Affairs')) {
                        q.subject = 'Current Affairs';
                    }
                }
                questions.push(...qs);
            }
        }
        // Subject-specific files
        const subjectsDir = path.join(__dirname, 'data', 'subjects');
        if (fs.existsSync(subjectsDir)) {
            const subjectFiles = fs.readdirSync(subjectsDir).filter(f => f.endsWith('.json'));
            for (const file of subjectFiles) {
                const data = JSON.parse(fs.readFileSync(path.join(subjectsDir, file), 'utf8'));
                questions.push(...(data.questions || []));
            }
        }
        // MongoDB-stored AI-generated questions (persist across deploys)
        try {
            const { getGeneratedQuestions } = require('./src/db-storage');
            const dbQuestions = await getGeneratedQuestions();
            const existingIds = new Set(questions.map(q => q.id));
            for (const q of dbQuestions) {
                if (!existingIds.has(q.qid)) {
                    questions.push({ id: q.qid, subject: q.source?.includes('Current Affairs') ? 'Current Affairs' : q.subject, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation, source: q.source, sourceArticle: q.sourceArticle, articleLink: q.articleLink, articleContent: q.articleContent, articleSource: q.articleSource });
                }
            }
        } catch(e) {}
        res.json({ section: 'prelims', totalQuestions: questions.length, questions });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Essay topics and framework
app.get('/api/essays', async (req, res) => {
    const filePath = path.join(__dirname, 'data', 'essays.json');
    let data = { categories: {} };
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    // Merge model essays from MongoDB
    try {
        const { GeneratedEssay } = require('./src/db-storage');
        if (require('mongoose').connection.readyState === 1) {
            const dbEssays = await GeneratedEssay.find({}).lean();
            if (!data.modelEssays) data.modelEssays = {};
            for (const e of dbEssays) {
                if (e.modelEssay && !data.modelEssays[e.topic]) {
                    data.modelEssays[e.topic] = e.modelEssay;
                }
            }
        }
    } catch(e) {}
    res.json(data);
});

// Get mains questions
app.get('/api/questions/mains', async (req, res) => {
    const filePath = path.join(__dirname, 'data', 'mains.json');
    let data = { questions: [] };
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    // Add MongoDB-stored mains questions
    try {
        const { getGeneratedMains } = require('./src/db-storage');
        const dbMains = await getGeneratedMains();
        const existingQs = new Set(data.questions.map(q => q.question?.substring(0,50)));
        for (const q of dbMains) {
            if (!existingQs.has(q.question?.substring(0,50))) {
                data.questions.push({ id: q.mid, subject: q.subject, question: q.question, keyPoints: q.keyPoints, model_answer: q.model_answer, source: q.source });
            }
        }
    } catch(e) {}
    res.json(data);
});

// Get interview questions
app.get('/api/questions/interview', async (req, res) => {
    const filePath = path.join(__dirname, 'data', 'interview.json');
    let data = { questions: [] };
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    // Add MongoDB-stored interview questions
    try {
        const { getGeneratedInterview } = require('./src/db-storage');
        const dbInt = await getGeneratedInterview();
        const existingQs = new Set(data.questions.map(q => q.question?.substring(0,50)));
        for (const q of dbInt) {
            if (!existingQs.has(q.question?.substring(0,50))) {
                data.questions.push({ id: q.iid, category: q.category, question: q.question, tips: q.tips, model_answer: q.model_answer, followUps: q.followUps, source: q.source });
            }
        }
    } catch(e) {}
    res.json(data);
});

// Get flashcards
app.get('/api/flashcards', async (req, res) => {
    const filePath = path.join(__dirname, 'data', 'flashcards.json');
    let data = { prelims: [], mains: [], interview: [] };
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    // Add MongoDB-stored flashcards
    try {
        const { getGeneratedFlashcards } = require('./src/db-storage');
        const dbCards = await getGeneratedFlashcards();
        const existingFronts = new Set((data.prelims||[]).map(c => c.front?.substring(0,40)));
        for (const c of dbCards) {
            if (!existingFronts.has(c.front?.substring(0,40))) {
                data.prelims.push({ id: c.fid, subject: c.subject, front: c.front, back: c.back, source: c.source });
            }
        }
    } catch(e) {}
    res.json(data);
});

// Current affairs (auto-fetched)
app.get('/api/current-affairs', async (req, res) => {
    const filePath = path.join(__dirname, 'data', 'auto-current-affairs.json');
    let data = { articles: [], lastUpdated: null };
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    // Merge with MongoDB articles (permanent storage)
    try {
        const { getArticles } = require('./src/db-storage');
        const dbArticles = await getArticles();
        const existingTitles = new Set((data.articles||[]).map(a => a.title?.toLowerCase().substring(0,60)));
        for (const a of dbArticles) {
            if (!existingTitles.has(a.title?.toLowerCase().substring(0,60))) {
                data.articles.push({ id: a.articleId, title: a.title, content: a.content, source: a.source, subject: a.subject, secondarySubject: a.secondarySubject, link: a.link, date: a.date, tags: a.tags });
            }
        }
        // Rebuild bySubject
        const grouped = {};
        data.articles.forEach(a => { if(!grouped[a.subject]) grouped[a.subject]=[]; grouped[a.subject].push(a); });
        data.bySubject = grouped;
        data.totalArticles = data.articles.length;
    } catch(e) {}
    res.json(data);
});

// Monthly compilations
app.get('/api/monthly', async (req, res) => {
    const monthlyDir = path.join(__dirname, 'data', 'monthly');
    let months = [];
    if (fs.existsSync(monthlyDir)) {
        const files = fs.readdirSync(monthlyDir).filter(f => f.endsWith('.json')).sort().reverse();
        months = files.map(f => {
            const data = JSON.parse(fs.readFileSync(path.join(monthlyDir, f), 'utf8'));
            return { month: data.month, totalArticles: data.totalArticles, lastUpdated: data.lastUpdated };
        });
    }
    // Merge with MongoDB months
    try {
        const { getAllMonths } = require('./src/db-storage');
        const dbMonths = await getAllMonths();
        const existingMonths = new Set(months.map(m => m.month));
        for (const m of dbMonths) {
            if (!existingMonths.has(m.month)) {
                months.push(m);
            } else {
                // Update count if DB has more
                const existing = months.find(x => x.month === m.month);
                if (existing && m.totalArticles > existing.totalArticles) {
                    existing.totalArticles = m.totalArticles;
                }
            }
        }
        months.sort((a,b) => b.month.localeCompare(a.month));
    } catch(e) {}
    res.json({ months });
});

app.get('/api/monthly/:month', async (req, res) => {
    const filePath = path.join(__dirname, 'data', 'monthly', `${req.params.month}.json`);
    let data = { month: req.params.month, articles: [], totalArticles: 0 };
    if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    // Merge with MongoDB articles for this month
    try {
        const { getArticles } = require('./src/db-storage');
        const dbArticles = await getArticles(req.params.month);
        const existingTitles = new Set((data.articles||[]).map(a => a.title?.toLowerCase().substring(0,60)));
        for (const a of dbArticles) {
            if (!existingTitles.has(a.title?.toLowerCase().substring(0,60))) {
                data.articles.push({ id: a.articleId, title: a.title, content: a.content, source: a.source, subject: a.subject, link: a.link, date: a.date, tags: a.tags });
            }
        }
        data.totalArticles = data.articles.length;
    } catch(e) {}
    res.json(data);
});

// ============ REVISION & BOOKMARK APIs ============

// Record an attempt
app.post('/api/revision/attempt', (req, res) => {
    const { questionId, subject, isCorrect, questionData } = req.body;
    const data = recordAttempt(questionId, subject, isCorrect, questionData || {});
    res.json({ success: true, stats: data.stats });
});

// Get revision data (wrong answers, due revisions, bookmarks)
app.get('/api/revision', (req, res) => {
    const data = loadRevisionData();
    const dueRevisions = getDueRevisions();
    res.json({
        summary: getRevisionSummary(),
        wrongAnswers: data.wrongAnswers,
        bookmarks: data.bookmarks,
        dueRevisions,
        revisionQueue: data.revisionQueue.slice(0, 50),
        attempted: data.attempted.slice(-100) // last 100 attempts
    });
});

// Get revision summary/stats
app.get('/api/revision/stats', (req, res) => {
    res.json(getRevisionSummary());
});

// Reset all progress data
app.post('/api/revision/reset', (req, res) => {
    const resetData = {
        bookmarks: [],
        attempted: [],
        wrongAnswers: [],
        revisionQueue: [],
        stats: { totalAttempted: 0, totalCorrect: 0, subjectWise: {}, streakDays: 0, lastActiveDate: null }
    };
    const revPath = path.join(__dirname, 'data', 'revision', 'user-data.json');
    fs.writeFileSync(revPath, JSON.stringify(resetData, null, 2));
    res.json({ success: true, message: 'All progress reset' });
});

// Bookmark
app.post('/api/revision/bookmark', (req, res) => {
    const result = addBookmark(req.body);
    res.json({ success: true, bookmarkCount: result.bookmarks.length });
});

app.delete('/api/revision/bookmark/:id', (req, res) => {
    const result = removeBookmark(req.params.id);
    res.json({ success: true, bookmarkCount: result.bookmarks.length });
});

// ============ ADMIN/STATUS APIs ============

app.get('/api/status', (req, res) => {
    const caPath = path.join(__dirname, 'data', 'auto-current-affairs.json');
    const genPath = path.join(__dirname, 'data', 'generated-mcqs.json');
    let caData = { totalArticles: 0, lastUpdated: null };
    let genData = { totalQuestions: 0 };
    if (fs.existsSync(caPath)) caData = JSON.parse(fs.readFileSync(caPath, 'utf8'));
    if (fs.existsSync(genPath)) genData = JSON.parse(fs.readFileSync(genPath, 'utf8'));

    // Count static questions
    let staticCount = 0;
    ['prelims.json', 'prelims-part2.json', 'maps.json'].forEach(f => {
        const fp = path.join(__dirname, 'data', f);
        if (fs.existsSync(fp)) {
            staticCount += JSON.parse(fs.readFileSync(fp, 'utf8')).questions?.length || 0;
        }
    });
    // Count subject files
    const subjectsDir = path.join(__dirname, 'data', 'subjects');
    if (fs.existsSync(subjectsDir)) {
        fs.readdirSync(subjectsDir).filter(f => f.endsWith('.json')).forEach(f => {
            const data = JSON.parse(fs.readFileSync(path.join(subjectsDir, f), 'utf8'));
            staticCount += data.questions?.length || 0;
        });
    }
    // Count PYQs
    let pyqCount = 0;

    res.json({
        status: 'running',
        currentAffairs: { articles: caData.totalArticles, lastFetch: caData.lastUpdated },
        generatedMCQs: genData.totalQuestions || 0,
        staticQuestions: staticCount,
        pyqCount,
        totalQuestions: staticCount + (genData.totalQuestions || 0) + pyqCount,
        revision: getRevisionSummary(),
        schedule: 'Current affairs: every 4 hours | MCQ generation: every 6 hours',
        llmEnabled: require('./src/mcq-generator').isLLMAvailable(),
        sources: ['The Hindu', 'Indian Express', 'NDTV', 'Down to Earth', 'PIB', 'LiveMint']
    });
});

// Manual fetch trigger
app.post('/api/fetch-now', async (req, res) => {
    try {
        const ca = await fetchCurrentAffairs();
        const mcqs = await generateAndSaveMCQs();
        res.json({ success: true, articles: ca.totalArticles, mcqs: mcqs?.totalQuestions });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Configure LLM (enables auto-growing question bank)
app.post('/api/config/llm', async (req, res) => {
    const { apiKey, provider, model, baseUrl } = req.body;
    const { LLM_CONFIG } = require('./src/mcq-generator');
    if (apiKey) LLM_CONFIG.apiKey = apiKey;
    if (provider) LLM_CONFIG.provider = provider;
    if (model) LLM_CONFIG.model = model;
    if (baseUrl) LLM_CONFIG.baseUrl = baseUrl;
    LLM_CONFIG.enabled = true;

    // Save to disk for persistence
    const configPath = path.join(__dirname, 'data', '.llm-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
        provider: LLM_CONFIG.provider, apiKey: LLM_CONFIG.apiKey,
        baseUrl: LLM_CONFIG.baseUrl, model: LLM_CONFIG.model
    }, null, 2));

    // Immediately generate first batch
    console.log('[LLM] Configured! Running first syllabus generation...');
    const result = await generateSyllabusQuestions();
    await generateSyllabusFlashcards();

    res.json({
        success: true,
        llmEnabled: true,
        provider: LLM_CONFIG.provider,
        model: LLM_CONFIG.model,
        firstGeneration: result,
        schedule: 'New questions every hour, new flashcards every hour'
    });
});

// ============ SCHEDULING ============

// Helper: generate model essays in batches
async function generateEssayOutlinesBatch() {
    const { callLLM, isLLMAvailable } = require('./src/mcq-generator');
    if (!isLLMAvailable()) return;
    const essayPath = path.join(__dirname, 'data', 'essays.json');
    if (!fs.existsSync(essayPath)) return;
    const data = JSON.parse(fs.readFileSync(essayPath, 'utf8'));
    if (!data.modelEssays) data.modelEssays = {};
    const allTopics = Object.entries(data.categories).flatMap(([cat, topics]) => topics.map(t => ({cat, topic: t})));
    const need = allTopics.filter(t => !data.modelEssays[t.topic]);
    if (need.length === 0) return;
    // Generate 1 full model essay per hour (free tier friendly)
    const pick = need[0];
    const prompt = `Write a complete UPSC Mains model essay (1000-1200 words) on: "${pick.topic}"\n\nStructure: Introduction (~100 words with hook + thesis), Body (~800 words covering social, economic, political, philosophical dimensions with Indian examples, quotes, data), Conclusion (~100 words with balanced forward-looking view).\n\nStyle: Analytical, balanced, optimistic. Use Indian examples, relevant quotes from thinkers. Write the essay directly.`;
    try {
        const response = await callLLM(prompt, 6000);
        if (!response || response.length < 500) return;
        data.modelEssays[pick.topic] = response;
        fs.writeFileSync(essayPath, JSON.stringify(data, null, 2));
        // Save to MongoDB for persistence
        try {
            const { GeneratedEssay } = require('./src/db-storage');
            if (require('mongoose').connection.readyState === 1) {
                await GeneratedEssay.findOneAndUpdate(
                    { topic: pick.topic },
                    { eid: 'essay-' + Date.now(), category: pick.cat, topic: pick.topic, modelEssay: response, source: 'AI Generated', generatedAt: new Date() },
                    { upsert: true }
                );
            }
        } catch(e) {}
        console.log(`[MODEL-ESSAY] Generated for "${pick.topic.substring(0,50)}..." (${response.split(' ').length} words). Total: ${Object.keys(data.modelEssays).length}/${allTopics.length}`);
    } catch(e) {}
}

// ============ CRON JOBS ============

// Fetch current affairs every 4 hours
cron.schedule('0 */4 * * *', async () => {
    console.log('[CRON] Fetching current affairs...');
    try { await fetchCurrentAffairs(); } catch(e) { console.error('[CRON] Fetch error:', e.message); }
});

// Generate MCQs from current affairs every 6 hours
cron.schedule('30 */6 * * *', async () => {
    console.log('[CRON] Generating CA MCQs...');
    try { await generateAndSaveMCQs(); } catch(e) { console.error('[CRON] MCQ gen error:', e.message); }
});

// Generate syllabus-based questions EVERY HOUR (if LLM configured)
cron.schedule('15 * * * *', async () => {
    console.log('[CRON] Generating syllabus questions...');
    try {
        await generateSyllabusQuestions();
        await generateSyllabusFlashcards();
        // Also generate essay outlines for uncovered topics
        await generateEssayOutlinesBatch();
    } catch(e) { console.error('[CRON] Syllabus gen error:', e.message); }
});

// Generate questions from Wikipedia EVERY HOUR (FREE, no API key needed!)
// DISABLED - using AI-only generation for better quality
// cron.schedule('45 * * * *', async () => { ... });

// DAILY: Grow static question bank at 11:30 PM UTC (5 AM IST)
cron.schedule('30 23 * * *', async () => {
    console.log('[CRON] Daily static bank growth...');
    try {
        await dailyStaticBankGrowth();
    } catch(e) { console.error('[CRON] Daily static error:', e.message); }
});

// DAILY: Generate new Mains + Interview questions at 10:00 PM UTC (3:30 AM IST)
cron.schedule('0 22 * * *', async () => {
    console.log('[CRON] Daily mains + interview generation...');
    try {
        await generateMainsQuestions();
        await generateInterviewQuestions();
    } catch(e) { console.error('[CRON] Mains/Interview gen error:', e.message); }
});

// WEEKLY: Generate new essay topics every Sunday at 8 PM UTC
cron.schedule('0 20 * * 0', async () => {
    console.log('[CRON] Weekly essay topic generation...');
    try {
        await generateEssayTopics();
    } catch(e) { console.error('[CRON] Essay gen error:', e.message); }
});

// ============ STARTUP ============
(async () => {
    console.log('[STARTUP] Initializing...');
    try {
        await fetchCurrentAffairs();
        await generateAndSaveMCQs();
        // AI-based syllabus generation (if LLM configured)
        await generateSyllabusQuestions();
        await generateSyllabusFlashcards();
        console.log('[STARTUP] Initial data ready.');
    } catch(e) {
        console.error('[STARTUP] Error:', e.message);
    }
})();

app.listen(PORT, () => {
    console.log(`\n🏛️  UPSC Study Hub v2.0 running on port ${PORT}`);
    console.log(`   ├── Auto-fetch: every 4 hours (The Hindu, IE, NDTV, DTE, PIB)`);
    console.log(`   ├── MCQ generation: every 6 hours`);
    console.log(`   ├── Monthly compilations: auto-accumulated`);
    console.log(`   └── Revision system: spaced repetition + bookmarks\n`);
    
    // Keep-alive: ping self every 14 minutes to prevent Render free tier from sleeping
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://upsc-study-hub.onrender.com';
    setInterval(() => {
        const http = require('http');
        const https = require('https');
        const lib = RENDER_URL.startsWith('https') ? https : http;
        lib.get(`${RENDER_URL}/api/status`, (res) => {
            // Just need to trigger a request to keep alive
        }).on('error', () => {});
    }, 14 * 60 * 1000); // Every 14 minutes
    console.log(`   🔄 Keep-alive ping: every 14 minutes (prevents sleep)`);
});

// ============ USER PROFILES (MongoDB) ============
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || '';
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI).then(() => {
        console.log('[MongoDB] Connected successfully - profiles will persist!');
    }).catch(err => {
        console.log('[MongoDB] Connection failed:', err.message);
        console.log('[MongoDB] Falling back to file-based profiles (will not persist across deploys)');
    });
}

// Profile Schema
const profileSchema = new mongoose.Schema({
    safeName: { type: String, unique: true, index: true },
    name: String,
    created: { type: Date, default: Date.now },
    bookmarks: { type: Array, default: [] },
    attempted: { type: Array, default: [] },
    wrongAnswers: { type: Array, default: [] },
    revisionQueue: { type: Array, default: [] },
    stats: {
        type: Object,
        default: { totalAttempted: 0, totalCorrect: 0, subjectWise: {}, streakDays: 0, lastActiveDate: null }
    }
}, { timestamps: true });

const Profile = mongoose.model('Profile', profileSchema);

// Helper: check if MongoDB is connected
function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

app.get('/api/profiles', async (req, res) => {
    try {
        if (isMongoConnected()) {
            const profiles = await Profile.find({}, 'safeName name').lean();
            res.json({ profiles: profiles.map(p => p.safeName) });
        } else {
            const profilesDir = path.join(__dirname, 'data', 'profiles');
            if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
            const profiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json',''));
            res.json({ profiles });
        }
    } catch(e) { res.json({ profiles: [] }); }
});

app.post('/api/profiles/create', async (req, res) => {
    const { name } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters' });
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    try {
        if (isMongoConnected()) {
            await Profile.findOneAndUpdate(
                { safeName },
                { $setOnInsert: { safeName, name, created: new Date(), bookmarks: [], attempted: [], wrongAnswers: [], revisionQueue: [], stats: { totalAttempted: 0, totalCorrect: 0, subjectWise: {}, streakDays: 0, lastActiveDate: null } } },
                { upsert: true, new: true }
            );
        } else {
            const profilesDir = path.join(__dirname, 'data', 'profiles');
            if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
            const profilePath = path.join(profilesDir, `${safeName}.json`);
            if (!fs.existsSync(profilePath)) {
                fs.writeFileSync(profilePath, JSON.stringify({ name, created: new Date().toISOString(), bookmarks: [], attempted: [], wrongAnswers: [], revisionQueue: [], stats: { totalAttempted: 0, totalCorrect: 0, subjectWise: {}, streakDays: 0, lastActiveDate: null } }, null, 2));
            }
        }
        res.json({ success: true, profile: safeName });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/profiles/:name', async (req, res) => {
    const safeName = req.params.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    try {
        if (isMongoConnected()) {
            const profile = await Profile.findOne({ safeName }).lean();
            if (profile) { res.json(profile); } else { res.status(404).json({ error: 'Profile not found' }); }
        } else {
            const profilePath = path.join(__dirname, 'data', 'profiles', `${safeName}.json`);
            if (fs.existsSync(profilePath)) { res.json(JSON.parse(fs.readFileSync(profilePath, 'utf8'))); }
            else { res.status(404).json({ error: 'Profile not found' }); }
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profiles/:name/attempt', async (req, res) => {
    const safeName = req.params.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const { questionId, subject, isCorrect, questionData } = req.body;
    const today = new Date().toISOString().split('T')[0];
    try {
        if (isMongoConnected()) {
            const profile = await Profile.findOne({ safeName });
            if (!profile) return res.status(404).json({ error: 'Profile not found' });
            profile.stats.totalAttempted++;
            if (isCorrect) profile.stats.totalCorrect++;
            if (!profile.stats.subjectWise[subject]) profile.stats.subjectWise[subject] = { attempted: 0, correct: 0 };
            profile.stats.subjectWise[subject].attempted++;
            if (isCorrect) profile.stats.subjectWise[subject].correct++;
            if (profile.stats.lastActiveDate !== today) {
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                profile.stats.streakDays = profile.stats.lastActiveDate === yesterday ? profile.stats.streakDays + 1 : 1;
                profile.stats.lastActiveDate = today;
            }
            if (!isCorrect && questionData) {
                const exists = profile.wrongAnswers.find(w => w.questionId === questionId);
                if (!exists) profile.wrongAnswers.push({ questionId, subject, question: questionData.question?.substring(0,200), options: questionData.options, answer: questionData.answer, explanation: questionData.explanation, addedAt: new Date().toISOString() });
            } else {
                profile.wrongAnswers = profile.wrongAnswers.filter(w => w.questionId !== questionId);
            }
            profile.markModified('stats');
            profile.markModified('wrongAnswers');
            await profile.save();
            res.json({ success: true, stats: profile.stats });
        } else {
            // File fallback
            const profilePath = path.join(__dirname, 'data', 'profiles', `${safeName}.json`);
            if (!fs.existsSync(profilePath)) return res.status(404).json({ error: 'Profile not found' });
            const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            data.stats.totalAttempted++;
            if (isCorrect) data.stats.totalCorrect++;
            if (!data.stats.subjectWise[subject]) data.stats.subjectWise[subject] = { attempted: 0, correct: 0 };
            data.stats.subjectWise[subject].attempted++;
            if (isCorrect) data.stats.subjectWise[subject].correct++;
            if (data.stats.lastActiveDate !== today) {
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                data.stats.streakDays = data.stats.lastActiveDate === yesterday ? data.stats.streakDays + 1 : 1;
                data.stats.lastActiveDate = today;
            }
            if (!isCorrect && questionData) {
                if (!data.wrongAnswers.find(w => w.questionId === questionId)) data.wrongAnswers.push({ questionId, subject, question: questionData.question?.substring(0,200), options: questionData.options, answer: questionData.answer, explanation: questionData.explanation, addedAt: new Date().toISOString() });
            } else { data.wrongAnswers = data.wrongAnswers.filter(w => w.questionId !== questionId); }
            fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
            res.json({ success: true, stats: data.stats });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profiles/:name/bookmark', async (req, res) => {
    const safeName = req.params.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const item = req.body;
    try {
        if (isMongoConnected()) {
            const profile = await Profile.findOne({ safeName });
            if (!profile) return res.status(404).json({ error: 'Profile not found' });
            if (!profile.bookmarks.find(b => b.id === item.id)) {
                profile.bookmarks.push({ ...item, bookmarkedAt: new Date().toISOString() });
                profile.markModified('bookmarks');
                await profile.save();
            }
            res.json({ success: true, bookmarkCount: profile.bookmarks.length });
        } else {
            const profilePath = path.join(__dirname, 'data', 'profiles', `${safeName}.json`);
            if (!fs.existsSync(profilePath)) return res.status(404).json({ error: 'Profile not found' });
            const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            if (!data.bookmarks.find(b => b.id === item.id)) { data.bookmarks.push({ ...item, bookmarkedAt: new Date().toISOString() }); }
            fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
            res.json({ success: true, bookmarkCount: data.bookmarks.length });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/profiles/:name/bookmark/:id', async (req, res) => {
    const safeName = req.params.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    try {
        if (isMongoConnected()) {
            await Profile.updateOne({ safeName }, { $pull: { bookmarks: { id: req.params.id } } });
            res.json({ success: true });
        } else {
            const profilePath = path.join(__dirname, 'data', 'profiles', `${safeName}.json`);
            if (!fs.existsSync(profilePath)) return res.status(404).json({ error: 'Profile not found' });
            const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            data.bookmarks = data.bookmarks.filter(b => b.id !== req.params.id);
            fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
            res.json({ success: true });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profiles/:name/reset', async (req, res) => {
    const safeName = req.params.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    try {
        if (isMongoConnected()) {
            await Profile.updateOne({ safeName }, { $set: { bookmarks: [], attempted: [], wrongAnswers: [], revisionQueue: [], stats: { totalAttempted: 0, totalCorrect: 0, subjectWise: {}, streakDays: 0, lastActiveDate: null } } });
            res.json({ success: true });
        } else {
            const profilePath = path.join(__dirname, 'data', 'profiles', `${safeName}.json`);
            if (!fs.existsSync(profilePath)) return res.status(404).json({ error: 'Profile not found' });
            const data = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            data.bookmarks = []; data.attempted = []; data.wrongAnswers = []; data.revisionQueue = [];
            data.stats = { totalAttempted: 0, totalCorrect: 0, subjectWise: {}, streakDays: 0, lastActiveDate: null };
            fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
            res.json({ success: true });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/profiles/:name', async (req, res) => {
    const safeName = req.params.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    try {
        if (isMongoConnected()) {
            await Profile.deleteOne({ safeName });
            res.json({ success: true, deleted: safeName });
        } else {
            const profilePath = path.join(__dirname, 'data', 'profiles', `${safeName}.json`);
            if (!fs.existsSync(profilePath)) return res.status(404).json({ error: 'Profile not found' });
            fs.unlinkSync(profilePath);
            res.json({ success: true, deleted: safeName });
        }
    } catch(e) { res.status(500).json({ error: e.message }); }
});
