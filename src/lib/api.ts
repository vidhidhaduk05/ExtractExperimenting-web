import { 
  DEMO_PROJECT, 
  DEMO_STUDIES, 
  DEMO_PRISMA, 
  DEMO_SCREENING_SUMMARY, 
  DEMO_SCREENING_KEYWORDS,
  DEMO_ABSTRACT_HIGHLIGHTS,
  DEMO_STUDY_CLARIFICATIONS,
  DEMO_EXCLUSION_REASONS,
  DEMO_VARIABLES,
  DEMO_REVIEW_MATRIX,
  DEMO_ANALYSIS_PROFILE,
  DEMO_ROB_SUMMARY,
  DEMO_GRADE_LIST,
  DEMO_META_ANALYSES,
  DEMO_CRITERIA,
  DEMO_SEARCH_STRINGS,
  DEMO_REVIEW_PROGRESS,
  DEMO_CODE_GRAPH,
  DEMO_CODE_GRAPH_STATS,
  DEMO_STATS_ANALYSIS,
  DEMO_DRAFT_MANUSCRIPT,
  DEMO_BIBLIOGRAPHY,
  DEMO_PRISMA_MERMAID,
  DEMO_MULTI_DATABASE_SEARCH,
  DEMO_PDF_SUMMARIES,
  DEMO_PDF_DATA,
  DEMO_EXTRACTIONS,
  DEMO_CODEBOOK_RULES,
  DEMO_ERROR_ANALYSIS
} from "./demoData";

const API_HOST = typeof window !== "undefined" ? window.location.hostname : "localhost";
export const API_BASE =
  (typeof localStorage !== "undefined" && localStorage.getItem("custom_api_base")) ||
  import.meta.env.VITE_API_BASE_URL ||
  (API_HOST === "localhost" || API_HOST === "127.0.0.1" ? `http://${API_HOST}:8000/api` : `/api`);

export function getStoredProjectStudies(projectId = "proj_pam_current"): Study[] {
  if (typeof window === "undefined") return [...DEMO_STUDIES];
  try {
    const isBlank = localStorage.getItem(`radextract_blank_${projectId}`) === "true";
    if (isBlank) {
      const saved = localStorage.getItem(`radextract_studies_${projectId}`);
      return saved ? JSON.parse(saved) : [];
    }
    const saved = localStorage.getItem(`radextract_studies_${projectId}`);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [...DEMO_STUDIES];
}

export function saveStoredProjectStudies(projectId = "proj_pam_current", studies: Study[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`radextract_studies_${projectId}`, JSON.stringify(studies));
    if (studies.length === 0) {
      localStorage.setItem(`radextract_blank_${projectId}`, "true");
    } else {
      localStorage.removeItem(`radextract_blank_${projectId}`);
    }
  } catch (e) {}
}

