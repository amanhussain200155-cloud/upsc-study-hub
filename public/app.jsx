const { useState, useEffect, useMemo, useCallback } = React;

function useData(url) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        setLoading(true);
        fetch(url).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    }, [url]);
    return { data, loading };
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Record attempt to backend
async function recordAttemptAPI(questionId, subject, isCorrect, questionData) {
    try {
        await fetch('/api/revision/attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questionId, subject, isCorrect, questionData })
        });
    } catch(e) {}
}

// Bookmark API
async function bookmarkAPI(item) {
    await fetch('/api/revision/bookmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
    });
}

async function removeBookmarkAPI(id) {
    await fetch(`/api/revision/bookmark/${id}`, { method: 'DELETE' });
}

// ========== QUIZ COMPONENT (UNLIMITED) ==========
function QuizMode({ questions, showBookmark = true }) {
    const [pool, setPool] = useState([]);
    const [idx, setIdx] = useState(0);
    const [selected, setSelected] = useState(null);
    const [showExp, setShowExp] = useState(false);
    const [score, setScore] = useState(0);
    const [answered, setAnswered] = useState(0);
    const [round, setRound] = useState(1);
    const [bookmarked, setBookmarked] = useState(new Set());

    useEffect(() => {
        if (questions.length > 0) {
            setPool(shuffle(questions));
            setIdx(0); setSelected(null); setShowExp(false); setScore(0); setAnswered(0); setRound(1);
        }
    }, [questions]);

    if (pool.length === 0) return <p className="empty-msg">No questions available for this filter.</p>;

    // Unlimited mode: when we exhaust pool, reshuffle
    const q = pool[idx % pool.length];

    const handleSelect = (optIdx) => {
        if (selected !== null) return;
        setSelected(optIdx);
        setShowExp(true);
        setAnswered(a => a + 1);
        const correct = optIdx === q.answer;
        if (correct) setScore(s => s + 1);
        recordAttemptAPI(q.id, q.subject, correct, q);
    };

    const handleNext = () => {
        if (idx + 1 >= pool.length) {
            // Reshuffle for next round
            setPool(shuffle(questions));
            setIdx(0);
            setRound(r => r + 1);
        } else {
            setIdx(i => i + 1);
        }
        setSelected(null); setShowExp(false);
    };

    const handleBookmark = () => {
        bookmarkAPI({ id: q.id, type: 'question', subject: q.subject, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation });
        setBookmarked(prev => new Set([...prev, q.id]));
    };

    return (
        <div>
            <div className="progress-bar"><div className="progress-fill" style={{width: `${((idx + 1) / pool.length) * 100}%`}}></div></div>
            <div className="stats-bar">
                <div className="stat-item"><div className="stat-value">{score}</div><div className="stat-label">Correct</div></div>
                <div className="stat-item"><div className="stat-value">{answered}</div><div className="stat-label">Attempted</div></div>
                <div className="stat-item"><div className="stat-value">{answered > 0 ? Math.round((score/answered)*100) : 0}%</div><div className="stat-label">Accuracy</div></div>
                <div className="stat-item"><div className="stat-value">R{round}</div><div className="stat-label">Round</div></div>
                <div className="stat-item" style={{cursor:'pointer',border:'1px solid #ef4444'}} onClick={() => {setPool(shuffle(questions));setIdx(0);setSelected(null);setShowExp(false);setScore(0);setAnswered(0);setRound(1);}} title="Reset Quiz"><div className="stat-value" style={{fontSize:'1rem'}}>🔄</div><div className="stat-label">Reset</div></div>
            </div>
            <div className="quiz-card">
                <div className="quiz-meta">
                    <span className="quiz-subject">{q.subject}</span>
                    <div>
                        {showBookmark && <span className="bookmark-btn" onClick={handleBookmark} title={bookmarked.has(q.id) ? 'Bookmarked' : 'Bookmark'}>{bookmarked.has(q.id) ? '✅' : '🔖'}</span>}
                        <span className="quiz-number">Q{idx + 1}/{pool.length}</span>
                    </div>
                </div>
                <p className="quiz-question" style={{whiteSpace:'pre-line'}}>{q.question}</p>
                <div className="quiz-options">
                    {q.options.map((opt, i) => {
                        let cls = 'quiz-option';
                        if (selected !== null) {
                            if (i === q.answer) cls += ' correct';
                            else if (i === selected && i !== q.answer) cls += ' wrong';
                        }
                        return <div key={i} className={cls} onClick={() => handleSelect(i)}>{opt}</div>;
                    })}
                </div>
                {showExp && <div className="explanation"><strong>Explanation: </strong>{q.explanation}</div>}
                {showExp && q.articleContent && (
                    <div style={{marginTop:'12px',padding:'14px',background:'#0f172a',borderRadius:'8px',borderLeft:'3px solid #60a5fa'}}>
                        <strong style={{color:'#60a5fa',fontSize:'0.85rem'}}>📰 Source Article:</strong>
                        <p style={{color:'#e2e8f0',fontSize:'0.9rem',marginTop:'6px',fontWeight:'500'}}>{q.sourceArticle}</p>
                        <p style={{color:'#94a3b8',fontSize:'0.85rem',marginTop:'6px',lineHeight:'1.5'}}>{q.articleContent}</p>
                        {q.articleSource && <p style={{color:'#64748b',fontSize:'0.75rem',marginTop:'6px'}}>Source: {q.articleSource}</p>}
                        {q.articleLink && <a href={q.articleLink} target="_blank" rel="noopener" style={{color:'#60a5fa',fontSize:'0.8rem'}}>Read full article →</a>}
                    </div>
                )}
                {showExp && !q.articleContent && q.sourceArticle && (
                    <p style={{color:'#64748b',fontSize:'0.8rem',marginTop:'8px'}}>📰 Based on: {q.sourceArticle}</p>
                )}
            </div>
            <div className="controls">
                <button className="btn btn-secondary" onClick={() => { setIdx(Math.max(0, idx - 1)); setSelected(null); setShowExp(false); }}>← Previous</button>
                <button className="btn btn-primary" onClick={handleNext}>Next →</button>
            </div>
        </div>
    );
}

// ========== FLASHCARD ==========
function FlashcardMode({ cards }) {
    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [shuffled, setShuffled] = useState([]);
    const [bookmarked, setBookmarked] = useState(new Set());
    useEffect(() => { setShuffled(shuffle(cards)); setIdx(0); setFlipped(false); }, [cards]);
    if (shuffled.length === 0) return <p className="empty-msg">No flashcards available.</p>;
    const card = shuffled[idx];
    const handleBookmark = () => {
        bookmarkAPI({id:card.id||('flash-'+card.front?.substring(0,20)),type:'flashcard',subject:card.subject,title:card.front,content:card.back,question:card.front});
        setBookmarked(prev => new Set([...prev, idx]));
    };
    return (
        <div>
            <div className="progress-bar"><div className="progress-fill" style={{width:`${((idx+1)/shuffled.length)*100}%`}}></div></div>
            <p style={{textAlign:'center',color:'#64748b',marginBottom:'16px',fontSize:'0.85rem'}}>Card {idx+1} of {shuffled.length} • Click to flip</p>
            <div className="flashcard-container">
                <div className="flashcard" onClick={() => setFlipped(!flipped)}>
                    <div className="flashcard-label">{flipped ? '💡 Answer' : '❓ Question'}</div>
                    {!flipped ? <div className="flashcard-front">{card.front}</div> : <div className="flashcard-back">{card.back}</div>}
                    <div className="flashcard-subject">{card.subject}</div>
                </div>
            </div>
            <div className="controls">
                <button className="btn btn-secondary" onClick={() => {setFlipped(false);setIdx((idx-1+shuffled.length)%shuffled.length);}}>← Prev</button>
                <button className="btn btn-primary" onClick={handleBookmark}>{bookmarked.has(idx)?'✅ Saved':'🔖 Bookmark'}</button>
                <button className="btn btn-primary" onClick={() => {setShuffled(shuffle(cards));setIdx(0);setFlipped(false);}}>🔀 Shuffle</button>
                <button className="btn btn-secondary" onClick={() => {setFlipped(false);setIdx((idx+1)%shuffled.length);}}>Next →</button>
            </div>
        </div>
    );
}

