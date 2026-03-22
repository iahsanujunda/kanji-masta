import React, { useState, useEffect } from 'react';

// --- Icons (Inline SVGs for guaranteed rendering) ---
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
const BookOpenIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
);
const CheckCircleIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const LeafIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
);
const CheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>
);
const StarIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
);
const StarFilledIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
);
const XIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const SparklesIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
);

// --- Mock Data ---
const mockExtractedKanji = [
    {
        id: 'k1',
        character: '電',
        recommended: true,
        whyUseful: 'Core kanji for anything electric',
        readings: { on: ['でん'], kun: [] },
        meanings: ['electricity', 'electric'],
        exampleWord: { word: '電車', reading: 'でんしゃ', meaning: 'train' }
    },
    {
        id: 'k2',
        character: '車',
        recommended: true,
        whyUseful: 'Very common for vehicles',
        readings: { on: ['しゃ'], kun: ['くるま'] },
        meanings: ['car', 'wheel'],
        exampleWord: { word: '自転車', reading: 'じてんしゃ', meaning: 'bicycle' }
    },
    {
        id: 'k3',
        character: '駅',
        recommended: false,
        whyUseful: 'Found everywhere in the train system',
        readings: { on: ['えき'], kun: [] },
        meanings: ['station'],
        exampleWord: { word: '駅弁', reading: 'えきべん', meaning: 'station bento' }
    }
];