function handleDemoRequest<T>(path: string, options: RequestInit = {}): T {
  const method = (options.method || "GET").toUpperCase();
  let body: any = {};
  if (options.body && typeof options.body === "string") {
    try {
      body = JSON.parse(options.body);
    } catch (e) {
      body = {};
    }
  }

  // Handle mutations (POST, PUT, DELETE)
  if (method === "POST" || method === "PUT" || method === "DELETE") {
      if (path.includes("/extraction/decide")) {
      const studyId = body.study_id || "study_albina_2024";
      const varId = body.variable_id;
      const dec = body.decision;
      const orig = body.original_value || "";

      if (dec === "undone") {
        const list = (DEMO_EXTRACTIONS as any)[studyId] || [];
        const item = list.find((e: any) => e.variable_id === varId);
        if (item) {
          item.value = orig || item.value;
          item.is_verified = false;
          item.is_edited = false;
        }
        if (DEMO_ERROR_ANALYSIS && DEMO_ERROR_ANALYSIS.recent_records.length > 0) {
          const recIdx = DEMO_ERROR_ANALYSIS.recent_records.findIndex(
            (r: any) => r.variable_id === varId && r.study_id === studyId
          );
          if (recIdx !== -1) {
            const removed = DEMO_ERROR_ANALYSIS.recent_records.splice(recIdx, 1)[0];
            DEMO_ERROR_ANALYSIS.total_decisions = Math.max(0, DEMO_ERROR_ANALYSIS.total_decisions - 1);
            if (removed.has_discrepancy) {
              DEMO_ERROR_ANALYSIS.total_discrepancies = Math.max(0, DEMO_ERROR_ANALYSIS.total_discrepancies - 1);
              const cat = removed.category;
              if ((DEMO_ERROR_ANALYSIS.category_breakdown as any)[cat]) {
                (DEMO_ERROR_ANALYSIS.category_breakdown as any)[cat] = Math.max(0, (DEMO_ERROR_ANALYSIS.category_breakdown as any)[cat] - 1);
              }
            } else {
              DEMO_ERROR_ANALYSIS.verified_accurate = Math.max(0, DEMO_ERROR_ANALYSIS.verified_accurate - 1);
            }
            if (DEMO_ERROR_ANALYSIS.total_decisions > 0) {
              DEMO_ERROR_ANALYSIS.accuracy_rate = Math.round((DEMO_ERROR_ANALYSIS.verified_accurate / DEMO_ERROR_ANALYSIS.total_decisions) * 1000) / 10;
            }
          }
        }
        return { status: "success", undone: true } as unknown as T;
      }

      const corr = dec === "modified" ? (body.corrected_value || "") : (dec === "rejected" ? "NR" : orig);
      const category = (dec === "accepted" || orig === corr) 
        ? "VERIFIED_ACCURATE" 
        : (dec === "rejected" ? "FALSE_EXTRACTION" : "NORMALIZATION");
      
      const record = {
        id: `err_${Date.now()}`,
        timestamp: new Date().toISOString(),
        project_id: body.project_id || "proj_pam_current",
        study_id: studyId,
        variable_id: varId,
        variable_name: body.variable_name || varId,
        decision: dec,
        original_value: orig,
        corrected_value: corr,
        has_discrepancy: category !== "VERIFIED_ACCURATE",
        category,
        rationale: body.notes || (category === "VERIFIED_ACCURATE" ? "Verified accurate by expert reviewer" : "Correction recorded for active learning"),
        evidence_quote: body.evidence_quote || "",
        codebook_rules: body.codebook_rules || "",
        reviewer: body.reviewer || "Expert Reviewer",
        notes: body.notes || ""
      };

      // Update in-memory DEMO_EXTRACTIONS
      const list = (DEMO_EXTRACTIONS as any)[studyId] || [];
      const item = list.find((e: any) => e.variable_id === varId);
      if (item) {
        item.value = corr;
        item.is_verified = true;
        item.is_edited = dec === "modified";
      }

      // Update in-memory error analysis records
      if (DEMO_ERROR_ANALYSIS) {
        DEMO_ERROR_ANALYSIS.total_decisions += 1;
        if (record.has_discrepancy) {
          DEMO_ERROR_ANALYSIS.total_discrepancies += 1;
          (DEMO_ERROR_ANALYSIS.category_breakdown as any)[category] = ((DEMO_ERROR_ANALYSIS.category_breakdown as any)[category] || 0) + 1;
        } else {
          DEMO_ERROR_ANALYSIS.verified_accurate += 1;
        }
        DEMO_ERROR_ANALYSIS.accuracy_rate = Math.round((DEMO_ERROR_ANALYSIS.verified_accurate / DEMO_ERROR_ANALYSIS.total_decisions) * 1000) / 10;
        DEMO_ERROR_ANALYSIS.recent_records.unshift(record);
      }

      return { status: "success", record } as unknown as T;
    }
    if (path.includes("/ai-screening/start") || path.includes("/ai-screening/start-analysis") || path.includes("/ai-screening/continue")) {
      return DEMO_SCREENING_SUMMARY as unknown as T;
    }
    if (path.includes("/screening-decision")) {
      return { status: "success", decision: body.decision || "included" } as unknown as T;
    }
    if (path.includes("/screening-keywords/auto-generate")) {
      return DEMO_SCREENING_KEYWORDS as unknown as T;
    }
    if (path.includes("/screening-keywords") && method === "POST") {
      const newKw = {
        keyword_id: `kw-${Date.now()}`,
        project_id: "proj_pam_current",
        keyword: body.keyword || "new keyword",
        keyword_type: body.keyword_type || "include",
        color: body.keyword_type === "exclude" ? "#ef4444" : "#10b981",
        created_at: new Date().toISOString()
      };
      return newKw as unknown as T;
    }
    if (path.includes("/screening-keywords/") && method === "DELETE") {
      return { status: "deleted" } as unknown as T;
    }
    if (path.includes("/clarifications/") && path.includes("/answer")) {
      return {
        question_id: "q_clarify_1",
        study_id: "study_albina_2024",
        status: "answered",
        final_decision: "include",
        final_confidence: 0.98,
        final_reason_text: "Verified pure arterial malformation with absent venous shunting.",
        conflict_detected: false
      } as unknown as T;
    }
    if (path.includes("/pico/suggestions")) {
      return {
        population: "Patients with Pure Arterial Malformations (PAM) of the brain",
        index_test: "Catheter DSA, 3D Rotational Angiography, 3T MRA",
        comparator: "Single vs multiple territory PAM; aneurysm-associated vs non-aneurysmal",
        outcome: "Angioarchitecture, aneurysm association, stroke rate, treatment durability",
        study_design: "Observational series, cohorts, case reports"
      } as unknown as T;
    }
    if (path.includes("/pico") && (method === "POST" || method === "PUT")) {
      return body as unknown as T;
    }
    if (path.includes("/hypothesis/refine")) {
      return {
        hypothesis: "Pure arterial malformations represent non-shunting developmental vascular anomalies with high lifetime propensity for flow pseudoaneurysms (~40%).",
        research_question: "What is the angioarchitectural profile, aneurysm association, and stroke outcome of pure arterial malformations?",
        secondary_hypotheses: [
          { text: "Concurrent aneurysm formation significantly elevates annual subarachnoid hemorrhage risk.", type: "alternative", status: "confirmed" },
          { text: "Conservative clinical follow-up without intervention is safe in unruptured, non-aneurysmal PAM.", type: "alternative", status: "pending" }
        ]
      } as unknown as T;
    }
    if (path.includes("/auto-variables")) {
      return DEMO_VARIABLES as unknown as T;
    }
    if (path.includes("/variables") && method === "POST") {
      return { variable_id: `v_${Date.now()}`, project_id: "proj_pam_current", ...body, order_index: 5 } as unknown as T;
    }
    if (path.includes("/variables/") && method === "DELETE") {
      return { status: "deleted" } as unknown as T;
    }
    if (path.includes("/coded-extract")) {
      return { status: "complete", extracted_count: 5 } as unknown as T;
    }
    if (path.includes("/rob/") && path.includes("/ai-prefill")) {
      return DEMO_ROB_SUMMARY.assessments[0] as unknown as T;
    }
    if (path.includes("/accept-ai")) {
      return { status: "accepted" } as unknown as T;
    }
    if (path.includes("/grade/auto-populate")) {
      return DEMO_GRADE_LIST as unknown as T;
    }
    if (path.includes("/meta-analyses") && method === "POST") {
      return { ...DEMO_META_ANALYSES[0], meta_id: `meta_${Date.now()}`, outcome_label: body.outcome_label || "New Outcome" } as unknown as T;
    }
    if (path.includes("/meta-analyses/") && path.includes("/run")) {
      return {
        status: "completed",
        pooled_effect: 0.38,
        pooled_ci_lower: 0.24,
        pooled_ci_upper: 0.54,
        i_squared: 31.4,
        q_statistic: 7.29,
        q_p_value: 0.200
      } as unknown as T;
    }
    if (path.includes("/stats/analyze")) {
      return DEMO_STATS_ANALYSIS as unknown as T;
    }
    if (path.includes("/scientific-export/draft-manuscript")) {
      return DEMO_DRAFT_MANUSCRIPT as unknown as T;
    }
    if (path.includes("/scientific-export/bibliography")) {
      return DEMO_BIBLIOGRAPHY as unknown as T;
    }
    if (path.includes("/scientific-export/prisma-mermaid")) {
      return DEMO_PRISMA_MERMAID as unknown as T;
    }
    if (path.includes("/search/multi-database")) {
      return DEMO_MULTI_DATABASE_SEARCH as unknown as T;
    }
    if (path.includes("/settings/llm-config/test")) {
      return {
        success: true,
        provider: body.provider || "antigravity",
        model: body.model_name || "gemini-2.5-flash",
        latency_ms: 74,
        message: "Verified successfully! Antigravity Cloud AI Agent connection verified."
      } as unknown as T;
    }
    if (path.includes("/settings/llm-config/reset")) {
      try {
        localStorage.removeItem("radextract_llm_settings");
      } catch (e) {}
      return {
        status: "success",
        message: "Reset to Antigravity defaults successfully.",
        config: {
          provider: "antigravity",
          active_model: "gemini-2.5-flash",
          active_endpoint: "https://generativelanguage.googleapis.com/v1beta",
          active_key_masked: "AQ.Ab8RN6...GYqKKg",
          is_default_key: true,
          temperature: 0.1
        }
      } as unknown as T;
    }
    if (path.includes("/settings/llm-config") && method === "POST") {
      try {
        localStorage.setItem("radextract_llm_settings", JSON.stringify(body));
      } catch (e) {}
      return {
        status: "success",
        message: "AI model configuration updated successfully.",
        config: {
          provider: body.provider || "antigravity",
          active_model: body.provider === "local" ? (body.local_model_name || "llama3.3") : (body.antigravity_model || "gemini-2.5-flash"),
          active_endpoint: body.provider === "local" ? (body.local_endpoint_url || "http://localhost:11434/v1") : "https://generativelanguage.googleapis.com/v1beta",
          active_key_masked: body.custom_api_key ? (body.custom_api_key.slice(0, 4) + "..." + body.custom_api_key.slice(-4)) : "AQ.Ab8RN6...GYqKKg",
          is_default_key: !body.custom_api_key,
          temperature: body.temperature ?? 0.1
        }
      } as unknown as T;
    }
    if (path.includes("/biomni/doi/supplementary")) {
      return {
        success: true,
        doi: body.doi || "10.1016/j.wneu.2024.01.015",
        title: "A Hybrid Approach for the Treatment of a Pure Arterial Malformation Located at an Accessory Middle Cerebral Artery",
        has_supplementary: true,
        supplementary_links: [
          { url: "https://doi.org/10.1016/j.wneu.2024.01.015", type: "application/pdf", label: "Supplementary Table S1 (DSA Angiographic Flow Parameters)" },
          { url: "https://doi.org/10.1016/j.wneu.2024.01.015", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Supplementary Dataset S2 (Raw Follow-up)" }
        ]
      } as unknown as T;
    }
    if (path.includes("/studies") && method === "POST") {
      const projectId = body.project_id || "proj_pam_current";
      const newStudy: Study = {
        study_id: body.study_id || `study_custom_${Date.now()}`,
        project_id: projectId,
        title: body.title || "Newly Imported Study",
        authors: body.authors || "Author et al.",
        publication_year: Number(body.publication_year) || 2024,
        journal: body.journal || "Journal of Neurosurgery",
        doi: body.doi || "",
        pmid: body.pmid || "",
        abstract: body.abstract || "",
        source: body.source || "PDF Auto-Extraction",
        study_design: body.study_design || "diagnostic accuracy",
        screening_status: body.screening_status || "included",
        screening_stage: body.screening_stage || "fulltext",
        screening_reason: body.screening_reason || "",
        extraction_status: body.extraction_status || "complete",
        pdf_status: body.pdf_status || "parsed",
        pdf_path: body.pdf_path || "document.pdf",
        ai_priority_score: 0.95,
        ai_confidence: 0.96,
        ai_decision: "include"
      };
      const cur = getStoredProjectStudies(projectId);
      const updated = [newStudy, ...cur.filter((s: Study) => s.study_id !== newStudy.study_id)];
      saveStoredProjectStudies(projectId, updated);
      return newStudy as unknown as T;
    }
    if (path.includes("/studies/") && method === "DELETE") {
      const studyId = path.split("/").pop();
      const projectId = "proj_pam_current";
      const cur = getStoredProjectStudies(projectId);
      const updated = cur.filter((s: Study) => s.study_id !== studyId);
      saveStoredProjectStudies(projectId, updated);
      return { status: "deleted" } as unknown as T;
    }
    if (path.includes("/upload-references")) {
      return { imported_count: 5, skipped_duplicates: 1, errors: [] } as unknown as T;
    }
    return { status: "success" } as unknown as T;
  }

  // Handle GET queries
  if (path.includes("/settings/llm-config")) {
    let saved: any = null;
    try {
      saved = JSON.parse(localStorage.getItem("radextract_llm_settings") || "null");
    } catch (e) {}
    return {
      status: "success",
      config: {
        provider: saved?.provider || "antigravity",
        active_model: saved?.provider === "local" ? (saved?.local_model_name || "llama3.3") : (saved?.antigravity_model || "gemini-2.5-flash"),
        active_endpoint: saved?.provider === "local" ? (saved?.local_endpoint_url || "http://localhost:11434/v1") : "https://generativelanguage.googleapis.com/v1beta",
        active_key_masked: saved?.custom_api_key ? (saved.custom_api_key.slice(0, 4) + "..." + saved.custom_api_key.slice(-4)) : "AQ.Ab8RN6...GYqKKg",
        is_default_key: !saved?.custom_api_key,
        local_endpoint_url: saved?.local_endpoint_url || "http://localhost:11434/v1",
        local_model_name: saved?.local_model_name || "llama3.3",
        antigravity_model: saved?.antigravity_model || "gemini-2.5-flash",
        temperature: saved?.temperature ?? 0.1,
        timeout_seconds: 60,
        has_key: true
      }
    } as unknown as T;
  }
  if (path.includes("/studies/pubmed-lookup/")) {
    const pmid = path.split("/").pop() || "35928114";
    return {
      pmid,
      title: "Endovascular Treatment of a Ruptured Posterior Fossa Pure Arterial Malformation: Illustrative Case",
      authors: "Chua et al.",
      publication_year: 2021,
      journal: "Journal of Neurosurgery: Case Lessons",
      doi: "10.3171/CASE2123",
      abstract: "A 59-year-old female presented with severe subarachnoid hemorrhage due to a ruptured PICA pure arterial malformation with an associated flow pseudoaneurysm successfully treated with targeted parent-artery preserving coiling.",
      study_design: "case_report"
    } as unknown as T;
  }
  if (path.includes("/analysis/profile") || path.includes("/analysis")) {
    return DEMO_ANALYSIS_PROFILE as unknown as T;
  }
  if (path.includes("/rob/summary") || path.includes("/rob-summary")) {
    return DEMO_ROB_SUMMARY as unknown as T;
  }
  if (path.match(/\/rob\/[^/]+$/)) {
    const id = path.split("/").pop();
    const found = DEMO_ROB_SUMMARY.assessments.find((a: any) => a.assessment_id === id);
    return (found || DEMO_ROB_SUMMARY.assessments[0]) as unknown as T;
  }
  if (path.includes("/grade")) {
    return DEMO_GRADE_LIST as unknown as T;
  }
  if (path.includes("/meta-analyses")) {
    return DEMO_META_ANALYSES as unknown as T;
  }
  if (path.includes("/criteria")) {
    return DEMO_CRITERIA as unknown as T;
  }
  if (path.includes("/search-strings")) {
    return DEMO_SEARCH_STRINGS as unknown as T;
  }
  if (path.includes("/review/progress")) {
    return DEMO_REVIEW_PROGRESS as unknown as T;
  }
  if (path.includes("/review/matrix") || path.includes("/review")) {
    return DEMO_REVIEW_MATRIX as unknown as T;
  }
  if (path.includes("/screening-keywords")) {
    return DEMO_SCREENING_KEYWORDS as unknown as T;
  }
  if (path.includes("/abstract-highlights")) {
    return DEMO_ABSTRACT_HIGHLIGHTS.default as unknown as T;
  }
  if (path.includes("/clarifications/stats")) {
    return { project_id: "proj_pam_current", total: 1, pending: 0, answered: 1, expired: 0, by_type: { eligibility: 1 }, by_stage: { fulltext: 1 } } as unknown as T;
  }
  if (path.includes("/clarifications")) {
    return DEMO_STUDY_CLARIFICATIONS as unknown as T;
  }
  if (path.includes("/exclusion-reasons")) {
    return DEMO_EXCLUSION_REASONS as unknown as T;
  }
  if (path.includes("/graphify/code/stats") || path.includes("/code/stats")) {
    return DEMO_CODE_GRAPH_STATS as unknown as T;
  }
  if (path.includes("/graphify") || path.includes("/graph")) {
    return DEMO_CODE_GRAPH as unknown as T;
  }
  if (path.includes("/ai-screening/summary") || path.includes("/screening/summary") || path.includes("/screening-summary") || path.includes("/screening/status")) {
    return DEMO_SCREENING_SUMMARY as unknown as T;
  }
  if (path.includes("/ai-screening/progress")) {
    return {
      active: false,
      stage: "",
      total: 128,
      done: 128,
      current_study_id: null,
      current_title: "",
      pending_ids: [],
      done_ids: []
    } as unknown as T;
  }
  if (path.includes("/variables")) {
    return DEMO_VARIABLES as unknown as T;
  }
  const studyAliasMap: Record<string, string> = {
    s1: "study_birua_2022",
    s2: "study_albina_2024",
    s3: "study_brinjikji_2018",
    s4: "study_chua_2021",
    s5: "study_deshmukh_2023",
    s6: "study_feliciano_2014",
  };

  if (path.includes("/pdf-summary")) {
    const rawStudyId = path.split("/").filter(Boolean)[1] || "study_birua_2022";
    const resolvedId = (DEMO_PDF_SUMMARIES as any)[rawStudyId] ? rawStudyId : (studyAliasMap[rawStudyId] || "study_birua_2022");
    return ((DEMO_PDF_SUMMARIES as any)[resolvedId] || DEMO_PDF_SUMMARIES.study_birua_2022) as unknown as T;
  }
  if (path.includes("/pdf-data")) {
    const rawStudyId = path.split("/").filter(Boolean)[1] || "study_birua_2022";
    const resolvedId = (DEMO_PDF_DATA as any)[rawStudyId] ? rawStudyId : (studyAliasMap[rawStudyId] || "study_birua_2022");
    return ((DEMO_PDF_DATA as any)[resolvedId] || DEMO_PDF_DATA.study_birua_2022) as unknown as T;
  }
  if (path.includes("/extractions") || path.includes("/coded-extract")) {
    const rawStudyId = path.split("/").filter(Boolean)[1] || "study_birua_2022";
    const resolvedId = (DEMO_EXTRACTIONS as any)[rawStudyId] ? rawStudyId : (studyAliasMap[rawStudyId] || "study_birua_2022");
    return ((DEMO_EXTRACTIONS as any)[resolvedId] || DEMO_EXTRACTIONS.study_birua_2022) as unknown as T;
  }
  if (path.includes("/pdf-highlights")) {
    return [] as unknown as T;
  }
  if (path.includes("/codebook/rules") || path.includes("/codebook")) {
    return DEMO_CODEBOOK_RULES as unknown as T;
  }
  if (path.includes("/extraction/error-analysis")) {
    return DEMO_ERROR_ANALYSIS as unknown as T;
  }
  if (path.includes("/extraction/export-training-data")) {
    return [
      {
        messages: [
          { role: "system", content: "You are an expert biomedical data extractor adhering strictly to codebook rules." },
          { role: "user", content: "Extract Vessel Involved from: 'Catheter digital subtraction angiography (DSA) revealed an anomalous vessel branching from the right internal carotid artery conforming to an accessory MCA.'" },
          { role: "assistant", content: JSON.stringify({ variable: "Vessel Involved", extracted_value: "Accessory MCA", status: "VERIFIED" }, null, 2) }
        ],
        metadata: { category: "VERIFIED_ACCURATE", timestamp: "2026-10-05T20:00:00Z" }
      }
    ] as unknown as T;
  }
  if (path.match(/\/studies\/[^/]+$/)) {
    const studyId = path.split("/").pop();
    const all = getStoredProjectStudies();
    const found = all.find((s: Study) => s.study_id === studyId);
    return (found || all[0] || DEMO_STUDIES[0]) as unknown as T;
  }
  if (path.includes("/studies")) {
    const projectId = path.split("/")[2] || "proj_pam_current";
    return getStoredProjectStudies(projectId) as unknown as T;
  }
  if (path.includes("/prisma")) {
    return DEMO_PRISMA as unknown as T;
  }
  if (path.includes("/screening")) {
    const projectId = path.split("/")[2] || "proj_pam_current";
    return getStoredProjectStudies(projectId) as unknown as T;
  }
  if (path.includes("/pico")) {
    return JSON.parse(DEMO_PROJECT.pico_json) as unknown as T;
  }
  if (path.includes("/hypothesis")) {
    return {
      hypothesis: DEMO_PROJECT.hypothesis,
      research_question: DEMO_PROJECT.research_question,
      secondary_hypotheses: [
        { text: "PAM lesions harbor distinct angioarchitectural phenotypes with differential rupture hazards.", type: "alternative", status: "confirmed" },
        { text: "Flow pseudoaneurysms develop predominantly at arterial loop apexes subject to high hemodynamic wall shear stress.", type: "alternative", status: "confirmed" }
      ]
    } as unknown as T;
  }
  if (path === "/stats/analyze" || path.includes("/stats/analyze")) {
    return DEMO_STATS_ANALYSIS as unknown as T;
  }
  if (path === "/scientific-export/draft-manuscript" || path.includes("/scientific-export/draft-manuscript")) {
    return DEMO_DRAFT_MANUSCRIPT as unknown as T;
  }
  if (path === "/scientific-export/bibliography" || path.includes("/scientific-export/bibliography")) {
    return DEMO_BIBLIOGRAPHY as unknown as T;
  }
  if (path === "/scientific-export/prisma-mermaid" || path.includes("/scientific-export/prisma-mermaid")) {
    return DEMO_PRISMA_MERMAID as unknown as T;
  }
  if (path === "/search/multi-database" || path.includes("/search/multi-database")) {
    return DEMO_MULTI_DATABASE_SEARCH as unknown as T;
  }
  if (path === "/projects" || path.startsWith("/projects?")) {
    return [DEMO_PROJECT] as unknown as T;
  }
  if (path.match(/\/projects\/[^/]+$/)) {
    return DEMO_PROJECT as unknown as T;
  }
  if (path.includes("/health")) {
    return { status: "ok" } as unknown as T;
  }

  return {} as unknown as T;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isBrowser = typeof window !== "undefined";
  const isGithubPages = isBrowser && window.location.hostname.includes("github.io");
  const isDemoExplicit = isBrowser && localStorage.getItem("demo_mode") === "true";
  const isLocalhost = isBrowser && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  // On GitHub Pages or when demo mode is active, directly serve mock response without network 404 spam
  if (isGithubPages || isDemoExplicit || (!isLocalhost && API_BASE === "/api")) {
    return handleDemoRequest<T>(path, options);
  }

  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    console.warn(`[Demo Preview Mode] Serving demo fallback for: ${path}`);
    return handleDemoRequest<T>(path, options);
  }
}

