const fs = require('fs');
const path = require('path');
const { callLLM, isLLMAvailable, UPSC_MCQ_SYSTEM_PROMPT } = require('./mcq-generator');

// Complete UPSC syllabus topics for systematic coverage
const SYLLABUS_TOPICS = {
    'Ancient History': [
        'Indus Valley Civilization - sites, town planning, trade, decline',
        'Vedic Period - Early and Later Vedic society, economy, religion',
        'Jainism and Buddhism - teachings, councils, spread, decline',
        'Mauryan Empire - Chandragupta, Ashoka, administration, Arthashastra',
        'Post-Mauryan Period - Sungas, Kanvas, Satavahanas, Indo-Greeks, Kushanas',
        'Gupta Empire - administration, art, science, literature, trade',
        'Sangam Age - literature, three kingdoms, trade, society',
        'South Indian Dynasties - Chalukyas, Pallavas, Cholas, Rashtrakutas',
        'Ancient Indian architecture - stupas, rock-cut caves, temples',
        'Ancient Indian science - mathematics, astronomy, medicine, metallurgy'
    ],
    'Medieval History': [
        'Delhi Sultanate - Slave, Khalji, Tughlaq, Sayyid, Lodi dynasties',
        'Vijayanagara Empire - administration, economy, art, decline',
        'Mughal Empire - Babur to Aurangzeb, administration, Mansabdari',
        'Bhakti Movement - saints, philosophy, impact on society',
        'Sufi Movement - orders, teachings, influence',
        'Medieval Indian architecture - Indo-Islamic, Mughal styles',
        'Regional kingdoms - Rajputs, Marathas, Sikhs, Ahoms',
        'Economic conditions - trade, agriculture, crafts in medieval India',
        'Society and culture - caste system changes, women, education'
    ],
    'Modern History': [
        'European trading companies - Portuguese, Dutch, French, British arrival',
        'British expansion - Carnatic Wars, Plassey, Buxar, Subsidiary Alliance',
        'Economic impact of British rule - drain of wealth, deindustrialization',
        'Social reform movements - Brahmo Samaj, Arya Samaj, widow remarriage',
        'Revolt of 1857 - causes, spread, leaders, failure, aftermath',
        'Rise of Indian Nationalism - formation of INC, Moderate phase',
        'Extremist movement - Tilak, Lajpat Rai, Bipin Chandra Pal',
        'Gandhi era - NCM, CDM, Quit India, philosophy of Satyagraha',
        'Revolutionary movement - Bhagat Singh, Chandrashekhar Azad, INA',
        'Constitutional development - Morley-Minto to Indian Independence Act',
        'Partition and Independence - Mountbatten Plan, consequences'
    ],
    'Indian Polity': [
        'Historical background of Constitution - making, influences, Preamble',
        'Fundamental Rights - Articles 12-35, restrictions, judicial interpretations',
        'Directive Principles and Fundamental Duties - classification, importance',
        'Union Executive - President, Vice President, PM, Council of Ministers',
        'Parliament - Lok Sabha, Rajya Sabha, legislative process, privileges',
        'State Executive and Legislature - Governor, CM, State Legislature',
        'Judiciary - Supreme Court, High Courts, subordinate courts, PIL',
        'Federalism - Centre-State relations, Inter-State Council, cooperative federalism',
        'Local Government - 73rd and 74th Amendments, Panchayats, Municipalities',
        'Constitutional bodies - ECI, UPSC, Finance Commission, CAG, AG',
        'Emergency provisions - National, State, Financial emergencies',
        'Amendment procedure - types of majority, basic structure doctrine',
        'Special provisions - Scheduled Areas, tribal areas, J&K, NE states',
        'Electoral system - FPTP, proportional representation, EVM, NOTA',
        'Statutory and regulatory bodies - NHRC, NCW, NCSC, NCST, CIC'
    ],
    'Geography - Physical': [
        'Geomorphology - interior of Earth, plate tectonics, volcanism, earthquakes',
        'Weathering and erosion - types, landforms created',
        'Climatology - atmosphere, pressure belts, wind systems, cyclones',
        'Oceanography - ocean currents, tides, salinity, ocean floor',
        'Biogeography - biomes, ecosystems, food chains, biodiversity',
        'Soils - formation, types, soil profile, soil erosion and conservation'
    ],
    'Geography - India': [
        'Physical features - Himalayas, Northern Plains, Peninsular Plateau, Islands',
        'Drainage system - Himalayan and Peninsular rivers, watersheds',
        'Climate - monsoon mechanism, seasons, El Nino/La Nina effects',
        'Natural vegetation and wildlife - forest types, national parks',
        'Agriculture - types, Green Revolution, irrigation, cropping patterns',
        'Minerals and energy resources - distribution, types, conservation',
        'Industries - iron/steel, textiles, IT, industrial policy',
        'Transport and communication - railways, roads, ports, airways',
        'Population - distribution, density, growth, migration, urbanization'
    ],
    'Indian Economy': [
        'National income accounting - GDP, GNP, NDP, GVA methods',
        'Planning in India - Five Year Plans, NITI Aayog, planning models',
        'Agriculture sector - MSP, food security, PM-KISAN, crop insurance',
        'Industrial sector - Make in India, PLI scheme, MSMEs, ease of doing business',
        'Banking and finance - RBI, monetary policy, NPA, financial inclusion',
        'Fiscal policy - budget, taxation, FRBM, fiscal deficit management',
        'External sector - BOP, FDI/FPI, exchange rate, trade policy',
        'Poverty and unemployment - measurement, programmes, MGNREGA',
        'Inflation - types, causes, WPI vs CPI, inflation targeting',
        'Infrastructure - transport, energy, digital, telecom, smart cities',
        'International organizations - IMF, World Bank, WTO, ADB, AIIB, NDB'
    ],
    'Science & Technology': [
        'Space technology - ISRO missions, satellites, launch vehicles',
        'Defense technology - missiles, radar, submarines, indigenous programs',
        'Nuclear technology - India\'s three-stage program, reactors, policy',
        'Biotechnology - applications, GM crops, gene therapy, stem cells',
        'Information technology - AI, blockchain, IoT, cybersecurity, 5G/6G',
        'Nanotechnology - applications in medicine, electronics, materials',
        'Robotics and automation - industrial applications, AI ethics',
        'Health and medicine - vaccines, diseases, traditional medicine, AYUSH',
        'Energy technology - solar, wind, hydrogen, nuclear fusion, battery tech',
        'Communication technology - satellites, fiber optics, quantum communication'
    ],
    'Environment & Ecology': [
        'Ecology basics - ecosystems, food chains, ecological succession, biomes',
        'Biodiversity - hotspots, conservation methods, IUCN categories',
        'Climate change - causes, effects, mitigation, UNFCCC, Paris Agreement',
        'Pollution - air, water, soil, noise, solutions, policies',
        'Environmental legislation - EPA, Forest Conservation Act, Wildlife Act, NGT',
        'International environmental conventions - CBD, CITES, Ramsar, Montreal, Basel',
        'Protected areas - National Parks, Wildlife Sanctuaries, Biosphere Reserves',
        'Sustainable development - SDGs, circular economy, green economy',
        'Disasters - types, management, NDMA, vulnerability assessment',
        'Environmental impact assessment - process, challenges, recent controversies'
    ],
    'Art & Culture': [
        'Indian architecture - temple styles (Nagara, Dravida, Vesara), stupas, caves',
        'Indian painting - miniature, Mughal, Rajput, Pahari, folk art, modern',
        'Classical dances - Bharatanatyam, Kathak, Odissi, Kuchipudi, Kathakali etc.',
        'Indian music - Hindustani, Carnatic, instruments, ragas',
        'Literature - ancient (Vedas, Epics), medieval, modern Indian literature',
        'Indian festivals and fairs - religious, seasonal, harvest festivals',
        'UNESCO World Heritage Sites in India - Cultural, Natural, Mixed',
        'GI Tags - important products and their significance',
        'Tribal culture and traditions - art forms, festivals, challenges'
    ],
    'Internal Security': [
        'Terrorism and counter-terrorism - frameworks, agencies, laws (UAPA, NIA Act)',
        'Left Wing Extremism - causes, affected areas, government response',
        'Border management - BSF, ITBP, coastal security, smart fencing',
        'Cyber security - threats, CERT-In, National Cyber Security Policy',
        'Money laundering - PMLA, FATF, terror financing',
        'Role of media and social media in internal security',
        'Insurgency in Northeast India - causes, groups, peace processes',
        'Communalism, regionalism, and separatism - challenges and solutions'
    ]
};

