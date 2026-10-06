export type CSS = Record<string, string>;
export interface ElementSample {
  id: string;
  parent: string | null;
  tag: string;
  role: string;
  children: number;
  textLength: number;
  rect: { x: number; y: number; width: number; height: number };
  styles: CSS;
}
export interface Snapshot {
  width: number;
  height: number;
  pageHeight: number;
  elements: ElementSample[];
  truncated: boolean;
}
export interface MotionFrame {
  progress: number;
  elements: {
    id: string;
    y: number;
    opacity: string;
    transform: string;
    filter: string;
    position: string;
  }[];
}
export interface Capture {
  desktop: Snapshot;
  mobile: Snapshot;
  frames: MotionFrame[];
  warnings: string[];
  finalUrl: string;
}
export interface Token {
  value: string;
  count: number;
  frequency: number;
}
export interface Inference {
  value: string | null;
  confidence: number;
  evidence: string[];
}
export interface Component {
  type: string;
  elementId: string;
  confidence: number;
  evidence: string[];
  styles: CSS;
  rect: ElementSample['rect'];
}
export interface VisualDNAV1 {
  schemaVersion: '1.0';
  source: { url: string; capturedAt: string; viewports: number[] };
  methodology: {
    sampledElements: number;
    truncated: boolean;
    frequencyUnit: string;
    warnings: string[];
  };
  colors: { palette: Token[]; roles: Record<string, Inference> };
  typography: {
    families: Token[];
    weights: Token[];
    sizes: Token[];
    lineHeights: Token[];
    tracking: Token[];
    scale: {
      role: string;
      size: string;
      family: string;
      weight: string;
      lineHeight: string;
      tracking: string;
    }[];
  };
  spacing: Token[];
  radius: Token[];
  shadows: Token[];
  backgrounds: Token[];
  containers: Token[];
  layout: {
    elementId: string;
    display: string;
    columns: string;
    gap: string;
    alignment: string;
    width: number;
    pattern: string;
  }[];
  components: Component[];
  motion: {
    elementId: string;
    transition: string;
    animation: string;
    transform: string;
    patterns: string[];
    confidence: number;
  }[];
  responsive: {
    desktopWidth: number;
    mobileWidth: number;
    changes: { elementId: string; desktop: CSS; mobile: CSS }[];
  };
}
export type Stage =
  | 'queued'
  | 'opening'
  | 'extracting'
  | 'scroll'
  | 'responsive'
  | 'colors'
  | 'typography'
  | 'components'
  | 'motion'
  | 'building'
  | 'complete'
  | 'error';
export interface AnalysisRecord {
  id: string;
  url: string;
  domain: string;
  createdAt: string;
  stage: Stage;
  error?: string;
  dna?: VisualDNA;
}

export type VisualDNA = VisualDNAV1 | import('./analysis/semantic/types.js').VisualDNAV2;
