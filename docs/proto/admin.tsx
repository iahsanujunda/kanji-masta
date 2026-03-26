import React, { useState } from 'react';

// --- Icons ---
const LeafIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
);
const DollarSignIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);
const ActivityIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
);
const BookIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
);
const UsersIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
const SearchIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const RefreshCwIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
);
const EyeIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const TrashIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
);
const XIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const CheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>
);
const AlertTriangleIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const ClockIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const SparklesIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
);

// --- Mock Data ---
const dailySpendData = [
    { day: 'Mar 13', val: 0.8 }, { day: 'Mar 14', val: 1.2 }, { day: 'Mar 15', val: 0.9 },
    { day: 'Mar 16', val: 1.5 }, { day: 'Mar 17', val: 2.1 }, { day: 'Mar 18', val: 1.1 },
    { day: 'Mar 19', val: 0.6 }, { day: 'Mar 20', val: 0.4 }, { day: 'Mar 21', val: 1.3 },
    { day: 'Mar 22', val: 1.8 }, { day: 'Mar 23', val: 0.9 }, { day: 'Mar 24', val: 0.5 },
    { day: 'Mar 25', val: 1.4 }, { day: 'Mar 26', val: 2.45 },
];

const failedJobs = [
    { id: 1, target: '電 / 電車', user: 'Friend 1', attempts: 3 },
    { id: 2, target: '話 / 会話', user: 'Wife', attempts: 3 },
    { id: 3, target: '急 / 急行', user: 'You', attempts: 3 },
];

// Split invites data to handle waitlist vs active users
const waitlistRequests = [
    { id: 101, email: 'curious.learner@example.com', requestedAt: '2 hours ago', source: 'Landing Page' },
    { id: 102, email: 'tokyo.expat@example.com', requestedAt: '5 hours ago', source: 'Landing Page' },
    { id: 103, email: 'student99@university.edu', requestedAt: '1 day ago', source: 'Twitter Link' },
];

const activeInvites = [
    { id: 1, email: 'friend@email.com', status: 'ACCEPTED', invitedBy: 'You', date: 'Mar 20' },
    { id: 2, email: 'new@email.com', status: 'PENDING', invitedBy: 'You', date: 'Mar 25' },
    { id: 3, email: 'old@email.com', status: 'REVOKED', invitedBy: 'You', date: 'Feb 12' },
];

// --- TELEMETRY DATA (QUIZZES TAB) ---
const macroHealthStats = [
    { id: 'T0', label: 'Visual Meaning', rate: 94, status: 'healthy' },
    { id: 'T1', label: 'Reading Recog.', rate: 88, status: 'healthy' },
    { id: 'T2', label: 'Sound to Kanji', rate: 71, status: 'warning' },
    { id: 'T3', label: 'Sentence Context', rate: 82, status: 'healthy' },
    { id: 'T5', label: 'Free Recall', rate: 64, status: 'hard' },
];

const flaggedQuizzes = [
    {
        id: 101, kanji: '電気', type: 'meaning_recall',
        flagType: 'Impossible', flagReason: '< 15% Success Rate',
        stats: { rate: '12%', time: '4.2s', reuses: 45 },
        preview: { prompt: '電気', furigana: null, options: ['power', 'electricity', 'energy', 'light'], explanation: 'AI generated overlapping synonyms.' }
    },
    {
        id: 102, kanji: '電車', type: 'fill_in_the_blank',
        flagType: 'Too Easy', flagReason: '100% Win, < 2.0s',
        stats: { rate: '100%', time: '1.8s', reuses: 312 },
        preview: { prompt: '私は＿＿に乗ります。', furigana: 'でんしゃ', options: ['電車', 'りんご', '犬', '空'], explanation: 'Distractors are totally unrelated nouns.' }
    },
    {
        id: 103, kanji: '会話', type: 'reverse_reading',
        flagType: 'Slow Burn', flagReason: 'Avg 15s to answer',
        stats: { rate: '68%', time: '15.4s', reuses: 89 },
        preview: { prompt: 'かいわ', furigana: null, options: ['会輪', '絵話', '会話', '絵輪'], explanation: 'Visual distractors are too similar.' }
    },
];

