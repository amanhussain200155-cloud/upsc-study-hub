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
    // Tier 3 - General
    // NDTV removed - brings irrelevant crime/accident news not useful for UPSC
];

// Note: Yojana and Kurukshetra don't have standard RSS feeds
// We'll add them as static monthly sources that the user can update or
// that the LLM can process when API key is provided

// UPSC Subject classification - comprehensive keyword mapping
const SUBJECT_KEYWORDS = {
    'Polity & Governance': [
        'parliament', 'supreme court', 'high court', 'constitution', 'amendment', 'bill passed',
        'election', 'governor', 'president', 'cabinet', 'lok sabha', 'rajya sabha', 'judiciary',
        'fundamental rights', 'directive principles', 'panchayat', 'municipality', 'federalism',
        'legislation', 'ordinance', 'tribunal', 'commission', 'ombudsman', 'lokpal', 'rti',
        'niti aayog', 'finance commission', 'cag', 'election commission', 'delimitation',
        'anti-defection', 'privilege', 'contempt', 'impeach', 'censure', 'adjournment',
        'money bill', 'finance bill', 'ordinance', 'article 370', 'article 356',
        'governor\'s role', 'state reorganization', 'union territory', 'special status',
        'cooperative federalism', 'competitive federalism', 'inter-state', 'gst council'
    ],
    'Economy': [
        'gdp', 'rbi', 'fiscal deficit', 'monetary policy', 'inflation', 'budget', 'tax reform',
        'gst', 'trade deficit', 'export', 'import', 'investment', 'fdi', 'fpi', 'stock',
        'banking', 'npa', 'msme', 'startup', 'digital economy', 'upi', 'fintech',
        'agriculture', 'farmer', 'msp', 'crop insurance', 'food security', 'pds',
        'employment', 'unemployment', 'poverty', 'subsidy', 'disinvestment', 'privatization',
        'rupee', 'dollar', 'forex', 'current account', 'balance of payments', 'imf',
        'world bank', 'adb', 'aiib', 'ndb', 'capital market', 'sebi', 'mutual fund',
        'cryptocurrency', 'digital rupee', 'cbdc', 'financial inclusion', 'microfinance',
        'production linked incentive', 'pli', 'make in india', 'atmanirbhar', 'self-reliant',
        'infrastructure', 'national monetization', 'asset monetization', 'public debt'
    ],
    'International Relations': [
        'india-china', 'india-pakistan', 'india-us', 'india-russia', 'india-japan', 'bilateral',
        'united nations', 'unsc', 'unga', 'g20', 'g7', 'brics', 'sco', 'asean', 'quad',
        'diplomacy', 'foreign policy', 'treaty', 'agreement', 'summit', 'state visit',
        'indo-pacific', 'south china sea', 'border dispute', 'lac', 'loc', 'mcmahon',
        'sanctions', 'nuclear deal', 'nato', 'european union', 'african union', 'global south',
        'refugee', 'migration', 'terrorism', 'security council reform', 'imf reform',
        'act east policy', 'neighbourhood first', 'look west', 'connect central asia',
        'indian ocean', 'string of pearls', 'belt and road', 'bri', 'quad plus',
        'vaccine diplomacy', 'climate diplomacy', 'multilateralism', 'rules-based order',
        'ctbt', 'npt', 'mtcr', 'nsg', 'wassenaar', 'australia group'
    ],
    'Science & Technology': [
        'isro', 'space mission', 'satellite', 'rocket', 'mars', 'moon', 'chandrayaan', 'gaganyaan',
        'artificial intelligence', 'machine learning', 'deep learning', 'quantum computing',
        'biotechnology', 'genome', 'crispr', 'gene editing', 'vaccine', 'drug discovery',
        'cyber security', 'digital india', '5g', '6g', 'semiconductor', 'chip fabrication',
        'renewable energy', 'solar power', 'hydrogen energy', 'nuclear energy', 'fusion reactor',
        'drdo', 'missile test', 'defense technology', 'supercomputer', 'nanotechnology',
        'blockchain', 'iot', 'internet of things', 'robotics', 'drone', 'uav',
        'telemedicine', 'digital health', 'precision medicine', 'stem cell',
        'electric vehicle', 'battery technology', 'lithium', 'rare earth',
        'deep sea mission', 'ocean exploration', 'polar research', 'arctic', 'antarctic'
    ],
    'Environment & Ecology': [
        'climate change', 'global warming', 'carbon emission', 'net zero', 'paris agreement',
        'biodiversity', 'wildlife', 'tiger', 'elephant', 'endangered species', 'extinction',
        'forest', 'deforestation', 'afforestation', 'mangrove', 'wetland', 'ramsar site',
        'pollution', 'air quality index', 'water pollution', 'plastic ban', 'waste management',
        'disaster', 'flood', 'earthquake', 'cyclone', 'drought', 'landslide', 'tsunami',
        'cop28', 'cop29', 'unfccc', 'ipcc', 'green hydrogen', 'circular economy',
        'national park', 'wildlife sanctuary', 'biosphere reserve', 'tiger reserve',
        'coral reef', 'ocean acidification', 'el nino', 'la nina', 'monsoon',
        'environmental impact assessment', 'eia', 'forest conservation act', 'wildlife protection act',
        'compensatory afforestation', 'campa', 'green tribunal', 'ngt',
        'sustainable development', 'sdg', 'ecological footprint', 'carbon credit',
        'ozone depletion', 'montreal protocol', 'kigali amendment', 'hfc'
    ],
    'Social Issues': [
        'education policy', 'nep', 'health policy', 'hospital', 'women empowerment', 'gender equality',
        'caste discrimination', 'reservation', 'tribal rights', 'scheduled tribe', 'scheduled caste',
        'poverty alleviation', 'nutrition', 'malnutrition', 'sanitation', 'swachh bharat',
        'population policy', 'census', 'demographic dividend', 'urbanization', 'smart city',
        'skill development', 'literacy', 'digital divide', 'right to education',
        'domestic violence', 'dowry', 'trafficking', 'child labour', 'minimum wage',
        'social security', 'pension', 'insurance', 'ayushman bharat', 'jan arogya',
        'mental health', 'substance abuse', 'elderly care', 'disability rights',
        'lgbtq', 'section 377', 'same-sex marriage', 'uniform civil code',
        'communalism', 'secularism', 'hate speech', 'mob lynching', 'custodial death'
    ],
    'History & Culture': [
        'archaeological survey', 'asi', 'heritage site', 'unesco', 'monument', 'excavation',
        'festival', 'temple', 'mosque', 'church', 'gurudwara', 'heritage',
        'classical dance', 'classical music', 'painting', 'sculpture', 'pottery',
        'freedom movement', 'independence day', 'republic day', 'gandhi jayanti',
        'ancient history', 'medieval history', 'mughal', 'british raj', 'colonial',
        'indus valley', 'harappan', 'vedic', 'maurya', 'gupta', 'chola', 'vijayanagara',
        'gi tag', 'geographical indication', 'intangible heritage', 'folk art',
        'sangeet natak akademi', 'sahitya akademi', 'lalit kala', 'padma awards'
    ],
    'Security & Defense': [
        'indian army', 'indian navy', 'indian air force', 'military exercise', 'defence budget',
        'terrorism', 'counter-terrorism', 'naxal', 'maoist', 'insurgency', 'border security',
        'bsf', 'crpf', 'nsa', 'nia', 'raw', 'intelligence bureau', 'ntro',
        'missile', 'nuclear deterrent', 'submarine', 'aircraft carrier', 'rafale',
        'ceasefire', 'surgical strike', 'afspa', 'national security', 'internal security',
        'left wing extremism', 'lwe', 'cyber warfare', 'hybrid warfare', 'grey zone',
        'arms procurement', 'defence corridor', 'indigenous defence', 'tejas', 'arjun',
        'coastal security', 'maritime domain', 'unlawful activities', 'uapa', 'nsa act'
    ],
    'Geography': [
        'earthquake', 'seismic zone', 'tectonic plate', 'volcanic', 'tsunami',
        'monsoon', 'cyclone', 'rainfall', 'drought', 'flood', 'cloudburst',
        'river', 'dam', 'irrigation', 'interlinking', 'glacier', 'himalaya',
        'ocean current', 'el nino', 'la nina', 'indian ocean dipole',
        'mineral', 'mining', 'coal', 'petroleum', 'natural gas', 'shale',
        'census', 'urbanization', 'migration', 'demographic', 'population',
        'agriculture', 'cropping pattern', 'soil', 'land use', 'desertification',
        'map', 'boundary', 'border', 'territory', 'island', 'coast'
    ]
};