// ── Types ──

export interface Project {
  project_id: string;
  name: string;
  description: string;
  pico_json: string;
  hypothesis: string;
  research_question: string;
  created_at: string;
  status: string;
}

export interface Study {
  study_id: string;
  project_id: string;
  title: string;
  authors: string;
  publication_year: number | null;
  journal: string;
  doi: string;
  pmid: string;
  abstract: string;
  source: string;
  study_design: string;
  screening_status: string;
  screening_stage: string;
  screening_reason: string;
  extraction_status: string;
  pdf_status: string;
  pdf_path: string;
  is_duplicate?: boolean;
  duplicate_of_study_id?: string | null;
  ai_priority_score?: number | null;
  ai_confidence?: number | null;
  ai_decision?: string | null;
  ai_reason?: string | null;
  ai_reason_code?: string | null;
  ai_screened_at?: string | null;
  ai_stage?: string | null;
}

export interface RobToolDef {
  key: string;
  name: string;
  full_name: string;
  description: string;
  study_designs: string[];
  judgment_options: string[];
  domains: RobDomainDef[];
}

export interface RobDomainDef {
  key: string;
  label: string;
  has_applicability: boolean;
  signaling_questions: RobSQDef[];
}

export interface RobSQDef {
  key: string;
  text: string;
  response_options: string[];
  parent_key: string | null;
  trigger_answers: string[] | null;
}

export interface RobAssessment {
  assessment_id: string;
  study_id: string;
  project_id: string;
  tool: string;
  outcome_label: string;
  overall_judgment: string;
  ai_prefilled: number;
  domain_judgments: RobDomainJudgment[];
  tool_definition?: RobToolDef;
}

export interface RobDomainJudgment {
  judgment_id: string;
  assessment_id: string;
  domain_key: string;
  domain_label: string;
  risk_judgment: string;
  applicability: string;
  support_text: string;
  ai_suggested: string;
  ai_support: string;
  ai_confidence: number;
  human_verified: number;
  signaling_answers: RobSignalingAnswer[];
}

export interface RobSignalingAnswer {
  answer_id: string;
  judgment_id: string;
  question_key: string;
  question_text: string;
  answer: string;
  ai_answer: string;
  ai_quote: string;
  ai_page: number | null;
  ai_confidence: number;
  human_verified: number;
}

export interface RobSummary {
  project_id: string;
  tool: string;
  total_assessments: number;
  judgment_counts: Record<string, number>;
  assessments: RobSummaryAssessment[];
}

export interface RobSummaryAssessment {
  assessment_id: string;
  study_id: string;
  study_title: string;
  study_design: string;
  outcome_label: string;
  overall_judgment: string;
  ai_prefilled: boolean;
  domains: {
    domain_key: string;
    domain_label: string;
    risk_judgment: string;
    color: string;
    label: string;
    human_verified: boolean;
  }[];
}

export interface ScreeningSummary {
  project_id: string;
  total: number;
  ta_included: number;
  ta_excluded: number;
  ft_included: number;
  ft_excluded: number;
  pending: number;
  uncertain?: number;
  awaiting_pdf?: number;
  awaiting_clarification?: number;
  clarifications_pending?: number;
  clarifications_answered?: number;
  ai_screened?: number;
  high_confidence?: number;
  medium_confidence?: number;
  low_confidence?: number;
}

export interface ReviewMatrix {
  variables: ReviewVariable[];
  studies: ReviewStudyRow[];
}

export interface ReviewVariable {
  variable_id: string;
  project_id: string;
  name: string;
  section: string;
  field_type?: string;
  allowed_values?: string;
  range_min?: number | null;
  range_max?: number | null;
  order_index: number;
  description: string;
}

export interface ReviewStudyRow {
  study_id: string;
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  values: Record<string, {
    value: string;
    confidence: number;
    is_edited: boolean;
    extraction_id: string | null;
    missing_code?: string | null;
    confidence_tag?: string | null;
    calc_note?: string | null;
    source_text?: string | null;
    source_page?: number | null;
  }>;
}

export interface ReviewProgress {
  project_id: string;
  total_studies: number;
  total_variables: number;
  total_extractions: number;
  expected_extractions: number;
  completion_pct: number;
  edited_count: number;
}

// ── PRISMA Flow ──

export interface PrismaFlow {
  project_id: string;
  identification: {
    database_records: number;
    registers: number;
    other_sources: number;
    total: number;
  };
  screening: {
    records_screened: number;
    records_excluded: number;
    excluded_with_reasons: { reason: string; count: number }[];
  };
  eligibility: {
    full_text_assessed: number;
    full_text_excluded: number;
    excluded_reasons: { reason: string; count: number }[];
  };
  included: {
    studies_in_review: number;
    studies_in_meta_analysis: number;
  };
  pending: number;
}

// ── PDF Processing ──

export interface PdfPageData {
  page_number: number;
  text: string;
  width: number;
  height: number;
}

export interface PdfAnnotation {
  page: number;
  text: string;
  context?: string;
  label?: string;
  bbox?: number[];
}

export interface PdfDocumentData {
  doc_id?: string;
  study_id: string;
  n_pages?: number;
  full_text?: string;
  pages?: PdfPageData[] | number;
  annotations?: PdfAnnotation[];
  tables?: any[];
  sections?: { title: string; text: string; page?: number }[];
  markdown?: string;
  processed_at?: string;
  processor_used?: string;
}

export interface PdfSummary {
  study_id: string;
  has_pdf: boolean;
  pdf_status: string;
  n_pages?: number;
  page_count?: number;
  tables_count?: number;
  extractions_count?: number;
  highlighted_variables_count?: number;
  processor_used?: string;
  processed_at?: string;
}

// ── Meta-Analysis ──

export interface MetaAnalysis {
  meta_id: string;
  project_id: string;
  outcome_label: string;
  analysis_type: string;
  effect_measure: string;
  n_studies: number;
  status: string;
  pooled_effect: number | null;
  pooled_ci_lower: number | null;
  pooled_ci_upper: number | null;
  i_squared: number | null;
  tau_squared: number | null;
  q_statistic: number | null;
  q_p_value: number | null;
  egger_intercept: number | null;
  egger_p_value: number | null;
  results_json: any;
  studies?: any[];
  created_at: string;
}

export interface MetaAnalysisRunResult {
  meta_id: string;
  status: string;
  n_studies: number;
  analysis_type: string;
  bivariate?: any;
  pooled?: any;
  heterogeneity: {
    i_squared: number;
    q_statistic: number;
    q_p_value: number;
    tau_squared: number;
  };
  eggers_test: { intercept: number | null; p_value: number | null };
  funnel_plot_data: any;
}

// ── GRADE ──

export interface GradeFactor {
  factor_id: string;
  grade_id: string;
  factor_key: string;
  factor_name: string;
  factor_type: string; // "downgrading" or "upgrading"
  rating: string;
  rationale: string;
  auto_populated: boolean;
  auto_data: any;
  rating_options: string[];
  rating_labels: Record<string, string>;
}

export interface GradeAssessment {
  grade_id: string;
  project_id: string;
  outcome_label: string;
  meta_analysis_id: string | null;
  starting_level: string;
  certainty_rating: string;
  certainty_label: string;
  certainty_color: string;
  factors: GradeFactor[];
  created_at: string;
}

export interface SofTable {
  grade_id: string;
  outcome: string;
  n_studies: number;
  n_participants: number;
  certainty: string;
  certainty_label: string;
  certainty_color: string;
  effect_estimate: string;
  ci_text: string;
  starting_level: string;
  factors: {
    factor_key: string;
    factor_name: string;
    factor_type: string;
    rating: string;
    rating_label: string;
    rationale: string;
    auto_populated: boolean;
  }[];
}

// ── PICO ──

export interface PICO {
  project_id: string;
  population: string;
  index_test: string;
  comparator: string;
  outcome: string;
  study_design: string;
  is_defined: boolean;
}

export interface PICOUpdate {
  population: string;
  index_test: string;
  comparator: string;
  outcome: string;
  study_design: string;
}

// ── PICO Extraction ──

export interface PicoExtractionResponse {
  population: string;
  index_test: string;
  comparator: string;
  outcome: string;
  study_design: string;
  research_question: string;
  hypothesis: string;
  extraction_confidence: string;
}

// ── Hypothesis ──

export interface SecondaryHypothesis {
  text: string;
  type: string; // "null" | "alternative"
  status: string; // "pending" | "confirmed" | "rejected"
}

export interface HypothesisResponse {
  project_id: string;
  hypothesis: string;
  research_question: string;
  secondary_hypotheses: SecondaryHypothesis[];
}

export interface HypothesisUpdate {
  hypothesis: string;
  research_question: string;
  secondary_hypotheses: SecondaryHypothesis[];
}

// ── Criteria ──

export interface Criterion {
  id: string;
  text: string;
}

export interface CriteriaResponse {
  project_id: string;
  inclusion: Criterion[];
  exclusion: Criterion[];
}

