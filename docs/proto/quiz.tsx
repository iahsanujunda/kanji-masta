import React, { useState } from 'react';

// --- Icons ---
const XIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const CheckIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>
);
const ArrowRightIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
);
const FlagIcon = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
);

// --- Mock Quiz Data (Mapped exactly to your architecture) ---
const mockQuizzes = [
    {
        id: 1,
        familiarity: 0,
        quiz_type: 'meaning_recall',
        prompt: '電',
        target: '電',
        furigana: null,
        answer: 'electricity',
        options: ['iron', 'electricity', 'east', 'express'], // Pre-shuffled for prototype
        explanation: '電 is the root of 電車 (train), 電話 (phone), 電気 (electricity).'
    },
    {
        id: 2,
        familiarity: 1,
        quiz_type: 'reading_recognition',
        prompt: '電車',
        target: '電車',
        furigana: null,
        answer: 'でんしゃ',
        options: ['てっどう', 'きゅうこう', 'ちかてつ', 'でんしゃ'],
        explanation: 'でん (on-yomi of 電) + しゃ (on-yomi of 車).'
    },
    {
        id: 3,
        familiarity: 2,
        quiz_type: 'reverse_reading',
        prompt: 'でんしゃ',
        target: 'でんしゃ',
        furigana: null,
        answer: '電車',
        options: ['電話', '電気', '電車', '電池'],
        explanation: '電車 literally means "electric vehicle".'
    },
    {
        id: 4,
        familiarity: 3,
        quiz_type: 'bold_word_meaning',
        prompt: '次の電車は何時に来ますか？',
        target: '電車',
        furigana: 'でんしゃ',
        answer: 'train',
        options: ['bus', 'taxi', 'train', 'subway'],
        explanation: '電車 (densha) means train. The sentence asks: "What time does the next train come?"'
    },
    {
        id: 5,
        familiarity: 4,
        quiz_type: 'fill_in_the_blank',
        prompt: '次の＿＿は何時に来ますか？',
        target: '電車',
        furigana: 'でんしゃ',
        answer: '電車',
        options: ['急行', '電車', '地下鉄', 'バス停'],
        explanation: '電車 fits here — asking when the next train arrives.'
    },
    {
        id: 6,
        familiarity: 5, // Triggers free-text input mode
        quiz_type: 'fill_in_the_blank',
        prompt: '次の＿＿は何時に来ますか？',
        target: '電車',
        furigana: 'でんしゃ',
        answer: '電車',
        options: [], // No options for free text
        explanation: '電車 (densha) fits here. At familiarity 5, you must recall and type it from memory.'
    }
];

