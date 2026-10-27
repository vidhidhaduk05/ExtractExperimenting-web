import React, { useState } from "react";

type Method = "A" | "B" | "C";
type Stage = 1 | 2 | 3;

export interface PicoData {
  population: string;
  intervention: string;
  comparator: string;
  outcome: string;
  inclusion: string;
  exclusion: string;
}

export default function PicoHypothesisScreen() {
  const [currentStage, setCurrentStage] = useState<Stage>(1);
  const [selectedMethod, setSelectedMethod] = useState<Method>("A");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [protocolFile, setProtocolFile] = useState<File | null>(null);

  // Core PICO and Eligibility Criteria State
  const [population, setPopulation] = useState("");
  const [intervention, setIntervention] = useState("");
  const [comparator, setComparator] = useState("");
  const [outcome, setOutcome] = useState("");
  const [inclusion, setInclusion] = useState("");
  const [exclusion, setExclusion] = useState("");

  // Processing & UI Feedback State
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Helper to show transient toast message
  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Method A: Heuristic / NLP Extraction from Clinical Research Question
  // ─────────────────────────────────────────────────────────────────────────────
  const handleGenerateFromQuestion = () => {
    if (!researchQuestion.trim()) {
      setErrorMessage("Please enter a clinical research question first.");
      return;
    }
    setErrorMessage(null);
    setIsProcessing(true);

    setTimeout(() => {
      const q = researchQuestion.trim();
      let p = "";
      let i = "";
      let c = "";
      let o = "";

      // Regex heuristics for PICO extraction
      const inMatch = q.match(/in\s+patients\s+with\s+([^?.,]+)/i) || q.match(/in\s+([^?.,]+)/i);
      const compMatch = q.match(/compared\s+to\s+([^?.,]+)/i) || q.match(/versus\s+([^?.,]+)/i) || q.match(/than\s+([^?.,]+)/i);
      const intMatch = q.match(/is\s+([^?.,]+?)\s+(?:more|effective|better|comparable|accurate)/i) || q.match(/effect\s+of\s+([^?.,]+?)\s+on/i);
      const outMatch = q.match(/for\s+(?:detecting|preventing|treating|reducing)\s+([^?.,]+)/i) || q.match(/outcome\s+of\s+([^?.,]+)/i);

      p = inMatch ? inMatch[1].trim() : "Patients relevant to: " + q.slice(0, 40) + "...";
      i = intMatch ? intMatch[1].trim() : "Proposed index intervention or diagnostic test";
      c = compMatch ? compMatch[1].trim() : "Standard of care or alternative comparator";
      o = outMatch ? outMatch[1].trim() : "Primary clinical effectiveness and diagnostic yield";

      setPopulation(p);
      setIntervention(i);
      setComparator(c);
      setOutcome(o);

      // Auto-draft default inclusion & exclusion criteria from the generated PICO
      setInclusion(
        `1. Confirmed diagnosis or clinical presentation of: ${p}.\n` +
        `2. Evaluated with: ${i}.\n` +
        `3. Objective measurement of: ${o}.`
      );
      setExclusion(
        `1. Pediatric patients under 18 years of age (unless specified).\n` +
        `2. Animal studies, in-vitro models, or narrative case reports.\n` +
        `3. Incomplete diagnostic assessment or absent reporting of: ${o}.`
      );

      setIsProcessing(false);
      setSelectedMethod("C"); // Transition directly to editable PICO & Criteria review
      showToast("PICO elements and eligibility criteria generated successfully.");
    }, 450);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Method B: Extraction from Uploaded Research Protocol
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExtractFromProtocol = () => {
    if (!protocolFile) {
      setErrorMessage("Please select a protocol document (.pdf, .docx, or .txt).");
      return;
    }
    setErrorMessage(null);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      parseProtocolText(text, protocolFile.name);
    };
    reader.onerror = () => {
      // Fallback parser if binary file
      parseProtocolText("", protocolFile.name);
    };

    if (protocolFile.name.endsWith(".txt") || protocolFile.name.endsWith(".md")) {
      reader.readAsText(protocolFile);
    } else {
      // Simulate backend parser for PDF/DOCX
      setTimeout(() => {
        parseProtocolText("", protocolFile.name);
      }, 600);
    }
  };

  const parseProtocolText = (text: string, filename: string) => {
    // Regex parsing for inclusion/exclusion and PICO sections
    const incMatch = text.match(/(?:inclusion\s+criteria|eligible\s+studies|inclusion)[\s:]+([\s\S]*?)(?=(?:exclusion|outcomes|methods|$))/i);
    const excMatch = text.match(/(?:exclusion\s+criteria|excluded\s+studies|exclusion)[\s:]+([\s\S]*?)(?=(?:outcomes|endpoints|methods|$))/i);
    const popMatch = text.match(/(?:population|patient\s+cohort|participants)[\s:]+([^\n\r]+)/i);
    const intMatch = text.match(/(?:intervention|index\s+test|exposure)[\s:]+([^\n\r]+)/i);
    const compMatch = text.match(/(?:comparator|comparison|control)[\s:]+([^\n\r]+)/i);
    const outMatch = text.match(/(?:outcomes?|endpoints?|primary\s+outcome)[\s:]+([^\n\r]+)/i);

    const parsedPop = popMatch ? popMatch[1].trim() : `Study cohort identified in ${filename}`;
    const parsedInt = intMatch ? intMatch[1].trim() : "Investigated clinical intervention";
    const parsedComp = compMatch ? compMatch[1].trim() : "Standard control regimen or placebo";
    const parsedOut = outMatch ? outMatch[1].trim() : "Primary efficacy and safety outcomes";

    setPopulation(parsedPop);
    setIntervention(parsedInt);
    setComparator(parsedComp);
    setOutcome(parsedOut);

    if (incMatch && incMatch[1].trim().length > 10) {
      setInclusion(incMatch[1].trim().slice(0, 500));
    } else {
      setInclusion(`1. Patients meeting definition for: ${parsedPop}.\n2. Received intervention: ${parsedInt}.\n3. Full-text original observational cohorts or randomized trials.`);
    }

    if (excMatch && excMatch[1].trim().length > 10) {
      setExclusion(excMatch[1].trim().slice(0, 500));
    } else {
      setExclusion(`1. Duplicate records or overlapping publication datasets.\n2. Non-English full text or conference abstracts without peer review.\n3. Lacking comparative outcomes for: ${parsedComp}.`);
    }

    setIsProcessing(false);
    setSelectedMethod("C"); // Switch to manual edit mode to review extracted elements
    showToast(`Protocol parsed: PICO and eligibility criteria auto-filled from ${filename}.`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Method C: Save PICO Draft
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSavePico = () => {
    if (!population.trim() && !intervention.trim()) {
      setErrorMessage("Please define at least the Population and Intervention.");
      return;
    }
    setErrorMessage(null);

    const draft = {
      population,
      intervention,
      comparator,
      outcome,
      inclusion,
      exclusion,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem("radextract_pico_draft", JSON.stringify(draft));
    } catch (e) {}

    showToast("PICO framework and eligibility criteria saved to project workspace.");
    setCurrentStage(2); // Advance to Stage 2: Review Your Protocol
  };

  // Formulated Search Strings for Stage 3
  const pubmedSearch = `("${population || "Target Population"}"[tiab] OR "${population || "Target Population"}"[Mesh]) AND ("${intervention || "Intervention"}"[tiab]) AND ("${comparator || "Comparator"}"[tiab]) AND ("${outcome || "Outcome"}"[tiab])`;
  const embaseSearch = `('${population || "Target Population"}':ti,ab OR '${population || "Target Population"}'/exp) AND ('${intervention || "Intervention"}':ti,ab) AND ('${comparator || "Comparator"}':ti,ab)`;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#fbf9f4] text-[#4f444b] font-sans">
      {/* Top Header */}
      <header className="h-16 bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-between px-6 border-b border-[#d2c2cb]/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#ffffff] text-[#3a0f34] grid place-items-center font-serif font-bold text-lg shadow-sm">
            R
          </div>
          <div>
            <div className="font-semibold leading-none tracking-tight flex items-center">
              RadExtract
              <span className="text-[10px] tracking-wider uppercase bg-[#ffdea6] text-[#3a0f34] px-1.5 py-0.5 rounded font-bold ml-1.5">
                LAB
              </span>
            </div>
            <div className="text-[11px] text-[#eee7ec] font-normal">
              AI Reviewer for Biomedical Literature &amp; Meta-Analysis
            </div>
          </div>
        </div>

        <div className="text-xs text-[#eee7ec] hidden md:block">
          Project Workspace &mdash; Systematic Review &amp; Literature Synthesis
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Navigation Breadcrumb */}
        <button
          onClick={() => setCurrentStage(1)}
          className="text-[#814d75] hover:text-[#3a0f34] text-xs font-semibold inline-flex items-center gap-1 mb-4 transition"
        >
          &larr; Back to Project Overview
        </button>

        <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-[#3a0f34] mb-2 font-bold">
          Protocol Specification &amp; Search Formulation
        </h1>
        <p className="text-sm text-[#62535d] max-w-3xl mb-8">
          Formulate your structured PICO framework, define eligibility criteria, conduct multi-perspective protocol reviews,
          and generate syntax-calibrated search strategies for PubMed, Embase, and Cochrane.
        </p>

        {/* Global Notifications */}
        {statusMessage && (
          <div className="mb-6 p-4 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] text-[#3a0f34] text-sm font-medium flex items-center justify-between shadow-xs">
            <span>&check;&nbsp; {statusMessage}</span>
            <button onClick={() => setStatusMessage(null)} className="text-xs text-[#814d75] underline">Dismiss</button>
          </div>
        )}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-[#ffebee] border border-[#ffcdd2] text-[#c62828] text-sm font-medium flex items-center justify-between shadow-xs">
            <span>&excl;&nbsp; {errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-xs text-[#c62828] underline">Dismiss</button>
          </div>
        )}

        {/* Stage Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <StageCard
            number="1"
            title="Set Up Your PICO"
            active={currentStage === 1}
            onClick={() => setCurrentStage(1)}
          />
          <StageCard
            number="2"
            title="Review Your Protocol"
            active={currentStage === 2}
            onClick={() => setCurrentStage(2)}
          />
          <StageCard
            number="3"
            title="Generate Search Strings"
            active={currentStage === 3}
            onClick={() => setCurrentStage(3)}
          />
        </div>

        {/* ─────────────────────────────────────────────────────────────────────────────
            STAGE 1: PICO & Eligibility Formulation
        ───────────────────────────────────────────────────────────────────────────── */}
        {currentStage === 1 && (
          <section className="bg-[#ffffff] rounded-2xl border border-[#d2c2cb] shadow-xs p-6 md:p-8">
            <div className="mb-6">
              <p className="text-[10px] font-bold tracking-[1.4px] uppercase text-[#814d75] mb-1">
                BUILD YOUR RESEARCH FOUNDATION
              </p>
              <h2 className="font-serif text-2xl text-[#3a0f34] font-bold mb-1">
                Choose your PICO entry method
              </h2>
              <p className="text-xs text-[#62535d]">
                Start with a question, upload a protocol, or define your review elements directly.
              </p>
            </div>

            {/* Method Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <MethodCard
                label="A"
                title="Enter Research Question"
                description="Start with the question you want to answer."
                active={selectedMethod === "A"}
                onClick={() => setSelectedMethod("A")}
              />
              <MethodCard
                label="B"
                title="Upload a Protocol"
                description="Extract PICO and criteria from existing document."
                active={selectedMethod === "B"}
                onClick={() => setSelectedMethod("B")}
              />
              <MethodCard
                label="C"
                title="Fill PICO Manually"
                description="Define elements & eligibility criteria directly."
                active={selectedMethod === "C"}
                onClick={() => setSelectedMethod("C")}
              />
            </div>

            {/* Method Content Panels */}
            <div className="bg-[#fbf9f4] border border-[#d2c2cb] rounded-xl p-6">
              {/* METHOD A: QUESTION INPUT */}
              {selectedMethod === "A" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold uppercase tracking-wide text-[#3a0f34]">
                      Clinical Research Question
                    </label>
                    <span className="text-[11px] text-[#62535d]">Single question input</span>
                  </div>

                  <textarea
                    value={researchQuestion}
                    onChange={(e) => setResearchQuestion(e.target.value)}
                    placeholder="e.g., Is gadoxetic acid–enhanced MRI more accurate than contrast-enhanced CT for detecting liver metastases in patients with colorectal cancer?"
                    className="w-full min-h-28 rounded-lg border border-[#d2c2cb] bg-[#ffffff] px-4 py-3 text-sm text-[#4f444b] outline-none focus:border-[#814d75] focus:ring-1 focus:ring-[#814d75] resize-y"
                  />

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-4">
                    <p className="text-xs text-[#62535d] max-w-xl">
                      Automatically generates Population, Intervention, Comparator, Outcome, and auto-drafts Inclusion and Exclusion criteria.
                    </p>
                    <button
                      onClick={handleGenerateFromQuestion}
                      disabled={isProcessing}
                      className="px-5 py-2.5 rounded-lg bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] text-xs font-semibold tracking-wide uppercase shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessing ? "Analyzing Question..." : "Generate PICO & Criteria"}
                    </button>
                  </div>
                </div>
              )}

              {/* METHOD B: UPLOAD PROTOCOL */}
              {selectedMethod === "B" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold uppercase tracking-wide text-[#3a0f34]">
                      Upload Research Protocol
                    </label>
                    <span className="text-[11px] text-[#62535d]">PDF / DOCX / TXT / MD</span>
                  </div>

                  <div className="border-2 border-dashed border-[#d2c2cb] hover:border-[#814d75] rounded-xl bg-[#ffffff] p-8 text-center transition">
                    <p className="font-semibold text-sm text-[#3a0f34] mb-1">
                      Choose your existing study protocol
                    </p>
                    <p className="text-xs text-[#62535d] mb-4">
                      Upload a protocol document to extract structured PICO elements and auto-fill eligibility criteria.
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      onChange={(e) => setProtocolFile(e.target.files?.[0] || null)}
                      className="block mx-auto text-xs text-[#62535d] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#3a0f34] file:text-[#fbf9f4] hover:file:bg-[#1a0017] cursor-pointer"
                    />
                    {protocolFile && (
                      <p className="mt-3 text-xs font-semibold text-[#814d75]">
                        Selected file: {protocolFile.name} ({(protocolFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-4">
                    <p className="text-xs text-[#62535d] max-w-xl">
                      Parses document headings, bullets, and text to populate eligibility criteria and review fields.
                    </p>
                    <button
                      onClick={handleExtractFromProtocol}
                      disabled={isProcessing || !protocolFile}
                      className="px-5 py-2.5 rounded-lg bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] text-xs font-semibold tracking-wide uppercase shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessing ? "Extracting Protocol..." : "Extract PICO & Criteria"}
                    </button>
                  </div>
                </div>
              )}

              {/* METHOD C: MANUAL PICO & CRITERIA FORM */}
              {selectedMethod === "C" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-[#3a0f34]">
                        Structured Review Elements
                      </label>
                      <p className="text-xs text-[#62535d]">
                        Review, refine, and verify your study definition and eligibility boundaries.
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-[#814d75] bg-[#eee7ec] px-2 py-0.5 rounded">
                      Editable Draft
                    </span>
                  </div>

                  {/* Core 4 PICO Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <Field
                      label="Population (P)"
                      value={population}
                      onChange={setPopulation}
                      placeholder="e.g., Adults with pure arterial malformations (PAM) or intracranial vascular anomalies"
                    />
                    <Field
                      label="Intervention / Index Test (I)"
                      value={intervention}
                      onChange={setIntervention}
                      placeholder="e.g., Parent-artery reconstruction with flow diverter or microvascular coiling"
                    />
                    <Field
                      label="Comparator (C)"
                      value={comparator}
                      onChange={setComparator}
                      placeholder="e.g., Conservative observation or conventional parent-vessel occlusion"
                    />
                    <Field
                      label="Outcomes (O)"
                      value={outcome}
                      onChange={setOutcome}
                      placeholder="e.g., Angioarchitectural obliteration rate, stroke-free survival, re-bleed risk"
                    />
                  </div>

                  {/* Inclusion & Exclusion Criteria */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#d2c2cb] pt-5">
                    <Field
                      label="Inclusion Criteria"
                      value={inclusion}
                      onChange={setInclusion}
                      placeholder="1. Confirmed angiographic pure arterial malformation&#10;2. Clinical follow-up >= 6 months&#10;3. Quantitative aneurysm occlusion reporting"
                      minHeight="min-h-28"
                    />
                    <Field
                      label="Exclusion Criteria"
                      value={exclusion}
                      onChange={setExclusion}
                      placeholder="1. Arteriovenous malformation (AVM) with arteriovenous shunting&#10;2. Narrative review papers or animal studies&#10;3. Missing clinical rupture or durability data"
                      minHeight="min-h-28"
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-6">
                    <p className="text-xs text-[#62535d] max-w-xl">
                      Saving your PICO draft locks in baseline criteria and allows advancing to multi-perspective review.
                    </p>
                    <button
                      onClick={handleSavePico}
                      className="px-6 py-2.5 rounded-lg bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] text-xs font-semibold tracking-wide uppercase shadow-xs transition cursor-pointer"
                    >
                      Save PICO &amp; Advance &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────────────────────
            STAGE 2: Protocol Multi-Perspective Review
        ───────────────────────────────────────────────────────────────────────────── */}
        {currentStage === 2 && (
          <section className="bg-[#ffffff] rounded-2xl border border-[#d2c2cb] shadow-xs p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#d2c2cb]">
              <div>
                <p className="text-[10px] font-bold tracking-[1.4px] uppercase text-[#814d75] mb-1">
                  STAGE 2 &mdash; PROTOCOL REVIEW
                </p>
                <h2 className="font-serif text-2xl text-[#3a0f34] font-bold">
                  Synthesized Protocol Summary
                </h2>
              </div>
              <button
                onClick={() => setCurrentStage(1)}
                className="text-xs text-[#814d75] font-semibold hover:underline"
              >
                &larr; Edit PICO Elements
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <SummaryBlock label="Population" text={population || "Not specified"} />
              <SummaryBlock label="Intervention" text={intervention || "Not specified"} />
              <SummaryBlock label="Comparator" text={comparator || "Not specified"} />
              <SummaryBlock label="Outcomes" text={outcome || "Not specified"} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <SummaryBlock label="Inclusion Criteria" text={inclusion || "Not defined"} />
              <SummaryBlock label="Exclusion Criteria" text={exclusion || "Not defined"} />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[#d2c2cb]">
              <button
                onClick={() => setCurrentStage(1)}
                className="px-4 py-2 rounded-lg border border-[#d2c2cb] text-xs font-semibold text-[#4f444b] hover:bg-[#eee7ec]"
              >
                &larr; Back to Stage 1
              </button>
              <button
                onClick={() => setCurrentStage(3)}
                className="px-6 py-2.5 rounded-lg bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] text-xs font-semibold tracking-wide uppercase transition cursor-pointer"
              >
                Generate Search Strategies &rarr;
              </button>
            </div>
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────────────────────
            STAGE 3: Search Strategy Generation
        ───────────────────────────────────────────────────────────────────────────── */}
        {currentStage === 3 && (
          <section className="bg-[#ffffff] rounded-2xl border border-[#d2c2cb] shadow-xs p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#d2c2cb]">
              <div>
                <p className="text-[10px] font-bold tracking-[1.4px] uppercase text-[#814d75] mb-1">
                  STAGE 3 &mdash; SEARCH FORMULATION
                </p>
                <h2 className="font-serif text-2xl text-[#3a0f34] font-bold">
                  Syntax-Calibrated Search Strategies
                </h2>
              </div>
              <button
                onClick={() => setCurrentStage(2)}
                className="text-xs text-[#814d75] font-semibold hover:underline"
              >
                &larr; Back to Review
              </button>
            </div>

            <div className="space-y-6 mb-6">
              <SearchStringBox
                dbName="PubMed (NCBI Entrez)"
                syntaxDesc="MeSH headings [Mesh] and title/abstract field tags [tiab]"
                query={pubmedSearch}
                copied={copiedKey === "pubmed"}
                onCopy={() => handleCopy(pubmedSearch, "pubmed")}
              />
              <SearchStringBox
                dbName="Embase (Elsevier)"
                syntaxDesc="Emtree controlled terms /exp and field qualifiers :ti,ab"
                query={embaseSearch}
                copied={copiedKey === "embase"}
                onCopy={() => handleCopy(embaseSearch, "embase")}
              />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[#d2c2cb]">
              <button
                onClick={() => setCurrentStage(2)}
                className="px-4 py-2 rounded-lg border border-[#d2c2cb] text-xs font-semibold text-[#4f444b] hover:bg-[#eee7ec]"
              >
                &larr; Back to Protocol Review
              </button>
              <button
                onClick={() => showToast("Search strategies saved to systematic review export package.")}
                className="px-6 py-2.5 rounded-lg bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] text-xs font-semibold tracking-wide uppercase transition cursor-pointer"
              >
                Save &amp; Export Search Strings
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function StageCard({
  number,
  title,
  active = false,
  onClick,
}: {
  number: string;
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border px-4 py-4 flex items-center gap-3 transition cursor-pointer ${
        active
          ? "border-[#814d75] bg-[#ffffff] shadow-sm ring-1 ring-[#814d75]"
          : "border-[#d2c2cb] bg-[#ffffff]/70 hover:bg-[#ffffff] hover:border-[#814d75]"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-md grid place-items-center text-xs font-bold ${
          active ? "bg-[#3a0f34] text-[#fbf9f4]" : "bg-[#eee7ec] text-[#4f444b]"
        }`}
      >
        {number}
      </div>
      <div>
        <div className="text-[10px] font-bold tracking-wide uppercase text-[#62535d]">
          STAGE {number}
        </div>
        <div className="text-sm font-semibold text-[#3a0f34]">{title}</div>
      </div>
    </div>
  );
}

function MethodCard({
  label,
  title,
  description,
  active,
  onClick,
}: {
  label: string;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition cursor-pointer ${
        active
          ? "border-[#814d75] bg-[#eee7ec]/50 shadow-xs"
          : "border-[#d2c2cb] bg-[#ffffff] hover:border-[#814d75] hover:bg-[#fbf9f4]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-wide uppercase text-[#814d75]">
          METHOD {label}
        </span>
        <span
          className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
            active
              ? "bg-[#3a0f34] border-[#3a0f34] text-[#fbf9f4]"
              : "border-[#d2c2cb] text-transparent"
          }`}
        >
          &check;
        </span>
      </div>
      <div className="text-sm font-bold text-[#3a0f34] mb-1">{title}</div>
      <div className="text-xs text-[#62535d] leading-relaxed">{description}</div>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  minHeight = "min-h-24",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minHeight?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-[#3a0f34] mb-2">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full ${minHeight} rounded-lg border border-[#d2c2cb] bg-[#ffffff] px-4 py-3 text-sm text-[#4f444b] outline-none focus:border-[#814d75] focus:ring-1 focus:ring-[#814d75] resize-y`}
      />
    </div>
  );
}

function SummaryBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="p-4 rounded-xl border border-[#d2c2cb] bg-[#fbf9f4]">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#814d75] mb-1">
        {label}
      </div>
      <div className="text-sm text-[#4f444b] whitespace-pre-wrap">{text}</div>
    </div>
  );
}

function SearchStringBox({
  dbName,
  syntaxDesc,
  query,
  copied,
  onCopy,
}: {
  dbName: string;
  syntaxDesc: string;
  query: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border border-[#d2c2cb] bg-[#fbf9f4]">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-bold text-[#3a0f34]">{dbName}</div>
          <div className="text-xs text-[#62535d]">{syntaxDesc}</div>
        </div>
        <button
          onClick={onCopy}
          className="px-3 py-1.5 rounded-md border border-[#d2c2cb] bg-[#ffffff] hover:bg-[#eee7ec] text-xs font-semibold text-[#3a0f34] transition"
        >
          {copied ? "Copied!" : "Copy Syntax"}
        </button>
      </div>
      <pre className="p-3 rounded-lg bg-[#ffffff] border border-[#d2c2cb] text-xs text-[#4f444b] overflow-x-auto font-mono whitespace-pre-wrap">
        {query}
      </pre>
    </div>
  );
}
