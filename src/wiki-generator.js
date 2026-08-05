const https = require('https');
const fs = require('fs');
const path = require('path');

// Complete mapping of UPSC syllabus topics to Wikipedia articles
const SYLLABUS_WIKI_MAP = {
    'Ancient History': [
        { topic: 'Indus Valley Civilization', articles: ['Indus_Valley_Civilisation', 'Mohenjo-daro', 'Lothal', 'Dholavira'] },
        { topic: 'Vedic Period', articles: ['Vedic_period', 'Rigveda', 'Upanishads'] },
        { topic: 'Buddhism', articles: ['Buddhism_in_India', 'Gautama_Buddha', 'Buddhist_councils'] },
        { topic: 'Jainism', articles: ['Jainism', 'Mahavira', 'Jain_philosophy'] },
        { topic: 'Maurya Empire', articles: ['Maurya_Empire', 'Ashoka', 'Arthashastra', 'Chandragupta_Maurya'] },
        { topic: 'Gupta Empire', articles: ['Gupta_Empire', 'Samudragupta', 'Aryabhata'] },
        { topic: 'Sangam Age', articles: ['Sangam_literature', 'Chera_dynasty', 'Chola_dynasty', 'Pandyan_dynasty'] },
        { topic: 'Post-Mauryan', articles: ['Shunga_Empire', 'Kushan_Empire', 'Satavahana_dynasty'] }
    ],
    'Medieval History': [
        { topic: 'Delhi Sultanate', articles: ['Delhi_Sultanate', 'Alauddin_Khalji', 'Muhammad_bin_Tughlaq'] },
        { topic: 'Vijayanagara Empire', articles: ['Vijayanagara_Empire', 'Krishnadevaraya'] },
        { topic: 'Mughal Empire', articles: ['Mughal_Empire', 'Akbar', 'Mughal_administration'] },
        { topic: 'Bhakti Movement', articles: ['Bhakti_movement', 'Kabir', 'Guru_Nanak'] },
        { topic: 'Maratha Empire', articles: ['Maratha_Empire', 'Shivaji', 'Peshwa'] }
    ],
    'Modern History': [
        { topic: 'British East India Company', articles: ['East_India_Company', 'Battle_of_Plassey', 'Battle_of_Buxar'] },
        { topic: 'Revolt of 1857', articles: ['Indian_Rebellion_of_1857'] },
        { topic: 'Indian National Movement', articles: ['Indian_National_Congress', 'Indian_independence_movement'] },
        { topic: 'Gandhi and Movements', articles: ['Mahatma_Gandhi', 'Non-cooperation_movement', 'Salt_March', 'Quit_India_movement'] },
        { topic: 'Partition of India', articles: ['Partition_of_India', 'Indian_Independence_Act_1947'] }
    ],
    'Polity': [
        { topic: 'Indian Constitution', articles: ['Constitution_of_India', 'Preamble_to_the_Constitution_of_India'] },
        { topic: 'Fundamental Rights', articles: ['Fundamental_rights_in_India'] },
        { topic: 'Parliament', articles: ['Parliament_of_India', 'Lok_Sabha', 'Rajya_Sabha'] },
        { topic: 'President', articles: ['President_of_India', 'Vice_President_of_India'] },
        { topic: 'Judiciary', articles: ['Supreme_Court_of_India', 'High_courts_of_India'] },
        { topic: 'Emergency', articles: ['State_of_Emergency_in_India'] },
        { topic: 'Panchayati Raj', articles: ['Panchayati_raj_(India)', '73rd_Amendment'] },
        { topic: 'Election Commission', articles: ['Election_Commission_of_India'] },
        { topic: 'Constitutional Amendments', articles: ['List_of_amendments_of_the_Constitution_of_India'] }
    ],
    'Geography': [
        { topic: 'Indian Physiography', articles: ['Geography_of_India', 'Himalayas', 'Indo-Gangetic_Plain', 'Deccan_Plateau'] },
        { topic: 'Indian Rivers', articles: ['Rivers_of_India', 'Ganges', 'Brahmaputra_River', 'Godavari'] },
        { topic: 'Indian Climate', articles: ['Climate_of_India', 'Monsoon_of_South_Asia'] },
        { topic: 'Plate Tectonics', articles: ['Plate_tectonics', 'Earthquake', 'Volcano'] },
        { topic: 'Ocean Currents', articles: ['Ocean_current', 'Gulf_Stream', 'Thermohaline_circulation'] },
        { topic: 'Indian Agriculture', articles: ['Agriculture_in_India', 'Green_Revolution_in_India'] },
        { topic: 'Indian Minerals', articles: ['Mining_in_India', 'Coal_in_India'] }
    ],
    'Economics': [
        { topic: 'Indian Economy Overview', articles: ['Economy_of_India'] },
        { topic: 'Reserve Bank of India', articles: ['Reserve_Bank_of_India', 'Monetary_policy_of_India'] },
        { topic: 'GST', articles: ['Goods_and_Services_Tax_(India)'] },
        { topic: 'Planning', articles: ['NITI_Aayog', 'Five-Year_Plans_of_India'] },
        { topic: 'Poverty', articles: ['Poverty_in_India'] },
        { topic: 'Banking', articles: ['Banking_in_India', 'Non-performing_asset'] },
        { topic: 'Foreign Trade', articles: ['Foreign_trade_of_India', 'Foreign_direct_investment_in_India'] }
    ],
    'Science': [
        { topic: 'ISRO', articles: ['Indian_Space_Research_Organisation', 'Chandrayaan-3', 'Gaganyaan'] },
        { topic: 'Nuclear India', articles: ['India_and_weapons_of_mass_destruction', 'Nuclear_power_in_India'] },
        { topic: 'Biotechnology', articles: ['Biotechnology', 'CRISPR_gene_editing', 'Genetically_modified_crops'] },
        { topic: 'Defense Tech', articles: ['Defence_Research_and_Development_Organisation', 'BrahMos'] },
        { topic: 'AI and Computing', articles: ['Artificial_intelligence', 'Quantum_computing', 'Blockchain'] }
    ],
    'Environment': [
        { topic: 'Biodiversity', articles: ['Biodiversity_hotspot', 'Wildlife_of_India'] },
        { topic: 'Climate Change', articles: ['Climate_change_in_India', 'Paris_Agreement'] },
        { topic: 'Protected Areas', articles: ['Protected_areas_of_India', 'National_parks_of_India'] },
        { topic: 'Environmental Laws', articles: ['Environmental_law_in_India', 'National_Green_Tribunal'] },
        { topic: 'Pollution', articles: ['Air_pollution_in_India', 'Water_pollution_in_India'] },
        { topic: 'Conventions', articles: ['Ramsar_Convention', 'CITES', 'Convention_on_Biological_Diversity'] }
    ],
    'Art & Culture': [
        { topic: 'Indian Dance', articles: ['Indian_classical_dance', 'Bharatanatyam', 'Kathak'] },
        { topic: 'Indian Architecture', articles: ['Indian_architecture', 'Hindu_temple_architecture'] },
        { topic: 'Indian Painting', articles: ['Indian_painting', 'Mughal_painting'] },
        { topic: 'UNESCO Sites', articles: ['List_of_World_Heritage_Sites_in_India'] }
    ]
};

