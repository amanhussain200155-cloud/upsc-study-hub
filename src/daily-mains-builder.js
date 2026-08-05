const fs = require('fs');
const path = require('path');
const { callLLM, isLLMAvailable } = require('./mcq-generator');

const MAINS_PATH = path.join(__dirname, '..', 'data', 'mains.json');
const ESSAYS_PATH = path.join(__dirname, '..', 'data', 'essays.json');

// Mains GS Paper topics to cycle through
const MAINS_TOPICS = [
    { paper: 'GS-I', topics: ['Indian culture and heritage', 'Modern Indian history', 'World history - colonization to decolonization', 'Indian society - salient features', 'Women and women\'s issues', 'Urbanization and its problems', 'Population and associated issues', 'Globalization effects on Indian society'] },
    { paper: 'GS-II', topics: ['Indian Constitution - features and amendments', 'Separation of powers and dispute redressal', 'Governance and transparency', 'E-governance initiatives', 'Role of civil services', 'India and its neighbors - relations', 'Bilateral and multilateral groupings', 'Social justice - mechanisms and institutions'] },
    { paper: 'GS-III', topics: ['Indian economy and planning', 'Agriculture - issues and reforms', 'Food processing and supply chain', 'Science and technology developments', 'Environmental conservation', 'Disaster management', 'Internal security challenges', 'Cyber security threats'] },
    { paper: 'GS-IV', topics: ['Ethics and human interface', 'Attitude and moral values in governance', 'Emotional intelligence and its utility', 'Contributions of moral thinkers', 'Public service values and ethics in governance', 'Probity in governance', 'Case study: ethical dilemma in administration', 'Case study: conflict of interest in governance'] }
];

async function generateMainsQuestions() {
    if (!isLLMAvailable()) return { generated: 0 };

    // Pick a random paper and topic
    const paper = MAINS_TOPICS[Math.floor(Math.random() * MAINS_TOPICS.length)];
    const topic = paper.topics[Math.floor(Math.random() * paper.topics.length)];

    console.log(`[DAILY-MAINS] Generating for ${paper.paper}: ${topic}`);

    const prompt = `Generate 2 UPSC Mains General Studies questions for ${paper.paper} on the topic: "${topic}"

Each question should:
- Be a 250-word answer type question (as asked in actual UPSC Mains)
- Use command words like: Discuss, Analyze, Critically examine, Comment, Evaluate
- Be multi-dimensional (social + economic + political angles)
- Include 5-7 key points that should be covered
- Include a model answer (200-250 words)

Return ONLY valid JSON array:
[{"subject":"${paper.paper}: ${topic}","question":"...","keyPoints":["point1","point2",...],"model_answer":"..."}]`;

    try {
        const response = await callLLM(prompt, 4000);
        if (!response) return { generated: 0 };

        let jsonStr = response;
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');

        let questions;
        try { questions = JSON.parse(jsonStr); } catch(e) { return { generated: 0 }; }
        if (!Array.isArray(questions)) return { generated: 0 };

        const valid = questions.filter(q => q.question && q.keyPoints?.length > 0 && q.model_answer)
            .map((q, i) => ({ ...q, id: `mains-${Date.now()}-${i}`, generatedAt: new Date().toISOString() }));

        if (valid.length === 0) return { generated: 0 };

        // Append to mains.json
        let existing = { section: 'mains', questions: [] };
        if (fs.existsSync(MAINS_PATH)) existing = JSON.parse(fs.readFileSync(MAINS_PATH, 'utf8'));
        existing.questions.push(...valid);
        fs.writeFileSync(MAINS_PATH, JSON.stringify(existing, null, 2));

        console.log(`[DAILY-MAINS] Added ${valid.length} mains questions. Total: ${existing.questions.length}`);
        return { generated: valid.length, total: existing.questions.length };
    } catch(e) {
        console.error('[DAILY-MAINS] Error:', e.message);
        return { generated: 0 };
    }
}

