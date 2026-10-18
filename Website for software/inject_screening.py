import re
from pathlib import Path

html_path = Path("Website for software/version_2_untitled_blend.html")
html = html_path.read_text(encoding="utf-8")

# 1. Update Navigation link from "Features" or add "Screening"
# Let's inspect nav links
print("Nav links exist:", "href=\"#features\"" in html)

# 2. Screening Sorting Component CSS
screening_css = """
    /* ============================================================
       INTERACTIVE STUDY SCREENING & SORTING ENGINE (Taste-Skill)
       ============================================================ */
    .screening-live-card {
      position: relative;
      background: #ffffff;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-xl);
      padding: 24px;
      margin-top: 20px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
      font-family: 'Inter', system-ui, sans-serif;
    }

    .screening-live-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-soft);
      padding-bottom: 12px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .screening-progress-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .screening-progress-bar-bg {
      width: 140px;
      height: 6px;
      background: rgba(0,0,0,0.06);
      border-radius: 999px;
      overflow: hidden;
    }

    .screening-progress-bar-fill {
      height: 100%;
      background: var(--sage);
      width: 40%;
      transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .screening-progress-text {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      color: var(--ink-muted);
      letter-spacing: 0.05em;
    }

    .screening-stage-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(91, 117, 83, 0.12);
      border: 1px solid rgba(91, 117, 83, 0.3);
      color: var(--sage);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* Piles / Buckets Top Bar */
    .screening-buckets {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .screening-bucket {
      background: var(--beige-card);
      border: 1px dashed var(--border-mid);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.25s var(--ease-out, ease-out);
    }
    .screening-bucket.highlight-include {
      background: rgba(91, 117, 83, 0.15);
      border-color: var(--sage);
      border-style: solid;
      transform: scale(1.02);
    }
    .screening-bucket.highlight-maybe {
      background: rgba(196, 146, 74, 0.15);
      border-color: var(--amber);
      border-style: solid;
      transform: scale(1.02);
    }
    .screening-bucket.highlight-exclude {
      background: rgba(171, 51, 41, 0.15);
      border-color: #AB3329;
      border-style: solid;
      transform: scale(1.02);
    }

    .bucket-label-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .bucket-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .bucket-indicator.include { background: var(--sage); }
    .bucket-indicator.maybe   { background: var(--amber); }
    .bucket-indicator.exclude { background: #AB3329; }

    .bucket-name {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--ink-black);
    }

    .bucket-count {
      font-family: 'Space Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: var(--ink-mid);
      background: rgba(0,0,0,0.05);
      padding: 2px 7px;
      border-radius: 999px;
    }

    /* Study Card Deck & Active Item */
    .screening-deck-viewport {
      position: relative;
      min-height: 230px;
      perspective: 1000px;
    }

    .screening-study-card {
      position: relative;
      background: #faf9f6;
      border: 1px solid var(--border-mid);
      border-radius: var(--radius-lg);
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.04);
      transform-origin: center bottom;
      transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
      will-change: transform, opacity;
    }

    /* Stack illusion cards under active card */
    .screening-deck-underlay-1 {
      position: absolute;
      inset: 6px 6px -6px 6px;
      background: #f0ece1;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      z-index: 1;
      transform: translateY(6px) scale(0.98);
      pointer-events: none;
    }
    .screening-deck-underlay-2 {
      position: absolute;
      inset: 12px 12px -12px 12px;
      background: #e6e0d3;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      z-index: 0;
      transform: translateY(12px) scale(0.96);
      pointer-events: none;
    }

    .study-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .study-id-badge {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      color: var(--ink-muted);
      letter-spacing: 0.05em;
    }

    .study-design-tag {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      background: rgba(0,0,0,0.04);
      border: 1px solid var(--border-soft);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--ink-mid);
    }

    .study-title {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 18px;
      font-weight: 600;
      color: var(--ink-black);
      line-height: 1.3;
      margin: 0;
    }

    .study-abstract-preview {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--ink-mid);
      margin: 0;
      max-height: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    /* PICO Highlight Indicators */
    .study-pico-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .pico-badge {
      font-family: 'Space Mono', monospace;
      font-size: 9.5px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    .pico-badge.pop { background: #eaf1e7; color: var(--sage); border: 1px solid rgba(91,117,83,0.3); }
    .pico-badge.int { background: #fdf3eb; color: var(--ochre); border: 1px solid rgba(181,118,74,0.3); }
    .pico-badge.out { background: #f5eff7; color: var(--plum); border: 1px solid rgba(123,107,138,0.3); }

    /* Laya Confidence AI Meter */
    .laya-confidence-meter {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: rgba(91,117,83,0.06);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--sage);
      margin-top: 4px;
    }
    .laya-confidence-meter.moderate {
      background: rgba(196,146,74,0.08);
      border-left-color: var(--amber);
    }
    .laya-confidence-meter.reject {
      background: rgba(171,51,41,0.08);
      border-left-color: #AB3329;
    }

    .laya-tag {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      color: var(--sage);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .laya-confidence-meter.moderate .laya-tag { color: var(--amber); }
    .laya-confidence-meter.reject .laya-tag { color: #AB3329; }

    .laya-rationale {
      font-size: 11px;
      color: var(--ink-mid);
      font-style: italic;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .laya-score-pct {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: var(--ink-black);
    }

    /* Action Decision Controls (Interactive Buttons) */
    .screening-action-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-top: 8px;
    }

    .screen-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 14px;
      border-radius: var(--radius-md);
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      border: 1px solid transparent;
      background: transparent;
      transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .btn-exclude {
      color: #AB3329;
      background: rgba(171, 51, 41, 0.08);
      border-color: rgba(171, 51, 41, 0.25);
    }
    .btn-exclude:hover {
      background: #AB3329;
      color: #ffffff;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(171, 51, 41, 0.3);
    }

    .btn-maybe {
      color: var(--amber);
      background: rgba(196, 146, 74, 0.1);
      border-color: rgba(196, 146, 74, 0.25);
    }
    .btn-maybe:hover {
      background: var(--amber);
      color: #ffffff;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(196, 146, 74, 0.3);
    }

    .btn-include {
      color: #ffffff;
      background: var(--sage);
      border-color: var(--sage);
    }
    .btn-include:hover {
      background: #465c40;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(91, 117, 83, 0.35);
    }

    .screen-hotkey-hint {
      font-size: 9px;
      opacity: 0.7;
      margin-left: 2px;
      border: 1px solid currentColor;
      padding: 1px 4px;
      border-radius: 3px;
    }

    /* Animation Fly-out classes */
    .fly-right-include {
      transform: translateX(180%) rotate(18deg) scale(0.8) !important;
      opacity: 0 !important;
    }
    .fly-left-exclude {
      transform: translateX(-180%) rotate(-18deg) scale(0.8) !important;
      opacity: 0 !important;
    }
    .fly-up-maybe {
      transform: translateY(-120%) scale(0.7) !important;
      opacity: 0 !important;
    }
    .enter-from-stack {
      animation: enterCard 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }

    @keyframes enterCard {
      from { transform: translateY(12px) scale(0.96); opacity: 0.7; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }

    .screening-footer-stats {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--border-soft);
      padding-top: 10px;
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: var(--ink-muted);
    }

    .auto-sort-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: none;
      border: 1px solid var(--border-mid);
      border-radius: 4px;
      padding: 4px 8px;
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      color: var(--ink-mid);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .auto-sort-btn:hover {
      background: var(--beige-card);
      border-color: var(--ink-black);
      color: var(--ink-black);
    }
"""

