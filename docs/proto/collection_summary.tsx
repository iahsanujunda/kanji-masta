import React, { useState } from 'react';

// --- Mock Data ---
const mockCollection = {
    total: 128,
    canopy: { count: 42, label: 'Mastered', tier: 'Tier 4-5' },
    trunk: { count: 56, label: 'Growing', tier: 'Tier 2-3' },
    roots: { count: 30, label: 'Seeded', tier: 'Tier 0-1' },
};

export default function App() {
    const [hoveredZone, setHoveredZone] = useState(null);

    const getZoneOpacity = (zone) => {
        if (!hoveredZone) return 'opacity-100';
        return hoveredZone === zone ? 'opacity-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'opacity-40';
    };

    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
            <div className="w-full max-w-md bg-gradient-to-b from-[#1a1a24] to-[#0a0a0f] min-h-screen relative overflow-hidden flex flex-col shadow-2xl">

                {/* HEADER */}
                <header className="px-6 pt-12 pb-4 relative z-20 pointer-events-none">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-100 drop-shadow-md tracking-tight">Your Tree</h1>
                            <p className="text-sm text-indigo-300/80 font-medium mt-1">{mockCollection.total} Kanji in Ecosystem</p>
                        </div>
                    </div>
                </header>

                {/* INTERACTIVE LOW-POLY TREE CONTAINER */}
                <div className="flex-1 relative w-full h-full flex items-center justify-center">

                    {/* THE SVG TREE */}
                    <div className="absolute inset-0 z-0 flex items-center justify-center -translate-y-4">
                        <svg viewBox="0 0 400 620" className="w-full h-full overflow-visible drop-shadow-2xl">

                            {/* --- 1. ROOTS & BASE (Tier 0-1) --- */}
                            <g
                                onMouseEnter={() => setHoveredZone('roots')}
                                onMouseLeave={() => setHoveredZone(null)}
                                className={`transition-all duration-500 cursor-pointer ${getZoneOpacity('roots')}`}
                            >
                                {/* Ground shadow */}
                                <ellipse cx="210" cy="565" rx="100" ry="15" fill="#1a1a14" opacity="0.5" />

                                {/* Left rock cluster */}
                                <polygon points="115,530 135,505 155,510 160,535 130,545" fill="#7a6e6a" />
                                <polygon points="135,505 150,495 155,510" fill="#908480" />
                                <polygon points="115,530 130,545 105,540" fill="#625856" />

                                {/* Right rock */}
                                <polygon points="260,535 280,515 300,525 290,545 265,548" fill="#6e6462" />
                                <polygon points="280,515 295,508 300,525" fill="#857a78" />

                                {/* Left bush - large, rounded low-poly */}
                                <polygon points="100,510 120,475 145,480 150,510 125,520" fill="#4a7a2e" />
                                <polygon points="120,475 140,460 155,475 145,480" fill="#6aad3e" />
                                <polygon points="100,510 110,490 120,475" fill="#3d6625" />
                                <polygon points="145,480 155,475 165,495 150,510" fill="#558c32" />
                                <polygon points="140,460 160,455 155,475" fill="#7cc04a" />

                                {/* Right bush - smaller */}
                                <polygon points="265,510 280,485 300,490 305,515 280,520" fill="#3d6625" />
                                <polygon points="280,485 295,475 305,490 300,490" fill="#558c32" />
                                <polygon points="265,510 270,495 280,485" fill="#2d4a1b" />
                                <polygon points="300,490 310,485 305,515" fill="#4a7a2e" />

                                {/* Small front bush */}
                                <polygon points="155,530 170,510 190,515 185,535 160,540" fill="#4a7a2e" />
                                <polygon points="170,510 185,500 190,515" fill="#6aad3e" />

                                {/* Root tendrils visible above ground */}
                                <polygon points="175,500 165,520 170,540 180,510" fill="#5c311c" />
                                <polygon points="240,500 250,525 255,540 245,510" fill="#4a2615" />
                                <polygon points="200,505 195,530 200,545 210,535 205,505" fill="#5c311c" />
                            </g>

                            {/* --- 2. TRUNK (Tier 2-3) --- */}
                            <g
                                onMouseEnter={() => setHoveredZone('trunk')}
                                onMouseLeave={() => setHoveredZone(null)}
                                className={`transition-all duration-500 cursor-pointer ${getZoneOpacity('trunk')}`}
                            >
                                {/* Thick main trunk - slightly curved right, wide at base */}
                                {/* Left edge of trunk */}
                                <polygon points="170,505 160,430 155,350 165,280 175,430" fill="#8a5535" />
                                <polygon points="175,430 160,430 170,505" fill="#754530" />

                                {/* Trunk front face (lit) */}
                                <polygon points="175,430 165,280 195,260 210,280 205,430" fill="#9e6640" />
                                <polygon points="170,505 175,430 205,430 215,505" fill="#8a5535" />

                                {/* Trunk right face (shadow) */}
                                <polygon points="205,430 210,280 235,275 240,300 235,430" fill="#6b3d22" />
                                <polygon points="215,505 205,430 235,430 240,505" fill="#5c311c" />

                                {/* Trunk right edge */}
                                <polygon points="235,430 240,300 250,310 245,430" fill="#4a2615" />
                                <polygon points="240,505 235,430 245,430 248,505" fill="#4a2615" />

                                {/* Bark texture highlights */}
                                <polygon points="180,400 185,360 195,365 190,405" fill="#b07848" opacity="0.6" />
                                <polygon points="185,470 190,445 200,448 195,475" fill="#b07848" opacity="0.4" />

                                {/* Right branch - extending outward and up */}
                                <polygon points="230,320 270,280 285,290 275,310 240,340" fill="#8a5535" />
                                <polygon points="270,280 290,265 300,280 285,290" fill="#6b3d22" />
                                <polygon points="285,290 300,280 310,295 295,310" fill="#5c311c" />
                                {/* Branch underside */}
                                <polygon points="240,340 275,310 295,310 260,350" fill="#4a2615" />

                                {/* Small left branch stub */}
                                <polygon points="165,330 140,300 150,290 168,310" fill="#754530" />
                                <polygon points="140,300 130,290 145,280 150,290" fill="#5c311c" />
                            </g>

                            {/* --- 3. CANOPY (Tier 4-5) --- */}
                            <g
                                onMouseEnter={() => setHoveredZone('canopy')}
                                onMouseLeave={() => setHoveredZone(null)}
                                className={`transition-all duration-500 cursor-pointer ${getZoneOpacity('canopy')}`}
                            >
                                {/* Back layer (darkest) - gives depth */}
                                <polygon points="100,280 80,220 120,180 160,200 140,270" fill="#2d4a1b" />
                                <polygon points="250,250 280,200 320,220 310,270 270,280" fill="#2d4a1b" />
                                <polygon points="160,200 120,180 150,140 200,160" fill="#345520" />

                                {/* Large canopy body - rounded mass */}
                                {/* Left cluster */}
                                <polygon points="80,240 60,180 100,130 140,150 120,230" fill="#3a6024" />
                                <polygon points="60,180 80,120 120,100 100,130" fill="#456929" />
                                <polygon points="120,230 140,150 170,170 160,240" fill="#4a7a2e" />

                                {/* Central mass - top */}
                                <polygon points="100,130 120,80 170,55 190,90 140,130" fill="#558c32" />
                                <polygon points="140,130 190,90 220,85 230,120 180,150" fill="#4a7a2e" />
                                <polygon points="180,150 230,120 260,140 240,180" fill="#3d6625" />

                                {/* Central mass - mid */}
                                <polygon points="120,230 140,150 180,150 200,200 160,240" fill="#4a7a2e" />
                                <polygon points="200,200 180,150 240,180 250,210" fill="#456929" />
                                <polygon points="160,240 200,200 250,210 230,260" fill="#3a6024" />

                                {/* Right side cluster */}
                                <polygon points="240,180 260,140 300,160 290,210 260,220" fill="#3d6625" />
                                <polygon points="260,220 290,210 310,240 290,270" fill="#2d4a1b" />
                                <polygon points="290,210 300,160 330,200 310,240" fill="#345520" />

                                {/* Small right branch foliage */}
                                <polygon points="290,260 305,240 325,250 320,275 300,280" fill="#3d6625" />
                                <polygon points="305,240 320,230 330,245 325,250" fill="#4a7a2e" />

                                {/* Top crown */}
                                <polygon points="120,80 150,45 190,40 170,55" fill="#6aad3e" />
                                <polygon points="170,55 190,40 230,50 220,85" fill="#558c32" />
                                <polygon points="190,40 220,35 240,55 230,50" fill="#6aad3e" />
                                <polygon points="220,85 230,50 260,70 260,100" fill="#456929" />
                                <polygon points="260,100 260,70 280,95 270,120" fill="#3d6625" />
                                <polygon points="230,120 260,100 270,120 260,140" fill="#345520" />

                                {/* Lit facets (upper-left light source) */}
                                <polygon points="100,130 120,100 140,110 130,140" fill="#7cc04a" />
                                <polygon points="120,80 140,60 160,70 140,100" fill="#8ed455" />
                                <polygon points="140,60 165,48 175,65 160,70" fill="#9be060" />
                                <polygon points="120,100 140,110 140,130" fill="#6aad3e" />
                                <polygon points="80,180 100,150 120,170 100,195" fill="#6aad3e" />

                                {/* Brightest highlight facets */}
                                <polygon points="130,90 145,70 155,80 142,100" fill="#a8e870" />
                                <polygon points="90,160 105,140 115,155" fill="#84c44e" />

                                {/* Small left leaf cluster (on left branch stub) */}
                                <polygon points="110,285 95,260 115,245 135,255 130,280" fill="#4a7a2e" />
                                <polygon points="95,260 105,240 115,245" fill="#6aad3e" />
                                <polygon points="115,245 130,235 140,250 135,255" fill="#558c32" />
                            </g>

                        </svg>
                    </div>

                    {/* --- FLOATING SUMMARY BADGES --- */}

                    {/* Canopy Badge */}
                    <div
                        onMouseEnter={() => setHoveredZone('canopy')}
                        onMouseLeave={() => setHoveredZone(null)}
                        className={`absolute top-[18%] left-8 cursor-pointer transition-all duration-500 ease-out z-10
              ${hoveredZone === 'canopy' ? 'scale-105 translate-x-2' : 'scale-100 hover:scale-105'}
              ${hoveredZone && hoveredZone !== 'canopy' ? 'opacity-20' : 'opacity-100'}`}
                    >
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">{mockCollection.canopy.label}</p>
                            <h2 className="text-3xl font-black text-white">{mockCollection.canopy.count}</h2>
                            <p className="text-[10px] text-gray-400 font-mono mt-1">{mockCollection.canopy.tier}</p>
                        </div>
                        <div className={`absolute top-1/2 -right-12 w-12 h-[1px] bg-emerald-500/50 transition-all duration-500 ${hoveredZone === 'canopy' ? 'w-16 -right-16 opacity-100' : 'opacity-0'}`}></div>
                    </div>

                    {/* Trunk Badge */}
                    <div
                        onMouseEnter={() => setHoveredZone('trunk')}
                        onMouseLeave={() => setHoveredZone(null)}
                        className={`absolute top-[50%] right-8 cursor-pointer transition-all duration-500 ease-out z-10
              ${hoveredZone === 'trunk' ? 'scale-105 -translate-x-2' : 'scale-100 hover:scale-105'}
              ${hoveredZone && hoveredZone !== 'trunk' ? 'opacity-20' : 'opacity-100'}`}
                    >
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden group text-right">
                            <div className="absolute inset-0 bg-gradient-to-bl from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">{mockCollection.trunk.label}</p>
                            <h2 className="text-3xl font-black text-white">{mockCollection.trunk.count}</h2>
                            <p className="text-[10px] text-gray-400 font-mono mt-1">{mockCollection.trunk.tier}</p>
                        </div>
                        <div className={`absolute top-1/2 -left-12 w-12 h-[1px] bg-indigo-500/50 transition-all duration-500 ${hoveredZone === 'trunk' ? 'w-16 -left-16 opacity-100' : 'opacity-0'}`}></div>
                    </div>

                    {/* Roots Badge */}
                    <div
                        onMouseEnter={() => setHoveredZone('roots')}
                        onMouseLeave={() => setHoveredZone(null)}
                        className={`absolute bottom-[10%] left-12 cursor-pointer transition-all duration-500 ease-out z-10
              ${hoveredZone === 'roots' ? 'scale-105 translate-x-2' : 'scale-100 hover:scale-105'}
              ${hoveredZone && hoveredZone !== 'roots' ? 'opacity-20' : 'opacity-100'}`}
                    >
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">{mockCollection.roots.label}</p>
                            <h2 className="text-3xl font-black text-white">{mockCollection.roots.count}</h2>
                            <p className="text-[10px] text-gray-400 font-mono mt-1">{mockCollection.roots.tier}</p>
                        </div>
                        <div className={`absolute top-1/2 -right-8 w-8 h-[1px] bg-purple-500/50 transition-all duration-500 ${hoveredZone === 'roots' ? 'w-12 -right-12 opacity-100' : 'opacity-0'}`}></div>
                    </div>

                </div>

                {/* BOTTOM NAV / ACTION */}
                <div className="px-6 pb-8 pt-4 relative z-20">
                    <button className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-900/50 hover:bg-indigo-500 active:scale-[0.98] transition-all tracking-wide">
                        Add Kanji
                    </button>
                </div>

            </div>
        </div>
    );
}