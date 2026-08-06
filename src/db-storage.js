// MongoDB storage for AI-generated content (persists across deploys)
const mongoose = require('mongoose');

const generatedQuestionSchema = new mongoose.Schema({
    qid: { type: String, unique: true, index: true },
    subject: String,
    question: String,
    options: [String],
    answer: Number,
    explanation: String,
    source: String, // 'AI Syllabus', 'Current Affairs (AI)'
    sourceArticle: String,
    articleLink: String,
    articleContent: String,
    articleSource: String,
    generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const generatedFlashcardSchema = new mongoose.Schema({
    fid: { type: String, unique: true, index: true },
    subject: String,
    front: String,
    back: String,
    source: String,
    generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const generatedMainsSchema = new mongoose.Schema({
    mid: { type: String, unique: true, index: true },
    subject: String,
    question: String,
    keyPoints: [String],
    model_answer: String,
    source: String,
    generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const generatedInterviewSchema = new mongoose.Schema({
    iid: { type: String, unique: true, index: true },
    category: String,
    question: String,
    tips: [String],
    model_answer: String,
    followUps: [String],
    source: String,
    generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const generatedEssaySchema = new mongoose.Schema({
    eid: { type: String, unique: true, index: true },
    category: String,
    topic: String,
    outline: String,
    modelEssay: String,
    source: String,
    generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

let GeneratedQuestion, GeneratedFlashcard, GeneratedMains, GeneratedInterview, GeneratedEssay;

try {
    GeneratedQuestion = mongoose.model('GeneratedQuestion', generatedQuestionSchema);
    GeneratedFlashcard = mongoose.model('GeneratedFlashcard', generatedFlashcardSchema);
    GeneratedMains = mongoose.model('GeneratedMains', generatedMainsSchema);
    GeneratedInterview = mongoose.model('GeneratedInterview', generatedInterviewSchema);
    GeneratedEssay = mongoose.model('GeneratedEssay', generatedEssaySchema);
} catch(e) {
    // Models already registered
    GeneratedQuestion = mongoose.model('GeneratedQuestion');
    GeneratedFlashcard = mongoose.model('GeneratedFlashcard');
    GeneratedMains = mongoose.model('GeneratedMains');
    GeneratedInterview = mongoose.model('GeneratedInterview');
    GeneratedEssay = mongoose.model('GeneratedEssay');
}

function isMongoConnected() {
    return mongoose.connection.readyState === 1;
}

// Save generated questions to MongoDB (in addition to file)
async function saveGeneratedQuestions(questions) {
    if (!isMongoConnected() || !questions.length) return;
    try {
        const docs = questions.map(q => ({
            qid: q.id,
            subject: q.subject,
            question: q.question,
            options: q.options,
            answer: q.answer,
            explanation: q.explanation,
            source: q.source,
            sourceArticle: q.sourceArticle,
            articleLink: q.articleLink,
            articleContent: q.articleContent,
            articleSource: q.articleSource,
            generatedAt: q.generatedAt || new Date()
        }));
        await GeneratedQuestion.insertMany(docs, { ordered: false }).catch(() => {});
        console.log(`[MongoDB] Saved ${docs.length} questions to DB`);
    } catch(e) { /* ignore duplicates */ }
}

async function saveGeneratedFlashcards(cards) {
    if (!isMongoConnected() || !cards.length) return;
    try {
        const docs = cards.map(c => ({
            fid: c.id || ('flash-' + Date.now() + Math.random().toString(36).substr(2,4)),
            subject: c.subject,
            front: c.front,
            back: c.back,
            source: c.source || 'AI Syllabus',
            generatedAt: new Date()
        }));
        await GeneratedFlashcard.insertMany(docs, { ordered: false }).catch(() => {});
    } catch(e) {}
}

async function saveGeneratedMains(questions) {
    if (!isMongoConnected() || !questions.length) return;
    try {
        const docs = questions.map(q => ({
            mid: q.id || ('mains-' + Date.now() + Math.random().toString(36).substr(2,4)),
            subject: q.subject,
            question: q.question,
            keyPoints: q.keyPoints || [],
            model_answer: q.model_answer || '',
            source: q.source || 'AI Generated',
            generatedAt: new Date()
        }));
        await GeneratedMains.insertMany(docs, { ordered: false }).catch(() => {});
    } catch(e) {}
}

async function saveGeneratedInterview(questions) {
    if (!isMongoConnected() || !questions.length) return;
    try {
        const docs = questions.map(q => ({
            iid: q.id || ('int-' + Date.now() + Math.random().toString(36).substr(2,4)),
            category: q.category,
            question: q.question,
            tips: q.tips || [],
            model_answer: q.model_answer || '',
            followUps: q.followUps || [],
            source: q.source || 'AI Generated',
            generatedAt: new Date()
        }));
        await GeneratedInterview.insertMany(docs, { ordered: false }).catch(() => {});
    } catch(e) {}
}

// Get all generated questions from MongoDB (to serve to the app)
async function getGeneratedQuestions() {
    if (!isMongoConnected()) return [];
    try {
        return await GeneratedQuestion.find({}).lean();
    } catch(e) { return []; }
}

async function getGeneratedFlashcards() {
    if (!isMongoConnected()) return [];
    try {
        return await GeneratedFlashcard.find({}).lean();
    } catch(e) { return []; }
}

async function getGeneratedMains() {
    if (!isMongoConnected()) return [];
    try {
        return await GeneratedMains.find({}).lean();
    } catch(e) { return []; }
}

async function getGeneratedInterview() {
    if (!isMongoConnected()) return [];
    try {
        return await GeneratedInterview.find({}).lean();
    } catch(e) { return []; }
}

// ========== CURRENT AFFAIRS ARTICLES ==========
const articleSchema = new mongoose.Schema({
    articleId: { type: String, unique: true, index: true },
    title: String,
    content: String,
    source: String,
    subject: String,
    secondarySubject: String,
    link: String,
    date: Date,
    month: String,
    tags: [String],
    classifiedBy: String,
    savedAt: { type: Date, default: Date.now }
}, { timestamps: true });

let Article;
try { Article = mongoose.model('Article', articleSchema); } catch(e) { Article = mongoose.model('Article'); }

async function saveArticles(articles) {
    if (!isMongoConnected() || !articles.length) return;
    try {
        const docs = articles.map(a => ({
            articleId: a.id || ('art-' + Date.now() + Math.random().toString(36).substr(2,4)),
            title: a.title,
            content: a.content,
            source: a.source,
            subject: a.subject,
            secondarySubject: a.secondarySubject,
            link: a.link,
            date: a.date ? new Date(a.date) : new Date(),
            month: new Date(a.date || Date.now()).toISOString().substring(0,7),
            tags: a.tags || [],
            classifiedBy: a.classifiedBy || 'unknown'
        }));
        await Article.insertMany(docs, { ordered: false }).catch(() => {});
    } catch(e) {}
}

async function getArticles(month) {
    if (!isMongoConnected()) return [];
    try {
        const query = month ? { month } : {};
        return await Article.find(query).sort({ date: -1 }).lean();
    } catch(e) { return []; }
}

async function getAllMonths() {
    if (!isMongoConnected()) return [];
    try {
        const result = await Article.aggregate([
            { $group: { _id: '$month', totalArticles: { $sum: 1 }, lastUpdated: { $max: '$date' } } },
            { $sort: { _id: -1 } }
        ]);
        return result.map(r => ({ month: r._id, totalArticles: r.totalArticles, lastUpdated: r.lastUpdated }));
    } catch(e) { return []; }
}

module.exports = {
    saveGeneratedQuestions, saveGeneratedFlashcards, saveGeneratedMains, saveGeneratedInterview,
    getGeneratedQuestions, getGeneratedFlashcards, getGeneratedMains, getGeneratedInterview,
    GeneratedQuestion, GeneratedFlashcard, GeneratedMains, GeneratedInterview, GeneratedEssay,
    saveArticles, getArticles, getAllMonths, Article
};
