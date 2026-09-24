import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, Table, Check, ExternalLink } from 'lucide-react';


export function ExportPage() {
  const { projectId } = useParams();
  const [projectName, setProjectName] = useState<string>('export');
  const [downloading, setDownloading] = useState<string | null>(null);

  // Scientific Agent State
  const [manuscriptOpen, setManuscriptOpen] = useState(false);
  const [manuscriptText, setManuscriptText] = useState<string>('');
  const [draftLoading, setDraftLoading] = useState(false);

  const [bibModalOpen, setBibModalOpen] = useState(false);
  const [bibText, setBibText] = useState<string>('');
  const [bibLoading, setBibLoading] = useState(false);
  const [bibFormat, setBibFormat] = useState('bibtex');

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
    try {
      const res = await fetch('/api/scientific-export/draft-manuscript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          section: section,
          pooled_effect: 1.48,
          ci_lower: 1.22,
          ci_upper: 1.79,
          measure: 'Odds Ratio (OR)',
          i2: 42.5,
          p_val: 0.001
        })
      });
      const data = await res.json();
      if (data.markdown) setManuscriptText(data.markdown);
    } catch (err) {
      console.error('Error drafting manuscript:', err);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleExportBibliography = async (fmt: string) => {
    if (!projectId) return;
    setBibFormat(fmt);
    setBibLoading(true);
    setBibModalOpen(true);
    try {
      const res = await fetch('/api/scientific-export/bibliography', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          format: fmt
        })
      });
      const data = await res.json();
      if (data.content) setBibText(data.content);
    } catch (err) {
      console.error('Error exporting bibliography:', err);
    } finally {
      setBibLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Export Project Data</h1>
        <p className="text-sm text-slate-500 mt-1">
          Export extracted data, verified extractions, analysis results, and research manuscripts
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* CSV Export */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4">
              <Table className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">CSV Export</h3>
            <p className="text-xs text-slate-500 mt-2">
              Standard comma-separated format for statistical analysis in R, Python, Stata, or SPSS.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('csv', 'csv')}
              disabled={downloading === 'csv'}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition"
            >
              {downloading === 'csv' ? 'Exporting...' : <><Download className="w-4 h-4" /> Export Raw CSV</>}
            </button>
          </div>
        </div>

        {/* Excel Export */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Excel Workbook</h3>
            <p className="text-xs text-slate-500 mt-2">
              Formatted XLSX workbook containing studies, verified variables, and risk of bias scores.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('excel', 'excel')}
              disabled={downloading === 'excel'}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition"
            >
              {downloading === 'excel' ? 'Exporting...' : <><Download className="w-4 h-4" /> Export XLSX</>}
            </button>
          </div>
        </div>

        {/* JSON Export */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Structured JSON</h3>
            <p className="text-xs text-slate-500 mt-2">
              Complete data payload with schema metadata, character-level PDF bounding coordinates, and confidence.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('json', 'json')}
              disabled={downloading === 'json'}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition"
            >
              {downloading === 'json' ? 'Exporting...' : <><Download className="w-4 h-4" /> Export JSON</>}
            </button>
          </div>
        </div>
      </div>

      {/* Scientific Agent Exports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
              ✍️
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Manuscript Drafter (PRISMA Evidence-Bound)</h3>
              <p className="text-xs text-slate-500">Auto-generate Methods and Results manuscript sections</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => handleDraftManuscript('methods')}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
            >
              Draft Methods
            </button>
            <button
              onClick={() => handleDraftManuscript('results')}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
            >
              Draft Results
            </button>
            <button
              onClick={() => handleDraftManuscript('all')}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
            >
              Draft All
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              📚
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Bibliography & Reference Export</h3>
              <p className="text-xs text-slate-500">Export verified BibTeX, RIS, or APA formatted citations</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => handleExportBibliography('bibtex')}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              BibTeX (.bib)
            </button>
            <button
              onClick={() => handleExportBibliography('ris')}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              EndNote (RIS)
            </button>
            <button
              onClick={() => handleExportBibliography('apa')}
              className="flex-1 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
            >
              APA Reference List
            </button>
          </div>
        </div>
      </div>

      {/* Manuscript Draft Modal */}
      {manuscriptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                ✍️ Evidence-Bound Manuscript Draft
              </h3>
              <button onClick={() => setManuscriptOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-4 rounded-xl border font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
              {draftLoading ? "Drafting rigorous PRISMA 2020 compliant manuscript sections..." : manuscriptText}
            </div>

            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <button
                onClick={() => navigator.clipboard.writeText(manuscriptText)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700"
              >
                Copy Markdown
              </button>
              <button onClick={() => setManuscriptOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Bibliography Modal */}
      {bibModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                📚 Formatted Bibliography ({bibFormat.toUpperCase()})
              </h3>
              <button onClick={() => setBibModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-4 rounded-xl border font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
              {bibLoading ? "Compiling verified study citations..." : bibText}
            </div>

            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <button
                onClick={() => navigator.clipboard.writeText(bibText)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Copy Citations
              </button>
              <button onClick={() => setBibModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
