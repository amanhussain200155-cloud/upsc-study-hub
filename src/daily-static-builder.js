const fs = require('fs');
const path = require('path');
const { callLLM, isLLMAvailable } = require('./mcq-generator');

const SUBJECTS_DIR = path.join(__dirname, '..', 'data', 'subjects');

// Track which topics have been covered to avoid repetition
const COVERAGE_PATH = path.join(__dirname, '..', 'data', '.topic-coverage.json');

function loadCoverage() {
    if (fs.existsSync(COVERAGE_PATH)) return JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
    return { covered: [], lastRun: null };
}

function saveCoverage(data) {
    fs.writeFileSync(COVERAGE_PATH, JSON.stringify(data, null, 2));
}

// All syllabus topics organized by subject file
// PRIORITY WEIGHTED: Higher weight = more likely to appear in UPSC exam
// Based on analysis of 2018-2024 papers: frequency, current relevance, government focus areas
const STATIC_TOPICS = {
    'history.json': [
        // PRIORITY 1 - Asked almost every year
        'Peasant movements - Champaran, Kheda, Bardoli, Tebhaga, Telangana',
        'Tribal revolts - Santhal, Munda, Birsa Munda, Rampa, Kol',
        'Round Table Conferences - participants and outcomes',
        'INA and Subhas Chandra Bose',
        'Cabinet Mission vs Mountbatten Plan',
        'Differences between Moderates and Extremists in INC',
        'Revolutionary movement - Bhagat Singh, Chandrashekhar Azad',
        // PRIORITY 2
        'Harappan town planning and drainage system',
        'Trade and economy of Indus Valley Civilization',
        'Difference between Early and Later Vedic period',
        'Buddhist and Jain councils - when, where, outcomes',
        'Ashoka\'s Dhamma and its principles',
        'Sangam age economy and trade with Romans',
        'Pallava and Chalukya architecture',
        'Chola administration and naval power',
        'Alauddin Khalji\'s market reforms',
        'Mughal painting and architecture styles',
        'Din-i-Ilahi and Akbar\'s religious policy',
        'Shivaji\'s administration and Ashtapradhan',
        'Subsidiary Alliance and Doctrine of Lapse - differences',
        'Drain of Wealth theory by Dadabhai Naoroji'
    ],
    'polity.json': [
        // PRIORITY 1 - HIGHEST frequency in UPSC
        'Constitutional amendments - 42nd, 44th, 73rd, 74th, 86th, 91st, 97th, 101st',
        'Fundamental Rights vs DPSP - conflicts and harmony (Minerva Mills, Kesavananda)',
        'Anti-defection law - 10th Schedule, exceptions, recent controversies',
        'Governor\'s discretionary powers and controversies',
        'Finance Commission recommendations and fiscal federalism',
        'Tribunals - types, constitutional status after 42nd and 44th amendments',
        'Article 356 misuse - SR Bommai judgment principles',
        'Difference between Money Bill and Financial Bill',
        'Parliamentary privileges and their limits',
        'Judicial appointments - collegium system vs NJAC',
        // PRIORITY 2
        'Difference between Fundamental Rights and DPSP',
        'Article 21 expansion through judicial interpretations',
        'Powers and functions of the Speaker',
        'Joint Parliamentary Committee vs Select Committee',
        'Types of Bills - Money, Finance, Ordinary, Constitutional',
        'Inter-state water disputes mechanism',
        'Election process of President - value of votes calculation',
        'Comparison of Indian and US federalism',
        'Constitutional bodies vs Statutory bodies - differences',
        'Judicial activism and PIL evolution in India',
        'RTI Act - provisions, exemptions, challenges',
        'Lokpal and Lokayukta - powers and limitations'
    ],
    'geography.json': [
        // PRIORITY 1
        'Indian Ocean Dipole (IOD) and its effect on monsoon - recent importance',
        'Western Disturbances and their impact on North Indian agriculture',
        'Jet streams and their role in Indian climate',
        'Difference between tropical and temperate cyclones - naming conventions',
        'Critical minerals: lithium, cobalt, rare earths - locations and strategic importance',
        'Solar and wind energy potential zones in India',
        'Watershed management and river interlinking',
        'Urban heat island effect and smart city solutions',
        'Peninsular rivers vs Himalayan rivers differences',
        // PRIORITY 2
        'Formation of Himalayas and its geological significance',
        'Types of drainage patterns in India',
        'Western Ghats vs Eastern Ghats comparison',
        'Major ports of India and their hinterlands',
        'Types of farming in India - subsistence to commercial',
        'Multipurpose river valley projects - benefits and issues',
        'Coral reef distribution and threats in India'
    ],
    'economics.json': [
        // PRIORITY 1 - Economy is heaviest section now
        'RBI\'s new frameworks: SDF, inflation targeting, digital rupee (CBDC)',
        'Government securities market - G-Secs, T-Bills, yield curve inversion',
        'India\'s startup ecosystem - DPIIT recognition, Fund of Funds, SIDBI role',
        'Digital public infrastructure: UPI, Aadhaar, DigiLocker, ONDC, Account Aggregator',
        'PLI schemes - sectors, outcomes, FDI impact',
        'National Monetization Pipeline - asset recycling model',
        'Cryptocurrency regulation in India - 30% tax, TDS, RBI concerns',
        'Green bonds and sustainable finance in India',
        'GIFT City (IFSC) - significance for India\'s financial sector',
        'Gig economy and platform workers - social security challenges',
        // PRIORITY 2
        'Difference between monetary and fiscal policy',
        'Types of inflation - demand pull vs cost push',
        'Balance of Payments crisis of 1991',
        'Land reforms in India - successes and failures',
        'Cooperative movement in India - from Amul to failures',
        'WTO and its impact on Indian agriculture',
        'Financial inclusion - Jan Dhan, MUDRA, PM SVANidhi',
        'Public debt management in India',
        'Natural farming vs organic farming differences',
        'Startup ecosystem in India - challenges and support'
    ],
    'science-environment.json': [
        // PRIORITY 1 - Environment is now 15-20 questions in prelims
        'Carbon markets: Article 6 of Paris Agreement, India\'s CCTS, voluntary markets',
        'Green hydrogen: production, National Mission, SIGHT programme, steel decarbonization',
        'Deep ocean mission: polymetallic nodules, thermal energy, biodiversity',
        'India\'s semiconductor mission: fabs, OSAT, design ecosystem',
        'Quantum computing: India\'s National Quantum Mission, applications, threats to encryption',
        'IUCN Red List updates: recent species status changes in India',
        'Wetland conservation: Ramsar sites added recently, threats, ecosystem services',
        'Forest Rights Act implementation - Community Forest Resource rights',
        'Human-wildlife conflict: elephant corridors, Project Elephant, MIKE programme',
        'Microplastics: sources, health impacts, regulation attempts',
        'E-waste management: Extended Producer Responsibility, India\'s rules',
        'Invasive species threat to Indian ecosystems: Lantana, water hyacinth, fall armyworm',
        // PRIORITY 2
        'India\'s three-stage nuclear programme details',
        'Difference between polar and geostationary satellites',
        'Nanotechnology applications in India',
        'Gene therapy vs gene editing differences',
        'Ozone depletion - causes, effects, Montreal Protocol success',
        'Carbon capture and storage technology',
        'Hydrogen fuel cell technology',
        'REDD+ and forest carbon credits'
    ]
};

