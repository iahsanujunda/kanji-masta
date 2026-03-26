import React, { useState, useEffect } from 'react';

// --- Icons ---
const LeafIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
);
const CameraIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
);
const BrainIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/></svg>
);
const SparklesIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
);
const CheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>
);
const StarIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
);

// --- Phone Screen Components ---

function HomeScreen() {
    return (
        <div className="absolute inset-0 flex flex-col pt-10 pb-5 px-4 bg-gradient-to-b from-[#1a1a24] to-[#0a0a0f]">
            <div className="mb-4">
                <p className="text-xs text-gray-500">Good morning</p>
                <h2 className="text-lg font-bold text-white">Yuki</h2>
            </div>
            <div className="flex items-center gap-2 mb-4">
                <div className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-1 rounded-full">7 day streak</div>
            </div>
            <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl p-3 mb-3">
                <p className="text-xs text-indigo-300 font-bold mb-1">Daily Quiz</p>
                <p className="text-sm text-white font-bold">5 quizzes ready</p>
                <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{width: '0%'}}></div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-[#0f0f16] border border-gray-800 rounded-xl p-2.5">
                    <p className="text-xs text-gray-500">Kanji</p>
                    <p className="text-lg font-bold text-white">42</p>
                    <p className="text-[10px] text-emerald-400">28 learning</p>
                </div>
                <div className="bg-[#0f0f16] border border-gray-800 rounded-xl p-2.5">
                    <p className="text-xs text-gray-500">Words</p>
                    <p className="text-lg font-bold text-white">87</p>
                    <p className="text-[10px] text-indigo-400">12 new</p>
                </div>
            </div>
            <div className="mt-auto">
                <button className="w-full bg-gray-100 text-black rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2">
                    <CameraIcon className="w-4 h-4" /> Capture Kanji
                </button>
            </div>
        </div>
    );
}

function CollectionScreen() {
    return (
        <div className="absolute inset-0 flex flex-col pt-10 pb-5 px-4 bg-gradient-to-b from-[#1a1a24] to-[#0a0a0f]">
            <div className="mb-3">
                <h2 className="text-lg font-bold text-white">Your Tree</h2>
                <p className="text-xs text-emerald-400">42 kanji growing</p>
            </div>
            <div className="flex-1 relative flex items-center justify-center">
                <svg viewBox="0 0 200 280" className="w-full h-full">
                    {/* Trunk */}
                    <polygon points="92,260 88,160 112,160 108,260" fill="#754127" />
                    <polygon points="95,180 85,160 115,160 105,180" fill="#8B5E3C" />
                    {/* Roots zone */}
                    <ellipse cx="100" cy="265" rx="45" ry="12" fill="#6b21a8" opacity="0.3" />
                    {/* Canopy */}
                    <polygon points="40,170 100,70 160,170" fill="#2d4a1b" />
                    <polygon points="55,140 100,50 145,140" fill="#3a6024" />
                    <polygon points="65,110 100,30 135,110" fill="#4a7a2e" />
                    {/* Glow dots */}
                    <circle cx="100" cy="50" r="3" fill="#a8e870" className="animate-pulse" />
                    <circle cx="75" cy="120" r="3" fill="#a8e870" className="animate-pulse" style={{animationDelay: '0.5s'}} />
                    <circle cx="125" cy="130" r="3" fill="#a8e870" className="animate-pulse" style={{animationDelay: '1s'}} />
                    <circle cx="90" cy="90" r="2.5" fill="#818cf8" className="animate-pulse" style={{animationDelay: '0.3s'}} />
                    <circle cx="110" cy="100" r="2.5" fill="#818cf8" className="animate-pulse" style={{animationDelay: '0.7s'}} />
                </svg>
                {/* Zone badges */}
                <div className="absolute top-4 right-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-2 py-1">
                    <p className="text-[9px] text-emerald-400 font-bold">Canopy 8</p>
                </div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-500/20 border border-indigo-500/30 rounded-lg px-2 py-1">
                    <p className="text-[9px] text-indigo-400 font-bold">Trunk 22</p>
                </div>
                <div className="absolute bottom-6 right-2 bg-purple-500/20 border border-purple-500/30 rounded-lg px-2 py-1">
                    <p className="text-[9px] text-purple-400 font-bold">Roots 12</p>
                </div>
            </div>
        </div>
    );
}

