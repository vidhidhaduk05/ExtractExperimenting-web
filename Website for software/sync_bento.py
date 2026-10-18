import re

with open('Website for software/version_2_untitled_blend.html', 'r', encoding='utf-8') as f:
    c = f.read()

new_card = """<div class="bento-card bento-hero bento-card-2" id="screening">
          <div class="bento-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div>
              <span class="badge-warm">02 // ELIGIBILITY TRIAGE</span>
              <h3 style="font-family:var(--font-serif); font-size:24px; margin-top:6px; color:var(--ink-black); font-weight:500;">Study Bundle Triage Engine</h3>
            </div>
            <a href="screening_sorting_showcase.html" target="_blank" class="btn-wire" style="padding:6px 14px; font-size:12px; font-family:var(--font-mono); text-decoration:none;">Full Screen Triage ↗</a>
          </div>
          <div style="background:#ffffff; border:1px solid var(--border); border-radius:10px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; font-size:12px; color:var(--ink-muted); font-family:var(--font-mono);">
              <span>DOI: 10.1016/j.ajr.2024.08.012</span>
              <span style="color:var(--sage); font-weight:700;">98% Laya Match</span>
            </div>
            <h4 style="font-family:var(--font-reading); font-size:17px; font-weight:600; line-height:1.35; margin-bottom:10px; color:var(--ink-black);">
              Multiparametric MRI vs Dual-Energy CT for Pancreatic Ductal Adenocarcinoma Margin Assessment
            </h4>
            <p style="font-size:13px; line-height:1.55; color:var(--ink-muted); margin-bottom:16px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
              Prospective cohort of N=142 patients assessing microscopic resection margin involvement (R0 vs R1). Contrast-enhanced MRI demonstrated superior sensitivity (91.4% vs 78.2%) with verified histopathologic correlation.
            </p>
            <div style="display:flex; gap:10px; align-items:center;">
              <a href="screening_sorting_showcase.html" target="_blank" class="btn-wire" style="flex:1; text-align:center; padding:9px; font-size:12px; font-family:var(--font-mono); background:var(--sage-subtle); color:var(--sage); border-color:var(--sage); text-decoration:none; font-weight:600;">Launch Focused Triage Dashboard ↗</a>
            </div>
          </div>
        </div>"""

pattern = r'<div class="bento-card bento-hero bento-card-2" id="screening">[\s\S]*?</div>\s*</div>\s*</div>\s*</div>\s*</div>'

if re.search(pattern, c):
    c = re.sub(pattern, new_card + '\n      </div>', c, count=1)
    with open('Website for software/version_2_untitled_blend.html', 'w', encoding='utf-8') as f:
        f.write(c)
    print("Successfully replaced bento card 2 with clean triage link!")
else:
    print("Card pattern not matched directly.")