// ========== MAINS ==========
function MainsMode({ questions }) {
    const [idx, setIdx] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [bookmarked, setBookmarked] = useState(new Set());
    useEffect(() => { setIdx(0); setShowAnswer(false); }, [questions]);
    if (!questions?.length) return <p className="empty-msg">No questions available.</p>;
    const q = questions[idx];
    const handleBookmark = () => {
        bookmarkAPI({id:q.id||('mains-'+idx),type:'mains',subject:q.subject,title:q.question,content:q.model_answer||'',question:q.question,keyPoints:q.keyPoints});
        setBookmarked(prev => new Set([...prev, idx]));
    };
    return (
        <div>
            <div className="progress-bar"><div className="progress-fill" style={{width:`${((idx+1)/questions.length)*100}%`}}></div></div>
            <div className="quiz-card">
                <div className="quiz-meta">
                    <span className="quiz-subject">{q.subject}</span>
                    <div>
                        <span style={{cursor:'pointer',marginRight:'10px'}} onClick={handleBookmark} title="Bookmark">{bookmarked.has(idx)?'✅':'🔖'}</span>
                        <span className="quiz-number">Q{idx+1}/{questions.length}</span>
                    </div>
                </div>
                <p className="quiz-question">{q.question}</p>
                {!showAnswer ? (
                    <div>
                        <p style={{color:'#94a3b8',fontSize:'0.85rem',marginBottom:'12px'}}>💡 Write 250 words before revealing model answer.</p>
                        <h4 style={{color:'#eab308',marginBottom:'10px',fontSize:'0.9rem'}}>Key Points:</h4>
                        <ul style={{color:'#cbd5e1',paddingLeft:'20px'}}>{q.keyPoints?.map((p,i) => <li key={i} style={{marginBottom:'6px',fontSize:'0.9rem'}}>{p}</li>)}</ul>
                    </div>
                ) : (
                    <div className="explanation" style={{borderLeftColor:'#22c55e'}}><strong style={{color:'#22c55e'}}>Model Answer:</strong><div style={{marginTop:'12px',whiteSpace:'pre-wrap',lineHeight:'1.7'}}>{q.model_answer}</div></div>
                )}
            </div>
            <div className="controls">
                <button className="btn btn-secondary" onClick={() => {setShowAnswer(false);setIdx((idx-1+questions.length)%questions.length);}}>← Prev</button>
                <button className="btn btn-success" onClick={() => setShowAnswer(!showAnswer)}>{showAnswer ? 'Hide' : 'Show Model Answer'}</button>
                <button className="btn btn-secondary" onClick={() => {setShowAnswer(false);setIdx((idx+1)%questions.length);}}>Next →</button>
            </div>
        </div>
    );
}

// ========== INTERVIEW ==========
function InterviewMode({ questions }) {
    const [idx, setIdx] = useState(0);
    const [showTips, setShowTips] = useState(false);
    const [showFU, setShowFU] = useState(false);
    const [showModel, setShowModel] = useState(false);
    const [bookmarked, setBookmarked] = useState(new Set());
    if (!questions?.length) return <p className="empty-msg">No questions available.</p>;
    const q = questions[idx];
    const handleBookmark = () => {
        bookmarkAPI({id:q.id||('interview-'+idx),type:'interview',subject:q.category,title:q.question,content:q.model_answer||'',question:q.question,tips:q.tips,followUps:q.followUps});
        setBookmarked(prev => new Set([...prev, idx]));
    };
    return (
        <div>
            <div className="progress-bar"><div className="progress-fill" style={{width:`${((idx+1)/questions.length)*100}%`}}></div></div>
            <div className="interview-card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                    <span className="interview-category">{q.category}</span>
                    <span style={{cursor:'pointer'}} onClick={handleBookmark} title="Bookmark">{bookmarked.has(idx)?'✅':'🔖'}</span>
                </div>
                <p className="interview-question">{q.question}</p>
                <p style={{color:'#64748b',fontSize:'0.85rem',marginBottom:'16px'}}>🎯 Think for 1-2 minutes, then respond as in a real interview.</p>
                {!showTips ? <button className="btn btn-primary" onClick={() => setShowTips(true)}>Show Guidance</button> : (
                    <div>
                        <h4 style={{color:'#eab308',marginBottom:'10px',fontSize:'0.9rem'}}>Tips:</h4>
                        <ul className="interview-tips">{q.tips?.map((t,i) => <li key={i}>{t}</li>)}</ul>
                        {q.model_answer && (
                            <div style={{marginTop:'16px'}}>
                                <button className="btn btn-success" onClick={() => setShowModel(!showModel)}>{showModel ? 'Hide' : 'Show'} Model Answer</button>
                                {showModel && (
                                    <div className="explanation" style={{borderLeftColor:'#22c55e',marginTop:'12px'}}>
                                        <strong style={{color:'#22c55e'}}>Model Answer:</strong>
                                        <div style={{marginTop:'8px',whiteSpace:'pre-wrap',lineHeight:'1.7'}}>{q.model_answer}</div>
                                    </div>
                                )}
                            </div>
                        )}
                        {q.followUps && <div style={{marginTop:'16px'}}>
                            <button className="btn btn-secondary" onClick={() => setShowFU(!showFU)}>{showFU ? 'Hide' : 'Show'} Follow-ups</button>
                            {showFU && <ul style={{marginTop:'12px',color:'#f97316',paddingLeft:'20px'}}>{q.followUps.map((f,i) => <li key={i} style={{marginBottom:'8px'}}>{f}</li>)}</ul>}
                        </div>}
                    </div>
                )}
            </div>
            <div className="controls">
                <button className="btn btn-secondary" onClick={() => {setShowTips(false);setShowFU(false);setShowModel(false);setIdx((idx-1+questions.length)%questions.length);}}>← Prev</button>
                <button className="btn btn-secondary" onClick={() => {setShowTips(false);setShowFU(false);setShowModel(false);setIdx((idx+1)%questions.length);}}>Next →</button>
            </div>
        </div>
    );
}