// Generate and add to static bank
async function dailyStaticBankGrowth() {
    if (!isLLMAvailable()) {
        console.log('[DAILY-STATIC] LLM not available. Skipping.');
        return { generated: 0 };
    }

    const coverage = loadCoverage();
    let totalGenerated = 0;

    // Pick one subject file to expand today
    const subjectFiles = Object.keys(STATIC_TOPICS);
    // Rotate through subjects day by day
    const dayIndex = new Date().getDate() % subjectFiles.length;
    const targetFile = subjectFiles[dayIndex];
    const topics = STATIC_TOPICS[targetFile];

    // Find uncovered topics
    const uncovered = topics.filter(t => !coverage.covered.includes(t));
    if (uncovered.length === 0) {
        // All covered, reset and start over
        coverage.covered = coverage.covered.filter(t => !topics.includes(t));
        console.log('[DAILY-STATIC] All topics covered for this subject, resetting cycle.');
    }

    // Pick 2-3 topics to generate from
    const selectedTopics = (uncovered.length > 0 ? uncovered : topics).slice(0, 2);

    console.log(`[DAILY-STATIC] Expanding ${targetFile} with topics: ${selectedTopics.join(' | ')}`);

    const prompt = `Generate exactly 8 UPSC Civil Services Preliminary Examination MCQs on these topics:

${selectedTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

STRICT REQUIREMENTS (Match actual UPSC 2023-24 paper difficulty):
- Use authentic UPSC patterns: "Consider the following statements...", "With reference to...", "Which is/are correct?", "Match List I with List II", "Arrange in chronological order"
- Each question MUST have exactly 4 options
- TRICKY DISTRACTORS: Options should be designed so that 2-3 LOOK correct but have subtle errors (wrong year by a few years, wrong article number, wrong state, scope confusion, partial truth presented as complete truth)
- NEGATIVE QUESTIONS: Include 2 questions asking "Which is NOT correct" or "Which is INCORRECTLY matched"
- CROSS-TOPIC: Include 1 question mixing the topic with a related but different area
- SPECIFICITY: Use exact constitutional article numbers, exact years, exact treaty names, exact scientific terms
- EXPLANATIONS: Explain why EACH wrong option is wrong, not just why the correct answer is right
- NO EASY QUESTIONS: Every question should require genuine preparation to answer correctly
- Difficulty: 3 hard, 3 very hard, 2 extremely tricky (designed to fool even coaching students)
- All facts must be accurate and verifiable

Return ONLY a valid JSON array (no markdown, no explanation outside JSON):
[{"id":"static-1","subject":"Subject Name","question":"...","options":["a","b","c","d"],"answer":0,"explanation":"Detailed explanation..."}]`;

    try {
        const response = await callLLM(prompt, 5000);
        if (!response) return { generated: 0 };

        // Parse JSON with error handling
        let jsonStr = response;
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']').replace(/\n/g, ' ').replace(/\t/g, ' ');

        let questions;
        try {
            questions = JSON.parse(jsonStr);
        } catch(e) {
            const objMatches = jsonStr.match(/\{[^{}]*"question"[^{}]*\}/g);
            if (objMatches) {
                questions = [];
                for (const m of objMatches) { try { questions.push(JSON.parse(m)); } catch(e2) {} }
            }
            if (!questions || questions.length === 0) return { generated: 0 };
        }

        if (!Array.isArray(questions)) return { generated: 0 };

        // Validate
        const valid = questions.filter(q => q.question && q.options?.length === 4 && typeof q.answer === 'number' && q.explanation)
            .map((q, i) => ({
                ...q,
                id: `static-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
                addedAt: new Date().toISOString()
            }));

        if (valid.length === 0) return { generated: 0 };

        // Append to the subject file
        const filePath = path.join(SUBJECTS_DIR, targetFile);
        let existing = { subject: targetFile.replace('.json', ''), questions: [] };
        if (fs.existsSync(filePath)) existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        existing.questions.push(...valid);
        fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

        // Track coverage
        coverage.covered.push(...selectedTopics);
        coverage.lastRun = new Date().toISOString();
        saveCoverage(coverage);

        totalGenerated = valid.length;
        console.log(`[DAILY-STATIC] Added ${valid.length} questions to ${targetFile}. Total in file: ${existing.questions.length}`);

    } catch(e) {
        console.error('[DAILY-STATIC] Error:', e.message);
    }

    return { generated: totalGenerated, file: targetFile, topics: selectedTopics };
}

module.exports = { dailyStaticBankGrowth };
