import re
from pathlib import Path

path = Path(r"d:\Desktop\Rad Extract Experimenting\radextract_platform\frontend\src\pages\ClaimscapePage.tsx")
content = path.read_text(encoding="utf-8")

old_section_start = '        {/* Section 1: Hero & Question Card Harmonized with Editorial Velvet */}'
old_section_end = '        </section>\n\n        {/* Section 2: Dynamic Headline & Stat KPIs */}'

new_section = '''        {/* Section 1: Hero & Question Card - Compact 2-Column Editorial Velvet Layout */}
        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-10 pt-1 pb-2">
          {/* Left Column: Headline, Restored Description & Legend Bullets */}
          <div className="max-w-[580px] xl:pt-1">
            <p className="text-[11px] font-['Work_Sans'] font-bold uppercase tracking-[0.12em] text-[#7c5800] mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800]"></span>
              Evidence map for any research claim
            </p>
            <h1 className="font-['Bodoni_Moda'] text-[clamp(30px,3.5vw,44px)] font-normal leading-[1.08] text-[#3a0f34] tracking-tight">
              Stay curious.<br />
              <span className="italic font-normal text-[#814d75]">See what the evidence says.</span>
            </h1>

            {/* Restored Description Paragraph */}
            <p className="mt-3 text-[15px] sm:text-[15.5px] text-[#4f444b] font-['Newsreader'] leading-[1.58]">
              Type a claim and see where the literature stands on it. Up to 300 of the most relevant PubMed abstracts are read, sorted by study design and plotted by year, so you can see which kinds of evidence agree and how consensus shifted over time.
            </p>

            {/* Restored 3 Bullets with Legend Markers */}
            <ul className="mt-4 grid gap-2.5 text-[13px] text-[#4f444b] font-['Work_Sans']">
              <li className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="-7.5 -7.5 15 15" aria-hidden="true" className="flex-none">
                  <circle r="6" fill="var(--cs-for)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                <span>Each dot is a paper, colored by what its abstract reports</span>
              </li>
              <li className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="-7.5 -7.5 15 15" aria-hidden="true" className="flex-none">
                  <circle r="7.5" fill="var(--cs-surface)" />
                  <path d="M0 -6 A 6 6 0 0 0 0 6 Z" fill="var(--cs-for)" />
                  <path d="M0 -6 A 6 6 0 0 1 0 6 Z" fill="var(--cs-against)" />
                </svg>
                <span>Rows are study designs, each with a verdict and a 95% Wilson interval</span>
              </li>
              <li className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="-7.5 -7.5 15 15" aria-hidden="true" className="flex-none">
                  <circle r="6" fill="var(--cs-against)" stroke="var(--cs-surface)" strokeWidth="1.5" />
                </svg>
                <span>Every dot opens the sentence its verdict rests on</span>
              </li>
            </ul>

            {/* Compact Technical Pillars Strip */}
            <div className="mt-5 pt-3 border-t border-[#e4e2dd] flex flex-wrap items-center gap-3 text-[11px] font-['Work_Sans'] text-[#72636d]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-none bg-[#3a0f34]"></span>
                PubMed Live Retrieval
              </span>
              <span className="w-px h-3 bg-[#d2c2cb]"></span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-none bg-[#814d75]"></span>
                Laya Fast Screening
              </span>
              <span className="w-px h-3 bg-[#d2c2cb]"></span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800]"></span>
                Wilson 95% Confidence
              </span>
            </div>
          </div>

          {/* Right Column: Search Card & Progress */}
          <div className="w-full">
            <form
              onSubmit={handleMapEvidence}
              className="bg-white border border-[#d2c2cb] p-5 sm:p-6 shadow-xs grid gap-3.5 transition-all focus-within:border-[#814d75] focus-within:ring-2 focus-within:ring-[#eadce6]"
            >
              {/* Claim statement label and helper */}
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-[11px] font-['Work_Sans'] font-semibold text-[#62535d] uppercase tracking-wider">
                  <label htmlFor="claim-textarea" className="text-[#3a0f34] cursor-pointer">
                    Claim statement
                  </label>
                  <span className="hidden sm:inline normal-case tracking-normal text-[#81737b] font-normal">
                    Enter to explore · Shift + Enter for a new line
                  </span>
                </div>

                <textarea
                  id="claim-textarea"
                  value={claim}
                  onChange={(e) => handleClaimChange(e.target.value)}
                  onKeyDown={handleClaimKeyDown}
                  className="w-full resize-none border border-[#d2c2cb] bg-[#fbf9f4] px-3.5 py-2.5 text-[#3a0f34] font-['Newsreader'] text-[16.5px] sm:text-[18px] font-medium leading-[1.35] focus:outline-none focus:border-[#3a0f34] placeholder:text-[#72636d]/65"
                  rows={2}
                  maxLength={300}
                  placeholder={currentPlaceholder}
                />
                <span className="text-[11.5px] text-[#72636d] font-['Work_Sans']">
                  One plain statement works best, phrased positively: “X reduces Y in Z”. Press Enter to map.
                </span>
              </div>

              {/* Toolbar: PubMed query, papers pills, map button */}
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <label className="grid gap-1">
                  <span className="flex items-center justify-between text-[11px] font-semibold text-[#62535d] font-['Work_Sans']">
                    <span className="flex items-center gap-1.5">
                      <span>PubMed search query</span>
                      <span className="text-[10.5px] font-normal text-[#81737b]">auto-built, edit to refine</span>
                    </span>
                    {userEditedQuery && (
                      <span className="text-[10px] text-amber-700 font-medium">Custom query</span>
                    )}
                  </span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setUserEditedQuery(true);
                    }}
                    onKeyDown={handleQueryKeyDown}
                    placeholder="e.g. hormone replacement therapy coronary heart disease"
                    className="border border-[#d2c2cb] bg-[#fbf9f4] text-[#3a0f34] px-3 py-1.5 text-[12px] font-mono font-medium focus:outline-none focus:border-[#3a0f34] h-[36px]"
                  />
                </label>

                {/* Papers count pills */}
                <div className="grid gap-1">
                  <span className="text-[11px] font-semibold text-[#62535d] font-['Work_Sans']">
                    Papers to read
                  </span>
                  <div className="flex items-center border border-[#d2c2cb] bg-[#fbf9f4] overflow-hidden h-[36px]">
                    {[100, 200, 300].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        aria-pressed={paperCount === cnt}
                        onClick={() => setPaperCount(cnt)}
                        className={`px-3 py-1 text-[12px] font-['Work_Sans'] transition-colors h-full ${
                          paperCount === cnt
                            ? "bg-[#3a0f34] text-[#fbf9f4] font-bold"
                            : "text-[#4f444b] hover:bg-[#f0eee9]"
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isScanning}
                  className="font-['Work_Sans'] font-semibold text-[13px] bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] px-4 py-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 h-[36px] whitespace-nowrap"
                >
                  {isScanning ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-none animate-spin" />
                      <span>Mapping...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-[#ffdea6]" />
                      <span>Map the evidence</span>
                    </>
                  )}
                </button>
              </div>

              {/* Example Chips & Toggle Row */}
              <div className="mt-1 pt-3 border-t border-[#e4e2dd] flex flex-wrap items-center justify-between gap-2.5 text-[11.5px] font-['Work_Sans']">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[#72636d]">Examples:</span>
                  {[
                    { label: "HRT and heart disease", claim: "Hormone replacement therapy reduces the risk of coronary heart disease in postmenopausal women" },
                    { label: "Anesthesia and cancer recurrence", claim: "Regional anesthesia improves recurrence-free survival compared to general anesthesia in cancer surgery" },
                    { label: "Vitamin D and fractures", claim: "Vitamin D supplementation reduces fracture risk in older adults" },
                    { label: "Metformin and lifespan", claim: "Metformin extends lifespan in model organisms" },
                  ].map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => handleTopicClick(ex.claim)}
                      className="px-2.5 py-1 bg-[#f0eee9] hover:bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb] transition-colors cursor-pointer text-[11px]"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer text-[#4f444b] text-[11.5px]">
                  <input
                    type="checkbox"
                    checked={includeCommentary}
                    onChange={(e) => setIncludeCommentary(e.target.checked)}
                    className="rounded-none border-[#d2c2cb] text-[#3a0f34] focus:ring-0"
                  />
                  <span>Include narrative reviews & commentary</span>
                </label>
              </div>
            </form>

            {/* Progress Bar under the Question Card */}
            {(isScanning || scanProgress > 0) && (
              <div className="w-full mt-3 border border-[#d2c2cb] bg-white p-3 shadow-xs transition-all duration-300 animate-in fade-in text-left">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold mb-1.5 font-['Work_Sans']">
                  <div className="flex items-center gap-2">
                    {isScanning ? (
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-[#814d75] opacity-75"></span>
                        <span className="relative inline-flex rounded-none h-2.5 w-2.5 bg-[#814d75]"></span>
                      </span>
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                    )}
                    <span className="text-[#3a0f34] font-medium text-[12px]">
                      {scanStepLabel || "Analyzing evidence..."}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#72636d]">
                    {Math.round(scanProgress)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden bg-[#e4e2dd]">
                  <div
                    className="h-full bg-gradient-to-r from-[#3a0f34] via-[#814d75] to-[#7c5800] transition-all duration-300 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Dynamic Headline & Stat KPIs */}'''

# Find the section and replace it
start_idx = content.find(old_section_start)
end_idx = content.find('{/* Section 2: Dynamic Headline & Stat KPIs */}')

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_section + content[end_idx + len('{/* Section 2: Dynamic Headline & Stat KPIs */}'):]
    path.write_text(new_content, encoding="utf-8")
    print("Successfully updated ClaimscapePage.tsx with 2-column layout and restored description!")
else:
    print(f"Error: start_idx={start_idx}, end_idx={end_idx}")
