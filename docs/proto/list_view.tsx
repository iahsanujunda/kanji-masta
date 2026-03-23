import React, { useState } from 'react';

// --- Icons ---
const ChevronLeftIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="15 18 9 12 15 6"/></svg>
);
const PlusIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const CheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>
);
const SparklesIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
);
const ClipboardIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
);

// --- Mock Data ---
const mockZoneData = {
    id: 'canopy', // try changing to 'trunk' or 'roots' to see the background shift!
    name: 'Canopy',
    tier: 'Tier 4-5',
    color: 'emerald', // We use this to dynamically style the page based on the zone
    kanji: [
        { id: 1, char: '電', meaning: 'electricity', familiarity: 5 },
        { id: 2, char: '車', meaning: 'car', familiarity: 4 },
        { id: 3, char: '口', meaning: 'mouth/exit', familiarity: 5 },
        { id: 4, char: '止', meaning: 'stop', familiarity: 5 },
        { id: 5, char: '行', meaning: 'go', familiarity: 4 },
        { id: 6, char: '見', meaning: 'see', familiarity: 5 },
    ]
};

const mockExtractionResults = [
    { char: '学', meaning: 'study, learning', onyomi: 'ガク', kunyomi: 'まな.ぶ', isExtracted: true },
    { char: '生', meaning: 'life, birth', onyomi: 'セイ, ショウ', kunyomi: 'い.きる', isExtracted: true }
];

