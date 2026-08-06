const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// LLM Configuration - uses OpenRouter (supports many models, some free)
// Best option: DeepSeek V4 Flash via OpenRouter - fast, cheap ($0.09/M input tokens), excellent for knowledge
// Get free API key at: https://openrouter.ai/keys
const LLM_CONFIG = {
    enabled: false,
    provider: process.env.LLM_PROVIDER || 'openrouter',
    apiKey: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.LLM_MODEL || 'deepseek/deepseek-v4-flash-0731', // Fast, cheap, great for knowledge
};

// Load saved config if exists
try {
    const configPath = path.join(__dirname, '..', 'data', '.llm-config.json');
    if (fs.existsSync(configPath)) {
        const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (saved.apiKey) LLM_CONFIG.apiKey = saved.apiKey;
        if (saved.provider) LLM_CONFIG.provider = saved.provider;
        if (saved.model) LLM_CONFIG.model = saved.model;
        if (saved.baseUrl) LLM_CONFIG.baseUrl = saved.baseUrl;
        LLM_CONFIG.enabled = true;
        console.log(`[LLM] Loaded config: ${saved.model} via ${saved.provider}`);
    }
} catch(e) {}

// Check if LLM is available
function isLLMAvailable() {
    return LLM_CONFIG.apiKey && LLM_CONFIG.apiKey.length > 10;
}

