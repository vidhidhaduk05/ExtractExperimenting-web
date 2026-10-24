export interface Paper {
  pmid: string;
  title: string;
  journal: string;
  date: number; // e.g. 2025.875
  pubTypes: string[];
  doi?: string;
  authors?: string;
  findingText?: string;
  sentences?: string[];
  abstract?: string;
  sample_size?: number | null;
  sample_size_display?: string | null;
  study_type_label?: string | null;
}

export interface Judgment {
  pmid: string;
  onTopic: number;
  direct: number;
  stance: Record<string, number>;
  stanceCheck: Record<string, number>;
  design?: Record<string, number>;
  finding?: {
    index: number;
    confidence: number;
  };
}

export interface ProcessedPaper {
  paper: Paper;
  judgment: Judgment;
  tier: string | null;
  tierSource: {
    kind: "pubmed" | "model" | "none";
    type?: string;
    design?: string;
    p?: number;
  };
  onTopic: boolean;
  direct: boolean;
  probs: Record<string, number>;
  agree: boolean;
  category: "supports" | "contradicts" | "mixed" | "no_result" | "unclear";
  strength: number;
  finding: string | null;
  sample_size?: number | null;
  sample_size_display?: string | null;
  study_type_label?: string | null;
}

export interface TierSummary {
  id: string;
  label: string;
  plural: string;
  counted: boolean;
  papers: ProcessedPaper[];
  counts: {
    supports: number;
    contradicts: number;
    mixed: number;
    no_result: number;
    unclear: number;
  };
  n: number;
  share: number;
  interval: [number, number];
  verdict: "few" | "mostly_for" | "leans_for" | "mostly_against" | "leans_against" | "split";
}

export const THRESHOLDS = {
  onTopic: 0.5,
  direct: 0.5,
  stance: 0.6,
  minPapers: 3,
  metaOverride: 0.8
};

export const TIERS = [
  { id: "meta", label: "Meta-analyses & systematic reviews", plural: "meta-analyses and systematic reviews", counted: true },
  { id: "rct", label: "Randomized trials", plural: "randomized trials", counted: true },
  { id: "observational", label: "Observational studies", plural: "observational studies", counted: true },
  { id: "case", label: "Case reports & series", plural: "case reports and series", counted: true },
  { id: "animal", label: "Animal studies", plural: "animal studies", counted: true },
  { id: "cell", label: "Cell & molecular studies", plural: "cell and molecular studies", counted: true },
  { id: "review", label: "Reviews & commentary", plural: "reviews and commentary", counted: false }
];

export const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t]));

export const DESIGN_TO_TIER: Record<string, string | null> = {
  meta_analysis: "meta",
  rct: "rct",
  observational: "observational",
  case_report: "case",
  animal: "animal",
  in_vitro: "cell",
  review: "review",
  other: null
};

export const PUBTYPE_RULES = [
  { types: ["Meta-Analysis", "Systematic Review"], tier: "meta" },
  { types: ["Randomized Controlled Trial, Veterinary", "Clinical Trial, Veterinary", "Observational Study, Veterinary"], tier: "animal" },
  { types: ["Randomized Controlled Trial"], tier: "rct" },
  { types: ["Case Reports"], tier: "case" },
  { types: ["Observational Study"], tier: "observational" },
  {
    types: [
      "Review",
      "Editorial",
      "Comment",
      "Letter",
      "News",
      "Guideline",
      "Practice Guideline",
      "Consensus Development Conference",
      "Consensus Development Conference, NIH"
    ],
    tier: "review"
  }
];

export const EXCLUDED_PUBTYPES: Record<string, string> = {
  "Retracted Publication": "retracted",
  "Retraction of Publication": "notice",
  "Published Erratum": "notice",
  "Expression of Concern": "notice"
};

export const STANCES = ["supports", "mixed", "contradicts", "no_result"] as const;

export const STANCE_LABEL: Record<string, string> = {
  supports: "For the claim",
  contradicts: "Against the claim",
  mixed: "Mixed",
  no_result: "No result on the claim",
  unclear: "Unclear"
};

export const VERDICT_LABEL: Record<string, string> = {
  few: "Too few to say",
  mostly_for: "Mostly for",
  leans_for: "Leans for",
  split: "Split",
  leans_against: "Leans against",
  mostly_against: "Mostly against"
};

