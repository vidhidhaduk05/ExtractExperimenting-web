import { useState, useEffect, useMemo, useRef } from "react";
import {
  X, Plus, Trash2, Edit3, BookOpen, Check, Download, Upload,
  Sparkles, Sliders, Tag, HelpCircle, ShieldAlert, CheckCircle,
  FileText, Copy, RotateCcw, Save, GripVertical, ChevronUp, ChevronDown,
  AlertTriangle, Loader2, ArrowRight, ListOrdered, FileSpreadsheet
} from "lucide-react";
import { type CodebookRule, DEMO_CODEBOOK_RULES, DEMO_VARIABLES } from "../../lib/demoData";
import { api, type ReviewVariable } from "../../lib/api";

interface CodebookDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  onCodebookUpdated?: (variables: ReviewVariable[], rules: Record<string, CodebookRule>) => void;
}

interface ValidationIssue {
  index: number;
  type: "empty_name" | "duplicate_name";
  message: string;
}

interface DeleteConfirmationState {
  variableId: string;
  variableName: string;
  message: string;
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
      { variable_id: "v_study_id", project_id: "proj_pam_current", name: "Study ID", section: "Identification", order_index: 0, description: "Canonical study identifier (e.g. Smith 2024)", field_type: "text" },
      { variable_id: "v_year", project_id: "proj_pam_current", name: "Year", section: "Identification", order_index: 1, description: "Publication year", field_type: "numeric" },
      { variable_id: "v_author", project_id: "proj_pam_current", name: "Author", section: "Identification", order_index: 2, description: "First author surname", field_type: "text" },
      { variable_id: "v_country", project_id: "proj_pam_current", name: "Country", section: "Study Characteristics", order_index: 3, description: "Country where study took place", field_type: "text" },
      { variable_id: "v_sample_size", project_id: "proj_pam_current", name: "Sample size", section: "Study Characteristics", order_index: 4, description: "Total randomized patient count", field_type: "numeric" },
      { variable_id: "v_intervention", project_id: "proj_pam_current", name: "Intervention Arm", section: "Intervention", order_index: 5, description: "Experimental treatment", field_type: "categorical" },
      { variable_id: "v_comparator", project_id: "proj_pam_current", name: "Control / Comparator", section: "Intervention", order_index: 6, description: "Comparator or placebo", field_type: "categorical" },
      { variable_id: "v_primary_endpoint", project_id: "proj_pam_current", name: "Primary Endpoint", section: "Outcomes", order_index: 7, description: "Pre-specified primary clinical outcome", field_type: "text" },
    ],
    rules: {
      v_sample_size: {
        variable_id: "v_sample_size",
        name: "Sample size",
        section: "Study Characteristics",
        field_type: "numeric",
        definition: "Total number of participants randomized across all study arms (Intention-to-Treat population).",
        allowed_values: [],
        rules: ["Record total ITT enrolled count."],
        gold_standard_example: "A total of 450 patients were randomized 1:1 to either the active drug group (n=225) or placebo (n=225).",
        exclusion_criteria: "Do not record screening phase enrollments who failed eligibility."
      },
    }
  },
  radiology_diagnostic: {
    name: "Diagnostic Radiology & Neuro-Imaging Protocol",
    description: "Imaging modality, sensitivity, reference standard, reader blinding, and artifact verification.",
    variables: [
      { variable_id: "v_study_id", project_id: "proj_pam_current", name: "Study ID", section: "Identification", order_index: 0, description: "Study identifier", field_type: "text" },
      { variable_id: "v_modality", project_id: "proj_pam_current", name: "Imaging Modality", section: "Technique", order_index: 1, description: "Primary diagnostic imaging technology used", field_type: "categorical" },
      { variable_id: "v_contrast_used", project_id: "proj_pam_current", name: "Contrast Enhanced", section: "Technique", order_index: 2, description: "Whether intravascular contrast was administered", field_type: "categorical" },
      { variable_id: "v_reference_standard", project_id: "proj_pam_current", name: "Reference Standard", section: "Methodology", order_index: 3, description: "Gold-standard verification test (e.g. catheter DSA, biopsy)", field_type: "text" },
      { variable_id: "v_diagnostic_accuracy", project_id: "proj_pam_current", name: "Diagnostic Sensitivity / Specificity", section: "Accuracy", order_index: 4, description: "Calculated sensitivity, specificity metrics", field_type: "text" },
    ],
    rules: {}
  }
};

