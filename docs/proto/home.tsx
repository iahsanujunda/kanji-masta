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

export default function App() {
    // State for prototype toggling
    const [slotState, setSlotState] = useState('active'); // 'active' or 'completed'
    const [currentTime, setCurrentTime] = useState(new Date());

    // App data (mocked)
    const userStats = {
        streak: 12,
        learning: 24,
        familiar: 108,
    };

    const currentSlot = {
        name: "Evening Slot",
        remaining: slotState === 'active' ? 5 : 0,
        total: 5,
        endTime: "23:59",
        nextSlotTime: "06:00"
    };

    // Keep time updated for realism
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
            {/* Mobile Container constraint */}
            <div className="w-full max-w-md bg-gray-900 min-h-screen shadow-2xl relative overflow-hidden flex flex-col">

                {/* TOP NAV */}
                <header className="flex items-center justify-between p-6 pt-10 bg-gray-900">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-100">Kanji Capture</h1>
                        <p className="text-sm text-gray-400 font-medium">Yokohama, JP</p>
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

                {/* MAIN CONTENT */}
                <main className="flex-1 px-6 pb-24 flex flex-col gap-6">

                    {/* DYNAMIC SLOT CARD - The Habit Anchor */}
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

                    {/* KANJI STATS / LIST ENTRY */}
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

                    {/* PROTOTYPE CONTROLS (Invisible to actual users) */}
                    <section className="mt-auto pt-8 border-t border-gray-800">
                        <p className="text-xs text-gray-500 font-mono mb-2 uppercase tracking-wider text-center">Dev Controls</p>
                        <div className="flex bg-gray-800 p-1 rounded-xl">
                            <button
                                onClick={() => setSlotState('active')}
                                className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${slotState === 'active' ? 'bg-gray-700 shadow-sm text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Simulate Slot Open
                            </button>
                            <button
                                onClick={() => setSlotState('completed')}
                                className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${slotState === 'completed' ? 'bg-gray-700 shadow-sm text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Simulate Slot Done
                            </button>
                        </div>
                    </section>

                </main>

                {/* BOTTOM ACTION BAR - The Capture Anchor */}
                <div className="absolute bottom-0 w-full bg-gradient-to-t from-gray-900 via-gray-900 to-transparent pt-12 pb-8 px-6">
                    <button className="w-full bg-gray-100 text-gray-900 rounded-[2rem] p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex justify-center items-center gap-3 active:scale-[0.98] active:bg-gray-200 transition-all transform group">
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