// Pick random topics for generation - WEIGHTED towards high-probability exam topics
function getRandomTopics(count = 3) {
    // PRIORITY 1 topics get 3x weight (most likely to appear in exam)
    const PRIORITY_TOPICS = [
        // Government Schemes & Policies (UPSC asks 5-8 questions every year)
        { subject: 'Government Schemes', topic: 'PM-KISAN, PM-FASAL Bima Yojana, e-NAM, Soil Health Card - agriculture schemes' },
        { subject: 'Government Schemes', topic: 'Ayushman Bharat, PMJAY, Health and Wellness Centres, National Digital Health Mission' },
        { subject: 'Government Schemes', topic: 'Jal Jeevan Mission, Swachh Bharat 2.0, AMRUT 2.0, Smart Cities Mission' },
        { subject: 'Government Schemes', topic: 'PLI schemes across 14 sectors - objectives, beneficiaries, outcomes' },
        { subject: 'Government Schemes', topic: 'National Education Policy 2020 - structure, implementation, higher education reforms' },
        { subject: 'Government Schemes', topic: 'Digital India: UPI, DigiLocker, ONDC, Account Aggregator, Open Network' },
        { subject: 'Government Schemes', topic: 'PM Gati Shakti, National Logistics Policy, Sagarmala, Bharatmala' },
        { subject: 'Government Schemes', topic: 'Startup India, Stand Up India, MUDRA, Fund of Funds, GeM portal' },
        // Environment (15-20 questions in recent papers)
        { subject: 'Environment', topic: 'IUCN Red List categories and recently reclassified Indian species' },
        { subject: 'Environment', topic: 'Ramsar sites in India: recent additions, criteria, significance' },
        { subject: 'Environment', topic: 'Carbon markets: compliance vs voluntary, Article 6, India CCTS, carbon credits' },
        { subject: 'Environment', topic: 'COP outcomes: Paris Agreement Article 6, Loss and Damage Fund, Global Stocktake' },
        { subject: 'Environment', topic: 'Biodiversity: Kunming-Montreal framework, 30x30 target, National Biodiversity Action Plan' },
        { subject: 'Environment', topic: 'Pollution: NCAP targets, GRAP for Delhi, stubble burning solutions, BS-VI norms' },
        { subject: 'Environment', topic: 'EIA 2020 draft notification controversies, public hearing changes, post-facto clearance' },
        { subject: 'Environment', topic: 'Wildlife corridors, man-animal conflict, Project Elephant, MIKE programme' },
        // Economy (8-10 questions every year)
        { subject: 'Economy', topic: 'RBI monetary policy tools: LAF, MSF, SDF, OMO, Operation Twist, LTRO, TLTRO' },
        { subject: 'Economy', topic: 'Government securities: G-Secs, Treasury Bills, SDL, yield curve, bond market reforms' },
        { subject: 'Economy', topic: 'External sector: CAD financing, forex reserves management, rupee internationalization' },
        { subject: 'Economy', topic: 'Financial regulators: RBI vs SEBI vs IRDAI vs PFRDA - jurisdictions and overlaps' },
        { subject: 'Economy', topic: 'Banking reforms: IBC resolution, bad bank (NARCL), Account Aggregator, NBFC regulations' },
        { subject: 'Economy', topic: 'Fiscal federalism: Finance Commission, GST compensation, cess vs surcharge, vertical devolution' },
        { subject: 'Economy', topic: 'Agriculture: MSP formula (Swaminathan), PM-AASHA, APMC reforms, contract farming' },
        // Polity (8-10 questions)
        { subject: 'Polity', topic: 'Recent Supreme Court judgments: same-sex marriage, electoral bonds, Article 370, EWS quota' },
        { subject: 'Polity', topic: 'Governor controversies: withholding assent, dismissing governments, constitutional morality' },
        { subject: 'Polity', topic: 'Delimitation: process, Delimitation Commission, impact on representation, J&K delimitation' },
        { subject: 'Polity', topic: 'One Nation One Election: Kovind Committee, constitutional amendments needed, federalism concerns' },
        { subject: 'Polity', topic: 'Tribunals: NCLT, NGT, CAT, Armed Forces Tribunal - jurisdiction, independence, appeals' },
        { subject: 'Polity', topic: 'Uniform Civil Code debate: Article 44, Goa model, Law Commission views, SC observations' },
        // International Relations
        { subject: 'International Relations', topic: 'India-China: LAC standoff, buffer zones, trade paradox, de-escalation mechanisms' },
        { subject: 'International Relations', topic: 'QUAD evolution: working groups, vaccines initiative, critical tech, maritime domain awareness' },
        { subject: 'International Relations', topic: 'India-Middle East-Europe Corridor (IMEC) vs BRI: geopolitics of connectivity' },
        { subject: 'International Relations', topic: 'SCO: India\'s role, challenges, Central Asia policy, counter-terrorism cooperation' },
        { subject: 'International Relations', topic: 'Global South: Voice of Global South Summit, India as bridge, development finance reform' },
        // Science & Technology
        { subject: 'Science & Technology', topic: 'AI governance: India\'s approach, EU AI Act comparison, deepfakes regulation, ethical AI' },
        { subject: 'Science & Technology', topic: 'Semiconductor ecosystem: fab vs fabless, OSAT, design, India\'s strategy vs Taiwan/Korea' },
        { subject: 'Science & Technology', topic: 'Space: private sector (Skyroot, Agnikul), IN-SPACe, NSIL, space debris, Kessler syndrome' },
        { subject: 'Science & Technology', topic: 'Genome India Project, bioeconomy, synthetic biology, biofoundries' },
        { subject: 'Science & Technology', topic: '6G vision, Open RAN, satellite internet (Starlink in India), telecom reforms' },
        // Art & Culture (2-4 questions but scoring)
        { subject: 'Art & Culture', topic: 'GI Tags: recent additions (2022-2024), state-wise distribution, economic impact' },
        { subject: 'Art & Culture', topic: 'UNESCO sites: recent Indian additions, tentative list, criteria for selection' },
        { subject: 'Art & Culture', topic: 'Tribal art and culture: Warli, Madhubani, Gond, Pattachitra - states and features' },
        { subject: 'Art & Culture', topic: 'Temple architecture details: Nagara sub-styles (Latina, Phamsana, Valabhi), Dravida elements (Gopuram, Vimana, Mandapa)' },
    ];

    // Shuffle with priority weighting (priority topics appear more often)
    const allTopics = [...PRIORITY_TOPICS, ...PRIORITY_TOPICS.slice(0, 15)]; // Top 15 get double weight
    for (let i = allTopics.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allTopics[i], allTopics[j]] = [allTopics[j], allTopics[i]];
    }
    return allTopics.slice(0, count);
}

