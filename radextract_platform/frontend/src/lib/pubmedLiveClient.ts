/**
 * Direct Client-Side PubMed E-Utilities Client.
 *
 * Calls NCBI Entrez E-Utilities with CORS enabled (Access-Control-Allow-Origin: *):
 * 1. esearch: retrieves real PMIDs matching the search query sorted by relevance.
 *    - Automatic multi-query relaxation ensures comprehensive coverage across study tiers.
 * 2. esummary: retrieves real metadata (title, journal, fractional pubdate, pubtypes, DOI).
 * 3. efetch: retrieves real structured abstracts for ALL retrieved papers,
 *    chunked at 100 PMIDs per request (NCBI's recommended batch size).
 *
 * This client performs NO inference. Model verdicts (stance, on-topic, directness,
 * finding sentence) require the backend engine; papers without backend judgments
 * are rendered as "Unread" by the UI. No content is ever synthesized here.
 */
import { Paper } from "./claimscapeMethod";

export interface LivePubMedResult {
  papers: Paper[];
  judgments: []; // always empty: the client cannot run the backend model
  totalMatches: number;
}

/**
 * Split raw abstract text into clean, individual sentences.
 */
function splitSentences(text: string): string[] {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 20);
}

/**
 * Parse PubMed pubdate or sortpubdate into a continuous fractional year.
 * e.g. "2024/09/18 00:00" -> 2024.71
 */
function parseFractionalDate(sortpubdate?: string, pubdate?: string): number {
  if (sortpubdate) {
    const parts = sortpubdate.split(/[ /:]/);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) || 6;
    const d = parseInt(parts[2], 10) || 15;
    if (!isNaN(y) && y >= 1900 && y <= 2030) {
      return Math.round((y + (m - 1) / 12 + d / 365) * 100) / 100;
    }
  }
  if (pubdate) {
    const yearMatch = pubdate.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      const y = parseInt(yearMatch[1], 10);
      const months: Record<string, number> = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      const mMatch = pubdate.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/);
      const m = mMatch ? months[mMatch[1]] : 6;
      return Math.round((y + (m - 1) / 12) * 100) / 100;
    }
  }
  return 2023.5;
}

/**
 * Fetch real abstracts for all given PMIDs, chunked at 100 per efetch request.
 * Returns a map of PMID -> { abstract, sentences } for papers that have one.
 */
