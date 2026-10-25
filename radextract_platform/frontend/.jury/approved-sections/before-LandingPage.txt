import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, SlidersHorizontal, Sparkles, ExternalLink, Layers, Search, Check } from "lucide-react";

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const [question, setQuestion] = useState("");
  const [studyType, setStudyType] = useState("");
  const [period, setPeriod] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Suggested questions for typewriter effect
  const suggestions = [
    "How does sleep deprivation affect memory consolidation?",
    "What are the cardiovascular outcomes of GLP-1 receptor agonists?",
    "What does the evidence say about treatments for treatment-resistant depression?",
    "What are the clinical outcomes of therapeutic cancer vaccines?",
    "Metformin extends lifespan in model organisms",
    "Statins reduce all-cause mortality in primary prevention"
  ];

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState("What does the evidence say about…");

  // Typewriter effect loop
  useEffect(() => {
    if (question.length > 0) return;

    const timeout = setTimeout(() => {
      const targetText = suggestions[placeholderIndex];

      if (!isDeleting) {
        if (subIndex < targetText.length) {
          setCurrentPlaceholder(targetText.substring(0, subIndex + 1));
          setSubIndex(subIndex + 1);
        } else {
          setTimeout(() => setIsDeleting(true), 2200);
        }
      } else {
        if (subIndex > 0) {
          setCurrentPlaceholder(targetText.substring(0, subIndex - 1));
          setSubIndex(subIndex - 1);
        } else {
          setIsDeleting(false);
          setPlaceholderIndex((prev) => (prev + 1) % suggestions.length);
        }
      }
    }, isDeleting ? 25 : 55);

    return () => clearTimeout(timeout);
  }, [subIndex, isDeleting, placeholderIndex, question]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = question.trim();
    if (!q) return;

    setIsSubmitting(true);
    let term = q;
    if (studyType) term = `(${term}) AND "${studyType}"[Publication Type]`;
    if (period) term = `(${term}) AND "last ${period === "1" ? "year" : period + " years"}"[Publication Date]`;

    navigate(`/claimscape?claim=${encodeURIComponent(q)}&q=${encodeURIComponent(term)}&n=300`);
  };

  const handleTopicClick = (topicText: string) => {
    setQuestion(topicText);
    navigate(`/claimscape?claim=${encodeURIComponent(topicText)}&q=${encodeURIComponent(topicText)}&n=300`);
  };

  return (
    <div className="min-h-screen bg-[#fbf9f4] text-[#1b1c19] selection:bg-[#66365c]/15 font-['Newsreader']">
      {/* Site Header */}
      <header className="sticky top-0 z-50 bg-[#fbf9f4]/95 backdrop-blur-md border-b border-[#d2c2cb]/70">
        <div className="max-w-[1280px] mx-auto px-6 py-3.5 flex items-center justify-between">
          {/* Logo Wordmark */}
          <Link to="/" className="flex items-center gap-2.5 text-decoration-none group">
            <div className="w-8 h-8 bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-center font-['Bodoni_Moda'] font-medium italic text-lg leading-none shadow-xs">
              S
            </div>
            <span className="font-['Bodoni_Moda'] text-[21px] font-semibold tracking-[-0.02em] text-[#3a0f34] group-hover:opacity-85 transition-opacity">
              Stellar Labs
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-[13px] font-['Work_Sans'] font-medium text-[#4f444b]">
            <a href="#features" className="hover:text-[#3a0f34] transition-colors">The Approach</a>
            <Link to="/claimscape" className="hover:text-[#3a0f34] transition-colors flex items-center gap-1">
              <span>Evidence Map</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-[#ffdea6] text-[#7c5800] font-semibold uppercase">Live</span>
            </Link>
            <a href="#process" className="hover:text-[#3a0f34] transition-colors">The Process</a>
            <Link to="/projects" className="hover:text-[#3a0f34] transition-colors">Projects</Link>
            <a href="#collaborate" className="hover:text-[#3a0f34] transition-colors">Collaborate</a>
          </nav>

          {/* Header Action Button */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              to="/claimscape"
              className="font-['Work_Sans'] text-[13px] font-semibold bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] px-4 py-2 transition-all shadow-xs flex items-center gap-1.5"
            >
              <span>Explore Evidence</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-[#3a0f34]"
            aria-label="Toggle menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#d2c2cb] bg-[#fbf9f4] px-6 py-4 flex flex-col gap-3 font-['Work_Sans'] text-sm">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-1">The Approach</a>
            <Link to="/claimscape" onClick={() => setMobileMenuOpen(false)} className="py-1 text-[#66365c] font-semibold">Evidence Map</Link>
            <a href="#process" onClick={() => setMobileMenuOpen(false)} className="py-1">The Process</a>
            <Link to="/projects" onClick={() => setMobileMenuOpen(false)} className="py-1">Projects</Link>
            <a href="#collaborate" onClick={() => setMobileMenuOpen(false)} className="py-1">Collaborate</a>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-6 pb-10 md:pt-8 md:pb-12 max-w-[1100px] mx-auto text-center flex flex-col items-center">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-[#ffdea6]/60 border border-[#7c5800]/20 text-[#7c5800] text-[11px] font-['Work_Sans'] font-semibold tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800] animate-pulse"></span>
          From Evidence to the Bedside
        </div>

        {/* Hero Headline */}
        <h1 className="font-['Bodoni_Moda'] text-[clamp(36px,5.2vw,64px)] font-semibold leading-[1.08] text-[#3a0f34] max-w-[920px] tracking-[-0.02em]">
          Stay curious.<br />
          <span className="italic text-[#66365c]">See what the evidence says.</span>
        </h1>

        {/* Hero Subhead */}
        <p className="mt-2.5 max-w-[62ch] text-[17px] md:text-[19px] text-[#4f444b] font-['Newsreader'] italic leading-relaxed">
          Research begins with a patient, a careful observation, and a question worth asking.
        </p>

        {/* The .rq-card Question Box */}
        <div className="w-full max-w-[860px] mt-5 text-left bg-white border border-[#d2c2cb] p-5 sm:p-6 shadow-xs transition-all focus-within:border-[#814d75] focus-within:ring-2 focus-within:ring-[#eadce6]">
          <form onSubmit={handleSubmit}>
            {/* Card Heading */}
            <div className="flex items-center justify-between text-[11px] font-['Work_Sans'] font-medium text-[#62535d] tracking-wider uppercase mb-2">
              <label htmlFor="landing-question-input" className="font-semibold text-[#3a0f34]">
                Your research question
              </label>
              <span className="hidden sm:inline normal-case tracking-normal text-[#81737b]">
                Enter to explore · Shift + Enter for a new line
              </span>
            </div>

            {/* Large Question Input */}
            <textarea
              id="landing-question-input"
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={currentPlaceholder}
              className="w-full resize-none border-0 bg-transparent py-3 text-[#3a0f34] font-['Newsreader'] text-[clamp(22px,2.8vw,30px)] font-medium leading-[1.35] focus:outline-none placeholder:text-[#72636d]/70"
            />

            {/* Toolbar */}
            <div className="mt-3 pt-4 border-t border-[#e4e2dd] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-['Work_Sans'] text-[12px] text-[#3a0f34] bg-[#fbf9f4] border border-[#d2c2cb] px-3 py-1.5 flex items-center gap-1.5 font-medium">
                  <span className="w-2 h-2 rounded-none bg-emerald-600 inline-block"></span>
                  PubMed
                </span>

                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="font-['Work_Sans'] text-[12px] text-[#3a0f34] bg-[#fbf9f4] border border-[#d2c2cb] hover:bg-[#ffdea6] px-3 py-1.5 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#814d75]" />
                  <span>Filters</span>
                  <span className="font-bold text-xs">{showFilters ? "−" : "+"}</span>
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="font-['Work_Sans'] font-semibold text-[14px] bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] px-7 py-3 transition-all cursor-pointer flex items-center gap-2 shadow-xs group"
              >
                <span>Search papers</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Expandable Filters */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-[#e4e2dd] grid gap-4 sm:grid-cols-2 animate-in fade-in">
                <label className="grid gap-1 text-[11px] font-['Work_Sans'] uppercase tracking-wider text-[#62535d]">
                  Study Type
                  <select
                    value={studyType}
                    onChange={(e) => setStudyType(e.target.value)}
                    className="border border-[#d2c2cb] bg-[#fbf9f4] text-[#3a0f34] p-2 text-[13px] font-normal"
                  >
                    <option value="">All study types</option>
                    <option value="systematic review">Systematic reviews</option>
                    <option value="randomized controlled trial">Randomized trials</option>
                    <option value="case reports">Case reports</option>
                  </select>
                </label>

                <label className="grid gap-1 text-[11px] font-['Work_Sans'] uppercase tracking-wider text-[#62535d]">
                  Publication Date
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="border border-[#d2c2cb] bg-[#fbf9f4] text-[#3a0f34] p-2 text-[13px] font-normal"
                  >
                    <option value="">Any time</option>
                    <option value="5">Past 5 years</option>
                    <option value="1">Past year</option>
                  </select>
                </label>
              </div>
            )}
          </form>
          <p className="mt-3 text-[11px] font-['Work_Sans'] text-[#62535d]">
            Your question opens immediately in ClaimScape, where the evidence search begins.
          </p>
        </div>

        {/* Suggested Topic Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5 text-[12px] font-['Work_Sans'] text-[#62535d]">
          <span className="font-medium text-[#81737b]">Try a topic:</span>
          {suggestions.slice(0, 4).map((sugg, i) => {
            const shortLabels = ["Sleep & memory", "Cardiovascular health", "Mental health", "Cancer vaccines"];
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleTopicClick(sugg)}
                className="px-3.5 py-1.5 border border-[#d2c2cb] bg-transparent hover:bg-[#ffdea6] hover:border-[#7c5800] text-[#3a0f34] transition-colors cursor-pointer text-[12px]"
              >
                {shortLabels[i]} ↗
              </button>
            );
          })}
        </div>

        {/* Proof Strip */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-[12.5px] font-['Work_Sans'] text-[#62535d]">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-none bg-[#66365c]"></span>
            Careful observation
          </span>
          <span className="text-[#d2c2cb]">·</span>
          <span>Transparent methods</span>
          <span className="text-[#d2c2cb]">·</span>
          <span>Honest interpretation</span>
        </div>
      </section>

      {/* Trust Strip */}
      <div className="border-y border-[#d2c2cb] bg-[#fbf9f4] py-8 px-6">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-center gap-8 md:gap-14">
          <span className="font-['Work_Sans'] text-[10px] uppercase tracking-[0.18em] text-[#81737b] w-full text-center md:w-auto">
            Reading across the evidence
          </span>
          {["Cochrane", "PubMed", "PROSPERO", "Elsevier", "JBI", "BMJ", "WHO"].map((src) => (
            <span key={src} className="font-['Work_Sans'] text-[15px] font-semibold text-black/30">
              {src}
            </span>
          ))}
        </div>
      </div>

      {/* Section 01: The Approach */}
      <section id="features" className="py-20 px-6 max-w-[1240px] mx-auto">
        <div className="text-[11px] font-['Work_Sans'] uppercase tracking-[0.15em] text-[#81737b] mb-4 flex items-center gap-3">
          <span>[ 01 ]</span>
          <span className="w-12 h-px bg-[#d2c2cb]"></span>
          <span>The Approach</span>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-end mb-14">
          <h2 className="font-['Bodoni_Moda'] text-[clamp(36px,4.5vw,56px)] leading-[1.1] text-[#3a0f34]">
            Observe.<br />
            <span className="italic text-[#814d75]">Question.</span><br />
            Understand.
          </h2>
          <p className="text-[18px] text-[#4f444b] font-['Newsreader'] leading-relaxed">
            Different methods. A shared commitment to careful research. The purpose is clearer thinking for the patient in front of us.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="border border-[#d2c2cb] bg-white p-7 md:col-span-2 relative">
            <span className="text-[10px] font-['Work_Sans'] font-semibold tracking-wider text-[#66365c] uppercase">
              01 // OBSERVE
            </span>
            <h3 className="font-['Bodoni_Moda'] text-[24px] text-[#3a0f34] mt-2 mb-3">
              Every detail matters
            </h3>
            <p className="text-[15px] text-[#4f444b] leading-relaxed">
              Case reports call for careful observation, verified timelines, and complete documentation. When a condition is rare, a carefully reported case can become a useful point of reference.
            </p>
            <div className="flex gap-2 mt-6">
              <span className="px-2.5 py-1 bg-[#dde3e8] text-[11px] font-['Work_Sans'] font-medium text-[#3a0f34]">Clinical detail</span>
              <span className="px-2.5 py-1 bg-[#dde3e8] text-[11px] font-['Work_Sans'] font-medium text-[#3a0f34]">Verified timelines</span>
              <span className="px-2.5 py-1 bg-[#dde3e8] text-[11px] font-['Work_Sans'] font-medium text-[#3a0f34]">Clear documentation</span>
            </div>
          </div>

          <div className="border border-[#d2c2cb] bg-white p-7">
            <span className="text-[10px] font-['Work_Sans'] font-semibold tracking-wider text-[#7c5800] uppercase">
              02 // QUESTION
            </span>
            <h3 className="font-['Bodoni_Moda'] text-[24px] text-[#3a0f34] mt-2 mb-3">
              Know what evidence can show
            </h3>
            <p className="text-[15px] text-[#4f444b] leading-relaxed">
              A conclusion deserves scrutiny. How were the data collected? What was measured? Which sources of bias remain?
            </p>
          </div>

          <div className="border border-[#d2c2cb] bg-white p-7">
            <span className="text-[10px] font-['Work_Sans'] font-semibold tracking-wider text-[#66365c] uppercase">
              03 // REPORT
            </span>
            <h3 className="font-['Bodoni_Moda'] text-[24px] text-[#3a0f34] mt-2 mb-3">
              Make the reasoning visible
            </h3>
            <p className="text-[15px] text-[#4f444b] leading-relaxed">
              Clear reporting lets another reader follow the question, inspect the methods, and understand the limits of the findings.
            </p>
          </div>

          <div className="border border-[#d2c2cb] bg-white p-7 md:col-span-2">
            <span className="text-[10px] font-['Work_Sans'] font-semibold tracking-wider text-[#814d75] uppercase">
              04 // INTERPRET
            </span>
            <h3 className="font-['Bodoni_Moda'] text-[24px] text-[#3a0f34] mt-2 mb-3">
              Judgment stays at the bedside
            </h3>
            <p className="text-[15px] text-[#4f444b] leading-relaxed">
              Evidence informs a clinical decision. It still needs to be read in the context of the individual patient, competing explanations, and uncertainty.
            </p>
          </div>
        </div>
      </section>

      {/* Section 02: Evidence Synthesis Overview */}
      <section className="py-16 px-6 bg-[#f0eee9] border-t border-[#d2c2cb]">
        <div className="max-w-[1240px] mx-auto text-center">
          <span className="text-[11px] font-['Work_Sans'] uppercase tracking-[0.15em] text-[#81737b]">
            [ 02 ] ClaimScape Technology
          </span>
          <h2 className="font-['Bodoni_Moda'] text-[clamp(32px,4vw,50px)] text-[#3a0f34] mt-2 mb-4">
            See where the literature stands.
          </h2>
          <p className="max-w-[68ch] mx-auto text-[17px] text-[#4f444b] leading-relaxed mb-10">
            Up to 300 PubMed abstracts are read and analyzed in parallel with Laya System-1 ONNX, sorted by study design, and plotted with exact Wilson 95% confidence intervals.
          </p>
          <Link
            to="/claimscape"
            className="inline-flex items-center gap-2 font-['Work_Sans'] font-semibold text-[14px] bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] px-8 py-3.5 shadow-sm transition-all"
          >
            <span>Open ClaimScape Evidence Map</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Section 03: The Process */}
      <section id="process" className="py-20 px-6 max-w-[1240px] mx-auto">
        <div className="text-[11px] font-['Work_Sans'] uppercase tracking-[0.15em] text-[#81737b] mb-4 flex items-center gap-3">
          <span>[ 03 ]</span>
          <span className="w-12 h-px bg-[#d2c2cb]"></span>
          <span>The Process</span>
        </div>

        <h2 className="font-['Bodoni_Moda'] text-[clamp(36px,4.5vw,52px)] text-[#3a0f34] mb-12">
          Four stages. No shortcuts.
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { step: "01", title: "Formulate", desc: "PICO framework, hypothesis framing, and database-specific search strings." },
            { step: "02", title: "Search", desc: "Multi-database retrieval across PubMed, Embase, and Scopus with deduplication." },
            { step: "03", title: "Screen", desc: "Two-tier screening: microsecond Boolean filter followed by local Laya System-1." },
            { step: "04", title: "Synthesize", desc: "Evidence mapping, Forest plot Wilson intervals, and RoB critical appraisal." }
          ].map((item) => (
            <div key={item.step} className="border border-[#d2c2cb] bg-white p-6 relative">
              <span className="font-['Bodoni_Moda'] text-[32px] text-[#814d75] font-light">
                {item.step}
              </span>
              <h3 className="font-['Bodoni_Moda'] text-[20px] text-[#3a0f34] mt-2 mb-2">
                {item.title}
              </h3>
              <p className="text-[14px] text-[#4f444b] font-['Work_Sans'] leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 04: Collaboration */}
      <section id="collaborate" className="py-20 px-6 bg-[#fbf9f4] border-t border-[#d2c2cb]">
        <div className="max-w-[840px] mx-auto text-center">
          <span className="text-[11px] font-['Work_Sans'] uppercase tracking-[0.15em] text-[#81737b]">
            [ 04 ] Collaboration
          </span>
          <h2 className="font-['Bodoni_Moda'] text-[clamp(32px,4vw,48px)] text-[#3a0f34] mt-2 mb-4">
            Start a research conversation.
          </h2>
          <p className="text-[17px] text-[#4f444b] leading-relaxed mb-8">
            Whether you are conducting a clinical systematic review, meta-analysis, or investigating rare observational phenotypes, we welcome scientific collaboration.
          </p>
          <a
            href="mailto:research@stellarlabs.org"
            className="inline-flex items-center gap-2 font-['Work_Sans'] font-semibold text-[14px] border border-[#3a0f34] text-[#3a0f34] hover:bg-[#3a0f34] hover:text-[#fbf9f4] px-7 py-3 transition-colors"
          >
            <span>Get in touch</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#d2c2cb] bg-[#3a0f34] text-[#fbf9f4] py-14 px-6">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#fbf9f4] text-[#3a0f34] flex items-center justify-center font-['Bodoni_Moda'] font-bold text-base italic">
              S
            </div>
            <span className="font-['Bodoni_Moda'] text-lg font-semibold tracking-tight">
              Stellar Labs
            </span>
          </div>

          <div className="flex items-center gap-6 text-[13px] font-['Work_Sans'] text-[#fbf9f4]/70">
            <Link to="/claimscape" className="hover:text-white transition-colors">Evidence Map</Link>
            <Link to="/projects" className="hover:text-white transition-colors">Projects</Link>
            <Link to="/rigor-scan" className="hover:text-white transition-colors">Rigor Scan</Link>
          </div>

          <p className="text-[12px] font-['Work_Sans'] text-[#fbf9f4]/50">
            © {new Date().getFullYear()} Stellar Labs. From evidence to the bedside.
          </p>
        </div>
      </footer>
    </div>
  );
};
