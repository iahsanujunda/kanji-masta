import React, { useState } from 'react';

// --- Icons ---
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
    },
    {
        id: 'k3',
        char: '駅',
        recommended: false,
        whyUseful: 'Found everywhere in the massive Japanese train system.',
        onyomi: 'エキ',
        kunyomi: '---',
        meaning: 'station',
        example: { word: '駅弁', reading: 'えきべん', meaning: 'station bento' }
    }
];

export default function App() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [triageResults, setTriageResults] = useState([]);
    const [animationClass, setAnimationClass] = useState('animate-in slide-in-from-right-8 fade-in duration-300');

    const isFinished = currentIndex >= mockExtractedKanji.length;
    const currentKanji = mockExtractedKanji[currentIndex];
    const progressPercent = (currentIndex / mockExtractedKanji.length) * 100;

    const handleDecision = (status) => {
        // 1. Save result
        setTriageResults(prev => [...prev, { ...currentKanji, status }]);

        // 2. Trigger slide out animation
        setAnimationClass('animate-out slide-out-to-left-8 fade-out duration-200 opacity-0');

        // 3. Move to next card after animation
        setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
            setAnimationClass('animate-in slide-in-from-right-8 fade-in duration-300');
        }, 200);
    };

    const handleFinish = () => {
        // Here you would POST to /api/kanji/session and enqueue Claude jobs
        alert("Saved! Background jobs enqueued.");
        window.location.reload();
    };

    // ----------------------------------------------------------------------
    // VIEW: FINISHED SUMMARY
    // ----------------------------------------------------------------------
    if (isFinished) {
        const learning = triageResults.filter(r => r.status === 'learning');
        const familiar = triageResults.filter(r => r.status === 'familiar');

        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
                <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col p-6 items-center justify-center text-center shadow-2xl relative overflow-hidden">
                    {/* Subtle success glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>

                    <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-6 shadow-xl border border-gray-800 relative z-10">
                        <CheckIcon className="w-10 h-10 text-emerald-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-100 mb-2 relative z-10">Capture Saved!</h2>
                    <p className="text-gray-400 mb-10 relative z-10">
                        Claude is building your quizzes in the background.
                    </p>

                    <div className="w-full bg-gray-900/80 backdrop-blur-md rounded-3xl p-5 border border-gray-800 flex gap-4 mb-10 relative z-10">
                        <div className="flex-1 flex flex-col items-center p-3 bg-gray-800/50 rounded-2xl">
                            <span className="text-3xl font-black text-indigo-400 mb-1">{learning.length}</span>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">New Seeds</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center p-3 bg-gray-800/50 rounded-2xl">
                            <span className="text-3xl font-black text-emerald-400 mb-1">{familiar.length}</span>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">To Canopy</span>
                        </div>
                    </div>

                    <button
                        onClick={handleFinish}
                        className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-500 active:scale-[0.98] transition-all relative z-10"
                    >
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // VIEW: TRIAGE DECK
    // ----------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
            <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col shadow-2xl">

                {/* HEADER & PROGRESS */}
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

                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </header>

                {/* MAIN CARD AREA */}
                <main className="flex-1 px-6 pb-6 flex flex-col justify-center">

                    <div className={`flex-1 flex flex-col ${animationClass}`}>

                        {/* The Kanji Card */}
                        <div className="bg-gray-900 border border-gray-800 rounded-[2rem] p-6 shadow-2xl flex-1 flex flex-col relative overflow-hidden">

                            {currentKanji.recommended && (
                                <div className="absolute top-0 right-0 bg-indigo-600 text-[10px] font-bold px-3 py-1.5 rounded-bl-xl text-white uppercase tracking-widest shadow-lg">
                                    Highly Recommended
                                </div>
                            )}

                            {/* Character Header */}
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

                            {/* Context Block (The Why) */}
                            <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-2xl p-4 mb-4">
                                <p className="text-sm text-indigo-100 leading-relaxed font-medium">
                                    {currentKanji.whyUseful}
                                </p>
                            </div>

                            {/* Example Word */}
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

                        {/* ACTION BUTTONS (The Decision) */}
                        <div className="mt-6 flex gap-4">

                            {/* "Already Know" Button - Psychological Safety */}
                            <button
                                onClick={() => handleDecision('familiar')}
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

                            {/* "Want to Learn" Button */}
                            <button
                                onClick={() => handleDecision('learning')}
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