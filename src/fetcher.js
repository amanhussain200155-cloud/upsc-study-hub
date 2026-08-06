const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'UPSC-StudyHub/2.0' } });

// Comprehensive RSS Sources for UPSC
const FEEDS = [
    // Tier 1 - Primary UPSC sources
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss', source: 'The Hindu (National)', tier: 1 },
    { url: 'https://www.thehindu.com/news/international/feeder/default.rss', source: 'The Hindu (International)', tier: 1 },
    { url: 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', source: 'The Hindu (Science)', tier: 1 },
    { url: 'https://www.thehindu.com/business/Economy/feeder/default.rss', source: 'The Hindu (Economy)', tier: 1 },
    { url: 'https://indianexpress.com/section/india/feed/', source: 'Indian Express (India)', tier: 1 },
    { url: 'https://indianexpress.com/section/explained/feed/', source: 'Indian Express (Explained)', tier: 1 },
    { url: 'https://indianexpress.com/section/opinion/feed/', source: 'Indian Express (Opinion)', tier: 2 },
    // Tier 2 - Government & Policy
    { url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', source: 'PIB (Press Information Bureau)', tier: 1 },
    // Tier 2 - Environment & Science
    { url: 'https://www.downtoearth.org.in/rss/news', source: 'Down to Earth', tier: 1 },
    { url: 'https://www.downtoearth.org.in/rss/environment', source: 'Down to Earth (Environment)', tier: 1 },
    // Tier 2 - Economy & Business
    { url: 'https://www.livemint.com/rss/economy', source: 'LiveMint (Economy)', tier: 2 },
];

// ========== AI-FIRST CLASSIFICATION ==========
// AI reads each article and decides: (1) Is it UPSC relevant? (2) What subject?

async function classifyWithAI(articlesList) {
    try {
        const { callLLM, isLLMAvailable } = require('./mcq-generator');
        if (!isLLMAvailable() || articlesList.length === 0) return null; // null means AI unavailable, use fallback
        
        const results = [];
        
        // Process in batches of 15 for efficiency
        for (let i = 0; i < articlesList.length; i += 15) {
            const batch = articlesList.slice(i, i + 15);
            
            const prompt = `You are a UPSC Civil Services exam expert. Classify these news articles for UPSC preparation relevance.

CATEGORIES (use EXACTLY these names):
- Polity & Governance (Parliament, judiciary, constitutional bodies, laws, bills, governance issues)
- Economy (RBI, budget, trade, GDP, banking, agriculture policy, schemes, infrastructure)
- International Relations (India's foreign policy, bilateral/multilateral relations, treaties, global organizations)
- Environment & Ecology (climate, biodiversity, pollution, conservation, environmental laws, disasters)
- Science & Technology (ISRO, DRDO, IT policy, health tech, biotech, defense tech, innovations)
- Social Issues (education, health, women/tribal/minority rights, poverty, urbanization, schemes)
- History & Culture (heritage, ASI findings, art forms, GI tags, festivals, archaeological discoveries)
- Security & Defense (military, terrorism, internal security, border issues, defense procurement)
- Geography (physical geography, resources, mapping, demographic data, regional development)
- IRRELEVANT (crime, accidents, entertainment, celebrity, sports, local politics with no national significance, obituaries, weather reports)

RULES:
- Be STRICT about relevance - only UPSC-worthy news
- State-level governance/budget = "Polity & Governance" only if it has national policy significance
- Local crime/accidents/disasters = IRRELEVANT (unless it raises policy/governance questions)
- Foreign events = "International Relations" ONLY if India is directly involved or it affects India's interests
- Mark anything not useful for UPSC preparation as IRRELEVANT

Articles:
${batch.map((a, i) => `${i+1}. [${a.source}] ${a.title}\n   ${(a.content || '').substring(0, 150)}`).join('\n')}

Return ONLY a valid JSON array with classification for each article (same order):
[{"category":"...","relevant":true/false,"reason":"one-line reason for UPSC relevance"}]`;

            try {
                const response = await callLLM(prompt, 1500);
                if (!response) {
                    // AI call failed for this batch, mark as needing fallback
                    batch.forEach(a => results.push({ article: a, aiResult: null }));
                    continue;
                }
                
                const match = response.match(/\[[\s\S]*\]/);
                if (match) {
                    let parsed;
                    try {
                        parsed = JSON.parse(match[0]);
                    } catch(e) {
                        // Try fixing common JSON issues
                        let fixed = match[0].replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
                        try { parsed = JSON.parse(fixed); } catch(e2) { parsed = null; }
                    }
                    
                    if (parsed && Array.isArray(parsed)) {
                        for (let j = 0; j < batch.length; j++) {
                            const classification = parsed[j] || null;
                            results.push({ article: batch[j], aiResult: classification });
                        }
                    } else {
                        batch.forEach(a => results.push({ article: a, aiResult: null }));
                    }
                } else {
                    batch.forEach(a => results.push({ article: a, aiResult: null }));
                }
            } catch(e) {
                console.log(`[CA-AI] Batch ${i/15 + 1} classification error:`, e.message);
                batch.forEach(a => results.push({ article: a, aiResult: null }));
            }
            
            // Small delay between batches to avoid rate limiting
            if (i + 15 < articlesList.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        return results;
    } catch(e) {
        console.log('[CA-AI] AI classification unavailable:', e.message);
        return null;
    }
}

// ========== FALLBACK: KEYWORD CLASSIFICATION (used when AI is unavailable) ==========

const SUBJECT_KEYWORDS = {
    'Polity & Governance': [
        'parliament', 'supreme court', 'high court', 'constitution', 'amendment', 'bill passed',
        'election commission', 'governor', 'president of india', 'cabinet', 'lok sabha', 'rajya sabha',
        'judiciary', 'fundamental rights', 'directive principles', 'panchayati raj', 'municipality',
        'federalism', 'legislation', 'ordinance', 'tribunal', 'lokpal', 'rti act',
        'niti aayog', 'finance commission', 'delimitation', 'anti-defection',
        'money bill', 'finance bill', 'article 370', 'article 356',
        'cooperative federalism', 'gst council', 'interstate dispute'
    ],
    'Economy': [
        'gdp growth', 'rbi policy', 'fiscal deficit', 'monetary policy', 'inflation rate',
        'union budget', 'tax reform', 'gst collection', 'trade deficit', 'export growth',
        'fdi inflow', 'stock market', 'banking sector', 'npa crisis', 'msme sector',
        'digital economy', 'upi transaction', 'agriculture gdp', 'msp hike',
        'crop insurance', 'food security act', 'employment rate', 'poverty line',
        'disinvestment', 'privatization', 'rupee depreciation', 'forex reserve',
        'current account deficit', 'balance of payments', 'capital market',
        'production linked incentive', 'make in india', 'atmanirbhar bharat',
        'infrastructure development', 'national monetization'
    ],
    'International Relations': [
        'india-china relations', 'india-pakistan', 'india-us relations', 'india-russia',
        'bilateral summit', 'united nations general assembly', 'unsc reform',
        'g20 summit', 'brics summit', 'sco summit', 'asean summit', 'quad summit',
        'foreign policy', 'diplomatic relations', 'indo-pacific strategy',
        'south china sea dispute', 'border standoff', 'line of actual control',
        'line of control', 'nuclear non-proliferation', 'nato expansion',
        'global south', 'refugee crisis', 'act east policy', 'neighbourhood first',
        'indian ocean region', 'belt and road initiative',
        'climate diplomacy', 'multilateral forum', 'rules-based international order',
        'comprehensive nuclear-test-ban', 'missile technology control regime'
    ],
    'Science & Technology': [
        'isro mission', 'space launch', 'satellite deployment', 'chandrayaan', 'gaganyaan',
        'artificial intelligence policy', 'quantum computing', 'biotechnology',
        'genome sequencing', 'crispr gene', 'vaccine development',
        'cyber security policy', 'digital india programme', '5g rollout', 'semiconductor fab',
        'renewable energy target', 'solar capacity', 'hydrogen mission', 'nuclear reactor',
        'drdo missile', 'supercomputer', 'nanotechnology',
        'electric vehicle policy', 'battery technology', 'lithium reserve',
        'deep ocean mission', 'polar expedition'
    ],
    'Environment & Ecology': [
        'climate change impact', 'global warming', 'carbon emission target', 'net zero pledge',
        'paris agreement', 'biodiversity loss', 'wildlife protection', 'endangered species',
        'forest conservation', 'deforestation rate', 'mangrove restoration', 'wetland conservation',
        'ramsar site', 'air pollution', 'water pollution', 'plastic ban',
        'waste management', 'cop summit', 'unfccc', 'ipcc report',
        'green hydrogen', 'national park', 'wildlife sanctuary', 'biosphere reserve',
        'tiger reserve', 'coral reef bleaching', 'ocean acidification',
        'monsoon forecast', 'environmental impact assessment',
        'national green tribunal', 'forest rights act', 'compensatory afforestation',
        'sustainable development goals', 'carbon credit market'
    ],
    'Social Issues': [
        'education policy', 'national education policy', 'health policy', 'women empowerment',
        'gender equality', 'caste discrimination', 'reservation policy', 'tribal rights',
        'poverty alleviation scheme', 'nutrition programme', 'sanitation mission',
        'swachh bharat', 'skill development', 'digital divide',
        'right to education', 'domestic violence', 'child labour',
        'social security pension', 'ayushman bharat', 'mental health policy',
        'disability rights', 'uniform civil code', 'communal harmony'
    ],
    'History & Culture': [
        'archaeological survey of india', 'heritage site', 'unesco world heritage',
        'ancient monument', 'excavation discovery', 'classical dance form',
        'classical music', 'gi tag awarded', 'geographical indication',
        'intangible heritage', 'folk art', 'sangeet natak akademi',
        'sahitya akademi', 'padma awards', 'national museum',
        'freedom movement anniversary', 'historical monument'
    ],
    'Security & Defense': [
        'indian army exercise', 'indian navy', 'indian air force', 'defence budget allocation',
        'counter-terrorism', 'naxal operation', 'border security force',
        'national investigation agency', 'defence procurement', 'missile test',
        'nuclear submarine', 'aircraft carrier', 'ceasefire violation',
        'afspa extension', 'internal security', 'left wing extremism',
        'cyber warfare', 'coastal security', 'defence corridor',
        'indigenous defence production', 'theaterisation'
    ],
    'Geography': [
        'seismic zone', 'tectonic activity', 'volcanic eruption', 'tsunami warning',
        'monsoon pattern', 'cyclone formation', 'rainfall deficit', 'drought declaration',
        'river interlinking', 'glacier retreat', 'himalayan ecology',
        'ocean current', 'indian ocean dipole', 'mineral reserve',
        'coal production', 'petroleum exploration', 'demographic transition',
        'urbanization trend', 'land use change', 'desertification'
    ]
};

function categorizeArticleKeyword(title, content) {
    const text = `${title} ${content || ''}`.toLowerCase();
    const scores = {};
    
    for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
        let score = 0;
        for (const keyword of keywords) {
            // Use word boundary matching to prevent substring false positives
            // For multi-word keywords, check if the phrase exists
            // For short keywords (<=4 chars), require word boundaries
            if (keyword.length <= 4) {
                const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (regex.test(text)) score++;
            } else {
                if (text.includes(keyword)) score++;
            }
        }
        if (score > 0) scores[subject] = score;
    }
    
    // Filter out obvious irrelevant content
    const irrelevantPatterns = [
        /\b(killed in|murder|body found|arrested for|road accident|car crash|bike accident)\b/i,
        /\b(film|movie|actor|actress|cricket|ipl|football|tennis|bollywood|celebrity)\b/i,
        /\b(horoscope|recipe|lifestyle|fashion|beauty tips)\b/i
    ];
    const isIrrelevant = irrelevantPatterns.some(p => p.test(text));
    if (isIrrelevant) return null;
    
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    if (sorted[0][1] < 1) return null; // Need at least 1 keyword match
    
    return {
        primary: sorted[0][0],
        secondary: sorted.length > 1 ? sorted[1][0] : null,
        relevanceScore: sorted[0][1],
        allTags: sorted.filter(s => s[1] >= 1).map(s => s[0])
    };
}

// ========== MAIN FETCH FUNCTION ==========

async function fetchCurrentAffairs() {
    console.log(`[${new Date().toISOString()}] Starting current affairs fetch...`);
    const allRawArticles = [];
    const errors = [];

    // Step 1: Fetch ALL articles from feeds (no filtering yet)
    for (const feed of FEEDS) {
        try {
            const result = await parser.parseURL(feed.url);
            for (const item of result.items.slice(0, 20)) {
                allRawArticles.push({
                    id: `ca-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                    title: item.title?.trim(),
                    content: (item.contentSnippet || item.content || '').substring(0, 500).trim(),
                    source: feed.source,
                    tier: feed.tier,
                    date: item.isoDate || item.pubDate || new Date().toISOString(),
                    link: item.link,
                });
            }
            console.log(`  ✓ ${feed.source}`);
        } catch (err) {
            errors.push({ source: feed.source, error: err.message });
            console.log(`  ✗ ${feed.source}: ${err.message}`);
        }
    }

    // Deduplicate
    const seen = new Set();
    const unique = allRawArticles.filter(a => {
        const key = a.title?.toLowerCase().substring(0, 60);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by tier (Tier 1 first)
    unique.sort((a, b) => a.tier - b.tier);

    console.log(`[CA] Fetched ${unique.length} unique articles. Starting classification...`);

    // Step 2: AI Classification (PRIMARY) - send ALL articles to AI
    let classifiedArticles = [];
    const aiResults = await classifyWithAI(unique);
    
    if (aiResults) {
        // AI is available - use its classification
        let aiClassified = 0;
        let aiRejected = 0;
        let aiFailed = 0;
        
        for (const { article, aiResult } of aiResults) {
            if (!aiResult) {
                // AI failed for this article - use keyword fallback
                const keywordResult = categorizeArticleKeyword(article.title, article.content);
                if (keywordResult && keywordResult.relevanceScore >= 2) {
                    classifiedArticles.push({
                        ...article,
                        subject: keywordResult.primary,
                        secondarySubject: keywordResult.secondary,
                        tags: keywordResult.allTags,
                        relevanceScore: keywordResult.relevanceScore,
                        classifiedBy: 'keyword-fallback'
                    });
                }
                aiFailed++;
            } else if (aiResult.relevant === false || aiResult.category === 'IRRELEVANT') {
                aiRejected++;
            } else if (aiResult.category && aiResult.category !== 'IRRELEVANT') {
                classifiedArticles.push({
                    ...article,
                    subject: aiResult.category,
                    secondarySubject: null,
                    tags: [aiResult.category],
                    relevanceScore: 5, // AI-classified = high confidence
                    classifiedBy: 'ai',
                    aiReason: aiResult.reason || ''
                });
                aiClassified++;
            }
        }
        
        console.log(`[CA-AI] Classification complete: ${aiClassified} relevant, ${aiRejected} rejected, ${aiFailed} fallback`);
    } else {
        // AI unavailable - use keyword classification as fallback
        console.log('[CA] AI unavailable. Using keyword classification (fallback)...');
        for (const article of unique) {
            const category = categorizeArticleKeyword(article.title, article.content);
            if (category && category.relevanceScore >= 2) {
                classifiedArticles.push({
                    ...article,
                    subject: category.primary,
                    secondarySubject: category.secondary,
                    tags: category.allTags,
                    relevanceScore: category.relevanceScore,
                    classifiedBy: 'keyword'
                });
            }
        }
        console.log(`[CA] Keyword classification: ${classifiedArticles.length} articles passed`);
    }

    // Sort by relevance then date
    classifiedArticles.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return new Date(b.date) - new Date(a.date);
    });

    let topArticles = classifiedArticles.slice(0, 80);

    const grouped = {};
    for (const article of topArticles) {
        if (!grouped[article.subject]) grouped[article.subject] = [];
        grouped[article.subject].push(article);
    }

    // Monthly compilation
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthlyPath = path.join(__dirname, '..', 'data', 'monthly', `${monthKey}.json`);
    let monthlyData = { month: monthKey, articles: [] };
    if (fs.existsSync(monthlyPath)) {
        monthlyData = JSON.parse(fs.readFileSync(monthlyPath, 'utf8'));
    }
    const existingTitles = new Set(monthlyData.articles.map(a => a.title?.toLowerCase().substring(0, 60)));
    const newForMonthly = topArticles.filter(a => !existingTitles.has(a.title?.toLowerCase().substring(0, 60)));
    monthlyData.articles.push(...newForMonthly);
    monthlyData.lastUpdated = now.toISOString();
    monthlyData.totalArticles = monthlyData.articles.length;
    fs.writeFileSync(monthlyPath, JSON.stringify(monthlyData, null, 2));

    const output = {
        lastUpdated: now.toISOString(),
        totalArticles: topArticles.length,
        sources: FEEDS.map(f => f.source),
        errors,
        bySubject: grouped,
        articles: topArticles
    };

    // ACCUMULATE: load existing articles, append new unique ones
    const dataDir = path.join(__dirname, '..', 'data');
    const caPath = path.join(dataDir, 'auto-current-affairs.json');
    let accumulated = { articles: [], bySubject: {} };
    if (fs.existsSync(caPath)) {
        try { accumulated = JSON.parse(fs.readFileSync(caPath, 'utf8')); } catch(e) {}
    }
    const existingCA = new Set((accumulated.articles || []).map(a => a.title?.toLowerCase().substring(0, 60)));
    const newArticles = topArticles.filter(a => !existingCA.has(a.title?.toLowerCase().substring(0, 60)));
    accumulated.articles = [...(accumulated.articles || []), ...newArticles];
    // Rebuild bySubject from all accumulated articles
    const allGrouped = {};
    for (const article of accumulated.articles) {
        if (!allGrouped[article.subject]) allGrouped[article.subject] = [];
        allGrouped[article.subject].push(article);
    }
    accumulated.bySubject = allGrouped;
    accumulated.lastUpdated = now.toISOString();
    accumulated.totalArticles = accumulated.articles.length;
    accumulated.sources = FEEDS.map(f => f.source);
    accumulated.errors = errors;
    fs.writeFileSync(caPath, JSON.stringify(accumulated, null, 2));

    // Save articles to MongoDB for permanent persistence
    try { const { saveArticles } = require('./db-storage'); await saveArticles(newArticles); } catch(e) {}

    console.log(`[${now.toISOString()}] Fetch complete: ${topArticles.length} articles | Monthly total: ${monthlyData.totalArticles}`);
    return output;
}

module.exports = { fetchCurrentAffairs, SUBJECT_KEYWORDS };