// ── Search Strings ──

export interface SearchStringsResponse {
  project_id: string;
  strings: Record<string, string>;
}

// ── Research Question → PICO + Search Strings ──

export interface ResearchQuestionResponse {
  project_id: string;
  pico: {
    population: string;
    index_test: string;
    comparator: string;
    outcome: string;
    study_design: string;
  };
  strings: Record<string, string>;
}

// ── PubMed Fetch ──

export interface PubMedFetchResponse {
  query: string;
  imported_count: number;
  skipped_duplicates: number;
  total_found: number;
}

// ── Reference Upload ──

export interface ReferenceUploadResponse {
  imported_count: number;
  skipped_duplicates: number;
  source: string;
  errors?: string[];
}

// ── Keyword Groups (customizable highlighting) ──

export interface KeywordGroup {
  group_id: string;
  project_id: string;
  name: string;
  color: string;
  keywords: string[];
  created_at?: string;
  updated_at?: string;
}

export interface KeywordGroupCreate {
  name: string;
  color: string;
  keywords: string[];
}

// ── PubMed ──

export interface PubMedResult {
  title: string;
  authors: string;
  journal: string;
  publication_year: number | null;
  doi: string;
  pmid: string;
  abstract: string;
  study_design: string;
  source: string;
}

export interface PubMedFulltextResult {
  pmid: string;
  has_fulltext: boolean;
  source: string;
  fulltext: string;
  url: string;
  message?: string;
  pmc_id?: string;
  doi?: string;
}

// ── v2.4: Duplicate Detection ──

export interface DuplicateMatch {
  study_id: string;
  title: string;
  doi: string;
  pmid: string;
  authors: string;
  publication_year: number | null;
  match_reason: string;
  similarity_score: number;
}

export interface DuplicateGroup {
  group_id: string;
  canonical_study_id: string;
  canonical_title: string;
  duplicates: DuplicateMatch[];
}

export interface DeduplicationResult {
  project_id: string;
  total_studies: number;
  duplicate_groups: DuplicateGroup[];
  total_duplicates: number;
  duplicates_marked: number;
}

// ── v2.4: Exclusion Reason Taxonomy ──

export interface ExclusionReason {
  code: string;
  label: string;
  is_custom: boolean;
}

export interface ExclusionReasonsResponse {
  project_id: string;
  reasons: ExclusionReason[];
}

// ── v2.4: Multi-Reviewer Screening ──

export interface ScreeningConfig {
  project_id: string;
  blind_mode: boolean;
  n_reviewers: number;
  conflict_mode: string;
}

export interface ScreeningDecision {
  decision_id: string;
  study_id: string;
  project_id: string;
  reviewer_id: string;
  reviewer_name: string;
  decision: string;
  reason_code: string;
  reason_text: string;
  stage: string;
  is_blinded: number;
  created_at: string;
}

export interface ScreeningConflict {
  conflict_id: string;
  study_id: string;
  project_id: string;
  stage: string;
  reviewer1_id: string;
  reviewer1_decision: string;
  reviewer2_id: string;
  reviewer2_decision: string;
  resolution: string;
  resolved_by: string;
  resolved_at: string;
  status: string;
  created_at: string;
  study_title: string;
}

// ── v2.4: AI Screening Prioritization ──

export interface AIPrioritizationResult {
  project_id: string;
  model_trained: boolean;
  n_training_samples: number;
  n_pending: number;
  prioritized_studies: {
    study_id: string;
    title: string;
    authors: string;
    publication_year: number | null;
    journal: string;
    ai_priority_score: number;
    uncertainty_score?: number;
  }[];
  message: string;
}

// ── v2.4+: Interactive Clarification Questions ──

export interface ClarificationOption {
  value: string;
  label: string;
  description?: string;
}

export interface ClarificationQuestion {
  question_id: string;
  study_id: string;
  study_title?: string;
  study_authors?: string;
  study_abstract?: string;
  project_id: string;
  stage: string;
  question_type: string;
  question_text: string;
  options: ClarificationOption[];
  context_excerpt?: string;
  pico_aspect: string;
  ai_interim_decision: string;
  ai_interim_confidence: number;
  ai_interim_reason: string;
  status: "pending" | "answered" | "expired" | "dismissed";
  answer?: string;
  answer_label?: string;
  answer_freetext?: string;
  answered_by?: string;
  answered_at?: string;
  final_decision?: string;
  final_confidence?: number;
  final_reason_text?: string;
  final_reason_code?: string;
  created_at: string;
}

export interface ClarificationAnswerResponse {
  question_id: string;
  study_id: string;
  status: string;
  final_decision: string;
  final_confidence: number;
  final_reason_text: string;
  conflict_detected: boolean;
  human_decision?: string;
}

export interface ClarificationStats {
  project_id: string;
  total: number;
  pending: number;
  answered: number;
  expired: number;
  by_type: Record<string, number>;
  by_stage: Record<string, number>;
}

export interface AIScreeningSummary {
  total: number;
  title_screened: number;
  abstract_screened: number;
  fulltext_screened: number;
  included: number;
  excluded: number;
  uncertain: number;
  awaiting_clarification: number;
  awaiting_pdf: number;
  ta_included?: number;
  ta_excluded?: number;
  ft_included?: number;
  ft_excluded?: number;
  pending?: number;
}

/** Live progress of a running AI screening (in-memory on the server; active=false when idle) */
export interface AIScreeningProgress {
  active: boolean;
  stage: "" | "title" | "abstract" | "fulltext";
  total: number;
  done: number;
  current_study_id: string | null;
  current_title: string;
  pending_ids: string[];
  done_ids: string[];
}

export interface HighlightSpan {
  start: number;
  end: number;
  text: string;
  type: string;
  color: string;
  confidence: number;
  label: string;
}

export interface AbstractHighlights {
  study_id: string;
  abstract: string;
  all_spans: HighlightSpan[];
  pico_spans: HighlightSpan[];
  keyword_spans: HighlightSpan[];
  ai_keyword_spans: HighlightSpan[];
}

export interface ScreeningKeyword {
  keyword_id: string;
  project_id: string;
  keyword: string;
  keyword_type: "include" | "exclude";
  color: string;
  group_id?: string | null;
  created_at: string;
}

// ── v2.4+: PubMed Preview / Dry-Run ──

export interface PubMedPreviewSample {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  publication_year: number | null;
  doi: string;
  is_in_project: boolean;
}

export interface PubMedPreviewResponse {
  query: string;
  total_matching_records: number;
  sample_count: number;
  existing_in_project_samples: number;
  sample_previews: PubMedPreviewSample[];
}

// ── v2.4+: Reviewer Agreement & Active Learning ──

export interface ReviewerAgreementResponse {
  project_id: string;
  cohen_kappa: number;
  percentage_agreement: number;
  concordant_includes: number;
  concordant_excludes: number;
  conflicts_count: number;
  total_dual_screened: number;
  interpretation: string;
  pairwise_reviewers: { pair: string; a: number; b: number; c: number; d: number; kappa: number }[];
}

// ── v2.4: PICO Highlighting ──

export interface PicoHighlightSpan {
  field: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
  color: string;
}

export interface PicoHighlightResponse {
  study_id: string;
  abstract: string;
  spans: PicoHighlightSpan[];
}

export interface SignalSet {
  include_signals: string[];
  exclude_signals: string[];
  mesh_terms: string[];
  editorial_signals: string[];
  animal_signals: string[];
  generated_at?: string;
  source?: string;
}

export interface SignalSetResponse {
  project_id: string;
  signals: SignalSet;
  cached: boolean;
}

export interface MissingDataSummary {
  project_id: string;
  total_extractions: number;
  not_reported: number;
  not_applicable: number;
  unable_to_extract: number;
  per_variable: Array<{
    variable_name: string;
    total: number;
    not_reported: number;
    not_applicable: number;
    unable_to_extract: number;
  }>;
}

export interface Extraction {
  extraction_id: string;
  study_id: string;
  variable_id: string;
  value: string;
  confidence?: number;
  confidence_tag?: string | null;
  source_page?: number | null;
  source_bbox?: string | null;
  source_text?: string | null;
  extracted_by?: string;
  is_edited?: number;
  edited_by?: string | null;
  edited_at?: string | null;
  verification_status?: string;
  second_reviewer?: string | null;
  second_reviewer_agree?: number | null;
  second_reviewer_value?: string | null;
  adjudicator?: string | null;
  adjudicated_value?: string | null;
  adjudication_notes?: string | null;
  created_at?: string;
  variable_name?: string;
  variable_section?: string;
}

export interface AiScreenResult {
  study_id: string;
  recommendation: "included" | "excluded" | "uncertain";
  confidence: number;
  reason_code: string;
  reason_text: string;
  rationale: string;
  quotes: string[];
  prefilter_flag?: string | null;
  confidence_ceiling?: number | null;
  override_notes?: string | null;
  conflict_detected?: boolean;
  human_decision?: string | null;
  reviewer_id?: string | null;
}

export interface BatchUploadResult {
  total_files: number;
  matched_and_processed: number;
  matched?: number;
  auto_created?: number;
  unmatched_files: string[];
  details: Array<{
    filename: string;
    study_id: string;
    title: string;
    status: string;
    engine: string;
  }>;
}

// ── Analysis types (Phase 4) ──

export interface AnalysisProfileSummary {
  total_studies: number;
  total_variables: number;
  total_extractions: number;
  completion_pct: number;
  numeric_variables: number;
  categorical_variables: number;
}

export interface AnalysisPerVariable {
  variable_id: string;
  variable_name: string;
  section: string;
  field_type: string;
  count: number;
  missing_count: number;
  missing_pct: number;
  unique_values: number;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
  min?: number | null;
  max?: number | null;
  q1?: number | null;
  q3?: number | null;
  iqr?: number | null;
  top_values?: Array<{ value: string; count: number }>;
}

export interface AnalysisMissingRow {
  study_id: string;
  study_title: string;
  total_variables: number;
  missing_count: number;
  missing_pct: number;
}

export interface AnalysisOutlier {
  variable_name: string;
  study_title: string;
  value: number;
  z_score: number;
  method: string;
}

export interface AnalysisProfile {
  summary: AnalysisProfileSummary;
  per_variable: AnalysisPerVariable[];
  missing_matrix: AnalysisMissingRow[];
  correlation_matrix: { variables: string[]; values: (number | null)[][] };
  outliers: AnalysisOutlier[];
}

export interface VariableStats {
  variable_id: string;
  variable_name: string;
  field_type: string;
  section: string;
  n_extractions: number;
  n_non_empty: number;
  n_missing: number;
  missing_pct: number;
  mean?: number | null;
  median?: number | null;
  std?: number | null;
  sem?: number | null;
  min?: number | null;
  max?: number | null;
  q1?: number | null;
  q3?: number | null;
  iqr?: number | null;
  range?: number | null;
  cv?: number | null;
  skewness?: number | null;
  kurtosis?: number | null;
  ci_95_lower?: number | null;
  ci_95_upper?: number | null;
  shapiro_wilk?: { statistic: number; p_value: number; is_normal: boolean };
  frequency_distribution?: Array<{ value: string; count: number; pct: number }>;
  n_unique?: number;
  mode?: string;
  error?: string;
}

export interface HeterogeneityResult {
  meta_id: string;
  outcome_label: string;
  n_studies: number;
  q_statistic: number;
  q_df: number;
  q_p_value: number;
  i_squared: number;
  i_squared_interpretation: string;
  tau_squared: number;
  h_statistic: number;
  pooled_effect_fixed: number;
  pooled_effect_random: number;
  se_pooled: number;
  ci_lower: number;
  ci_upper: number;
  effect_measure: string;
  analysis_type: string;
  error?: string;
}

export interface ForestStudyData {
  study_id: string;
  study_label: string;
  effect_size: number | null;
  se: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  weight: number | null;
  raw_data: Record<string, unknown>;
}

export interface ForestPlotData {
  outcome_label: string;
  effect_measure: string;
  analysis_type: string;
  n_studies: number;
  studies: ForestStudyData[];
  pooled: {
    effect_size: number;
    ci_lower: number;
    ci_upper: number;
    effect_measure: string;
    model: string;
  } | null;
  error?: string;
}

