import React, { useState } from 'react';

// --- Icons ---
const CameraIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
);

const ChevronRightIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 18 15 12 9 6"/></svg>
);

const InteractiveLesson2 = ({ onComplete, isCompleted }) => {
  const [step, setStep] = useState(0); 
  const [revealedCards, setRevealedCards] = useState([false, false]);

  const n5KanjiList = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '日', '月', '木', '水', '火', '金', '土', '中', '野', '年'];

  const handleReveal = (idx) => {
    const newRevealed = [...revealedCards];
    newRevealed[idx] = true;
    setRevealedCards(newRevealed);
    
    // Automatically progress to the final step if both are revealed
    if (newRevealed.every(Boolean) && step === 2) {
      setTimeout(() => setStep(3), 600);
    }
  };

  return (
    <div className="py-6 space-y-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-100 mb-4 leading-tight">
          The Wild is Your Classroom
        </h1>
        <p className="text-lg text-gray-400 font-medium leading-relaxed">
          Why capturing signs works better than studying an Anki deck.
        </p>
      </div>

      {/* STEP 0: The Hook & The Boring Textbook Grid */}
      {step === 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <p className="text-gray-300 leading-relaxed text-lg">
            Ever wonder why every textbook tells us to start learning kanji with lists like these?
          </p>
          <p className="text-gray-300 leading-relaxed text-lg">
            Me neither. But neuroscientists call this <strong className="text-white">Intentional Learning</strong>. It requires massive willpower and yields very low retention.
          </p>

          <button 
            onClick={() => setStep(1)}
            className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 rounded-3xl p-6 shadow-inner transition-all group relative cursor-pointer active:scale-[0.98]"
          >
            <div className="grid grid-cols-5 gap-3 opacity-60 group-hover:opacity-30 transition-opacity duration-300">
              {n5KanjiList.map((k, i) => (
                <div key={i} className="aspect-square bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center text-xl text-gray-500 font-medium shadow-sm">
                  {k}
                </div>
              ))}
            </div>
            
            {/* Interactive Overlay Overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20 rounded-3xl">
              <span className="bg-white text-black font-bold px-5 py-2.5 rounded-full shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                Tap to escape <ChevronRightIcon className="w-4 h-4" />
              </span>
            </div>
          </button>
        </div>
      )}

      {/* STEP 1: Intentional vs Incidental */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <p className="text-gray-300 leading-relaxed text-lg">
            But encountering a word organically while trying to read a menu or navigate a train station is called <strong className="text-orange-400">Incidental Learning</strong>.
          </p>

          <div className="p-5 rounded-2xl bg-orange-500/10 border-l-4 border-orange-500 text-orange-100 font-medium my-8 shadow-inner">
            Research shows that Incidental Learning creates much stronger, longer-lasting memories because the brain ties the vocabulary to a physical, emotional event.
          </div>

          <button 
            onClick={() => setStep(2)}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-orange-900/30 active:scale-[0.98]"
          >
            See How
          </button>
        </div>
      )}

      {/* STEP 2: The Real World Souvenirs (Photos) */}
      {step >= 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
          <p className="text-gray-300 leading-relaxed text-lg">
            Tap below to see where those "boring" textbook words actually live in the real world.
          </p>

          <div className="flex flex-col gap-4">
            
            {/* Image 1: Nakano (Subway Station) */}
            <div className="relative">
              {!revealedCards[0] ? (
                <button onClick={() => handleReveal(0)} className="w-full bg-gray-800 border border-gray-700 text-gray-300 font-bold py-4 rounded-xl flex items-center justify-between px-6 hover:bg-gray-700 transition-colors">
                  <span>Nakano (Station)</span>
                  <CameraIcon className="w-5 h-5 text-gray-500" />
                </button>
              ) : (
                <div className="w-full h-40 rounded-xl overflow-hidden relative border border-gray-800 animate-in zoom-in-95 duration-300 shadow-xl">
                  {/* Real Nakano Station Sign Image */}
                  <img src="image_e7c03f.png" alt="Nakano Station Sign" className="w-full h-full object-cover object-center" />
                </div>
              )}
            </div>

            {/* Image 2: December (Calendar) */}
            <div className="relative">
              {!revealedCards[1] ? (
                <button onClick={() => handleReveal(1)} className="w-full bg-gray-800 border border-gray-700 text-gray-300 font-bold py-4 rounded-xl flex items-center justify-between px-6 hover:bg-gray-700 transition-colors">
                  <span>December (Calendar)</span>
                  <CameraIcon className="w-5 h-5 text-gray-500" />
                </button>
              ) : (
                <div className="w-full bg-gray-900 rounded-xl p-6 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300 border border-gray-800 h-40 text-center shadow-xl">
                  <span className="text-4xl font-black text-red-500 tracking-widest mb-2">十二月</span>
                  <p className="text-sm text-gray-500 font-medium">
                    (December)
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* STEP 3: The Payoff */}
      {step === 3 && (
        <div className="space-y-6 pt-6 border-t border-gray-800 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <p className="text-gray-100 font-bold text-xl leading-relaxed">
            That's why Shuukan gives you a way to learn without textbooks. We want you to collect souvenirs from your daily life.
          </p>
          <p className="text-gray-400 text-lg">
            Let our algorithm handle the memorization for you.
          </p>

          <button 
            onClick={onComplete}
            className={`w-full py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-[0.98] transition-all mt-4
              ${isCompleted ? 'bg-gray-800 text-gray-400 border border-gray-700' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-900/50'}`}
          >
            {isCompleted ? 'Lesson Completed' : 'Mark as Complete'}
          </button>
        </div>
      )}
    </div>
  );
};

// Main App Wrapper to allow Canvas execution
export default function App() {
  const [isCompleted, setIsCompleted] = useState(false);

  return (
    <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
      <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen relative flex flex-col px-6">
        {/* We mount the isolated lesson here for testing */}
        <InteractiveLesson2 
          onComplete={() => setIsCompleted(true)} 
          isCompleted={isCompleted} 
        />
      </div>
    </div>
  );
}