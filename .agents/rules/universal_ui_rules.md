# Universal UI & Frontend Editorial Rules

This document establishes the mandatory, immutable UI copy, branding, and intellectual property protection rules across the entire platform (all frontend surfaces, landing pages, modals, dialogs, banners, tooltips, and documentation).

---

## Rule 1: Strict Prohibition of Patented & Proprietary Method Disclosures
1. **Intellectual Property Protection**:
   - The underlying algorithms, model architectures, and clinical review pipelines are patented, proprietary intellectual property.
   - We **NEVER** disclose, mention, or reference internal method names, proprietary tools, or underlying model architectures on any user-facing surface or website copy.
2. **Strictly Forbidden Terms**:
   Under no circumstances may any of the following terms appear in customer-facing UI, labels, tooltips, toasts, modals, or logs:
   - 🚫 **Biomni** (e.g., Biomni AI, Biomni-R0, Biomni Clarification, biomni_service)
   - 🚫 **Laya** (e.g., Laya AI, Laya System-1, Laya engine, Laya Fast Screening, Auto-Recorded by Laya)
   - 🚫 **Storm** (e.g., STORM method, Storm pipeline, Storm research synthesis)
   - 🚫 Any internal patent/algorithm identifiers or specific research lab prototype names.
3. **Safety Fallback**:
   - If frontend code or backend responses contain these internal terms, the UI guard in `src/lib/editorialRules.ts` must automatically sanitize or redact them to preserve patent secrecy.

---

## Rule 2: Universal Vocabulary — "Co-Scientist" Instead of Generic "AI"
1. **Standardized Identity**:
   - The software does not use generic, genericized "AI" in its interface, headers, badges, or buttons.
   - The authoritative identity across the entire product is **"Co-Scientist"**.
2. **Mandatory Terminology Replacements**:
   | Prohibited / Generic | Mandatory Standard |
   | :--- | :--- |
   | ❌ *AI Screening* / *Laya Screening* | ✅ **Co-Scientist Screening** |
   | ❌ *AI Decision* / *Laya Decision* | ✅ **Co-Scientist Decision** |
   | ❌ *AI Recommendation* | ✅ **Co-Scientist Recommendation** |
   | ❌ *AI Priority Score* | ✅ **Co-Scientist Priority Score** |
   | ❌ *AI Confidence* | ✅ **Co-Scientist Confidence** |
   | ❌ *AI Clarification Request* / *Biomni Clarification* | ✅ **Co-Scientist Clarification Request** |
   | ❌ *Run Laya AI* / *AI Pre-Fill* | ✅ **Run Co-Scientist** / **Co-Scientist Pre-Fill** |
   | ❌ *Auto-Recorded by Laya* | ✅ **Recorded by Co-Scientist** / **Assisted by Co-Scientist** |
   | ❌ *AI Screener* | ✅ **Co-Scientist Screener** |
   | ❌ *AI Extraction Queue* | ✅ **Co-Scientist Extraction Queue** |
   | ❌ *Local Laya Verification* | ✅ **Co-Scientist Citation Verification** |
   | ❌ *AI / Laya Decisions* | ✅ **Co-Scientist Decisions** |

---

## Rule 3: Single Source of Truth
- All customer-facing vocabulary, branding constants, and sanitization logic are codified in:
  [`radextract_platform/frontend/src/lib/editorialRules.ts`](file:///d:/Desktop/Rad%20Extract%20Experimenting/radextract_platform/frontend/src/lib/editorialRules.ts)
- Every component authoring or modifying UI text must reference these tokens to prevent accidental leakage.

---

## Rule 4: Reserved for Additional Instructions
*(New instructions and universal constraints will be appended here as directed by the project lead).*