export default function App() {
    // Navigation State: 'stageList' | 'addKanji'
    const [currentView, setCurrentView] = useState('stageList');

    // Add Kanji Sandbox State
    const [sandboxText, setSandboxText] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const [results, setResults] = useState([]);
    const [addedIds, setAddedIds] = useState(new Set());

    // Styling Helpers based on Zone Theme
    const themeColors = {
        emerald: {
            text: 'text-emerald-400',
            bg: 'bg-emerald-500/20',
            border: 'border-emerald-500/50',
            button: 'bg-emerald-600 hover:bg-emerald-500 text-white',
            dotFull: 'bg-emerald-400',
            dotEmpty: 'bg-gray-700'
        },
        indigo: {
            text: 'text-indigo-400',
            bg: 'bg-indigo-500/20',
            border: 'border-indigo-500/50',
            button: 'bg-indigo-600 hover:bg-indigo-500 text-white',
            dotFull: 'bg-indigo-400',
            dotEmpty: 'bg-gray-700'
        }
    };

    const theme = themeColors[mockZoneData.color] || themeColors.emerald;

    // Background Transform Logic
    const getBackgroundTransform = (zoneId) => {
        // We scale by 3.5x to make it huge, push it 45% to the right, and adjust Y based on the zone
        switch(zoneId) {
            case 'canopy': return 'scale-[3.5] translate-x-[45%] translate-y-[25%]';
            case 'trunk': return 'scale-[3.5] translate-x-[45%] -translate-y-[15%]';
            case 'roots': return 'scale-[3.5] translate-x-[45%] -translate-y-[55%]';
            default: return 'scale-[3.5] translate-x-[45%] translate-y-[25%]';
        }
    };

    // Handlers
    const handleSandboxChange = (e) => {
        const text = e.target.value;
        setSandboxText(text);

        if (text.length > 2 && results.length === 0) {
            setIsExtracting(true);
            setTimeout(() => {
                setResults(mockExtractionResults);
                setIsExtracting(false);
            }, 800);
        } else if (text.length === 0) {
            setResults([]);
        }
    };

    const handleAddKanji = (char) => {
        setAddedIds(prev => new Set([...prev, char]));
    };

    // ----------------------------------------------------------------------
    // VIEW 1: STAGE LIST (ZONE DETAIL)
    // ----------------------------------------------------------------------
    if (currentView === 'stageList') {
        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-emerald-500/30">
                <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col shadow-2xl relative overflow-hidden">

                    {/* ZOOMED BACKGROUND TREE */}
                    <div className="absolute inset-0 z-0 pointer-events-none">
                        {/* The SVG container with zoom/offset transforms */}
                        <div className={`absolute inset-0 transition-transform duration-1000 ease-out origin-center opacity-40 blur-[1px] ${getBackgroundTransform(mockZoneData.id)}`}>
                            <svg viewBox="0 0 400 620" className="w-full h-full">
                                {/* Roots */}
                                <g>
                                    <ellipse cx="210" cy="565" rx="100" ry="15" fill="#1a1a14" />
                                    <polygon points="115,530 135,505 155,510 160,535 130,545" fill="#7a6e6a" />
                                    <polygon points="135,505 150,495 155,510" fill="#908480" />
                                    <polygon points="115,530 130,545 105,540" fill="#625856" />
                                    <polygon points="260,535 280,515 300,525 290,545 265,548" fill="#6e6462" />
                                    <polygon points="280,515 295,508 300,525" fill="#857a78" />
                                    <polygon points="100,510 120,475 145,480 150,510 125,520" fill="#4a7a2e" />
                                    <polygon points="120,475 140,460 155,475 145,480" fill="#6aad3e" />
                                    <polygon points="100,510 110,490 120,475" fill="#3d6625" />
                                    <polygon points="145,480 155,475 165,495 150,510" fill="#558c32" />
                                    <polygon points="140,460 160,455 155,475" fill="#7cc04a" />
                                    <polygon points="265,510 280,485 300,490 305,515 280,520" fill="#3d6625" />
                                    <polygon points="280,485 295,475 305,490 300,490" fill="#558c32" />
                                    <polygon points="265,510 270,495 280,485" fill="#2d4a1b" />
                                    <polygon points="300,490 310,485 305,515" fill="#4a7a2e" />
                                    <polygon points="155,530 170,510 190,515 185,535 160,540" fill="#4a7a2e" />
                                    <polygon points="170,510 185,500 190,515" fill="#6aad3e" />
                                    <polygon points="175,500 165,520 170,540 180,510" fill="#5c311c" />
                                    <polygon points="240,500 250,525 255,540 245,510" fill="#4a2615" />
                                    <polygon points="200,505 195,530 200,545 210,535 205,505" fill="#5c311c" />
                                </g>
                                {/* Trunk */}
                                <g>
                                    <polygon points="170,505 160,430 155,350 165,280 175,430" fill="#8a5535" />
                                    <polygon points="175,430 160,430 170,505" fill="#754530" />
                                    <polygon points="175,430 165,280 195,260 210,280 205,430" fill="#9e6640" />
                                    <polygon points="170,505 175,430 205,430 215,505" fill="#8a5535" />
                                    <polygon points="205,430 210,280 235,275 240,300 235,430" fill="#6b3d22" />
                                    <polygon points="215,505 205,430 235,430 240,505" fill="#5c311c" />
                                    <polygon points="235,430 240,300 250,310 245,430" fill="#4a2615" />
                                    <polygon points="240,505 235,430 245,430 248,505" fill="#4a2615" />
                                    <polygon points="180,400 185,360 195,365 190,405" fill="#b07848" />
                                    <polygon points="185,470 190,445 200,448 195,475" fill="#b07848" />
                                    <polygon points="230,320 270,280 285,290 275,310 240,340" fill="#8a5535" />
                                    <polygon points="270,280 290,265 300,280 285,290" fill="#6b3d22" />
                                    <polygon points="285,290 300,280 310,295 295,310" fill="#5c311c" />
                                    <polygon points="240,340 275,310 295,310 260,350" fill="#4a2615" />
                                    <polygon points="165,330 140,300 150,290 168,310" fill="#754530" />
                                    <polygon points="140,300 130,290 145,280 150,290" fill="#5c311c" />
                                </g>
                                {/* Canopy */}
                                <g>
                                    <polygon points="100,280 80,220 120,180 160,200 140,270" fill="#2d4a1b" />
                                    <polygon points="250,250 280,200 320,220 310,270 270,280" fill="#2d4a1b" />
                                    <polygon points="160,200 120,180 150,140 200,160" fill="#345520" />
                                    <polygon points="80,240 60,180 100,130 140,150 120,230" fill="#3a6024" />
                                    <polygon points="60,180 80,120 120,100 100,130" fill="#456929" />
                                    <polygon points="120,230 140,150 170,170 160,240" fill="#4a7a2e" />
                                    <polygon points="100,130 120,80 170,55 190,90 140,130" fill="#558c32" />
                                    <polygon points="140,130 190,90 220,85 230,120 180,150" fill="#4a7a2e" />
                                    <polygon points="180,150 230,120 260,140 240,180" fill="#3d6625" />
                                    <polygon points="120,230 140,150 180,150 200,200 160,240" fill="#4a7a2e" />
                                    <polygon points="200,200 180,150 240,180 250,210" fill="#456929" />
                                    <polygon points="160,240 200,200 250,210 230,260" fill="#3a6024" />
                                    <polygon points="240,180 260,140 300,160 290,210 260,220" fill="#3d6625" />
                                    <polygon points="260,220 290,210 310,240 290,270" fill="#2d4a1b" />
                                    <polygon points="290,210 300,160 330,200 310,240" fill="#345520" />
                                    <polygon points="290,260 305,240 325,250 320,275 300,280" fill="#3d6625" />
                                    <polygon points="305,240 320,230 330,245 325,250" fill="#4a7a2e" />
                                    <polygon points="120,80 150,45 190,40 170,55" fill="#6aad3e" />
                                    <polygon points="170,55 190,40 230,50 220,85" fill="#558c32" />
                                    <polygon points="190,40 220,35 240,55 230,50" fill="#6aad3e" />
                                    <polygon points="220,85 230,50 260,70 260,100" fill="#456929" />
                                    <polygon points="260,100 260,70 280,95 270,120" fill="#3d6625" />
                                    <polygon points="230,120 260,100 270,120 260,140" fill="#345520" />
                                    <polygon points="100,130 120,100 140,110 130,140" fill="#7cc04a" />
                                    <polygon points="120,80 140,60 160,70 140,100" fill="#8ed455" />
                                    <polygon points="140,60 165,48 175,65 160,70" fill="#9be060" />
                                    <polygon points="120,100 140,110 140,130" fill="#6aad3e" />
                                    <polygon points="80,180 100,150 120,170 100,195" fill="#6aad3e" />
                                    <polygon points="130,90 145,70 155,80 142,100" fill="#a8e870" />
                                    <polygon points="90,160 105,140 115,155" fill="#84c44e" />
                                    <polygon points="110,285 95,260 115,245 135,255 130,280" fill="#4a7a2e" />
                                    <polygon points="95,260 105,240 115,245" fill="#6aad3e" />
                                    <polygon points="115,245 130,235 140,250 135,255" fill="#558c32" />
                                </g>
                            </svg>
                        </div>

                        {/* Blending Masks: Fades the tree seamlessly into the background */}
                        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/80 to-[#0a0a0f]/10"></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent"></div>
                    </div>

                    {/* HEADER */}
                    <header className="px-6 pt-12 pb-6 relative z-20 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                className="bg-gray-800/80 backdrop-blur border border-gray-700/50 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"
                                title="Back to Tree"
                            >
                                <ChevronLeftIcon className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className={`text-2xl font-bold tracking-tight ${theme.text}`}>
                                    {mockZoneData.name}
                                </h1>
                                <p className="text-sm text-gray-400 font-medium">{mockZoneData.kanji.length} Mastered • {mockZoneData.tier}</p>
                            </div>
                        </div>

                        {/* The Contextual Add Button */}
                        <button
                            onClick={() => setCurrentView('addKanji')}
                            className={`p-3 rounded-full shadow-lg transition-transform active:scale-95 ${theme.button} shadow-${mockZoneData.color}-900/50`}
                        >
                            <PlusIcon className="w-6 h-6" />
                        </button>
                    </header>

                    {/* KANJI GRID */}
                    <main className="flex-1 p-6 overflow-y-auto relative z-20">
                        <div className="grid grid-cols-3 gap-4">
                            {mockZoneData.kanji.map(kanji => (
                                <button
                                    key={kanji.id}
                                    className={`aspect-square rounded-2xl border flex flex-col items-center justify-center transition-all hover:scale-105 bg-[#0a0a0f]/60 backdrop-blur-sm ${theme.border} hover:bg-gray-800/80`}
                                >
                                    <span className="text-3xl font-medium mb-2 text-gray-100">{kanji.char}</span>

                                    {/* 5-Dot Familiarity Indicator */}
                                    <div className="flex gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <div
                                                key={i}
                                                className={`w-1.5 h-1.5 rounded-full ${i < kanji.familiarity ? theme.dotFull : theme.dotEmpty}`}
                                            />
                                        ))}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </main>

                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // VIEW 2: ADD KANJI (TEXT SANDBOX)
    // ----------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-emerald-500/30">
            <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col shadow-2xl relative">

                {/* HEADER */}
                <header className="px-6 pt-12 pb-4 border-b border-gray-800 shrink-0">
                    <div className="flex items-center gap-4 mb-2">
                        <button
                            onClick={() => setCurrentView('stageList')}
                            className="bg-gray-800 p-2.5 rounded-full text-gray-400 hover:text-white transition-colors"
                        >
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                        <h1 className="text-xl font-bold text-gray-100">Add to {mockZoneData.name}</h1>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

                    {/* THE SANDBOX */}
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-end px-1">
                            <label className="text-sm font-bold text-gray-400 uppercase tracking-widest">Text Sandbox</label>
                            <button className="text-xs text-emerald-400 flex items-center gap-1 font-medium hover:text-emerald-300">
                                <ClipboardIcon className="w-3 h-3" /> Paste from Clipboard
                            </button>
                        </div>

                        <div className="relative group">
              <textarea
                  value={sandboxText}
                  onChange={handleSandboxChange}
                  placeholder="Paste a Japanese sentence, romaji, or an English concept here..."
                  className="w-full h-40 bg-gray-900 border-2 border-gray-800 rounded-3xl p-5 text-lg text-gray-100 resize-none focus:outline-none focus:border-emerald-500/50 focus:bg-emerald-900/10 transition-all placeholder:text-gray-600 leading-relaxed"
                  autoFocus
              />

                            {/* Inline extraction status indicator */}
                            <div className="absolute bottom-4 right-4 flex items-center gap-2">
                                {isExtracting && (
                                    <span className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-900/40 px-3 py-1.5 rounded-full border border-emerald-500/30">
                    <SparklesIcon className="w-3.5 h-3.5 animate-pulse" /> Extracting Kanji...
                  </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* EXTRACTION RESULTS */}
                    {results.length > 0 && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Extracted</h3>

                            {results.map((result) => {
                                const isAdded = addedIds.has(result.char);

                                return (
                                    <div key={result.char} className="bg-gray-800/80 rounded-3xl p-5 border border-gray-700 flex flex-col gap-4 shadow-lg">
                                        <div className="flex gap-5">
                                            <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center shrink-0 border border-gray-700 shadow-inner">
                                                <span className="text-3xl font-medium text-gray-100">{result.char}</span>
                                            </div>
                                            <div className="flex flex-col justify-center flex-1 min-w-0">
                                                <h4 className="font-bold text-xl text-gray-100 capitalize truncate mb-1">{result.meaning}</h4>
                                                <div className="flex items-center gap-2 text-xs font-mono">
                                                    <span className="text-indigo-400">{result.onyomi}</span>
                                                    <span className="text-gray-600">|</span>
                                                    <span className="text-emerald-400">{result.kunyomi}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        {isAdded ? (
                                            <div className="bg-gray-900 text-gray-400 font-bold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 border border-gray-700">
                                                <CheckIcon className="w-5 h-5 text-emerald-500" /> Planted in {mockZoneData.name}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleAddKanji(result.char)}
                                                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${theme.button}`}
                                            >
                                                <PlusIcon className="w-5 h-5" />
                                                Add to {mockZoneData.name}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </main>
            </div>
        </div>
    );
}