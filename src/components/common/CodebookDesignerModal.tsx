import { useState, useId } from "react";
import {
  X, Plus, Trash2, Edit3, BookOpen, Check, Download, Upload,
  Sparkles, Sliders, Tag, HelpCircle, ShieldAlert, CheckCircle,
  FileText, Copy, RotateCcw, Save
} from "lucide-react";
import { type CodebookRule, DEMO_CODEBOOK_RULES, DEMO_VARIABLES } from "../../lib/demoData";
import { type ReviewVariable } from "../../lib/api";

interface CodebookDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCodebookUpdated?: (variables: ReviewVariable[], rules: Record<string, CodebookRule>) => void;
}

const PREDEFINED_TEMPLATES: Record<string, { name: string; description: string; rules: Record<string, CodebookRule>; variables: ReviewVariable[] }> = {
  pam_vascular: {
    name: "Pure Arterial Malformations (PAM) Protocol (Default)",
    description: "Angioarchitecture, aneurysm association, vessel involvement, and stroke outcomes in intracranial PAMs.",
    rules: DEMO_CODEBOOK_RULES,
    variables: DEMO_VARIABLES,
  },
  clinical_trial: {
    name: "RCT / Clinical Trial Systematic Review",
    description: "Standard Cochrane/PRISMA variables: Randomization, sample size, primary endpoint, effect size, and adverse events.",
    variables: [
      { variable_id: "v_sample_size", project_id: "proj_pam_current", name: "Sample Size", section: "Study Characteristics", order_index: 0, description: "Total randomized patient count" },
      { variable_id: "v_intervention", project_id: "proj_pam_current", name: "Intervention Arm", section: "Intervention", order_index: 1, description: "Experimental drug, device, or surgical treatment" },
      { variable_id: "v_comparator", project_id: "proj_pam_current", name: "Control / Comparator", section: "Intervention", order_index: 2, description: "Placebo, standard of care, or sham comparator" },
      { variable_id: "v_primary_endpoint", project_id: "proj_pam_current", name: "Primary Endpoint", section: "Outcomes", order_index: 3, description: "Pre-specified primary clinical efficacy outcome" },
      { variable_id: "v_adverse_events", project_id: "proj_pam_current", name: "Serious Adverse Events", section: "Safety", order_index: 4, description: "Incidence of grade 3-5 adverse events" },
    ],
    rules: {
      v_sample_size: {
        variable_id: "v_sample_size",
        name: "Sample Size",
        section: "Study Characteristics",
        field_type: "numeric",
        definition: "Total number of participants randomized across all study arms at trial inception (Intention-to-Treat population).",
        allowed_values: [],
        rules: ["Record total ITT enrolled count.", "If ITT is missing, record modified ITT or per-protocol count with notation."],
        gold_standard_example: "A total of 450 patients were randomized 1:1 to either the active drug group (n=225) or placebo (n=225).",
        exclusion_criteria: "Do not record screening phase enrollments who failed eligibility."
      },
      v_intervention: {
        variable_id: "v_intervention",
        name: "Intervention Arm",
        section: "Intervention",
        field_type: "categorical",
        definition: "Name, dose, schedule, and route of the primary investigational treatment.",
        allowed_values: ["Drug Pharmacotherapy", "Endovascular Device", "Surgical Reconstruction", "Targeted Biologic"],
        rules: ["Record exact molecule or device name and dose intensity."],
        gold_standard_example: "Patients received 100 mg orally once daily for 12 consecutive weeks.",
        exclusion_criteria: "Exclude adjuvant rescue medications."
      },
      v_comparator: {
        variable_id: "v_comparator",
        name: "Control / Comparator",
        section: "Intervention",
        field_type: "categorical",
        definition: "Control comparator regimen utilized for establishing relative efficacy.",
        allowed_values: ["Placebo", "Active Standard of Care", "Sham Control", "Best Supportive Care"],
        rules: ["Specify whether placebo was matched for appearance, taste, and administration schedule."],
        gold_standard_example: "Matching identical placebo capsules were administered according to the same dosing schedule.",
        exclusion_criteria: "Exclude unblinded open-label historical cohorts."
      },
      v_primary_endpoint: {
        variable_id: "v_primary_endpoint",
        name: "Primary Endpoint",
        section: "Outcomes",
        field_type: "text",
        definition: "The primary clinical efficacy outcome measure as defined in the statistical analysis plan.",
        allowed_values: ["All-Cause Mortality", "Functional Independence (mRS 0-2)", "Target Vessel Recanalization", "Progression-Free Survival"],
        rules: ["Record timepoint of primary assessment (e.g. 90 days, 12 months).", "Note whether hazard ratio, odds ratio, or mean difference was calculated."],
        gold_standard_example: "The primary outcome was functional independence at 90 days, defined as a modified Rankin Scale score of 0 to 2.",
        exclusion_criteria: "Do not extract secondary exploratory biomarkers as primary endpoints."
      },
      v_adverse_events: {
        variable_id: "v_adverse_events",
        name: "Serious Adverse Events",
        section: "Safety",
        field_type: "numeric",
        definition: "Rate or absolute count of life-threatening complications, re-hospitalizations, or fatal adverse occurrences.",
        allowed_values: [],
        rules: ["Distinguish treatment-emergent adverse events from pre-existing comorbidities."],
        gold_standard_example: "Serious adverse events occurred in 14 of 225 patients (6.2%) in the intervention group.",
        exclusion_criteria: "Exclude mild non-serious transient side effects (CTCAE Grade 1-2)."
      }
    }
  },
  radiology_diagnostic: {
    name: "Diagnostic Radiology & Neuro-Imaging Protocol",
    description: "Imaging modality, sensitivity, reference standard, reader blinding, and artifact verification.",
    variables: [
      { variable_id: "v_modality", project_id: "proj_pam_current", name: "Imaging Modality", section: "Technique", order_index: 0, description: "Primary diagnostic imaging technology used" },
      { variable_id: "v_contrast_used", project_id: "proj_pam_current", name: "Contrast Enhanced", section: "Technique", order_index: 1, description: "Whether intravascular contrast was administered" },
      { variable_id: "v_reference_standard", project_id: "proj_pam_current", name: "Reference Standard", section: "Methodology", order_index: 2, description: "Gold-standard verification test (e.g. catheter DSA, biopsy)" },
      { variable_id: "v_diagnostic_accuracy", project_id: "proj_pam_current", name: "Diagnostic Sensitivity / Specificity", section: "Accuracy", order_index: 3, description: "Calculated sensitivity, specificity, and AUC metrics" },
    ],
    rules: {
      v_modality: {
        variable_id: "v_modality",
        name: "Imaging Modality",
        section: "Technique",
        field_type: "categorical",
        definition: "Primary radiologic imaging technique utilized for initial identification and anatomical characterization.",
        allowed_values: ["Catheter DSA", "3T MRA / MRI", "CT Angiography (CTA)", "High-Resolution Vessel Wall MRI"],
        rules: ["Record magnetic field strength (e.g. 1.5T vs 3T) or multi-detector CT slice count."],
        gold_standard_example: "Biplane digital subtraction catheter angiography was performed using standard 4-French catheters.",
        exclusion_criteria: "Exclude non-radiologic diagnostic modalities."
      },
      v_contrast_used: {
        variable_id: "v_contrast_used",
        name: "Contrast Enhanced",
        section: "Technique",
        field_type: "categorical",
        definition: "Administration of non-ionic iodinated or gadolinium-based contrast media.",
        allowed_values: ["Yes (Iodinated)", "Yes (Gadolinium)", "No (Non-Contrast / TOF)", "Not Reported"],
        rules: ["Specify contrast brand, concentration, and injection rate if reported."],
        gold_standard_example: "Gadobutrol was injected at 0.1 mmol/kg with automated power injection at 2.0 mL/s.",
        exclusion_criteria: "Exclude oral contrast agents."
      },
      v_reference_standard: {
        variable_id: "v_reference_standard",
        name: "Reference Standard",
        section: "Methodology",
        field_type: "text",
        definition: "Definitive comparator diagnostic test against which index imaging was validated.",
        allowed_values: ["Catheter Digital Subtraction Angiography (DSA)", "Surgical Pathology / Histology", "Intraoperative Direct Inspection"],
        rules: ["Verify whether reference examiners were blinded to index test findings."],
        gold_standard_example: "All index findings were validated against subsequent biplane catheter DSA evaluated by two blinded neuroradiologists.",
        exclusion_criteria: "Exclude clinical follow-up alone when catheter angiography was not performed."
      },
      v_diagnostic_accuracy: {
        variable_id: "v_diagnostic_accuracy",
        name: "Diagnostic Sensitivity / Specificity",
        section: "Accuracy",
        field_type: "text",
        definition: "Statistical accuracy parameters including sensitivity, specificity, positive predictive value, and area under the ROC curve.",
        allowed_values: [],
        rules: ["Extract point estimates with 95% confidence intervals."],
        gold_standard_example: "The sensitivity was 94.2% (95% CI: 86.8–98.1%) and specificity was 91.5% (95% CI: 82.5–96.8%).",
        exclusion_criteria: "Do not extract subjective accuracy ratings without 2x2 contingency table backing."
      }
    }
  }
};