function categorizeArticle(title, content) {
    const text = `${title} ${content || ''}`.toLowerCase();
    const scores = {};
    for (const [subject, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
        let score = 0;
        for (const keyword of keywords) {
            if (text.includes(keyword)) score++;
        }
        if (score > 0) scores[subject] = score;
    }
    // Prevent state/domestic news from being classified as International Relations
    const stateKeywords = ['tamil nadu', 'kerala', 'karnataka', 'andhra pradesh', 'telangana', 'maharashtra', 'rajasthan', 'bihar', 'uttar pradesh', 'madhya pradesh', 'gujarat', 'punjab', 'haryana', 'jharkhand', 'chhattisgarh', 'odisha', 'assam', 'west bengal', 'nagaland', 'manipur', 'mizoram', 'meghalaya', 'tripura', 'sikkim', 'arunachal', 'goa', 'himachal', 'uttarakhand', 'state budget', 'assembly', 'cm ', 'chief minister', 'panchayat', 'municipality', 'district', 'killed', 'murder', 'accident', 'crash', 'fire', 'flood', 'rain', 'bridge washed', 'landslide', 'blast', 'man killed', 'woman killed', 'body found', 'arrested'];
    const isStateDomestic = stateKeywords.some(kw => text.includes(kw)) && !text.includes('bilateral') && !text.includes('treaty') && !text.includes('summit') && !text.includes('foreign policy') && !text.includes('diplomatic');
    if (isStateDomestic && scores['International Relations']) {
        delete scores['International Relations'];
    }
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    return {
        primary: sorted[0][0],
        secondary: sorted.length > 1 ? sorted[1][0] : null,
        relevanceScore: sorted[0][1],
        allTags: sorted.filter(s => s[1] >= 2).map(s => s[0])
    };
}

async function fetchCurrentAffairs() {
    console.log(`[${new Date().toISOString()}] Starting current affairs fetch...`);
    const articles = [];
    const errors = [];

    for (const feed of FEEDS) {
        try {
            const result = await parser.parseURL(feed.url);
            for (const item of result.items.slice(0, 20)) {
                const category = categorizeArticle(item.title, item.contentSnippet || item.content);
                if (category && category.relevanceScore >= 2) {
                    articles.push({
                        id: `ca-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        title: item.title?.trim(),
                        content: (item.contentSnippet || item.content || '').substring(0, 500).trim(),
                        source: feed.source,
                        tier: feed.tier,
                        date: item.isoDate || item.pubDate || new Date().toISOString(),
                        link: item.link,
                        subject: category.primary,
                        secondarySubject: category.secondary,
                        tags: category.allTags,
                        relevanceScore: category.relevanceScore
                    });
                }
            }
            console.log(`  ✓ ${feed.source}`);
        } catch (err) {
            errors.push({ source: feed.source, error: err.message });
            console.log(`  ✗ ${feed.source}: ${err.message}`);
        }
    }

    // Deduplicate
    const seen = new Set();
    const unique = articles.filter(a => {
        const key = a.title?.toLowerCase().substring(0, 60);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    unique.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return new Date(b.date) - new Date(a.date);
    });

    const topArticles = unique.slice(0, 80);
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
    // Append new unique articles to monthly
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

    const dataDir = path.join(__dirname, '..', 'data');
    // ACCUMULATE: load existing articles, append new unique ones
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

    console.log(`[${now.toISOString()}] Fetch complete: ${topArticles.length} articles | Monthly total: ${monthlyData.totalArticles}`);
    return output;
}

module.exports = { fetchCurrentAffairs, SUBJECT_KEYWORDS };
