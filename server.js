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
app.get('/api/stats/detailed', (req, res) => {
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
        stats.prelims = { total: allQuestions.length, bySubject: subjectCounts, addedToday, todayBySubject };

        // Mains
        const mainsPath = path.join(__dirname, 'data', 'mains.json');
        let mainsToday = 0;
        if (fs.existsSync(mainsPath)) {
            const d = JSON.parse(fs.readFileSync(mainsPath, 'utf8'));
            stats.mains = d.questions?.length || 0;
            mainsToday = (d.questions || []).filter(q => q.generatedAt && q.generatedAt.startsWith(today)).length;
        }
        stats.mainsToday = mainsToday;

        // Interview
        const intPath = path.join(__dirname, 'data', 'interview.json');
        let interviewToday = 0;
        if (fs.existsSync(intPath)) {
            const d = JSON.parse(fs.readFileSync(intPath, 'utf8'));
            stats.interview = d.questions?.length || 0;
            interviewToday = (d.questions || []).filter(q => q.generatedAt && q.generatedAt.startsWith(today)).length;
        }
        stats.interviewToday = interviewToday;

        // Flashcards
        const fcPath = path.join(__dirname, 'data', 'flashcards.json');
        let flashcardsToday = 0;
        if (fs.existsSync(fcPath)) {
            const d = JSON.parse(fs.readFileSync(fcPath, 'utf8'));
            stats.flashcards = (d.prelims?.length || 0) + (d.mains?.length || 0) + (d.interview?.length || 0);
            flashcardsToday = (d.prelims || []).filter(c => {
                if (!c.id || !c.id.startsWith('fc-')) return false;
                const parts = c.id.split('-');
                if (parts.length >= 2) {
                    const ts = parseInt(parts[1]);
                    if (ts > 0) {
                        const cardDate = new Date(ts).toISOString().split('T')[0];
                        return cardDate === today;
                    }
                }
                return false;
            }).length;
        }
        stats.flashcardsToday = flashcardsToday;

        // Essays
        const essayPath = path.join(__dirname, 'data', 'essays.json');
        let modelEssaysToday = 0;
        if (fs.existsSync(essayPath)) {
            const d = JSON.parse(fs.readFileSync(essayPath, 'utf8'));
            stats.essays = Object.values(d.categories || {}).flat().length;
            stats.modelEssays = Object.keys(d.modelEssays || {}).length;
        }
        stats.modelEssaysToday = modelEssaysToday;

        // Current affairs
        const caPath = path.join(__dirname, 'data', 'auto-current-affairs.json');
        if (fs.existsSync(caPath)) {
            const d = JSON.parse(fs.readFileSync(caPath, 'utf8'));
            stats.currentAffairs = { articles: d.totalArticles || 0, lastUpdated: d.lastUpdated };
        }

        res.json(stats);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all prelims questions (merges all sources)
app.get('/api/questions/prelims', (req, res) => {
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
        res.json({ section: 'prelims', totalQuestions: questions.length, questions });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Essay topics and framework
app.get('/api/essays', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'essays.json');
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.json({ categories: {} });
    }
});

// Get mains questions
app.get('/api/questions/mains', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'mains.json');
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.json({ questions: [] });
    }
});

// Get interview questions
app.get('/api/questions/interview', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'interview.json');
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.json({ questions: [] });
    }
});

// Get flashcards
app.get('/api/flashcards', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'flashcards.json');
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.json({ prelims: [], mains: [], interview: [] });
    }
});

// Current affairs (auto-fetched)
app.get('/api/current-affairs', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'auto-current-affairs.json');
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.json({ articles: [], lastUpdated: null });
    }
});

// Monthly compilations
app.get('/api/monthly', (req, res) => {
    const monthlyDir = path.join(__dirname, 'data', 'monthly');
    if (!fs.existsSync(monthlyDir)) {
        return res.json({ months: [] });
    }
    const files = fs.readdirSync(monthlyDir).filter(f => f.endsWith('.json')).sort().reverse();
    const months = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(monthlyDir, f), 'utf8'));
        return { month: data.month, totalArticles: data.totalArticles, lastUpdated: data.lastUpdated };
    });
    res.json({ months });
});

app.get('/api/monthly/:month', (req, res) => {
    const filePath = path.join(__dirname, 'data', 'monthly', `${req.params.month}.json`);
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } else {
        res.status(404).json({ error: 'Month not found' });
    }
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
});