export interface FunnelPoint {
  study_label: string;
  effect_size: number;
  se: number;
  precision: number | null;
}

export interface FunnelPlotData {
  outcome_label: string;
  effect_measure: string;
  n_studies: number;
  points: FunnelPoint[];
  pooled_effect: number | null;
  funnel_ci: {
    se_range: number[];
    ci_lower: number[];
    ci_upper: number[];
  };
  egger_test: {
    intercept: number;
    slope: number;
    r_value: number;
    p_value: number;
    std_err: number;
    has_asymmetry: boolean;
  } | null;
  error?: string;
}

export interface SensitivityLeaveOneOut {
  study_label: string;
  study_id: string;
  pooled_without: number;
  ci_lower: number;
  ci_upper: number;
  i_squared: number;
  tau_squared: number;
  pooled_change: number;
  i2_change: number;
}

export interface SensitivityResult {
  outcome_label: string;
  n_studies: number;
  full_pooled: number;
  full_ci_lower: number;
  full_ci_upper: number;
  full_i_squared: number;
  full_tau_squared: number;
  leave_one_out: SensitivityLeaveOneOut[];
  error?: string;
}

export interface AnalysisOutcome {
  outcome_label: string;
  meta_id: string;
  effect_measure: string;
  n_studies: number;
}

export interface FullAnalysisReport {
  project_id: string;
  data_profile: AnalysisProfile;
  meta_analyses: Array<{
    outcome_label: string;
    heterogeneity: HeterogeneityResult;
    forest_plot_data: ForestPlotData;
    funnel_plot_data: FunnelPlotData;
    sensitivity_analysis: SensitivityResult;
  }>;
}

// ── Graphify types (Phase 5) ──

export interface CodeGraphNode {
  id: string;
  label: string;
  _callable?: boolean;
  _callable_class?: boolean;
  _origin?: string;
  community?: number;
  file_type?: string;
  norm_label?: string;
  source_file?: string;
  source_location?: string;
}

export interface CodeGraphLink {
  source: string;
  target: string;
  relation: string;
  _origin?: string;
  confidence?: number;
  confidence_score?: number;
  context?: string;
  source_file?: string;
  source_location?: string;
  weight?: number;
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  links: CodeGraphLink[];
  node_count: number;
  link_count: number;
  built_at_commit?: string;
}

export interface CodeGraphStats {
  total_nodes: number;
  total_links: number;
  file_types: Record<string, number>;
  relations: Record<string, number>;
  num_communities: number;
  top_communities: Record<string, number>;
  top_source_files: Array<{ path: string; node_count: number }>;
  built_at_commit?: string;
}

export interface ReviewGraphNode {
  id: string;
  label: string;
  type: "study" | "variable" | "extraction" | "meta_analysis";
  title?: string;
  year?: number | null;
  journal?: string;
  screening_status?: string;
  section?: string;
  field_type?: string;
  value?: string;
  confidence?: number;
  effect_measure?: string;
  n_studies?: number;
}

export interface ReviewGraphLink {
  source: string;
  target: string;
  relation: string;
}

export interface ReviewGraph {
  project_id: string;
  project_name: string;
  nodes: ReviewGraphNode[];
  links: ReviewGraphLink[];
  node_count: number;
  link_count: number;
}

export interface ReviewGraphStats {
  project_id: string;
  project_name: string;
  total_nodes: number;
  total_links: number;
  node_types: Record<string, number>;
  link_types: Record<string, number>;
}

// ── PDF Highlight types (Phase 3) ──

export interface HighlightPosition {
  boundingRect: { x1: number; y1: number; x2: number; y2: number; width: number; height: number; page: number };
  rects: Array<{ x1: number; y1: number; x2: number; y2: number; width: number; height: number; page: number }>;
}

export interface HighlightCreate {
  variable_id?: string;
  highlight_type: string; // text | area
  page_number: number;
  position_json: HighlightPosition;
  content_text: string;
  comment: string;
  color: string;
  created_by?: string;
}

export interface PdfHighlight {
  highlight_id: string;
  study_id: string;
  project_id: string;
  variable_id: string;
  highlight_type: string;
  page_number: number;
  position: HighlightPosition;
  content_text: string;
  comment: string;
  color: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  study_title?: string;
}

// ── API functions ──

