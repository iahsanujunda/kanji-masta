import React, { useState, useEffect } from 'react';

// --- Icons ---
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
const ChevronLeftIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="15 18 9 12 15 6"/></svg>
);
const LeafIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
);
const BrainIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/></svg>
);
const MicIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
);
const ClockIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const MapPinIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
);
const DumbbellIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m14.4 14.4 5.2-5.2"/><path d="M22.5 1.5 18 6l-4.5-4.5"/><path d="m9.6 9.6-5.2 5.2"/><path d="M1.5 22.5 6 18l4.5 4.5"/><path d="m6 6 12 12"/></svg>
);
const EyeIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
);
const TreeIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
);
const CheckCircleIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const BookOpenIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
);
const RefreshCwIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
);

// --- Science Lessons (Welcome Course) ---
const lessons = [
  {
    id: 1,
    title: "The Illusion of Flashcards",
    readTime: "2 MIN",
    teaser: "Our brain is not built for repeating a single character and hoping it sticks.",
    icon: BrainIcon,
    color: "emerald",
  },
  {
    id: 2,
    title: "The Phonological Anchor",
    readTime: "2 MIN",
    teaser: "Why knowing the meaning of a kanji isn't enough to actually read Japanese.",
    icon: MicIcon,
    color: "blue",
    content: [
      { type: 'heading', text: "The Silent Reader Problem" },
      { type: 'paragraph', text: "Many learners use visual mnemonics to memorize what a kanji means. They might see '水' and immediately think 'water'. But when they see '水曜日' (Wednesday) on a schedule, they freeze. They don't know how to say it." },
      { type: 'paragraph', text: "Cognitive science calls this the Dual-Coding Theory. For a language memory to be truly useful, it needs both a visual code (how it looks) and a phonetic code (how it sounds)." },
      { type: 'callout', text: "Without the sound, our brains treat kanji like road signs, not language. We can navigate, but we can't speak." },
      { type: 'paragraph', text: "Shuukan's quizzes actively force us to type out the hiragana readings (like 'すい' for 水曜日) to ensure we are building strong phonological anchors, not just playing a matching game." }
    ]
  },
  {
    id: 3,
    title: "The Wild is Your Classroom",
    readTime: "3 MIN",
    teaser: "Why capturing signs works better than studying an Anki deck.",
    icon: MapPinIcon,
    color: "orange",
    content: [
      { type: 'heading', text: "Incidental vs. Intentional Learning" },
      { type: 'paragraph', text: "Sitting at a desk and forcing ourselves to memorize a list of 50 kanji is called 'Intentional Learning'. It requires massive willpower and yields low retention." },
      { type: 'paragraph', text: "However, encountering a word organically while trying to read a menu or navigate a train station is called 'Incidental Learning'." },
      { type: 'callout', text: "Research shows that Incidental Learning creates much stronger, longer-lasting memories because the brain ties the vocabulary to a physical, emotional event." },
      { type: 'paragraph', text: "By using the Shuukan camera to capture words in the real world, we aren't studying. We are simply collecting souvenirs from our daily life, and letting the app handle the memorization for us." }
    ]
  },
  {
    id: 4,
    title: "The i+1 Rule",
    readTime: "2 MIN",
    teaser: "How Shuukan uses the kanji we already know to teach us the ones we don't.",
    icon: BookOpenIcon,
    color: "indigo",
    content: [
      { type: 'heading', text: "Comprehensible Input" },
      { type: 'paragraph', text: "Linguist Stephen Krashen discovered that humans acquire language best when exposed to input exactly one step beyond their current level. This is known as the i+1 rule." },
      { type: 'paragraph', text: "If we look at a sentence with 5 unknown kanji, it's just a frustrating puzzle. We give up." },
      { type: 'paragraph', text: "But if a sentence has only 1 unknown kanji, our brains naturally use the surrounding context to guess the meaning. This 'guessing' creates a highly resilient memory trace." },
      { type: 'callout', text: "Shuukan's AI generates sentences specifically designed to be comprehensible to us, masking the kanji we haven't learned yet with furigana to ensure we are always operating at the perfect i+1 level." }
    ]
  },
  {
    id: 5,
    title: "Desirable Difficulty",
    readTime: "2 MIN",
    teaser: "Why the AI gives us tricky, similar-looking distractors on purpose.",
    icon: DumbbellIcon,
    color: "rose",
    content: [
      { type: 'heading', text: "The Trap of Easy Quizzes" },
      { type: 'paragraph', text: "Dr. Robert Bjork coined the term 'Desirable Difficulty'. The theory states that making a test slightly harder forces deeper cognitive retrieval, creating a stronger memory." },
      { type: 'paragraph', text: "If the target word is 電車 (train), and the multiple-choice options are Train, Apple, and Dog... we don't actually read the kanji. We just pick the obvious answer. That's a shallow visual matching strategy." },
      { type: 'callout', text: "Shuukan's AI actively searches for distractors using kanji we already know, or kanji that look visually similar." },
      { type: 'paragraph', text: "By forcing us to choose between 電車, 自転車 (bicycle), and 電話 (telephone), our brains cannot rely on visual novelty. We must actively retrieve the meaning of every single option. It feels harder in the moment, but it locks the word in forever." }
    ]
  },
  {
    id: 6,
    title: "The Exception to the Rule",
    readTime: "2 MIN",
    teaser: "Orthographic Mapping—when looking at a single kanji actually IS helpful.",
    icon: EyeIcon,
    color: "cyan",
    content: [
      { type: 'heading', text: "When Single Characters Matter" },
      { type: 'paragraph', text: "We previously learned that studying single characters in isolation (Shallow Processing) is bad for long-term fluency. But there is one major exception: Orthographic Mapping." },
      { type: 'paragraph', text: "Adult learners often struggle to distinguish visually similar kanji (e.g., 待 'wait' vs. 持 'hold'). If we don't know the parts, the whole word looks like a blur." },
      { type: 'callout', text: "Learning the isolated character first helps our brains map the visual components (radicals) before we have to worry about pronunciation." },
      { type: 'paragraph', text: "This is why Shuukan's Level 0 quizzes test the basic English meaning of the isolated character first. We build the visual map, then immediately step up to the word level (Level 1) to attach the sound." }
    ]
  },
  {
    id: 7,
    title: "The Living Tree",
    readTime: "2 MIN",
    teaser: "How spacing out our reviews ensures permanent retention.",
    icon: TreeIcon,
    color: "emerald",
    content: [
      { type: 'heading', text: "The Forgetting Curve" },
      { type: 'paragraph', text: "In 1885, Hermann Ebbinghaus discovered that we forget 70% of new information within 24 hours unless we review it. But reviewing it every single day is exhausting." },
      { type: 'paragraph', text: "Spaced Repetition solves this. By reviewing a word just as we are about to forget it, the memory trace becomes exponentially stronger." },
      { type: 'callout', text: "Your language tree isn't just a pretty graphic. It's a visual representation of this algorithm." },
      { type: 'paragraph', text: "When we capture a word, it's a seed. As we successfully recall it over days and weeks, the intervals between reviews get longer. It moves up the trunk and eventually reaches the canopy. Once it's in the canopy, it's ours forever." }
    ]
  },
  {
    id: 8,
    title: "The 3-Minute Limit",
    readTime: "3 MIN",
    teaser: "Why traditional flashcard apps cause burnout, and why we cap your quizzes.",
    icon: ClockIcon,
    color: "violet",
    content: [
      { type: 'heading', text: "The Flashcard Avalanche" },
      { type: 'paragraph', text: "We've all opened a learning app only to find '150 reviews pending'. The friction is so high that our brains perceive it as a chore, and we eventually quit. We call this the Flashcard Avalanche." },
      { type: 'paragraph', text: "Cognitive psychology explains this through the Vigilance Decrement. For highly active tasks like recalling a kanji's reading, our attention sharply decays after just 3 to 5 minutes." },
      { type: 'callout', text: "If a session takes longer than 5 minutes, we aren't learning better—we're just training our brains to hate the process." },
      { type: 'heading', text: "The Sweet Spot" },
      { type: 'paragraph', text: "This is why Shuukan strictly caps every time slot at 15 to 20 quizzes maximum. We can finish it in under 3 minutes, completely eliminating the anxiety of a massive review pile." },
      { type: 'paragraph', text: "Furthermore, Miller's Law states our working memory can only hold about 7 new items at once. So out of those 15 quizzes, Shuukan never introduces more than 5 brand new seeds. The rest are spaced-repetition reviews." },
      { type: 'callout', text: "By ending the session while we still have energy (The Zeigarnik Effect), the app leaves us slightly hungry for more, guaranteeing we'll actually want to open it for our next slot." }
    ]
  }
];