// Fetch Wikipedia article content
function fetchWikiArticle(title) {
    return new Promise((resolve, reject) => {
        const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=0&explaintext=1&format=json&exsectionformat=plain&exlimit=1`;
        https.get(url, { headers: { 'User-Agent': 'UPSC-StudyHub/2.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const pages = parsed.query?.pages || {};
                    const page = Object.values(pages)[0];
                    resolve(page?.extract || '');
                } catch(e) { resolve(''); }
            });
        }).on('error', () => resolve(''));
    });
}

// Extract facts from text using pattern matching
function extractFacts(text, topic) {
    const facts = [];
    const sentences = text.split(/\.\s+/).filter(s => s.length > 30 && s.length < 300);

    for (const sentence of sentences) {
        // Look for factual sentences with numbers, dates, names
        if (/\d{4}/.test(sentence) || /founded|established|introduced|enacted|formed|created|launched|signed/i.test(sentence)) {
            facts.push(sentence.trim() + '.');
        }
        if (/known as|also called|referred to|is the|was the|are the/i.test(sentence)) {
            facts.push(sentence.trim() + '.');
        }
        if (/located in|situated in|found in|headquartered/i.test(sentence)) {
            facts.push(sentence.trim() + '.');
        }
        if (/consists of|comprises|includes|divided into|classified/i.test(sentence)) {
            facts.push(sentence.trim() + '.');
        }
    }
    return [...new Set(facts)].slice(0, 20); // Top 20 unique facts
}

// Generate UPSC-style tricky MCQ from facts
function generateMCQFromFact(fact, subject, topic, allFacts) {
    const questions = [];

    // Pattern 1: "Consider the following statements" (UPSC's favorite)
    if (allFacts.length >= 4) {
        const trueFacts = [];
        const falseFacts = [];

        // Pick 2 true facts and create 1 false by modifying a true fact
        const shuffledFacts = [...allFacts].sort(() => Math.random() - 0.5);
        for (const f of shuffledFacts) {
            if (f.length > 40 && f.length < 200 && trueFacts.length < 2) {
                trueFacts.push(f);
            }
        }

        if (trueFacts.length >= 2) {
            // Create a false statement by negating or altering a fact
            let falseSt = trueFacts[1];
            const yearMatch = falseSt.match(/(\d{4})/);
            if (yearMatch) {
                falseSt = falseSt.replace(yearMatch[1], String(parseInt(yearMatch[1]) + 7));
            } else {
                falseSt = falseSt.replace(/was|is|are|were/, 'was not');
            }

            // Randomly decide which statements are "correct"
            const pattern = Math.floor(Math.random() * 3);
            let answer, correctStatements;
            if (pattern === 0) {
                // Only statement 1 correct
                correctStatements = '1 only';
                answer = 0;
                return {
                    id: `wiki-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                    subject,
                    question: `Consider the following statements about ${topic}:\n1. ${trueFacts[0].substring(0, 150)}\n2. ${falseSt.substring(0, 150)}\nWhich of the statements given above is/are correct?`,
                    options: ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'],
                    answer: 0,
                    explanation: `Statement 1 is correct: ${trueFacts[0]}\nStatement 2 is incorrect. The actual fact is: ${trueFacts[1]}`,
                    source: 'Wikipedia (Auto)', generatedAt: new Date().toISOString()
                };
            } else if (pattern === 1) {
                // Both correct
                return {
                    id: `wiki-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                    subject,
                    question: `Consider the following statements about ${topic}:\n1. ${trueFacts[0].substring(0, 150)}\n2. ${trueFacts[1].substring(0, 150)}\nWhich of the statements given above is/are correct?`,
                    options: ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'],
                    answer: 2,
                    explanation: `Both statements are correct.\nStatement 1: ${trueFacts[0]}\nStatement 2: ${trueFacts[1]}`,
                    source: 'Wikipedia (Auto)', generatedAt: new Date().toISOString()
                };
            }
        }
    }

    // Pattern 2: "With reference to X, which is correct?" - 4 option factual
    if (fact.length > 50 && fact.length < 250) {
        const yearMatch = fact.match(/(\d{4})/);
        const nameMatch = fact.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);

        if (yearMatch || nameMatch) {
            // Create 3 wrong options by altering the fact
            const correctOption = fact.substring(0, 120);
            const wrongOptions = [];

            if (yearMatch) {
                const y = parseInt(yearMatch[1]);
                wrongOptions.push(fact.replace(yearMatch[1], String(y - 12)).substring(0, 120));
                wrongOptions.push(fact.replace(yearMatch[1], String(y + 8)).substring(0, 120));
            }
            if (nameMatch) {
                const otherNames = allFacts.filter(f => f !== fact).map(f => {
                    const m = f.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);
                    return m ? m[1] : null;
                }).filter(Boolean);
                if (otherNames.length > 0) {
                    wrongOptions.push(fact.replace(nameMatch[1], otherNames[0]).substring(0, 120));
                }
            }

            // Fill remaining wrong options
            while (wrongOptions.length < 3) {
                const otherFact = allFacts[Math.floor(Math.random() * allFacts.length)];
                if (otherFact !== fact) wrongOptions.push(otherFact.substring(0, 120));
                else wrongOptions.push('None of the above is correct');
            }

            const options = [correctOption, ...wrongOptions.slice(0, 3)];
            // Shuffle
            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }
            const answer = options.indexOf(correctOption);

            return {
                id: `wiki-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                subject,
                question: `With reference to ${topic}, which of the following statements is correct?`,
                options, answer,
                explanation: `The correct answer is: "${correctOption}". Source: Wikipedia article on ${topic}.`,
                source: 'Wikipedia (Auto)', generatedAt: new Date().toISOString()
            };
        }
    }

    // Pattern 3: "Which of the following is NOT correct?" (tricky negative)
    if (allFacts.length >= 3) {
        const trueFacts = allFacts.filter(f => f.length > 40 && f.length < 150).slice(0, 3);
        if (trueFacts.length >= 3) {
            // Modify one fact to make it false
            let falseFact = trueFacts[2];
            const numMatch = falseFact.match(/(\d+)/);
            if (numMatch) {
                falseFact = falseFact.replace(numMatch[1], String(parseInt(numMatch[1]) * 2 + 3));
            } else {
                falseFact = falseFact.replace(/largest|biggest|first|oldest/, 'smallest');
            }

            const options = [trueFacts[0].substring(0,120), trueFacts[1].substring(0,120), falseFact.substring(0,120), trueFacts[2].substring(0,120)];
            // Shuffle but track the false one
            const falseIdx = 2; // before shuffle
            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }
            const answer = options.indexOf(falseFact.substring(0,120));
            if (answer >= 0) {
                return {
                    id: `wiki-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                    subject,
                    question: `With reference to ${topic}, which of the following statements is NOT correct?`,
                    options, answer,
                    explanation: `The incorrect statement is: "${falseFact.substring(0,120)}". The correct fact is: ${trueFacts[2]}`,
                    source: 'Wikipedia (Auto)', generatedAt: new Date().toISOString()
                };
            }
        }
    }

    return null;
}

// Main function: fetch content and generate questions
async function generateFromWikipedia() {
    // Pick random subject and topic
    const subjects = Object.keys(SYLLABUS_WIKI_MAP);
    const subject = subjects[Math.floor(Math.random() * subjects.length)];
    const topics = SYLLABUS_WIKI_MAP[subject];
    const topicObj = topics[Math.floor(Math.random() * topics.length)];

    console.log(`[WIKI-GEN] Fetching: ${subject} → ${topicObj.topic}`);

    // Fetch 1-2 articles for this topic
    const articles = topicObj.articles.slice(0, 2);
    let allText = '';
    for (const article of articles) {
        const text = await fetchWikiArticle(article);
        allText += text + ' ';
        await new Promise(r => setTimeout(r, 500)); // Rate limit courtesy
    }

    if (allText.length < 200) {
        console.log(`[WIKI-GEN] Insufficient content for ${topicObj.topic}`);
        return { generated: 0 };
    }

    // Extract facts and generate questions
    const facts = extractFacts(allText, topicObj.topic);
    const questions = [];

    for (const fact of facts.slice(0, 8)) {
        const q = generateMCQFromFact(fact, subject, topicObj.topic, facts);
        if (q) questions.push(q);
    }

    // Also generate flashcards from facts
    const flashcards = facts.slice(0, 5).map((fact, i) => ({
        id: `wfc-${Date.now()}-${i}`,
        subject: subject,
        front: `Key fact about ${topicObj.topic}:`,
        back: fact
    }));

    if (questions.length === 0 && flashcards.length === 0) {
        console.log(`[WIKI-GEN] Could not generate questions for ${topicObj.topic}`);
        return { generated: 0 };
    }

    // Save questions
    const genPath = path.join(__dirname, '..', 'data', 'generated-mcqs.json');
    let existing = { questions: [] };
    if (fs.existsSync(genPath)) existing = JSON.parse(fs.readFileSync(genPath, 'utf8'));
    existing.questions.push(...questions);
    existing.lastGenerated = new Date().toISOString();
    existing.totalQuestions = existing.questions.length;
    fs.writeFileSync(genPath, JSON.stringify(existing, null, 2));

    // Save flashcards
    const fcPath = path.join(__dirname, '..', 'data', 'flashcards.json');
    let fcData = { prelims: [], mains: [], interview: [] };
    if (fs.existsSync(fcPath)) fcData = JSON.parse(fs.readFileSync(fcPath, 'utf8'));
    fcData.prelims.push(...flashcards);
    fs.writeFileSync(fcPath, JSON.stringify(fcData, null, 2));

    console.log(`[WIKI-GEN] Generated ${questions.length} questions + ${flashcards.length} flashcards from ${topicObj.topic}. Total: ${existing.totalQuestions} Qs`);
    return { generated: questions.length, flashcards: flashcards.length, topic: topicObj.topic, total: existing.totalQuestions };
}

module.exports = { generateFromWikipedia, SYLLABUS_WIKI_MAP };