async function generateEssayTopics() {
    if (!isLLMAvailable()) return { generated: 0 };

    console.log('[WEEKLY-ESSAY] Generating new essay topics...');

    const prompt = `Generate 5 UPSC Mains Essay paper topics. These should be thought-provoking, philosophical, and multi-dimensional.

Mix of categories:
- 1 philosophical/abstract
- 1 social issue
- 1 political/governance
- 1 economic/development
- 1 science/environment/technology

Each topic should be a single sentence or quote that can be interpreted from multiple angles.
Topics should be relevant to India and the world in 2024-25.

Return ONLY a valid JSON object:
{"topics":[{"category":"philosophical","topic":"..."},{"category":"social","topic":"..."},{"category":"political","topic":"..."},{"category":"economic","topic":"..."},{"category":"science_environment","topic":"..."}]}`;

    try {
        const response = await callLLM(prompt, 2000);
        if (!response) return { generated: 0 };

        let jsonStr = response;
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');

        let result;
        try { result = JSON.parse(jsonStr); } catch(e) { return { generated: 0 }; }
        if (!result?.topics) return { generated: 0 };

        // Append to essays.json
        let existing = { categories: {}, writingFramework: {} };
        if (fs.existsSync(ESSAYS_PATH)) existing = JSON.parse(fs.readFileSync(ESSAYS_PATH, 'utf8'));

        let added = 0;
        for (const item of result.topics) {
            const cat = item.category || 'philosophical';
            if (!existing.categories[cat]) existing.categories[cat] = [];
            // Avoid duplicates
            if (!existing.categories[cat].includes(item.topic)) {
                existing.categories[cat].push(item.topic);
                added++;
            }
        }

        fs.writeFileSync(ESSAYS_PATH, JSON.stringify(existing, null, 2));
        const total = Object.values(existing.categories).flat().length;
        console.log(`[WEEKLY-ESSAY] Added ${added} essay topics. Total: ${total}`);
        return { generated: added, total };
    } catch(e) {
        console.error('[WEEKLY-ESSAY] Error:', e.message);
        return { generated: 0 };
    }
}

async function generateInterviewQuestions() {
    if (!isLLMAvailable()) return { generated: 0 };

    const INTERVIEW_PATH = path.join(__dirname, '..', 'data', 'interview.json');
    const categories = ['Current Affairs', 'Governance & Administration', 'Ethics & Values', 'Policy & Opinion', 'Personal Background', 'Subject-specific'];
    const category = categories[Math.floor(Math.random() * categories.length)];

    console.log(`[DAILY-INTERVIEW] Generating for category: ${category}`);

    const prompt = `Generate 2 UPSC Civil Services Interview (Personality Test) questions for the category: "${category}"

Each question should include:
- A realistic panel question (as asked by UPSC interview boards)
- 5-6 practical tips for answering
- A model answer (how an ideal candidate should respond - 100-150 words, structured, confident, balanced)
- 2-3 follow-up questions the panel might ask

Return ONLY valid JSON array:
[{"category":"${category}","question":"...","tips":["tip1","tip2","tip3","tip4","tip5"],"model_answer":"A well-structured model response...","followUps":["followup1","followup2"]}]`;

    try {
        const response = await callLLM(prompt, 3000);
        if (!response) return { generated: 0 };

        let jsonStr = response;
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');

        let questions;
        try { questions = JSON.parse(jsonStr); } catch(e) { return { generated: 0 }; }
        if (!Array.isArray(questions)) return { generated: 0 };

        const valid = questions.filter(q => q.question && q.tips?.length > 0)
            .map((q, i) => ({ ...q, id: `int-${Date.now()}-${i}`, generatedAt: new Date().toISOString() }));

        if (valid.length === 0) return { generated: 0 };

        let existing = { section: 'interview', questions: [] };
        if (fs.existsSync(INTERVIEW_PATH)) existing = JSON.parse(fs.readFileSync(INTERVIEW_PATH, 'utf8'));
        existing.questions.push(...valid);
        fs.writeFileSync(INTERVIEW_PATH, JSON.stringify(existing, null, 2));

        console.log(`[DAILY-INTERVIEW] Added ${valid.length} questions. Total: ${existing.questions.length}`);
        return { generated: valid.length, total: existing.questions.length };
    } catch(e) {
        return { generated: 0 };
    }
}

module.exports = { generateMainsQuestions, generateEssayTopics, generateInterviewQuestions };
