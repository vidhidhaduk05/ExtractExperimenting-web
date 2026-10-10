import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type PrismaFlow } from "../lib/api";
import { ArrowLeft, GitBranch, Loader2, Download, FileText, Code2, Copy } from "lucide-react";

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
  const [useRSvg, setUseRSvg] = useState(true);
  const [rSvg, setRSvg] = useState<string | null>(null);
  const [rSvgLoading, setRSvgLoading] = useState(false);
  const [rSvgError, setRSvgError] = useState(false);
  const [downloading, setDownloading] = useState<"png" | "docx" | null>(null);

  // Mermaid Modal State
  const [mermaidModalOpen, setMermaidModalOpen] = useState(false);
  const [mermaidText, setMermaidText] = useState<string>('');
  const [mermaidLoading, setMermaidLoading] = useState(false);

  const handleMermaidSyntax = async () => {
    if (!projectId) return;
    setMermaidLoading(true);
    setMermaidModalOpen(true);
    try {
      const data = await api.prismaMermaid({ project_id: projectId });
      if (data.mermaid) setMermaidText(data.mermaid);
    } catch (err) {
      console.error('Error fetching Mermaid syntax:', err);
    } finally {
      setMermaidLoading(false);
    }
  };

  const handleDownload = async (kind: "png" | "docx") => {
    if (!projectId) return;
    setDownloading(kind);
    try {
      const url = kind === "png" ? api.prismaPngUrl(projectId) : api.prismaDocxUrl(projectId);
      await downloadFile(url, `prisma_flow_${projectId}.${kind}`);
    } catch (e: any) {
      alert(e.message || "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  const { data: flow, isLoading } = useQuery({
    queryKey: ["prisma-flow", projectId],
    queryFn: () => api.prismaFlow(projectId!),
    enabled: !!projectId,
  });

  // Fetch R-generated SVG
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

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> Back to project
      </Link>

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-phylo-blue" />
          <h1 className="text-2xl font-bold">PRISMA 2020 Flow Diagram</h1>
        </div>
        {/* Download buttons + R/built-in toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownload("png")}
            disabled={downloading !== null}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-phylo-green text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            title="Download the diagram as a PNG image"
          >
            {downloading === "png" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            PNG
          </button>
          <button
            onClick={() => handleDownload("docx")}
            disabled={downloading !== null}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-phylo-blue text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            title="Download an editable Word document (diagram + editable count tables)"
          >
            {downloading === "docx" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
            Word (editable)
          </button>
          <span className="w-px h-5 bg-gray-200 mx-1" />
          <button
            onClick={() => setUseRSvg(true)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              useRSvg ? "bg-phylo-blue text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            R Plot
          </button>
          <button
            onClick={() => setUseRSvg(false)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              !useRSvg ? "bg-phylo-blue text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Built-in
          </button>
          <span className="w-px h-5 bg-gray-200 mx-1" />
          <button
            onClick={handleMermaidSyntax}
            className="text-xs px-3 py-1.5 rounded-md font-medium bg-gray-800 text-white hover:bg-gray-900 transition-colors flex items-center gap-1"
            title="View Mermaid Syntax"
          >
            <Code2 className="h-3 w-3" />
            Mermaid Syntax
          </button>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Systematic review screening flow following PRISMA 2020 guidelines with live database synchronization.
      </p>

      {flow?.audit && (
        <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-xs text-slate-500 block font-medium">TOTAL SCREENING DECISIONS</span>
              <span className="text-base font-bold text-slate-900">{flow.audit.total_decisions}</span>
            </div>
            <div className="border-l pl-6 border-slate-200">
              <span className="text-xs text-slate-500 block font-medium">HUMAN DECISIONS</span>
              <span className="text-base font-bold text-emerald-600">{flow.audit.human_decisions}</span>
            </div>
            <div className="border-l pl-6 border-slate-200">
              <span className="text-xs text-slate-500 block font-medium">AI / LAYA DECISIONS</span>
              <span className="text-base font-bold text-indigo-600">{flow.audit.ai_decisions}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
              Live Sync Active
            </span>
          </div>
        </div>
      )}

      {isLoading && <p className="text-gray-400">Loading flow data...</p>}

      {/* R-generated SVG */}
      {useRSvg && rSvgLoading && (
        <div className="card p-12 flex items-center justify-center gap-2 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Generating R plot...
        </div>
      )}

      {useRSvg && rSvg && !rSvgLoading && (
        <div className="card p-6">
          <div dangerouslySetInnerHTML={{ __html: rSvg }} />
        </div>
      )}

      {useRSvg && rSvgError && !rSvgLoading && flow && (
        <>
          <div className="card p-3 mb-4 text-sm text-gray-500 bg-gray-50">
            R-generated SVG unavailable, showing built-in diagram.
          </div>
          <PrismaDiagram flow={flow} />
        </>
      )}

      {/* Built-in SVG */}
      {!useRSvg && flow && <PrismaDiagram flow={flow} />}

      {/* Exclusion reasons tables (always show) */}
      {flow && (flow.screening.excluded_with_reasons.length > 0 || flow.eligibility.excluded_reasons.length > 0) && (
        <div className="mt-6 grid grid-cols-2 gap-4">
          {flow.screening.excluded_with_reasons.length > 0 && (
            <ReasonTable title="Title/Abstract Exclusion Reasons" reasons={flow.screening.excluded_with_reasons} />
          )}
          {flow.eligibility.excluded_reasons.length > 0 && (
            <ReasonTable title="Full-text Exclusion Reasons" reasons={flow.eligibility.excluded_reasons} />
          )}
        </div>
      )}

      {/* Mermaid Syntax Modal */}
      {mermaidModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Code2 className="w-5 h-5 text-gray-800" />
                PRISMA 2020 Mermaid Syntax
              </h3>
              <button onClick={() => setMermaidModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-4 rounded-xl border font-mono text-sm text-slate-800 whitespace-pre-wrap leading-relaxed relative">
              {mermaidLoading ? "Generating Mermaid syntax..." : mermaidText}
              {!mermaidLoading && mermaidText && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(mermaidText)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-indigo-600 p-1 rounded bg-white"
                  title="Copy Mermaid syntax"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t mt-4">
              <button onClick={() => setMermaidModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function PrismaDiagram({ flow }: { flow: PrismaFlow }) {
  const id = flow.identification;
  const scr = flow.screening;
  const elig = flow.eligibility;
  const incl = flow.included;

  return (
    <div className="card p-6">
      <svg viewBox="0 0 800 620" className="w-full h-auto" style={{ maxHeight: "620px" }}>
        {/* Phase labels (left column) */}
        <PhaseLabel x={10} y={50} text="Identification" />
        <PhaseLabel x={10} y={200} text="Screening" />
        <PhaseLabel x={10} y={350} text="Eligibility" />
        <PhaseLabel x={10} y={500} text="Included" />

        {/* Identification box */}
        <FlowBox
          x={250} y={20} w={300} h={70}
          title="Records identified from databases"
          value={id.database_records}
          subtitle={`Registers: ${id.registers} | Other: ${id.other_sources}`}
        />

        {/* Arrow down from identification to screening */}
        <FlowArrow x1={400} y1={90} x2={400} y2={170} />

        {/* Screening: records screened */}
        <FlowBox
          x={250} y={170} w={300} h={55}
          title="Records screened"
          value={scr.records_screened}
        />

        {/* Arrow right to excluded */}
        <FlowArrow x1={550} y1={197} x2={620} y2={197} />

        {/* Screening: excluded */}
        <FlowBox
          x={620} y={170} w={170} h={55}
          title="Records excluded"
          value={scr.records_excluded}
          color="#E94444"
        />

        {/* Exclusion reasons (TA) */}
        {scr.excluded_with_reasons.length > 0 && (
          <ReasonList
            x={620} y={235}
            reasons={scr.excluded_with_reasons.slice(0, 4)}
          />
        )}

        {/* Arrow down from screening to eligibility */}
        <FlowArrow x1={400} y1={225} x2={400} y2={320} />

        {/* Eligibility: full-text assessed */}
        <FlowBox
          x={250} y={320} w={300} h={55}
          title="Full-text articles assessed for eligibility"
          value={elig.full_text_assessed}
        />

        {/* Arrow right to full-text excluded */}
        <FlowArrow x1={550} y1={347} x2={620} y2={347} />

        {/* Eligibility: excluded */}
        <FlowBox
          x={620} y={320} w={170} h={55}
          title="Full-text excluded"
          value={elig.full_text_excluded}
          color="#E94444"
        />

        {/* Exclusion reasons (FT) */}
        {elig.excluded_reasons.length > 0 && (
          <ReasonList
            x={620} y={385}
            reasons={elig.excluded_reasons.slice(0, 4)}
          />
        )}

        {/* Arrow down from eligibility to included */}
        <FlowArrow x1={400} y1={375} x2={400} y2={470} />

        {/* Included box */}
        <FlowBox
          x={250} y={470} w={300} h={70}
          title="Studies included in review"
          value={incl.studies_in_review}
          subtitle={`In meta-analysis: ${incl.studies_in_meta_analysis}`}
          color="#75A025"
        />

        {/* Pending note */}
        {flow.pending > 0 && (
          <g>
            <rect x={250} y={560} width={300} height={30} rx={6}
              fill="#FF940015" stroke="#FF9400" strokeWidth={1} />
            <text x={400} y={580} textAnchor="middle" fontSize={11} fill="#FF9400" fontWeight="600">
              {flow.pending} records pending screening
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function PhaseLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g>
      <rect x={x} y={y - 15} width={100} height={30} rx={4}
        fill="#0279EE10" stroke="#0279EE" strokeWidth={0.5} />
      <text x={x + 50} y={y + 4} textAnchor="middle" fontSize={10}
        fontWeight="700" fill="#0279EE" fontFamily="Liberation Sans, sans-serif">
        {text}
      </text>
    </g>
  );
}

function FlowBox({
  x, y, w, h, title, value, subtitle, color = "#0279EE",
}: {
  x: number; y: number; w: number; h: number;
  title: string; value: number; subtitle?: string; color?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8}
        fill="white" stroke={color} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 18} textAnchor="middle" fontSize={10}
        fill="#666" fontFamily="Liberation Sans, sans-serif">
        {title}
      </text>
      <text x={x + w / 2} y={y + 40} textAnchor="middle" fontSize={22}
        fontWeight="700" fill={color} fontFamily="Liberation Sans, sans-serif">
        {value}
      </text>
      {subtitle && (
        <text x={x + w / 2} y={y + h - 8} textAnchor="middle" fontSize={9}
          fill="#999" fontFamily="Liberation Sans, sans-serif">
          {subtitle}
        </text>
      )}
    </g>
  );
}

function FlowArrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const isHorizontal = y1 === y2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - (isHorizontal ? 6 : 0)} y2={y2 - (isHorizontal ? 0 : 6)}
        stroke="#999" strokeWidth={1.5} />
      {isHorizontal ? (
        <polygon points={`${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`} fill="#999" />
      ) : (
        <polygon points={`${x2},${y2} ${x2 - 4},${y2 - 6} ${x2 + 4},${y2 - 6}`} fill="#999" />
      )}
    </g>
  );
}

function ReasonList({ x, y, reasons }: { x: number; y: number; reasons: { reason: string; count: number }[] }) {
  return (
    <g>
      {reasons.map((r, i) => (
        <text key={i} x={x} y={y + i * 14} fontSize={9} fill="#888"
          fontFamily="Liberation Sans, sans-serif">
          {r.reason.length > 22 ? r.reason.slice(0, 20) + "..." : r.reason} ({r.count})
        </text>
      ))}
    </g>
  );
}

function ReasonTable({ title, reasons }: { title: string; reasons: { reason: string; count: number }[] }) {
  const total = reasons.reduce((s, r) => s + r.count, 0);
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-1 font-medium text-gray-500">Reason</th>
            <th className="text-right py-1 font-medium text-gray-500">Count</th>
            <th className="text-right py-1 font-medium text-gray-500">%</th>
          </tr>
        </thead>
        <tbody>
          {reasons.map((r, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-1 text-gray-700">{r.reason}</td>
              <td className="py-1 text-right font-medium">{r.count}</td>
              <td className="py-1 text-right text-gray-400">
                {total > 0 ? Math.round((r.count / total) * 100) : 0}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
