export interface TraceStep {
  hop: number;
  id: string; // e.g. "root", "hop1", "hop2"
  paperId: string; // e.g. "PMC11571110", "PMID:37934012", "PMID:34923044"
  title: string;
  authors: string;
  journal: string;
  year: number;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  isOrigin: boolean;
  citedAs?: string; // e.g. "[9]", "[36]"
  
  // The citing sentence from the previous paper that points to this paper
  citingSentence: string;
  
  // The passage in THIS paper that addresses what it is cited for
  foundPassage: string;
  passageSource: "abstract" | "full_text" | "intro" | "discussion" | "results";
  paragraphId?: string; // e.g. "P009"
  sentenceIndex?: number;
  
  // Verdict on whether and how the claim changed
  verdict: "same" | "partial" | "stronger" | "weaker" | "different" | "unrelated" | "not_found";
  verdictLabel: string;
  verdictDescription: string;
  
  // Confidence & probabilities
  supportScore: number; // 0..1
  ownResultScore: number; // 0..1
  
  // Readings breakdown
  probabilities: {
    matches: number;
    partlyMatches: number;
    goesFurther: number;
    moreCautious: number;
    changed: number;
    notThere: number;
  };
  
  // Unsureness / Calibration Matrix
  unsureness: {
    isGenuinelyUnsure: boolean;
    margin: number; // difference between top 2 probabilities
    entropyScore: number; // higher = higher semantic ambiguity
    reason?: string; // e.g. "Subtle term inversion: immune-dependent vs immune-independent"
    recommendation: "verified" | "manual_audit_advised" | "contradiction_flagged";
  };
  
  // Child steps followed down the telephone trail
  nextSteps?: TraceStep[];
}

export interface CitationTelephoneData {
  claim: string;
  rootPaper: {
    id: string;
    title: string;
    authors: string;
    journal: string;
    year: number;
    doi?: string;
    pmid?: string;
    pmcid?: string;
  };
  totalPapersRead: number;
  originsFound: number;
  maxHops: number;
  changesFound: number;
  steps: TraceStep[];
  auditSummary: {
    headline: string;
    subheadline: string;
    criticalWarning?: string;
    unsureMatrixSummary: {
      totalAnalyzed: number;
      highConfidence: number;
      genuinelyUnsure: number;
      semanticDiscrepancies: number;
    };
  };
}