// Call LLM API
async function callLLM(prompt, maxTokens = 2000) {
    if (!isLLMAvailable()) return null;

    const url = new URL(`${LLM_CONFIG.baseUrl}/chat/completions`);
    const body = JSON.stringify({
        model: LLM_CONFIG.model,
        messages: [
            { role: 'system', content: UPSC_MCQ_SYSTEM_PROMPT },
            { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
    });

    return new Promise((resolve, reject) => {
        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LLM_CONFIG.apiKey}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.choices?.[0]?.message?.content || null);
                } catch(e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(30000, () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}

const UPSC_MCQ_SYSTEM_PROMPT = `You are a UPSC exam question paper setter. Generate questions in the EXACT style of UPSC Civil Services Preliminary Examination.

UPSC question patterns:
1. "Consider the following statements..." with "Which of the statements given above is/are correct?" Options: (a) 1 only (b) 2 only (c) Both 1 and 2 (d) Neither 1 nor 2
2. "With reference to [topic], consider the following statements..." 
3. "Which of the following is/are correct regarding [topic]?"
4. "Which one of the following [comparisons/matches/descriptions]?"
5. "Arrange the following in chronological/geographical/descending order"
6. Map-based: "The region marked in the map is known for..."
7. Match the following: "Match List I with List II"

Rules:
- Questions must be factually accurate
- All 4 options must be plausible
- Include detailed explanation with the correct answer
- Difficulty level: moderate to difficult
- Return valid JSON array of question objects`;

// UPSC-style question templates for different subjects
const UPSC_TEMPLATES = {
    'statement_based': (topic, statements, correct, explanation) => ({
        question: `Consider the following statements regarding ${topic}:\n1. ${statements[0]}\n2. ${statements[1]}\n${statements[2] ? '3. ' + statements[2] + '\n' : ''}Which of the statements given above is/are correct?`,
        options: statements.length === 2 
            ? ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2']
            : ['1 and 2 only', '2 and 3 only', '1 and 3 only', '1, 2 and 3'],
        answer: correct,
        explanation
    }),
    'with_reference': (topic, question, options, answer, explanation) => ({
        question: `With reference to ${topic}, which of the following statements is correct?`,
        options,
        answer,
        explanation
    }),
    'which_following': (question, options, answer, explanation) => ({
        question,
        options,
        answer,
        explanation
    }),
    'match_following': (topic, list1, list2, correctMatch, answer, explanation) => ({
        question: `Match the following:\nList I: ${list1.join(', ')}\nList II: ${list2.join(', ')}\nSelect the correct answer using the codes given below:`,
        options: correctMatch,
        answer,
        explanation
    }),
    'arrange_order': (topic, items, correctOrder, answer, explanation) => ({
        question: `Arrange the following ${topic} in correct chronological order:\n${items.map((item, i) => `${i+1}. ${item}`).join('\n')}\nSelect the correct answer:`,
        options: correctOrder,
        answer,
        explanation
    }),
    'map_based': (description, options, answer, explanation) => ({
        question: `${description}`,
        options,
        answer,
        explanation,
        isMapQuestion: true
    })
};

// Generate MCQs from current affairs articles using templates
function generateTemplateBasedMCQs(articles) {
    const generated = [];

    for (const article of articles) {
        const subject = article.subject;
        const title = article.title;
        const content = article.content;
        
        // Generate questions based on subject
        const questions = generateSubjectQuestions(subject, title, content, article);
        generated.push(...questions);
    }

    return generated;
}

function generateSubjectQuestions(subject, title, content, article) {
    const questions = [];
    const text = `${title} ${content}`.toLowerCase();

    // Subject-specific question patterns
    switch(subject) {
        case 'Polity & Governance':
            if (text.includes('amendment') || text.includes('bill') || text.includes('act')) {
                questions.push({
                    id: `gen-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                    subject: 'Polity & Governance',
                    source: 'Current Affairs',
                    sourceArticle: title,
                    date: article.date,
                    ...UPSC_TEMPLATES.statement_based(
                        title.substring(0, 80),
                        [
                            'It requires a simple majority in Parliament for passage',
                            'It needs ratification by at least half the state legislatures',
                            'The President can withhold assent indefinitely'
                        ],
                        0,
                        `Based on the news: "${title}". Constitutional amendments under Article 368 require special majority. Some need state ratification (federal provisions). President cannot withhold assent to Constitution Amendment Bills.`
                    )
                });
            }
            break;

        case 'International Relations':
            if (text.includes('summit') || text.includes('bilateral') || text.includes('agreement')) {
                questions.push({
                    id: `gen-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                    subject: 'International Relations',
                    source: 'Current Affairs',
                    sourceArticle: title,
                    date: article.date,
                    question: `With reference to the recent development: "${title.substring(0, 100)}", consider the following:\n1. This strengthens India's Act East Policy\n2. It has implications for the Indo-Pacific strategy\nWhich of the above is/are correct?`,
                    options: ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'],
                    answer: 2,
                    explanation: `Based on current affairs: "${title}". India's foreign policy engagement in the Indo-Pacific region is multi-dimensional, connecting Act East Policy with broader strategic objectives.`
                });
            }
            break;

        case 'Environment & Ecology':
            questions.push({
                id: `gen-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                subject: 'Environment & Ecology',
                source: 'Current Affairs',
                sourceArticle: title,
                date: article.date,
                question: `In the context of "${title.substring(0, 100)}", which of the following is/are correct?`,
                options: [
                    'It is related to India\'s NDC commitments under Paris Agreement',
                    'It falls under the purview of National Green Tribunal',
                    'Both of the above',
                    'None of the above'
                ],
                answer: 2,
                explanation: `Current affair: "${title}". Environmental governance in India involves both international commitments (Paris Agreement, NDCs) and domestic institutional framework (NGT, MoEFCC, State Pollution Control Boards).`
            });
            break;

        case 'Economy':
            questions.push({
                id: `gen-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                subject: 'Economy',
                source: 'Current Affairs',
                sourceArticle: title,
                date: article.date,
                question: `With reference to "${title.substring(0, 100)}", consider the following statements:\n1. This measure aims to address fiscal consolidation\n2. It is expected to impact the current account balance\nWhich of the above is/are correct?`,
                options: ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'],
                answer: 0,
                explanation: `Based on: "${title}". Economic policy measures must be analyzed for their impact on fiscal deficit, current account, inflation, and growth objectives.`
            });
            break;

        case 'Science & Technology':
            questions.push({
                id: `gen-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                subject: 'Science & Technology',
                source: 'Current Affairs',
                sourceArticle: title,
                date: article.date,
                question: `Regarding "${title.substring(0, 100)}", which statement is correct?`,
                options: [
                    'It is entirely funded by the private sector',
                    'It has applications in both civilian and strategic domains',
                    'It is a joint venture with a foreign government',
                    'It replaces all existing systems in its category'
                ],
                answer: 1,
                explanation: `Based on: "${title}". Most Indian S&T developments have dual-use potential, with applications in both civilian and strategic sectors.`
            });
            break;

        default:
            questions.push({
                id: `gen-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                subject: subject,
                source: 'Current Affairs',
                sourceArticle: title,
                date: article.date,
                question: `Which of the following statements about "${title.substring(0, 80)}" is most accurate?`,
                options: [
                    'It is primarily a state subject under the Seventh Schedule',
                    'It falls under the concurrent list',
                    'It is exclusively in the Union list',
                    'It is not covered under any constitutional provision'
                ],
                answer: 1,
                explanation: `Based on current affairs: "${title}". Many contemporary issues span across Union, State, and Concurrent Lists, making governance a shared responsibility.`
            });
    }

    return questions;
}

// Generate MCQs using LLM if available
async function generateLLMMCQs(articles, count = 10) {
    if (!isLLMAvailable()) return [];

    const topArticles = articles.slice(0, 5);
    const prompt = `Generate ${count} UPSC Prelims-style MCQs based on these current affairs:

${topArticles.map((a, i) => `${i+1}. [${a.subject}] ${a.title}\n   ${a.content?.substring(0, 200)}`).join('\n\n')}

Return a JSON array of objects with: question, options (array of 4), answer (0-3 index), explanation, subject, sourceArticle.

Make questions tricky and UPSC-style - use "Consider the following statements", "With reference to", "Which of the following is/are correct" patterns. Include distractor options that are plausible but incorrect.`;

    try {
        const response = await callLLM(prompt, 4000);
        if (!response) return [];

        // Extract JSON from response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const questions = JSON.parse(jsonMatch[0]);
        return questions.map(q => ({
            ...q,
            id: `llm-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
            source: 'AI Generated',
            generatedAt: new Date().toISOString()
        }));
    } catch(e) {
        console.error('LLM MCQ generation error:', e.message);
        return [];
    }
}

// Generate MCQs from current affairs using LLM
async function generateAndSaveMCQs() {
    const dataDir = path.join(__dirname, '..', 'data');
    const caPath = path.join(dataDir, 'auto-current-affairs.json');

    if (!fs.existsSync(caPath)) {
        console.log('No current affairs data. Run fetcher first.');
        return;
    }

    const caData = JSON.parse(fs.readFileSync(caPath, 'utf8'));
    const articles = caData.articles || [];

    if (articles.length === 0) return { totalQuestions: 0 };

    let newQuestions = [];

    // Use LLM if available for high-quality UPSC MCQs from current affairs
    if (isLLMAvailable() && articles.length > 0) {
        // Pick top 6 most relevant articles
        const topArticles = articles.slice(0, 6);
        const prompt = `You are a UPSC Civil Services Prelims question paper setter. Generate MCQs ONLY from articles that are relevant to UPSC syllabus.

RELEVANCE CRITERIA - Only use articles about:
- Indian government policies, bills, schemes, constitutional matters
- Indian economy (RBI, budget, trade, agriculture, industry)
- India's international relations, treaties, summits India participated in
- Science & technology achievements relevant to India (ISRO, DRDO, IT policy)
- Environment issues affecting India (pollution, conservation, climate policy)
- Indian society, governance, judiciary decisions

SKIP articles about: foreign wars/conflicts not directly involving India, foreign elections, entertainment, sports, crime news.

Current affairs articles:
${topArticles.map((a, i) => `${i+1}. [${a.subject}] ${a.title}\n   ${a.content?.substring(0, 200)}`).join('\n\n')}

From the RELEVANT articles above, generate 3-5 UPSC-style MCQs:
- Pattern: "Consider the following statements...", "With reference to...", "Which is/are correct?"
- Connect the news to Constitutional articles, Acts, policies, or syllabus concepts
- Make explanations detailed: cite the specific Act/Article/Policy, explain WHY each option is right/wrong
- Each explanation should be 3-4 sentences minimum

Return ONLY valid JSON array (if no articles are relevant, return empty array []):
[{"subject":"Subject","question":"...","options":["a","b","c","d"],"answer":0,"explanation":"Detailed explanation...","sourceArticle":"exact headline"}]`;

        try {
            const response = await callLLM(prompt, 4000);
            if (response) {
                let jsonStr = response;
                const jsonMatch = response.match(/\[[\s\S]*\]/);
                if (jsonMatch) jsonStr = jsonMatch[0];
                jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']').replace(/\n/g, ' ').replace(/\t/g, ' ');

                let questions;
                try { questions = JSON.parse(jsonStr); } catch(e) {
                    const objMatches = jsonStr.match(/\{[^{}]*"question"[^{}]*\}/g);
                    if (objMatches) { questions = []; for (const m of objMatches) { try { questions.push(JSON.parse(m)); } catch(e2) {} } }
                }

                if (Array.isArray(questions)) {
                    const valid = questions.filter(q => q.question && q.options?.length === 4 && typeof q.answer === 'number')
                        .map(q => {
                            // Find the matching article to attach link and content
                            const matchedArticle = topArticles.find(a => 
                                q.sourceArticle && a.title && a.title.toLowerCase().includes(q.sourceArticle.toLowerCase().substring(0, 30))
                            ) || topArticles.find(a => 
                                q.explanation && a.title && q.explanation.toLowerCase().includes(a.title.toLowerCase().substring(0, 20))
                            ) || topArticles[0];

                            return {
                                ...q,
                                id: `ca-ai-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                                source: 'Current Affairs (AI)',
                                generatedAt: new Date().toISOString(),
                                articleLink: matchedArticle?.link || null,
                                articleContent: matchedArticle?.content || null,
                                articleSource: matchedArticle?.source || null
                            };
                        });
                    newQuestions.push(...valid);
                    console.log(`[CA-MCQ] LLM generated ${valid.length} MCQs from current affairs`);
                }
            }
        } catch(e) {
            console.log(`[CA-MCQ] LLM error: ${e.message}`);
        }
    }

    // Fallback: if LLM didn't produce enough, just skip (no templates - they produce bad quality)
    if (newQuestions.length === 0) {
        console.log('[CA-MCQ] LLM unavailable or rate-limited. Skipping this cycle.');
    }

    // Load existing and append
    const genPath = path.join(dataDir, 'generated-mcqs.json');
    let existing = { questions: [], lastGenerated: null };
    if (fs.existsSync(genPath)) {
        existing = JSON.parse(fs.readFileSync(genPath, 'utf8'));
    }

    // Avoid duplicates by sourceArticle
    const existingTitles = new Set(existing.questions.map(q => q.sourceArticle));
    const uniqueNew = newQuestions.filter(q => !existingTitles.has(q.sourceArticle));

    existing.questions.push(...uniqueNew);
    existing.lastGenerated = new Date().toISOString();
    existing.totalQuestions = existing.questions.length;
    existing.llmEnabled = isLLMAvailable();

    fs.writeFileSync(genPath, JSON.stringify(existing, null, 2));
    
    // Also save to MongoDB for persistence across deploys
    try { const { saveGeneratedQuestions } = require('./db-storage'); await saveGeneratedQuestions(uniqueNew); } catch(e) {}
    
    console.log(`[CA-MCQ] Added ${uniqueNew.length} new MCQs. Total: ${existing.totalQuestions}`);

    return existing;
}

module.exports = { generateAndSaveMCQs, generateLLMMCQs, isLLMAvailable, LLM_CONFIG, callLLM, UPSC_MCQ_SYSTEM_PROMPT };