export default function App() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [textInput, setTextInput] = useState('');
    const [isAnswered, setIsAnswered] = useState(false);
    const [isFinished, setIsFinished] = useState(false);

    const currentQuiz = mockQuizzes[currentIndex];
    const progressPercent = ((currentIndex) / mockQuizzes.length) * 100;

    // Handlers
    const handleSelectOption = (option) => {
        if (isAnswered) return;
        setSelectedOption(option);
        setIsAnswered(true);
    };

    const handleTextSubmit = (e) => {
        e.preventDefault();
        if (isAnswered || !textInput.trim()) return;
        setSelectedOption(textInput.trim());
        setIsAnswered(true);
    };

    const handleNext = () => {
        if (currentIndex < mockQuizzes.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedOption(null);
            setTextInput('');
            setIsAnswered(false);
        } else {
            setIsFinished(true);
        }
    };

    const isCorrect = isAnswered && selectedOption === currentQuiz.answer;

    // --- Render Helpers for specific quiz types ---

    // Renders the sentence with the target word highlighted (bold_word_meaning)
    const renderHighlightedSentence = (prompt, target, furigana) => {
        const parts = prompt.split(target);
        if (parts.length !== 2) return <span className="text-gray-100">{prompt}</span>;

        return (
            <div className="text-gray-100 text-xl font-medium leading-relaxed px-4 text-center">
                {parts[0]}
                <span className="inline-flex flex-col items-center mx-1 align-bottom translate-y-2">
          <span className="text-indigo-400 text-xs font-bold mb-0.5">{isAnswered ? furigana : ' '}</span>
          <span className="text-indigo-400 border-b-2 border-indigo-500/50 pb-0.5">{target}</span>
        </span>
                {parts[1]}
            </div>
        );
    };

    // Renders the sentence with a gap (fill_in_the_blank)
    const renderGappedSentence = (prompt) => {
        const parts = prompt.split('＿＿');
        if (parts.length !== 2) return <span className="text-gray-100">{prompt}</span>;

        // If answered, show the correct word in the gap
        const gapContent = isAnswered ? (
            <span className={`px-2 font-bold ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
        {currentQuiz.answer}
      </span>
        ) : (
            <span className="inline-block w-12 border-b-2 border-gray-500 mx-1 align-middle opacity-50"></span>
        );

        return (
            <div className="text-gray-100 text-xl font-medium leading-relaxed px-4 text-center">
                {parts[0]}
                {gapContent}
                {parts[1]}
            </div>
        );
    };

    // ----------------------------------------------------------------------
    // VIEW: FINISHED SLOT
    // ----------------------------------------------------------------------
    if (isFinished) {
        return (
            <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100">
                <div className="w-full max-w-md bg-gray-900 min-h-screen flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-20 h-20 bg-emerald-900/40 rounded-full flex items-center justify-center mb-6">
                        <CheckIcon className="w-10 h-10 text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-100 mb-2">Slot Complete!</h1>
                    <p className="text-gray-400 mb-8">You finished your 6 reviews for this session.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-gray-800 text-white font-bold py-4 px-8 rounded-2xl hover:bg-gray-700 transition-colors"
                    >
                        Return to Home
                    </button>
                </div>
            </div>
        );
    }

    // ----------------------------------------------------------------------
    // VIEW: ACTIVE QUIZ
    // ----------------------------------------------------------------------
    return (
        <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
            <div className="w-full max-w-md bg-gray-900 min-h-screen relative overflow-hidden flex flex-col">

                {/* HEADER & PROGRESS */}
                <header className="px-6 pt-10 pb-4 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <button className="text-gray-500 p-2 -ml-2 hover:bg-gray-800 rounded-full transition-colors">
                            <XIcon className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Tier {currentQuiz.familiarity}</span>
                        </div>
                        <button className="text-gray-500 p-2 -mr-2 hover:bg-gray-800 rounded-full transition-colors">
                            <FlagIcon className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </header>

                {/* QUIZ PROMPT AREA */}
                <main className="flex-1 flex flex-col pt-8 pb-32 px-6">

                    {/* Context/Instruction Label */}
                    <div className="text-center mb-8">
            <span className="text-sm font-medium text-gray-400 uppercase tracking-widest">
              {currentQuiz.quiz_type.replace(/_/g, ' ')}
            </span>
                    </div>

                    {/* Dynamic Prompt Content */}
                    <div className="flex-1 flex flex-col items-center justify-center mb-12 min-h-[160px]">
                        {currentQuiz.quiz_type === 'meaning_recall' && (
                            <h2 className="text-8xl font-medium text-gray-100">{currentQuiz.prompt}</h2>
                        )}

                        {currentQuiz.quiz_type === 'reading_recognition' && (
                            <h2 className="text-6xl font-medium text-gray-100 tracking-wider">{currentQuiz.prompt}</h2>
                        )}

                        {currentQuiz.quiz_type === 'reverse_reading' && (
                            <h2 className="text-5xl font-medium text-indigo-300 tracking-wider">{currentQuiz.prompt}</h2>
                        )}

                        {currentQuiz.quiz_type === 'bold_word_meaning' && (
                            renderHighlightedSentence(currentQuiz.prompt, currentQuiz.target, currentQuiz.furigana)
                        )}

                        {currentQuiz.quiz_type === 'fill_in_the_blank' && (
                            renderGappedSentence(currentQuiz.prompt)
                        )}
                    </div>

                    {/* INPUT AREA (Multiple Choice OR Free Text) */}
                    <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">
                        {currentQuiz.familiarity === 5 ? (
                            // Familiarity 5: Free Text Input
                            <form onSubmit={handleTextSubmit} className="flex flex-col gap-4">
                                <input
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    disabled={isAnswered}
                                    placeholder="Type the kanji..."
                                    className={`w-full bg-gray-800 border-2 rounded-2xl p-5 text-xl text-center text-gray-100 focus:outline-none transition-colors
                    ${isAnswered
                                        ? isCorrect ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-red-500/50 bg-red-900/10'
                                        : 'border-gray-700 focus:border-indigo-500'}`}
                                    autoFocus
                                />
                                {!isAnswered && (
                                    <button
                                        type="submit"
                                        disabled={!textInput.trim()}
                                        className="w-full bg-indigo-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-4 rounded-2xl transition-colors"
                                    >
                                        Check
                                    </button>
                                )}
                            </form>
                        ) : (
                            // Familiarity 0-4: Multiple Choice
                            currentQuiz.options.map((option, index) => {
                                let btnClass = "bg-gray-800 border-2 border-transparent text-gray-200 hover:bg-gray-700"; // Default

                                if (isAnswered) {
                                    if (option === currentQuiz.answer) {
                                        btnClass = "bg-emerald-900/20 border-2 border-emerald-500 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.2)]"; // Correct
                                    } else if (option === selectedOption) {
                                        btnClass = "bg-red-900/20 border-2 border-red-500/50 text-red-200 opacity-80"; // Wrong selected
                                    } else {
                                        btnClass = "bg-gray-800/50 border-2 border-transparent text-gray-500 opacity-50"; // Unselected other
                                    }
                                }

                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleSelectOption(option)}
                                        disabled={isAnswered}
                                        className={`w-full text-lg font-medium p-4 rounded-2xl transition-all duration-200 ${btnClass}`}
                                    >
                                        {option}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </main>

                {/* FEEDBACK BOTTOM SHEET */}
                <div className={`absolute bottom-0 left-0 w-full transition-transform duration-300 ease-in-out ${isAnswered ? 'translate-y-0' : 'translate-y-full'}`}>
                    <div className={`p-6 border-t-2 ${isCorrect ? 'bg-emerald-900/90 border-emerald-500/50' : 'bg-red-900/90 border-red-500/50'} backdrop-blur-xl rounded-t-3xl shadow-2xl`}>

                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                                {isCorrect ? (
                                    <CheckIcon className="w-6 h-6 text-emerald-400" />
                                ) : (
                                    <XIcon className="w-6 h-6 text-red-400" />
                                )}
                                <h3 className={`font-bold text-xl ${isCorrect ? 'text-emerald-100' : 'text-red-100'}`}>
                                    {isCorrect ? 'Correct!' : 'Not quite.'}
                                </h3>
                            </div>
                        </div>

                        <p className={`text-sm mb-6 leading-relaxed ${isCorrect ? 'text-emerald-200/80' : 'text-red-200/80'}`}>
                            {currentQuiz.explanation}
                        </p>

                        <button
                            onClick={handleNext}
                            className={`w-full py-4 rounded-2xl font-bold text-lg flex justify-center items-center gap-2 transition-colors
                ${isCorrect ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' : 'bg-red-500 text-red-950 hover:bg-red-400'}`}
                        >
                            Continue
                            <ArrowRightIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}