export const PRESET_TELEPHONE_EXAMPLES: {
  id: string;
  label: string;
  paperId: string;
  claim: string;
  data: CitationTelephoneData;
}[] = [
  {
    id: "nuclear-pdl1",
    label: "Nuclear PD-L1 & Proliferation",
    paperId: "PMC11571110",
    claim: "More importantly, nuclear PD-L1 can promote cell proliferation in an immune-dependent manner without interacting with PD-1. [9]",
    data: {
      claim: "More importantly, nuclear PD-L1 can promote cell proliferation in an immune-dependent manner without interacting with PD-1. [9]",
      rootPaper: {
        id: "PMC11571110",
        title: "Advancing Cancer Immunotherapy through Engineering New PD-L1 Degraders: A Comprehensive Study from Small Molecules to PD-L1-Specific Peptide-Drug Conjugates",
        authors: "Zeng Z et al.",
        journal: "J Med Chem",
        year: 2024,
        doi: "10.1021/acs.jmedchem.4c01652",
        pmid: "39420825",
        pmcid: "PMC11571110"
      },
      totalPapersRead: 3,
      originsFound: 1,
      maxHops: 2,
      changesFound: 1,
      auditSummary: {
        headline: "Traced to an origin two hops back: Ma et al., 2022 (Cancer Lett).",
        subheadline: "At hop 1, the citing sentence inverted the biological mechanism: source stated 'immune-independent', but cited paper wrote 'immune-dependent'.",
        criticalWarning: "Critical Semantic Inversion: Zeng et al. (2024) cited ref [9] for 'immune-dependent' proliferation, but Wang et al. (2023) and origin Ma et al. (2022) proved it is 'immune-INDEPENDENT'.",
        unsurenessMatrixSummary: {
          totalAnalyzed: 2,
          highConfidence: 2,
          genuinelyUnsure: 0,
          semanticDiscrepancies: 1
        }
      } as any,
      steps: [
        {
          hop: 1,
          id: "hop1",
          paperId: "PMC10767451",
          pmid: "37934012",
          pmcid: "PMC10767451",
          doi: "10.1002/advs.202303175",
          title: "Challenges Coexist with Opportunities: Spatial Heterogeneity Expression of PD-L1 in Cancer Therapy",
          authors: "Wang Y, Zhou Y, Yang L, Lei L, He B, Cao J, Gao H",
          journal: "Adv Sci (Weinh)",
          year: 2024,
          isOrigin: false,
          citedAs: "[9]",
          citingSentence: "More importantly, nuclear PD-L1 can promote cell proliferation in an immune-dependent manner without interacting with PD-1. [9]",
          foundPassage: "nPD‐L1 can also serve as a key nuclear protein that promotes immune‐independent cell proliferation without binding to PD‐1. [36]",
          passageSource: "full_text",
          paragraphId: "P009",
          sentenceIndex: 2,
          verdict: "different",
          verdictLabel: "Changed (Inversion)",
          verdictDescription: "The citing sentence swapped 'immune-independent' for 'immune-dependent', stating the opposite immunological context.",
          supportScore: 0.92,
          ownResultScore: 0.08,
          probabilities: {
            matches: 0.12,
            partlyMatches: 0.28,
            goesFurther: 0.05,
            moreCautious: 0.01,
            changed: 0.54,
            notThere: 0.00
          },
          unsureness: {
            isGenuinelyUnsure: false,
            margin: 0.26,
            entropyScore: 0.31,
            reason: "Definitive lexical inversion ('dependent' vs 'independent') confirmed by sentence alignment.",
            recommendation: "contradiction_flagged"
          },
          nextSteps: [
            {
              hop: 2,
              id: "hop2",
              paperId: "PMID:34923044",
              pmid: "34923044",
              doi: "10.1016/j.canlet.2021.12.017",
              title: "Nuclear PD-L1 promotes cell cycle progression of BRAF-mutated colorectal cancer by inhibiting THRAP3",
              authors: "Ma R, Liu Y, Che X, Li C, Wen T, Hou K, Qu X",
              journal: "Cancer Lett",
              year: 2022,
              isOrigin: true,
              citedAs: "[36]",
              citingSentence: "nPD‐L1 can also serve as a key nuclear protein that promotes immune‐independent cell proliferation without binding to PD‐1. [36]",
              foundPassage: "These findings reveal a novel role of nPD-L1, which promotes cell cycle progression in an immune-independent manner in BRAF V600E-mutated CRC.",
              passageSource: "abstract",
              paragraphId: "Abstract",
              sentenceIndex: 6,
              verdict: "same",
              verdictLabel: "Origin (True Source)",
              verdictDescription: "Original experimental demonstration that nuclear PD-L1 accelerates cell cycle independently of immune T-cell interaction.",
              supportScore: 0.96,
              ownResultScore: 0.98,
              probabilities: {
                matches: 0.88,
                partlyMatches: 0.09,
                goesFurther: 0.02,
                moreCautious: 0.01,
                changed: 0.00,
                notThere: 0.00
              },
              unsureness: {
                isGenuinelyUnsure: false,
                margin: 0.79,
                entropyScore: 0.12,
                reason: "Direct verbatim match of primary experimental result.",
                recommendation: "verified"
              }
            }
          ]
        }
      ]
    }
  },
  {
    id: "alphafold-complexes",
    label: "AlphaFold & Complex Multimers",
    paperId: "PMC8264563",
    claim: "AlphaFold reliably predicts stoichiometry and binding affinities of arbitrary multimeric protein complexes across eukaryotic proteomes. [12]",
    data: {
      claim: "AlphaFold reliably predicts stoichiometry and binding affinities of arbitrary multimeric protein complexes across eukaryotic proteomes. [12]",
      rootPaper: {
        id: "PMC8264563",
        title: "Highly accurate protein structure prediction with AlphaFold",
        authors: "Jumper J, Evans R, Pritzel A et al.",
        journal: "Nature",
        year: 2021,
        doi: "10.1038/s41586-021-03819-2",
        pmid: "34265844",
        pmcid: "PMC8264563"
      },
      totalPapersRead: 2,
      originsFound: 1,
      maxHops: 1,
      changesFound: 1,
      auditSummary: {
        headline: "Traced to origin 1 hop back: Evans et al. (AlphaFold-Multimer).",
        subheadline: "Claim goes significantly further than origin: AlphaFold predicts quaternary structures, but DOES NOT output binding affinities or arbitrary stoichiometry without known subunit lists.",
        criticalWarning: "Exaggeration (Goes Further): Claim asserts 'binding affinities' were predicted, which AlphaFold does not calculate.",
        unsurenessMatrixSummary: {
          totalAnalyzed: 1,
          highConfidence: 1,
          genuinelyUnsure: 0,
          semanticDiscrepancies: 1
        }
      } as any,
      steps: [
        {
          hop: 1,
          id: "af_hop1",
          paperId: "biorxiv:2021.10.04.463034",
          doi: "10.1101/2021.10.04.463034",
          title: "Protein complex prediction with AlphaFold-Multimer",
          authors: "Evans R, O'Neill M, Pritzel A et al.",
          journal: "bioRxiv",
          year: 2021,
          isOrigin: true,
          citedAs: "[12]",
          citingSentence: "AlphaFold reliably predicts stoichiometry and binding affinities of arbitrary multimeric protein complexes across eukaryotic proteomes. [12]",
          foundPassage: "AlphaFold-Multimer significantly increases accuracy on multimeric interfaces, though predicting variable stoichiometry or thermodynamic binding free energies remains beyond current scope.",
          passageSource: "abstract",
          paragraphId: "P001",
          sentenceIndex: 4,
          verdict: "stronger",
          verdictLabel: "Goes Further (Overclaimed)",
          verdictDescription: "The citing paper claims AlphaFold predicts binding affinities, which the authors explicitly noted is beyond current scope.",
          supportScore: 0.65,
          ownResultScore: 0.94,
          probabilities: {
            matches: 0.15,
            partlyMatches: 0.22,
            goesFurther: 0.58,
            moreCautious: 0.02,
            changed: 0.03,
            notThere: 0.00
          },
          unsureness: {
            isGenuinelyUnsure: false,
            margin: 0.36,
            entropyScore: 0.28,
            reason: "Causal claim expansion: 'structure' inflated to 'binding affinities'.",
            recommendation: "contradiction_flagged"
          }
        }
      ]
    }
  },
  {
    id: "sleep-memory",
    label: "Sleep & Synaptic Renormalization",
    paperId: "PMID:24075741",
    claim: "Slow-wave sleep induces a global, uniform downscaling of all cerebral excitatory synapses. [4]",
    data: {
      claim: "Slow-wave sleep induces a global, uniform downscaling of all cerebral excitatory synapses. [4]",
      rootPaper: {
        id: "PMID:24075741",
        title: "Sleep and synaptic homeostasis: a structural hypothesis",
        authors: "Tononi G, Cirelli C",
        journal: "Front Syst Neurosci",
        year: 2013,
        doi: "10.3389/fnsys.2013.00049",
        pmid: "24075741"
      },
      totalPapersRead: 2,
      originsFound: 1,
      maxHops: 1,
      changesFound: 0,
      auditSummary: {
        headline: "Traced to origin 1 hop back: Vyazovskiy et al., 2008 (Nat Neurosci).",
        subheadline: "Genuine Unsureness detected: Evidence indicates selective rather than strictly uniform downscaling; active debate remains in subfield.",
        unsurenessMatrixSummary: {
          totalAnalyzed: 1,
          highConfidence: 0,
          genuinelyUnsure: 1,
          semanticDiscrepancies: 0
        }
      } as any,
      steps: [
        {
          hop: 1,
          id: "sleep_hop1",
          paperId: "PMID:18497813",
          pmid: "18497813",
          doi: "10.1038/nn.2135",
          title: "Molecular and electrophysiological evidence for net synaptic potentiation in wake and depression in sleep",
          authors: "Vyazovskiy VV, Cirelli C, Pfister-Genskow M, Faraguna U, Tononi G",
          journal: "Nat Neurosci",
          year: 2008,
          isOrigin: true,
          citedAs: "[4]",
          citingSentence: "Slow-wave sleep induces a global, uniform downscaling of all cerebral excitatory synapses. [4]",
          foundPassage: "During sleep, slow-wave activity is associated with a net decrease in AMPA receptor levels and cortical evoked potentials, consistent with homeostatic synaptic depression.",
          passageSource: "abstract",
          paragraphId: "Abstract",
          sentenceIndex: 5,
          verdict: "partial",
          verdictLabel: "Partly Matches (Hedging Difference)",
          verdictDescription: "Paper reports net synaptic depression across cortical samples, but does not claim 'uniformity' across all synapse subtypes.",
          supportScore: 0.72,
          ownResultScore: 0.95,
          probabilities: {
            matches: 0.38,
            partlyMatches: 0.42,
            goesFurther: 0.16,
            moreCautious: 0.03,
            changed: 0.01,
            notThere: 0.00
          },
          unsureness: {
            isGenuinelyUnsure: true,
            margin: 0.04, // 0.42 vs 0.38
            entropyScore: 0.68,
            reason: "Close probability distribution between 'matches' (38%) and 'partly matches' (42%). Scientific consensus distinguishes net vs uniform downscaling.",
            recommendation: "manual_audit_advised"
          }
        }
      ]
    }
  }
];

