import React, { useState } from 'react';

// --- Icons ---
const ChevronLeftIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="15 18 9 12 15 6"/></svg>
);
const SearchIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const SproutIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>
);
const TreeIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
);
const ToggleRightIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="16" cy="12" r="2"/></svg>
);
const ToggleLeftIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="12" x="2" y="6" rx="6" ry="6"/><circle cx="8" cy="12" r="2"/></svg>
);

// --- Mock Data ---
const mockCurriculums = [
    { id: 'n5', title: 'JLPT N5', subtitle: 'The Basics', total: 103, planted: 42, color: 'indigo' },
    { id: 'n4', title: 'JLPT N4', subtitle: 'Everyday Life', total: 181, planted: 12, color: 'emerald' },
    { id: 'signs', title: 'Street Signs', subtitle: 'Survival Japanese', total: 50, planted: 8, color: 'orange' },
];

// 0: Unplanted (Gray), 1: Planted/Learning (Indigo), 5: Mastered (Emerald)
const mockN5Kanji = [
    { char: '一', meaning: 'One', status: 5 }, { char: '二', meaning: 'Two', status: 5 }, { char: '三', meaning: 'Three', status: 5 },
    { char: '四', meaning: 'Four', status: 1 }, { char: '五', meaning: 'Five', status: 1 }, { char: '六', meaning: 'Six', status: 0 },
    { char: '日', meaning: 'Sun/Day', status: 5 }, { char: '月', meaning: 'Moon/Month', status: 5 }, { char: '火', meaning: 'Fire', status: 1 },
    { char: '水', meaning: 'Water', status: 0 }, { char: '木', meaning: 'Tree', status: 0 }, { char: '金', meaning: 'Gold/Money', status: 0 },
    { char: '人', meaning: 'Person', status: 5 }, { char: '男', meaning: 'Man', status: 1 }, { char: '女', meaning: 'Woman', status: 0 },
    { char: '見', meaning: 'See', status: 5 }, { char: '行', meaning: 'Go', status: 1 }, { char: '食', meaning: 'Eat', status: 0 },
];