export const VERDICT_DESCRIPTIONS: [string, string][] = [
  ["few", `Fewer than ${THRESHOLDS.minPapers} papers with a verdict.`],
  ["mostly_for", "The lower end of the 95% interval is above 50% and the share for is at least 75%."],
  ["leans_for", "The lower end of the 95% interval is above 50%."],
  ["mostly_against", "The upper end of the 95% interval is below 50% and the share for is at most 25%."],
  ["leans_against", "The upper end of the 95% interval is below 50%."],
  ["split", "The 95% interval includes 50%."]
];

export function wilsonScore(successes: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const factor = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / factor;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / factor;
  return [Math.max(0, center - spread), Math.min(1, center + spread)];
}

function argmax(record: Record<string, number>): [string, number] {
  let bestKey = "";
  let bestVal = -1;
  for (const k in record) {
    if (record[k] > bestVal) {
      bestKey = k;
      bestVal = record[k];
    }
  }
  return [bestKey, bestVal];
}

export function classifyPaper(paper: Paper, judgment: Judgment): ProcessedPaper {
  // Stance averaging over the two worded questions
  const stanceProbs: Record<string, number> = {};
  for (const st of STANCES) {
    stanceProbs[st] = ((judgment.stance?.[st] ?? 0) + (judgment.stanceCheck?.[st] ?? 0)) / 2;
  }

  const [topStance] = argmax(judgment.stance || {});
  const [topCheck] = argmax(judgment.stanceCheck || {});
  const [topAvg, avgProb] = argmax(stanceProbs);

  const agree = topStance === topCheck;
  const category = (agree && topStance === topAvg && avgProb >= THRESHOLDS.stance
    ? (topAvg as ProcessedPaper["category"])
    : "unclear");

  // Determine study design tier
  let resolvedTier: string | null = null;
  let resolvedSource: ProcessedPaper["tierSource"] = { kind: "none" };

  const [modelDesign, modelProb] = judgment.design ? argmax(judgment.design) : ["other", 0];

  // 1. Check PubMed Publication Type indexing rules
  for (const rule of PUBTYPE_RULES) {
    const matchedType = rule.types.find((t) => paper.pubTypes?.includes(t));
    if (matchedType) {
      if (rule.tier === "review" && matchedType === "Review" && modelDesign === "meta_analysis" && modelProb >= THRESHOLDS.metaOverride) {
        resolvedTier = "meta";
        resolvedSource = { kind: "model", design: modelDesign, p: modelProb };
        break;
      }
      resolvedTier = rule.tier;
      resolvedSource = { kind: "pubmed", type: matchedType };
      break;
    }
  }

  // 2. Fallback to model's predicted study design
  if (!resolvedTier && judgment.design) {
    resolvedTier = DESIGN_TO_TIER[modelDesign] ?? null;
    resolvedSource = { kind: "model", design: modelDesign, p: modelProb };
  }

  const onTopic = (judgment.onTopic ?? 1) >= THRESHOLDS.onTopic;
  const direct = (judgment.direct ?? 1) >= THRESHOLDS.direct;

  const findingSentence =
    paper.sentences && judgment.finding?.index !== undefined
      ? paper.sentences[judgment.finding.index] ?? null
      : paper.findingText ?? null;

  return {
    paper,
    judgment,
    tier: resolvedTier,
    tierSource: resolvedSource,
    onTopic,
    direct,
    probs: stanceProbs,
    agree,
    category,
    strength: avgProb,
    finding: findingSentence,
    sample_size: paper.sample_size,
    sample_size_display: paper.sample_size_display,
    study_type_label: paper.study_type_label
  };
}

export function computeSwarmY(xPositions: number[], y0 = 0, padding = 1.5): number[] {
  const d = 13 + padding; // minimum spacing between dots
  const indexed = xPositions.map((x, idx) => [x, idx] as [number, number]).sort((a, b) => a[0] - b[0]);
  const yOffsets = new Array(xPositions.length).fill(0);
  const placed: { x: number; y: number }[] = [];
  let left = 0;

  for (const [x, idx] of indexed) {
    while (left < placed.length && x - placed[left].x >= d) {
      left++;
    }
    const nearby = placed.slice(left);
    const intervals: [number, number][] = [];
    const candidates = [0];

    for (const pt of nearby) {
      const yDist = Math.sqrt(Math.max(0, d * d - (x - pt.x) ** 2));
      intervals.push([pt.y - yDist, pt.y + yDist]);
      candidates.push(pt.y - yDist, pt.y + yDist);
    }

    candidates.sort((a, b) => Math.abs(a) - Math.abs(b));
    const chosen = candidates.find((cand) => intervals.every(([low, high]) => cand <= low + 1e-6 || cand >= high - 1e-6)) ?? 0;

    yOffsets[idx] = chosen;
    placed.push({ x, y: chosen });
  }

  return yOffsets;
}