export const VERDICT_BADGE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  same: {
    bg: "bg-[#88A0DC]/15 dark:bg-[#88A0DC]/25",
    text: "text-[#381A61] dark:text-[#88A0DC]",
    border: "border-[#88A0DC]/40",
    label: "Matches Source"
  },
  partial: {
    bg: "bg-[#F9D14A]/20 dark:bg-[#F9D14A]/25",
    text: "text-[#381A61] dark:text-[#F9D14A]",
    border: "border-[#F9D14A]/50",
    label: "Partly Matches"
  },
  stronger: {
    bg: "bg-[#E78429]/15 dark:bg-[#E78429]/25",
    text: "text-[#E78429] dark:text-[#E78429]",
    border: "border-[#E78429]/40",
    label: "Goes Further (Overclaimed)"
  },
  weaker: {
    bg: "bg-[#7C4B73]/15 dark:bg-[#7C4B73]/25",
    text: "text-[#7C4B73] dark:text-[#C8C2BA]",
    border: "border-[#7C4B73]/40",
    label: "More Cautious"
  },
  different: {
    bg: "bg-[#AB3329]/15 dark:bg-[#AB3329]/25",
    text: "text-[#AB3329] dark:text-[#ED968C]",
    border: "border-[#AB3329]/40",
    label: "Changed / Inverted"
  },
  unrelated: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
    label: "Not Addressed"
  },
  not_found: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-600 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
    label: "Not in Text"
  }
};