function CaptureScreen() {
    return (
        <div className="absolute inset-0 flex flex-col pt-10 pb-5 px-4 bg-gradient-to-b from-[#1a1a24] to-[#0a0a0f]">
            <div className="mb-3">
                <h2 className="text-lg font-bold text-white">Found Kanji</h2>
                <p className="text-xs text-gray-400">3 detected</p>
            </div>
            <div className="flex-1 overflow-hidden space-y-2.5">
                {/* Kanji card */}
                <div className="bg-[#0f0f16] border border-gray-800 rounded-xl p-3 relative">
                    <div className="absolute top-0 right-0 bg-indigo-600 px-2 py-0.5 rounded-bl-lg">
                        <p className="text-[8px] text-white font-bold">Recommended</p>
                    </div>
                    <div className="flex gap-3 mb-2.5">
                        <div className="bg-gray-900 border border-gray-800 rounded-lg w-14 h-14 flex items-center justify-center shrink-0">
                            <span className="text-3xl">電</span>
                        </div>
                        <div className="flex flex-col justify-center">
                            <p className="text-[10px] text-indigo-400 font-bold tracking-wider">デン</p>
                            <p className="text-sm font-bold text-white">Electricity</p>
                            <div className="bg-black/30 border border-gray-800 rounded px-1.5 py-0.5 mt-0.5 inline-block">
                                <span className="text-[10px] text-gray-300">電車</span>
                                <span className="text-[9px] text-gray-500 ml-1">(train)</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="flex-1 bg-gray-900 border-2 border-transparent text-gray-400 rounded-lg py-2 text-[11px] font-semibold flex items-center justify-center gap-1">
                            <CheckIcon className="w-3 h-3" /> Already Know
                        </button>
                        <button className="flex-1 bg-indigo-600 border-2 border-indigo-400 text-white rounded-lg py-2 text-[11px] font-semibold flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(79,70,229,0.4)]">
                            <StarIcon className="w-3 h-3" /> Want to Learn
                        </button>
                    </div>
                </div>
                {/* Second card (peek) */}
                <div className="bg-[#0f0f16] border border-gray-800 rounded-xl p-3">
                    <div className="flex gap-3">
                        <div className="bg-gray-900 border border-gray-800 rounded-lg w-14 h-14 flex items-center justify-center shrink-0">
                            <span className="text-3xl">車</span>
                        </div>
                        <div className="flex flex-col justify-center">
                            <p className="text-[10px] text-indigo-400 font-bold tracking-wider">シャ</p>
                            <p className="text-sm font-bold text-white">Vehicle</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function QuizScreen() {
    return (
        <div className="absolute inset-0 flex flex-col pt-10 pb-5 px-4 bg-gradient-to-b from-[#1a1a24] to-[#0a0a0f]">
            {/* Progress bar */}
            <div className="w-full bg-gray-800 rounded-full h-1.5 mb-6">
                <div className="bg-indigo-500 h-1.5 rounded-full" style={{width: '40%'}}></div>
            </div>
            <p className="text-xs text-gray-500 mb-1 text-center">What does this word mean?</p>
            <div className="text-center mb-6">
                <p className="text-3xl font-bold text-white mb-1">電車</p>
                <p className="text-sm text-indigo-400">でんしゃ</p>
            </div>
            <div className="space-y-2.5 flex-1">
                <button className="w-full bg-[#0f0f16] border border-gray-800 rounded-xl p-3 text-left text-sm text-gray-300 hover:border-indigo-500/50 transition-colors">
                    Electricity
                </button>
                <button className="w-full bg-indigo-600/20 border-2 border-indigo-500 rounded-xl p-3 text-left text-sm text-white font-semibold">
                    Train
                </button>
                <button className="w-full bg-[#0f0f16] border border-gray-800 rounded-xl p-3 text-left text-sm text-gray-300 hover:border-indigo-500/50 transition-colors">
                    Lightning
                </button>
                <button className="w-full bg-[#0f0f16] border border-gray-800 rounded-xl p-3 text-left text-sm text-gray-300 hover:border-indigo-500/50 transition-colors">
                    Battery
                </button>
            </div>
            <div className="mt-auto flex items-center justify-between text-xs text-gray-500">
                <span>2 of 5</span>
                <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-700"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-700"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-700"></div>
                </div>
            </div>
        </div>
    );
}

const SCREENS = [
    { component: HomeScreen, label: 'Home' },
    { component: CollectionScreen, label: 'Collection' },
    { component: CaptureScreen, label: 'Capture' },
    { component: QuizScreen, label: 'Quiz' },
];

function PhoneCarousel() {
    const [active, setActive] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setActive((prev) => (prev + 1) % SCREENS.length);
        }, 4000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="relative mx-auto w-full max-w-[320px] lg:max-w-[380px]">
            {/* Phone frame */}
            <div className="relative rounded-[2.5rem] bg-[#0a0a0f] border-[6px] border-gray-800 shadow-2xl overflow-hidden aspect-[9/19] z-10">
                {SCREENS.map(({ component: Screen }, i) => (
                    <div
                        key={i}
                        className="absolute inset-0 transition-opacity duration-700"
                        style={{ opacity: active === i ? 1 : 0, pointerEvents: active === i ? 'auto' : 'none' }}
                    >
                        <Screen />
                    </div>
                ))}
            </div>

            {/* Dot indicators */}
            <div className="flex items-center justify-center gap-2 mt-6">
                {SCREENS.map(({ label }, i) => (
                    <button
                        key={i}
                        onClick={() => setActive(i)}
                        className={`transition-all duration-300 rounded-full ${
                            active === i
                                ? 'w-8 h-2.5 bg-emerald-400'
                                : 'w-2.5 h-2.5 bg-gray-700 hover:bg-gray-600'
                        }`}
                        title={label}
                    />
                ))}
            </div>
            <p className="text-center text-xs text-gray-500 mt-2 font-medium">{SCREENS[active].label}</p>

            {/* Floating UI Elements */}
            <div className="absolute top-20 -left-12 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-2xl p-3 shadow-xl transform -rotate-6 animate-[bounce_4s_infinite] hidden lg:block">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                        <span className="text-xl font-medium text-white">電</span>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400">Extracted</p>
                        <p className="text-sm font-bold text-indigo-400">Electricity</p>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-32 -right-8 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-2xl p-3 shadow-xl transform rotate-3 animate-[bounce_5s_infinite] hidden lg:block">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-700"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-700"></div>
                    </div>
                    <p className="text-xs font-bold text-gray-300 ml-1">Level 3</p>
                </div>
            </div>
        </div>
    );
}