const vaultQuizzes = [
    { id: 201, kanji: '学校', type: 'fill_in_the_blank', stats: { rate: '82%', time: '3.1s', reuses: 1205 }, preview: { prompt: '学校に行きます。', options: ['学校', '会社', '病院', '駅'] } },
    { id: 202, kanji: '電話', type: 'reading_recognition', stats: { rate: '91%', time: '2.4s', reuses: 840 }, preview: { prompt: '電話', options: ['でんわ', 'でんき', 'でんしゃ', 'てんき'] } },
    { id: 203, kanji: '仕事', type: 'meaning_recall', stats: { rate: '78%', time: '3.8s', reuses: 632 }, preview: { prompt: '仕事', options: ['job', 'hobby', 'study', 'rest'] } },
    { id: 204, kanji: '勉強', type: 'reverse_reading', stats: { rate: '65%', time: '5.2s', reuses: 512 }, preview: { prompt: 'べんきょう', options: ['勉強', '勉境', '強勉', '免強'] } },
];

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('invites');
    const [quizSearch, setQuizSearch] = useState('');
    const [previewQuiz, setPreviewQuiz] = useState(null);

    const renderTabs = () => {
        const tabs = [
            { id: 'cost', label: 'Cost', icon: DollarSignIcon },
            { id: 'jobs', label: 'Jobs', icon: ActivityIcon },
            { id: 'quizzes', label: 'Telemetry (Quizzes)', icon: BookIcon },
            { id: 'invites', label: 'Invites', icon: UsersIcon },
        ];

        return (
            <div className="flex border-b border-gray-800 mb-8 overflow-x-auto no-scrollbar">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-4 font-semibold text-sm transition-colors border-b-2 whitespace-nowrap ${
                                isActive ? 'border-indigo-400 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        );
    };

    // --- TAB: COST ---
    const renderCostTab = () => {
        const maxSpend = Math.max(...dailySpendData.map(d => d.val));
        return (
            <div className="animate-in fade-in duration-300">
                <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-6 mb-6">
                    <p className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2">Total Spend</p>
                    <h2 className="text-5xl font-black text-white tracking-tight">$12.45</h2>
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                    <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-6">
                        <h3 className="text-lg font-bold text-white mb-6">By User</h3>
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-2 p-4 bg-gray-900/50 rounded-xl border border-gray-800">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-gray-200">Wife</span>
                                    <span className="font-mono text-emerald-400">$4.20</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs font-medium text-gray-500">
                                    <span className="bg-gray-800 px-2 py-1 rounded">photo: $1.20</span>
                                    <span className="bg-gray-800 px-2 py-1 rounded">quizgen: $2.40</span>
                                    <span className="bg-gray-800 px-2 py-1 rounded">challenge: $0.60</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-gray-900/50 rounded-xl border border-gray-800">
                                <span className="font-bold text-gray-200">Friend 1</span>
                                <span className="font-mono text-emerald-400">$3.80</span>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-gray-900/50 rounded-xl border border-gray-800">
                                <span className="font-bold text-gray-200">Friend 2</span>
                                <span className="font-mono text-emerald-400">$2.10</span>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-gray-900/50 rounded-xl border border-gray-800">
                                <span className="font-bold text-gray-200">You</span>
                                <span className="font-mono text-emerald-400">$2.35</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-6 flex flex-col">
                        <h3 className="text-lg font-bold text-white mb-6">Daily Spend (Last 14 Days)</h3>
                        <div className="flex-1 flex items-end gap-1.5 min-h-[200px] mt-4 pb-6 relative">
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
                                {[0, 1, 2, 3].map(i => (
                                    <div key={i} className="w-full h-px bg-gray-800/50"></div>
                                ))}
                            </div>
                            {dailySpendData.map((d, i) => {
                                const heightPercent = (d.val / maxSpend) * 100;
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end z-10">
                                        <div className="w-full bg-indigo-500 rounded-t-sm transition-all duration-300 hover:bg-indigo-400 cursor-pointer" style={{ height: `${heightPercent}%`, minHeight: '4px' }}></div>
                                        <span className="text-[9px] text-gray-500 absolute -bottom-5 rotate-45 transform origin-left whitespace-nowrap">{d.day}</span>
                                        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-gray-800 border border-gray-700 text-white text-xs font-mono px-2 py-1 rounded shadow-lg pointer-events-none transition-opacity z-20">
                                            ${d.val.toFixed(2)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- TAB: JOBS ---
    const renderJobsTab = () => {
        return (
            <div className="animate-in fade-in duration-300">
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-[#0f0f16] border border-gray-800 rounded-2xl p-5 flex flex-col">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Pending</span>
                        <span className="text-3xl font-black text-indigo-400">2</span>
                    </div>
                    <div className="bg-[#0f0f16] border border-red-900/50 rounded-2xl p-5 flex flex-col relative overflow-hidden">
                        <div className="absolute inset-0 bg-red-500/5"></div>
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 relative z-10">Failed</span>
                        <span className="text-3xl font-black text-red-400 relative z-10">3</span>
                    </div>
                    <div className="bg-[#0f0f16] border border-emerald-900/50 rounded-2xl p-5 flex flex-col relative overflow-hidden">
                        <div className="absolute inset-0 bg-emerald-500/5"></div>
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 relative z-10">Done</span>
                        <span className="text-3xl font-black text-emerald-400 relative z-10">284</span>
                    </div>
                </div>
                <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-white">Failed Jobs</h3>
                        <button className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                            <RefreshCwIcon className="w-4 h-4" /> Retry All Failed
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-gray-800">
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Target</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Attempts</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {failedJobs.map(job => (
                                <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors">
                                    <td className="py-4 px-4 font-medium text-gray-200">{job.target}</td>
                                    <td className="py-4 px-4 text-gray-400 text-sm">{job.user}</td>
                                    <td className="py-4 px-4 text-red-400 text-sm font-medium">{job.attempts} attempts</td>
                                    <td className="py-4 px-4 text-right">
                                        <button className="bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                            Retry
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // --- TAB: QUIZZES TELEMETRY ---
    const renderQuizzesTab = () => {
        const vaultFiltered = vaultQuizzes.filter(q =>
            q.kanji.includes(quizSearch) || q.type.includes(quizSearch)
        );

        return (
            <div className="animate-in fade-in duration-300">

                {/* 1. TOP ROW: Macro Prompt Tuning */}
                <div className="mb-8">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Macro Health Averages</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {macroHealthStats.map(stat => {
                            const isWarning = stat.status === 'warning';
                            const isHard = stat.status === 'hard';
                            return (
                                <div key={stat.id} className={`border rounded-2xl p-4 flex flex-col relative overflow-hidden
                  ${isWarning ? 'bg-orange-900/10 border-orange-500/30' : isHard ? 'bg-red-900/10 border-red-500/30' : 'bg-[#0f0f16] border-gray-800'}
                `}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold text-gray-500">{stat.id}</span>
                                        {isWarning && <AlertTriangleIcon className="w-3 h-3 text-orange-400" />}
                                    </div>
                                    <span className={`text-2xl font-black ${isWarning ? 'text-orange-400' : isHard ? 'text-red-400' : 'text-emerald-400'}`}>
                    {stat.rate}%
                  </span>
                                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider truncate mt-1">{stat.label}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* 2. MIDDLE SECTION: The Triage Inbox */}
                <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-6 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                    <div className="flex items-center justify-between mb-6 pl-2">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <AlertTriangleIcon className="w-5 h-5 text-red-400" /> Needs Review
                            </h3>
                            <p className="text-sm text-gray-400">Quizzes flagged by outlier telemetry.</p>
                        </div>
                        <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full text-xs font-bold">
              {flaggedQuizzes.length} Flags
            </span>
                    </div>

                    <div className="flex flex-col gap-4">
                        {flaggedQuizzes.map(quiz => {
                            let badgeColor = "bg-red-500/10 text-red-400 border-red-500/30";
                            if (quiz.flagType === 'Too Easy') badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/30";
                            if (quiz.flagType === 'Slow Burn') badgeColor = "bg-orange-500/10 text-orange-400 border-orange-500/30";

                            return (
                                <div key={quiz.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    {/* Left: Identity & Flag */}
                                    <div className="flex items-center gap-4 min-w-[250px]">
                                        <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center font-bold text-xl text-gray-100 border border-gray-700">
                                            {quiz.kanji}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                          {quiz.flagType}
                        </span>
                                            </div>
                                            <p className="text-xs font-mono text-gray-500">{quiz.type}</p>
                                        </div>
                                    </div>

                                    {/* Middle: Telemetry Data */}
                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Win Rate</span>
                                            <span className={`font-mono text-sm ${quiz.stats.rate === '100%' || quiz.stats.rate.includes('12') ? 'text-red-400' : 'text-gray-300'}`}>{quiz.stats.rate}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Avg Time</span>
                                            <span className={`font-mono text-sm ${quiz.stats.time.includes('15') ? 'text-orange-400' : 'text-gray-300'}`}>{quiz.stats.time}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Reuses</span>
                                            <span className="font-mono text-sm text-gray-300">{quiz.stats.reuses}</span>
                                        </div>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setPreviewQuiz(quiz)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-300 bg-gray-800 hover:bg-gray-700 hover:text-white rounded-lg transition-colors border border-gray-700"
                                        >
                                            <EyeIcon className="w-3.5 h-3.5" /> Preview
                                        </button>
                                        <button className="p-1.5 text-gray-400 hover:text-indigo-400 bg-gray-800 hover:bg-indigo-900/30 rounded-lg transition-colors border border-gray-700" title="Regenerate">
                                            <RefreshCwIcon className="w-4 h-4" />
                                        </button>
                                        <button className="p-1.5 text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-red-900/30 rounded-lg transition-colors border border-gray-700" title="Delete">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. BOTTOM SECTION: The Vault (Highest ROI) */}
                <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-indigo-400" /> The Vault
                            </h3>
                            <p className="text-sm text-gray-400">10,248 total quizzes. Sorted by Reusability.</p>
                        </div>
                        <div className="relative w-full md:w-64">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={quizSearch}
                                onChange={(e) => setQuizSearch(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-gray-800">
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Target</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Reuses (ROI)</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Win Rate</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {vaultFiltered.length > 0 ? vaultFiltered.map(quiz => (
                                <tr key={quiz.id} className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors">
                                    <td className="py-4 px-4 font-bold text-gray-200">{quiz.kanji}</td>
                                    <td className="py-4 px-4 text-gray-400 text-sm font-mono">{quiz.type}</td>
                                    <td className="py-4 px-4 font-mono text-emerald-400">{quiz.stats.reuses}x</td>
                                    <td className="py-4 px-4 text-gray-300 font-mono text-sm">{quiz.stats.rate}</td>
                                    <td className="py-4 px-4 text-right flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => setPreviewQuiz(quiz)}
                                            className="p-1.5 text-gray-400 hover:text-indigo-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            <EyeIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="5" className="py-8 text-center text-gray-500 text-sm">No quizzes found.</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        );
    };

    // --- TAB: INVITES (UPDATED) ---
    const renderInvitesTab = () => {
        return (
            <div className="animate-in fade-in duration-300 flex flex-col gap-8">

                {/* SECTION 1: ACCESS REQUESTS (WAITLIST) */}
                <div className="bg-[#0f0f16] border border-orange-900/40 rounded-3xl p-6 relative overflow-hidden shadow-[0_0_30px_rgba(234,88,12,0.05)]">
                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 pl-2 gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <ClockIcon className="w-5 h-5 text-orange-400" /> Access Requests
                            </h3>
                            <p className="text-sm text-gray-400">Users who clicked "Get Early Access" on the landing page.</p>
                        </div>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
              {waitlistRequests.length} Pending
            </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-gray-800">
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Requested</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Source</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {waitlistRequests.map(request => (
                                <tr key={request.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                                    <td className="py-4 px-4 font-bold text-gray-200">{request.email}</td>
                                    <td className="py-4 px-4 text-gray-400 text-sm">{request.requestedAt}</td>
                                    <td className="py-4 px-4 text-gray-400 text-sm">
                                        <span className="bg-gray-800 px-2 py-1 rounded-md text-xs">{request.source}</span>
                                    </td>
                                    <td className="py-4 px-4 text-right flex items-center justify-end gap-2">
                                        <button className="flex items-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-emerald-500/20">
                                            <CheckIcon className="w-3.5 h-3.5" /> Approve
                                        </button>
                                        <button className="flex items-center gap-1 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-gray-700">
                                            <XIcon className="w-3.5 h-3.5" /> Deny
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* SECTION 2: ACTIVE NETWORK (EXISTING) */}
                <div className="bg-[#0f0f16] border border-gray-800 rounded-3xl p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <UsersIcon className="w-5 h-5 text-indigo-400" /> Active Network
                            </h3>
                            <p className="text-sm text-gray-400">Manage existing users and direct invites.</p>
                        </div>
                        <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shrink-0">
                            + Send Direct Invite
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-gray-800">
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                            </thead>
                            <tbody>
                            {activeInvites.map(invite => {
                                let statusColor = "text-gray-400";
                                if (invite.status === 'ACCEPTED') statusColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
                                if (invite.status === 'PENDING') statusColor = "text-indigo-400 border-indigo-500/30 bg-indigo-500/10";
                                if (invite.status === 'REVOKED') statusColor = "text-red-400 border-red-500/30 bg-red-500/10";
                                return (
                                    <tr key={invite.id} className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors">
                                        <td className="py-4 px-4 font-medium text-gray-200">{invite.email}</td>
                                        <td className="py-4 px-4 font-bold text-xs tracking-wider">
                                            <span className={`px-2 py-1.5 rounded-md border ${statusColor}`}>{invite.status}</span>
                                        </td>
                                        <td className="py-4 px-4 text-gray-400 text-sm">{invite.date}</td>
                                        <td className="py-4 px-4 text-right">
                                            {invite.status === 'PENDING' ? (
                                                <button className="text-xs font-bold text-red-400 hover:text-red-300 px-3 py-1.5 border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors">
                                                    Revoke
                                                </button>
                                            ) : (<span className="text-gray-600">—</span>)}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#050508] font-sans text-gray-100 selection:bg-indigo-500/30">

            {/* Top Navbar */}
            <nav className="border-b border-gray-800 bg-[#0a0a0f] sticky top-0 z-30">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                            <LeafIcon className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="text-lg font-bold tracking-tight text-white">Shuukan <span className="text-gray-500 font-normal">Admin</span></span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-xs font-mono text-gray-500 bg-gray-900 px-3 py-1.5 rounded-full border border-gray-800">
                            System Operational
                        </div>
                        <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">
                            AD
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {renderTabs()}

                <div className="min-h-[500px]">
                    {activeTab === 'cost' && renderCostTab()}
                    {activeTab === 'jobs' && renderJobsTab()}
                    {activeTab === 'quizzes' && renderQuizzesTab()}
                    {activeTab === 'invites' && renderInvitesTab()}
                </div>
            </main>

            {/* --- PREVIEW MODAL (Appears over everything) --- */}
            {previewQuiz && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
                        onClick={() => setPreviewQuiz(null)}
                    ></div>

                    {/* Mock Mobile Quiz Card */}
                    <div className="w-full max-w-sm bg-gray-900 rounded-[2rem] border border-gray-700 shadow-2xl relative z-10 overflow-hidden flex flex-col h-[600px] max-h-[85vh] animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-800 px-2 py-1 rounded">Quiz Preview</span>
                            <button onClick={() => setPreviewQuiz(null)} className="p-1 text-gray-400 hover:text-white bg-gray-800 rounded-full">
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col p-6">
                            <div className="text-center mb-8">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                  {previewQuiz.type.replace(/_/g, ' ')}
                </span>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center mb-12 min-h-[120px]">
                                {previewQuiz.type === 'fill_in_the_blank' ? (
                                    <div className="text-gray-100 text-xl font-medium leading-relaxed text-center">
                                        {previewQuiz.preview.prompt.split('＿＿').map((part, i, arr) => (
                                            <React.Fragment key={i}>
                                                {part}
                                                {i < arr.length - 1 && <span className="inline-block w-12 border-b-2 border-gray-500 mx-1 align-middle opacity-50"></span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                ) : (
                                    <h2 className="text-6xl font-medium text-gray-100 tracking-wider">
                                        {previewQuiz.preview.prompt}
                                    </h2>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 w-full mt-auto">
                                {previewQuiz.preview.options.map((option, idx) => (
                                    <div key={idx} className="w-full text-center text-lg font-medium p-4 rounded-2xl border-2 border-gray-800 bg-gray-800/50 text-gray-300">
                                        {option}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {previewQuiz.preview.explanation && (
                            <div className="bg-indigo-900/40 border-t border-indigo-500/30 p-5 mt-auto">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <LeafIcon className="w-4 h-4 text-indigo-400" />
                                        <h4 className="font-bold text-sm text-indigo-300">Target: {previewQuiz.kanji}</h4>
                                    </div>
                                    {/* If it's a flagged quiz, show the reason in the preview footer */}
                                    {previewQuiz.flagType && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">
                       {previewQuiz.flagType}
                     </span>
                                    )}
                                </div>
                                <p className="text-xs text-indigo-200/80 leading-relaxed">
                                    {previewQuiz.preview.explanation}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}