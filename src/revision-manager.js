const fs = require('fs');
const path = require('path');

const REVISION_PATH = path.join(__dirname, '..', 'data', 'revision', 'user-data.json');

function loadRevisionData() {
    if (fs.existsSync(REVISION_PATH)) {
        return JSON.parse(fs.readFileSync(REVISION_PATH, 'utf8'));
    }
    return {
        bookmarks: [],        // Bookmarked questions/articles for later revision
        attempted: [],        // All attempted questions with results
        wrongAnswers: [],     // Questions answered incorrectly (priority revision)
        revisionQueue: [],    // Spaced repetition queue
        stats: {
            totalAttempted: 0,
            totalCorrect: 0,
            subjectWise: {},
            streakDays: 0,
            lastActiveDate: null
        }
    };
}

function saveRevisionData(data) {
    const dir = path.dirname(REVISION_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REVISION_PATH, JSON.stringify(data, null, 2));
}

// Record a question attempt
function recordAttempt(questionId, subject, isCorrect, questionData) {
    const data = loadRevisionData();
    const attempt = {
        questionId,
        subject,
        isCorrect,
        attemptedAt: new Date().toISOString(),
        question: questionData.question?.substring(0, 200),
        timesAttempted: 1
    };

    // Check if already attempted
    const existing = data.attempted.find(a => a.questionId === questionId);
    if (existing) {
        existing.timesAttempted++;
        existing.lastAttemptedAt = attempt.attemptedAt;
        existing.lastResult = isCorrect;
        if (isCorrect && existing.wrongCount > 0) {
            existing.wrongCount--;
        }
    } else {
        data.attempted.push({ ...attempt, wrongCount: isCorrect ? 0 : 1 });
    }

    // Track wrong answers for revision
    if (!isCorrect) {
        const inWrong = data.wrongAnswers.find(w => w.questionId === questionId);
        if (!inWrong) {
            data.wrongAnswers.push({
                questionId,
                subject,
                question: questionData.question?.substring(0, 200),
                options: questionData.options,
                answer: questionData.answer,
                explanation: questionData.explanation,
                addedAt: new Date().toISOString(),
                timesWrong: 1,
                lastRevisedAt: null
            });
        } else {
            inWrong.timesWrong++;
        }
        // Add to spaced repetition queue
        addToRevisionQueue(data, questionId, questionData, subject);
    } else {
        // Remove from wrong if now correct
        data.wrongAnswers = data.wrongAnswers.filter(w => w.questionId !== questionId);
    }

    // Update stats
    data.stats.totalAttempted++;
    if (isCorrect) data.stats.totalCorrect++;
    if (!data.stats.subjectWise[subject]) {
        data.stats.subjectWise[subject] = { attempted: 0, correct: 0 };
    }
    data.stats.subjectWise[subject].attempted++;
    if (isCorrect) data.stats.subjectWise[subject].correct++;

    // Streak tracking
    const today = new Date().toISOString().split('T')[0];
    if (data.stats.lastActiveDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (data.stats.lastActiveDate === yesterday) {
            data.stats.streakDays++;
        } else if (data.stats.lastActiveDate !== today) {
            data.stats.streakDays = 1;
        }
        data.stats.lastActiveDate = today;
    }

    saveRevisionData(data);
    return data;
}

// Spaced repetition queue
function addToRevisionQueue(data, questionId, questionData, subject) {
    const existing = data.revisionQueue.find(r => r.questionId === questionId);
    if (existing) {
        existing.nextReviewAt = getNextReviewTime(existing.interval || 1);
        existing.interval = Math.min((existing.interval || 1) * 2, 30); // Double interval, max 30 days
    } else {
        data.revisionQueue.push({
            questionId,
            subject,
            question: questionData.question?.substring(0, 200),
            options: questionData.options,
            answer: questionData.answer,
            explanation: questionData.explanation,
            addedAt: new Date().toISOString(),
            nextReviewAt: getNextReviewTime(1), // Review tomorrow
            interval: 1
        });
    }
}

function getNextReviewTime(days) {
    return new Date(Date.now() + days * 86400000).toISOString();
}

// Get questions due for revision
function getDueRevisions() {
    const data = loadRevisionData();
    const now = new Date().toISOString();
    return data.revisionQueue.filter(r => r.nextReviewAt <= now);
}

// Bookmark a question or article
function addBookmark(item) {
    const data = loadRevisionData();
    const exists = data.bookmarks.find(b => b.id === item.id);
    if (!exists) {
        data.bookmarks.push({
            ...item,
            bookmarkedAt: new Date().toISOString()
        });
        saveRevisionData(data);
    }
    return data;
}

function removeBookmark(id) {
    const data = loadRevisionData();
    data.bookmarks = data.bookmarks.filter(b => b.id !== id);
    saveRevisionData(data);
    return data;
}

// Get revision summary
function getRevisionSummary() {
    const data = loadRevisionData();
    const dueCount = getDueRevisions().length;
    return {
        ...data.stats,
        bookmarkCount: data.bookmarks.length,
        wrongAnswerCount: data.wrongAnswers.length,
        revisionDueCount: dueCount,
        accuracy: data.stats.totalAttempted > 0
            ? Math.round((data.stats.totalCorrect / data.stats.totalAttempted) * 100)
            : 0
    };
}

module.exports = {
    loadRevisionData,
    recordAttempt,
    addBookmark,
    removeBookmark,
    getDueRevisions,
    getRevisionSummary
};