export default function App() {
    const [currentView, setCurrentView] = useState('hub'); // 'hub' | 'curriculum'
    const [searchQuery, setSearchQuery] = useState('');
    const [isDripFeedActive, setIsDripFeedActive] = useState(false);
    const [selectedKanji, setSelectedKanji] = useState(null); // For bottom sheet

    // Handlers
    const handleKanjiTap = (kanji) => {
        if (kanji.status === 0) setSelectedKanji(kanji);
    };

    const handleTriageAction = (action) => {
        // In real app, update kanji status here
        setSelectedKanji(null);
    };

    // ----------------------------------------------------------------------
    // VIEW 1: THE GREENHOUSE HUB
    // ----------------------------------------------------------------------
    if (currentView === 'hub') {
        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
                <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col shadow-2xl overflow-hidden relative">

                    <header className="px-6 pt-12 pb-6 bg-[#0a0a0f] sticky top-0 z-20">
                        <h1 className="text-2xl font-bold tracking-tight text-white mb-6 flex items-center gap-2">
                            <SproutIcon className="w-6 h-6 text-emerald-400" />
                            The Greenhouse
                        </h1>

                        {/* Omni-Search */}
                        <div className="relative group">
                            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search English, Romaji, or Kanji..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-gray-900 border-2 border-gray-800 text-gray-100 text-[15px] font-medium rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:border-indigo-500/50 focus:bg-indigo-900/10 transition-all placeholder:text-gray-500"
                            />
                        </div>
                    </header>

                    <main className="flex-1 px-6 pb-24 overflow-y-auto">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Curriculums</h2>

                        <div className="flex flex-col gap-4">
                            {mockCurriculums.map(list => {
                                const progressPercent = (list.planted / list.total) * 100;
                                return (
                                    <button
                                        key={list.id}
                                        onClick={() => setCurrentView('curriculum')}
                                        className="bg-gray-900 border border-gray-800 rounded-3xl p-5 text-left transition-all hover:bg-gray-800 active:scale-[0.98] group relative overflow-hidden"
                                    >
                                        {/* Subtle glow effect */}
                                        <div className={`absolute -right-10 -top-10 w-32 h-32 bg-${list.color}-500/10 rounded-full blur-2xl group-hover:bg-${list.color}-500/20 transition-colors`}></div>

                                        <div className="flex justify-between items-start mb-4 relative z-10">
                                            <div>
                                                <h3 className="text-lg font-bold text-white">{list.title}</h3>
                                                <p className="text-xs text-gray-400 font-medium">{list.subtitle}</p>
                                            </div>
                                            <div className="bg-gray-800 px-3 py-1 rounded-full border border-gray-700">
                        <span className="text-xs font-bold text-gray-300">
                          {list.planted} <span className="text-gray-500">/ {list.total}</span>
                        </span>
                                            </div>
                                        </div>

                                        <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden relative z-10">
                                            <div
                                                className={`h-full bg-${list.color}-500 rounded-full`}
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </main>

                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // VIEW 2: CURRICULUM DETAIL (e.g., JLPT N5)
    // ----------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
            <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col shadow-2xl relative">

                {/* HEADER */}
                <header className="px-6 pt-12 pb-6 border-b border-gray-800 bg-[#0a0a0f]/90 backdrop-blur-md sticky top-0 z-20">
                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={() => setCurrentView('hub')}
                            className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"
                        >
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-100">JLPT N5</h1>
                            <p className="text-xs text-gray-400 font-medium">103 Characters</p>
                        </div>
                    </div>

                    {/* Drip-Feed Habit Toggle */}
                    <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex gap-3 items-center">
                            <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center shrink-0">
                                <SproutIcon className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-indigo-100">Auto-Plant Seeds</h3>
                                <p className="text-[10px] text-indigo-300 leading-tight">Adds 2 unlearned kanji to your daily slots.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsDripFeedActive(!isDripFeedActive)}
                            className="text-indigo-400 p-1"
                        >
                            {isDripFeedActive ? <ToggleRightIcon className="w-8 h-8" /> : <ToggleLeftIcon className="w-8 h-8 text-gray-600" />}
                        </button>
                    </div>
                </header>

                {/* KANJI GRID */}
                <main className="flex-1 p-6 overflow-y-auto">

                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Character List</h2>
                        {/* Updated Legend */}
                        <div className="flex gap-3 text-[10px] font-bold text-gray-500 uppercase">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full border-2 border-dotted border-gray-500"></div> New
                </span>
                            <span className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full border border-indigo-500/50 bg-indigo-500/20"></div> Growing
                </span>
                            <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div> Mastered
                </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 pb-24">
                        {mockN5Kanji.map((kanji, idx) => {
                            // Default to Status 0 (Unplanted) - Brighter grey, thicker 2px dotted border for visibility
                            let style = "bg-[#0a0a0f] border-2 border-dotted border-gray-500 text-gray-500 hover:bg-gray-900 hover:text-gray-300 hover:border-gray-400 active:scale-95";

                            if (kanji.status === 5) {
                                // Mastered - Bolder 2px solid border, emerald glow
                                style = "bg-emerald-500/10 border-2 border-solid border-emerald-500/80 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)] cursor-default";
                            } else if (kanji.status === 1) {
                                // Learning - Reverted to softer look: 1px solid border with inner shadow glow
                                style = "bg-indigo-500/10 border border-solid border-indigo-500/50 text-indigo-300 shadow-[inset_0_0_15px_rgba(99,102,241,0.2)] cursor-default";
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleKanjiTap(kanji)}
                                    className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all ${style}`}
                                    disabled={kanji.status !== 0}
                                >
                                    <span className="text-2xl font-medium">{kanji.char}</span>
                                    {kanji.status === 0 && <span className="text-[9px] mt-1 truncate w-full px-1">{kanji.meaning}</span>}
                                </button>
                            )
                        })}
                    </div>
                </main>

                {/* ----------------------------------------------------------------------
            INDIVIDUAL ADD BOTTOM SHEET (Appears when clicking a gray kanji)
            ---------------------------------------------------------------------- */}
                {selectedKanji && (
                    <div className="absolute inset-0 z-50 flex items-end animate-in fade-in duration-200">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
                            onClick={() => setSelectedKanji(null)}
                        ></div>

                        {/* Sheet */}
                        <div className="w-full bg-gray-900 border-t border-gray-800 rounded-t-[2rem] p-6 pb-12 relative z-10 animate-in slide-in-from-bottom-full duration-300 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
                            <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-6"></div>

                            <div className="flex items-center gap-6 mb-8">
                                <div className="w-24 h-24 bg-gray-800 rounded-3xl flex items-center justify-center border border-gray-700 shadow-inner shrink-0">
                                    <span className="text-6xl font-medium text-gray-100">{selectedKanji.char}</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-100 mb-1">{selectedKanji.meaning}</h2>
                                    <p className="text-sm text-gray-400">Unplanted Seed • JLPT N5</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => handleTriageAction('familiar')}
                                    className="flex-1 bg-gray-800 border-2 border-emerald-900/50 hover:bg-emerald-900/20 hover:border-emerald-500/50 text-emerald-400 rounded-2xl p-4 flex flex-col items-center gap-1 transition-all active:scale-95"
                                >
                                    <TreeIcon className="w-6 h-6 mb-1" />
                                    <span className="font-bold text-sm">Already Know</span>
                                    <span className="text-[10px] text-gray-500 mt-1">Send to Canopy</span>
                                </button>

                                <button
                                    onClick={() => handleTriageAction('learning')}
                                    className="flex-1 bg-indigo-600 border-2 border-indigo-500 hover:bg-indigo-500 text-white rounded-2xl p-4 flex flex-col items-center gap-1 shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all active:scale-95"
                                >
                                    <SproutIcon className="w-6 h-6 mb-1" />
                                    <span className="font-bold text-sm">Want to Learn</span>
                                    <span className="text-[10px] text-indigo-200 mt-1">Start from Level 0</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}