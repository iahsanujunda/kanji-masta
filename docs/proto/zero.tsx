import React, { useState, useEffect } from 'react';

// --- Icons ---
const FlameIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
);
const CameraIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
);
const SettingsIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
);
const ChevronRightIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 18 15 12 9 6"/></svg>
);
const LeafIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
);
const CheckCircleIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const CheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>
);
const SparklesIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
);
const SeedIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
);
const TreeIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
);
const AlertCircleIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
);
const ArrowDownIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
);

// --- Mock AI Extraction Data ---
const mockExtractedKanji = [
    {
        id: 'k1',
        char: '電',
        recommended: true,
        whyUseful: 'Core kanji for anything electric — trains, phones, appliances.',
        onyomi: 'デン',
        kunyomi: '---',
        meaning: 'electricity',
        example: { word: '電車', reading: 'でんしゃ', meaning: 'train' }
    },
    {
        id: 'k2',
        char: '車',
        recommended: true,
        whyUseful: 'Essential for all road and rail transport in Japan.',
        onyomi: 'シャ',
        kunyomi: 'くるま',
        meaning: 'car, vehicle',
        example: { word: '自転車', reading: 'じてんしゃ', meaning: 'bicycle' }
    }
];

export default function App() {
    // Global State
    const [currentView, setCurrentView] = useState('home'); // 'home' | 'loading' | 'triage'

    // Home States
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isProcessingQuizzes, setIsProcessingQuizzes] = useState(false);
    const [justFinishedProcessing, setJustFinishedProcessing] = useState(false);
    const [slotState, setSlotState] = useState('active');
    const [totalKanji, setTotalKanji] = useState(0); // Starts at 0 to show onboarding!

    // Triage States
    const [currentIndex, setCurrentIndex] = useState(0);
    const [triageResults, setTriageResults] = useState([]);
    const [animationClass, setAnimationClass] = useState('animate-in slide-in-from-right-8 fade-in duration-300');
    const [loadingText, setLoadingText] = useState('');

    const userStats = { streak: totalKanji > 0 ? 12 : 0, treeSize: totalKanji };
    const currentSlot = { name: "Evening Slot", remaining: totalKanji > 0 ? 5 : 0, endTime: "23:59" };

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const handleCaptureClick = () => {
        setCurrentView('loading');
        setLoadingText('Uploading photo...');

        // Simulate Call #1 (Vision Extraction)
        setTimeout(() => setLoadingText('AI is scanning image...'), 800);
        setTimeout(() => setLoadingText('Extracting kanji...'), 1800);
        setTimeout(() => setLoadingText('Finding daily usage...'), 2800);

        setTimeout(() => {
            setCurrentIndex(0);
            setTriageResults([]);
            setCurrentView('triage');
            setAnimationClass('animate-in slide-in-from-bottom-8 fade-in duration-500');
        }, 3800);
    };

    const handleTriageDecision = (status) => {
        setTriageResults(prev => [...prev, { ...mockExtractedKanji[currentIndex], status }]);
        setAnimationClass('animate-out slide-out-to-left-8 fade-out duration-200 opacity-0');

        setTimeout(() => {
            if (currentIndex + 1 >= mockExtractedKanji.length) {
                // Triage Finished: Drop back to home, start background worker
                setCurrentView('home');
                setIsProcessingQuizzes(true);
                // Add the extracted kanji to our total to trigger the Home Page transformation!
                setTotalKanji(prev => prev + mockExtractedKanji.length);

                // Simulate Call #2 (Background Worker Job)
                setTimeout(() => {
                    setIsProcessingQuizzes(false);
                    setJustFinishedProcessing(true);
                    setTimeout(() => setJustFinishedProcessing(false), 4000);
                }, 6000);
            } else {
                setCurrentIndex(prev => prev + 1);
                setAnimationClass('animate-in slide-in-from-right-8 fade-in duration-300');
            }
        }, 200);
    };

    // ----------------------------------------------------------------------
    // VIEW: HOME
    // ----------------------------------------------------------------------
    if (currentView === 'home') {
        const isNewUser = totalKanji === 0;

        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
                <div className="w-full max-w-md bg-gray-900 min-h-screen shadow-2xl relative overflow-hidden flex flex-col">

                    <header className="flex items-center justify-between p-6 pt-10 bg-gray-900">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-100">{getGreeting()}</h1>
                            <button className={`flex items-center gap-1.5 mt-1 transition-colors group ${isNewUser ? 'text-gray-500 cursor-default' : 'text-emerald-400 hover:text-emerald-300'}`}>
                                {isNewUser ? <SeedIcon className="w-4 h-4" /> : <LeafIcon className="w-4 h-4" />}
                                <span className="text-sm font-medium">{userStats.treeSize} Kanji growing</span>
                                {!isNewUser && <ChevronRightIcon className="w-3 h-3 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />}
                            </button>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm border ${isNewUser ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-orange-500/20 text-orange-400 border-orange-500/20'}`}>
                                <FlameIcon className="w-4 h-4 fill-current" />
                                {userStats.streak}
                            </div>
                            <button className="text-gray-500 hover:text-gray-300 transition-colors">
                                <SettingsIcon className="w-6 h-6" />
                            </button>
                        </div>
                    </header>

                    <main className="flex-1 px-6 pb-24 flex flex-col gap-6 relative z-10">

                        {/* Non-blocking Background Task Indicator (Only visible when processing) */}
                        <div className={`transition-all duration-500 overflow-hidden ${isProcessingQuizzes || justFinishedProcessing ? 'h-[72px] opacity-100' : 'h-0 opacity-0'}`}>
                            <div className={`rounded-2xl p-4 flex items-center justify-between h-[72px] ${isProcessingQuizzes ? 'bg-indigo-900/30 border border-indigo-500/30' : 'bg-emerald-900/30 border border-emerald-500/30'}`}>
                                <div className="flex items-center gap-3">
                                    {isProcessingQuizzes ? (
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                                            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                            <CheckIcon className="w-4 h-4 text-emerald-400" />
                                        </div>
                                    )}
                                    <div>
                                        <p className={`text-sm font-bold ${isProcessingQuizzes ? 'text-indigo-100' : 'text-emerald-100'}`}>
                                            {isProcessingQuizzes ? 'Claude is generating quizzes...' : 'Quizzes Ready!'}
                                        </p>
                                        <p className={`text-xs ${isProcessingQuizzes ? 'text-indigo-300' : 'text-emerald-300'}`}>
                                            {isProcessingQuizzes ? 'Building contextual sentences in background' : 'Added to your upcoming learning slots'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CONDITIONAL RENDER: Onboarding vs Active Dashboard */}
                        {isNewUser ? (

                            /* --- THE ZERO STATE (ONBOARDING) --- */
                            <div className="flex-1 flex flex-col justify-center animate-in fade-in duration-700">
                                <div className="bg-gray-800/40 border border-gray-700/50 rounded-[2rem] p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
                                    {/* Decorative glowing orb */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>

                                    <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 border border-indigo-500/20 shadow-inner">
                                        <SeedIcon className="w-10 h-10 text-indigo-400" />
                                    </div>

                                    <h2 className="text-2xl font-bold text-gray-100 mb-4">Plant Your First Seed</h2>
                                    <p className="text-gray-400 text-sm leading-relaxed mb-10">
                                        Your language tree is currently empty. Tap the camera button below to snap a photo of a sign, menu, or any Japanese text to unlock your daily quizzes.
                                    </p>

                                    <div className="animate-bounce">
                                        <ArrowDownIcon className="w-8 h-8 text-emerald-400" />
                                    </div>
                                </div>
                            </div>

                        ) : (

                            /* --- THE ACTIVE DASHBOARD --- */
                            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <section>
                                    {slotState === 'active' ? (
                                        <div className="bg-indigo-600 text-white rounded-3xl p-6 shadow-lg shadow-indigo-900/50 transition-all transform active:scale-[0.98]">
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <h2 className="text-indigo-200 font-medium mb-1">{currentSlot.name} Available</h2>
                                                    <div className="text-4xl font-bold">{currentSlot.remaining} <span className="text-xl font-normal text-indigo-300">quizzes</span></div>
                                                </div>
                                                <div className="bg-indigo-900/40 backdrop-blur text-indigo-100 text-xs px-2.5 py-1 rounded-lg">
                                                    Ends {currentSlot.endTime}
                                                </div>
                                            </div>
                                            <button className="w-full bg-white text-indigo-700 font-bold text-lg py-4 rounded-2xl shadow-sm flex justify-center items-center gap-2 hover:bg-indigo-50 transition-colors">
                                                Start Session
                                                <ChevronRightIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-emerald-900/20 rounded-3xl p-6 border border-emerald-800/30">
                                            <div className="flex items-center gap-3 mb-2">
                                                <CheckCircleIcon className="w-6 h-6 text-emerald-400" />
                                                <h2 className="text-emerald-300 font-bold text-lg">Slot Complete</h2>
                                            </div>
                                            <p className="text-emerald-200/70 text-sm">You're completely caught up.</p>
                                        </div>
                                    )}
                                </section>
                            </div>

                        )}

                    </main>

                    <div className="absolute bottom-0 w-full bg-gradient-to-t from-gray-900 via-gray-900 to-transparent pt-12 pb-8 px-6 z-20">
                        <button
                            onClick={handleCaptureClick}
                            className={`w-full text-gray-900 rounded-[2rem] p-5 flex justify-center items-center gap-3 active:scale-[0.98] transition-all transform group
                ${isNewUser
                                ? 'bg-emerald-400 hover:bg-emerald-300 animate-[pulse_2s_infinite] shadow-[0_0_30px_rgba(52,211,153,0.3)]'
                                : 'bg-gray-100 hover:bg-white shadow-[0_0_40px_rgba(0,0,0,0.5)]'}`}
                        >
                            <div className="bg-gray-900/10 p-2 rounded-full group-hover:bg-gray-900/20 transition-colors">
                                <CameraIcon className="w-7 h-7" />
                            </div>
                            <span className="text-xl font-bold tracking-wide">Capture Kanji</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // VIEW: LOADING (Simulates Vision Call)
    // ----------------------------------------------------------------------
    if (currentView === 'loading') {
        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
                <div className="w-full max-w-md bg-gray-900 min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl animate-pulse"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative mb-8">
                            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700 shadow-[0_0_30px_rgba(79,70,229,0.3)]">
                                <SparklesIcon className="w-10 h-10 text-indigo-400 animate-pulse" />
                            </div>
                            <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin"></div>
                        </div>
                        <h2 className="text-xl font-bold text-gray-100 mb-2">Analyzing Capture</h2>
                        <p className="text-indigo-300 font-medium h-6">{loadingText}</p>
                    </div>
                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // VIEW: TRIAGE DECK
    // ----------------------------------------------------------------------
    const currentKanji = mockExtractedKanji[currentIndex];
    const progressPercent = (currentIndex / mockExtractedKanji.length) * 100;

    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
            <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col shadow-2xl">

                <header className="px-6 pt-12 pb-4">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-indigo-400" />
                            Found in Photo
                        </h1>
                        <span className="text-sm font-bold text-gray-500 bg-gray-900 px-3 py-1 rounded-full border border-gray-800">
              {currentIndex + 1} / {mockExtractedKanji.length}
            </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </header>

                <main className="flex-1 px-6 pb-6 flex flex-col justify-center">
                    <div className={`flex-1 flex flex-col ${animationClass}`}>

                        <div className="bg-gray-900 border border-gray-800 rounded-[2rem] p-6 shadow-2xl flex-1 flex flex-col relative overflow-hidden">
                            {currentKanji.recommended && (
                                <div className="absolute top-0 right-0 bg-indigo-600 text-[10px] font-bold px-3 py-1.5 rounded-bl-xl text-white uppercase tracking-widest shadow-lg">
                                    Highly Recommended
                                </div>
                            )}
                            <div className="flex items-center gap-6 mb-6 mt-4">
                                <div className="w-28 h-28 bg-gray-800 rounded-3xl flex items-center justify-center shrink-0 border border-gray-700 shadow-inner">
                                    <span className="text-7xl font-medium text-gray-100">{currentKanji.char}</span>
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h2 className="text-3xl font-bold text-gray-100 capitalize leading-tight mb-2">
                                        {currentKanji.meaning}
                                    </h2>
                                    <div className="flex flex-col gap-1 text-sm font-mono">
                                        <div className="flex items-start">
                                            <span className="text-gray-500 text-xs mt-0.5 w-8">ON</span>
                                            <span className="text-indigo-400 font-medium">{currentKanji.onyomi}</span>
                                        </div>
                                        <div className="flex items-start">
                                            <span className="text-gray-500 text-xs mt-0.5 w-8">KUN</span>
                                            <span className="text-emerald-400 font-medium">{currentKanji.kunyomi}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-2xl p-4 mb-4">
                                <p className="text-sm text-indigo-100 leading-relaxed font-medium">
                                    {currentKanji.whyUseful}
                                </p>
                            </div>

                            <div className="bg-gray-800/50 rounded-2xl p-4 mt-auto">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Seen As</p>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-bold text-gray-200">{currentKanji.example.word}</span>
                                        <span className="text-gray-400 text-sm">{currentKanji.example.reading}</span>
                                    </div>
                                    <span className="text-gray-400 capitalize text-sm">{currentKanji.example.meaning}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex gap-4">
                            <button
                                onClick={() => handleTriageDecision('familiar')}
                                className="flex-1 group"
                            >
                                <div className="w-full bg-gray-900 border-2 border-emerald-900/50 text-emerald-400 rounded-2xl p-4 flex flex-col items-center gap-1 transition-all group-hover:bg-emerald-900/20 group-hover:border-emerald-500/50 active:scale-95">
                                    <TreeIcon className="w-6 h-6 mb-1" />
                                    <span className="font-bold text-sm">Already Know</span>
                                    <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-1 group-hover:text-emerald-500/70 transition-colors">
                    <AlertCircleIcon className="w-3 h-3" /> Not sure? Risk it.
                  </span>
                                </div>
                            </button>

                            <button
                                onClick={() => handleTriageDecision('learning')}
                                className="flex-1 group"
                            >
                                <div className="w-full bg-indigo-600 border-2 border-indigo-500 text-white rounded-2xl p-4 flex flex-col items-center gap-1 shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all hover:bg-indigo-500 active:scale-95">
                                    <SeedIcon className="w-6 h-6 mb-1" />
                                    <span className="font-bold text-sm">Want to Learn</span>
                                    <span className="text-[10px] text-indigo-200 mt-1">
                    Start from Level 0
                  </span>
                                </div>
                            </button>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}