if '#screening-live-card' not in html and '.screening-live-card' not in html:
    html = html.replace('</style>', f"{screening_css}\n  </style>", 1)
    print("Screening CSS added.")
else:
    print("Screening CSS already present.")

# 3. Build HTML replacement for Card 2
screening_card_html = """          <!-- Card 2: Interactive Study Screening & Sorting (Taste-Skill Animation) -->
          <div class="feature-card span-4 row-2" tabindex="0" role="article" id="screening-card-feature">
            <div class="bracket-corner bl-tl" style="border-color:var(--sage)"></div>
            <div class="bracket-corner bl-tr" style="border-color:var(--sage)"></div>
            <div class="bracket-corner bl-br" style="border-color:var(--sage)"></div>
            <div class="bracket-corner bl-bl" style="border-color:var(--sage)"></div>
            <div class="card-content" style="z-index: 5;">
              <div style="display:flex; align-items:flex-start; justify-content:space-between;">
                <span class="mono-label" style="color:var(--sage);">02 // SCREENING &amp; SORTING</span>
                <span class="screening-stage-badge">Laya AI Engine</span>
              </div>
              
              <!-- Interactive Live Sorting Widget -->
              <div class="screening-live-card" id="screening-widget">
                <div class="screening-live-header">
                  <div class="screening-progress-wrap">
                    <span class="screening-progress-text" id="screening-prog-num">Study 1 of 8</span>
                    <div class="screening-progress-bar-bg">
                      <div class="screening-progress-bar-fill" id="screening-prog-bar" style="width: 12.5%;"></div>
                    </div>
                  </div>
                  <button type="button" class="auto-sort-btn" id="auto-sort-toggle" aria-label="Auto-sort demo">
                    <span id="auto-sort-icon">▶</span> <span id="auto-sort-label">Auto Sort</span>
                  </button>
                </div>

                <!-- Three Sorting Buckets -->
                <div class="screening-buckets">
                  <div class="screening-bucket" id="bucket-exclude">
                    <div class="bucket-label-group">
                      <span class="bucket-indicator exclude"></span>
                      <span class="bucket-name">Exclude</span>
                    </div>
                    <span class="bucket-count" id="count-exclude">0</span>
                  </div>
                  <div class="screening-bucket" id="bucket-maybe">
                    <div class="bucket-label-group">
                      <span class="bucket-indicator maybe"></span>
                      <span class="bucket-name">Uncertain</span>
                    </div>
                    <span class="bucket-count" id="count-maybe">0</span>
                  </div>
                  <div class="screening-bucket" id="bucket-include">
                    <div class="bucket-label-group">
                      <span class="bucket-indicator include"></span>
                      <span class="bucket-name">Include</span>
                    </div>
                    <span class="bucket-count" id="count-include">0</span>
                  </div>
                </div>

                <!-- Stacked Cards Viewport -->
                <div class="screening-deck-viewport" id="screening-viewport">
                  <div class="screening-deck-underlay-2"></div>
                  <div class="screening-deck-underlay-1"></div>
                  
                  <div class="screening-study-card" id="active-study-card">
                    <div class="study-meta-row">
                      <span class="study-id-badge" id="study-pmid">PMID: 38294101 · 2025</span>
                      <span class="study-design-tag" id="study-design">Phase III RCT</span>
                    </div>
                    <h4 class="study-title" id="study-title">Efficacy of targeted vascular embolization in cranial dural arteriovenous fistulas</h4>
                    <p class="study-abstract-preview" id="study-abstract">Prospective randomized trial evaluating complete angiographic occlusion and 12-month morbidity outcomes in 240 patients...</p>
                    
                    <div class="study-pico-tags" id="study-pico">
                      <span class="pico-badge pop">P: Cranial dAVF</span>
                      <span class="pico-badge int">I: Transarterial Onyx</span>
                      <span class="pico-badge out">O: Complete Obliteration</span>
                    </div>

                    <div class="laya-confidence-meter" id="study-meter">
                      <span class="laya-tag">Laya AI:</span>
                      <span class="laya-rationale" id="study-rationale">Eligible RCT, matching clinical population &amp; endpoints</span>
                      <span class="laya-score-pct" id="study-score">96%</span>
                    </div>
                  </div>
                </div>

                <!-- Sorting Decision Actions -->
                <div class="screening-action-row">
                  <button type="button" class="screen-action-btn btn-exclude" id="btn-screen-exclude" title="Exclude study">
                    ✕ Exclude <span class="screen-hotkey-hint">E / 2</span>
                  </button>
                  <button type="button" class="screen-action-btn btn-maybe" id="btn-screen-maybe" title="Mark as uncertain">
                    ? Maybe <span class="screen-hotkey-hint">M / 3</span>
                  </button>
                  <button type="button" class="screen-action-btn btn-include" id="btn-screen-include" title="Include study">
                    ✓ Include <span class="screen-hotkey-hint">I / 1</span>
                  </button>
                </div>

                <div class="screening-footer-stats">
                  <span>Interactive Live Screening</span>
                  <span>Swipe / Click / Hotkeys [1, 2, 3]</span>
                </div>
              </div>

              <div class="card-header" style="margin-top: 14px;">
                <h3>Active Study Eligibility Sorting</h3>
                <p>Screen title, abstract, and PICO criteria in real-time. Local Laya AI scores eligibility, flags exclusions with explicit reasons, and sorts studies into audited Cochrane-grade queues.</p>
              </div>
            </div>
          </div>"""