// --- Main Landing Page ---

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[#050508] font-sans text-gray-100 selection:bg-emerald-500/30 overflow-x-hidden">

            {/* --- NAVBAR --- */}
            <nav className="fixed top-0 w-full z-50 bg-[#050508]/80 backdrop-blur-lg border-b border-gray-800/50">
                <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-indigo-600 flex items-center justify-center">
                            <LeafIcon className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-white">Shuukan</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
                        <button className="text-white hover:text-emerald-400 transition-colors">Log In</button>
                        <button className="bg-white text-black px-5 py-2.5 rounded-full hover:bg-gray-200 transition-transform active:scale-95">
                            Get Early Access
                        </button>
                    </div>
                </div>
            </nav>

            {/* --- HERO SECTION --- */}
            <section className="relative pt-40 pb-20 lg:pt-48 lg:pb-32 px-6">
                {/* Background Glows */}
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-600/20 blur-[120px] rounded-full pointer-events-none"></div>
                <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>

                <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-8 items-center relative z-10">

                    {/* Hero Copy */}
                    <div className="flex flex-col items-start text-left">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-bold mb-6">
                            <SparklesIcon className="w-4 h-4" /> The Anti-Anki App
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 tracking-tight leading-[1.1] mb-6">
                            Don't study Japanese. <br/>
                            <span className="text-emerald-400">Live it.</span>
                        </h1>
                        <p className="text-lg lg:text-xl text-gray-400 leading-relaxed mb-10 max-w-lg">
                            Snap photos of menus, signs, and screens. Shuukan extracts the characters, tests your recall in bite-sized daily slots, and grows your personal language ecosystem.
                        </p>

                        <button className="bg-emerald-500 hover:bg-emerald-400 text-black text-lg font-bold px-8 py-4 rounded-full transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                            Get Early Access
                        </button>
                        <p className="mt-4 text-xs text-gray-500 font-medium">Free forever for early adopters. No hidden subscriptions.</p>
                    </div>

                    {/* Phone Carousel */}
                    <PhoneCarousel />
                </div>
            </section>

            {/* --- FEATURES GRID --- */}
            <section className="py-24 bg-[#0a0a0f] border-t border-gray-900">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl lg:text-5xl font-bold text-white mb-4">A workflow built for real life.</h2>
                        <p className="text-gray-400 max-w-2xl mx-auto text-lg">No spreadsheets. No massive flashcard decks. Shuukan turns the world around you into a personalized curriculum.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Feature 1 */}
                        <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-8 hover:bg-[#14141e] transition-colors">
                            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6">
                                <CameraIcon className="w-7 h-7 text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">1. Text-Based Camera</h3>
                            <p className="text-gray-400 leading-relaxed text-sm">
                                See a word you don't know? Snap it. Our AI extracts the characters, translates the context, and creates a learning card instantly.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-8 hover:bg-[#14141e] transition-colors">
                            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
                                <BrainIcon className="w-7 h-7 text-emerald-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">2. Frictionless Triage</h3>
                            <p className="text-gray-400 leading-relaxed text-sm">
                                A rapid-fire swipe interface lets you instantly categorize new words as "Already Know" or "Want to Learn" without overthinking it.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-8 hover:bg-[#14141e] transition-colors">
                            <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6">
                                <LeafIcon className="w-7 h-7 text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">3. Grow Your Ecosystem</h3>
                            <p className="text-gray-400 leading-relaxed text-sm">
                                Watch your vocabulary physically grow. Words move from seeds in the roots, up the trunk, to glowing fruits in the canopy as you master them.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FOOTER CTA --- */}
            <footer className="border-t border-gray-900 bg-[#050508] pt-20 pb-10 px-6 text-center">
                <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">Ready to plant your first seed?</h2>
                <button className="bg-white hover:bg-gray-200 text-black text-lg font-bold px-10 py-4 rounded-full transition-transform active:scale-95 mb-16">
                    Get Early Access
                </button>

                <div className="flex flex-col md:flex-row items-center justify-between max-w-6xl mx-auto pt-8 border-t border-gray-900 text-sm text-gray-500 font-medium">
                    <div className="flex items-center gap-2 mb-4 md:mb-0">
                        <LeafIcon className="w-4 h-4 text-gray-600" />
                        <span>&copy; 2026 Shuukan App. All rights reserved.</span>
                    </div>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-gray-300 transition-colors">Privacy</a>
                        <a href="#" className="hover:text-gray-300 transition-colors">Terms</a>
                        <a href="#" className="hover:text-gray-300 transition-colors">Twitter</a>
                    </div>
                </div>
            </footer>

        </div>
    );
}
