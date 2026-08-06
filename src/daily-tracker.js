const fs = require('fs');
const path = require('path');

const TRACKER_PATH = path.join(__dirname, '..', 'data', '.daily-tracker.json');

function loadTracker() {
    if (fs.existsSync(TRACKER_PATH)) return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
    return {};
}

function saveSnapshot(counts) {
    const today = new Date().toISOString().split('T')[0];
    const tracker = loadTracker();
    if (!tracker[today]) {
        // Save first snapshot of the day (baseline)
        tracker[today] = { ...counts, timestamp: new Date().toISOString() };
    }
    // Always update latest
    tracker['latest'] = { ...counts, timestamp: new Date().toISOString() };
    fs.writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
}

function getTodayAdditions(currentCounts) {
    const today = new Date().toISOString().split('T')[0];
    const tracker = loadTracker();
    const baseline = tracker[today];
    if (!baseline) return {};
    return {
        flashcardsAdded: Math.max(0, (currentCounts.flashcards || 0) - (baseline.flashcards || 0)),
        mainsAdded: Math.max(0, (currentCounts.mains || 0) - (baseline.mains || 0)),
        interviewAdded: Math.max(0, (currentCounts.interview || 0) - (baseline.interview || 0)),
        essaysAdded: Math.max(0, (currentCounts.modelEssays || 0) - (baseline.modelEssays || 0)),
    };
}

module.exports = { saveSnapshot, getTodayAdditions };