export function computeTierSummaries(papers: ProcessedPaper[], directOnly = false): TierSummary[] {
  const eligible = papers.filter((p) => p.onTopic && p.tier && (!directOnly || p.direct));

  return TIERS.map((tier) => {
    const tierPapers = eligible.filter((p) => p.tier === tier.id);
    const counts = { supports: 0, contradicts: 0, mixed: 0, no_result: 0, unclear: 0 };

    for (const p of tierPapers) {
      counts[p.category]++;
    }

    const n = counts.supports + counts.contradicts + counts.mixed;
    const numerator = counts.supports + counts.mixed / 2;
    const share = n > 0 ? numerator / n : 0;
    const interval = wilsonScore(numerator, n, 1.96);

    let verdict: TierSummary["verdict"] = "few";
    if (n < THRESHOLDS.minPapers) {
      verdict = "few";
    } else if (interval[0] > 0.5) {
      verdict = share >= 0.75 ? "mostly_for" : "leans_for";
    } else if (interval[1] < 0.5) {
      verdict = share <= 0.25 ? "mostly_against" : "leans_against";
    } else {
      verdict = "split";
    }

    return {
      id: tier.id,
      label: tier.label,
      plural: tier.plural,
      counted: tier.counted,
      papers: tierPapers,
      counts,
      n,
      share,
      interval,
      verdict
    };
  });
}

const VERDICT_POLARITY: Record<string, number> = {
  few: 0,
  split: 0,
  mostly_for: 1,
  leans_for: 1,
  leans_against: -1,
  mostly_against: -1
};

const VERDICT_PHRASING_1: Record<string, string> = {
  few: "has too few papers to say",
  mostly_for: "mostly supports the claim",
  leans_for: "leans toward the claim",
  split: "is split",
  leans_against: "leans against the claim",
  mostly_against: "mostly goes against the claim"
};

const VERDICT_PHRASING_2: Record<string, string> = {
  few: "are too few to say",
  mostly_for: "mostly support it",
  leans_for: "lean toward it",
  split: "are split",
  leans_against: "lean against it",
  mostly_against: "mostly go against it"
};

export function generateHeadline(
  summaries: TierSummary[],
  totalCount: number
): { text: string; detail: string | null; context: string | null; tone: number } {
  const withVerdict = summaries.filter((s) => s.counted && s.verdict !== "few");

  if (!withVerdict.length) {
    return {
      text: "There are too few papers with a verdict to say which way this literature leans.",
      detail: null,
      context: null,
      tone: 0
    };
  }

  const primary = withVerdict[0];
  const primaryTone = VERDICT_POLARITY[primary.verdict];
  const headline = `The strongest evidence here, ${primary.n} ${primary.plural}, ${VERDICT_PHRASING_1[primary.verdict]}.`;

  const contrasting = withVerdict.slice(1).find((s) => VERDICT_POLARITY[s.verdict] !== 0 && VERDICT_POLARITY[s.verdict] !== primaryTone);

  let detail: string | null = null;
  if (contrasting) {
    const sharePct = `${Math.round(contrasting.share * 100)}%`;
    const shareDesc = `(${sharePct} of ${contrasting.n} for)`;
    const capPlural = contrasting.plural.charAt(0).toUpperCase() + contrasting.plural.slice(1);
    detail = `${capPlural} ${primaryTone === 0 ? VERDICT_PHRASING_2[contrasting.verdict] : "point the other way"} ${shareDesc}.`;
  }

  const largest = [...withVerdict].sort((a, b) => b.n - a.n)[0];
  const context =
    largest !== primary && largest !== contrasting
      ? `Most papers with a verdict are ${largest.plural} (${largest.n}), which ${VERDICT_PHRASING_2[largest.verdict]}.`
      : null;

  return {
    text: headline,
    detail,
    context,
    tone: primaryTone
  };
}

