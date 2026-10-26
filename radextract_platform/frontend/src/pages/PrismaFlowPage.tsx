import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Prisma2020Sync, type PrismaFlow, type Study } from "../lib/api";
import {
  ArrowLeft,
  GitBranch,
  Loader2,
  Download,
  FileText,
  Code2,
  Copy,
  SlidersHorizontal,
  FileCode,
} from "lucide-react";
import { sanitizeSvg } from "../lib/utils";

/** Fetch a URL as a blob and trigger a browser download. */
async function downloadFile(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PrismaFlowPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [useRSvg, setUseRSvg] = useState(false);
  const [rSvg, setRSvg] = useState<string | null>(null);
  const [rSvgLoading, setRSvgLoading] = useState(false);
  const [rSvgError, setRSvgError] = useState(false);
  const [downloading, setDownloading] = useState<"png" | "docx" | null>(null);

  // Layout options matching estech.shinyapps.io/prisma_flowdiagram
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  const [showMetaAnalysis, setShowMetaAnalysis] = useState(true);

  // Mermaid Modal State
  const [mermaidModalOpen, setMermaidModalOpen] = useState(false);
  const [mermaidText, setMermaidText] = useState<string>("");
  const [mermaidLoading, setMermaidLoading] = useState(false);

  const handleMermaidSyntax = async () => {
    if (!projectId) return;
    setMermaidLoading(true);
    setMermaidModalOpen(true);
    try {
      const data = await api.prismaMermaid({ project_id: projectId });
      if (data.mermaid) setMermaidText(data.mermaid);
    } catch (err) {
      console.error("Error fetching Mermaid syntax:", err);
    } finally {
      setMermaidLoading(false);
    }
  };

  const handleDownload = async (kind: "png" | "docx") => {
    if (!projectId) return;
    setDownloading(kind);
    try {
      if (kind === "png") {
        downloadClientPng(`PRISMA2020_${projectId}.png`);
      } else {
        const url = api.prismaDocxUrl(projectId);
        await downloadFile(url, `PRISMA2020_${projectId}.${kind}`);
      }
    } catch (e: any) {
      alert(e.message || "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadSvg = () => {
    const svgEl = document.getElementById("prisma-diagram-svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `PRISMA2020_${projectId || "flow"}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadClientPng = (filename: string) => {
    const svgEl = document.getElementById("prisma-diagram-svg") as SVGSVGElement | null;
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const URLObj = window.URL || window.webkitURL || window;
    const blobURL = URLObj.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2.5; // High-resolution publication 300dpi equivalent
      const viewBox = svgEl.viewBox.baseVal;
      const width = viewBox.width || (showOtherMethods ? 1520 : 920);
      const height = viewBox.height || 840;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URLObj.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  };

  // Continuous live link to the actual studies list
  const { data: studies = [], isLoading: studiesLoading } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
    refetchInterval: 4000,
  });

  const { data: flow, isLoading: flowLoading } = useQuery({
    queryKey: ["prisma-flow", projectId],
    queryFn: () => api.prismaFlow(projectId!),
    enabled: !!projectId,
    refetchInterval: 4000,
  });

  const { data: official } = useQuery({
    queryKey: ["prisma-2020-official", projectId],
    queryFn: () => api.prisma2020(projectId!),
    enabled: !!projectId,
    refetchInterval: 4000,
  });

  // Dynamically compute live counts from actual studies and screening history
  const liveData = useMemo(() => computeLivePrismaData(studies, flow, official), [studies, flow, official]);

  // Fetch R-generated SVG when specifically requested
  useEffect(() => {
    if (!projectId || !useRSvg) return;
    setRSvgLoading(true);
    setRSvgError(false);
    fetch(api.prismaSvgUrl(projectId))
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.text();
      })
      .then((svg) => {
        if (svg && svg.trim()) {
          setRSvg(svg);
        } else {
          setRSvgError(true);
          setUseRSvg(false);
        }
      })
      .catch(() => {
        setRSvgError(true);
        setUseRSvg(false);
      })
      .finally(() => setRSvgLoading(false));
  }, [projectId, useRSvg]);

  const isLoading = studiesLoading && flowLoading;

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <Link
        to={`/projects/${projectId}`}
        className="text-sm text-[#62535d] hover:text-[#3a0f34] flex items-center gap-1 mb-4 transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="h-6 w-6 text-[#3a0f34]" />
          <div>
            <h1
              className="text-2xl font-bold text-[#141413] tracking-tight"
              style={{ fontFamily: "Serifon Editorial, Georgia, serif" }}
            >
              PRISMA 2020 Flow Diagram
            </h1>
            <p className="text-xs text-[#62535d] mt-0.5">
              Live PRISMA 2020 flow diagram continuously linked to screening history and updated in real time upon included and excluded studies.
            </p>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadSvg}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-[#3a0f34] text-white hover:bg-[#1a0017] flex items-center gap-1 transition-colors shadow-sm"
            title="Download scalable vector SVG for publication"
          >
            <FileCode className="h-3.5 w-3.5" />
            SVG
          </button>
          <button
            onClick={() => handleDownload("png")}
            disabled={downloading !== null}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-white text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] disabled:opacity-50 flex items-center gap-1 transition-colors"
            title="Download high-resolution 300 DPI PNG image"
          >
            {downloading === "png" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PNG
          </button>
          <button
            onClick={() => handleDownload("docx")}
            disabled={downloading !== null}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-white text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] disabled:opacity-50 flex items-center gap-1 transition-colors"
            title="Download editable Word document (diagram + count tables)"
          >
            {downloading === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Word (docx)
          </button>
          <button
            onClick={() => {
              if (!projectId) return;
              downloadFile(api.prisma2020CsvUrl(projectId), `PRISMA2020_${projectId}.csv`).catch(() => {});
            }}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-white text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] flex items-center gap-1 transition-colors"
            title="Download PRISMA 2020 CSV template compatible with Haddaway shiny app"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <span className="w-px h-5 bg-[#d2c2cb] mx-1" />
          <button
            onClick={handleMermaidSyntax}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-[#141413] text-white hover:bg-black transition-colors flex items-center gap-1"
            title="View Mermaid Syntax"
          >
            <Code2 className="h-3.5 w-3.5" />
            Mermaid
          </button>
        </div>
      </div>

      {/* Control Bar: Toggle Options matching estech.shinyapps.io/prisma_flowdiagram */}
      <div className="mb-4 p-3.5 bg-white rounded-lg border border-[#d2c2cb] shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#141413]">
          <span className="flex items-center gap-1 text-[#62535d] font-semibold uppercase tracking-wider text-[11px]">
            <SlidersHorizontal className="h-3.5 w-3.5" /> PRISMA Arms:
          </span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer hover:text-[#3a0f34] transition-colors select-none">
            <input
              type="checkbox"
              checked={showOtherMethods}
              onChange={(e) => setShowOtherMethods(e.target.checked)}
              className="rounded border-[#d2c2cb] text-[#3a0f34] focus:ring-[#814d75]"
            />
            Show "Other methods" arm (Websites, Organisations, Citations)
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer hover:text-[#3a0f34] transition-colors select-none">
            <input
              type="checkbox"
              checked={showMetaAnalysis}
              onChange={(e) => setShowMetaAnalysis(e.target.checked)}
              className="rounded border-[#d2c2cb] text-[#3a0f34] focus:ring-[#814d75]"
            />
            Include meta-analysis reports
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseRSvg(false)}
            className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${
              !useRSvg
                ? "bg-[#3a0f34] text-white"
                : "bg-white text-[#62535d] border border-[#d2c2cb] hover:bg-[#eee7ec]"
            }`}
          >
            Interactive B&W
          </button>
          <button
            onClick={() => setUseRSvg(true)}
            className={`text-[11px] px-2.5 py-1 rounded font-medium transition-colors ${
              useRSvg
                ? "bg-[#3a0f34] text-white"
                : "bg-white text-[#62535d] border border-[#d2c2cb] hover:bg-[#eee7ec]"
            }`}
          >
            R Engine (B&W)
          </button>
        </div>
      </div>

      {/* Live Decision Sync Banner */}
      <div className="mb-4 p-3.5 rounded-lg bg-white border border-[#d2c2cb] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-[10px] text-[#62535d] block font-semibold uppercase tracking-wider">Total Studies</span>
            <span className="text-sm font-bold text-[#141413]">{liveData.counts.database_results + liveData.counts.register_results + liveData.counts.duplicates}</span>
          </div>
          <div className="border-l pl-5 border-[#d2c2cb]">
            <span className="text-[10px] text-[#62535d] block font-semibold uppercase tracking-wider">Screened Decisions</span>
            <span className="text-sm font-bold text-[#141413]">{liveData.counts.records_screened}</span>
          </div>
          <div className="border-l pl-5 border-[#d2c2cb]">
            <span className="text-[10px] text-[#62535d] block font-semibold uppercase tracking-wider">Included Studies</span>
            <span className="text-sm font-bold text-[#3a0f34]">{liveData.counts.new_studies}</span>
          </div>
          <div className="border-l pl-5 border-[#d2c2cb]">
            <span className="text-[10px] text-[#62535d] block font-semibold uppercase tracking-wider">Excluded Records</span>
            <span className="text-sm font-bold text-[#62535d]">{liveData.counts.records_excluded + liveData.counts.dbr_excluded}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3a0f34]"></span>
            Live Continuous Link Active
          </span>
        </div>
      </div>

      {isLoading && <p className="text-[#62535d] text-sm">Loading flow data...</p>}

      {/* DIAGRAM VIEW */}
      <>
        {/* R-generated SVG */}
        {useRSvg && rSvgLoading && (
          <div className="p-12 bg-white rounded-lg border border-[#d2c2cb] flex items-center justify-center gap-2 text-[#62535d]">
            <Loader2 className="h-5 w-5 animate-spin" /> Generating R publication plot...
          </div>
        )}

        {useRSvg && rSvg && !rSvgLoading && (
          <div className="p-6 bg-white rounded-lg border border-[#d2c2cb] shadow-sm overflow-x-auto">
            <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(rSvg) }} />
          </div>
        )}

        {useRSvg && rSvgError && !rSvgLoading && (
          <div className="p-3 mb-4 text-xs text-[#62535d] bg-white rounded border border-[#d2c2cb]">
            R-generated SVG unavailable; displaying high-contrast publication standard built-in diagram.
          </div>
        )}

        {/* Standard Official PRISMA 2020 Diagram Component (B&W) */}
        {(!useRSvg || rSvgError) && (
          <OfficialPrismaDiagram
            counts={liveData.counts}
            exclusionReasons={liveData.ft_reasons}
            showOtherMethods={showOtherMethods}
            showMetaAnalysis={showMetaAnalysis}
          />
        )}

        {/* Exclusion reasons tables */}
        {(liveData.ta_reasons.length > 0 || liveData.ft_reasons.length > 0) && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            {liveData.ta_reasons.length > 0 && (
              <ReasonTable title="Title / Abstract Exclusion Reasons" reasons={liveData.ta_reasons} />
            )}
            {liveData.ft_reasons.length > 0 && (
              <ReasonTable title="Full-text Exclusion Reasons" reasons={liveData.ft_reasons} />
            )}
          </div>
        )}
      </>

      {/* Mermaid Syntax Modal */}
      {mermaidModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 relative flex flex-col max-h-[90vh] border border-[#d2c2cb]">
            <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-4 mb-4">
              <h3 className="text-base font-bold text-[#141413] flex items-center gap-2">
                <Code2 className="w-5 h-5 text-[#3a0f34]" />
                PRISMA 2020 Mermaid Syntax
              </h3>
              <button
                onClick={() => setMermaidModalOpen(false)}
                className="text-[#62535d] hover:text-[#141413] text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#fbf9f4] p-4 rounded border border-[#d2c2cb] font-mono text-xs text-[#141413] whitespace-pre-wrap leading-relaxed relative">
              {mermaidLoading ? "Generating Mermaid syntax..." : mermaidText}
              {!mermaidLoading && mermaidText && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(mermaidText)}
                  className="absolute top-4 right-4 text-[#62535d] hover:text-[#3a0f34] p-1.5 rounded bg-white border border-[#d2c2cb]"
                  title="Copy Mermaid syntax"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#d2c2cb] mt-4">
              <button
                onClick={() => setMermaidModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded bg-[#3a0f34] text-white hover:bg-[#1a0017]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Standard PRISMA 2020 Flow Diagram Component
 * Replicates Neal Haddaway et al. (estech.shinyapps.io/prisma_flowdiagram)
 * Pure Black & White publication theme with rectangular geometry (rx=0) and crisp directional arrows.
 */
function OfficialPrismaDiagram({
  counts,
  exclusionReasons,
  showOtherMethods,
  showMetaAnalysis,
}: {
  counts: ReturnType<typeof computeLivePrismaData>["counts"];
  exclusionReasons: { reason: string; count: number }[];
  showOtherMethods: boolean;
  showMetaAnalysis: boolean;
}) {
  // SVG canvas dimensions
  const svgWidth = showOtherMethods ? 1520 : 920;
  const svgHeight = 840;

  return (
    <div className="p-6 bg-white rounded-lg border border-[#d2c2cb] shadow-sm overflow-x-auto">
      <svg
        id="prisma-diagram-svg"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto min-w-[860px]"
        style={{ maxHeight: "840px", background: "#ffffff" }}
      >
        <title>PRISMA 2020 Flow Diagram for Systematic Reviews</title>
        <defs>
          <marker
            id="prisma-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#000000" />
          </marker>
        </defs>

        {/* ── LEFT PHASE BANNERS (Official PRISMA 2020 Vertical Phase Strip) ── */}
        <PhaseStrip y={65} h={105} label="IDENTIFICATION" />
        <PhaseStrip y={200} h={400} label="SCREENING" />
        <PhaseStrip y={625} h={105} label="INCLUDED" />

        {/* ── COLUMN 1: Databases & Registers ── */}
        <HeaderBanner
          x={110}
          y={20}
          w={showOtherMethods ? 665 : 780}
          text="Identification of new studies via databases and registers"
        />

        {/* Row 1: Identification */}
        <g>
          {/* Records identified from*: */}
          <rect
            x={110}
            y={65}
            width={showOtherMethods ? 315 : 370}
            height={105}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={125}
            y={88}
            fontSize={11.5}
            fontWeight="700"
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Records identified from*:
          </text>
          <text
            x={135}
            y={115}
            fontSize={11}
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Databases (n = {counts.database_results})
          </text>
          <text
            x={135}
            y={140}
            fontSize={11}
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Registers (n = {counts.register_results})
          </text>

          {/* Arrow pointing right to Records removed before screening */}
          <FlowArrow
            x1={showOtherMethods ? 425 : 480}
            y1={117}
            x2={showOtherMethods ? 465 : 520}
            y2={117}
          />

          {/* Records removed before screening: */}
          <rect
            x={showOtherMethods ? 465 : 520}
            y={65}
            width={showOtherMethods ? 310 : 370}
            height={105}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 478 : 535}
            y={88}
            fontSize={11.5}
            fontWeight="700"
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Records removed before screening:
          </text>
          <text
            x={showOtherMethods ? 488 : 545}
            y={112}
            fontSize={10.5}
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Duplicate records removed (n = {counts.duplicates})
          </text>
          <text
            x={showOtherMethods ? 488 : 545}
            y={134}
            fontSize={10.5}
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Records marked ineligible by automation (n = {counts.excluded_automatic})
          </text>
          <text
            x={showOtherMethods ? 488 : 545}
            y={156}
            fontSize={10.5}
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Records removed for other reasons (n = 0)
          </text>
        </g>

        {/* Arrow down from Identification to Records Screened */}
        <FlowArrow
          x1={showOtherMethods ? 267 : 295}
          y1={170}
          x2={showOtherMethods ? 267 : 295}
          y2={200}
        />

        {/* Row 2: Records screened */}
        <g>
          {/* Box: Records screened */}
          <rect
            x={110}
            y={200}
            width={showOtherMethods ? 315 : 370}
            height={60}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 267 : 295}
            y={224}
            fontSize={11.5}
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Records screened
          </text>
          <text
            x={showOtherMethods ? 267 : 295}
            y={245}
            fontSize={13}
            fontWeight="700"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            (n = {counts.records_screened})
          </text>

          {/* Arrow right to Records excluded */}
          <FlowArrow
            x1={showOtherMethods ? 425 : 480}
            y1={230}
            x2={showOtherMethods ? 465 : 520}
            y2={230}
          />

          {/* Box: Records excluded** */}
          <rect
            x={showOtherMethods ? 465 : 520}
            y={200}
            width={showOtherMethods ? 310 : 370}
            height={60}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 620 : 705}
            y={224}
            fontSize={11.5}
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Records excluded**
          </text>
          <text
            x={showOtherMethods ? 620 : 705}
            y={245}
            fontSize={13}
            fontWeight="700"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            (n = {counts.records_excluded})
          </text>
        </g>

        {/* Arrow down from Records screened to Reports sought for retrieval */}
        <FlowArrow
          x1={showOtherMethods ? 267 : 295}
          y1={260}
          x2={showOtherMethods ? 267 : 295}
          y2={290}
        />

        {/* Row 3: Reports sought for retrieval */}
        <g>
          {/* Box: Reports sought for retrieval */}
          <rect
            x={110}
            y={290}
            width={showOtherMethods ? 315 : 370}
            height={60}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 267 : 295}
            y={314}
            fontSize={11.5}
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Reports sought for retrieval
          </text>
          <text
            x={showOtherMethods ? 267 : 295}
            y={335}
            fontSize={13}
            fontWeight="700"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            (n = {counts.dbr_sought_reports})
          </text>

          {/* Arrow right to Reports not retrieved */}
          <FlowArrow
            x1={showOtherMethods ? 425 : 480}
            y1={320}
            x2={showOtherMethods ? 465 : 520}
            y2={320}
          />

          {/* Box: Reports not retrieved */}
          <rect
            x={showOtherMethods ? 465 : 520}
            y={290}
            width={showOtherMethods ? 310 : 370}
            height={60}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 620 : 705}
            y={314}
            fontSize={11.5}
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Reports not retrieved
          </text>
          <text
            x={showOtherMethods ? 620 : 705}
            y={335}
            fontSize={13}
            fontWeight="700"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            (n = {counts.dbr_notretrieved_reports})
          </text>
        </g>

        {/* Arrow down from Reports sought to Reports assessed for eligibility */}
        <FlowArrow
          x1={showOtherMethods ? 267 : 295}
          y1={350}
          x2={showOtherMethods ? 267 : 295}
          y2={380}
        />

        {/* Row 4: Reports assessed for eligibility */}
        <g>
          {/* Box: Reports assessed for eligibility */}
          <rect
            x={110}
            y={380}
            width={showOtherMethods ? 315 : 370}
            height={75}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 267 : 295}
            y={407}
            fontSize={11.5}
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Reports assessed for eligibility
          </text>
          <text
            x={showOtherMethods ? 267 : 295}
            y={432}
            fontSize={14}
            fontWeight="700"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            (n = {counts.dbr_assessed})
          </text>

          {/* Arrow right to Reports excluded with reasons */}
          <FlowArrow
            x1={showOtherMethods ? 425 : 480}
            y1={417}
            x2={showOtherMethods ? 465 : 520}
            y2={417}
          />

          {/* Box: Reports excluded with formatted reason breakdown */}
          <rect
            x={showOtherMethods ? 465 : 520}
            y={380}
            width={showOtherMethods ? 310 : 370}
            height={200}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 478 : 535}
            y={404}
            fontSize={11.5}
            fontWeight="700"
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            Reports excluded (n = {counts.dbr_excluded}):
          </text>

          {exclusionReasons.length === 0 ? (
            <text
              x={showOtherMethods ? 486 : 545}
              y={430}
              fontSize={10}
              fill="#555555"
              fontFamily="Work Sans, sans-serif"
            >
              • Criteria not met (n = {counts.dbr_excluded})
            </text>
          ) : (
            exclusionReasons.map((r, idx) => (
              <text
                key={idx}
                x={showOtherMethods ? 486 : 545}
                y={428 + idx * 24}
                fontSize={10}
                fill="#000000"
                fontFamily="Work Sans, sans-serif"
              >
                • {r.reason.length > (showOtherMethods ? 36 : 42) ? r.reason.slice(0, showOtherMethods ? 34 : 40) + "..." : r.reason} (n = {r.count})
              </text>
            ))
          )}
        </g>

        {/* Arrow down from Reports assessed to Included studies */}
        <FlowArrow
          x1={showOtherMethods ? 267 : 295}
          y1={455}
          x2={showOtherMethods ? 267 : 295}
          y2={625}
        />

        {/* Row 5: Included studies */}
        <g>
          {/* Box: New studies included in review */}
          <rect
            x={110}
            y={625}
            width={showOtherMethods ? 315 : 370}
            height={105}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 267 : 295}
            y={650}
            fontSize={11.5}
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            New studies included in review
          </text>
          <text
            x={showOtherMethods ? 267 : 295}
            y={673}
            fontSize={14}
            fontWeight="700"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            (n = {counts.new_studies})
          </text>
          <text
            x={showOtherMethods ? 267 : 295}
            y={705}
            fontSize={10.5}
            fill="#333333"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Reports of new included studies (n = {counts.new_studies})
          </text>

          {/* Arrow right to Total studies included */}
          <FlowArrow
            x1={showOtherMethods ? 425 : 480}
            y1={677}
            x2={showOtherMethods ? 465 : 520}
            y2={677}
          />

          {/* Box: Total studies included in review */}
          <rect
            x={showOtherMethods ? 465 : 520}
            y={625}
            width={showOtherMethods ? 310 : 370}
            height={105}
            rx={0}
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1.2}
          />
          <text
            x={showOtherMethods ? 620 : 705}
            y={650}
            fontSize={11.5}
            fontWeight="600"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Total studies included in review
          </text>
          <text
            x={showOtherMethods ? 620 : 705}
            y={673}
            fontSize={14}
            fontWeight="700"
            fill="#000000"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            (n = {counts.total_studies})
          </text>
          <text
            x={showOtherMethods ? 620 : 705}
            y={695}
            fontSize={10.5}
            fill="#333333"
            textAnchor="middle"
            fontFamily="Work Sans, sans-serif"
          >
            Reports of total included studies (n = {counts.total_studies})
          </text>
          {showMetaAnalysis && (
            <text
              x={showOtherMethods ? 620 : 705}
              y={716}
              fontSize={10.5}
              fontWeight="600"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              Reports in meta-analysis (n = {counts.total_studies_ma})
            </text>
          )}
        </g>

        {/* ── COLUMN 2: Other Methods (Websites, Organisations, Citations) ── */}
        {showOtherMethods && (
          <g>
            <HeaderBanner
              x={810}
              y={20}
              w={670}
              text="Identification of new studies via other methods"
            />

            {/* Other Identification Box */}
            <rect
              x={810}
              y={65}
              width={310}
              height={105}
              rx={0}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={1.2}
            />
            <text
              x={825}
              y={88}
              fontSize={11.5}
              fontWeight="700"
              fill="#000000"
              fontFamily="Work Sans, sans-serif"
            >
              Records identified from:
            </text>
            <text
              x={835}
              y={112}
              fontSize={10.5}
              fill="#000000"
              fontFamily="Work Sans, sans-serif"
            >
              Websites (n = {counts.website_results})
            </text>
            <text
              x={835}
              y={132}
              fontSize={10.5}
              fill="#000000"
              fontFamily="Work Sans, sans-serif"
            >
              Organisations (n = {counts.organisation_results})
            </text>
            <text
              x={835}
              y={152}
              fontSize={10.5}
              fill="#000000"
              fontFamily="Work Sans, sans-serif"
            >
              Citation searching (n = {counts.citations_results})
            </text>

            {/* Down arrow from Other Identification to Other Reports sought */}
            <FlowArrow x1={965} y1={170} x2={965} y2={290} />

            {/* Other Reports sought for retrieval */}
            <rect
              x={810}
              y={290}
              width={310}
              height={60}
              rx={0}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={1.2}
            />
            <text
              x={965}
              y={314}
              fontSize={11.5}
              fontWeight="600"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              Reports sought for retrieval
            </text>
            <text
              x={965}
              y={335}
              fontSize={13}
              fontWeight="700"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              (n = {counts.other_sought_reports})
            </text>

            {/* Arrow right to Other Reports not retrieved */}
            <FlowArrow x1={1120} y1={320} x2={1160} y2={320} />

            <rect
              x={1160}
              y={290}
              width={320}
              height={60}
              rx={0}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={1.2}
            />
            <text
              x={1320}
              y={314}
              fontSize={11.5}
              fontWeight="600"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              Reports not retrieved
            </text>
            <text
              x={1320}
              y={335}
              fontSize={13}
              fontWeight="700"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              (n = {counts.other_notretrieved_reports})
            </text>

            {/* Down arrow to Other Reports assessed */}
            <FlowArrow x1={965} y1={350} x2={965} y2={380} />

            {/* Other Reports assessed for eligibility */}
            <rect
              x={810}
              y={380}
              width={310}
              height={75}
              rx={0}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={1.2}
            />
            <text
              x={965}
              y={407}
              fontSize={11.5}
              fontWeight="600"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              Reports assessed for eligibility
            </text>
            <text
              x={965}
              y={432}
              fontSize={14}
              fontWeight="700"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              (n = {counts.other_assessed})
            </text>

            {/* Arrow right to Other Reports excluded */}
            <FlowArrow x1={1120} y1={417} x2={1160} y2={417} />

            <rect
              x={1160}
              y={380}
              width={320}
              height={140}
              rx={0}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={1.2}
            />
            <text
              x={1175}
              y={404}
              fontSize={11.5}
              fontWeight="700"
              fill="#000000"
              fontFamily="Work Sans, sans-serif"
            >
              Reports excluded (n = {counts.other_excluded}):
            </text>
            <text
              x={1185}
              y={428}
              fontSize={10}
              fill="#000000"
              fontFamily="Work Sans, sans-serif"
            >
              • Ineligible methodology / design (n = {counts.other_excluded})
            </text>

            {/* Down arrow from Other assessed to Other Studies included */}
            <FlowArrow x1={965} y1={455} x2={965} y2={625} />

            {/* Other Studies included box */}
            <rect
              x={810}
              y={625}
              width={310}
              height={105}
              rx={0}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={1.2}
            />
            <text
              x={965}
              y={650}
              fontSize={11.5}
              fontWeight="600"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              Studies included in review
            </text>
            <text
              x={965}
              y={673}
              fontSize={14}
              fontWeight="700"
              fill="#000000"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              (n = {counts.other_included})
            </text>
            <text
              x={965}
              y={705}
              fontSize={10.5}
              fill="#333333"
              textAnchor="middle"
              fontFamily="Work Sans, sans-serif"
            >
              Reports of included studies (n = {counts.other_included})
            </text>

            {/* Branch connector arrow feeding from Other Included into Total Studies Included */}
            <FlowArrow x1={810} y1={677} x2={775} y2={677} />
          </g>
        )}

        {/* ── FOOTNOTES AT BOTTOM (Official PRISMA 2020 Statement Wording) ── */}
        <g>
          <text
            x={110}
            y={758}
            fontSize={9.2}
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            *Consider, if feasible to do so, reporting the number of records identified from each database or register searched rather than the total number across all databases/registers.
          </text>
          <text
            x={110}
            y={774}
            fontSize={9.2}
            fill="#000000"
            fontFamily="Work Sans, sans-serif"
          >
            **If automation tools were used, indicate how many records were excluded by a human and how many were excluded by automation tools.
          </text>
          <text
            x={110}
            y={794}
            fontSize={9}
            fill="#444444"
            fontFamily="Work Sans, sans-serif"
          >
            From: Page MJ, McKenzie JE, Bossuyt PM, Boutron I, Hoffmann TC, Mulrow CD, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71. doi: 10.1136/bmj.n71
          </text>
          <text
            x={110}
            y={810}
            fontSize={9}
            fill="#666666"
            fontFamily="Work Sans, sans-serif"
          >
            For more information, visit: http://www.prisma-statement.org/
          </text>
        </g>
      </svg>
    </div>
  );
}

/** Left vertical phase strip */
function PhaseStrip({ y, h, label }: { y: number; h: number; label: string }) {
  const midY = y + h / 2;
  return (
    <g>
      <rect
        x={15}
        y={y}
        width={75}
        height={h}
        rx={0}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={1.2}
      />
      <text
        x={52}
        y={midY}
        fontSize={11}
        fontWeight="700"
        fill="#000000"
        textAnchor="middle"
        transform={`rotate(-90, 52, ${midY})`}
        fontFamily="Work Sans, sans-serif"
        letterSpacing="1px"
      >
        {label}
      </text>
    </g>
  );
}

/** Header banner spanning the top of columns */
function HeaderBanner({ x, y, w, text }: { x: number; y: number; w: number; text: string }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={32}
        rx={0}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={1.2}
      />
      <text
        x={x + w / 2}
        y={y + 20}
        fontSize={12}
        fontWeight="700"
        fill="#000000"
        textAnchor="middle"
        fontFamily="Work Sans, sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

/** Crisp connector arrow with filled polygon arrowhead */
function FlowArrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const isHorizontal = y1 === y2;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2 - (isHorizontal ? (x2 > x1 ? 6 : -6) : 0)}
        y2={y2 - (!isHorizontal ? (y2 > y1 ? 6 : -6) : 0)}
        stroke="#000000"
        strokeWidth={1.3}
      />
      {isHorizontal ? (
        <polygon
          points={
            x2 > x1
              ? `${x2},${y2} ${x2 - 6},${y2 - 3.5} ${x2 - 6},${y2 + 3.5}`
              : `${x2},${y2} ${x2 + 6},${y2 - 3.5} ${x2 + 6},${y2 + 3.5}`
          }
          fill="#000000"
        />
      ) : (
        <polygon
          points={
            y2 > y1
              ? `${x2},${y2} ${x2 - 3.5},${y2 - 6} ${x2 + 3.5},${y2 - 6}`
              : `${x2},${y2} ${x2 - 3.5},${y2 + 6} ${x2 + 3.5},${y2 + 6}`
          }
          fill="#000000"
        />
      )}
    </g>
  );
}

/**
 * Computes PRISMA 2020 counts continuously from the project's actual studies and screening decisions.
 * Defaults to 0 when no studies exist in the project.
 */
function computeLivePrismaData(
  studies: Study[] | undefined,
  flow?: PrismaFlow,
  official?: Prisma2020Sync
) {
  const studyList = studies || [];

  if (studyList.length > 0) {
    const total = studyList.length;
    const duplicates = studyList.filter((s) => s.is_duplicate === 1 || s.duplicate_of_study_id).length;
    const nonDuplicates = Math.max(0, total - duplicates);

    // Registers vs Databases
    const registers = studyList.filter(
      (s) => !s.is_duplicate && (s.source_type === "register" || s.source_type === "trials")
    ).length;
    const databases = Math.max(0, nonDuplicates - registers);

    // Screened: all non-duplicate studies that have a screening decision (not pending)
    const screenedStudies = studyList.filter(
      (s) => !s.is_duplicate && s.screening_status && s.screening_status !== "pending"
    );
    const records_screened = screenedStudies.length;

    // TA Excluded: studies excluded at Title/Abstract stage
    const taExcludedStudies = studyList.filter(
      (s) =>
        !s.is_duplicate &&
        s.screening_status === "excluded" &&
        (s.screening_stage === "ta" || !s.screening_stage)
    );
    const records_excluded = taExcludedStudies.length;

    // TA exclusion reasons breakdown
    const taReasonMap: Record<string, number> = {};
    for (const s of taExcludedStudies) {
      const r = s.screening_reason || "Ineligible based on criteria";
      taReasonMap[r] = (taReasonMap[r] || 0) + 1;
    }
    const ta_excluded_reasons = Object.entries(taReasonMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Reports sought for retrieval: passed TA screening
    const dbr_sought_reports = Math.max(0, records_screened - records_excluded);

    // Reports not retrieved (awaiting full-text pdf)
    const notRetrievedStudies = studyList.filter(
      (s) => !s.is_duplicate && s.screening_status === "awaiting_pdf"
    );
    const dbr_notretrieved_reports = notRetrievedStudies.length;

    // Reports assessed for eligibility (in full-text stage)
    const dbr_assessed = Math.max(0, dbr_sought_reports - dbr_notretrieved_reports);

    // FT Excluded: studies excluded at Full-Text stage
    const ftExcludedStudies = studyList.filter(
      (s) => !s.is_duplicate && s.screening_status === "excluded" && s.screening_stage === "ft"
    );
    const dbr_excluded = ftExcludedStudies.length;

    // FT exclusion reasons breakdown
    const ftReasonMap: Record<string, number> = {};
    for (const s of ftExcludedStudies) {
      const r = s.screening_reason || "Full-text criteria not met";
      ftReasonMap[r] = (ftReasonMap[r] || 0) + 1;
    }
    const ft_excluded_reasons = Object.entries(ftReasonMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Studies included in review
    const includedStudies = studyList.filter(
      (s) => !s.is_duplicate && s.screening_status === "included"
    );
    const new_studies = includedStudies.length;
    const total_studies = new_studies;
    const total_studies_ma = new_studies;

    return {
      counts: {
        database_results: databases,
        register_results: registers,
        duplicates,
        excluded_automatic: 0,
        records_screened,
        records_excluded,
        dbr_sought_reports,
        dbr_notretrieved_reports,
        dbr_assessed,
        dbr_excluded,
        new_studies,
        total_studies,
        total_studies_ma,
        website_results: 0,
        organisation_results: 0,
        citations_results: 0,
        other_sought_reports: 0,
        other_notretrieved_reports: 0,
        other_assessed: 0,
        other_excluded: 0,
        other_included: 0,
      },
      ta_reasons: ta_excluded_reasons,
      ft_reasons: ft_excluded_reasons,
      hasStudies: true,
    };
  }

  // If official or flow API returns counts from the backend database:
  if (flow && flow.identification && (flow.identification.total > 0 || flow.screening.records_screened > 0)) {
    return {
      counts: {
        database_results: flow.identification.database_records || flow.identification.total || 0,
        register_results: flow.identification.registers || 0,
        duplicates: flow.identification.duplicates_removed || 0,
        excluded_automatic: 0,
        records_screened: flow.screening.records_screened || 0,
        records_excluded: flow.screening.records_excluded || 0,
        dbr_sought_reports: Math.max(0, (flow.screening.records_screened || 0) - (flow.screening.records_excluded || 0)),
        dbr_notretrieved_reports: 0,
        dbr_assessed: flow.eligibility.full_text_assessed || 0,
        dbr_excluded: flow.eligibility.full_text_excluded || 0,
        new_studies: flow.included.studies_in_review || 0,
        total_studies: flow.included.studies_in_review || 0,
        total_studies_ma: flow.included.studies_in_meta_analysis || 0,
        website_results: 0,
        organisation_results: 0,
        citations_results: 0,
        other_sought_reports: 0,
        other_notretrieved_reports: 0,
        other_assessed: 0,
        other_excluded: 0,
        other_included: 0,
      },
      ta_reasons: flow.screening.excluded_with_reasons || [],
      ft_reasons: flow.eligibility.excluded_reasons || [],
      hasStudies: true,
    };
  }

  // DEFAULT IS ZERO STUDIES
  return {
    counts: {
      database_results: 0,
      register_results: 0,
      duplicates: 0,
      excluded_automatic: 0,
      records_screened: 0,
      records_excluded: 0,
      dbr_sought_reports: 0,
      dbr_notretrieved_reports: 0,
      dbr_assessed: 0,
      dbr_excluded: 0,
      new_studies: 0,
      total_studies: 0,
      total_studies_ma: 0,
      website_results: 0,
      organisation_results: 0,
      citations_results: 0,
      other_sought_reports: 0,
      other_notretrieved_reports: 0,
      other_assessed: 0,
      other_excluded: 0,
      other_included: 0,
    },
    ta_reasons: [],
    ft_reasons: [],
    hasStudies: false,
  };
}

function ReasonTable({ title, reasons }: { title: string; reasons: { reason: string; count: number }[] }) {
  const total = reasons.reduce((s, r) => s + r.count, 0);
  return (
    <div className="p-4 bg-white rounded-lg border border-[#d2c2cb] shadow-sm">
      <h3 className="text-xs font-bold text-[#141413] uppercase tracking-wider mb-2">{title}</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#d2c2cb]">
            <th className="text-left py-1 font-semibold text-[#62535d]">Reason</th>
            <th className="text-right py-1 font-semibold text-[#62535d]">Count</th>
            <th className="text-right py-1 font-semibold text-[#62535d]">%</th>
          </tr>
        </thead>
        <tbody>
          {reasons.map((r, i) => (
            <tr key={i} className="border-b border-[#eee7ec]">
              <td className="py-1 text-[#141413]">{r.reason}</td>
              <td className="py-1 text-right font-medium text-[#141413]">{r.count}</td>
              <td className="py-1 text-right text-[#62535d]">
                {total > 0 ? Math.round((r.count / total) * 100) : 0}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