export default function App() {
    // Navigation State: 'home' | 'loading' | 'results'
    const [currentView, setCurrentView] = useState('home');
    const [currentTime, setCurrentTime] = useState(new Date());

    // App states
    const [slotState, setSlotState] = useState('active');
    const [loadingText, setLoadingText] = useState('');
    const [kanjiSelections, setKanjiSelections] = useState({}); // { k1: 'familiar', k2: 'learning' }

    // Background processing states
    const [isProcessingQuizzes, setIsProcessingQuizzes] = useState(false);
    const [justFinishedProcessing, setJustFinishedProcessing] = useState(false);

    // App data (mocked)
    const userStats = { streak: 12, learning: 24 + (justFinishedProcessing ? 2 : 0), familiar: 108 };
    const currentSlot = {
        name: "Evening Slot",
        remaining: slotState === 'active' ? 5 : 0,
        total: 5,
        endTime: "23:59",
        nextSlotTime: "06:00"
    };

    const handleCaptureClick = () => {
        setCurrentView('loading');
        setLoadingText('Uploading photo...');

        // Simulate dynamic loading sequence
        setTimeout(() => setLoadingText('AI is scanning image...'), 1000);
        setTimeout(() => setLoadingText('Extracting kanji...'), 2500);
        setTimeout(() => setLoadingText('Finding daily usage...'), 3500);

        // Finish loading after 5 seconds
        setTimeout(() => {
            setCurrentView('results');
        }, 5000);
    };

    const getGreeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const toggleSelection = (id, type) => {
        setKanjiSelections(prev => ({
            ...prev,
            // If tapping the already active type, deselect it (back to neutral). Otherwise set new type.
            [id]: prev[id] === type ? null : type
        }));
    };

    const handleFinishSelection = () => {
        // In a real app, this would POST to /api/kanji/session here and enqueue jobs.
        // User is dismissed immediately.
        setCurrentView('home');
        setKanjiSelections({});

        // Simulate background worker processing (Call #2)
        setIsProcessingQuizzes(true);

        setTimeout(() => {
            setIsProcessingQuizzes(false);
            setJustFinishedProcessing(true);

            // Clear the "finished" success message after 3 seconds
            setTimeout(() => setJustFinishedProcessing(false), 3000);
        }, 5000);
    };

    // ----------------------------------------------------------------------
    // VIEW: LOADING
    // ----------------------------------------------------------------------
    if (currentView === 'loading') {
        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
                <div className="w-full max-w-md bg-gray-900 min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">

                    {/* Animated Background Elements */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl animate-pulse"></div>

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative mb-8">
                            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700 shadow-[0_0_30px_rgba(79,70,229,0.3)]">
                                <SparklesIcon className="w-10 h-10 text-indigo-400 animate-pulse" />
                            </div>
                            {/* Spinning border ring */}
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
    // VIEW: RESULTS / SELECTION
    // ----------------------------------------------------------------------
    if (currentView === 'results') {
        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
                <div className="w-full max-w-md bg-gray-900 min-h-screen flex flex-col relative">

                    <header className="flex items-center justify-between p-6 bg-gray-900/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-800">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-100">Found Kanji</h1>
                            <p className="text-sm text-gray-400">{mockExtractedKanji.length} detected</p>
                        </div>
                        <button onClick={() => setCurrentView('home')} className="bg-gray-800 p-2 rounded-full text-gray-400 hover:text-white">
                            <XIcon className="w-6 h-6" />
                        </button>
                    </header>

                    <main className="flex-1 p-6 pb-32 overflow-y-auto flex flex-col gap-5">
                        {mockExtractedKanji.map(kanji => {
                            const status = kanjiSelections[kanji.id]; // 'familiar' | 'learning' | null

                            return (
                                <div key={kanji.id} className="bg-gray-800 rounded-3xl p-5 border border-gray-700 shadow-lg flex flex-col relative overflow-hidden">

                                    {/* Recommended Badge */}
                                    {kanji.recommended && (
                                        <div className="absolute top-0 right-0 bg-indigo-600 text-xs font-bold px-3 py-1 rounded-bl-xl text-white flex items-center gap-1">
                                            <StarFilledIcon className="w-3 h-3" /> Recommended
                                        </div>
                                    )}

                                    {/* Top info area */}
                                    <div className="flex gap-5 mb-5">
                                        <div className="bg-gray-900 rounded-2xl w-24 h-24 flex items-center justify-center shrink-0 border border-gray-700">
                                            <span className="text-6xl font-medium text-gray-100">{kanji.character}</span>
                                        </div>

                                        <div className="flex flex-col justify-center">
                                            <p className="text-xs text-indigo-400 font-bold tracking-widest uppercase mb-1">
                                                {kanji.readings.on.join(', ')}
                                            </p>
                                            <h3 className="text-xl font-bold text-gray-100 capitalize leading-tight mb-2">
                                                {kanji.meanings[0]}
                                            </h3>
                                            <div className="bg-gray-900/50 px-3 py-2 rounded-lg text-sm border border-gray-800">
                                                <span className="text-gray-300 mr-2">{kanji.exampleWord.word}</span>
                                                <span className="text-gray-500 text-xs">({kanji.exampleWord.meaning})</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => toggleSelection(kanji.id, 'familiar')}
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all
                        ${status === 'familiar'
                                                ? 'bg-emerald-900/40 text-emerald-400 border-2 border-emerald-500/50'
                                                : 'bg-gray-900 text-gray-400 border-2 border-transparent hover:bg-gray-700'}`}
                                        >
                                            <CheckIcon className="w-4 h-4" />
                                            Already Know
                                        </button>

                                        <button
                                            onClick={() => toggleSelection(kanji.id, 'learning')}
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all
                        ${status === 'learning'
                                                ? 'bg-indigo-600 text-white border-2 border-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.4)]'
                                                : 'bg-gray-900 text-gray-300 border-2 border-transparent hover:bg-gray-700'}`}
                                        >
                                            <StarIcon className="w-4 h-4" />
                                            Want to Learn
                                        </button>
                                    </div>

                                </div>
                            );
                        })}
                    </main>

                    {/* Sticky Done Button */}
                    <div className="absolute bottom-0 w-full bg-gradient-to-t from-gray-900 via-gray-900 to-transparent pt-12 pb-8 px-6">
                        <button
                            onClick={handleFinishSelection}
                            className="w-full bg-gray-100 text-gray-900 rounded-[2rem] p-5 font-bold text-lg shadow-[0_0_40px_rgba(0,0,0,0.5)] active:scale-[0.98] transition-transform"
                        >
                            Done
                        </button>
                    </div>

                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // VIEW: HOME (Default)
    // ----------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
            <div className="w-full max-w-md bg-gray-900 min-h-screen shadow-2xl relative overflow-hidden flex flex-col">

                <header className="flex items-center justify-between p-6 pt-10 bg-gray-900">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-100">{getGreeting()}</h1>
                        <button className="flex items-center gap-1.5 mt-1 text-emerald-400 hover:text-emerald-300 transition-colors group">
                            <LeafIcon className="w-4 h-4" />
                            <span className="text-sm font-medium">128 Kanji growing</span>
                            <ChevronRightIcon className="w-3 h-3 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-full font-bold text-sm border border-orange-500/20">
                            <FlameIcon className="w-4 h-4 fill-current" />
                            {userStats.streak}
                        </div>
                        <button className="text-gray-500 hover:text-gray-300 transition-colors">
                            <SettingsIcon className="w-6 h-6" />
                        </button>
                    </div>
                </header>

                <main className="flex-1 px-6 pb-24 flex flex-col gap-6">

                    {/* Non-blocking Background Task Indicator */}
                    {(isProcessingQuizzes || justFinishedProcessing) && (
                        <div className={`rounded-2xl p-4 flex items-center justify-between transition-all duration-300 ${isProcessingQuizzes ? 'bg-indigo-900/30 border border-indigo-500/30' : 'bg-emerald-900/30 border border-emerald-500/30'}`}>
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
                                        {isProcessingQuizzes ? 'Generating Quizzes...' : 'Quizzes Ready!'}
                                    </p>
                                    <p className={`text-xs ${isProcessingQuizzes ? 'text-indigo-300' : 'text-emerald-300'}`}>
                                        {isProcessingQuizzes ? 'Building contextual sentences in background' : 'Added to your upcoming learning slots'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

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
                                <p className="text-emerald-200/70 mb-4 text-sm">
                                    Great job. You're completely caught up for now. No backlog, no worries.
                                </p>
                                <div className="bg-gray-900/50 rounded-xl p-3 flex justify-between items-center text-sm font-medium text-emerald-300">
                                    <span>Next slot opens at</span>
                                    <span className="bg-emerald-900/40 border border-emerald-800/50 px-2 py-1 rounded-md">{currentSlot.nextSlotTime}</span>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="bg-gray-800 rounded-3xl p-5 border border-gray-700 flex items-center justify-between active:bg-gray-700 cursor-pointer transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="bg-gray-700 p-3 rounded-2xl text-gray-300">
                                <BookOpenIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-100">Your Kanji</h3>
                                <div className="flex gap-3 text-sm mt-0.5">
                                    <span className="text-indigo-400 font-medium">{userStats.learning} learning</span>
                                    <span className="text-gray-600">•</span>
                                    <span className="text-gray-400">{userStats.familiar} familiar</span>
                                </div>
                            </div>
                        </div>
                        <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                    </section>

                    {/* Dev Controls omitted for clarity in user-flow, but could be added back if testing slot states is needed */}
                </main>

                <div className="absolute bottom-0 w-full bg-gradient-to-t from-gray-900 via-gray-900 to-transparent pt-12 pb-8 px-6">
                    <button
                        onClick={handleCaptureClick}
                        className="w-full bg-gray-100 text-gray-900 rounded-[2rem] p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex justify-center items-center gap-3 active:scale-[0.98] active:bg-gray-200 transition-all transform group"
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