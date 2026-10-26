import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ReviewVariable,
  type ExtractionGridStudy,
  type ExtractionGridCell,
  type ExtractionGridResponse
} from "../lib/api";
import { DEMO_STUDIES, DEMO_VARIABLES, DEMO_EXTRACTIONS, type CodebookRule } from "../lib/demoData";
import {
  FileSpreadsheet, FileText, CheckCircle2, AlertCircle, ArrowLeft,
  Download, Eye, Check, X, Edit3, Sliders, Search, Filter,
  Sparkles, ExternalLink, RefreshCw, CheckCheck, ChevronRight,
  TrendingUp, Award, Layers, ShieldCheck, Tag, FolderPlus, Upload,
  Lock, Unlock, Plus, ChevronDown, ChevronUp, FileUp, Database, Save, Loader2, Table,
  ChevronLeft, Trash2, ArrowUpDown, Undo2, Redo2, Copy, FileCheck, HelpCircle
} from "lucide-react";
import { cn } from "../lib/utils";
import { CodebookDesignerModal } from "../components/common/CodebookDesignerModal";
import { UniversalBulkUploadModal } from "../components/common/UniversalBulkUploadModal";

export function ExtractionSheetPage() {
  const { projectId, studyId: routeStudyId } = useParams<{ projectId: string; studyId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Active study and selection params
  const queryStudyId = searchParams.get("study");
  const queryVarId = searchParams.get("var");

  // Designer and Bulk Modals
  const [showCodebookDesigner, setShowCodebookDesigner] = useState<boolean>(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState<boolean>(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "pending" | "missing">("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");

  // Selection & Keyboard Navigation State
  const [selectedCell, setSelectedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    rowIdx: number;
    colIdx: number;
    initialValue: string;
    currentValue: string;
  } | null>(null);

  // Undo & Redo History
  const [undoStack, setUndoStack] = useState<Array<{
    study_id: string;
    variable_id: string;
    prevValue: string;
    newValue: string;
  }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{
    study_id: string;
    variable_id: string;
    prevValue: string;
    newValue: string;
  }>>([]);

  // Save feedback state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Column Resizing & Dragging
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);

  // Editable Study Label inline state
  const [editingStudyLabelId, setEditingStudyLabelId] = useState<string | null>(null);
  const [studyLabelDraft, setStudyLabelDraft] = useState<string>("");

  // Inspect Side Panel toggle
  const [showInspectorPanel, setShowInspectorPanel] = useState<boolean>(true);

  // Grid container reference for keyboard capture
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const activeInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // ── 1. Fetch Authoritative Extraction Grid ──
  const {
    data: gridData,
    isLoading: isGridLoading,
    refetch: refetchGrid
  } = useQuery<ExtractionGridResponse>({
    queryKey: ["extraction-grid", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("Missing projectId");
      return await api.getExtractionGrid(projectId);
    },
    enabled: !!projectId,
  });

  // Extract variables in authoritative sequence
  const variables: ReviewVariable[] = useMemo(() => {
    if (gridData?.variables && gridData.variables.length > 0) {
      return [...gridData.variables].sort((a, b) => a.order_index - b.order_index);
    }
    if (projectId === "demo") {
      return [...DEMO_VARIABLES].sort((a, b) => a.order_index - b.order_index);
    }
    return [];
  }, [gridData, projectId]);

  // Extract studies
  const studies: ExtractionGridStudy[] = useMemo(() => {
    if (gridData?.studies && gridData.studies.length > 0) {
      return gridData.studies;
    }
    if (projectId === "demo") {
      return DEMO_STUDIES.map((s, idx) => ({
        study_id: s.study_id,
        study_label: (s as any).study_label || `${(s.authors || "Study").split(" ")[0]} ${(s as any).publication_year || 2024}`,
        title: s.title,
        authors: s.authors,
        publication_year: s.publication_year,
        journal: s.journal,
        doi: s.doi,
        pmid: s.pmid,
      }));
    }
    return [];
  }, [gridData, projectId]);

  // Live cells state map: cells[study_id][variable_id] -> ExtractionGridCell
  const [cellsMap, setCellsMap] = useState<Record<string, Record<string, ExtractionGridCell>>>({});

  useEffect(() => {
    const cellsData = gridData?.cells || (gridData as any)?.extractions;
    if (cellsData) {
      setCellsMap(cellsData);
    } else if (projectId === "demo") {
      const demoCells: Record<string, Record<string, any>> = {};
      DEMO_STUDIES.forEach((s) => {
        demoCells[s.study_id] = {};
        const exts = (DEMO_EXTRACTIONS as any)[s.study_id] || [];
        exts.forEach((e: any) => {
          if (e.variable_id) {
            demoCells[s.study_id][e.variable_id] = {
              extraction_id: e.extraction_id || `ext_${s.study_id}_${e.variable_id}`,
              value: e.value || "",
              confidence: e.confidence ?? 0.95,
              evidence_quote: e.quote || "",
              source_page: e.source_page || 1,
              is_verified: !!e.is_verified,
              is_edited: !!e.is_edited,
              verification_status: e.is_verified ? (e.is_edited ? "modified" : "verified") : "unverified",
              extraction_source: e.is_edited ? "manual" : "ai",
            };
          }
        });
      });
      setCellsMap(demoCells);
    }
  }, [gridData, projectId]);

  // Filter study rows based on search and status
  const filteredStudies = useMemo(() => {
    return studies.filter((study) => {
      // Search matching label, title, or authors
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesLabel = (study.study_label || "").toLowerCase().includes(q);
        const matchesTitle = (study.title || "").toLowerCase().includes(q);
        const matchesAuthor = (study.authors || "").toLowerCase().includes(q);
        if (!matchesLabel && !matchesTitle && !matchesAuthor) return false;
      }

      // Status filter
      if (statusFilter !== "all") {
        const studyCells = cellsMap[study.study_id] || {};
        const cellValues = variables.map((v) => studyCells[v.variable_id]);

        if (statusFilter === "verified") {
          const hasUnverified = cellValues.some((c) => !c || !c.is_verified);
          if (hasUnverified) return false;
        } else if (statusFilter === "pending") {
          const allVerified = cellValues.length > 0 && cellValues.every((c) => c && c.is_verified);
          if (allVerified) return false;
        } else if (statusFilter === "missing") {
          const hasMissing = cellValues.some((c) => !c || !c.value || c.value === "NR" || c.value === "-99");
          if (!hasMissing) return false;
        }
      }

      return true;
    });
  }, [studies, searchQuery, statusFilter, cellsMap, variables]);

  // Helper to get Excel column letters (A, B, C... Z, AA, AB...)
  const getColumnLetter = (colIndex: number): string => {
    let letter = "";
    let temp = colIndex;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  // Sync initial query params to cell selection
  useEffect(() => {
    if (queryStudyId && filteredStudies.length > 0) {
      const rowIdx = filteredStudies.findIndex((s) => s.study_id === queryStudyId);
      if (rowIdx !== -1) {
        let colIdx = 0;
        if (queryVarId && variables.length > 0) {
          const vIdx = variables.findIndex((v) => v.variable_id === queryVarId);
          if (vIdx !== -1) colIdx = vIdx;
        }
        setSelectedCell({ rowIdx, colIdx });
      }
    }
  }, [queryStudyId, queryVarId, filteredStudies, variables]);

  // ── Cell Value Upsert Handler ──
  const handleCommitCellValue = async (
    studyId: string,
    variableId: string,
    newValue: string,
    extraFields: Partial<ExtractionGridCell> = {}
  ) => {
    const existingCell = cellsMap[studyId]?.[variableId];
    const prevValue = existingCell?.value || "";

    if (prevValue === newValue && !extraFields.verification_status) {
      setEditingCell(null);
      return;
    }

    // Optimistically update local cellsMap
    const updatedCell: ExtractionGridCell = {
      extraction_id: existingCell?.extraction_id || `ext_${studyId}_${variableId}`,
      value: newValue,
      confidence: existingCell?.confidence ?? 1.0,
      evidence_quote: existingCell?.evidence_quote || "",
      source_page: existingCell?.source_page || 1,
      is_edited: true,
      is_verified: extraFields.verification_status === "verified" || extraFields.verification_status === "accepted" ? true : (existingCell?.is_verified ?? false),
      verification_status: extraFields.verification_status || (existingCell?.is_verified ? "modified" : "unverified"),
      extraction_source: "manual",
      ...extraFields,
    };

    setCellsMap((prev) => ({
      ...prev,
      [studyId]: {
        ...(prev[studyId] || {}),
        [variableId]: updatedCell,
      },
    }));

    // Add to Undo Stack
    setUndoStack((prev) => [...prev, { study_id: studyId, variable_id: variableId, prevValue, newValue }]);
    setRedoStack([]); // Clear redo stack on new edit

    setSaveStatus("saving");
    setSaveError(null);

    try {
      if (projectId && projectId !== "demo") {
        const res = await api.batchUpdateExtractions(projectId, [
          {
            study_id: studyId,
            variable_id: variableId,
            value: newValue,
            evidence_quote: updatedCell.evidence_quote,
            source_page: updatedCell.source_page ?? 1,
            confidence: updatedCell.confidence,
            verification_status: updatedCell.verification_status,
          },
        ]);

        if (res.failed_count > 0) {
          throw new Error("Server rejected cell edit");
        }
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err: any) {
      console.error("Save failure:", err);
      setSaveStatus("error");
      setSaveError(err?.message || "Failed to save cell to project database");
    } finally {
      setEditingCell(null);
    }
  };

  // ── Study Label Update Handler ──
  const handleSaveStudyLabel = async (studyId: string, newLabel: string) => {
    if (!newLabel.trim()) {
      setEditingStudyLabelId(null);
      return;
    }

    try {
      if (projectId && projectId !== "demo") {
        await api.updateStudy(studyId, { study_label: newLabel.trim() });
      }
      // Invalidate grid to refresh study labels
      queryClient.invalidateQueries({ queryKey: ["extraction-grid", projectId] });
      setFeedbackToast(`Updated label for study to "${newLabel.trim()}"`);
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch (err: any) {
      setSaveStatus("error");
      setSaveError(`Failed updating study label: ${err?.message || "Server error"}`);
    } finally {
      setEditingStudyLabelId(null);
    }
  };

  // ── Universal Undo System with Top-Right Small Loader ──
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoSuccess, setUndoSuccess] = useState(false);

  // ── Undo / Redo Actions ──
  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setIsUndoing(true);

    const existingCell = cellsMap[lastAction.study_id]?.[lastAction.variable_id];
    const currentValue = existingCell?.value || "";

    setRedoStack((prev) => [
      ...prev,
      { study_id: lastAction.study_id, variable_id: lastAction.variable_id, prevValue: currentValue, newValue: lastAction.prevValue },
    ]);

    try {
      await handleCommitCellValue(lastAction.study_id, lastAction.variable_id, lastAction.prevValue);
      setIsUndoing(false);
      setUndoSuccess(true);
      setTimeout(() => setUndoSuccess(false), 2000);
    } catch (e) {
      setIsUndoing(false);
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const nextAction = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));

    await handleCommitCellValue(nextAction.study_id, nextAction.variable_id, nextAction.newValue);
  };

  // ── Keyboard Navigation Inside Spreadsheet ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell) return;
      const { rowIdx, colIdx } = selectedCell;
      const numRows = filteredStudies.length;
      const numCols = variables.length;

      // When editing: Enter commits, Escape cancels, Tab moves next
      if (editingCell) {
        if (e.key === "Enter") {
          e.preventDefault();
          const study = filteredStudies[editingCell.rowIdx];
          const variable = variables[editingCell.colIdx];
          if (study && variable) {
            handleCommitCellValue(study.study_id, variable.variable_id, editingCell.currentValue);
          }
          // Move down
          if (rowIdx < numRows - 1) {
            setSelectedCell({ rowIdx: rowIdx + 1, colIdx });
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          setEditingCell(null);
        } else if (e.key === "Tab") {
          e.preventDefault();
          const study = filteredStudies[editingCell.rowIdx];
          const variable = variables[editingCell.colIdx];
          if (study && variable) {
            handleCommitCellValue(study.study_id, variable.variable_id, editingCell.currentValue);
          }
          // Move right or wrap to next line
          if (e.shiftKey) {
            if (colIdx > 0) setSelectedCell({ rowIdx, colIdx: colIdx - 1 });
            else if (rowIdx > 0) setSelectedCell({ rowIdx: rowIdx - 1, colIdx: numCols - 1 });
          } else {
            if (colIdx < numCols - 1) setSelectedCell({ rowIdx, colIdx: colIdx + 1 });
            else if (rowIdx < numRows - 1) setSelectedCell({ rowIdx: rowIdx + 1, colIdx: 0 });
          }
        }
        return;
      }

      // Outside edit mode:
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      // Arrow navigation
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (colIdx < numCols - 1) setSelectedCell({ rowIdx, colIdx: colIdx + 1 });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (colIdx > 0) setSelectedCell({ rowIdx, colIdx: colIdx - 1 });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (rowIdx < numRows - 1) setSelectedCell({ rowIdx: rowIdx + 1, colIdx });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (rowIdx > 0) setSelectedCell({ rowIdx: rowIdx - 1, colIdx });
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          if (colIdx > 0) setSelectedCell({ rowIdx, colIdx: colIdx - 1 });
          else if (rowIdx > 0) setSelectedCell({ rowIdx: rowIdx - 1, colIdx: numCols - 1 });
        } else {
          if (colIdx < numCols - 1) setSelectedCell({ rowIdx, colIdx: colIdx + 1 });
          else if (rowIdx < numRows - 1) setSelectedCell({ rowIdx: rowIdx + 1, colIdx: 0 });
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Start editing selected cell
        const study = filteredStudies[rowIdx];
        const variable = variables[colIdx];
        if (study && variable) {
          const val = cellsMap[study.study_id]?.[variable.variable_id]?.value || "";
          setEditingCell({ rowIdx, colIdx, initialValue: val, currentValue: val });
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Direct alphanumeric typing enters edit mode immediately
        const study = filteredStudies[rowIdx];
        const variable = variables[colIdx];
        if (study && variable) {
          setEditingCell({ rowIdx, colIdx, initialValue: "", currentValue: e.key });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCell, editingCell, filteredStudies, variables, cellsMap, undoStack, redoStack]);

  // Focus active editor input
  useEffect(() => {
    if (editingCell && activeInputRef.current) {
      activeInputRef.current.focus();
    }
  }, [editingCell]);

  // ── Rectangular Copy & Paste Compatible with Excel ──
  const handleCopy = useCallback(async () => {
    if (!selectedCell) return;
    const study = filteredStudies[selectedCell.rowIdx];
    const variable = variables[selectedCell.colIdx];
    if (!study || !variable) return;

    const val = cellsMap[study.study_id]?.[variable.variable_id]?.value || "";
    await navigator.clipboard.writeText(val);
    setFeedbackToast(`Copied "${val}" to clipboard`);
    setTimeout(() => setFeedbackToast(null), 2500);
  }, [selectedCell, filteredStudies, variables, cellsMap]);

  const handlePaste = useCallback(async (e?: React.ClipboardEvent) => {
    let text = "";
    if (e && e.clipboardData) {
      text = e.clipboardData.getData("text");
    } else {
      text = await navigator.clipboard.readText();
    }

    if (!text || !selectedCell) return;

    const rows = text.split(/\r?\n/).filter((r) => r.length > 0);
    const startRow = selectedCell.rowIdx;
    const startCol = selectedCell.colIdx;

    const batchUpdates: Array<{
      study_id: string;
      variable_id: string;
      value: string;
      confidence: number;
      verification_status: string;
    }> = [];

    const updatedCells = { ...cellsMap };

    for (let r = 0; r < rows.length; r++) {
      const targetRowIdx = startRow + r;
      if (targetRowIdx >= filteredStudies.length) break;
      const study = filteredStudies[targetRowIdx];

      const cols = rows[r].split("\t");
      for (let c = 0; c < cols.length; c++) {
        const targetColIdx = startCol + c;
        if (targetColIdx >= variables.length) break;
        const variable = variables[targetColIdx];
        const cellValue = cols[c].trim();

        // Validate categorical if allowed_values present
        const allowed = variable.allowed_values ? variable.allowed_values.split(",").map((s) => s.trim().toLowerCase()) : [];
        if (allowed.length > 0 && !allowed.includes(cellValue.toLowerCase())) {
          console.warn(`Pasted value "${cellValue}" is not in allowed values for ${variable.name}`);
        }

        batchUpdates.push({
          study_id: study.study_id,
          variable_id: variable.variable_id,
          value: cellValue,
          confidence: 1.0,
          verification_status: "unverified",
        });

        if (!updatedCells[study.study_id]) updatedCells[study.study_id] = {};
        updatedCells[study.study_id][variable.variable_id] = {
          extraction_id: `ext_${study.study_id}_${variable.variable_id}`,
          value: cellValue,
          confidence: 1.0,
          is_edited: true,
          is_verified: false,
          verification_status: "unverified",
          extraction_source: "manual",
        };
      }
    }

    setCellsMap(updatedCells);
    setSaveStatus("saving");

    try {
      if (projectId && projectId !== "demo") {
        await api.batchUpdateExtractions(projectId, batchUpdates);
      }
      setSaveStatus("saved");
      setFeedbackToast(`Pasted ${batchUpdates.length} cells successfully!`);
      setTimeout(() => {
        setSaveStatus("idle");
        setFeedbackToast(null);
      }, 3000);
    } catch (err: any) {
      setSaveStatus("error");
      setSaveError(`Paste batch failed: ${err?.message || "Server error"}`);
    }
  }, [selectedCell, filteredStudies, variables, cellsMap, projectId]);

  // Bind Ctrl+C and Ctrl+V globally when grid is focused
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (selectedCell && !editingCell) {
        handlePaste();
      }
    };
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [selectedCell, editingCell, handlePaste]);

  // ── Drag & Drop Column Headers to Persist Global Variable Order ──
  const handleColHeaderDragStart = (e: React.DragEvent, colIdx: number) => {
    setDraggedColIdx(colIdx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleColHeaderDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleColHeaderDrop = async (e: React.DragEvent, dropColIdx: number) => {
    e.preventDefault();
    if (draggedColIdx === null || draggedColIdx === dropColIdx) {
      setDraggedColIdx(null);
      return;
    }

    const updated = [...variables];
    const [draggedVar] = updated.splice(draggedColIdx, 1);
    updated.splice(dropColIdx, 0, draggedVar);

    const reorderedIds = updated.map((v) => v.variable_id);
    setDraggedColIdx(null);

    setSaveStatus("saving");
    try {
      if (projectId && projectId !== "demo") {
        await api.reorderVariables(projectId, reorderedIds);
      }
      // Invalidate grid query to propagate authoritative order
      await queryClient.invalidateQueries({ queryKey: ["extraction-grid", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["variables", projectId] });
      setSaveStatus("saved");
      setFeedbackToast(`Reordered "${draggedVar.name}" to column #${dropColIdx + 1}`);
      setTimeout(() => {
        setSaveStatus("idle");
        setFeedbackToast(null);
      }, 3000);
    } catch (err: any) {
      setSaveStatus("error");
      setSaveError(`Failed persisting column order: ${err?.message || "Server error"}`);
    }
  };

  // ── Bibliographic Metadata Prefill ──
  const handlePrefillBibliographic = async () => {
    const updates: Array<{
      study_id: string;
      variable_id: string;
      value: string;
      confidence: number;
      verification_status: string;
    }> = [];

    for (const study of studies) {
      for (const v of variables) {
        const nameLower = v.name.toLowerCase().trim();
        let prefillVal = "";

        if (nameLower === "year" || nameLower === "publication year") {
          prefillVal = study.publication_year ? String(study.publication_year) : "";
        } else if (nameLower === "author" || nameLower === "first author" || nameLower === "authors") {
          prefillVal = study.authors || "";
        } else if (nameLower === "doi") {
          prefillVal = study.doi || "";
        } else if (nameLower === "pmid") {
          prefillVal = study.pmid || "";
        } else if (nameLower === "journal") {
          prefillVal = study.journal || "";
        } else if (nameLower === "study id" || nameLower === "study label") {
          prefillVal = study.study_label || "";
        }

        if (prefillVal) {
          const current = cellsMap[study.study_id]?.[v.variable_id];
          // Do not overwrite verified values!
          if (!current || !current.is_verified) {
            updates.push({
              study_id: study.study_id,
              variable_id: v.variable_id,
              value: prefillVal,
              confidence: 0.99,
              verification_status: "verified",
            });
          }
        }
      }
    }

    if (updates.length === 0) {
      setFeedbackToast("No unverified bibliographic variables needed prefill.");
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

    setSaveStatus("saving");
    try {
      if (projectId && projectId !== "demo") {
        await api.batchUpdateExtractions(projectId, updates);
      }
      await queryClient.invalidateQueries({ queryKey: ["extraction-grid", projectId] });
      setSaveStatus("saved");
      setFeedbackToast(`Successfully prefilled ${updates.length} bibliographic values across studies!`);
      setTimeout(() => {
        setSaveStatus("idle");
        setFeedbackToast(null);
      }, 3500);
    } catch (err: any) {
      setSaveStatus("error");
      setSaveError(`Prefill failed: ${err?.message || "Server error"}`);
    }
  };

  // Active cell details for Inspector Panel
  const activeSelectedCellData = useMemo(() => {
    if (!selectedCell) return null;
    const study = filteredStudies[selectedCell.rowIdx];
    const variable = variables[selectedCell.colIdx];
    if (!study || !variable) return null;

    const cell = cellsMap[study.study_id]?.[variable.variable_id];
    return {
      study,
      variable,
      cell: cell || {
        extraction_id: `ext_${study.study_id}_${variable.variable_id}`,
        value: "",
        confidence: 0,
        evidence_quote: "",
        source_page: 1,
        is_verified: false,
        is_edited: false,
        verification_status: "unverified",
        extraction_source: "none",
      },
      colLetter: getColumnLetter(selectedCell.colIdx),
      rowNumber: selectedCell.rowIdx + 1,
    };
  }, [selectedCell, filteredStudies, variables, cellsMap]);

  return (
    <div className="flex flex-col h-screen bg-[#fbf9f4] overflow-hidden select-none font-['Work_Sans']">
      {/* ── TOP APPLICATION HEADER (Master Theme Wine #3a0f34) ── */}
      <header className="bg-[#3a0f34] text-[#fbf9f4] px-5 py-2.5 shrink-0 flex items-center justify-between border-b border-[#3a0f34]/80 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/studies`}
            className="text-xs font-semibold text-[#ffdea6] hover:text-[#fbf9f4] flex items-center gap-1.5 bg-[#ffffff]/10 hover:bg-[#ffffff]/20 px-3 py-1.5 rounded-lg border border-[#ffffff]/20 transition-colors shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Studies
          </Link>

          <div className="h-4 w-px bg-[#d2c2cb]/30" />

          <div>
            <h1 className="font-['Serifon_Editorial'] text-base font-bold text-[#fbf9f4] flex items-center gap-2 leading-none">
              <FileSpreadsheet className="h-4 w-4 text-[#ffdea6]" />
              Extraction Spreadsheet Workspace
            </h1>
            <p className="text-[11px] text-[#d2c2cb] font-['Work_Sans'] mt-0.5">
              One ordered variable list · {filteredStudies.length} Studies · {variables.length} Variables
            </p>
          </div>
        </div>

        {/* Center Live Save Feedback Indicator */}
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-[#ffdea6] bg-[#1a0017] px-3 py-1 rounded-full border border-[#d2c2cb]/30 animate-pulse font-mono font-bold">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving changes...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-300 bg-[#1a0017] px-3 py-1 rounded-full border border-emerald-500/40 font-mono font-bold">
              <Check className="h-3 w-3 text-emerald-400" /> Saved to Project Database
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1.5 text-xs text-rose-300 bg-rose-950 px-3 py-1 rounded-full border border-rose-600 font-mono font-bold">
              <AlertCircle className="h-3 w-3 text-rose-400" /> Save Error: {saveError || "Failed to commit"}
            </span>
          )}
        </div>

        {/* Right Tools & Exports */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo controls */}
          <div className="flex bg-[#1a0017] rounded-lg border border-[#d2c2cb]/30 p-0.5">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 text-[#d2c2cb] hover:text-[#fbf9f4] disabled:opacity-30 disabled:pointer-events-none rounded"
              title="Undo edit (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 text-[#d2c2cb] hover:text-[#fbf9f4] disabled:opacity-30 disabled:pointer-events-none rounded"
              title="Redo edit (Ctrl+Y)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Bibliographic Prefill */}
          <button
            onClick={handlePrefillBibliographic}
            className="px-3 py-1.5 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#ffffff]/10 hover:bg-[#ffffff]/20 text-[#fbf9f4] border border-[#ffffff]/20 transition-all flex items-center gap-1.5 shadow-2xs"
            title="Auto-prefill Year, Author, DOI, and Study ID from imported reference metadata"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#ffdea6]" /> Prefill Metadata
          </button>

          {/* Variable Designer Button */}
          <button
            onClick={() => setShowCodebookDesigner(true)}
            className="px-3 py-1.5 text-xs font-['Work_Sans'] font-bold rounded-lg bg-[#ffdea6] text-[#3a0f34] hover:bg-[#ffdea6]/90 transition-all flex items-center gap-1.5 shadow-xs"
            title="Open Variable Designer to configure, paste, or reorder project variables"
          >
            <Sliders className="h-3.5 w-3.5" /> Variable Designer
          </button>

          {/* Excel Exports Dropdown / Actions */}
          <a
            href={api.exportTemplateUrl(projectId || "demo")}
            download
            className="px-3 py-1.5 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#ffffff]/10 hover:bg-[#ffffff]/20 text-[#fbf9f4] border border-[#ffffff]/20 transition-all flex items-center gap-1.5 shadow-2xs"
            title="Download blank extraction template (.xlsx) with exact saved column sequence"
          >
            <Download className="h-3.5 w-3.5 text-[#ffdea6]" /> Blank Template (.xlsx)
          </a>

          <a
            href={api.exportProjectXlsxUrl(projectId || "demo")}
            download
            className="px-3 py-1.5 text-xs font-['Work_Sans'] font-bold rounded-lg bg-[#814d75] hover:bg-[#814d75]/90 text-[#fbf9f4] border border-[#d2c2cb]/40 transition-all flex items-center gap-1.5 shadow-xs"
            title="Download completed extraction results workbook (.xlsx) with linked Evidence sheet"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#ffdea6]" /> Completed Results (.xlsx)
          </a>
        </div>
      </header>

      {/* ── SUB-HEADER TOOLBAR (Search, Filters, Formula Bar Simulation) ── */}
      <div className="bg-[#fbf9f4] border-b border-[#d2c2cb] px-5 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Active Cell Coordinates Display (e.g. B2) */}
          <div className="flex items-center bg-[#ffffff] border border-[#d2c2cb] rounded-md px-2.5 py-1 shadow-2xs min-w-[70px] justify-center">
            <span className="font-mono text-xs font-bold text-[#3a0f34]">
              {activeSelectedCellData ? `${activeSelectedCellData.colLetter}${activeSelectedCellData.rowNumber}` : "—"}
            </span>
          </div>

          <div className="h-4 w-px bg-[#d2c2cb]" />

          {/* Active Cell Formula / Content Bar */}
          <div className="flex items-center gap-2 bg-[#ffffff] border border-[#d2c2cb] rounded-md px-3 py-1 w-96 max-w-lg shadow-2xs">
            <span className="font-serif italic text-xs text-[#814d75] font-bold">fx</span>
            <span className="text-xs font-mono text-[#4f444b] truncate">
              {editingCell ? editingCell.currentValue : (activeSelectedCellData?.cell.value || <span className="text-[#81737b] italic">[Empty cell]</span>)}
            </span>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#62535d]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search studies..."
              className="pl-8 pr-3 py-1 text-xs border border-[#d2c2cb] rounded-md bg-[#ffffff] text-[#3a0f34] focus:outline-none focus:ring-1 focus:ring-[#814d75] w-48 shadow-2xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs border border-[#d2c2cb] rounded-md bg-[#ffffff] px-2.5 py-1 text-[#3a0f34] focus:outline-none focus:ring-1 focus:ring-[#814d75] shadow-2xs"
          >
            <option value="all">All Statuses</option>
            <option value="verified">Verified Studies</option>
            <option value="pending">Pending Review</option>
            <option value="missing">Studies with Missing (NR)</option>
          </select>

          <button
            onClick={() => setShowInspectorPanel(!showInspectorPanel)}
            className={`px-2.5 py-1 text-xs font-semibold border rounded-md transition-colors flex items-center gap-1.5 ${
              showInspectorPanel
                ? "bg-[#814d75]/15 text-[#814d75] border-[#814d75]/40"
                : "bg-[#ffffff] text-[#62535d] border-[#d2c2cb] hover:bg-[#eee7ec]"
            }`}
            title="Toggle Cell Evidence & Details Inspector"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Inspector</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast Notification */}
      {feedbackToast && (
        <div className="bg-[#ffdea6] text-[#7c5800] border-b border-[#d2c2cb] px-5 py-1.5 text-xs font-bold flex items-center justify-between animate-in slide-in-from-top-1">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#7c5800]" /> {feedbackToast}
          </span>
          <button onClick={() => setFeedbackToast(null)} className="hover:text-[#3a0f34]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── MAIN WORKSPACE AREA: SPREADSHEET GRID + INSPECTOR PANEL ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Spreadsheet Table Container */}
        <div
          ref={gridContainerRef}
          className="flex-1 overflow-auto bg-[#ffffff] relative focus:outline-none"
          tabIndex={0}
        >
          {isGridLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-[#62535d] gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-[#814d75]" />
              <span className="text-xs font-semibold">Loading extraction spreadsheet grid...</span>
            </div>
          ) : variables.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-[#62535d] space-y-3">
              <FileSpreadsheet className="h-12 w-12 text-[#d2c2cb]" />
              <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34]">
                No Project Variables Configured
              </h3>
              <p className="text-xs max-w-md text-[#62535d]">
                Define your project's variables (e.g. Study ID, Year, Author, Country, Sample size) to build the spreadsheet column headers.
              </p>
              <button
                onClick={() => setShowCodebookDesigner(true)}
                className="px-4 py-2 bg-[#3a0f34] text-[#fbf9f4] font-bold text-xs rounded-lg hover:bg-[#1a0017] transition-all flex items-center gap-2 shadow-xs"
              >
                <Sliders className="h-4 w-4 text-[#ffdea6]" /> Configure Variables
              </button>
            </div>
          ) : (
            <table className="border-collapse table-fixed text-xs font-['Work_Sans'] w-max min-w-full">
              {/* ── FROZEN COLUMN HEADERS (Variables in Saved Sequence) ── */}
              <thead className="sticky top-0 z-20 bg-[#fbf9f4] border-b border-[#d2c2cb] shadow-xs">
                {/* Row 1: Column Letters (Excel style: A, B, C...) */}
                <tr className="border-b border-[#d2c2cb]/60 bg-[#eee7ec]/50 text-[10px] font-mono text-[#62535d]">
                  {/* Row number header corner */}
                  <th className="sticky left-0 z-30 bg-[#eee7ec] w-12 text-center p-1 border-r border-[#d2c2cb] select-none">
                    #
                  </th>
                  {/* Study ID Frozen Column Letter */}
                  <th className="sticky left-12 z-30 bg-[#eee7ec] w-48 text-center p-1 border-r border-[#d2c2cb] select-none">
                    A
                  </th>
                  {/* Variable Column Letters */}
                  {variables.map((v, vIdx) => (
                    <th
                      key={`col-letter-${v.variable_id}`}
                      className="text-center p-1 border-r border-[#d2c2cb] font-bold select-none min-w-[160px]"
                      style={{ width: columnWidths[v.variable_id] || 180 }}
                    >
                      {getColumnLetter(vIdx + 1)}
                    </th>
                  ))}
                </tr>

                {/* Row 2: Variable Names Across Data Headers in Saved Sequence */}
                <tr className="text-xs text-[#3a0f34]">
                  {/* Top-left corner cell */}
                  <th className="sticky left-0 z-30 bg-[#fbf9f4] w-12 text-center p-2.5 border-r border-[#d2c2cb] font-mono font-bold text-[#62535d] select-none">
                    Row
                  </th>

                  {/* Frozen Study ID Column Header */}
                  <th className="sticky left-12 z-30 bg-[#fbf9f4] w-48 text-left p-2.5 border-r border-[#d2c2cb] font-bold font-['Serifon_Editorial'] select-none">
                    <div className="flex items-center justify-between">
                      <span>Study ID (Label)</span>
                      <Lock className="h-3 w-3 text-[#814d75]" title="Frozen column" />
                    </div>
                  </th>

                  {/* Variables Column Headers with Drag & Drop Reordering */}
                  {variables.map((v, vIdx) => (
                    <th
                      key={v.variable_id}
                      draggable
                      onDragStart={(e) => handleColHeaderDragStart(e, vIdx)}
                      onDragOver={handleColHeaderDragOver}
                      onDrop={(e) => handleColHeaderDrop(e, vIdx)}
                      className={`p-2.5 border-r border-[#d2c2cb] text-left font-bold font-['Serifon_Editorial'] select-none transition-colors cursor-grab active:cursor-grabbing hover:bg-[#ffdea6]/30 ${
                        draggedColIdx === vIdx ? "opacity-30 bg-[#eee7ec]" : ""
                      }`}
                      style={{ width: columnWidths[v.variable_id] || 180 }}
                      title="Drag header to reorder global saved variable sequence"
                    >
                      <div className="flex items-center justify-between">
                        <div className="truncate">
                          <span className="block truncate text-[#3a0f34]">{v.name}</span>
                          <span className="text-[10px] font-['Work_Sans'] font-normal text-[#62535d] truncate block">
                            {v.section || "General"} · <span className="font-mono text-[#814d75]">{v.field_type || "text"}</span>
                          </span>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── TABLE BODY: ONE ROW PER STUDY ── */}
              <tbody className="divide-y divide-[#d2c2cb]">
                {filteredStudies.map((study, rowIdx) => {
                  const isStudySelected = selectedCell?.rowIdx === rowIdx;

                  return (
                    <tr
                      key={study.study_id}
                      className={`hover:bg-[#fbf9f4]/70 transition-colors ${
                        isStudySelected ? "bg-[#ffdea6]/10" : ""
                      }`}
                    >
                      {/* Frozen Row Number */}
                      <td className="sticky left-0 z-10 bg-[#fbf9f4] text-center p-2 border-r border-[#d2c2cb] font-mono text-[11px] text-[#62535d] select-none font-bold">
                        {rowIdx + 1}
                      </td>

                      {/* Frozen Study ID Column (Editable Label e.g. "Smith 2024") */}
                      <td
                        className={`sticky left-12 z-10 bg-[#ffffff] p-2 border-r border-[#d2c2cb] font-['Work_Sans'] text-xs font-bold text-[#3a0f34] select-none ${
                          isStudySelected ? "bg-[#fbf9f4]" : ""
                        }`}
                        onDoubleClick={() => {
                          setEditingStudyLabelId(study.study_id);
                          setStudyLabelDraft(study.study_label || "");
                        }}
                      >
                        {editingStudyLabelId === study.study_id ? (
                          <input
                            type="text"
                            value={studyLabelDraft}
                            autoFocus
                            onChange={(e) => setStudyLabelDraft(e.target.value)}
                            onBlur={() => handleSaveStudyLabel(study.study_id, studyLabelDraft)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveStudyLabel(study.study_id, studyLabelDraft);
                              else if (e.key === "Escape") setEditingStudyLabelId(null);
                            }}
                            className="w-full text-xs font-bold border border-[#814d75] rounded px-1.5 py-0.5 outline-none bg-white text-[#3a0f34]"
                          />
                        ) : (
                          <div className="flex items-center justify-between group">
                            <span className="truncate" title={`Internal ID: ${study.study_id}`}>
                              {study.study_label || study.title.slice(0, 24)}
                            </span>
                            <button
                              onClick={() => {
                                setEditingStudyLabelId(study.study_id);
                                setStudyLabelDraft(study.study_label || "");
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-[#814d75] hover:text-[#3a0f34]"
                              title="Edit user-facing Study ID label"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Configured Variable Extraction Cells */}
                      {variables.map((v, colIdx) => {
                        const cell = cellsMap[study.study_id]?.[v.variable_id];
                        const cellVal = cell?.value || "";
                        const isSelected = selectedCell?.rowIdx === rowIdx && selectedCell?.colIdx === colIdx;
                        const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === colIdx;
                        const isVerified = cell?.is_verified;

                        // Missing codes conventions: -99 Not Reported, -77 N/A, -88 Contradictory
                        const isMissing = cellVal === "-99" || cellVal === "NR" || cellVal === "-77" || cellVal === "-88";

                        return (
                          <td
                            key={v.variable_id}
                            onClick={() => setSelectedCell({ rowIdx, colIdx })}
                            onDoubleClick={() => {
                              setSelectedCell({ rowIdx, colIdx });
                              setEditingCell({ rowIdx, colIdx, initialValue: cellVal, currentValue: cellVal });
                            }}
                            className={`p-2 border-r border-[#d2c2cb] relative font-['Work_Sans'] text-xs transition-colors cursor-cell ${
                              isSelected
                                ? "outline-2 outline-[#814d75] outline-offset-[-2px] z-10 bg-[#ffdea6]/20"
                                : "hover:bg-[#fbf9f4]"
                            } ${isMissing ? "bg-[#eee7ec]/60" : ""}`}
                            style={{ width: columnWidths[v.variable_id] || 180 }}
                          >
                            {isEditing ? (
                              v.field_type === "categorical" && v.allowed_values ? (
                                <select
                                  ref={activeInputRef as any}
                                  value={editingCell.currentValue}
                                  onChange={(e) => setEditingCell({ ...editingCell, currentValue: e.target.value })}
                                  onBlur={() => handleCommitCellValue(study.study_id, v.variable_id, editingCell.currentValue)}
                                  className="w-full text-xs border border-[#814d75] rounded px-1.5 py-0.5 outline-none bg-white text-[#3a0f34]"
                                >
                                  <option value="">-- Select --</option>
                                  {v.allowed_values.split(",").map((opt) => (
                                    <option key={opt.trim()} value={opt.trim()}>
                                      {opt.trim()}
                                    </option>
                                  ))}
                                  <option value="NR">-99 (Not Reported)</option>
                                  <option value="NA">-77 (Not Applicable)</option>
                                </select>
                              ) : (
                                <input
                                  ref={activeInputRef as any}
                                  type={v.field_type === "numeric" ? "number" : "text"}
                                  value={editingCell.currentValue}
                                  onChange={(e) => setEditingCell({ ...editingCell, currentValue: e.target.value })}
                                  onBlur={() => handleCommitCellValue(study.study_id, v.variable_id, editingCell.currentValue)}
                                  className="w-full text-xs border border-[#814d75] rounded px-1.5 py-0.5 outline-none bg-white text-[#3a0f34]"
                                />
                              )
                            ) : (
                              <div className="flex items-center justify-between gap-1">
                                <span className={`truncate font-['Work_Sans'] ${
                                  !cellVal ? "text-transparent" : (isMissing ? "text-[#81737b] italic font-mono" : "text-[#3a0f34]")
                                }`}>
                                  {cellVal || "."}
                                </span>

                                {/* Verification Status Indicator */}
                                {isVerified && (
                                  <span title="Verified accurate">
                                    <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── RIGHT CELL DETAILS & EVIDENCE INSPECTOR PANEL ── */}
        {showInspectorPanel && activeSelectedCellData && (
          <div className="w-80 border-l border-[#d2c2cb] bg-[#fbf9f4] flex flex-col shrink-0 shadow-lg z-20">
            {/* Inspector Header */}
            <div className="p-3.5 bg-[#ffffff] border-b border-[#d2c2cb] flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-[#814d75]">
                  Cell {activeSelectedCellData.colLetter}{activeSelectedCellData.rowNumber} Details
                </span>
                <h4 className="font-['Serifon_Editorial'] text-sm font-bold text-[#3a0f34] truncate max-w-[200px]">
                  {activeSelectedCellData.variable.name}
                </h4>
              </div>
              <button
                onClick={() => setShowInspectorPanel(false)}
                className="text-[#62535d] hover:text-[#3a0f34] p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Inspector Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Study Summary Card */}
              <div className="bg-[#ffffff] p-3 rounded-lg border border-[#d2c2cb] shadow-2xs space-y-1">
                <span className="text-[10px] font-mono text-[#62535d] uppercase tracking-wider block">
                  Study Context
                </span>
                <div className="text-xs font-bold text-[#3a0f34]">
                  {activeSelectedCellData.study.study_label || activeSelectedCellData.study.title}
                </div>
                <div className="text-[11px] text-[#62535d] truncate">
                  {activeSelectedCellData.study.authors} · {activeSelectedCellData.study.publication_year}
                </div>
              </div>

              {/* Extracted Value & Edit Box */}
              <div className="bg-[#ffffff] p-3 rounded-lg border border-[#d2c2cb] shadow-2xs space-y-2">
                <span className="text-[10px] font-mono text-[#62535d] uppercase tracking-wider block">
                  Extracted Value
                </span>
                <div className="text-sm font-bold font-['Work_Sans'] text-[#3a0f34]">
                  {activeSelectedCellData.cell.value || <span className="text-[#81737b] italic font-normal">No value recorded</span>}
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    activeSelectedCellData.cell.is_verified
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-amber-50 text-amber-900 border-amber-200"
                  }`}>
                    {activeSelectedCellData.cell.is_verified ? "Verified Accurate" : "Pending Verification"}
                  </span>

                  <span className="text-[10px] text-[#62535d] font-mono bg-[#eee7ec] px-1.5 py-0.5 rounded">
                    Source: {activeSelectedCellData.cell.extraction_source || "manual"}
                  </span>
                </div>
              </div>

              {/* Evidence Quote Card */}
              <div className="bg-[#ffffff] p-3 rounded-lg border border-[#d2c2cb] shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[#62535d] uppercase tracking-wider">
                    Evidence Passage
                  </span>
                  {activeSelectedCellData.cell.source_page && (
                    <span className="text-[10px] font-mono text-[#814d75] bg-[#814d75]/10 px-1.5 py-0.2 rounded font-bold">
                      Page {activeSelectedCellData.cell.source_page}
                    </span>
                  )}
                </div>

                <p className="text-xs font-['QuadraatSmallCaps'] text-[#4f444b] italic bg-[#fbf9f4] p-2.5 rounded border border-[#d2c2cb] leading-relaxed">
                  {activeSelectedCellData.cell.evidence_quote
                    ? `“${activeSelectedCellData.cell.evidence_quote}”`
                    : "No verbatim quote associated with this cell value."}
                </p>

                {activeSelectedCellData.cell.confidence !== undefined && (
                  <div className="text-[11px] text-[#62535d] flex items-center justify-between">
                    <span>Confidence Score:</span>
                    <span className="font-mono font-bold text-[#3a0f34]">
                      {Math.round((activeSelectedCellData.cell.confidence || 0) * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    handleCommitCellValue(
                      activeSelectedCellData.study.study_id,
                      activeSelectedCellData.variable.variable_id,
                      activeSelectedCellData.cell.value,
                      { verification_status: "verified", is_verified: true }
                    );
                  }}
                  className="w-full py-2 bg-[#3a0f34] text-[#fbf9f4] text-xs font-bold rounded-lg hover:bg-[#1a0017] transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <FileCheck className="h-3.5 w-3.5 text-[#ffdea6]" /> Verify & Lock Value
                </button>

                <Link
                  to={`/projects/${projectId}/studies/${activeSelectedCellData.study.study_id}/pdf?var=${activeSelectedCellData.variable.variable_id}`}
                  className="w-full py-2 bg-[#ffffff] border border-[#d2c2cb] text-[#3a0f34] text-xs font-bold rounded-lg hover:bg-[#eee7ec] transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-[#814d75]" /> Inspect in PDF Workspace
                </Link>

                {/* Mark as Missing Dropdown/Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    onClick={() => {
                      handleCommitCellValue(
                        activeSelectedCellData.study.study_id,
                        activeSelectedCellData.variable.variable_id,
                        "NR",
                        { verification_status: "verified", is_verified: true }
                      );
                    }}
                    className="py-1 text-[11px] font-semibold bg-[#eee7ec] hover:bg-[#d2c2cb] text-[#4f444b] rounded"
                    title="Mark Not Reported (-99)"
                  >
                    Set "NR" (-99)
                  </button>
                  <button
                    onClick={() => {
                      handleCommitCellValue(
                        activeSelectedCellData.study.study_id,
                        activeSelectedCellData.variable.variable_id,
                        "N/A",
                        { verification_status: "verified", is_verified: true }
                      );
                    }}
                    className="py-1 text-[11px] font-semibold bg-[#eee7ec] hover:bg-[#d2c2cb] text-[#4f444b] rounded"
                    title="Mark Not Applicable (-77)"
                  >
                    Set "N/A" (-77)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CODEBOOK DESIGNER MODAL ── */}
      <CodebookDesignerModal
        isOpen={showCodebookDesigner}
        onClose={() => {
          setShowCodebookDesigner(false);
          refetchGrid();
        }}
        projectId={projectId}
        onCodebookUpdated={() => {
          refetchGrid();
        }}
      />

      {/* Universal Undo Top-Right Floating Status Pill */}
      {(isUndoing || undoSuccess) && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 px-3.5 py-2 bg-[#ffffff] border border-[#d2c2cb] rounded-xl shadow-lg text-xs font-['Work_Sans'] font-semibold text-[#3a0f34] animate-in fade-in slide-in-from-top-2 duration-150">
          {isUndoing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-[#814d75]" />
              <span>Undoing task...</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 text-emerald-600" />
              <span>Task undone</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