// Generate syllabus-based questions using LLM
async function generateSyllabusQuestions() {
    if (!isLLMAvailable()) {
        console.log('[SYLLABUS-GEN] LLM not configured. Skipping.');
        return { generated: 0 };
    }

    const topics = getRandomTopics(3);
    console.log(`[SYLLABUS-GEN] Generating questions for: ${topics.map(t => t.topic.substring(0,40)).join(' | ')}`);

    const prompt = `Generate exactly 5 UPSC Civil Services Prelims MCQs covering these topics:

${topics.map((t, i) => `${i+1}. [${t.subject}] ${t.topic}`).join('\n')}

STRICT QUALITY REQUIREMENTS (UPSC 2023-24 difficulty level):
- Use ONLY these UPSC patterns: "Consider the following statements...", "With reference to...", "Which of the following is/are correct?", "Match List I with List II", "Arrange in chronological order", "Which is NOT correct?"
- TRICKY DISTRACTORS: 2-3 options MUST look correct but have ONE subtle factual error (wrong year, wrong person, wrong provision, scope error)
- CROSS-TOPIC: At least 1 question should combine knowledge from 2 different areas
- NEGATIVE QUESTIONS: At least 1 question should ask "Which is NOT correct" or "Which is INCORRECTLY matched"
- SPECIFIC FACTS: Use exact article numbers, exact years, exact names, exact provisions - not vague generalities
- EXPLANATIONS: Must explain why EACH wrong option is wrong (not just why correct answer is right)
- NO EASY QUESTIONS: If a student can answer without preparation, the question is too easy. Reject it.
- Difficulty: 2 hard, 2 very hard, 1 extremely tricky (should fool even well-prepared candidates)

CRITICAL: Only use facts you are 100% certain about. Do NOT generate questions about events from 2025 or 2026 from memory — you may have incorrect dates. Stick to established facts (pre-2024) for static syllabus topics.

Return ONLY a valid JSON array (no other text):
[{"subject":"Subject Name","question":"...","options":["a","b","c","d"],"answer":0,"explanation":"..."}]`;

    try {
        const response = await callLLM(prompt, 4000);
        if (!response) return { generated: 0 };

        // Extract JSON - handle common LLM formatting issues
        let jsonStr = response;
        // Try to find JSON array
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];

        // Fix common JSON issues from LLMs
        jsonStr = jsonStr
            .replace(/,\s*}/g, '}')           // trailing commas in objects
            .replace(/,\s*\]/g, ']')          // trailing commas in arrays
            .replace(/'/g, '"')               // single quotes to double
            .replace(/\n/g, ' ')              // newlines in strings
            .replace(/\t/g, ' ')              // tabs
            .replace(/\\(?!["\\/bfnrtu])/g, '\\\\'); // unescaped backslashes

        let questions;
        try {
            questions = JSON.parse(jsonStr);
        } catch(e) {
            // Last resort: try to extract individual objects
            const objMatches = jsonStr.match(/\{[^{}]*"question"[^{}]*\}/g);
            if (objMatches) {
                questions = [];
                for (const m of objMatches) {
                    try { questions.push(JSON.parse(m)); } catch(e2) {}
                }
            }
            if (!questions || questions.length === 0) {
                console.log('[SYLLABUS-GEN] Failed to parse JSON from LLM response');
                return { generated: 0 };
            }
        }

        if (!Array.isArray(questions) || questions.length === 0) return { generated: 0 };

        // Validate and tag
        const valid = questions.filter(q => q.question && q.options?.length === 4 && typeof q.answer === 'number' && q.explanation)
            .map(q => ({
                ...q,
                id: `syl-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                source: 'AI Syllabus',
                generatedAt: new Date().toISOString()
            }));

        // Save to generated MCQs file
        const genPath = path.join(__dirname, '..', 'data', 'generated-mcqs.json');
        let existing = { questions: [] };
        if (fs.existsSync(genPath)) existing = JSON.parse(fs.readFileSync(genPath, 'utf8'));

        existing.questions.push(...valid);
        existing.lastGenerated = new Date().toISOString();
        existing.totalQuestions = existing.questions.length;
        existing.llmEnabled = true;

        fs.writeFileSync(genPath, JSON.stringify(existing, null, 2));
        console.log(`[SYLLABUS-GEN] Generated ${valid.length} questions. Total bank: ${existing.totalQuestions}`);

        return { generated: valid.length, total: existing.totalQuestions };
    } catch(e) {
        console.error('[SYLLABUS-GEN] Error:', e.message);
        return { generated: 0, error: e.message };
    }
}

// Generate flashcards from syllabus
async function generateSyllabusFlashcards() {
    if (!isLLMAvailable()) return { generated: 0 };

    const topics = getRandomTopics(2);
    const prompt = `Generate 5 flashcards for UPSC preparation on these topics:

${topics.map((t, i) => `${i+1}. [${t.subject}] ${t.topic}`).join('\n')}

Each flashcard should have a question (front) and comprehensive answer (back).
Answers should be detailed but concise - perfect for quick revision.

Return ONLY a valid JSON array:
[{"subject":"Subject","front":"Question?","back":"Detailed answer..."}]`;

    try {
        const response = await callLLM(prompt, 3000);
        if (!response) return { generated: 0 };

        // Extract and fix JSON
        let jsonStr = response;
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']').replace(/\n/g, ' ').replace(/\t/g, ' ');

        let cards;
        try {
            cards = JSON.parse(jsonStr);
        } catch(e) {
            const objMatches = jsonStr.match(/\{[^{}]*"front"[^{}]*\}/g);
            if (objMatches) {
                cards = [];
                for (const m of objMatches) { try { cards.push(JSON.parse(m)); } catch(e2) {} }
            }
            if (!cards || cards.length === 0) return { generated: 0 };
        }
        if (!Array.isArray(cards)) return { generated: 0 };

        const valid = cards.filter(c => c.front && c.back && c.subject)
            .map(c => ({ ...c, id: `fc-${Date.now()}-${Math.random().toString(36).substr(2,4)}` }));

        // Append to flashcards
        const fcPath = path.join(__dirname, '..', 'data', 'flashcards.json');
        let existing = { prelims: [], mains: [], interview: [] };
        if (fs.existsSync(fcPath)) existing = JSON.parse(fs.readFileSync(fcPath, 'utf8'));

        existing.prelims.push(...valid);
        fs.writeFileSync(fcPath, JSON.stringify(existing, null, 2));

        console.log(`[SYLLABUS-GEN] Generated ${valid.length} flashcards. Total: ${existing.prelims.length}`);
        return { generated: valid.length };
    } catch(e) {
        return { generated: 0 };
    }
}

module.exports = { generateSyllabusQuestions, generateSyllabusFlashcards, SYLLABUS_TOPICS };