export function CodebookDesignerModal({
  isOpen,
  onClose,
  onCodebookUpdated
}: CodebookDesignerModalProps) {
  // Load saved state or default
  const [rules, setRules] = useState<Record<string, CodebookRule>>(() => {
    try {
      const saved = localStorage.getItem("radextract_codebook_rules");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEMO_CODEBOOK_RULES;
  });

  const [variables, setVariables] = useState<ReviewVariable[]>(() => {
    try {
      const saved = localStorage.getItem("radextract_variables");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEMO_VARIABLES;
  });

  const [selectedVarId, setSelectedVarId] = useState<string>(() => {
    return variables[0]?.variable_id || "v1_vessel_involved";
  });

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [newValueInput, setNewValueInput] = useState<string>("");
  const [newRuleInput, setNewRuleInput] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentRule = rules[selectedVarId];
  const currentVar = variables.find((v) => v.variable_id === selectedVarId);

  const categories = Array.from(new Set(variables.map((v) => v.section || "General")));

  const filteredVariables = selectedCategory === "all"
    ? variables
    : variables.filter((v) => (v.section || "General") === selectedCategory);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUpdateCurrentRule = (field: keyof CodebookRule, value: any) => {
    if (!currentRule) return;
    const updatedRule = { ...currentRule, [field]: value };
    const newRules = { ...rules, [selectedVarId]: updatedRule };
    setRules(newRules);

    // Also sync variable name or section if changed
    if (field === "name" || field === "section" || field === "definition") {
      const updatedVars = variables.map((v) => {
        if (v.variable_id === selectedVarId) {
          return {
            ...v,
            name: field === "name" ? value : v.name,
            section: field === "section" ? value : v.section,
            description: field === "definition" ? value : v.description,
          };
        }
        return v;
      });
      setVariables(updatedVars);
      persistChanges(updatedVars, newRules);
    } else {
      persistChanges(variables, newRules);
    }
  };

  const persistChanges = (newVars: ReviewVariable[], newRules: Record<string, CodebookRule>) => {
    try {
      localStorage.setItem("radextract_variables", JSON.stringify(newVars));
      localStorage.setItem("radextract_codebook_rules", JSON.stringify(newRules));
      if (onCodebookUpdated) onCodebookUpdated(newVars, newRules);
    } catch (e) {}
  };

  // Add new variable inside app
  const handleAddNewVariable = () => {
    const newId = `v_custom_${Date.now()}`;
    const newName = `Custom Variable ${variables.length + 1}`;
    const newSection = selectedCategory === "all" ? "Clinical" : selectedCategory;

    const newVar: ReviewVariable = {
      variable_id: newId,
      project_id: "proj_pam_current",
      name: newName,
      section: newSection,
      order_index: variables.length,
      description: "Define operational prompt and coding instructions for this variable.",
    };

    const newRule: CodebookRule = {
      variable_id: newId,
      name: newName,
      section: newSection,
      field_type: "categorical",
      definition: "Define operational prompt and extraction rules for this field.",
      allowed_values: ["Reported", "Absent", "Not Reported"],
      rules: ["Verify verbatim statement from study text before coding."],
      gold_standard_example: "Clear clinical documentation confirming this parameter.",
      exclusion_criteria: "Exclude unverified conjectures or retrospective assumptions.",
    };

    const newVars = [...variables, newVar];
    const newRules = { ...rules, [newId]: newRule };

    setVariables(newVars);
    setRules(newRules);
    setSelectedVarId(newId);
    persistChanges(newVars, newRules);
    showToast(`Added new variable "${newName}"`);
  };

  // Delete variable
  const handleDeleteVariable = (varId: string) => {
    if (variables.length <= 1) {
      alert("At least one variable must remain in the codebook.");
      return;
    }
    const newVars = variables.filter((v) => v.variable_id !== varId);
    const newRules = { ...rules };
    delete newRules[varId];

    setVariables(newVars);
    setRules(newRules);
    if (selectedVarId === varId) {
      setSelectedVarId(newVars[0]?.variable_id || "");
    }
    persistChanges(newVars, newRules);
    showToast("Variable removed from codebook");
  };

  // Load template
  const handleLoadTemplate = (templateKey: string) => {
    const tpl = PREDEFINED_TEMPLATES[templateKey];
    if (!tpl) return;
    if (confirm(`Load "${tpl.name}"? This will configure your codebook with standard extraction variables.`)) {
      setVariables(tpl.variables);
      setRules(tpl.rules);
      setSelectedVarId(tpl.variables[0]?.variable_id || "");
      persistChanges(tpl.variables, tpl.rules);
      showToast(`Loaded ${tpl.name}`);
    }
  };

  // Add allowed value chip
  const handleAddAllowedValue = () => {
    if (!newValueInput.trim() || !currentRule) return;
    const current = currentRule.allowed_values || [];
    if (!current.includes(newValueInput.trim())) {
      const updated = [...current, newValueInput.trim()];
      handleUpdateCurrentRule("allowed_values", updated);
    }
    setNewValueInput("");
  };

  // Remove allowed value chip
  const handleRemoveAllowedValue = (val: string) => {
    if (!currentRule) return;
    const updated = (currentRule.allowed_values || []).filter((v) => v !== val);
    handleUpdateCurrentRule("allowed_values", updated);
  };

  // Add rule item
  const handleAddRuleItem = () => {
    if (!newRuleInput.trim() || !currentRule) return;
    const updated = [...(currentRule.rules || []), newRuleInput.trim()];
    handleUpdateCurrentRule("rules", updated);
    setNewRuleInput("");
  };

  // Remove rule item
  const handleRemoveRuleItem = (idx: number) => {
    if (!currentRule) return;
    const updated = currentRule.rules.filter((_, i) => i !== idx);
    handleUpdateCurrentRule("rules", updated);
  };

  // Export codebook as JSON
  const handleExportJson = () => {
    const payload = {
      project_id: "proj_pam_current",
      created_at: new Date().toISOString(),
      variables,
      rules,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codebook_protocol_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Codebook exported as JSON");
  };

  // Import codebook JSON / CSV (Optional compatibility for users with external spreadsheets like in AIDE-Web)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (parsed.variables && parsed.rules) {
            setVariables(parsed.variables);
            setRules(parsed.rules);
            setSelectedVarId(parsed.variables[0]?.variable_id || "");
            persistChanges(parsed.variables, parsed.rules);
            showToast("Imported Codebook JSON successfully!");
            return;
          }
        }
        // Basic CSV parsing fallback
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length > 1) {
          const importedVars: ReviewVariable[] = [];
          const importedRules: Record<string, CodebookRule> = {};
          lines.slice(1).forEach((line, idx) => {
            const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
            const name = cols[0] || `Var_${idx + 1}`;
            const id = `v_import_${idx + 1}`;
            const section = cols[1] || "Clinical";
            const def = cols[2] || name;
            const values = cols[3] ? cols[3].split(";").map((v) => v.trim()) : [];

            importedVars.push({
              variable_id: id,
              project_id: "proj_pam_current",
              name,
              section,
              order_index: idx,
              description: def,
            });

            importedRules[id] = {
              variable_id: id,
              name,
              section,
              field_type: "categorical",
              definition: def,
              allowed_values: values,
              rules: ["Extract verified finding from paper."],
              gold_standard_example: "",
              exclusion_criteria: "",
            };
          });

          if (importedVars.length > 0) {
            setVariables(importedVars);
            setRules(importedRules);
            setSelectedVarId(importedVars[0].variable_id);
            persistChanges(importedVars, importedRules);
            showToast(`Imported ${importedVars.length} variables from CSV!`);
          }
        }
      } catch (err) {
        alert("Failed to parse file. Please verify CSV or JSON format.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-[#381A61] text-white px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#F9D14A]/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#7C4B73] rounded-xl">
              <Sliders className="h-5 w-5 text-[#F9D14A]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-[#FAF9F3]">In-App Protocol Codebook Designer</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#88A0DC]/25 text-[#FAF9F3] px-2 py-0.5 rounded-full border border-[#88A0DC]/40">
                  Built-In • No Upload Required
                </span>
              </div>
              <p className="text-xs text-[#88A0DC] mt-0.5">
                Define extraction variables, allowed standard options, and coding criteria inside the app itself.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Template Selector */}
            <select
              onChange={(e) => {
                if (e.target.value) handleLoadTemplate(e.target.value);
                e.target.value = "";
              }}
              className="text-xs bg-[#381A61] text-[#FAF9F3] border border-[#88A0DC]/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F9D14A]"
              defaultValue=""
            >
              <option value="" disabled>Load Protocol Template...</option>
              <option value="pam_vascular">Cerebrovascular PAM (Default)</option>
              <option value="clinical_trial">RCT / Clinical Trial Protocol</option>
              <option value="radiology_diagnostic">Diagnostic Radiology Protocol</option>
            </select>

            {/* Optional CSV/JSON Import (AIDE-Web compatibility) */}
            <label className="text-xs font-semibold text-[#FAF9F3] hover:text-white bg-[#381A61] hover:bg-[#7C4B73] border border-[#88A0DC]/40 px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 transition-colors">
              <Upload className="h-3.5 w-3.5 text-[#F9D14A]" />
              <span>Import</span>
              <input type="file" accept=".json,.csv" onChange={handleImportFile} className="hidden" />
            </label>

            {/* Export JSON */}
            <button
              onClick={handleExportJson}
              className="text-xs font-semibold text-[#FAF9F3] hover:text-white bg-[#381A61] hover:bg-[#7C4B73] border border-[#88A0DC]/40 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              title="Export Codebook to JSON"
            >
              <Download className="h-3.5 w-3.5 text-[#F9D14A]" />
              <span>Export</span>
            </button>

            <button
              onClick={onClose}
              className="text-[#88A0DC] hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 flex items-center justify-between text-xs font-medium text-emerald-800 animate-in fade-in duration-200">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              {toastMessage}
            </span>
          </div>
        )}

        {/* Modal Main Content: Split List & Editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Variable Catalog (35%) */}
          <div className="w-[35%] border-r border-slate-200 bg-slate-50 flex flex-col overflow-hidden">
            {/* Category Filter Pills & Add Button */}
            <div className="p-3 border-b border-slate-200 bg-white space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Variables ({filteredVariables.length})
                </span>
                <button
                  onClick={handleAddNewVariable}
                  className="px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1 shadow-xs transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Variable
                </button>
              </div>

              {/* Category Filter Scroll */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                    selectedCategory === "all"
                      ? "bg-indigo-100 text-indigo-800 font-bold"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === cat
                        ? "bg-indigo-100 text-indigo-800 font-bold"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Variables List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredVariables.map((v) => {
                const isSelected = v.variable_id === selectedVarId;
                const r = rules[v.variable_id];
                return (
                  <div
                    key={v.variable_id}
                    onClick={() => setSelectedVarId(v.variable_id)}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-300"
                        : "bg-white/70 border-slate-200 hover:bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {v.name}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {v.section || "General"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {r?.definition || v.description}
                    </p>
                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400">
                      <span>Type: <strong className="text-slate-600">{r?.field_type || "text"}</strong></span>
                      <span>{r?.allowed_values?.length ? `${r.allowed_values.length} options` : "Free text"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Variable Editor (65%) */}
          <div className="flex-1 overflow-y-auto p-6 bg-white space-y-5">
            {currentRule ? (
              <div className="space-y-5">
                {/* Variable Primary Settings */}
                <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                  <div className="space-y-1 flex-1 max-w-lg">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Variable Display Name
                    </label>
                    <input
                      type="text"
                      value={currentRule.name}
                      onChange={(e) => handleUpdateCurrentRule("name", e.target.value)}
                      className="text-base font-bold text-slate-900 w-full border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 py-1.5"
                    />
                  </div>

                  <button
                    onClick={() => handleDeleteVariable(selectedVarId)}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                    title="Delete variable from Codebook"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>

                {/* Section & Type Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Section / Domain
                    </label>
                    <input
                      type="text"
                      value={currentRule.section}
                      onChange={(e) => handleUpdateCurrentRule("section", e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      placeholder="e.g. Anatomy, Clinical, Outcomes"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Data Type
                    </label>
                    <select
                      value={currentRule.field_type}
                      onChange={(e) => handleUpdateCurrentRule("field_type", e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="categorical">Categorical (Allowed Values)</option>
                      <option value="numeric">Numeric (Integer/Float)</option>
                      <option value="text">Free Text / Narrative</option>
                      <option value="boolean">Boolean (Yes / No)</option>
                    </select>
                  </div>
                </div>

                {/* Operational Definition & LLM System Prompt */}
                <div>
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-indigo-500" />
                    Operational Definition & LLM Extraction Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={currentRule.definition}
                    onChange={(e) => handleUpdateCurrentRule("definition", e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-3 text-slate-700 leading-relaxed focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Provide explicit operational guidance for human reviewers and AI prompt injection..."
                  />
                </div>

                {/* Allowed Values / Controlled Vocabulary */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-emerald-600" />
                      Allowed Standard Values (Click to Choose in Verification)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {(currentRule.allowed_values || []).length} options configured
                    </span>
                  </div>

                  {/* Chips Cloud */}
                  <div className="flex flex-wrap gap-1.5 min-h-[36px]">
                    {(currentRule.allowed_values || []).map((val) => (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-slate-800 border border-slate-200 shadow-xs"
                      >
                        {val}
                        <button
                          type="button"
                          onClick={() => handleRemoveAllowedValue(val)}
                          className="hover:text-rose-600 p-0.5 rounded text-slate-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add New Value Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add standard option (e.g. 'Conservative', 'Endovascular')..."
                      value={newValueInput}
                      onChange={(e) => setNewValueInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAllowedValue();
                        }
                      }}
                      className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddAllowedValue}
                      className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>

                {/* Extraction Rules List */}
                <div>
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
                    Coding Rules & Criteria Guidelines
                  </label>
                  <div className="space-y-1.5 mb-2">
                    {(currentRule.rules || []).map((r, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-blue-600">•</span>
                          <span className="text-slate-700">{r}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRuleItem(idx)}
                          className="text-slate-400 hover:text-rose-600 p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add extraction guideline rule..."
                      value={newRuleInput}
                      onChange={(e) => setNewRuleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddRuleItem();
                        }
                      }}
                      className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddRuleItem}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                    >
                      Add Rule
                    </button>
                  </div>
                </div>

                {/* Literature Gold Standard & Exclusion Rule */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Gold-Standard Literature Example
                    </label>
                    <textarea
                      rows={2}
                      value={currentRule.gold_standard_example || ""}
                      onChange={(e) => handleUpdateCurrentRule("gold_standard_example", e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="Example verbatim quotation from medical literature..."
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-rose-800 flex items-center gap-1.5 mb-1">
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                      Exclusion / Disqualification Rule
                    </label>
                    <textarea
                      rows={2}
                      value={currentRule.exclusion_criteria || ""}
                      onChange={(e) => handleUpdateCurrentRule("exclusion_criteria", e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      placeholder="Explicit conditions where this field should NOT be extracted..."
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400 text-xs">
                Select a variable on the left or click "+ Add Variable" to create one.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#FAF9F3] border-t border-[#381A61]/15 px-6 py-3 flex items-center justify-between shrink-0">
          <span className="text-xs text-[#381A61]/70">
            Changes are saved live into your project and applied immediately across studies and verification views.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-[#381A61] hover:bg-[#381A61]/90 rounded-lg transition-colors flex items-center gap-1.5 border border-[#F9D14A]/30"
          >
            <Check className="h-4 w-4 text-[#F9D14A]" /> Done & Return to Extraction
          </button>
        </div>
      </div>
    </div>
  );
}