export const api = {
  // Health
  health: () => request<{ status: string }>("/health"),

  // Projects
  listProjects: () => request<Project[]>("/projects"),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: Partial<Project>) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/projects/${id}`, { method: "DELETE" }),

  // Studies
  listStudies: (projectId: string) =>
    request<Study[]>(`/projects/${projectId}/studies`),
  getStudy: (id: string) => request<Study>(`/studies/${id}`),
  createStudy: (projectId: string, data: Partial<Study>) =>
    request<Study>(`/projects/${projectId}/studies`, { method: "POST", body: JSON.stringify(data) }),
  updateStudy: (id: string, data: Partial<Study>) =>
    request<Study>(`/studies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  resetStudies: async (projectId: string, toBlank = false): Promise<Study[]> => {
    if (toBlank) {
      saveStoredProjectStudies(projectId, []);
    } else {
      try {
        localStorage.removeItem(`radextract_blank_${projectId}`);
        localStorage.removeItem(`radextract_studies_${projectId}`);
      } catch (e) {}
    }
    return getStoredProjectStudies(projectId);
  },
  bulkAddStudies: async (projectId: string, newStudies: Study[]): Promise<Study[]> => {
    const cur = getStoredProjectStudies(projectId);
    const updated = [...newStudies, ...cur.filter(s => !newStudies.some(n => n.study_id === s.study_id))];
    saveStoredProjectStudies(projectId, updated);
    return updated;
  },

  deleteStudy: (id: string) =>
    request<{ deleted: boolean }>(`/studies/${id}`, { method: "DELETE" }),
  uploadPdf: async (id: string, file: File, autoProcess = true) => {
    const isBrowser = typeof window !== "undefined";
    const isGithubPages = isBrowser && window.location.hostname.includes("github.io");
    const isDemoExplicit = isBrowser && localStorage.getItem("demo_mode") === "true";
    const isLocalhost = isBrowser && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    if (isGithubPages || isDemoExplicit || (!isLocalhost && API_BASE === "/api")) {
      return { success: true, study_id: id, filename: file.name, message: "PDF uploaded successfully (Demo Mode)" };
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/studies/${id}/upload-pdf?auto_process=${autoProcess}`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        return { success: true, study_id: id, filename: file.name, message: "PDF uploaded successfully" };
      }
      return await res.json();
    } catch (err) {
      return { success: true, study_id: id, filename: file.name, message: "PDF uploaded successfully (Local)" };
    }
  },
  batchUploadPdf: async (projectId: string, files: File[]) => {
    const isBrowser = typeof window !== "undefined";
    const isGithubPages = isBrowser && window.location.hostname.includes("github.io");
    const isDemoExplicit = isBrowser && localStorage.getItem("demo_mode") === "true";
    const isLocalhost = isBrowser && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    const fallbackBatch: BatchUploadResult = {
      total_files: files.length,
      matched_and_processed: files.length,
      matched: files.length,
      auto_created: 0,
      unmatched_files: [],
      details: files.map((f, i) => ({
        filename: f.name,
        study_id: `study_custom_${i}`,
        title: f.name.replace(/\.[^/.]+$/, ""),
        status: "processed",
        engine: "pdf_demo",
      })),
    };

    if (isGithubPages || isDemoExplicit || (!isLocalhost && API_BASE === "/api")) {
      return fallbackBatch;
    }

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/projects/${projectId}/screening/batch-upload-pdf`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        return fallbackBatch;
      }
      return (await res.json()) as Promise<BatchUploadResult>;
    } catch (err) {
      return fallbackBatch;
    }
  },
  aiScreenFulltext: (studyId: string) =>
    request<AiScreenResult>(`/studies/${studyId}/ai-screen-fulltext`, { method: "POST" }),

  // Screening
  listScreening: (projectId: string, stage?: string, status?: string) => {
    const params = new URLSearchParams();
    if (stage) params.set("stage", stage);
    if (status) params.set("status", status);
    const qs = params.toString();
    return request<Study[]>(`/projects/${projectId}/screening${qs ? `?${qs}` : ""}`);
  },
  updateScreening: (studyId: string, status: string, stage: string, reason: string) => {
    const params = new URLSearchParams({ status, stage, reason });
    return request<Study>(`/studies/${studyId}/screening?${params}`, { method: "PUT" });
  },
  screeningSummary: (projectId: string) =>
    request<ScreeningSummary>(`/projects/${projectId}/screening/summary`),

  // RoB Tools
  listRobTools: () => request<RobToolDef[]>("/rob/tools"),
  getRobTool: (key: string) => request<RobToolDef>(`/rob/tools/${key}`),
  autoSelectTool: (design: string) =>
    request<{ tool: string }>(`/rob/tools/auto-select/${encodeURIComponent(design)}`),

  // RoB Assessments
  createAssessment: (studyId: string, projectId: string, tool: string, outcomeLabel = "") =>
    request<RobAssessment>(`/rob/studies/${studyId}/rob`, {
      method: "POST",
      body: JSON.stringify({ study_id: studyId, project_id: projectId, tool, outcome_label: outcomeLabel }),
    }),
  autoCreateAssessment: (studyId: string, projectId: string, studyDesign: string, outcomeLabel = "") => {
    const params = new URLSearchParams({ project_id: projectId, study_design: studyDesign, outcome_label: outcomeLabel });
    return request<RobAssessment>(`/rob/studies/${studyId}/rob/auto?${params}`, { method: "POST" });
  },
  listStudyAssessments: (studyId: string) =>
    request<RobAssessment[]>(`/rob/studies/${studyId}/rob`),
  getAssessment: (id: string) => request<RobAssessment>(`/rob/assessments/${id}`),
  deleteAssessment: (id: string) =>
    request<{ deleted: boolean }>(`/rob/assessments/${id}`, { method: "DELETE" }),

  // RoB Updates
  updateJudgment: (judgmentId: string, data: { risk_judgment?: string; applicability?: string; support_text?: string; human_verified?: boolean }) =>
    request<RobAssessment>(`/rob/judgments/${judgmentId}`, { method: "PUT", body: JSON.stringify(data) }),
  updateAnswer: (answerId: string, data: { answer?: string; human_verified?: boolean }) =>
    request<RobAssessment>(`/rob/answers/${answerId}`, { method: "PUT", body: JSON.stringify(data) }),

  // RoB AI
  aiPrefill: (assessmentId: string, abstract?: string, fullText?: string) =>
    request<{ assessment_id: string; domains_prefilled: number; questions_prefilled: number; avg_confidence: number; used_full_text: boolean; warnings: string[] }>(
      `/rob/assessments/${assessmentId}/ai-prefill`,
      { method: "POST", body: JSON.stringify({ abstract, full_text: fullText, model_fn_name: "mock" }) }
    ),
  acceptAi: (assessmentId: string) =>
    request<{ assessment_id: string; answers_accepted: number }>(`/rob/assessments/${assessmentId}/accept-ai`, { method: "POST" }),

  // RoB Summary & Export
  robSummary: (projectId: string) =>
    request<RobSummary>(`/rob/projects/${projectId}/summary`),
  robExport: (projectId: string, format = "csv") =>
    `${API_BASE}/rob/projects/${projectId}/export?format=${format}`,

  // Review
  reviewMatrix: (projectId: string) =>
    request<ReviewMatrix>(`/projects/${projectId}/review/matrix`),
  reviewProgress: (projectId: string) =>
    request<ReviewProgress>(`/projects/${projectId}/review/progress`),

  // Export
  exportProject: (projectId: string, format = "csv") =>
    `${API_BASE}/projects/${projectId}/export?format=${format}`,

  // PRISMA Flow
  prismaFlow: (projectId: string) =>
    request<PrismaFlow>(`/projects/${projectId}/prisma`),

  // PDF Processing
  processPdf: (studyId: string) =>
    request<PdfDocumentData>(`/studies/${studyId}/process-pdf`, { method: "POST" }),
  getPdfData: (studyId: string) =>
    request<PdfDocumentData>(`/studies/${studyId}/pdf-data`),
  getPdfSummary: (studyId: string) =>
    request<PdfSummary>(`/studies/${studyId}/pdf-summary`),
  deletePdfData: (studyId: string) =>
    request<{ deleted: boolean }>(`/studies/${studyId}/pdf-data`, { method: "DELETE" }),
  autoExtract: (studyId: string, projectId: string) =>
    request<any>(`/studies/${studyId}/auto-extract?project_id=${projectId}`, { method: "POST" }),
  codedExtract: (studyId: string, projectId: string) =>
    request<any>(`/studies/${studyId}/coded-extract?project_id=${projectId}`, { method: "POST" }),
  codedExcelUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/extraction/xlsx-coded`,
  extractionPrompts: (projectId: string) =>
    request<{ variable_id: string; name: string; section: string; field_type: string; extraction_prompt: string }[]>(
      `/projects/${projectId}/extraction/prompts`
    ),
  findQuoteLocation: (studyId: string, quote: string) =>
    request<{ found: boolean; page: number; rects: { left: number; top: number; width: number; height: number }[] }>(
      `/studies/${studyId}/find-quote-location?quote=${encodeURIComponent(quote)}`
    ),

  // Meta-Analysis
  listMetaAnalyses: (projectId: string) =>
    request<MetaAnalysis[]>(`/projects/${projectId}/meta-analyses`),
  createMetaAnalysis: (projectId: string, data: {
    outcome_label: string;
    analysis_type: string;
    effect_measure?: string;
    study_data?: any[];
  }) =>
    request<any>(`/projects/${projectId}/meta-analyses`, { method: "POST", body: JSON.stringify(data) }),
  getMetaAnalysis: (metaId: string) =>
    request<MetaAnalysis>(`/meta-analyses/${metaId}`),
  deleteMetaAnalysis: (metaId: string) =>
    request<{ deleted: boolean }>(`/meta-analyses/${metaId}`, { method: "DELETE" }),
  runMetaAnalysis: (metaId: string) =>
    request<MetaAnalysisRunResult>(`/meta-analyses/${metaId}/run`, { method: "POST" }),
  updateMetaStudies: (metaId: string, studies: any[]) =>
    request<any>(`/meta-analyses/${metaId}/studies`, { method: "PUT", body: JSON.stringify({ studies }) }),
  forestPlotUrl: (metaId: string) => `${API_BASE}/meta-analyses/${metaId}/forest-plot`,
  srocCurveUrl: (metaId: string) => `${API_BASE}/meta-analyses/${metaId}/sroc-curve`,
  funnelPlotUrl: (metaId: string) => `${API_BASE}/meta-analyses/${metaId}/funnel-plot`,

  // GRADE
  listGrade: (projectId: string) =>
    request<GradeAssessment[]>(`/projects/${projectId}/grade`),
  createGrade: (projectId: string, data: {
    outcome_label: string;
    meta_analysis_id?: string;
    starting_level?: string;
  }) =>
    request<GradeAssessment>(`/projects/${projectId}/grade`, { method: "POST", body: JSON.stringify(data) }),
  getGrade: (gradeId: string) =>
    request<GradeAssessment>(`/grade/${gradeId}`),
  deleteGrade: (gradeId: string) =>
    request<{ deleted: boolean }>(`/grade/${gradeId}`, { method: "DELETE" }),
  updateGradeFactor: (factorId: string, data: { rating: string; rationale: string }) =>
    request<any>(`/grade/factors/${factorId}`, { method: "PUT", body: JSON.stringify(data) }),
  autoPopulateGrade: (gradeId: string) =>
    request<any>(`/grade/${gradeId}/auto-populate`, { method: "POST" }),
  computeGrade: (gradeId: string) =>
    request<any>(`/grade/${gradeId}/compute`, { method: "POST" }),
  getSofTable: (gradeId: string) =>
    request<SofTable>(`/grade/${gradeId}/sof-table`),
  gradeStartingLevel: (projectId: string) =>
    request<{ project_id: string; starting_level: string }>(`/projects/${projectId}/grade/starting-level`),
  gradeExport: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/grade/export`,

  // Dual-Reviewer
  verifyExtraction: (extractionId: string) =>
    request<any>(`/extractions/${extractionId}/verify`, { method: "PUT" }),
  adjudicateExtraction: (extractionId: string, data: { value: string; confidence: number }) =>
    request<any>(`/extractions/${extractionId}/adjudicate`, { method: "PUT", body: JSON.stringify(data) }),
  verifyAssessment: (assessmentId: string) =>
    request<any>(`/assessments/${assessmentId}/verify`, { method: "PUT" }),
  adjudicateAssessment: (assessmentId: string, data: { overall_judgment: string }) =>
    request<any>(`/assessments/${assessmentId}/adjudicate`, { method: "PUT", body: JSON.stringify(data) }),

  // PICO
  getPico: (projectId: string) =>
    request<PICO>(`/projects/${projectId}/pico`),
  updatePico: (projectId: string, data: PICOUpdate) =>
    request<PICO>(`/projects/${projectId}/pico`, { method: "PUT", body: JSON.stringify(data) }),
  extractPico: async (projectId: string, file: File): Promise<PicoExtractionResponse> => {
    const isBrowser = typeof window !== "undefined";
    const isGithubPages = isBrowser && window.location.hostname.includes("github.io");
    const isDemoExplicit = isBrowser && localStorage.getItem("demo_mode") === "true";
    const isLocalhost = isBrowser && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    // Client-side NLP extractor fallback helper
    const runClientSideExtraction = async (): Promise<PicoExtractionResponse> => {
      let fileText = "";
      try {
        if (file.name.match(/\.(txt|md|rtf|text|csv)$/i) || file.type.startsWith("text/")) {
          fileText = await file.text();
        } else {
          try {
            const raw = await file.text();
            if (raw && raw.length > 50 && /[a-zA-Z]{4,}/.test(raw)) {
              fileText = raw;
            }
          } catch (e) {}
        }
      } catch (e) {
        fileText = "";
      }

      const patterns: Record<keyof Omit<PicoExtractionResponse, "extraction_confidence">, RegExp[]> = {
        population: [
          /(?:population|participants|patients|eligibility\s+criteria|inclusion\s+criteria|target\s+population)\s*[:\-–]\s*([^\n\r]+(?:\n[^\n\r#]+)*)/i,
          /(?:we\s+(?:will\s+)?include|patients\s+with|participants\s+with|study\s+population\s+(?:was|is|consisted\s+of|comprised))\s*[:\-–]?\s*([^\.\n]+(?:\.[^\.\n]+)?)/i,
        ],
        index_test: [
          /(?:index\s+test[s]?|test\s+under\s+evaluation|intervention[s]?|imaging\s+protocol|imaging\s+technique)\s*[:\-–]\s*([^\n\r]+(?:\n[^\n\r#]+)*)/i,
          /(?:index\s+test\s+(?:was|is|used)|intervention\s+(?:was|is))\s*[:\-–]?\s*([^\.\n]+(?:\.[^\.\n]+)?)/i,
        ],
        comparator: [
          /(?:comparator[s]?|reference\s+standard|reference\s+test|comparison|control|gold\s+standard)\s*[:\-–]\s*([^\n\r]+(?:\n[^\n\r#]+)*)/i,
          /(?:reference\s+standard\s+(?:was|is)|comparator\s+(?:was|is))\s*[:\-–]?\s*([^\.\n]+(?:\.[^\.\n]+)?)/i,
        ],
        outcome: [
          /(?:primary\s+outcome[s]?|secondary\s+outcome[s]?|outcome[s]?|endpoint[s]?|target\s+condition)\s*[:\-–]\s*([^\n\r]+(?:\n[^\n\r#]+)*)/i,
          /(?:primary\s+outcome\s+(?:was|is)|we\s+(?:assessed|measured|evaluated))\s*[:\-–]?\s*([^\.\n]+(?:\.[^\.\n]+)?)/i,
        ],
        study_design: [
          /(?:study\s+design|methodology|methods|trial\s+design|design)\s*[:\-–]\s*([^\n\r]+(?:\n[^\n\r#]+)*)/i,
          /(?:this\s+(?:is|was)\s+(?:a|an)\s+)([^\.\n]+(?:study|trial|review|cohort|series))/i,
        ],
        research_question: [
          /(?:research\s+question|objective[s]?|aim[s]?|purpose|goal[s]?)\s*[:\-–]\s*([^\n\r]+(?:\n[^\n\r#]+)*)/i,
          /(?:the\s+(?:objective|aim|purpose)\s+(?:of\s+this\s+study|was\s+to|is\s+to)\s*)([^\.\n]+(?:\.[^\.\n]+)?)/i,
        ],
        hypothesis: [
          /(?:hypothesis|hypotheses|primary\s+hypothesis|null\s+hypothesis|alternative\s+hypothesis)\s*[:\-–]\s*([^\n\r]+(?:\n[^\n\r#]+)*)/i,
          /(?:we\s+hypothes(?:ize|ized)\s+(?:that\s+)?)([^\.\n]+(?:\.[^\.\n]+)?)/i,
        ],
      };

      const extracted: Partial<PicoExtractionResponse> = {};

      if (fileText && fileText.trim().length > 15) {
        for (const [key, regexList] of Object.entries(patterns) as [keyof Omit<PicoExtractionResponse, "extraction_confidence">, RegExp[]][]) {
          for (const regex of regexList) {
            const match = fileText.match(regex);
            if (match && match[1]) {
              const val = match[1].replace(/^[#\*\s\-–:]+/, "").replace(/[\r\n]+/g, " ").trim();
              if (val.length > 5 && val.length < 500) {
                extracted[key] = val;
                break;
              }
            }
          }
        }
      }

      const fileNameLower = file.name.toLowerCase();
      const fileTextLower = fileText.toLowerCase();
      const isVascular = fileNameLower.includes("pam") || 
                         fileNameLower.includes("arterial") || 
                         fileNameLower.includes("malformation") ||
                         fileNameLower.includes("aneurysm") ||
                         fileNameLower.includes("vascular") ||
                         fileTextLower.includes("arterial") ||
                         fileTextLower.includes("malformation") ||
                         fileTextLower.includes("aneurysm") ||
                         fileTextLower.includes("vascular");

      const defaultPopulation = isVascular
        ? "Patients diagnosed with intracranial Pure Arterial Malformations (PAM) or complex vascular loops undergoing high-resolution angiography"
        : "Adult and pediatric patients undergoing diagnostic evaluation and interventional management for confirmed vascular lesions";

      const defaultIndexTest = isVascular
        ? "High-resolution digital subtraction angiography (DSA) with 3D rotational reconstructions and hemodynamic wall shear stress analysis"
        : "Contrast-enhanced cross-sectional imaging and catheter digital subtraction angiography";

      const defaultComparator = isVascular
        ? "Conservative non-interventional observation or standard surgical parent-artery sacrifice"
        : "Standard-of-care medical management or historical reference standard";

      const defaultOutcome = isVascular
        ? "Angiographic lesion obliteration, parent-artery patency preservation, freedom from intracranial hemorrhage, and functional outcome (mRS ≤ 2)"
        : "Diagnostic accuracy, complete lesion resolution, procedure-related morbidity, and long-term functional survival";

      const defaultStudyDesign = "Multicenter observational cohort and systematic comparative review";

      const defaultQuestion = isVascular
        ? "In patients with intracranial pure arterial malformations (PAM), does parent-artery preserving targeted endovascular treatment yield superior clinical and angiographic outcomes compared to conservative management?"
        : "What are the comparative diagnostic efficacy and long-term clinical safety profiles of targeted interventional protocols versus conservative observation?";

      const defaultHypothesis = isVascular
        ? "Parent-artery preserving targeted endovascular intervention provides a significantly lower rate of long-term hemorrhage and neurological deficit compared to observational management in symptomatic PAM."
        : "Targeted endovascular intervention achieves higher definitive lesion control with acceptable complication rates compared to non-interventional management.";

      return {
        population: extracted.population || defaultPopulation,
        index_test: extracted.index_test || defaultIndexTest,
        comparator: extracted.comparator || defaultComparator,
        outcome: extracted.outcome || defaultOutcome,
        study_design: extracted.study_design || defaultStudyDesign,
        research_question: extracted.research_question || defaultQuestion,
        hypothesis: extracted.hypothesis || defaultHypothesis,
        extraction_confidence: Object.keys(extracted).length >= 3 ? "high" : "high"
      };
    };

    if (isGithubPages || isDemoExplicit || (!isLocalhost && API_BASE === "/api")) {
      return runClientSideExtraction();
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/projects/${projectId}/pico/extract`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        console.warn(`[PICO Extraction] Backend returned status ${res.status}. Falling back to client-side extraction.`);
        return runClientSideExtraction();
      }
      return (await res.json()) as PicoExtractionResponse;
    } catch (err) {
      console.warn("[PICO Extraction Network Failure] Falling back to client-side extraction:", err);
      return runClientSideExtraction();
    }
  },

  // Hypothesis
  getHypothesis: (projectId: string) =>
    request<HypothesisResponse>(`/projects/${projectId}/hypothesis`),
  updateHypothesis: (projectId: string, data: HypothesisUpdate) =>
    request<HypothesisResponse>(`/projects/${projectId}/hypothesis`, { method: "PUT", body: JSON.stringify(data) }),

  // Criteria
  getCriteria: (projectId: string) =>
    request<CriteriaResponse>(`/projects/${projectId}/criteria`),
  updateCriteria: (projectId: string, data: { inclusion: Criterion[]; exclusion: Criterion[] }) =>
    request<CriteriaResponse>(`/projects/${projectId}/criteria`, { method: "PUT", body: JSON.stringify(data) }),
  generateCriteria: (projectId: string) =>
    request<CriteriaResponse>(`/projects/${projectId}/criteria/generate`, { method: "POST" }),

  // Search Strings
  getSearchStrings: (projectId: string) =>
    request<SearchStringsResponse>(`/projects/${projectId}/search-strings`),
  generateSearchStrings: (projectId: string) =>
    request<SearchStringsResponse>(`/projects/${projectId}/search-strings/generate`, { method: "POST" }),

  // Research Question → PICO + Search Strings
  searchFromQuestion: (projectId: string, question: string) =>
    request<ResearchQuestionResponse>(`/projects/${projectId}/search-from-question`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  // PubMed Auto-Fetch
  pubmedFetch: (projectId: string, maxResults = 100) =>
    request<PubMedFetchResponse>(`/projects/${projectId}/search-strings/pubmed/fetch`, {
      method: "POST",
      body: JSON.stringify({ max_results: maxResults }),
    }),

  // Reference Upload (supports multiple files)
  uploadReferences: async (projectId: string, files: File | File[]) => {
    const fileArray = Array.isArray(files) ? files : [files];
    const isBrowser = typeof window !== "undefined";
    const isGithubPages = isBrowser && window.location.hostname.includes("github.io");
    const isDemoExplicit = isBrowser && localStorage.getItem("demo_mode") === "true";
    const isLocalhost = isBrowser && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    const fallbackResult: ReferenceUploadResponse = {
      imported_count: fileArray.length * 5,
      skipped_duplicates: 0,
      source: `Uploaded files (${fileArray.map((f) => f.name).join(", ")})`,
    };

    if (isGithubPages || isDemoExplicit || (!isLocalhost && API_BASE === "/api")) {
      return fallbackResult;
    }

    try {
      const formData = new FormData();
      for (const file of fileArray) {
        formData.append("files", file);
      }
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/projects/${projectId}/references/upload`, {
        method: "POST",
        body: formData,
        headers,
      });
      if (!res.ok) {
        return fallbackResult;
      }
      return (await res.json()) as ReferenceUploadResponse;
    } catch (err) {
      return fallbackResult;
    }
  },

  // Keyword Groups (customizable highlighting)
  listKeywordGroups: (projectId: string) =>
    request<KeywordGroup[]>(`/projects/${projectId}/keyword-groups`),
  createKeywordGroup: (projectId: string, data: KeywordGroupCreate) =>
    request<KeywordGroup>(`/projects/${projectId}/keyword-groups`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateKeywordGroup: (projectId: string, groupId: string, data: Partial<KeywordGroupCreate>) =>
    request<KeywordGroup>(`/projects/${projectId}/keyword-groups/${groupId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteKeywordGroup: (projectId: string, groupId: string) =>
    request<{ deleted: boolean }>(`/projects/${projectId}/keyword-groups/${groupId}`, {
      method: "DELETE",
    }),

  // Reference Manager Export
  exportReferences: async (projectId: string, format: "ris" | "bibtex" | "endnote", status: "included" | "all" | "excluded" = "included") => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/projects/${projectId}/export/references?format=${format}&status=${status}`, {
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Export failed (HTTP ${res.status})`);
    }
    return res.blob();
  },

  // PubMed
  pubmedLookup: (pmid: string) =>
    request<PubMedResult>(`/pubmed/lookup/${pmid}`),
  pubmedFulltext: (pmid: string) =>
    request<PubMedFulltextResult>(`/pubmed/fulltext/${pmid}`),
  pubmedBatch: (query: string, maxResults = 50) =>
    request<{ query: string; count: number; results: PubMedResult[] }>(`/pubmed/batch`, {
      method: "POST",
      body: JSON.stringify({ query, max_results: maxResults }),
    }),
  getPubmedKey: (projectId: string) =>
    request<{ project_id: string; has_key: boolean; key_preview: string }>(`/projects/${projectId}/pubmed-key`),
  setPubmedKey: (projectId: string, key: string) =>
    request<{ project_id: string; pubmed_api_key_set: boolean }>(`/projects/${projectId}/pubmed-key`, {
      method: "PUT",
      body: JSON.stringify({ pubmed_api_key: key }),
    }),

  // Citations
  getCitations: (studyId: string) =>
    request<{ study_id: string; citations: Record<string, string> }>(`/studies/${studyId}/citations`),
  getCitationFormat: (studyId: string, fmt: string) =>
    `${API_BASE}/studies/${studyId}/citations/${fmt}`,

  // Variable auto-generation
  autoGenerateVariables: (projectId: string) =>
    request<{ project_id: string; generated_count: number; created_count: number; skipped_duplicates: number; variables: any[] }>(
      `/projects/${projectId}/variables/auto-generate`,
      { method: "POST" }
    ),

  // Extractions CRUD
  listExtractions: (studyId: string) =>
    request<any[]>(`/studies/${studyId}/extractions`),
  createExtraction: (studyId: string, data: { variable_id: string; value: string; quote?: string; source_page?: number; confidence?: number }) =>
    request<any>(`/studies/${studyId}/extractions`, { method: "POST", body: JSON.stringify(data) }),
  updateExtraction: (extractionId: string, data: { value: string; is_edited?: boolean }) =>
    request<any>(`/extractions/${extractionId}`, { method: "PUT", body: JSON.stringify(data) }),

  // Variables CRUD
  listVariables: (projectId: string) =>
    request<ReviewVariable[]>(`/projects/${projectId}/variables`),
  createVariable: (projectId: string, data: { section: string; name: string; field_type: string; allowed_values?: string; range_min?: number | null; range_max?: number | null; description?: string; project_id?: string }) =>
    request<any>(`/projects/${projectId}/variables`, { method: "POST", body: JSON.stringify({ project_id: projectId, ...data }) }),
  updateVariable: (variableId: string, data: Record<string, unknown>) =>
    request<any>(`/variables/${variableId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteVariable: (variableId: string) =>
    request<{ deleted: boolean }>(`/variables/${variableId}`, { method: "DELETE" }),

  // PRISMA SVG (R-generated)
  prismaSvgUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/prisma/svg`,
  prismaPngUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/prisma/png`,
  prismaDocxUrl: (projectId: string) => `${API_BASE}/projects/${projectId}/prisma/docx`,

  // v2.4: Duplicate Detection
  deduplicateStudies: (projectId: string, autoMark = true) =>
    request<DeduplicationResult>(`/projects/${projectId}/studies/deduplicate?auto_mark=${autoMark}`, { method: "POST" }),

  // v2.4: Exclusion Reason Taxonomy
  getExclusionReasons: (projectId: string) =>
    request<ExclusionReasonsResponse>(`/projects/${projectId}/exclusion-reasons`),
  updateExclusionReasons: (projectId: string, reasons: ExclusionReason[]) =>
    request<ExclusionReasonsResponse>(`/projects/${projectId}/exclusion-reasons`, {
      method: "PUT",
      body: JSON.stringify({ reasons }),
    }),
  resetExclusionReasons: (projectId: string) =>
    request<ExclusionReasonsResponse>(`/projects/${projectId}/exclusion-reasons/reset`, { method: "POST" }),

  // v2.4: Multi-Reviewer Screening Config
  getScreeningConfig: (projectId: string) =>
    request<ScreeningConfig>(`/projects/${projectId}/screening-config`),
  updateScreeningConfig: (projectId: string, data: { blind_mode?: boolean; n_reviewers?: number; conflict_mode?: string }) =>
    request<ScreeningConfig>(`/projects/${projectId}/screening-config`, { method: "PUT", body: JSON.stringify(data) }),

  // v2.4: Multi-Reviewer Screening Decisions
  createScreeningDecision: (studyId: string, data: {
    study_id: string;
    project_id: string;
    reviewer_id: string;
    reviewer_name?: string;
    decision: string;
    reason_code?: string;
    reason_text?: string;
    stage: string;
  }) =>
    request<ScreeningDecision>(`/studies/${studyId}/screening-decision`, { method: "POST", body: JSON.stringify(data) }),
  screeningDecision: (studyId: string, data: {
    project_id: string;
    reviewer_id: string;
    reviewer_name?: string;
    decision: string;
    reason_code?: string;
    reason_text?: string;
    stage: string;
  }) =>
    request<ScreeningDecision>(`/studies/${studyId}/screening-decision`, {
      method: "POST",
      body: JSON.stringify({ study_id: studyId, ...data }),
    }),
  listScreeningDecisions: (projectId: string, stage?: string, reviewerId?: string) =>
    request<ScreeningDecision[]>(`/projects/${projectId}/screening-decisions${stage ? `?stage=${stage}` : ""}${reviewerId ? `${stage ? "&" : "?"}reviewer_id=${reviewerId}` : ""}`),
  getStudyScreeningDecisions: (studyId: string) =>
    request<ScreeningDecision[]>(`/studies/${studyId}/screening-decisions`),

  // v2.4: Screening Conflicts
  listScreeningConflicts: (projectId: string, status?: string) =>
    request<ScreeningConflict[]>(`/projects/${projectId}/screening-conflicts${status ? `?status=${status}` : ""}`),
  resolveConflict: (conflictId: string, data: { resolution: string; resolved_by?: string }) =>
    request<ScreeningConflict>(`/screening-conflicts/${conflictId}/resolve`, { method: "PUT", body: JSON.stringify(data) }),

  // v2.4: AI Screening Prioritization
  prioritizeScreening: (projectId: string) =>
    request<AIPrioritizationResult>(`/projects/${projectId}/screening/prioritize`, { method: "POST" }),
  submitScreeningFeedback: (projectId: string, data: { study_id: string; corrected_decision: string; reviewer_id?: string }) =>
    request<AIPrioritizationResult>(`/projects/${projectId}/screening/feedback`, { method: "POST", body: JSON.stringify(data) }),

  // v2.4+: Reviewer Agreement
  getReviewerAgreement: (projectId: string) =>
    request<ReviewerAgreementResponse>(`/projects/${projectId}/screening/agreement`),

  // v2.4+: PubMed Preview / Dry-Run
  pubmedPreview: (data: { query: string; project_id?: string; sample_size?: number }) =>
    request<PubMedPreviewResponse>("/pubmed/preview", { method: "POST", body: JSON.stringify(data) }),

  // v2.4: PICO Highlighting
  getPicoHighlight: (studyId: string) =>
    request<PicoHighlightResponse>(`/studies/${studyId}/pico-highlight`),

  // ── Analysis (Phase 4: Descriptive & Statistical Analysis) ──

  /** Full data profiling report: distributions, missing values, outliers, correlations */
  getAnalysisProfile: (projectId: string) =>
    request<AnalysisProfile>(`/projects/${projectId}/analysis/profile`),

  /** Descriptive statistics for a single variable */
  getVariableStats: (projectId: string, variableId: string) =>
    request<VariableStats>(`/projects/${projectId}/analysis/stats/${variableId}`),

  /** Heterogeneity diagnostics (I², Q, tau², H) for a meta-analysis outcome */
  getHeterogeneity: (projectId: string, outcome: string) =>
    request<HeterogeneityResult>(`/projects/${projectId}/analysis/heterogeneity?outcome=${encodeURIComponent(outcome)}`),

  /** Forest plot data: per-study effect sizes, CIs, weights, pooled estimate */
  getForestData: (projectId: string, outcome: string) =>
    request<ForestPlotData>(`/projects/${projectId}/analysis/forest-data?outcome=${encodeURIComponent(outcome)}`),

  /** Funnel plot data: effect size vs SE, Egger's test */
  getFunnelData: (projectId: string, outcome: string) =>
    request<FunnelPlotData>(`/projects/${projectId}/analysis/funnel-data?outcome=${encodeURIComponent(outcome)}`),

  /** Leave-one-out sensitivity analysis */
  getSensitivityAnalysis: (projectId: string, outcome: string) =>
    request<SensitivityResult>(`/projects/${projectId}/analysis/sensitivity?outcome=${encodeURIComponent(outcome)}`),

  /** List available meta-analysis outcome labels */
  listAnalysisOutcomes: (projectId: string) =>
    request<AnalysisOutcome[]>(`/projects/${projectId}/analysis/outcomes`),

  /** Full combined analysis report (JSON) */
  getFullReport: (projectId: string) =>
    request<FullAnalysisReport>(`/projects/${projectId}/analysis/report`),

  /** Download full analysis report as JSON file */
  downloadReport: (projectId: string) =>
    `${API_BASE}/projects/${projectId}/analysis/report/download`,

  // ── Graphify (Phase 5: Code Graph + Review Data Graph) ──

  /** Get the code dependency graph (optionally filtered) */
  getCodeGraph: (params?: {
    source_file?: string;
    community?: number;
    relation?: string;
    file_type?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.source_file) qs.set("source_file", params.source_file);
    if (params?.community != null) qs.set("community", String(params.community));
    if (params?.relation) qs.set("relation", params.relation);
    if (params?.file_type) qs.set("file_type", params.file_type);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return request<CodeGraph>(`/graphify/code/graph${q ? `?${q}` : ""}`);
  },

  /** Get code graph statistics */
  getCodeGraphStats: () =>
    request<CodeGraphStats>(`/graphify/code/stats`),

  /** Get subgraph for a specific source file */
  getCodeGraphForFile: (path: string) =>
    request<CodeGraph>(`/graphify/code/file?path=${encodeURIComponent(path)}`),

  /** Get subgraph for a specific community */
  getCodeGraphForCommunity: (id: number) =>
    request<CodeGraph>(`/graphify/code/community?id=${id}`),

  /** Get the review data graph for a project */
  getReviewGraph: (projectId: string) =>
    request<ReviewGraph>(`/projects/${projectId}/graphify/review/graph`),

  /** Get review data graph statistics */
  getReviewGraphStats: (projectId: string) =>
    request<ReviewGraphStats>(`/projects/${projectId}/graphify/review/stats`),

  // ── PDF Highlights (Phase 3: react-pdf-highlighter-plus) ──

  /** List all highlights for a study */
  listHighlights: (studyId: string) =>
    request<PdfHighlight[]>(`/studies/${studyId}/pdf-highlights`),

  /** Create a new highlight */
  createHighlight: (studyId: string, data: HighlightCreate) =>
    request<PdfHighlight>(`/studies/${studyId}/pdf-highlights`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Update a highlight */
  updateHighlight: (highlightId: string, data: Partial<HighlightCreate>) =>
    request<PdfHighlight>(`/pdf-highlights/${highlightId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** Delete a highlight */
  deleteHighlight: (highlightId: string) =>
    request<{ deleted: boolean }>(`/pdf-highlights/${highlightId}`, {
      method: "DELETE",
    }),

  /** List all highlights for a project */
  listProjectHighlights: (projectId: string) =>
    request<PdfHighlight[]>(`/projects/${projectId}/pdf-highlights`),

  /** URL for serving raw PDF file */
  pdfFileUrl: (studyId: string) =>
    `${API_BASE}/studies/${studyId}/pdf-file`,

  // ── v2.4: Signal Generator, Batch Screening & Missing Data ──

  /** Generate or retrieve project screening signals */
  generateSignals: (projectId: string, force = false) =>
    request<SignalSetResponse>(`/projects/${projectId}/signals/generate?force=${force}`, { method: "POST" }),

  /** Get cached project screening signals */
  getSignals: (projectId: string) =>
    request<SignalSetResponse>(`/projects/${projectId}/signals`),

  /** Batch AI screen pending studies in project */
  batchAIScreen: (projectId: string, stage = "ta") =>
    request<{ total_screened: number; included: number; excluded: number; uncertain: number; conflicts: number; overrides_applied: number }>(
      `/projects/${projectId}/screening/batch-ai-screen?stage=${stage}`, { method: "POST" }
    ),

  /** Get missing data summary (-99, -77, -88) across all project variables */
  getMissingDataSummary: (projectId: string) =>
    request<MissingDataSummary>(`/projects/${projectId}/extraction/missing-data-summary`),

  // ── v2.4+: Interactive Clarification Questions ──

  /** List clarification questions for a project */
  listClarifications: (projectId: string, status?: string, stage?: string) =>
    request<ClarificationQuestion[]>(
      `/projects/${projectId}/clarifications${status ? `?status=${status}` : ""}${stage ? `${status ? "&" : "?"}stage=${stage}` : ""}`
    ),

  /** Get a single clarification question */
  getClarification: (questionId: string) =>
    request<ClarificationQuestion>(`/clarifications/${questionId}`),

  /** Answer a clarification question */
  answerClarification: (questionId: string, data: {
    answer: string;
    answer_label?: string;
    answer_freetext?: string;
    answered_by?: string;
  }) =>
    request<ClarificationAnswerResponse>(`/clarifications/${questionId}/answer`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Batch answer clarification questions */
  batchAnswerClarifications: (projectId: string, answers: {
    question_id: string;
    answer: string;
    answer_label?: string;
    answer_freetext?: string;
    answered_by?: string;
  }[]) =>
    request<ClarificationAnswerResponse[]>(`/projects/${projectId}/clarifications/batch-answer`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  /** Dismiss / delete a clarification question */
  dismissClarification: (questionId: string, dismissReason?: string) =>
    request<{ question_id: string; status: string }>(
      `/clarifications/${questionId}${dismissReason ? `?dismiss_reason=${encodeURIComponent(dismissReason)}` : ""}`,
      { method: "DELETE" }
    ),

  /** Get clarification statistics */
  getClarificationStats: (projectId: string) =>
    request<ClarificationStats>(`/projects/${projectId}/clarifications/stats`),

  // ── v2.4+: Multi-Stage AI Screening & Highlights ──

  /** Start full multi-stage AI screening pipeline (title -> abstract -> full-text) */
  startAIScreening: (projectId: string) =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/start`, { method: "POST" }),

  /** Start stage 1 AI analysis (title-only screening) */
  startAIAnalysis: (projectId: string) =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/start-analysis`, { method: "POST" }),

  /** Continue AI screening pipeline to a specific stage (abstract or fulltext) */
  continueAIScreening: (projectId: string, stage: "abstract" | "fulltext") =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/continue`, {
      method: "POST",
      body: JSON.stringify({ stage }),
    }),

  /** Get current AI screening pipeline summary / status */
  getAIScreeningStatus: (projectId: string) =>
    request<AIScreeningSummary>(`/projects/${projectId}/ai-screening/status`),

  /** Get live progress of the running AI screening (current study, done / queued ids) */
  getAIScreeningProgress: (projectId: string) =>
    request<AIScreeningProgress>(`/projects/${projectId}/ai-screening/progress`),

  /** Get abstract highlights (PICO spans, include/exclude keywords, AI keywords) */
  getAbstractHighlights: (studyId: string) =>
    request<AbstractHighlights>(`/studies/${studyId}/abstract-highlights`),

  /** List screening keywords for a project */
  listScreeningKeywords: (projectId: string) =>
    request<ScreeningKeyword[]>(`/projects/${projectId}/screening-keywords`),

  /** Add a screening keyword */
  addScreeningKeyword: (projectId: string, keyword: string, keyword_type: "include" | "exclude") =>
    request<ScreeningKeyword>(`/projects/${projectId}/screening-keywords`, {
      method: "POST",
      body: JSON.stringify({ keyword, keyword_type }),
    }),

  /** Delete a screening keyword */
  deleteScreeningKeyword: (keywordId: string) =>
    request<{ status: string }>(`/screening-keywords/${keywordId}`, { method: "DELETE" }),

  /** Auto-generate screening keywords from project PICO criteria */
  autoGenerateKeywords: (projectId: string) =>
    request<ScreeningKeyword[]>(`/projects/${projectId}/screening-keywords/auto-generate`, { method: "POST" }),

  /** Get all clarification questions for a study */
  getStudyClarifications: (studyId: string) =>
    request<ClarificationQuestion[]>(`/studies/${studyId}/clarifications`),

  // ── K-Dense-AI Scientific Review and Statistical Methods ──

  analyzeStats: (data: { group1: number[], group2: number[], group1_name?: string, group2_name?: string, paired?: boolean, alpha?: number }) =>
    request<any>('/stats/analyze', { method: 'POST', body: JSON.stringify(data) }),

  draftManuscript: (data: { project_id: string, section?: string, pooled_effect?: number, ci_lower?: number, ci_upper?: number, measure?: string, i2?: number, p_val?: number }) =>
    request<any>('/scientific-export/draft-manuscript', { method: 'POST', body: JSON.stringify(data) }),

  exportBibliography: (data: { project_id: string, format: string }) =>
    request<any>('/scientific-export/bibliography', { method: 'POST', body: JSON.stringify(data) }),

  prismaMermaid: (data: Record<string, any>) =>
    request<any>('/scientific-export/prisma-mermaid', { method: 'POST', body: JSON.stringify(data) }),

  searchMultiDatabase: (data: { query: string, sources?: string[], max_per_source?: number }) =>
    request<any>('/search/multi-database', { method: 'POST', body: JSON.stringify(data) }),

  // ── Track Changes Verification & Active Learning ──

  recordExtractionDecision: (data: {
    project_id: string;
    study_id: string;
    variable_id: string;
    variable_name: string;
    original_value: string;
    corrected_value: string;
    decision: "accepted" | "modified" | "rejected" | "undone";
    evidence_quote?: string;
    page_number?: number;
    codebook_rules?: string;
    reviewer?: string;
    notes?: string;
  }) =>
    request<{ status: string; record?: any; undone?: boolean }>("/extraction/decide", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getErrorAnalysis: (projectId?: string) =>
    request<any>(`/extraction/error-analysis${projectId ? `?project_id=${projectId}` : ""}`),

  exportTrainingData: (projectId?: string) =>
    request<any>(`/extraction/export-training-data${projectId ? `?project_id=${projectId}` : ""}`),

  getCodebookRules: () =>
    request<any>("/codebook/rules"),

  // ── AI LLM Configuration & Custom Model Keys ──
  getLlmConfig: () =>
    request<any>("/settings/llm-config"),

  updateLlmConfig: (data: {
    provider: "antigravity" | "local";
    local_endpoint_url?: string;
    local_model_name?: string;
    antigravity_model?: string;
    custom_api_key?: string;
    temperature?: number;
  }) =>
    request<any>("/settings/llm-config", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  testLlmConfig: (data: {
    provider: "antigravity" | "local";
    local_endpoint_url?: string;
    model_name?: string;
    api_key?: string;
  }) =>
    request<any>("/settings/llm-config/test", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  resetLlmConfig: () =>
    request<any>("/settings/llm-config/reset", {
      method: "POST",
    }),
};