export function CodebookDesignerModal({
  isOpen,
  onClose,
  projectId,
  onCodebookUpdated
}: CodebookDesignerModalProps) {
  // Active modal tab
  const [activeTab, setActiveTab] = useState<"designer" | "bulk_import" | "templates">("designer");

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
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Bulk import state
  const [bulkInputMode, setBulkInputMode] = useState<"line_by_line" | "excel_header">("line_by_line");
  const [bulkText, setBulkText] = useState<string>("");
  const [bulkDefaultSection, setBulkDefaultSection] = useState<string>("General");
  const [bulkPreviewVariables, setBulkPreviewVariables] = useState<Array<{
    temp_id: string;
    name: string;
    field_type: string;
    section: string;
    description: string;
    allowed_values: string;
  }>>([]);

  // Deletion protection state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState | null>(null);

  // Drag and drop state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Fetch live project variables if projectId is provided
  useEffect(() => {
    if (!isOpen) return;
    if (projectId && projectId !== "demo") {
      setIsLoading(true);
      api.listVariables(projectId)
        .then((fetchedVars) => {
          if (fetchedVars && fetchedVars.length > 0) {
            // Sort by order_index ascending
            const sorted = [...fetchedVars].sort((a, b) => a.order_index - b.order_index);
            setVariables(sorted);
            setSelectedVarId(sorted[0]?.variable_id || "");
          }
        })
        .catch((err) => {
          console.warn("Failed to fetch project variables from backend:", err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, projectId]);

  // Validation issues in current variable list
  const validationIssues = useMemo<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = [];
    const seenNames = new Map<string, number>();

    variables.forEach((v, idx) => {
      const trimmed = (v.name || "").trim().toLowerCase();
      if (!trimmed) {
        issues.push({
          index: idx,
          type: "empty_name",
          message: `Variable #${idx + 1} has an empty name. Empty names cannot be saved.`
        });
      } else if (seenNames.has(trimmed)) {
        issues.push({
          index: idx,
          type: "duplicate_name",
          message: `Duplicate name detected: "${v.name}" appears at position #${seenNames.get(trimmed)! + 1} and #${idx + 1}. Each variable must have a unique name.`
        });
      } else {
        seenNames.set(trimmed, idx);
      }
    });

    return issues;
  }, [variables]);

  // Bulk parser & preview generator
  useEffect(() => {
    if (!bulkText.trim()) {
      setBulkPreviewVariables([]);
      return;
    }

    let parsedNames: string[] = [];
    if (bulkInputMode === "line_by_line") {
      parsedNames = bulkText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } else {
      // Horizontal Excel header row (tab or comma separated)
      const delimiter = bulkText.includes("\t") ? "\t" : (bulkText.includes(",") ? "," : "|");
      parsedNames = bulkText
        .split(delimiter)
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter((item) => item.length > 0);
    }

    const preview = parsedNames.map((name, idx) => {
      // Infer basic type from name
      let inferredType = "text";
      const lower = name.toLowerCase();
      if (lower.includes("year") || lower.includes("age") || lower.includes("size") || lower.includes("count") || lower.includes("score") || lower.includes("n_") || lower.includes("number")) {
        inferredType = "numeric";
      } else if (lower.includes("date") || lower.includes("time")) {
        inferredType = "date";
      } else if (lower.includes("is_") || lower.includes("has_") || lower.includes("present") || lower.includes("status")) {
        inferredType = "categorical";
      }

      return {
        temp_id: `temp_${Date.now()}_${idx}`,
        name,
        field_type: inferredType,
        section: bulkDefaultSection || "General",
        description: `Extraction for ${name}`,
        allowed_values: inferredType === "categorical" ? "Yes, No, Not Reported" : "",
      };
    });

    setBulkPreviewVariables(preview);
  }, [bulkText, bulkInputMode, bulkDefaultSection]);

  // Bulk preview validation
  const bulkValidationIssues = useMemo<ValidationIssue[]>(() => {
    const issues: ValidationIssue[] = [];
    const seen = new Set<string>();

    // Also check against existing variables if appending
    const existingNames = new Set(variables.map((v) => v.name.trim().toLowerCase()));

    bulkPreviewVariables.forEach((item, idx) => {
      const lower = item.name.trim().toLowerCase();
      if (!lower) {
        issues.push({
          index: idx,
          type: "empty_name",
          message: `Row #${idx + 1} has an empty name.`
        });
      } else if (seen.has(lower)) {
        issues.push({
          index: idx,
          type: "duplicate_name",
          message: `Duplicate name within pasted list: "${item.name}".`
        });
      } else if (existingNames.has(lower)) {
        issues.push({
          index: idx,
          type: "duplicate_name",
          message: `Variable "${item.name}" already exists in the project codebook.`
        });
      } else {
        seen.add(lower);
      }
    });

    return issues;
  }, [bulkPreviewVariables, variables]);

  if (!isOpen) return null;

  const currentRule = rules[selectedVarId];
  const currentVar = variables.find((v) => v.variable_id === selectedVarId);
  const categories = Array.from(new Set(variables.map((v) => v.section || "General")));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const persistChanges = async (newVars: ReviewVariable[], newRules: Record<string, CodebookRule>) => {
    try {
      localStorage.setItem("radextract_variables", JSON.stringify(newVars));
      localStorage.setItem("radextract_codebook_rules", JSON.stringify(newRules));
      if (onCodebookUpdated) onCodebookUpdated(newVars, newRules);

      // If attached to real backend project, sync reordering & edits
      if (projectId && projectId !== "demo") {
        const orderedIds = newVars.map((v) => v.variable_id);
        await api.reorderVariables(projectId, orderedIds);
      }
    } catch (e) {
      console.warn("Failed persisting changes:", e);
    }
  };

  // Reorder variables via Move Up / Move Down
  const handleMoveVariable = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= variables.length) return;

    const updated = [...variables];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Re-index order_index sequentially
    const reindexed = updated.map((v, idx) => ({ ...v, order_index: idx }));
    setVariables(reindexed);

    setIsSaving(true);
    try {
      await persistChanges(reindexed, rules);
      showToast(`Moved "${temp.name}" ${direction}`);
    } catch (err: any) {
      showToast(`Reorder failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Drag and Drop reordering handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === dropIndex) {
      setDraggedIdx(null);
      return;
    }

    const updated = [...variables];
    const [draggedItem] = updated.splice(draggedIdx, 1);
    updated.splice(dropIndex, 0, draggedItem);

    const reindexed = updated.map((v, idx) => ({ ...v, order_index: idx }));
    setVariables(reindexed);
    setDraggedIdx(null);

    setIsSaving(true);
    try {
      await persistChanges(reindexed, rules);
      showToast(`Moved "${draggedItem.name}" to position #${dropIndex + 1}`);
    } catch (err: any) {
      showToast(`Reorder failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Update current variable / rule fields
  const handleUpdateCurrentRule = async (field: keyof CodebookRule | "field_type", value: any) => {
    if (!currentRule || !currentVar) return;

    const updatedRule = { ...currentRule, [field]: value };
    const newRules = { ...rules, [selectedVarId]: updatedRule };
    setRules(newRules);

    const updatedVars = variables.map((v) => {
      if (v.variable_id === selectedVarId) {
        return {
          ...v,
          name: field === "name" ? value : v.name,
          section: field === "section" ? value : v.section,
          description: field === "definition" ? value : v.description,
          field_type: field === "field_type" ? value : v.field_type,
          allowed_values: field === "allowed_values" ? (Array.isArray(value) ? value.join(", ") : value) : v.allowed_values,
        };
      }
      return v;
    });

    setVariables(updatedVars);

    // Sync to backend if project exists
    if (projectId && projectId !== "demo") {
      try {
        await api.updateVariable(selectedVarId, {
          name: field === "name" ? value : currentVar.name,
          section: field === "section" ? value : currentVar.section,
          description: field === "definition" ? value : currentVar.description,
          field_type: field === "field_type" ? value : (currentVar.field_type || "text"),
          allowed_values: field === "allowed_values" ? (Array.isArray(value) ? value.join(", ") : value) : currentVar.allowed_values,
        });
      } catch (e) {
        console.warn("Failed backend variable update:", e);
      }
    }

    persistChanges(updatedVars, newRules);
  };

  // Add individual variable
  const handleAddNewVariable = async () => {
    const newName = `Variable ${variables.length + 1}`;
    const newSection = selectedCategory === "all" ? "General" : selectedCategory;
    const newIndex = variables.length;

    let newId = `v_${Date.now()}`;

    // Backend creation if connected
    if (projectId && projectId !== "demo") {
      try {
        const res = await api.createVariable(projectId, {
          name: newName,
          section: newSection,
          field_type: "text",
          description: `Extraction prompt for ${newName}`,
          order_index: newIndex,
        });
        if (res?.variable_id) {
          newId = res.variable_id;
        }
      } catch (err: any) {
        showToast(`Failed creating variable: ${err?.message || "Server error"}`);
        return;
      }
    }

    const newVar: ReviewVariable = {
      variable_id: newId,
      project_id: projectId || "proj_pam_current",
      name: newName,
      section: newSection,
      order_index: newIndex,
      field_type: "text",
      description: `Extraction prompt for ${newName}`,
    };

    const newRule: CodebookRule = {
      variable_id: newId,
      name: newName,
      section: newSection,
      field_type: "text",
      definition: `Define operational prompt and extraction rules for this field.`,
      allowed_values: [],
      rules: ["Verify verbatim statement from study text before coding."],
      gold_standard_example: "",
      exclusion_criteria: "",
    };

    const newVars = [...variables, newVar];
    const newRules = { ...rules, [newId]: newRule };

    setVariables(newVars);
    setRules(newRules);
    setSelectedVarId(newId);
    persistChanges(newVars, newRules);
    showToast(`Added new variable "${newName}" at position #${newVars.length}`);
  };

  // Delete variable with populated data protection
  const handleDeleteVariable = async (varId: string, force = false) => {
    if (variables.length <= 1) {
      alert("At least one variable must remain in the codebook.");
      return;
    }

    const targetVar = variables.find((v) => v.variable_id === varId);
    const varName = targetVar?.name || "this variable";

    if (projectId && projectId !== "demo") {
      try {
        const res = await api.deleteVariable(varId, force);
        if (res?.requires_confirmation && !force) {
          // Variable has populated extraction data! Prompt explicit confirmation
          setDeleteConfirmation({
            variableId: varId,
            variableName: varName,
            message: res.message || `Variable "${varName}" has existing extracted values across studies. Deleting it will permanently remove these extraction values. Do you want to proceed?`,
          });
          return;
        }
      } catch (err: any) {
        if (err?.message?.includes("409") || err?.requires_confirmation) {
          setDeleteConfirmation({
            variableId: varId,
            variableName: varName,
            message: `Variable "${varName}" has existing extracted values across studies. Deleting it will permanently remove these extraction values. Do you want to proceed?`,
          });
          return;
        }
        showToast(`Failed deleting variable: ${err?.message || "Unknown error"}`);
        return;
      }
    }

    // Perform removal from state
    const newVars = variables.filter((v) => v.variable_id !== varId).map((v, idx) => ({ ...v, order_index: idx }));
    const newRules = { ...rules };
    delete newRules[varId];

    setVariables(newVars);
    setRules(newRules);
    setDeleteConfirmation(null);

    if (selectedVarId === varId) {
      setSelectedVarId(newVars[0]?.variable_id || "");
    }

    await persistChanges(newVars, newRules);
    showToast(`Removed "${varName}" from codebook`);
  };

  // Apply bulk import preview into project variables
  const handleApplyBulkImport = async () => {
    if (bulkPreviewVariables.length === 0) return;
    if (bulkValidationIssues.length > 0) {
      alert("Please resolve the duplicate or empty name conflicts before saving.");
      return;
    }

    setIsSaving(true);
    try {
      const startIndex = variables.length;
      const createdVariables: ReviewVariable[] = [];
      const createdRules: Record<string, CodebookRule> = {};

      for (let i = 0; i < bulkPreviewVariables.length; i++) {
        const item = bulkPreviewVariables[i];
        let varId = `v_${Date.now()}_${i}`;

        if (projectId && projectId !== "demo") {
          const res = await api.createVariable(projectId, {
            name: item.name,
            section: item.section,
            field_type: item.field_type,
            allowed_values: item.allowed_values,
            description: item.description,
            order_index: startIndex + i,
          });
          if (res?.variable_id) {
            varId = res.variable_id;
          }
        }

        const newVar: ReviewVariable = {
          variable_id: varId,
          project_id: projectId || "proj_pam_current",
          name: item.name,
          section: item.section,
          order_index: startIndex + i,
          field_type: item.field_type,
          allowed_values: item.allowed_values,
          description: item.description,
        };

        const newRule: CodebookRule = {
          variable_id: varId,
          name: item.name,
          section: item.section,
          field_type: item.field_type,
          definition: item.description,
          allowed_values: item.allowed_values ? item.allowed_values.split(",").map((s) => s.trim()).filter(Boolean) : [],
          rules: ["Record verified evidence verbatim from study source."],
          gold_standard_example: "",
          exclusion_criteria: "",
        };

        createdVariables.push(newVar);
        createdRules[varId] = newRule;
      }

      const mergedVars = [...variables, ...createdVariables].map((v, idx) => ({ ...v, order_index: idx }));
      const mergedRules = { ...rules, ...createdRules };

      setVariables(mergedVars);
      setRules(mergedRules);
      setSelectedVarId(createdVariables[0]?.variable_id || mergedVars[0]?.variable_id || "");

      await persistChanges(mergedVars, mergedRules);

      // Reset bulk inputs and return to designer tab
      setBulkText("");
      setBulkPreviewVariables([]);
      setActiveTab("designer");
      showToast(`Successfully added ${createdVariables.length} variables in saved sequence!`);
    } catch (err: any) {
      showToast(`Failed bulk adding variables: ${err?.message || "Server error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Load predefined template
  const handleLoadTemplate = async (templateKey: string) => {
    const tpl = PREDEFINED_TEMPLATES[templateKey];
    if (!tpl) return;
    if (confirm(`Load "${tpl.name}"? This will set standard extraction variables in the authoritative saved sequence.`)) {
      setIsSaving(true);
      try {
        const reindexed = tpl.variables.map((v, idx) => ({ ...v, order_index: idx }));
        setVariables(reindexed);
        setRules(tpl.rules);
        setSelectedVarId(reindexed[0]?.variable_id || "");
        await persistChanges(reindexed, tpl.rules);
        setActiveTab("designer");
        showToast(`Loaded "${tpl.name}"`);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-[#ffffff] rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border border-[#d2c2cb] overflow-hidden">
        {/* Modal Top Bar - Master Theme Wine */}
        <div className="bg-[#3a0f34] text-[#fbf9f4] px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#3a0f34]/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#ffffff]/10 border border-[#ffffff]/20">
              <Sliders className="h-5 w-5 text-[#ffdea6]" />
            </div>
            <div>
              <h2 className="font-['Serifon_Editorial'] text-lg font-bold tracking-tight text-[#fbf9f4] flex items-center gap-2">
                Project Variable List & Extraction Codebook
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-[#ffdea6]" />}
              </h2>
              <p className="font-['Work_Sans'] text-xs text-[#d2c2cb]">
                One authoritative, ordered variable list governing spreadsheet columns, PDF workspace, and Excel exports.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab navigation */}
            <div className="flex bg-[#1a0017] p-1 rounded-lg border border-[#d2c2cb]/30">
              <button
                onClick={() => setActiveTab("designer")}
                className={`px-3 py-1.5 rounded-md text-xs font-['Work_Sans'] font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === "designer"
                    ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs border border-[#d2c2cb]/40"
                    : "text-[#d2c2cb] hover:text-[#fbf9f4]"
                }`}
              >
                <ListOrdered className="h-3.5 w-3.5" /> Ordered Designer ({variables.length})
              </button>
              <button
                onClick={() => setActiveTab("bulk_import")}
                className={`px-3 py-1.5 rounded-md text-xs font-['Work_Sans'] font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === "bulk_import"
                    ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs border border-[#d2c2cb]/40"
                    : "text-[#d2c2cb] hover:text-[#fbf9f4]"
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Quick Import / Paste
              </button>
              <button
                onClick={() => setActiveTab("templates")}
                className={`px-3 py-1.5 rounded-md text-xs font-['Work_Sans'] font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === "templates"
                    ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs border border-[#d2c2cb]/40"
                    : "text-[#d2c2cb] hover:text-[#fbf9f4]"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" /> Standard Protocols
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#d2c2cb] hover:text-[#ffffff] hover:bg-[#ffffff]/10 transition-colors ml-2"
              title="Close designer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toast / Notification Banner */}
        {toastMessage && (
          <div className="bg-[#ffdea6] text-[#7c5800] border-b border-[#d2c2cb] px-6 py-2 text-xs font-['Work_Sans'] font-bold flex items-center justify-between animate-in slide-in-from-top-1">
            <span className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-[#7c5800]" />
              {toastMessage}
            </span>
            <button onClick={() => setToastMessage(null)} className="text-[#7c5800] hover:text-[#3a0f34]">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Validation Issues Alert Banner */}
        {validationIssues.length > 0 && activeTab === "designer" && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-900 font-['Work_Sans'] flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Validation Attention Required:</span>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                {validationIssues.map((issue, idx) => (
                  <li key={idx}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* TAB 1: ORDERED DESIGNER */}
        {activeTab === "designer" && (
          <div className="flex-1 flex overflow-hidden bg-[#fbf9f4]">
            {/* Left Sidebar: Ordered Variables List with Drag Handles & Move Buttons */}
            <div className="w-80 border-r border-[#d2c2cb] flex flex-col bg-[#ffffff] shrink-0">
              {/* Category Filter & Add Controls */}
              <div className="p-3 border-b border-[#d2c2cb] bg-[#fbf9f4] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-['Work_Sans'] text-xs font-bold text-[#3a0f34]">
                    Sequence & Ordering
                  </span>
                  <button
                    onClick={handleAddNewVariable}
                    className="px-2.5 py-1 text-xs font-['Work_Sans'] font-bold rounded-lg bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Variable
                  </button>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`px-2 py-0.5 text-[11px] rounded-full font-['Work_Sans'] whitespace-nowrap transition-colors ${
                      selectedCategory === "all"
                        ? "bg-[#3a0f34] text-[#fbf9f4] font-bold"
                        : "bg-[#eee7ec] text-[#62535d] hover:bg-[#d2c2cb]"
                    }`}
                  >
                    All ({variables.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2 py-0.5 text-[11px] rounded-full font-['Work_Sans'] whitespace-nowrap transition-colors ${
                        selectedCategory === cat
                          ? "bg-[#3a0f34] text-[#fbf9f4] font-bold"
                          : "bg-[#eee7ec] text-[#62535d] hover:bg-[#d2c2cb]"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable List with Drag & Drop and Accessible Up/Down Controls */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {variables.map((v, idx) => {
                  const isSelected = v.variable_id === selectedVarId;
                  const isVisibleInFilter = selectedCategory === "all" || (v.section || "General") === selectedCategory;
                  if (!isVisibleInFilter) return null;

                  return (
                    <div
                      key={v.variable_id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      onClick={() => setSelectedVarId(v.variable_id)}
                      className={`group relative p-2.5 rounded-lg border transition-all cursor-pointer flex items-center gap-2 select-none ${
                        isSelected
                          ? "bg-[#ffdea6]/30 border-[#814d75] shadow-2xs"
                          : "bg-[#ffffff] border-[#d2c2cb] hover:border-[#814d75] hover:bg-[#fbf9f4]"
                      } ${draggedIdx === idx ? "opacity-40" : ""}`}
                    >
                      {/* Drag Handle */}
                      <div
                        className="cursor-grab text-[#d2c2cb] group-hover:text-[#814d75] p-0.5"
                        title="Drag to reorder variable sequence"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>

                      {/* Position Badge */}
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#eee7ec] text-[#4f444b] border border-[#d2c2cb]">
                        #{idx + 1}
                      </span>

                      {/* Variable Name and Section */}
                      <div className="flex-1 min-w-0">
                        <div className="font-['Work_Sans'] text-xs font-bold text-[#3a0f34] truncate">
                          {v.name || <span className="text-rose-500 italic">[Empty Name]</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-mono text-[#814d75] bg-[#814d75]/10 px-1.5 py-0.2 rounded">
                            {v.field_type || "text"}
                          </span>
                          <span className="text-[10px] text-[#62535d] truncate">
                            {v.section || "General"}
                          </span>
                        </div>
                      </div>

                      {/* Accessible Move Up / Down Buttons */}
                      <div className="flex flex-col gap-0.5 opacity-60 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveVariable(idx, "up");
                          }}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-[#eee7ec] disabled:opacity-20 text-[#4f444b]"
                          title="Move variable up in sequence"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveVariable(idx, "down");
                          }}
                          disabled={idx === variables.length - 1}
                          className="p-1 rounded hover:bg-[#eee7ec] disabled:opacity-20 text-[#4f444b]"
                          title="Move variable down in sequence"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteVariable(v.variable_id);
                        }}
                        className="p-1 rounded text-[#d2c2cb] hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete variable"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Sidebar Footer Information */}
              <div className="p-3 bg-[#fbf9f4] border-t border-[#d2c2cb] text-[11px] text-[#62535d] font-['Work_Sans']">
                Global sequence strictly defines column ordering in the spreadsheet and Excel exports.
              </div>
            </div>

            {/* Right Pane: Selected Variable Detailed Specifications */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#fbf9f4]">
              {currentVar && currentRule ? (
                <div className="max-w-3xl space-y-6">
                  {/* Variable Header Card */}
                  <div className="bg-[#ffffff] p-5 rounded-xl border border-[#d2c2cb] shadow-2xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#3a0f34] text-[#fbf9f4]">
                          Column #{variables.findIndex((v) => v.variable_id === currentVar.variable_id) + 1}
                        </span>
                        <span className="text-xs text-[#62535d]">
                          ID: <code className="font-mono bg-[#eee7ec] px-1.5 py-0.5 rounded text-[#4f444b]">{currentVar.variable_id}</code>
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteVariable(currentVar.variable_id)}
                        className="px-3 py-1 text-xs font-['Work_Sans'] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete Variable
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-['Work_Sans'] font-bold text-[#3a0f34] mb-1">
                          Variable Display Name *
                        </label>
                        <input
                          type="text"
                          value={currentVar.name}
                          onChange={(e) => handleUpdateCurrentRule("name", e.target.value)}
                          className="w-full text-sm font-bold font-['Work_Sans'] border border-[#d2c2cb] rounded-lg p-2.5 text-[#3a0f34] bg-[#ffffff] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                          placeholder="e.g. Sample size, Vessel Involved"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-['Work_Sans'] font-bold text-[#3a0f34] mb-1">
                          Section (Visual Grouping)
                        </label>
                        <input
                          type="text"
                          value={currentVar.section || "General"}
                          onChange={(e) => handleUpdateCurrentRule("section", e.target.value)}
                          className="w-full text-sm font-['Work_Sans'] border border-[#d2c2cb] rounded-lg p-2.5 text-[#3a0f34] bg-[#ffffff] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                          placeholder="e.g. Baseline Demographics, Outcomes"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-['Work_Sans'] font-bold text-[#3a0f34] mb-1">
                          Data Type
                        </label>
                        <select
                          value={currentVar.field_type || "text"}
                          onChange={(e) => handleUpdateCurrentRule("field_type", e.target.value)}
                          className="w-full text-sm font-['Work_Sans'] border border-[#d2c2cb] rounded-lg p-2.5 text-[#3a0f34] bg-[#ffffff] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                        >
                          <option value="text">Free Text (String)</option>
                          <option value="numeric">Numeric (Integer or Float)</option>
                          <option value="categorical">Categorical (Predefined Options)</option>
                          <option value="date">Date (YYYY-MM-DD)</option>
                          <option value="boolean">Boolean (Yes / No / True / False)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-['Work_Sans'] font-bold text-[#3a0f34] mb-1">
                          Extraction Instructions / Description
                        </label>
                        <input
                          type="text"
                          value={currentVar.description || ""}
                          onChange={(e) => handleUpdateCurrentRule("definition", e.target.value)}
                          className="w-full text-sm font-['Work_Sans'] border border-[#d2c2cb] rounded-lg p-2.5 text-[#3a0f34] bg-[#ffffff] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                          placeholder="Short instructions for human or Co-Scientist extraction"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Categorical Allowed Values Spec (if categorical) */}
                  {(currentVar.field_type === "categorical" || currentRule.field_type === "categorical") && (
                    <div className="bg-[#ffffff] p-5 rounded-xl border border-[#d2c2cb] shadow-2xs space-y-3">
                      <label className="block text-xs font-['Work_Sans'] font-bold text-[#3a0f34]">
                        Allowed Values (Dropdown Options in Spreadsheet & Excel)
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(currentRule.allowed_values || []).map((val, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-['Work_Sans'] font-semibold bg-[#ffdea6] text-[#7c5800] border border-[#ffdea6]"
                          >
                            {val}
                            <button
                              type="button"
                              onClick={() => {
                                const next = (currentRule.allowed_values || []).filter((_, i) => i !== idx);
                                handleUpdateCurrentRule("allowed_values", next);
                              }}
                              className="hover:text-rose-700"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newValueInput}
                          onChange={(e) => setNewValueInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newValueInput.trim()) {
                              e.preventDefault();
                              const next = [...(currentRule.allowed_values || []), newValueInput.trim()];
                              handleUpdateCurrentRule("allowed_values", next);
                              setNewValueInput("");
                            }
                          }}
                          className="flex-1 text-xs border border-[#d2c2cb] rounded-lg p-2 text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                          placeholder="Type option and press Enter (or click Add)..."
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newValueInput.trim()) {
                              const next = [...(currentRule.allowed_values || []), newValueInput.trim()];
                              handleUpdateCurrentRule("allowed_values", next);
                              setNewValueInput("");
                            }
                          }}
                          className="px-3 py-2 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] text-xs font-['Work_Sans'] font-bold rounded-lg"
                        >
                          Add Option
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Protocol Coding Rules & Gold Standard Examples */}
                  <div className="bg-[#ffffff] p-5 rounded-xl border border-[#d2c2cb] shadow-2xs space-y-4">
                    <h3 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34]">
                      Systematic Review Guidelines & Extraction Rules
                    </h3>

                    <div>
                      <label className="block text-xs font-['Work_Sans'] font-bold text-[#62535d] mb-1">
                        Gold-Standard Literature Example
                      </label>
                      <textarea
                        rows={2}
                        value={currentRule.gold_standard_example || ""}
                        onChange={(e) => handleUpdateCurrentRule("gold_standard_example", e.target.value)}
                        className="w-full text-xs font-['QuadraatSmallCaps'] border border-[#d2c2cb] rounded-lg p-2.5 text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                        placeholder="Verbatim example from medical literature illustrating ideal extraction..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-['Work_Sans'] font-bold text-[#62535d] mb-1">
                        Exclusion / Disqualification Rule
                      </label>
                      <textarea
                        rows={2}
                        value={currentRule.exclusion_criteria || ""}
                        onChange={(e) => handleUpdateCurrentRule("exclusion_criteria", e.target.value)}
                        className="w-full text-xs font-['QuadraatSmallCaps'] border border-[#d2c2cb] rounded-lg p-2.5 text-[#4f444b] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                        placeholder="Explicit conditions where this field should NOT be extracted..."
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-24 text-[#81737b] font-['Work_Sans'] text-xs">
                  Select a variable on the left or click "+ Add Variable" to create one.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: BULK IMPORT / PASTE (3 ENTRY METHODS) */}
        {activeTab === "bulk_import" && (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-[#fbf9f4] space-y-5">
            <div className="bg-[#ffffff] p-5 rounded-xl border border-[#d2c2cb] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-['Serifon_Editorial'] text-base font-bold text-[#3a0f34]">
                    Fast Variable Entry & Excel Header Row Parser
                  </h3>
                  <p className="font-['Work_Sans'] text-xs text-[#62535d]">
                    Quickly add multiple variables by typing or pasting one per line, or pasting an Excel header row.
                  </p>
                </div>

                <div className="flex bg-[#eee7ec] p-1 rounded-lg border border-[#d2c2cb]">
                  <button
                    onClick={() => setBulkInputMode("line_by_line")}
                    className={`px-3 py-1 text-xs font-['Work_Sans'] font-semibold rounded-md transition-all ${
                      bulkInputMode === "line_by_line"
                        ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs"
                        : "text-[#4f444b] hover:text-[#3a0f34]"
                    }`}
                  >
                    One Variable Per Line
                  </button>
                  <button
                    onClick={() => setBulkInputMode("excel_header")}
                    className={`px-3 py-1 text-xs font-['Work_Sans'] font-semibold rounded-md transition-all ${
                      bulkInputMode === "excel_header"
                        ? "bg-[#3a0f34] text-[#fbf9f4] shadow-xs"
                        : "text-[#4f444b] hover:text-[#3a0f34]"
                    }`}
                  >
                    Paste Horizontal Excel Header Row
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-['Work_Sans'] font-bold text-[#3a0f34] mb-1">
                  {bulkInputMode === "line_by_line"
                    ? "Type or Paste One Variable Per Line"
                    : "Paste Horizontal Excel Header Row (Tab or Comma Separated)"}
                </label>
                <textarea
                  rows={4}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={
                    bulkInputMode === "line_by_line"
                      ? "Study ID\nYear\nAuthor\nCountry\nSample size\nVessel Involved\nAneurysm Association\nMortality"
                      : "Study ID\tYear\tAuthor\tCountry\tSample size\tOutcome"
                  }
                  className="w-full font-mono text-xs border border-[#d2c2cb] rounded-lg p-3 text-[#3a0f34] bg-[#ffffff] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
                />
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs font-['Work_Sans'] font-bold text-[#62535d] mr-2">
                    Default Section:
                  </label>
                  <input
                    type="text"
                    value={bulkDefaultSection}
                    onChange={(e) => setBulkDefaultSection(e.target.value)}
                    className="text-xs font-['Work_Sans'] border border-[#d2c2cb] rounded-lg px-2.5 py-1 text-[#3a0f34]"
                    placeholder="General"
                  />
                </div>
              </div>
            </div>

            {/* Editable Preview Table Before Saving */}
            {bulkPreviewVariables.length > 0 && (
              <div className="bg-[#ffffff] p-5 rounded-xl border border-[#d2c2cb] shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34] flex items-center gap-2">
                      Editable Preview ({bulkPreviewVariables.length} variables detected)
                    </h4>
                    <p className="font-['Work_Sans'] text-xs text-[#62535d]">
                      Review and modify names, data types, and sections before committing to the project.
                    </p>
                  </div>

                  <button
                    onClick={handleApplyBulkImport}
                    disabled={bulkValidationIssues.length > 0 || isSaving}
                    className="px-4 py-2 bg-[#3a0f34] text-[#fbf9f4] font-['Work_Sans'] text-xs font-bold rounded-lg hover:bg-[#1a0017] disabled:opacity-50 transition-all flex items-center gap-2 shadow-xs"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Append {bulkPreviewVariables.length} Variables to Project
                  </button>
                </div>

                {bulkValidationIssues.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 font-['Work_Sans'] space-y-1">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-rose-600" /> Duplicate or Invalid Names:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {bulkValidationIssues.map((iss, i) => (
                        <li key={i}>{iss.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border border-[#d2c2cb] rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs font-['Work_Sans'] border-collapse">
                    <thead className="bg-[#fbf9f4] border-b border-[#d2c2cb] text-[#62535d]">
                      <tr>
                        <th className="p-2.5 w-16 text-center font-mono">Pos</th>
                        <th className="p-2.5">Variable Name</th>
                        <th className="p-2.5 w-40">Data Type</th>
                        <th className="p-2.5 w-44">Section</th>
                        <th className="p-2.5 w-16 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d2c2cb]">
                      {bulkPreviewVariables.map((item, idx) => (
                        <tr key={item.temp_id} className="hover:bg-[#fbf9f4]/50">
                          <td className="p-2 text-center font-mono text-[#62535d]">
                            #{variables.length + idx + 1}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const next = [...bulkPreviewVariables];
                                next[idx].name = e.target.value;
                                setBulkPreviewVariables(next);
                              }}
                              className="w-full border border-[#d2c2cb] rounded px-2 py-1 text-xs text-[#3a0f34] font-bold focus:outline-none focus:ring-1 focus:ring-[#814d75]"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={item.field_type}
                              onChange={(e) => {
                                const next = [...bulkPreviewVariables];
                                next[idx].field_type = e.target.value;
                                setBulkPreviewVariables(next);
                              }}
                              className="w-full border border-[#d2c2cb] rounded px-2 py-1 text-xs text-[#3a0f34]"
                            >
                              <option value="text">Free Text</option>
                              <option value="numeric">Numeric</option>
                              <option value="categorical">Categorical</option>
                              <option value="date">Date</option>
                              <option value="boolean">Boolean</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.section}
                              onChange={(e) => {
                                const next = [...bulkPreviewVariables];
                                next[idx].section = e.target.value;
                                setBulkPreviewVariables(next);
                              }}
                              className="w-full border border-[#d2c2cb] rounded px-2 py-1 text-xs text-[#3a0f34]"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setBulkPreviewVariables(bulkPreviewVariables.filter((_, i) => i !== idx));
                              }}
                              className="text-[#d2c2cb] hover:text-rose-600 p-1"
                              title="Remove item"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PREDEFINED PROTOCOLS */}
        {activeTab === "templates" && (
          <div className="flex-1 p-6 overflow-y-auto bg-[#fbf9f4] space-y-4">
            <h3 className="font-['Serifon_Editorial'] text-base font-bold text-[#3a0f34]">
              Predefined Systematic Review Protocols
            </h3>
            <p className="font-['Work_Sans'] text-xs text-[#62535d]">
              Initialize your project with standard variable sequences conforming to Cochrane, PRISMA, and neurovascular standards.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              {Object.entries(PREDEFINED_TEMPLATES).map(([key, tpl]) => (
                <div
                  key={key}
                  className="bg-[#ffffff] p-5 rounded-xl border border-[#d2c2cb] shadow-2xs hover:border-[#814d75] transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <h4 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34]">
                      {tpl.name}
                    </h4>
                    <p className="font-['Work_Sans'] text-xs text-[#62535d]">
                      {tpl.description}
                    </p>
                    <div className="pt-2">
                      <span className="text-[11px] font-mono text-[#814d75] font-bold">
                        {tpl.variables.length} configured variables
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tpl.variables.slice(0, 5).map((v) => (
                          <span
                            key={v.name}
                            className="text-[10px] bg-[#eee7ec] text-[#4f444b] px-2 py-0.5 rounded font-mono"
                          >
                            {v.name}
                          </span>
                        ))}
                        {tpl.variables.length > 5 && (
                          <span className="text-[10px] text-[#62535d] px-1 py-0.5">
                            +{tpl.variables.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleLoadTemplate(key)}
                    disabled={isSaving}
                    className="mt-4 w-full py-2 bg-[#ffffff] border border-[#d2c2cb] hover:bg-[#eee7ec] text-[#3a0f34] font-['Work_Sans'] text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Upload className="h-3.5 w-3.5 text-[#814d75]" /> Load Protocol Variables
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="bg-[#fbf9f4] border-t border-[#d2c2cb] px-6 py-3 flex items-center justify-between shrink-0">
          <span className="font-['Work_Sans'] text-xs text-[#62535d]">
            Total Project Variables: <strong className="text-[#3a0f34]">{variables.length}</strong> · Authoritative Sequence Active
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-['Work_Sans'] font-bold text-[#fbf9f4] bg-[#3a0f34] hover:bg-[#1a0017] rounded-lg transition-colors flex items-center gap-2 shadow-xs"
          >
            <Check className="h-4 w-4 text-[#ffdea6]" /> Done & Return to Workspace
          </button>
        </div>
      </div>

      {/* Populated Variable Deletion Explicit Confirmation Dialog */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-[#ffffff] rounded-xl border border-[#d2c2cb] shadow-2xl p-6 max-w-md w-full space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                <AlertTriangle className="h-6 w-6 text-rose-600" />
              </div>
              <h3 className="font-['Serifon_Editorial'] text-base font-bold text-[#3a0f34]">
                Confirm Variable Deletion
              </h3>
            </div>

            <p className="font-['Work_Sans'] text-xs text-[#4f444b] leading-relaxed">
              {deleteConfirmation.message}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="px-3.5 py-1.5 text-xs font-['Work_Sans'] font-semibold bg-[#ffffff] border border-[#d2c2cb] text-[#4f444b] hover:bg-[#eee7ec] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteVariable(deleteConfirmation.variableId, true)}
                className="px-4 py-1.5 text-xs font-['Work_Sans'] font-bold bg-rose-700 hover:bg-rose-800 text-white rounded-lg transition-colors"
              >
                Delete and Remove Extracted Values
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