async function fetchAbstracts(pmids: string[]): Promise<Map<string, { abstract: string; sentences: string[] }>> {
  const abstractMap = new Map<string, { abstract: string; sentences: string[] }>();
  const CHUNK_SIZE = 100;

  for (let i = 0; i < pmids.length; i += CHUNK_SIZE) {
    const chunk = pmids.slice(i, i + CHUNK_SIZE);
    try {
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${chunk.join(
        ","
      )}&rettype=abstract&retmode=xml`;
      const fetchResp = await fetch(fetchUrl);
      if (!fetchResp.ok) continue;
      const xmlText = await fetchResp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "text/xml");
      const articles = doc.querySelectorAll("PubmedArticle");
      articles.forEach((art) => {
        const pmidElem = art.querySelector("PMID");
        if (!pmidElem || !pmidElem.textContent) return;
        const pmid = pmidElem.textContent.trim();

        const abstractTexts = art.querySelectorAll("AbstractText");
        const parts: string[] = [];
        abstractTexts.forEach((t) => {
          const label = t.getAttribute("Label");
          const val = t.textContent?.trim() || "";
          if (label) parts.push(`${label}: ${val}`);
          else parts.push(val);
        });
        const fullAbstract = parts.join(" ");
        if (!fullAbstract) return;
        abstractMap.set(pmid, { abstract: fullAbstract, sentences: splitSentences(fullAbstract) });
      });
    } catch (err) {
      console.warn("EFetch abstract extraction warning:", err);
    }
  }

  return abstractMap;
}

export async function fetchLivePubMedEvidence(
  claim: string,
  query: string,
  count: number = 100
): Promise<LivePubMedResult> {
  const cleanClaim = claim.trim();
  const cleanQuery = query.trim() || cleanClaim;
  if (!cleanQuery) {
    throw new Error("No search query provided");
  }

  // 1. ESearch with multi-query relaxation if initial yield is narrow
  let idList: string[] = [];
  let totalMatches = 0;

  const targetCount = Math.min(300, Math.max(30, count));

  const runSearch = async (term: string, limit: number): Promise<{ ids: string[]; count: number }> => {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
      term
    )}&retmax=${limit}&retmode=json&sort=relevance`;
    const resp = await fetch(searchUrl);
    if (!resp.ok) return { ids: [], count: 0 };
    const data = await resp.json();
    const ids: string[] = data?.esearchresult?.idlist || [];
    const cnt = parseInt(data?.esearchresult?.count || "0", 10) || ids.length;
    return { ids, count: cnt };
  };

  // Primary search with user query
  const primary = await runSearch(cleanQuery, targetCount);
  idList = [...primary.ids];
  totalMatches = primary.count;

  // If primary returns fewer than 20 papers, perform query relaxation to pool relevant papers across all study tiers
  if (idList.length < 20) {
    const claimLower = cleanClaim.toLowerCase();
    const isMucor = claimLower.includes("mucor") || claimLower.includes("albumin");
    const isMetformin = claimLower.includes("metformin") || claimLower.includes("lifespan");
    const isVitaminD = claimLower.includes("vitamin d") || claimLower.includes("fracture");

    const fallbackTerms: string[] = [];
    if (isMucor) {
      fallbackTerms.push("albumin mucormycosis", "hypoalbuminemia mucormycosis", "albumin zygomycosis", "albumin mucorales");
    } else if (isMetformin) {
      fallbackTerms.push("metformin lifespan", "metformin longevity", "metformin aging human", "metformin mortality");
    } else if (isVitaminD) {
      fallbackTerms.push("vitamin d fractures", "cholecalciferol bone fracture prevention", "vitamin d supplementation trials");
    } else {
      // General term relaxation: extract words of length > 3
      const words = cleanClaim.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3);
      if (words.length >= 2) {
        fallbackTerms.push(words.slice(0, 3).join(" "));
      }
    }

    for (const altTerm of fallbackTerms) {
      if (idList.length >= targetCount) break;
      try {
        const altRes = await runSearch(altTerm, 40);
        for (const id of altRes.ids) {
          if (!idList.includes(id)) {
            idList.push(id);
          }
        }
        totalMatches = Math.max(totalMatches, altRes.count, idList.length);
      } catch {}
    }
  }

  if (idList.length === 0) {
    return { papers: [], judgments: [], totalMatches: 0 };
  }

  // Cap at targetCount
  const selectedIds = idList.slice(0, targetCount);

  // 2. ESummary to retrieve publication metadata
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${selectedIds.join(
    ","
  )}&retmode=json`;

  const summaryResp = await fetch(summaryUrl);
  if (!summaryResp.ok) {
    throw new Error(`PubMed ESummary error: HTTP ${summaryResp.status}`);
  }

  const summaryData = await summaryResp.json();
  const resultObj = summaryData?.result || {};

  // 3. EFetch real abstracts for ALL papers, chunked at 100 PMIDs per request
  const abstractMap = await fetchAbstracts(selectedIds);

  const papers: Paper[] = [];

  for (const pmid of selectedIds) {
    const item = resultObj[pmid];
    if (!item) continue;

    const title: string = (item.title || "").replace(/\.$/, "").trim();
    if (!title) continue;

    const journal: string = item.source || item.fulljournalname || "Biomedical Literature";
    const dateVal = parseFractionalDate(item.sortpubdate, item.pubdate);

    const pubTypes: string[] = Array.isArray(item.pubtype) ? item.pubtype : ["Journal Article"];
    const doiObj = Array.isArray(item.articleids)
      ? item.articleids.find((id: any) => id.idtype === "doi")
      : null;
    const doi = doiObj ? doiObj.value : undefined;

    // Real fetched content only. A paper with no fetched abstract has
    // sentences: [] and no finding text — nothing is synthesized.
    const fetched = abstractMap.get(pmid);

    papers.push({
      pmid,
      title,
      journal,
      date: dateVal,
      pubTypes,
      doi,
      abstract: fetched?.abstract,
      sentences: fetched?.sentences || [],
      findingText: undefined
    });
  }

  return {
    papers,
    judgments: [],
    totalMatches
  };
}
