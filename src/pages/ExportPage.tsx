import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, Table, Check, ExternalLink, BookOpen, Copy, Sparkles, CheckCheck } from 'lucide-react';
import { api } from '../lib/api';

export function ExportPage() {
  const { projectId } = useParams();
  const [projectName, setProjectName] = useState<string>('export');
  const [downloading, setDownloading] = useState<string | null>(null);

  const [referenceError, setReferenceError] = useState<string | null>(null);

  // Scientific Agent State
  const [manuscriptOpen, setManuscriptOpen] = useState(false);
  const [manuscriptText, setManuscriptText] = useState<string>('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);

  const [bibModalOpen, setBibModalOpen] = useState(false);
  const [bibText, setBibText] = useState<string>('');
  const [bibLoading, setBibLoading] = useState(false);
  const [bibFormat, setBibFormat] = useState('bibtex');
  const [copiedBib, setCopiedBib] = useState(false);

  const handleDownload = async (format: string, endpoint: string) => {
    if (!projectId) return;
    setDownloading(format);
    try {
      const res = await fetch(`/api/export/${projectId}/${endpoint}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}_${endpoint}.${format === 'csv' ? 'csv' : format === 'excel' ? 'xlsx' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(null);
    }
  };

  const handleDraftManuscript = async (section: string) => {
    if (!projectId) return;
    setDraftLoading(true);
    setManuscriptOpen(true);
    setCopiedDraft(false);
    try {
      let synthesisData: any = null;
      try {
        const synRes = await fetch(`/api/meta-analysis/${projectId}`);
        if (synRes.ok) {
          const parsed = await synRes.json();
          if (parsed && parsed.status === 'pooled') {
            synthesisData = parsed;
          }
        }
      } catch {}

      const data = await api.draftManuscript({
        project_id: projectId,
        section: section,
        pooled_effect: synthesisData?.pooled_effect,
        ci_lower: synthesisData?.ci_lower,
        ci_upper: synthesisData?.ci_upper,
        measure: synthesisData?.measure || 'Descriptive',
        i2: synthesisData?.i2,
        p_val: synthesisData?.p_heterogeneity
      });
      if (data.markdown) setManuscriptText(data.markdown);
    } catch (err) {
      console.error('Error drafting manuscript:', err);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleIncludedBibtex = async () => {
    if (!projectId || downloading === 'bibtex') return;
    setDownloading('bibtex');
    setReferenceError(null);
    let url: string | undefined;
    try {
      const blob = await api.exportReferences(projectId, 'bibtex', 'included');
      url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `included_references_${projectId}.bib`;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
    } catch (error) {
      setReferenceError(error instanceof Error ? error.message : 'Reference export failed. Please retry.');
    } finally {
      if (url) window.URL.revokeObjectURL(url);
      setDownloading(null);
    }
  };

  const handleExportBibliography = async (fmt: string) => {
    if (!projectId) return;
    setBibFormat(fmt);
    setBibLoading(true);
    setBibModalOpen(true);
    setCopiedBib(false);
    try {
      const data = await api.exportBibliography({
        project_id: projectId,
        format: fmt
      });
      if (data.content) setBibText(data.content);
    } catch (err) {
      console.error('Error exporting bibliography:', err);
    } finally {
      setBibLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-['Work_Sans']">
      {/* Header Section */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#eee7ec] text-[#814d75] border border-[#d2c2cb] mb-3">
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>DISSEMINATION & REPORTING</span>
        </div>
        <h1 className="font-['Serifon_Editorial'] text-3xl font-bold text-[#3a0f34] tracking-tight">
          Export Project Data
        </h1>
        <p className="font-['QuadraatSmallCaps'] text-sm text-[#62535d] mt-1.5 leading-relaxed max-w-2xl">
          Export extracted clinical datasets, verified PICO variables, pooled meta-analysis metrics, and publication-ready PRISMA manuscripts.
        </p>
      </div>

      {/* Primary Data Exports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* CSV Export */}
        <div className="bg-[#ffffff] p-6 rounded-2xl border border-[#d2c2cb] shadow-xs flex flex-col justify-between hover:border-[#814d75]/50 transition-all">
          <div>
            <div className="w-11 h-11 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75] mb-4">
              <Table className="w-5 h-5" />
            </div>
            <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34]">CSV Export</h3>
            <p className="font-['Work_Sans'] text-xs text-[#62535d] mt-2 leading-relaxed">
              Standard comma-separated format for statistical analysis in R, Python, Stata, or SPSS.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('csv', 'csv')}
              disabled={downloading === 'csv'}
              className="w-full py-2.5 px-4 rounded-xl bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {downloading === 'csv' ? (
                'Exporting...'
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#ffdea6]" /> Export Raw CSV
                </>
              )}
            </button>
          </div>
        </div>

        {/* Excel Export */}
        <div className="bg-[#ffffff] p-6 rounded-2xl border border-[#d2c2cb] shadow-xs flex flex-col justify-between hover:border-[#814d75]/50 transition-all">
          <div>
            <div className="w-11 h-11 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75] mb-4">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34]">Excel Workbook</h3>
            <p className="font-['Work_Sans'] text-xs text-[#62535d] mt-2 leading-relaxed">
              Formatted XLSX workbook containing studies, verified variables, and risk of bias scores.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('excel', 'excel')}
              disabled={downloading === 'excel'}
              className="w-full py-2.5 px-4 rounded-xl bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {downloading === 'excel' ? (
                'Exporting...'
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#ffdea6]" /> Export XLSX
                </>
              )}
            </button>
          </div>
        </div>

        {/* JSON Export */}
        <div className="bg-[#ffffff] p-6 rounded-2xl border border-[#d2c2cb] shadow-xs flex flex-col justify-between hover:border-[#814d75]/50 transition-all">
          <div>
            <div className="w-11 h-11 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75] mb-4">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34]">Structured JSON</h3>
            <p className="font-['Work_Sans'] text-xs text-[#62535d] mt-2 leading-relaxed">
              Complete data payload with schema metadata, character-level PDF bounding coordinates, and confidence.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('json', 'json')}
              disabled={downloading === 'json'}
              className="w-full py-2.5 px-4 rounded-xl bg-[#3a0f34] hover:bg-[#1a0017] text-[#fbf9f4] font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {downloading === 'json' ? (
                'Exporting...'
              ) : (
                <>
                  <Download className="w-4 h-4 text-[#ffdea6]" /> Export JSON
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Scientific Agent & Synthesis Exports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Manuscript Drafter Card */}
        <div className="bg-[#ffffff] p-6 rounded-2xl border border-[#d2c2cb] shadow-xs hover:border-[#814d75]/50 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-['Serifon_Editorial'] text-base font-bold text-[#3a0f34]">
                  Manuscript Drafter (PRISMA Evidence-Bound)
                </h3>
                <p className="font-['Work_Sans'] text-xs text-[#62535d]">
                  Auto-generate Methods and Results manuscript sections
                </p>
              </div>
            </div>
            <p className="font-['QuadraatSmallCaps'] text-xs text-[#62535d] mt-2 leading-relaxed">
              Synthesizes pooled effect estimates, heterogeneity indices, and risk of bias judgments directly into publication-ready prose.
            </p>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={() => handleDraftManuscript('methods')}
              className="flex-1 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#ffffff] border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] transition-all cursor-pointer"
            >
              Draft Methods
            </button>
            <button
              onClick={() => handleDraftManuscript('results')}
              className="flex-1 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#ffffff] border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] transition-all cursor-pointer"
            >
              Draft Results
            </button>
            <button
              onClick={() => handleDraftManuscript('all')}
              className="flex-1 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-[#ffdea6]" />
              <span>Draft All</span>
            </button>
          </div>
        </div>

        {/* Bibliography & Reference Export Card */}
        <div className="bg-[#ffffff] p-6 rounded-2xl border border-[#d2c2cb] shadow-xs hover:border-[#814d75]/50 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75]">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-['Serifon_Editorial'] text-base font-bold text-[#3a0f34]">
                  Bibliography & Reference Export
                </h3>
                <p className="font-['Work_Sans'] text-xs text-[#62535d]">
                  Export verified BibTeX, RIS, or APA formatted citations
                </p>
              </div>
            </div>
            <p className="font-['QuadraatSmallCaps'] text-xs text-[#62535d] mt-2 leading-relaxed">
              BibTeX downloads only studies currently marked Included. Abstract-only inclusions, pending, and excluded studies are omitted.
            </p>
            {referenceError && (
              <p role="alert" className="mt-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                {referenceError} Please retry the download after resolving the issue.
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={handleIncludedBibtex}
              disabled={downloading === 'bibtex'}
              className="flex-1 py-2 px-3 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#ffdea6]" />
              <span>{downloading === 'bibtex' ? 'Exporting…' : 'Download included studies (.bib)'}</span>
            </button>
            <button
              onClick={() => handleExportBibliography('ris')}
              className="flex-1 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#ffffff] border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] transition-all cursor-pointer"
            >
              EndNote (RIS)
            </button>
            <button
              onClick={() => handleExportBibliography('apa')}
              className="flex-1 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#814d75] text-[#fbf9f4] hover:bg-[#66365c] transition-all shadow-xs cursor-pointer"
            >
              APA Reference List
            </button>
          </div>
        </div>
      </div>

      {/* Manuscript Draft Modal */}
      {manuscriptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl shadow-2xl max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-4 mb-4">
              <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#814d75]" />
                <span>Evidence-Bound Manuscript Draft</span>
              </h3>
              <button
                onClick={() => setManuscriptOpen(false)}
                className="text-[#81737b] hover:text-[#3a0f34] p-1 rounded-md text-lg font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#fbf9f4] p-4 rounded-xl border border-[#d2c2cb] font-mono text-xs text-[#4f444b] whitespace-pre-wrap leading-relaxed shadow-inner">
              {draftLoading ? "Drafting rigorous PRISMA 2020 compliant manuscript sections with Co-Scientist..." : manuscriptText}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#d2c2cb] mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(manuscriptText);
                  setCopiedDraft(true);
                  setTimeout(() => setCopiedDraft(false), 2500);
                }}
                className="px-4 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {copiedDraft ? <CheckCheck className="w-3.5 h-3.5 text-[#ffdea6]" /> : <Copy className="w-3.5 h-3.5 text-[#ffdea6]" />}
                <span>{copiedDraft ? "Copied!" : "Copy Markdown"}</span>
              </button>
              <button
                onClick={() => setManuscriptOpen(false)}
                className="px-4 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#ffffff] border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bibliography Modal */}
      {bibModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#ffffff] border border-[#d2c2cb] rounded-2xl shadow-2xl max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-4 mb-4">
              <h3 className="font-['Serifon_Editorial'] text-lg font-bold text-[#3a0f34] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#814d75]" />
                <span>Formatted Bibliography ({bibFormat.toUpperCase()})</span>
              </h3>
              <button
                onClick={() => setBibModalOpen(false)}
                className="text-[#81737b] hover:text-[#3a0f34] p-1 rounded-md text-lg font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#fbf9f4] p-4 rounded-xl border border-[#d2c2cb] font-mono text-xs text-[#4f444b] whitespace-pre-wrap leading-relaxed shadow-inner">
              {bibLoading ? "Compiling verified study citations..." : bibText}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#d2c2cb] mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(bibText);
                  setCopiedBib(true);
                  setTimeout(() => setCopiedBib(false), 2500);
                }}
                className="px-4 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {copiedBib ? <CheckCheck className="w-3.5 h-3.5 text-[#ffdea6]" /> : <Copy className="w-3.5 h-3.5 text-[#ffdea6]" />}
                <span>{copiedBib ? "Copied!" : "Copy Citations"}</span>
              </button>
              <button
                onClick={() => setBibModalOpen(false)}
                className="px-4 py-2 text-xs font-['Work_Sans'] font-semibold rounded-lg bg-[#ffffff] border border-[#d2c2cb] text-[#3a0f34] hover:bg-[#eee7ec] transition-all cursor-pointer"
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