export function publishedMethod() {
  return {
    version: "0.1",
    date: "2026-09-23",
    search: {
      sizes: [100, 200, 300],
      defaultSize: 200,
      filters: "hasabstract AND english[la]",
      researchOnly: "NOT ((review[pt] NOT systematic[sb]) OR editorial[pt] OR comment[pt] OR letter[pt] OR news[pt])",
      sort: "PubMed Best Match"
    },
    thresholds: THRESHOLDS,
    state: {
      claim: "the claim as typed",
      paper: {
        title: "the paper's title",
        abstract: "the abstract, one sentence per line, each prefixed with its id (S01| ...)"
      }
    },
    questions: {
      on_topic: {
        type: "bool",
        instructions: "Does the paper investigate the relationship described in the claim?",
        criteria: {
          true: "The paper studies or reviews the same kind of exposure or intervention and the same kind of outcome as the claim, in any population, species or model",
          false: "The paper is about a different question, or mentions the claim's topic only in passing"
        }
      },
      stance: {
        type: "choice",
        instructions: "What do the paper's own results say about the claim?",
        criteria: {
          supports: "The paper's results or conclusions agree with the claim",
          contradicts: "The paper's results or conclusions disagree with the claim",
          mixed: "Some results agree with the claim and others disagree, for example across outcomes, doses, subgroups or time",
          no_result: "The paper reports no result that bears on the claim"
        }
      },
      stance_check: {
        type: "choice",
        instructions: "Taken as a whole, which way does the paper's evidence point on the claim?",
        criteria: {
          supports: "The paper's results or conclusions agree with the claim",
          contradicts: "The paper's results or conclusions disagree with the claim",
          mixed: "Some results agree with the claim and others disagree",
          no_result: "The paper reports no result that bears on the claim"
        }
      },
      direct: {
        type: "bool",
        instructions: "Does the paper test the claim directly?",
        criteria: {
          true: "The paper studies the same population, exposure or intervention, and outcome that the claim names",
          false: "The paper uses a different population, species or laboratory model, or a stand-in exposure or outcome"
        }
      },
      design: {
        type: "choice",
        instructions: "What kind of study is this paper?",
        criteria: {
          meta_analysis: "Systematic review or meta-analysis that pools results from several studies",
          rct: "Randomized controlled trial in people",
          observational: "Study of people without random assignment: cohort, case-control, cross-sectional, registry, database or retrospective analysis, or a non-randomized trial",
          case_report: "Case report or case series describing individual patients",
          animal: "Experiments in live animals",
          in_vitro: "Laboratory experiments on cells, tissues or molecules without live animals",
          review: "Narrative review, commentary, editorial, guideline or opinion without its own pooled analysis",
          other: "Modeling, simulation, methods, protocol or anything else"
        }
      },
      finding: {
        type: "choice",
        instructions: "Which sentence of the abstract reports this paper's own result that bears most directly on the claim?",
        criteria: {}
      }
    },
    studyTypes: {
      rows: TIERS.map(({ id, label, counted }) => ({ id, label, countedInVerdict: counted })),
      pubmedRules: PUBTYPE_RULES,
      modelFallback: DESIGN_TO_TIER,
      excluded: EXCLUDED_PUBTYPES
    },
    verdict: {
      counted: "Papers on topic whose two readings agree on for, against or mixed with an average of at least the stance threshold. Mixed counts as half for.",
      share: "share for = (for + mixed / 2) / (for + mixed + against)",
      interval: "Wilson score interval, 95%",
      rules: VERDICT_DESCRIPTIONS.map(([id, rule]) => ({ id, label: VERDICT_LABEL[id], rule }))
    }
  };
}

export const PRESET_EXAMPLES = [
  {
    id: "hrt",
    label: "HRT and heart disease",
    claim: "Hormone replacement therapy reduces the risk of coronary heart disease in postmenopausal women",
    query: "Hormone replacement therapy coronary heart disease postmenopausal women"
  },
  {
    id: "anesthesia",
    label: "Anesthesia and cancer recurrence",
    claim: "Volatile anesthesia during cancer surgery increases cancer recurrence compared with propofol",
    query: "Volatile anesthesia propofol cancer recurrence surgery"
  },
  {
    id: "vitamin-d",
    label: "Vitamin D and fractures",
    claim: "Vitamin D supplementation reduces the risk of fractures in older adults",
    query: "Vitamin D supplementation fractures older adults"
  },
  {
    id: "metformin",
    label: "Metformin and lifespan",
    claim: "Metformin extends lifespan",
    query: "Metformin lifespan aging"
  }
];
