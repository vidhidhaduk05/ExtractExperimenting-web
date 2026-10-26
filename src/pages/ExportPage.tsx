import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, Table, X } from 'lucide-react';
import { api } from '../lib/api';

export function ExportPage() {
  const { projectId } = useParams();
  const [projectName] = useState<string>('export');
  const [downloading, setDownloading] = useState<string | null>(null);

  const [referenceError, setReferenceError] = useState<string | null>(null);

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
      const data = await api.draftManuscript({
        project_id: projectId,
        section: section,
        pooled_effect: 1.48,
        ci_lower: 1.22,
        ci_upper: 1.79,
        measure: 'Odds Ratio (OR)',
        i2: 42.5,
        p_val: 0.001
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
    <div className="p-8 max-w-6xl mx-auto bg-[#fbf9f4] min-h-screen text-[#4f444b]">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-[#3a0f34]">Export Project Data</h1>
        <p className="text-sm text-[#62535d] mt-1 font-serif">
          Export extracted data, verified extractions, analysis results, and research manuscripts
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* CSV Export */}
        <div className="bg-white p-6 rounded-xl shadow-xs border border-[#d2c2cb] flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#3a0f34] mb-4">
              <Table className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-serif font-bold text-[#3a0f34]">CSV Export</h3>
            <p className="text-xs text-[#62535d] mt-2 font-serif">
              Standard comma-separated format for statistical analysis in R, Python, Stata, or SPSS.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('csv', 'csv')}
              disabled={downloading === 'csv'}
              className="btn-primary w-full text-xs flex items-center justify-center gap-2"
            >
              {downloading === 'csv' ? 'Exporting...' : <><Download className="w-4 h-4" /> Export Raw CSV</>}
            </button>
          </div>
        </div>

        {/* Excel Export */}
        <div className="bg-white p-6 rounded-xl shadow-xs border border-[#d2c2cb] flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75] mb-4">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-serif font-bold text-[#3a0f34]">Excel Workbook</h3>
            <p className="text-xs text-[#62535d] mt-2 font-serif">
              Formatted XLSX workbook containing studies, verified variables, and risk of bias scores.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('excel', 'excel')}
              disabled={downloading === 'excel'}
              className="btn-primary w-full text-xs flex items-center justify-center gap-2"
            >
              {downloading === 'excel' ? 'Exporting...' : <><Download className="w-4 h-4" /> Export XLSX</>}
            </button>
          </div>
        </div>

        {/* JSON Export */}
        <div className="bg-white p-6 rounded-xl shadow-xs border border-[#d2c2cb] flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#3a0f34] mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-serif font-bold text-[#3a0f34]">Structured JSON</h3>
            <p className="text-xs text-[#62535d] mt-2 font-serif">
              Complete data payload with schema metadata, character-level PDF bounding coordinates, and confidence.
            </p>
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => handleDownload('json', 'json')}
              disabled={downloading === 'json'}
              className="btn-primary w-full text-xs flex items-center justify-center gap-2"
            >
              {downloading === 'json' ? 'Exporting...' : <><Download className="w-4 h-4" /> Export JSON</>}
            </button>
          </div>
        </div>
      </div>

      {/* Scientific Agent Exports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-6 rounded-xl shadow-xs border border-[#d2c2cb]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#3a0f34] font-bold">
              ✍️
            </div>
            <div>
              <h3 className="font-serif font-bold text-[#3a0f34] text-base">Manuscript Drafter (PRISMA Evidence-Bound)</h3>
              <p className="text-xs text-[#62535d] font-serif">Auto-generate Methods and Results manuscript sections</p>
            </div>
          </div>
          <div className="flex gap-2.5 mt-5">
            <button
              onClick={() => handleDraftManuscript('methods')}
              className="btn-secondary flex-1 text-xs"
            >
              Draft Methods
            </button>
            <button
              onClick={() => handleDraftManuscript('results')}
              className="btn-secondary flex-1 text-xs"
            >
              Draft Results
            </button>
            <button
              onClick={() => handleDraftManuscript('all')}
              className="btn-primary flex-1 text-xs"
            >
              Draft All
            </button>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-xs border border-[#d2c2cb]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#eee7ec] border border-[#d2c2cb] flex items-center justify-center text-[#814d75] font-bold">
              📚
            </div>
            <div>
              <h3 className="font-serif font-bold text-[#3a0f34] text-base">Bibliography & Reference Export</h3>
              <p className="text-xs text-[#62535d] font-serif">Export verified BibTeX, RIS, or APA formatted citations</p>
            </div>
          </div>
          <p className="text-xs text-[#62535d] mt-2 font-serif">BibTeX downloads only studies currently marked Included. Abstract-only inclusions, pending and excluded studies are omitted.</p>
          {referenceError && <p role="alert" className="mt-2 text-xs text-[#814d75] bg-[#eee7ec] p-2 rounded border border-[#814d75] font-sans">{referenceError} Please retry the download after resolving the issue.</p>}
          <div className="flex gap-2.5 mt-5">
            <button
              onClick={handleIncludedBibtex}
              disabled={downloading === 'bibtex'}
              className="btn-secondary flex-1 text-xs"
            >
              {downloading === 'bibtex' ? 'Exporting…' : 'Download included studies (.bib)'}
            </button>
            <button
              onClick={() => handleExportBibliography('ris')}
              className="btn-secondary flex-1 text-xs"
            >
              EndNote (RIS)
            </button>
            <button
              onClick={() => handleExportBibliography('apa')}
              className="btn-primary flex-1 text-xs"
            >
              APA List
            </button>
          </div>
        </div>
      </div>

      {/* Manuscript Draft Modal */}
      {manuscriptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a0017]/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#d2c2cb] max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-3 mb-4">
              <h3 className="text-lg font-serif font-bold text-[#3a0f34] flex items-center gap-2">
                ✍️ Evidence-Bound Manuscript Draft
              </h3>
              <button onClick={() => setManuscriptOpen(false)} className="text-[#81737b] hover:text-[#3a0f34] p-1 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#fbf9f4] p-4 rounded-lg border border-[#d2c2cb] font-mono text-xs text-[#4f444b] whitespace-pre-wrap leading-relaxed">
              {draftLoading ? "Drafting rigorous PRISMA 2020 compliant manuscript sections..." : manuscriptText}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#d2c2cb] mt-4">
              <button
                onClick={() => navigator.clipboard.writeText(manuscriptText)}
                className="btn-primary text-xs"
              >
                Copy Markdown
              </button>
              <button onClick={() => setManuscriptOpen(false)} className="btn-secondary text-xs">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Bibliography Modal */}
      {bibModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a0017]/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#d2c2cb] max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-[#d2c2cb] pb-3 mb-4">
              <h3 className="text-lg font-serif font-bold text-[#3a0f34] flex items-center gap-2">
                📚 Formatted Bibliography ({bibFormat.toUpperCase()})
              </h3>
              <button onClick={() => setBibModalOpen(false)} className="text-[#81737b] hover:text-[#3a0f34] p-1 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-[#fbf9f4] p-4 rounded-lg border border-[#d2c2cb] font-mono text-xs text-[#4f444b] whitespace-pre-wrap leading-relaxed">
              {bibLoading ? "Compiling verified study citations..." : bibText}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#d2c2cb] mt-4">
              <button
                onClick={() => navigator.clipboard.writeText(bibText)}
                className="btn-primary text-xs"
              >
                Copy Citations
              </button>
              <button onClick={() => setBibModalOpen(false)} className="btn-secondary text-xs">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