# Replace Card 2 in HTML
# Pattern for Card 2
target_card2_start = '<!-- Card 2: Bring your own AI -->'
target_card3_start = '<!-- Card 3: Validation metrics -->'

idx_c2 = html.find(target_card2_start)
idx_c3 = html.find(target_card3_start)

if idx_c2 != -1 and idx_c3 != -1:
    html = html[:idx_c2] + screening_card_html + "\n\n          " + html[idx_c3:]
    print("Card 2 successfully replaced with Screening Sorting Card!")
else:
    print(f"Error finding indices: idx_c2={idx_c2}, idx_c3={idx_c3}")

# 4. Interactive Screening JS Animation & Controller
screening_js = """
  // ============================================================
  // INTERACTIVE STUDY SCREENING & SORTING ENGINE (Taste-Skill)
  // ============================================================
  (function initStudyScreeningEngine() {
    const studiesData = [
      {
        id: "STUDY-001",
        pmid: "PMID: 38294101 · 2025",
        design: "Phase III RCT",
        title: "Efficacy of targeted vascular embolization in cranial dural arteriovenous fistulas",
        abstract: "Prospective randomized multicenter trial comparing transarterial Onyx embolization vs surgical resection in 240 patients. Primary outcome: complete occlusion at 12 months with minimal neurological deficit.",
        pico: [
          { text: "P: Cranial dAVF", cls: "pop" },
          { text: "I: Transarterial Onyx", cls: "int" },
          { text: "O: 12-mo Occlusion", cls: "out" }
        ],
        aiDecision: "include",
        aiScore: "96%",
        aiRationale: "Eligible RCT; PICO matching clinical criteria",
        meterCls: "include"
      },
      {
        id: "STUDY-002",
        pmid: "PMID: 37190244 · 2024",
        design: "Case Report (n=1)",
        title: "Spontaneous regression of cerebellar vascular malformation following pregnancy",
        abstract: "Single patient case report describing spontaneous thrombosis and subsequent imaging resolution of a posterior fossa malformation without interventional therapy.",
        pico: [
          { text: "P: Single Patient", cls: "pop" },
          { text: "I: Conservative Watch", cls: "int" },
          { text: "O: Case Resolution", cls: "out" }
        ],
        aiDecision: "exclude",
        aiScore: "12%",
        aiRationale: "Exclude: Single case report (Cohort min n=10 required)",
        meterCls: "reject"
      },
      {
        id: "STUDY-003",
        pmid: "PMID: 39021882 · 2025",
        design: "Retrospective Cohort",
        title: "Hemodynamic remodeling in cerebral arteriovenous malformations treated with Gamma Knife",
        abstract: "Multicenter cohort of 312 patients evaluating angiographic obliteration rates. Mixed pediatric and adult populations without segregated subgroups.",
        pico: [
          { text: "P: Mixed Age AVM", cls: "pop" },
          { text: "I: Stereotactic Radiosurgery", cls: "int" },
          { text: "O: Obliteration Rate", cls: "out" }
        ],
        aiDecision: "maybe",
        aiScore: "68%",
        aiRationale: "Uncertain: Unstratified pediatric subgroup requires full-text check",
        meterCls: "moderate"
      },
      {
        id: "STUDY-004",
        pmid: "PMID: 38810291 · 2025",
        design: "Double-Blind RCT",
        title: "Preoperative balloon occlusion test vs standard catheter angiography: randomized comparison",
        abstract: "Randomized evaluation of ischemic tolerance testing in 180 carotid-involved vascular pathologies. Protocol-compliant primary endpoints documented.",
        pico: [
          { text: "P: Pre-op Malformations", cls: "pop" },
          { text: "I: Test Balloon Occlusion", cls: "int" },
          { text: "O: Ischemic Tolerance", cls: "out" }
        ],
        aiDecision: "include",
        aiScore: "94%",
        aiRationale: "Eligible: Gold standard dual-arm randomized design",
        meterCls: "include"
      },
      {
        id: "STUDY-005",
        pmid: "PMID: 36629104 · 2023",
        design: "Animal Model / In Vitro",
        title: "Endovascular microcatheter shear stress analysis in porcine arterial bifurcations",
        abstract: "Experimental fluid dynamics analysis measuring shear rates and wall stress using microcatheter delivery systems in animal carotid models.",
        pico: [
          { text: "P: Porcine Models", cls: "pop" },
          { text: "I: Computational Flow", cls: "int" },
          { text: "O: Shear Stress", cls: "out" }
        ],
        aiDecision: "exclude",
        aiScore: "4%",
        aiRationale: "Exclude: Non-human in-vitro porcine model",
        meterCls: "reject"
      },
      {
        id: "STUDY-006",
        pmid: "PMID: 39110488 · 2025",
        design: "Comparative Cohort",
        title: "Microvascular decompression vs radiosurgery in persistent symptomatic fistulas",
        abstract: "Comparative analysis of 145 patients with long-term follow-up tracking recurrence, symptom resolution, and secondary embolization interventions.",
        pico: [
          { text: "P: Symptomatic Fistula", cls: "pop" },
          { text: "I: Decompression vs GK", cls: "int" },
          { text: "O: Recurrence Rate", cls: "out" }
        ],
        aiDecision: "include",
        aiScore: "91%",
        aiRationale: "Eligible: Valid comparator arm and full clinical followup",
        meterCls: "include"
      },
      {
        id: "STUDY-007",
        pmid: "PMID: 37499210 · 2024",
        design: "Systematic Review / Meta-analysis",
        title: "Pooled meta-analysis of flow diverters in intracranial aneurysms and associated malformations",
        abstract: "Literature synthesis pooling 42 observational studies. Non-primary clinical data without patient-level extraction files.",
        pico: [
          { text: "P: Pooled Aneurysms", cls: "pop" },
          { text: "I: Flow Diverter Meta", cls: "int" },
          { text: "O: Pooled Effect Size", cls: "out" }
        ],
        aiDecision: "exclude",
        aiScore: "8%",
        aiRationale: "Exclude: Secondary review / meta-analysis (Primary data only)",
        meterCls: "reject"
      },
      {
        id: "STUDY-008",
        pmid: "PMID: 39223011 · 2026",
        design: "Prospective Registry",
        title: "Long-term functional outcome registry of Onyx embolization in Galenic vein malformations",
        abstract: "Prospective cohort registry measuring mRS score at 24 months across 88 neonatal and pediatric patients treated with staged embolization.",
        pico: [
          { text: "P: Pediatric VGAM", cls: "pop" },
          { text: "I: Staged Embolization", cls: "int" },
          { text: "O: mRS Functional Score", cls: "out" }
        ],
        aiDecision: "include",
        aiScore: "89%",
        aiRationale: "Eligible: Prospective protocol, standardized mRS validation",
        meterCls: "include"
      }
    ];

    let currentIndex = 0;
    let counts = { include: 0, maybe: 0, exclude: 0 };
    let isAutoPlaying = false;
    let autoPlayTimer = null;
    let isAnimating = false;

    // DOM Elements
    const cardEl = document.getElementById("active-study-card");
    const pmidEl = document.getElementById("study-pmid");
    const designEl = document.getElementById("study-design");
    const titleEl = document.getElementById("study-title");
    const abstractEl = document.getElementById("study-abstract");
    const picoContainer = document.getElementById("study-pico");
    const meterEl = document.getElementById("study-meter");
    const rationaleEl = document.getElementById("study-rationale");
    const scoreEl = document.getElementById("study-score");

    const progNumEl = document.getElementById("screening-prog-num");
    const progBarEl = document.getElementById("screening-prog-bar");

    const countInclude = document.getElementById("count-include");
    const countMaybe = document.getElementById("count-maybe");
    const countExclude = document.getElementById("count-exclude");

    const bucketInclude = document.getElementById("bucket-include");
    const bucketMaybe = document.getElementById("bucket-maybe");
    const bucketExclude = document.getElementById("bucket-exclude");

    const btnInclude = document.getElementById("btn-screen-include");
    const btnMaybe = document.getElementById("btn-screen-maybe");
    const btnExclude = document.getElementById("btn-screen-exclude");
    const autoSortBtn = document.getElementById("auto-sort-toggle");
    const autoSortIcon = document.getElementById("auto-sort-icon");
    const autoSortLabel = document.getElementById("auto-sort-label");

    if (!cardEl || !btnInclude) return;

    function renderStudy(index) {
      const study = studiesData[index % studiesData.length];
      pmidEl.textContent = study.pmid;
      designEl.textContent = study.design;
      titleEl.textContent = study.title;
      abstractEl.textContent = study.abstract;
      rationaleEl.textContent = study.aiRationale;
      scoreEl.textContent = study.aiScore;

      // Update meter styling
      meterEl.className = "laya-confidence-meter";
      if (study.meterCls === "moderate") {
        meterEl.classList.add("moderate");
      } else if (study.meterCls === "reject") {
        meterEl.classList.add("reject");
      }

      // Update PICO tags
      picoContainer.innerHTML = study.pico
        .map(p => `<span class="pico-badge ${p.cls}">${p.text}</span>`)
        .join("");

      // Update progress
      const displayIndex = (index % studiesData.length) + 1;
      progNumEl.textContent = `Study ${displayIndex} of ${studiesData.length}`;
      progBarEl.style.width = `${(displayIndex / studiesData.length) * 100}%`;
    }

    function triggerDecision(decisionType) {
      if (isAnimating) return;
      isAnimating = true;

      // Highlight target bucket
      if (decisionType === "include") {
        bucketInclude.classList.add("highlight-include");
        cardEl.classList.add("fly-right-include");
      } else if (decisionType === "exclude") {
        bucketExclude.classList.add("highlight-exclude");
        cardEl.classList.add("fly-left-exclude");
      } else {
        bucketMaybe.classList.add("highlight-maybe");
        cardEl.classList.add("fly-up-maybe");
      }

      // Update counts
      counts[decisionType]++;
      if (decisionType === "include") countInclude.textContent = counts.include;
      if (decisionType === "maybe") countMaybe.textContent = counts.maybe;
      if (decisionType === "exclude") countExclude.textContent = counts.exclude;

      setTimeout(() => {
        // Reset bucket highlights
        bucketInclude.classList.remove("highlight-include");
        bucketMaybe.classList.remove("highlight-maybe");
        bucketExclude.classList.remove("highlight-exclude");

        // Advance to next study
        currentIndex++;
        renderStudy(currentIndex);

        // Reset card classes and animate in next card
        cardEl.classList.remove("fly-right-include", "fly-left-exclude", "fly-up-maybe");
        cardEl.classList.add("enter-from-stack");

        setTimeout(() => {
          cardEl.classList.remove("enter-from-stack");
          isAnimating = false;
        }, 360);
      }, 350);
    }

    // Attach Click Events
    btnInclude.addEventListener("click", () => triggerDecision("include"));
    btnMaybe.addEventListener("click", () => triggerDecision("maybe"));
    btnExclude.addEventListener("click", () => triggerDecision("exclude"));

    // Keyboard Shortcuts (1 / I = include, 2 / E = exclude, 3 / M = maybe)
    window.addEventListener("keydown", (e) => {
      // Don't capture when typing in inputs or textareas
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      
      const key = e.key.toLowerCase();
      if (key === '1' || key === 'i') {
        e.preventDefault();
        triggerDecision("include");
      } else if (key === '2' || key === 'e') {
        e.preventDefault();
        triggerDecision("exclude");
      } else if (key === '3' || key === 'm') {
        e.preventDefault();
        triggerDecision("maybe");
      }
    });

    // Touch & Swipe gesture support on Card
    let touchStartX = 0;
    let touchStartY = 0;
    cardEl.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    cardEl.addEventListener("touchend", (e) => {
      const diffX = e.changedTouches[0].screenX - touchStartX;
      const diffY = e.changedTouches[0].screenY - touchStartY;
      if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) {
          triggerDecision("include");
        } else {
          triggerDecision("exclude");
        }
      } else if (diffY < -40 && Math.abs(diffY) > Math.abs(diffX)) {
        triggerDecision("maybe");
      }
    }, { passive: true });

    // Auto Play / Live Demo Tour
    function toggleAutoPlay() {
      if (isAutoPlaying) {
        clearInterval(autoPlayTimer);
        isAutoPlaying = false;
        autoSortIcon.textContent = "▶";
        autoSortLabel.textContent = "Auto Sort";
        autoSortBtn.style.background = "";
      } else {
        isAutoPlaying = true;
        autoSortIcon.textContent = "❚❚";
        autoSortLabel.textContent = "Pause";
        autoSortBtn.style.background = "rgba(91,117,83,0.15)";

        // Run next decision matching the AI suggestion for high fidelity demo
        const runStep = () => {
          const currentStudy = studiesData[currentIndex % studiesData.length];
          triggerDecision(currentStudy.aiDecision);
        };
        runStep();
        autoPlayTimer = setInterval(runStep, 1750);
      }
    }

    autoSortBtn.addEventListener("click", toggleAutoPlay);

    // Initial render
    renderStudy(0);
  })();
"""

if 'initStudyScreeningEngine' not in html:
    html = html.replace('</body>', f"<script>\n{screening_js}\n</script>\n</body>", 1)
    print("Screening JS engine appended.")
else:
    print("Screening JS engine already exists.")

html_path.write_text(html, encoding="utf-8")
print("Saved updated version_2_untitled_blend.html! Bytes:", len(html.encode('utf-8')))
