import React, { useState } from 'react';

// --- Icons ---
const ArrowLeftIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
);
const SearchIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);

// --- Mock Dictionary Data (Mixed Levels) ---
const mockDictionary = [
    { id: 1, word: '暗証番号', furigana: 'あんしょうばんごう', meaning: 'PIN code', level: 5 },
    { id: 2, word: '急ぐ', furigana: 'いそぐ', meaning: 'to hurry', level: 2 },
    { id: 3, word: '依頼', furigana: 'いらい', meaning: 'request', level: 4 },
    { id: 4, word: '依頼主', furigana: 'いらいぬし', meaning: 'requester, sender', level: 1 },
    { id: 5, word: '受付', furigana: 'うけつけ', meaning: 'reception (desk)', level: 5 },
    { id: 6, word: '受け取る', furigana: 'うけとる', meaning: 'to receive, to accept', level: 0 },
    { id: 7, word: '受ける', furigana: 'うける', meaning: 'to receive, to take (a test)', level: 3 },
];

export default function Dictionary() {
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className="min-h-screen bg-[#111114] flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
            <div className="w-full max-w-md bg-[#111114] min-h-screen flex flex-col shadow-2xl relative">

                {/* HEADER */}
                <header className="px-5 pt-12 pb-4 sticky top-0 z-20 bg-[#111114]/95 backdrop-blur-md">
                    <div className="flex items-center gap-4 mb-6">
                        <button className="bg-gray-800/80 p-2 rounded-full text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
                            <ArrowLeftIcon className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-100">Dictionary</h1>
                            <p className="text-[13px] text-gray-400 font-medium">83 words</p>
                        </div>
                    </div>

                    <div className="relative group">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search kanji, hiragana, or romaji..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#18181c] border border-gray-800/80 text-gray-200 text-sm font-medium rounded-2xl pl-11 pr-4 py-3.5 focus:outline-none focus:border-indigo-500/50 focus:bg-gray-900 transition-all placeholder:text-gray-500"
                        />
                    </div>
                </header>

                {/* DICTIONARY LIST */}
                <main className="flex-1 px-5 pb-12 flex flex-col gap-3 overflow-y-auto">
                    {mockDictionary.map((item) => {
                        // Setup base visual variables
                        let cardStyle = "bg-[#18181c] border-gray-800/60";
                        let dotColor = "bg-gray-800";
                        let indicatorStyle = "border-transparent";

                        // Determine Hierarchy
                        if (item.level === 5) {
                            // Mastered: Vibrant, gradient wash, glowing dots
                            cardStyle = "bg-gradient-to-r from-emerald-500/10 to-[#18181c] border-emerald-900/50 shadow-[0_4px_20px_rgba(16,185,129,0.04)]";
                            dotColor = "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"; // NEON GLOW
                            indicatorStyle = "border-emerald-500";
                        } else if (item.level > 0) {
                            // Learning: Very subtle tint, flat dots
                            cardStyle = "bg-gradient-to-r from-indigo-500/5 to-[#18181c] border-indigo-900/30";
                            dotColor = "bg-indigo-500"; // FLAT (No shadow/glow)
                            indicatorStyle = "border-indigo-500/40";
                        }

                        return (
                            <div
                                key={item.id}
                                className={`relative border rounded-2xl p-4 flex justify-between items-center transition-all overflow-hidden ${cardStyle}`}
                            >
                                {/* Subtle Left Status Anchor */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 border-l-2 ${indicatorStyle}`}></div>

                                <div className="pl-1">
                                    <div className="flex items-baseline gap-3 mb-1.5">
                                        <span className="text-lg font-bold text-gray-100">{item.word}</span>
                                        <span className="text-xs font-medium text-gray-400">{item.furigana}</span>
                                    </div>
                                    <p className="text-sm text-gray-400/90">{item.meaning}</p>
                                </div>

                                {/* The 5-Dot Mastery Indicator */}
                                <div className="flex gap-1.5 items-center pl-4 shrink-0">
                                    {[...Array(5)].map((_, i) => (
                                        <div
                                            key={i}
                                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i < item.level ? dotColor : 'bg-gray-800'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </main>
            </div>
        </div>
    );
}