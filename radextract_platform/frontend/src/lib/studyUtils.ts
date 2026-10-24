/**
 * Utility functions for resolving and opening primary study literature sources
 * via DOI, PubMed ID (PMID), PMC ID, or title search.
 */

export interface MinimalStudySourceInfo {
  doi?: string | null;
  pmid?: string | number | null;
  metadata_json?: string | null;
  source?: string | null;
  title?: string | null;
  url?: string | null;
}

export function cleanDoi(rawDoi?: string | null): string | null {
  if (!rawDoi || !rawDoi.trim()) return null;
  return rawDoi
    .trim()
    .replace(/^(doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i, "")
    .trim();
}

export function getDoiUrl(rawDoi?: string | null): string | null {
  const cleaned = cleanDoi(rawDoi);
  if (!cleaned) return null;
  return `https://doi.org/${encodeURI(cleaned)}`;
}

export function cleanPmid(rawPmid?: string | number | null): string | null {
  if (rawPmid === null || rawPmid === undefined) return null;
  const str = String(rawPmid).trim();
  if (!str) return null;
  const match = str.match(/\d{4,9}/);
  if (match) return match[0];
  return str.replace(/^PMID:?\s*/i, "").trim() || null;
}

export function getPmidUrl(rawPmid?: string | number | null): string | null {
  const cleaned = cleanPmid(rawPmid);
  if (!cleaned) return null;
  return `https://pubmed.ncbi.nlm.nih.gov/${cleaned}/`;
}

export function getStudySourceUrl(study: MinimalStudySourceInfo): string | null {
  // 1. Primary DOI resolution
  if (study.doi) {
    const doiUrl = getDoiUrl(study.doi);
    if (doiUrl) return doiUrl;
  }

  // 2. PubMed ID resolution
  if (study.pmid) {
    const pmidUrl = getPmidUrl(study.pmid);
    if (pmidUrl) return pmidUrl;
  }

  // 3. Direct URL or source field if it is a web link
  if (study.url && (study.url.startsWith("http://") || study.url.startsWith("https://"))) {
    return study.url;
  }
  if (study.source && (study.source.startsWith("http://") || study.source.startsWith("https://"))) {
    return study.source;
  }

  // 4. Nested metadata_json check
  if (study.metadata_json) {
    try {
      const meta = typeof study.metadata_json === "string" ? JSON.parse(study.metadata_json) : study.metadata_json;
      if (meta.doi) {
        const dUrl = getDoiUrl(meta.doi);
        if (dUrl) return dUrl;
      }
      if (meta.pmid) {
        const pUrl = getPmidUrl(meta.pmid);
        if (pUrl) return pUrl;
      }
      if (meta.pmcid) {
        const pmcClean = String(meta.pmcid).replace(/^PMC/i, "").trim();
        return `https://europepmc.org/article/PMC/${pmcClean}`;
      }
      if (meta.url && (String(meta.url).startsWith("http://") || String(meta.url).startsWith("https://"))) {
        return meta.url;
      }
    } catch {}
  }

  // 5. Fallback: Search PubMed by full title
  if (study.title && study.title.trim()) {
    return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(study.title.trim())}`;
  }

  return null;
}

export function openStudySource(study: MinimalStudySourceInfo): boolean {
  const url = getStudySourceUrl(study);
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}