// ========== CURRENT AFFAIRS ==========
function CurrentAffairsMode() {
    const { data, loading } = useData('/api/current-affairs');
    const [filter, setFilter] = useState('All');
    const [expanded, setExpanded] = useState(null);
    if (loading) return <p className="empty-msg">📡 Fetching current affairs...</p>;
    if (!data?.articles?.length) return <p className="empty-msg">No current affairs yet. Auto-fetch runs every 4 hours.</p>;
    const subjects = ['All', ...Object.keys(data.bySubject || {})];
    const articles = filter === 'All' ? data.articles : (data.bySubject[filter] || []);
    return (
        <div>
            <div className="current-affairs-banner">
                <h3>📡 Live Current Affairs</h3>
                <p>Last: {new Date(data.lastUpdated).toLocaleString()} • {data.totalArticles} articles • Auto-refreshes every 4h</p>
            </div>
            <div className="subject-filter">{subjects.map(s => <div key={s} className={`subject-btn ${filter===s?'active':''}`} onClick={() => setFilter(s)}>{s} {s!=='All' && data.bySubject[s] ? `(${data.bySubject[s].length})`:''}</div>)}</div>
            {articles.slice(0, 30).map((a, i) => (
                <div key={i} className="quiz-card" style={{cursor:'pointer'}} onClick={() => setExpanded(expanded===i?null:i)}>
                    <div className="quiz-meta"><span className="quiz-subject">{a.subject}</span><span className="quiz-number">{new Date(a.date).toLocaleDateString()}</span></div>
                    <h3 style={{color:'#f1f5f9',marginBottom:'8px',fontSize:'1rem'}}>{a.title}</h3>
                    {expanded===i ? (
                        <div>
                            <p style={{color:'#cbd5e1',fontSize:'0.9rem',lineHeight:'1.6',marginBottom:'12px'}}>{a.content}</p>
                            <p style={{color:'#eab308',fontSize:'0.8rem'}}>📎 Relevant for: {a.subject}{a.secondarySubject ? ` | ${a.secondarySubject}`:''}</p>
                            <p style={{color:'#64748b',fontSize:'0.75rem',marginTop:'4px'}}>Source: {a.source}</p>
                            <div style={{marginTop:'8px'}}>
                                {a.link && <a href={a.link} target="_blank" rel="noopener" style={{color:'#60a5fa',fontSize:'0.8rem',marginRight:'12px'}}>Read full →</a>}
                                <span style={{color: '#f97316',fontSize:'0.8rem',cursor:'pointer'}} onClick={(e) => {e.stopPropagation(); bookmarkAPI({id:a.id,type:'article',subject:a.subject,title:a.title,content:a.content,source:a.source,link:a.link}); e.target.textContent='✅ Bookmarked'}}>🔖 Bookmark</span>
                            </div>
                        </div>
                    ) : <p style={{color:'#94a3b8',fontSize:'0.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.content}</p>}
                </div>
            ))}
        </div>
    );
}

// ========== MONTHLY COMPILATION ==========
function MonthlyArticleCard({ article: a }) {
    const [expanded, setExpanded] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);
    return (
        <div className="quiz-card" style={{padding:'16px',cursor:'pointer'}} onClick={() => setExpanded(!expanded)}>
            <div className="quiz-meta"><span className="quiz-subject">{a.subject}</span><span className="quiz-number">{new Date(a.date).toLocaleDateString()}</span></div>
            <p style={{color:'#f1f5f9',fontSize:'0.9rem'}}>{a.title}</p>
            {expanded ? (
                <div style={{marginTop:'10px'}}>
                    {a.content && <p style={{color:'#cbd5e1',fontSize:'0.85rem',lineHeight:'1.6',marginBottom:'10px'}}>{a.content}</p>}
                    <p style={{color:'#64748b',fontSize:'0.75rem'}}>Source: {a.source}</p>
                    <div style={{marginTop:'8px',display:'flex',gap:'12px',flexWrap:'wrap'}}>
                        {a.link && <a href={a.link} target="_blank" rel="noopener" style={{color:'#60a5fa',fontSize:'0.8rem'}} onClick={e=>e.stopPropagation()}>Read full article →</a>}
                        <span style={{color:bookmarked?'#22c55e':'#f97316',fontSize:'0.8rem',cursor:'pointer'}} onClick={(e) => {e.stopPropagation();bookmarkAPI({id:a.id||('monthly-'+a.title?.substring(0,30)),type:'article',subject:a.subject,title:a.title,content:a.content,source:a.source,link:a.link});setBookmarked(true);}}>{bookmarked?'✅ Bookmarked':'🔖 Bookmark'}</span>
                    </div>
                </div>
            ) : (
                <p style={{color:'#94a3b8',fontSize:'0.8rem',marginTop:'4px'}}>{a.source} • Click to expand</p>
            )}
        </div>
    );
}

function MonthlyMode() {
    const { data } = useData('/api/monthly');
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [monthData, setMonthData] = useState(null);

    useEffect(() => {
        if (selectedMonth) {
            fetch(`/api/monthly/${selectedMonth}`).then(r=>r.json()).then(setMonthData);
        }
    }, [selectedMonth]);

    if (!data?.months?.length) return <p className="empty-msg">Monthly compilations will appear after the first fetch cycle.</p>;

    if (selectedMonth && monthData) {
        const grouped = {};
        monthData.articles?.forEach(a => { if(!grouped[a.subject]) grouped[a.subject]=[]; grouped[a.subject].push(a); });
        return (
            <div>
                <button className="btn btn-secondary" onClick={() => {setSelectedMonth(null);setMonthData(null);}}>← Back to months</button>
                <h3 style={{color:'#eab308',margin:'16px 0',textAlign:'center'}}>📅 {selectedMonth} ({monthData.totalArticles} articles)</h3>
                {Object.entries(grouped).map(([subj, arts]) => (
                    <div key={subj}>
                        <h4 style={{color:'#f97316',margin:'16px 0 8px',fontSize:'0.9rem'}}>{subj} ({arts.length})</h4>
                        {arts.map((a,i) => (
                            <MonthlyArticleCard key={i} article={a} />
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div>
            <div className="current-affairs-banner"><h3>📅 Monthly Compilations</h3><p>Auto-compiled from daily current affairs</p></div>
            {data.months.map(m => (
                <div key={m.month} className="quiz-card" style={{cursor:'pointer'}} onClick={() => setSelectedMonth(m.month)}>
                    <div className="quiz-meta"><span className="quiz-subject">{m.month}</span><span className="quiz-number">{m.totalArticles} articles</span></div>
                    <p style={{color:'#94a3b8',fontSize:'0.85rem'}}>Last updated: {new Date(m.lastUpdated).toLocaleDateString()}</p>
                </div>
            ))}
        </div>
    );
}

// ========== BOOKMARK CARD (expandable) ==========
function BookmarkCard({ bookmark: b, onRemove }) {
    const [expanded, setExpanded] = useState(false);
    const typeLabels = {question:'📝 Prelims MCQ',article:'📰 Article',mains:'✍️ Mains',interview:'🎤 Interview',flashcard:'🗂️ Flashcard',essay:'📄 Essay'};
    const typeLabel = typeLabels[b.type] || '📌 Saved';
    
    return (
        <div className="quiz-card" style={{cursor:'pointer'}} onClick={() => setExpanded(!expanded)}>
            <div className="quiz-meta">
                <span className="quiz-subject">{b.subject}</span>
                <div>
                    <span style={{color:'#64748b',fontSize:'0.7rem',marginRight:'10px'}}>{typeLabel}</span>
                    <span style={{color:'#ef4444',cursor:'pointer',fontSize:'0.8rem'}} onClick={(e) => {e.stopPropagation(); onRemove();}}>✕</span>
                </div>
            </div>
            <p style={{color:'#f1f5f9',fontSize:'0.95rem',fontWeight:'500'}}>{b.question || b.title}</p>
            
            {!expanded && (
                <p style={{color:'#64748b',fontSize:'0.8rem',marginTop:'6px'}}>Tap to expand ▾</p>
            )}
            
            {expanded && (
                <div style={{marginTop:'12px',borderTop:'1px solid #334155',paddingTop:'12px'}}>
                    {/* MCQ / Prelims question */}
                    {b.type === 'question' && b.options && (
                        <div>
                            <div style={{marginBottom:'10px'}}>
                                {b.options.map((opt, i) => (
                                    <p key={i} style={{color: i === b.answer ? '#22c55e' : '#cbd5e1', fontSize:'0.9rem', padding:'6px 0', borderBottom:'1px solid #1e293b'}}>
                                        {i === b.answer ? '✓ ' : '  '}{opt}
                                    </p>
                                ))}
                            </div>
                            {b.explanation && <div style={{background:'#0f172a',padding:'12px',borderRadius:'6px',borderLeft:'3px solid #eab308'}}><p style={{color:'#cbd5e1',fontSize:'0.85rem',lineHeight:'1.6'}}><strong style={{color:'#eab308'}}>Explanation:</strong> {b.explanation}</p></div>}
                        </div>
                    )}
                    
                    {/* Article / Current Affairs / Monthly */}
                    {b.type === 'article' && (
                        <div>
                            {b.content && <p style={{color:'#cbd5e1',fontSize:'0.9rem',lineHeight:'1.7',whiteSpace:'pre-wrap'}}>{b.content}</p>}
                            {b.source && <p style={{color:'#64748b',fontSize:'0.75rem',marginTop:'8px'}}>Source: {b.source}</p>}
                            {b.link && <a href={b.link} target="_blank" rel="noopener" style={{color:'#60a5fa',fontSize:'0.85rem',marginTop:'8px',display:'inline-block'}} onClick={e=>e.stopPropagation()}>Read full article →</a>}
                        </div>
                    )}
                    
                    {/* Mains */}
                    {b.type === 'mains' && (
                        <div>
                            {b.keyPoints && b.keyPoints.length > 0 && (
                                <div style={{marginBottom:'12px'}}>
                                    <strong style={{color:'#eab308',fontSize:'0.85rem'}}>Key Points:</strong>
                                    <ul style={{paddingLeft:'20px',marginTop:'6px'}}>{b.keyPoints.map((p,i) => <li key={i} style={{color:'#cbd5e1',fontSize:'0.85rem',marginBottom:'4px'}}>{p}</li>)}</ul>
                                </div>
                            )}
                            {b.content && <div style={{background:'#0f172a',padding:'14px',borderRadius:'8px',borderLeft:'3px solid #22c55e'}}><strong style={{color:'#22c55e',fontSize:'0.85rem'}}>Model Answer:</strong><p style={{color:'#cbd5e1',fontSize:'0.9rem',lineHeight:'1.7',marginTop:'8px',whiteSpace:'pre-wrap'}}>{b.content}</p></div>}
                        </div>
                    )}
                    
                    {/* Interview */}
                    {b.type === 'interview' && (
                        <div>
                            {b.tips && b.tips.length > 0 && (
                                <div style={{marginBottom:'12px'}}>
                                    <strong style={{color:'#eab308',fontSize:'0.85rem'}}>Tips:</strong>
                                    <ul style={{paddingLeft:'20px',marginTop:'6px'}}>{b.tips.map((t,i) => <li key={i} style={{color:'#cbd5e1',fontSize:'0.85rem',marginBottom:'4px'}}>{t}</li>)}</ul>
                                </div>
                            )}
                            {b.content && <div style={{background:'#0f172a',padding:'14px',borderRadius:'8px',borderLeft:'3px solid #60a5fa'}}><strong style={{color:'#60a5fa',fontSize:'0.85rem'}}>Model Answer:</strong><p style={{color:'#cbd5e1',fontSize:'0.9rem',lineHeight:'1.7',marginTop:'8px',whiteSpace:'pre-wrap'}}>{b.content}</p></div>}
                            {b.followUps && b.followUps.length > 0 && (
                                <div style={{marginTop:'12px'}}>
                                    <strong style={{color:'#f97316',fontSize:'0.85rem'}}>Follow-up Questions:</strong>
                                    <ul style={{paddingLeft:'20px',marginTop:'6px'}}>{b.followUps.map((f,i) => <li key={i} style={{color:'#f97316',fontSize:'0.85rem',marginBottom:'4px'}}>{f}</li>)}</ul>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Flashcard */}
                    {b.type === 'flashcard' && (
                        <div>
                            <div style={{background:'#0f172a',padding:'14px',borderRadius:'8px',borderLeft:'3px solid #f97316'}}>
                                <strong style={{color:'#f97316',fontSize:'0.85rem'}}>Answer:</strong>
                                <p style={{color:'#cbd5e1',fontSize:'0.9rem',lineHeight:'1.7',marginTop:'8px',whiteSpace:'pre-wrap'}}>{b.content}</p>
                            </div>
                        </div>
                    )}
                    
                    {/* Essay */}
                    {b.type === 'essay' && (
                        <div>
                            {b.content && <div style={{background:'#0f172a',padding:'14px',borderRadius:'8px',borderLeft:'3px solid #eab308'}}><strong style={{color:'#eab308',fontSize:'0.85rem'}}>Essay Content:</strong><p style={{color:'#cbd5e1',fontSize:'0.9rem',lineHeight:'1.7',marginTop:'8px',whiteSpace:'pre-wrap'}}>{b.content}</p></div>}
                            {!b.content && <p style={{color:'#94a3b8',fontSize:'0.85rem',fontStyle:'italic'}}>Essay topic saved for practice. Use Essay Generator to write your attempt.</p>}
                        </div>
                    )}
                    
                    {/* Generic fallback for any type without specific rendering */}
                    {!['question','article','mains','interview','flashcard','essay'].includes(b.type) && (
                        <div>
                            {b.content && <p style={{color:'#cbd5e1',fontSize:'0.9rem',lineHeight:'1.7',whiteSpace:'pre-wrap'}}>{b.content}</p>}
                            {b.explanation && <p style={{color:'#94a3b8',fontSize:'0.85rem',marginTop:'8px',fontStyle:'italic'}}>{b.explanation}</p>}
                        </div>
                    )}
                    
                    {b.link && b.type !== 'article' && <a href={b.link} target="_blank" rel="noopener" style={{color:'#60a5fa',fontSize:'0.85rem',marginTop:'10px',display:'inline-block'}} onClick={e=>e.stopPropagation()}>Open source →</a>}
                    
                    <p style={{color:'#64748b',fontSize:'0.7rem',marginTop:'10px'}}>Saved: {b.bookmarkedAt ? new Date(b.bookmarkedAt).toLocaleDateString() : ''}</p>
                </div>
            )}
        </div>
    );
}

// ========== REVISION TAB ==========
function RevisionMode() {
    const [revData, setRevData] = useState(null);
    const [view, setView] = useState('overview'); // overview, wrong, bookmarks, due
    const [loading, setLoading] = useState(true);
    const profileName = window._upscProfileDisplay || localStorage.getItem('upsc_profile_display') || 'Student';

    const reload = () => {
        const profile = window._upscProfile || localStorage.getItem('upsc_profile');
        const url = profile ? `/api/profiles/${profile}` : '/api/revision';
        fetch(url).then(r=>r.json()).then(d => {
            // Normalize data shape for profile vs generic endpoint
            if (d.stats) {
                setRevData({
                    summary: {
                        totalAttempted: d.stats.totalAttempted || 0,
                        accuracy: d.stats.totalAttempted > 0 ? Math.round((d.stats.totalCorrect / d.stats.totalAttempted) * 100) : 0,
                        streakDays: d.stats.streakDays || 0,
                        revisionDueCount: (d.revisionQueue || []).filter(r => new Date(r.nextReview) <= new Date()).length,
                        subjectWise: d.stats.subjectWise || {}
                    },
                    wrongAnswers: d.wrongAnswers || [],
                    bookmarks: d.bookmarks || [],
                    dueRevisions: (d.revisionQueue || []).filter(r => new Date(r.nextReview) <= new Date())
                });
            } else {
                setRevData(d);
            }
            setLoading(false);
        });
    };
    useEffect(reload, []);

    if (loading) return <p className="empty-msg">Loading revision data...</p>;
    if (!revData) return <p className="empty-msg">No revision data yet. Start practicing!</p>;

    const { summary, wrongAnswers, bookmarks, dueRevisions } = revData;

    // Overview
    if (view === 'overview') {
        return (
            <div>
                <div className="current-affairs-banner" style={{borderColor:'#f97316'}}>
                    <h3>📊 {profileName}'s Study Dashboard</h3>
                    <p>Track progress, revise mistakes, revisit bookmarks</p>
                </div>
                <div className="stats-bar">
                    <div className="stat-item"><div className="stat-value">{summary.totalAttempted}</div><div className="stat-label">Attempted</div></div>
                    <div className="stat-item"><div className="stat-value">{summary.accuracy}%</div><div className="stat-label">Accuracy</div></div>
                    <div className="stat-item"><div className="stat-value">{summary.streakDays}</div><div className="stat-label">Day Streak</div></div>
                    <div className="stat-item"><div className="stat-value">{summary.revisionDueCount}</div><div className="stat-label">Due Today</div></div>
                </div>
                {/* Subject-wise breakdown */}
                {Object.keys(summary.subjectWise || {}).length > 0 && (
                    <div className="quiz-card">
                        <h4 style={{color:'#eab308',marginBottom:'12px'}}>Subject-wise Performance</h4>
                        {Object.entries(summary.subjectWise).map(([subj, stats]) => (
                            <div key={subj} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #334155'}}>
                                <span style={{color:'#e2e8f0',fontSize:'0.9rem'}}>{subj}</span>
                                <span style={{color: stats.attempted > 0 && (stats.correct/stats.attempted) >= 0.7 ? '#22c55e' : '#f97316', fontSize:'0.9rem'}}>
                                    {stats.correct}/{stats.attempted} ({stats.attempted > 0 ? Math.round(stats.correct/stats.attempted*100) : 0}%)
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                {/* Action buttons */}
                <div className="controls" style={{flexWrap:'wrap'}}>
                    {dueRevisions.length > 0 && <button className="btn btn-primary" onClick={() => setView('due')}>🔄 Revise Due ({dueRevisions.length})</button>}
                    {wrongAnswers.length > 0 && <button className="btn btn-secondary" onClick={() => setView('wrong')}>❌ Wrong Answers ({wrongAnswers.length})</button>}
                    {bookmarks.length > 0 && <button className="btn btn-secondary" onClick={() => setView('bookmarks')}>🔖 Bookmarks ({bookmarks.length})</button>}
                    <button className="btn btn-secondary" style={{borderColor:'#ef4444',color:'#ef4444',marginTop:'8px'}} onClick={() => {if(confirm('Reset ALL progress? This will clear all attempts, wrong answers, and bookmarks.')){const profile = window._upscProfile || localStorage.getItem('upsc_profile'); const url = profile ? `/api/profiles/${profile}/reset` : '/api/revision/reset'; fetch(url,{method:'POST'}).then(()=>reload())}}}>🗑️ Reset All Progress</button>
                </div>
            </div>
        );
    }

    // Wrong answers - quiz them again
    if (view === 'wrong') {
        const wrongQuestions = wrongAnswers.map(w => ({
            id: w.questionId, subject: w.subject, question: w.question,
            options: w.options, answer: w.answer, explanation: w.explanation
        })).filter(q => q.options && q.options.length > 0);
        return (
            <div>
                <button className="btn btn-secondary" onClick={() => setView('overview')} style={{marginBottom:'16px'}}>← Back</button>
                <div className="current-affairs-banner" style={{borderColor:'#ef4444'}}>
                    <h3>❌ Revise Wrong Answers ({wrongQuestions.length})</h3>
                    <p>These questions were answered incorrectly. Practice until you get them right!</p>
                </div>
                {wrongQuestions.length > 0 ? <QuizMode questions={wrongQuestions} showBookmark={false} /> : <p className="empty-msg">Great job! No wrong answers to revise.</p>}
            </div>
        );
    }

    // Due revisions (spaced repetition)
    if (view === 'due') {
        const dueQuestions = dueRevisions.map(d => ({
            id: d.questionId, subject: d.subject, question: d.question,
            options: d.options, answer: d.answer, explanation: d.explanation
        })).filter(q => q.options && q.options.length > 0);
        return (
            <div>
                <button className="btn btn-secondary" onClick={() => setView('overview')} style={{marginBottom:'16px'}}>← Back</button>
                <div className="current-affairs-banner" style={{borderColor:'#eab308'}}>
                    <h3>🔄 Due for Revision ({dueQuestions.length})</h3>
                    <p>Spaced repetition: these are scheduled for today</p>
                </div>
                {dueQuestions.length > 0 ? <QuizMode questions={dueQuestions} showBookmark={false} /> : <p className="empty-msg">Nothing due today! Come back tomorrow.</p>}
            </div>
        );
    }

    // Bookmarks
    if (view === 'bookmarks') {
        return (
            <div>
                <button className="btn btn-secondary" onClick={() => setView('overview')} style={{marginBottom:'16px'}}>← Back</button>
                <div className="current-affairs-banner" style={{borderColor:'#60a5fa'}}>
                    <h3>🔖 Bookmarks ({bookmarks.length})</h3>
                </div>
                {bookmarks.map((b, i) => (
                    <BookmarkCard key={i} bookmark={b} onRemove={() => {removeBookmarkAPI(b.id); reload();}} />
                ))}
                {bookmarks.length === 0 && <p className="empty-msg">No bookmarks yet. Use 🔖 while practicing to save items.</p>}
            </div>
        );
    }
}

// ========== STATS BADGE ==========
function StatsBadge() {
    const { data } = useData('/api/stats/detailed');
    const [showDetails, setShowDetails] = useState(false);
    if (!data) return null;
    const todayTotal = (data.prelims?.addedToday || 0) + (data.mainsToday || 0) + (data.interviewToday || 0) + (data.flashcardsToday || 0) + (data.modelEssaysToday || 0) + (data.caToday || 0);
    return (
        <div style={{marginTop:'12px'}}>
            <div style={{color:'#64748b',fontSize:'0.8rem',cursor:'pointer',textAlign:'center'}} onClick={() => setShowDetails(!showDetails)}>
                📊 {data.prelims?.total || 0} Prelims • {data.mains} Mains • {data.interview} Interview • {data.flashcards} Flashcards • {data.essays} Essays
                {todayTotal > 0 && <span style={{color:'#22c55e'}}> (+{todayTotal} today)</span>}
                <span style={{marginLeft:'8px',color:'#60a5fa'}}>{showDetails ? '▲' : '▼'}</span>
            </div>
            {showDetails && data.prelims?.bySubject && (
                <div style={{marginTop:'12px',padding:'16px',background:'#1e293b',borderRadius:'8px',border:'1px solid #334155'}}>
                    <h4 style={{color:'#eab308',marginBottom:'10px',fontSize:'0.85rem'}}>Questions by Subject (Prelims):</h4>
                    <div className="dashboard-grid">
                        {Object.entries(data.prelims.bySubject).sort((a,b) => b[1]-a[1]).map(([s,c]) => (
                            <div key={s} style={{display:'flex',justifyContent:'space-between',padding:'3px 8px',fontSize:'0.8rem'}}>
                                <span style={{color:'#cbd5e1'}}>{s}</span>
                                <span>
                                    <span style={{color:'#f97316',fontWeight:'bold'}}>{c}</span>
                                    {data.prelims.todayBySubject && data.prelims.todayBySubject[s] && <span style={{color:'#22c55e',marginLeft:'4px',fontSize:'0.7rem'}}>+{data.prelims.todayBySubject[s]}</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div style={{marginTop:'12px',borderTop:'1px solid #334155',paddingTop:'8px',fontSize:'0.8rem',color:'#94a3b8'}}>
                        <div>Mains: {data.mains} {data.mainsToday > 0 && <span style={{color:'#22c55e'}}>+{data.mainsToday}</span>}</div>
                        <div>Interview: {data.interview} {data.interviewToday > 0 && <span style={{color:'#22c55e'}}>+{data.interviewToday}</span>}</div>
                        <div>Flashcards: {data.flashcards} {data.flashcardsToday > 0 && <span style={{color:'#22c55e'}}>+{data.flashcardsToday}</span>}</div>
                        <div>Essay Topics: {data.essays} | Model Essays: {data.modelEssays} {data.modelEssaysToday > 0 && <span style={{color:'#22c55e'}}>+{data.modelEssaysToday}</span>}</div>
                        <div>Current Affairs Articles: {data.currentAffairs?.articles || 0} {data.caToday > 0 && <span style={{color:'#22c55e'}}>+{data.caToday}</span>}</div>
                        {data.dbCounts && data.dbCounts.questions > 0 && <div style={{marginTop:'4px',color:'#60a5fa',fontSize:'0.75rem'}}>📦 Stored in DB: {data.dbCounts.questions} MCQs • {data.dbCounts.flashcards} Flashcards • {data.dbCounts.mains} Mains • {data.dbCounts.interview} Interview • {data.dbCounts.essays} Essays • {data.dbCounts.articles} Articles</div>}
                        <div style={{marginTop:'4px',color:'#94a3b8',fontSize:'0.75rem'}}>📚 Manual additions: {data.prelims?.staticCount || 0} Prelims MCQs</div>
                    </div>
                    {todayTotal > 0 && (
                        <div style={{marginTop:'8px',padding:'8px',background:'#052e16',borderRadius:'4px',fontSize:'0.8rem',color:'#86efac'}}>
                            ✨ Today's additions: {data.prelims?.addedToday > 0 ? `${data.prelims.addedToday} Prelims MCQs` : ''}{data.mainsToday > 0 ? ` • ${data.mainsToday} Mains` : ''}{data.interviewToday > 0 ? ` • ${data.interviewToday} Interview` : ''}{data.flashcardsToday > 0 ? ` • ${data.flashcardsToday} Flashcards` : ''}{data.modelEssaysToday > 0 ? ` • ${data.modelEssaysToday} Essays` : ''}{data.caToday > 0 ? ` • ${data.caToday} Articles` : ''}
                        </div>
                    )}
                    <div style={{marginTop:'10px',borderTop:'1px solid #334155',paddingTop:'8px',fontSize:'0.75rem',color:'#64748b'}}>
                        <span style={{color:'#94a3b8'}}>Sources:</span> Drishti IAS Saraansh • The Hindu • Indian Express • PIB • Down to Earth • LiveMint
                    </div>
                </div>
            )}
        </div>
    );
}

// ========== PREVIOUS YEAR QUESTIONS ==========
function PYQMode() {
    const { data, loading } = useData('/api/questions/pyqs');
    const [yearFilter, setYearFilter] = useState('All');
    if (loading) return <p className="empty-msg">Loading PYQs...</p>;
    if (!data?.questions?.length) return <p className="empty-msg">No PYQs loaded yet.</p>;
    const years = ['All', ...new Set(data.questions.map(q => q.year).filter(Boolean))].sort((a,b) => b-a);
    const filtered = yearFilter === 'All' ? data.questions : data.questions.filter(q => q.year == yearFilter);
    return (
        <div>
            <div className="current-affairs-banner" style={{borderColor:'#7c3aed'}}>
                <h3>📜 Previous Year Questions (UPSC CSE Prelims)</h3>
                <p>{data.questions.length} actual UPSC questions from past papers</p>
            </div>
            <div className="subject-filter">
                {years.map(y => <div key={y} className={`subject-btn ${yearFilter==y?'active':''}`} onClick={() => setYearFilter(y)}>{y}</div>)}
            </div>
            <QuizMode questions={filtered} />
        </div>
    );
}

// ========== ESSAY TOPIC GENERATOR ==========
function EssayMode() {
    const { data, loading } = useData('/api/essays');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [currentTopic, setCurrentTopic] = useState(null);
    const [showFramework, setShowFramework] = useState(false);
    const [bookmarkedEssays, setBookmarkedEssays] = useState(new Set());

    if (loading) return <p className="empty-msg">Loading...</p>;
    if (!data?.categories) return <p className="empty-msg">No essay data.</p>;

    const categories = Object.keys(data.categories);
    const categoryLabels = {philosophical:'🧠 Philosophical',social:'👥 Social Issues',political:'⚖️ Political',economic:'💰 Economic',science_environment:'🔬 Science & Environment',international:'🌍 International'};

    const getRandomTopic = (cat) => {
        const topics = cat ? data.categories[cat] : Object.values(data.categories).flat();
        return topics[Math.floor(Math.random() * topics.length)];
    };

    return (
        <div>
            <div className="current-affairs-banner" style={{borderColor:'#eab308'}}>
                <h3>✍️ Essay Topic Generator & Practice</h3>
                <p>UPSC Mains Essay Paper carries 250 marks (2 essays × 125)</p>
            </div>

            {/* Random Topic Generator */}
            <div className="quiz-card" style={{textAlign:'center'}}>
                <h4 style={{color:'#eab308',marginBottom:'16px'}}>🎲 Generate Random Topic</h4>
                <div className="controls" style={{marginBottom:'16px',flexWrap:'wrap'}}>
                    <button className="btn btn-primary" onClick={() => setCurrentTopic(getRandomTopic(null))}>Any Category</button>
                    {categories.map(cat => (
                        <button key={cat} className="btn btn-secondary" onClick={() => {setCurrentTopic(getRandomTopic(cat));setSelectedCategory(cat);}} style={{fontSize:'0.8rem'}}>
                            {categoryLabels[cat]||cat}
                        </button>
                    ))}
                </div>
                {currentTopic && (
                    <div style={{background:'#0f172a',padding:'20px',borderRadius:'8px',marginTop:'12px'}}>
                        <p style={{color:'#f1f5f9',fontSize:'1.2rem',lineHeight:'1.6',fontStyle:'italic'}}>"{currentTopic}"</p>
                        <p style={{color:'#64748b',fontSize:'0.8rem',marginTop:'8px'}}>Category: {categoryLabels[selectedCategory]||'Mixed'}</p>
                        <span style={{color:bookmarkedEssays.has(currentTopic)?'#22c55e':'#f97316',fontSize:'0.85rem',cursor:'pointer',marginTop:'8px',display:'inline-block'}} onClick={() => {bookmarkAPI({id:'essay-'+currentTopic.substring(0,30),type:'essay',subject:'Essay - '+(categoryLabels[selectedCategory]||'Mixed'),title:currentTopic,content:''});setBookmarkedEssays(prev=>new Set([...prev,currentTopic]));}}>{bookmarkedEssays.has(currentTopic)?'✅ Bookmarked':'🔖 Bookmark this topic'}</span>
                    </div>
                )}
            </div>

            {/* Writing Framework */}
            <div className="quiz-card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <h4 style={{color:'#22c55e'}}>📝 Essay Writing Framework</h4>
                    <button className="btn btn-secondary" onClick={() => setShowFramework(!showFramework)} style={{fontSize:'0.8rem'}}>
                        {showFramework ? 'Hide' : 'Show'} Guide
                    </button>
                </div>
                {showFramework && data.writingFramework && (
                    <div style={{marginTop:'16px'}}>
                        {Object.entries(data.writingFramework).map(([section, points]) => (
                            <div key={section} style={{marginBottom:'16px'}}>
                                <h5 style={{color:'#f97316',textTransform:'capitalize',marginBottom:'8px'}}>{section}:</h5>
                                <ul style={{paddingLeft:'20px'}}>
                                    {points.map((p,i) => <li key={i} style={{color:'#cbd5e1',fontSize:'0.85rem',marginBottom:'4px'}}>{p}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* All Topics by Category */}
            <h4 style={{color:'#eab308',margin:'20px 0 12px',textAlign:'center'}}>All Topics by Category</h4>
            {categories.map(cat => (
                <div key={cat} className="quiz-card">
                    <h4 style={{color:'#f97316',marginBottom:'12px'}}>{categoryLabels[cat]||cat}</h4>
                    <ol style={{paddingLeft:'20px'}}>
                        {data.categories[cat].map((topic, i) => (
                            <li key={i} style={{color:'#cbd5e1',fontSize:'0.9rem',marginBottom:'12px',lineHeight:'1.5'}}>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'8px'}}>
                                    <span>{topic}</span>
                                    <span style={{color:bookmarkedEssays.has(topic)?'#22c55e':'#f97316',cursor:'pointer',fontSize:'0.8rem',flexShrink:0}} onClick={() => {bookmarkAPI({id:'essay-'+topic.substring(0,30),type:'essay',subject:'Essay - '+(categoryLabels[cat]||cat),title:topic,content:data.modelEssays?.[topic]||data.outlines?.[topic]||''});setBookmarkedEssays(prev=>new Set([...prev,topic]));}} title="Bookmark this topic">{bookmarkedEssays.has(topic)?'✅':'🔖'}</span>
                                </div>
                                {data.modelEssays && data.modelEssays[topic] && (
                                    <details style={{marginTop:'6px'}}>
                                        <summary style={{color:'#22c55e',fontSize:'0.8rem',cursor:'pointer'}}>📄 Read Model Essay (~1200 words)</summary>
                                        <div style={{marginTop:'8px',padding:'16px',background:'#0f172a',borderRadius:'8px',borderLeft:'3px solid #22c55e',whiteSpace:'pre-wrap',fontSize:'0.9rem',lineHeight:'1.8',color:'#cbd5e1'}}>
                                            {data.modelEssays[topic]}
                                        </div>
                                    </details>
                                )}
                                {data.outlines && data.outlines[topic] && !data.modelEssays?.[topic] && (
                                    <details style={{marginTop:'6px'}}>
                                        <summary style={{color:'#60a5fa',fontSize:'0.8rem',cursor:'pointer'}}>📝 View Outline (full essay generating...)</summary>
                                        <div style={{marginTop:'8px',padding:'12px',background:'#0f172a',borderRadius:'6px',borderLeft:'3px solid #eab308',whiteSpace:'pre-wrap',fontSize:'0.85rem',lineHeight:'1.6',color:'#94a3b8'}}>
                                            {data.outlines[topic]}
                                        </div>
                                    </details>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            ))}
        </div>
    );
}

// ========== MAIN APP ==========
function App() {
    const [section, setSection] = useState('prelims');
    const [mode, setMode] = useState('quiz');
    const [subjectFilter, setSubjectFilter] = useState('All');

    const { data: prelimsData } = useData('/api/questions/prelims');
    const { data: mainsData } = useData('/api/questions/mains');
    const { data: interviewData } = useData('/api/questions/interview');
    const { data: flashcardsData } = useData('/api/flashcards');
    const { data: statusData } = useData('/api/status');

    const subjects = useMemo(() => {
        if (section === 'prelims' && prelimsData) return ['All', ...new Set(prelimsData.questions.map(q => q.subject))];
        if (section === 'mains' && mainsData) return ['All', ...new Set(mainsData.questions.map(q => q.subject))];
        if (section === 'interview' && interviewData) return ['All', ...new Set(interviewData.questions.map(q => q.category))];
        return ['All'];
    }, [section, prelimsData, mainsData, interviewData]);

    const filteredPrelims = useMemo(() => {
        if (!prelimsData?.questions) return [];
        return subjectFilter === 'All' ? prelimsData.questions : prelimsData.questions.filter(q => q.subject === subjectFilter);
    }, [prelimsData, subjectFilter]);

    const filteredMains = useMemo(() => {
        if (!mainsData?.questions) return [];
        return subjectFilter === 'All' ? mainsData.questions : mainsData.questions.filter(q => q.subject === subjectFilter);
    }, [mainsData, subjectFilter]);

    const filteredInterview = useMemo(() => {
        if (!interviewData?.questions) return [];
        return subjectFilter === 'All' ? interviewData.questions : interviewData.questions.filter(q => q.category === subjectFilter);
    }, [interviewData, subjectFilter]);

    const filteredFlashcards = useMemo(() => {
        if (!flashcardsData) return [];
        const cards = flashcardsData[section] || flashcardsData.prelims || [];
        return subjectFilter === 'All' ? cards : cards.filter(c => c.subject === subjectFilter);
    }, [flashcardsData, section, subjectFilter]);

    const getModes = () => {
        if (section === 'prelims') return [{key:'quiz',label:'📝 Quiz'},{key:'flashcards',label:'🗂️ Flashcards'},{key:'current-affairs',label:'📡 Current Affairs'},{key:'monthly',label:'📅 Monthly'}];
        if (section === 'mains') return [{key:'mains-writing',label:'✍️ Answer Practice'},{key:'essay',label:'📄 Essay Generator'},{key:'flashcards',label:'🗂️ Flashcards'},{key:'current-affairs',label:'📡 Current Affairs'}];
        if (section === 'interview') return [{key:'interview-practice',label:'🎤 Mock Interview'},{key:'flashcards',label:'🗂️ Flashcards'}];
        if (section === 'revision') return [{key:'revision',label:'📊 Dashboard'}];
        return [];
    };

    useEffect(() => {
        setSubjectFilter('All');
        if (section === 'prelims') setMode('quiz');
        else if (section === 'mains') setMode('mains-writing');
        else if (section === 'interview') setMode('interview-practice');
        else if (section === 'revision') setMode('revision');
    }, [section]);

    const renderContent = () => {
        if (mode === 'quiz') return <QuizMode questions={filteredPrelims} />;
        if (mode === 'flashcards') return <FlashcardMode cards={filteredFlashcards} />;
        if (mode === 'mains-writing') return <MainsMode questions={filteredMains} />;
        if (mode === 'interview-practice') return <InterviewMode questions={filteredInterview} />;
        if (mode === 'current-affairs') return <CurrentAffairsMode />;
        if (mode === 'monthly') return <MonthlyMode />;
        if (mode === 'revision') return <RevisionMode />;
        if (mode === 'essay') return <EssayMode />;
        return null;
    };

    return (
        <div>
            <div className="header">
                <h1><span style={{WebkitTextFillColor:'initial',background:'none'}}>🏛️</span> <span style={{background:'linear-gradient(135deg, #f97316, #eab308)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>UPSC Study Hub</span></h1>
                <p>Unlimited Practice • Auto-Updating • Spaced Repetition</p>
                {statusData && <p style={{color:'#64748b',fontSize:'0.75rem',marginTop:'6px'}}>
                    {statusData.totalQuestions} questions • {statusData.currentAffairs?.articles || 0} current affairs • {statusData.llmEnabled ? '🤖 AI active' : '📋 Template MCQs'}
                </p>}
                <StatsBadge />
            </div>

            <div className="section-tabs">
                {[['prelims','📋 Prelims'],['mains','✍️ Mains'],['interview','🎤 Interview'],['revision','📊 Revision']].map(([key,label]) => (
                    <div key={key} className={`section-tab ${section===key?'active':''}`} onClick={() => setSection(key)}>{label}</div>
                ))}
            </div>

            {section !== 'revision' && (
                <div className="mode-toggle">
                    {getModes().map(m => <div key={m.key} className={`mode-btn ${mode===m.key?'active':''}`} onClick={() => setMode(m.key)}>{m.label}</div>)}
                </div>
            )}

            {!['current-affairs','monthly','revision'].includes(mode) && (
                <div className="subject-filter">
                    {subjects.map(sub => <div key={sub} className={`subject-btn ${subjectFilter===sub?'active':''}`} onClick={() => setSubjectFilter(sub)}>{sub}</div>)}
                </div>
            )}

            {renderContent()}
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);

// ============ PROFILE SELECTOR (injected at app load) ============
// Always shows profile selection screen before entering the app
(function initProfiles() {
    // Always show the profile selection overlay on app load
    function showProfileScreen() {
        // Use the existing overlay from HTML (already visible, no flash)
        let overlay = document.getElementById('profile-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'profile-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0f172a;z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:20px;';
            document.body.appendChild(overlay);
        }
        
        // Load existing profiles
        fetch('/api/profiles').then(r => r.json()).then(data => {
            const profiles = data.profiles || [];
            const savedProfile = localStorage.getItem('upsc_profile');
            const savedDisplay = localStorage.getItem('upsc_profile_display');
            
            let profileListHTML = '';
            if (profiles.length > 0) {
                profileListHTML = `
                    <div style="margin-bottom:24px;width:100%;max-width:320px;">
                        <p style="color:#94a3b8;margin-bottom:12px;font-size:0.9rem;text-align:center;">Select your profile:</p>
                        <div id="profile-list" style="display:flex;flex-direction:column;gap:10px;">
                            ${profiles.map(p => {
                                const displayName = p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ');
                                const isLast = (p === savedProfile);
                                return `<div style="position:relative;">
                                    <button class="profile-select-btn" data-profile="${p}" data-display="${displayName}" style="
                                        width:100%;padding:14px 20px;border-radius:12px;border:2px solid ${isLast ? '#f97316' : '#334155'};
                                        background:${isLast ? '#1e293b' : '#0f172a'};color:#fff;cursor:pointer;font-size:1rem;
                                        display:flex;align-items:center;gap:12px;transition:all 0.2s;
                                    ">
                                        <span style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg, #f97316, #eab308);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:bold;">${displayName.charAt(0).toUpperCase()}</span>
                                        <span style="flex:1;text-align:left;">
                                            <span style="display:block;font-weight:600;">${displayName}</span>
                                            ${isLast ? '<span style="font-size:0.75rem;color:#f97316;">Last used</span>' : ''}
                                        </span>
                                        <span style="color:#64748b;font-size:1.2rem;">→</span>
                                    </button>
                                    <span class="profile-delete-btn" data-profile="${p}" data-display="${displayName}" style="position:absolute;top:8px;right:8px;color:#ef4444;cursor:pointer;font-size:0.75rem;padding:4px 8px;border-radius:6px;background:#1e293b;border:1px solid #334155;z-index:1;">✕</span>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                    <div style="width:100%;max-width:320px;border-top:1px solid #334155;padding-top:20px;margin-top:8px;">
                        <p style="color:#64748b;margin-bottom:12px;font-size:0.85rem;text-align:center;">Or create a new profile:</p>
                    </div>
                `;
            }
            
            overlay.innerHTML = `
                <h2 style="color:#f97316;margin-bottom:8px;font-size:1.5rem;">🏛️ UPSC Study Hub</h2>
                <p style="color:#64748b;margin-bottom:24px;font-size:0.85rem;">Who's studying today?</p>
                ${profileListHTML}
                <div style="display:flex;gap:8px;width:100%;max-width:320px;">
                    <input id="profile-input" type="text" placeholder="Enter name" style="padding:12px 16px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:1rem;flex:1;">
                    <button id="profile-btn" style="padding:12px 18px;border-radius:8px;background:#f97316;color:#fff;border:none;cursor:pointer;font-size:0.9rem;white-space:nowrap;">Create →</button>
                </div>
                <p style="color:#64748b;margin-top:16px;font-size:0.75rem;">Each profile has its own progress, bookmarks & revision tracking.</p>
            `;
            
            document.body.appendChild(overlay);
            
            // Handle existing profile clicks
            setTimeout(() => {
                document.querySelectorAll('.profile-select-btn').forEach(btn => {
                    btn.onmouseenter = () => { btn.style.borderColor = '#f97316'; btn.style.background = '#1e293b'; };
                    btn.onmouseleave = () => { 
                        const isLast = btn.dataset.profile === savedProfile;
                        btn.style.borderColor = isLast ? '#f97316' : '#334155'; 
                        btn.style.background = isLast ? '#1e293b' : '#0f172a'; 
                    };
                    btn.onclick = () => {
                        const profile = btn.dataset.profile;
                        const display = btn.dataset.display;
                        localStorage.setItem('upsc_profile', profile);
                        localStorage.setItem('upsc_profile_display', display);
                        activateProfile(profile);
                        overlay.remove(); document.getElementById('app').style.display='block';
                    };
                });
                
                // Handle profile deletion
                document.querySelectorAll('.profile-delete-btn').forEach(btn => {
                    btn.onclick = async (e) => {
                        e.stopPropagation();
                        const profile = btn.dataset.profile;
                        const display = btn.dataset.display;
                        if (!confirm(`Delete profile "${display}"? All progress, bookmarks, and data will be permanently lost.`)) return;
                        await fetch(`/api/profiles/${profile}`, { method: 'DELETE' });
                        if (localStorage.getItem('upsc_profile') === profile) {
                            localStorage.removeItem('upsc_profile');
                            localStorage.removeItem('upsc_profile_display');
                        }
                        // Refresh the profile screen
                        overlay.remove(); document.getElementById('app').style.display='block';
                        showProfileScreen();
                    };
                });
                
                // Handle new profile creation
                document.getElementById('profile-btn').onclick = async () => {
                    const name = document.getElementById('profile-input').value.trim();
                    if (name.length < 2) { alert('Please enter at least 2 characters'); return; }
                    await fetch('/api/profiles/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
                    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g,'-');
                    localStorage.setItem('upsc_profile', safeName);
                    localStorage.setItem('upsc_profile_display', name);
                    activateProfile(safeName);
                    overlay.remove(); document.getElementById('app').style.display='block';
                };
                document.getElementById('profile-input').onkeypress = (e) => { if(e.key==='Enter') document.getElementById('profile-btn').click(); };
            }, 50);
        }).catch(() => {
            // Fallback if /api/profiles fails - just show input
            overlay.innerHTML = `
                <h2 style="color:#f97316;margin-bottom:20px;font-size:1.5rem;">🏛️ Welcome to UPSC Study Hub</h2>
                <p style="color:#94a3b8;margin-bottom:20px;">Enter your name to create/access your profile:</p>
                <input id="profile-input" type="text" placeholder="Your name" style="padding:12px 20px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:1rem;width:250px;margin-bottom:12px;">
                <button id="profile-btn" style="padding:12px 24px;border-radius:8px;background:#f97316;color:#fff;border:none;cursor:pointer;font-size:1rem;">Start Studying →</button>
            `;
            document.body.appendChild(overlay);
            setTimeout(() => {
                document.getElementById('profile-btn').onclick = async () => {
                    const name = document.getElementById('profile-input').value.trim();
                    if (name.length < 2) { alert('Please enter at least 2 characters'); return; }
                    await fetch('/api/profiles/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
                    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g,'-');
                    localStorage.setItem('upsc_profile', safeName);
                    localStorage.setItem('upsc_profile_display', name);
                    activateProfile(safeName);
                    overlay.remove(); document.getElementById('app').style.display='block';
                };
                document.getElementById('profile-input').onkeypress = (e) => { if(e.key==='Enter') document.getElementById('profile-btn').click(); };
            }, 50);
        });
    }
    
    // Activate profile: override API functions to use profile-specific endpoints
    function activateProfile(profileName) {
        window._upscProfile = profileName;
        window._upscProfileDisplay = localStorage.getItem('upsc_profile_display') || profileName;
        
        window.recordAttemptAPI = async (questionId, subject, isCorrect, questionData) => {
            try {
                await fetch(`/api/profiles/${profileName}/attempt`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({questionId, subject, isCorrect, questionData})
                });
            } catch(e) {}
        };
        window.bookmarkAPI = async (item) => {
            await fetch(`/api/profiles/${profileName}/bookmark`, {
                method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(item)
            });
        };
        window.removeBookmarkAPI = async (id) => {
            await fetch(`/api/profiles/${profileName}/bookmark/${id}`, {method:'DELETE'});
        };
    }
    
    // Show the profile selection screen
    showProfileScreen();
})();
