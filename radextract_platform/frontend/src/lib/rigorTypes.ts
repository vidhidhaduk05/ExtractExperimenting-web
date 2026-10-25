export interface RigorEvidence {
  kind: "sentence" | "paragraph" | "table" | "figure";
  text: string;
  section: string;
  page: number;
  rects?: number[][];
  paraRects?: any;
}

export interface RigorCheck {
  id: string;
  label: string;
  question: string;
  domain: "design" | "stats" | "materials" | "openness" | "ethics" | "claims";
  guideline?: string | null;
  polarity: "good" | "bad";
  applies: boolean;
  p: number;
  evidence: number;
  outcome: "good" | "mid" | "bad";
  status: string;
  ev?: RigorEvidence | null;
}

export interface RigorDomain {
  id: "design" | "stats" | "materials" | "openness" | "ethics" | "claims";
  label: string;
  score: number;
  total: number;
  good: number;
  answered: boolean;
}

export interface RigorGate {
  id: string;
  label: string;
  value: number;
  on: boolean;
}

export interface RigorJudgment {
  id: string;
  label: string;
  short: string[];
  probabilities: number[];
  score: number;
  confidence: number;
}

export interface SoftwareCheckItem {
  status: "pass" | "info" | "bad" | "none";
  title: string;
  detail: string;
  meta?: string;
  link?: string;
  loc?: any;
  check?: string;
  task?: any;
}

export interface SoftwareCheckModule {
  id: string;
  label: string;
  status: "pass" | "info" | "bad" | "none";
  summary: string;
  items: SoftwareCheckItem[];
}

export interface RigorScanView {
  paper: {
    title: string;
    doi?: string;
    pages: number;
  };
  checks: RigorCheck[];
  index: number;
  domains: RigorDomain[];
  gates: RigorGate[];
  judgments: RigorJudgment[];
  software: SoftwareCheckModule[];
  timings?: Record<string, number>;
  counts: {
    good: number;
    mid: number;
    bad: number;
    skipped: number;
  };
}

export interface RigorScanResult {
  view: RigorScanView;
  pdfUrl?: string;
  citation?: {
    authors?: string;
    venue?: string;
    year?: number | string;
    doi?: string;
    license?: string;
    licenseUrl?: string;
  };
  engine?: string;
}