// --- INTERACTIVE LESSON 1 COMPONENT ---
const InteractiveLesson1 = ({ onComplete, isCompleted }) => {
  const [step, setStep] = useState(0); 
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasFlippedOnce, setHasFlippedOnce] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState(null);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    setHasFlippedOnce(true);
  };

  const handleQuizAnswer = (answer) => {
    setQuizAnswer(answer);
  };

  return (
    <div className="py-6 space-y-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-100 mb-4 leading-tight">
          The Illusion of Flashcards
        </h1>
        <p className="text-lg text-gray-400 font-medium leading-relaxed">
          Our brain is not built for repeating a single character and hoping it sticks.
        </p>
      </div>

      {/* STEP 0: The Hook & Flashcard */}
      {step === 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <p className="text-gray-300 leading-relaxed text-lg">
            We've all been there. We stare at a flashcard, flip it to check the translation, and memorize the meaning perfectly.
          </p>
          
          <div 
            onClick={handleFlip}
            className="w-full aspect-[4/3] bg-gray-900 border border-gray-700 rounded-3xl flex flex-col items-center justify-center relative cursor-pointer shadow-xl active:scale-[0.98] transition-transform group"
          >
            <div className="absolute top-4 right-4 text-gray-500 group-hover:text-emerald-400 transition-colors">
              <RefreshCwIcon className={`w-5 h-5 ${!hasFlippedOnce ? 'animate-pulse text-emerald-400' : ''}`} />
            </div>
            
            <div className="relative w-full h-full flex items-center justify-center px-6 text-center">
              <div className={`absolute transition-all duration-300 ${isFlipped ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                <span className="text-8xl font-medium text-gray-100">発</span>
              </div>
              <div className={`absolute transition-all duration-300 ${!isFlipped ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
                <span className="text-4xl font-bold text-emerald-400 tracking-wide uppercase">Departure</span>
              </div>
            </div>
          </div>

          {hasFlippedOnce && (
            <button 
              onClick={() => setStep(1)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all animate-in slide-in-from-bottom-4 shadow-lg shadow-indigo-900/30"
            >
              I memorized it. Next.
            </button>
          )}
        </div>
      )}

      {/* STEP 1: The Trap (Quiz) */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <p className="text-gray-300 leading-relaxed text-lg">
            Three days later, you see this in a quiz. Which one was it again?
          </p>

          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-xl">
            <div className="text-center mb-8">
               <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Select Translation</span>
               <h2 className="text-3xl font-bold text-gray-100 mt-2">Departure</h2>
            </div>
            
            <div className="flex flex-col gap-3">
              {['廃', '登', '発'].map((kanji) => {
                let btnStyle = "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700";
                
                if (quizAnswer) {
                  if (kanji === '発') btnStyle = "bg-emerald-500/20 border-emerald-500 text-emerald-400"; 
                  else if (quizAnswer === kanji) btnStyle = "bg-red-500/20 border-red-500 text-red-400"; 
                  else btnStyle = "bg-gray-900 border-gray-800 text-gray-600 opacity-50"; 
                }

                return (
                  <button 
                    key={kanji}
                    disabled={quizAnswer !== null}
                    onClick={() => handleQuizAnswer(kanji)}
                    className={`w-full text-center text-3xl font-medium p-4 rounded-2xl border-2 transition-all ${btnStyle}`}
                  >
                    {kanji}
                  </button>
                )
              })}
            </div>
          </div>

          {quizAnswer && (
            <button 
              onClick={() => setStep(2)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all animate-in slide-in-from-bottom-4 shadow-lg shadow-indigo-900/30"
            >
              Why was that hard?
            </button>
          )}
        </div>
      )}

      {/* STEP 2: The Aha! Moment */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <p className="text-gray-300 leading-relaxed text-lg">
            If you hesitated, it's because staring at an isolated symbol is called <strong>Shallow Processing</strong>. Your brain didn't have any context to hold onto. 
          </p>
          <p className="text-gray-300 leading-relaxed text-lg">
            To create a permanent memory, the brain needs a <span className="text-emerald-400 font-bold">Phonological Anchor</span>. It needs to know how it sounds inside a real word.
          </p>

          <div className="flex flex-col gap-4 mt-8">
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-6 flex items-center justify-between shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]">
              <div>
                 <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest block mb-1">Context 1</span>
                 <div className="flex items-baseline gap-2">
                   <span className="text-3xl font-bold text-gray-100">出<span className="text-indigo-400">発</span></span>
                 </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-400 block">しゅっぱつ</span>
                <span className="text-gray-200">Departure</span>
              </div>
            </div>

            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-6 flex items-center justify-between shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]">
              <div>
                 <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest block mb-1">Context 2</span>
                 <div className="flex items-baseline gap-2">
                   <span className="text-3xl font-bold text-gray-100"><span className="text-indigo-400">発</span>音</span>
                 </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-400 block">はつおん</span>
                <span className="text-gray-200">Pronunciation</span>
              </div>
            </div>
          </div>

          <p className="text-gray-300 leading-relaxed text-lg pt-4">
            This is why Shuukan anchors every character to a real word. We even go out of our way to pick vocabulary you'll actually see in the wild, not just buried in a textbook.
          </p>
          <p className="text-gray-100 font-bold text-xl pt-2 pb-2">
            Ready to start building some deep memories?
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


export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [totalKanji, setTotalKanji] = useState(128);
  const [activeLesson, setActiveLesson] = useState(null); 
  const [completedLessons, setCompletedLessons] = useState([]); 

  const userStats = { streak: 12, treeSize: totalKanji };
  const slotState = 'active'; 
  const currentSlot = { name: "Evening Slot", remaining: 5, endTime: "23:59" };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const currentLesson = lessons.find(l => !completedLessons.includes(l.id)) || lessons[lessons.length - 1]; 
  const isCompleted = completedLessons.includes(currentLesson.id);

  const handleCompleteLesson = () => {
    if (!isCompleted) {
      setCompletedLessons([...completedLessons, currentLesson.id]);
    }
    setActiveLesson(null);
  };

  // ----------------------------------------------------------------------
  // VIEW 2: THE "INSIDE" LESSON VIEW
  // ----------------------------------------------------------------------
  if (activeLesson) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
        <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen flex flex-col relative animate-in slide-in-from-right-8 duration-300">
          
          <header className="flex items-center p-6 pb-2 sticky top-0 bg-[#0a0a0f]/90 backdrop-blur-md z-20">
            <button 
              onClick={() => setActiveLesson(null)}
              className="p-2 -ml-2 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeftIcon className="w-6 h-6" />
            </button>
            <div className="flex-1 text-center pr-6">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Methodology Course</span>
            </div>
          </header>

          <main className="flex-1 px-6 pb-12 overflow-y-auto">
            {activeLesson.id === 1 ? (
              <InteractiveLesson1 onComplete={handleCompleteLesson} isCompleted={isCompleted} />
            ) : (
              <div className="py-6 flex flex-col items-center text-center mt-8">
                <activeLesson.icon className={`w-12 h-12 text-${activeLesson.color}-400 mb-4`} />
                <h1 className="text-3xl font-black text-gray-100 mb-4">{activeLesson.title}</h1>
                <p className="text-gray-400 mb-8">{activeLesson.teaser}</p>
                
                <div className="space-y-6 text-gray-300 leading-relaxed text-left w-full">
                  {activeLesson.content?.map((block, idx) => {
                    if (block.type === 'heading') return <h2 key={idx} className="text-xl font-bold text-gray-100 mt-10 mb-2">{block.text}</h2>;
                    if (block.type === 'paragraph') return <p key={idx}>{block.text}</p>;
                    if (block.type === 'callout') return (
                      <div key={idx} className={`p-5 rounded-2xl bg-${activeLesson.color}-500/10 border-l-4 border-${activeLesson.color}-500 text-${activeLesson.color}-100 font-medium my-8 shadow-inner`}>
                        {block.text}
                      </div>
                    );
                    return null;
                  })}
                </div>
                
                <button onClick={handleCompleteLesson} className="mt-8 w-full py-4 rounded-2xl font-bold text-lg bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-900/50 transition-all">Mark Complete</button>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // VIEW 1: HOME DASHBOARD
  // ----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-black flex justify-center font-sans text-gray-100 selection:bg-indigo-500/30">
      <div className="w-full max-w-md bg-[#0a0a0f] min-h-screen shadow-2xl relative flex flex-col">
        
        {/* --- HEADER --- */}
        <header className="flex items-center justify-between p-6 pt-12 bg-[#0a0a0f] z-10 sticky top-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{getGreeting()}</h1>
            <button className="flex items-center gap-1.5 mt-1 transition-colors group text-emerald-400 hover:text-emerald-300">
              <LeafIcon className="w-4 h-4" />
              <span className="text-sm font-medium">{userStats.treeSize} Kanji growing</span>
              <ChevronRightIcon className="w-3 h-3 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm border bg-orange-500/10 text-orange-400 border-orange-500/20">
              <FlameIcon className="w-4 h-4 fill-current" />
              {userStats.streak}
            </div>
            <button className="text-gray-500 hover:text-gray-300 transition-colors">
              <SettingsIcon className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* --- MAIN CONTENT --- */}
        <main className="flex-1 px-6 pb-32 flex flex-col gap-6 relative z-10 overflow-y-auto">

          {/* SECTION 1: The Active Slot */}
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {slotState === 'active' ? (
              <div className="bg-indigo-600 text-white rounded-[2rem] p-6 shadow-lg shadow-indigo-900/20 transition-transform active:scale-[0.98]">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-indigo-200 font-medium mb-1">{currentSlot.name} Available</h2>
                    <div className="text-4xl font-black tracking-tight">
                      {currentSlot.remaining} <span className="text-xl font-medium text-indigo-300">quizzes</span>
                    </div>
                  </div>
                  <div className="bg-indigo-900/40 backdrop-blur text-indigo-100 text-xs font-bold px-3 py-1.5 rounded-xl border border-indigo-500/30">
                    Ends {currentSlot.endTime}
                  </div>
                </div>
                <button className="w-full bg-white text-indigo-700 font-bold text-lg py-4 rounded-2xl shadow-sm flex justify-center items-center gap-2 hover:bg-indigo-50 transition-colors">
                  Start Session
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="bg-emerald-900/10 rounded-[2rem] p-6 border border-emerald-800/30 flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircleIcon className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-emerald-300 font-bold text-lg">Slot Complete</h2>
                  <p className="text-emerald-200/70 text-sm">You're completely caught up. Next slot opens tomorrow morning.</p>
                </div>
              </div>
            )}
          </section>

          {/* SECTION 2: Interactive Lesson Card */}
          <section className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
            <div 
              onClick={() => setActiveLesson(currentLesson)}
              className="bg-gray-900 border border-gray-800 rounded-[2rem] p-6 relative overflow-hidden group cursor-pointer transition-all hover:bg-gray-800 active:scale-[0.98]"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <currentLesson.icon className={`w-4 h-4 text-${currentLesson.color}-500`} />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                    {completedLessons.length === lessons.length ? "Course Complete" : "Up Next"}
                  </span>
                </div>
                {isCompleted ? (
                  <div className="bg-emerald-500/20 text-emerald-400 rounded-full p-1 border border-emerald-500/30">
                    <CheckCircleIcon className="w-5 h-5" />
                  </div>
                ) : (
                   <div className={`text-xs font-bold text-${currentLesson.color}-500 bg-${currentLesson.color}-500/10 px-2 py-1 rounded-lg border border-${currentLesson.color}-500/20`}>
                     {currentLesson.readTime}
                   </div>
                )}
              </div>
              
              <h3 className={`text-xl font-bold mb-2 ${isCompleted ? 'text-gray-400' : 'text-gray-100'}`}>
                {currentLesson.title}
              </h3>
              
              {!isCompleted && (
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  {currentLesson.teaser}
                </p>
              )}

              <button className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors
                ${isCompleted ? 'bg-gray-800 text-gray-500' : 'bg-gray-800 text-white group-hover:bg-gray-700'}`}>
                {isCompleted ? 'Review Lesson' : 'Read Lesson'}
              </button>
            </div>
          </section>

        </main>

        {/* --- FIXED BOTTOM CTA --- */}
        <div className="absolute bottom-0 w-full bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f] to-transparent pt-12 pb-8 px-6 z-20">
          <button className="w-full text-gray-900 rounded-[2rem] p-5 flex justify-center items-center gap-3 active:scale-[0.98] transition-all transform group bg-gray-100 hover:bg-white shadow-[0_0_40px_rgba(0,0,0,0.5)]">
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