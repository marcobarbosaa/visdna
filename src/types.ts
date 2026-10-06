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
  pageWidth?: number;
  inspectedNodes?: number;
  width: number;
  height: number;
  pageHeight: number;
  elements: ElementSample[];
  truncated: boolean;
}
export interface MotionFrame {
  scrollY?: number;
  sectionIds?: string[];
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
  screenshots?: ScreenshotManifest;
  captureCoverage?: CaptureCoverage;
  visualStates?: VisualState[];
  canvasRegions?: Omit<
    VisualState,
    'checkpoint' | 'scrollY' | 'phase' | 'signature' | 'sectionIds'
  >[];
  mobileFrames?: MotionFrame[];
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
  artifacts?: ScreenshotManifest & { raw: boolean };
  captureCoverage?: CaptureCoverage;
  id: string;
  url: string;
  domain: string;
  createdAt: string;
  stage: Stage;
  error?: string;
  dna?: VisualDNA;
}

export type VisualDNA = VisualDNAV1 | import('./analysis/semantic/types.js').VisualDNAV2;

export interface ScreenshotManifest {
  desktop: boolean;
  mobile: boolean;
  fullPage: boolean;
  segments: { index: number; file: string; startY: number; endY: number; width: number }[];
}
export interface TraversalCoverage {
  observedFrom: number;
  observedTo: number;
  coverage: number;
  reachedBottom: boolean;
  checkpoints: number[];
  stopReason: 'bottom' | 'checkpoints' | 'deadline';
}
export interface CaptureCoverage {
  pageHeight: number;
  pageWidth: number;
  dom: {
    sampledElements: number;
    initialElements: number;
    addedElements: number;
    truncated: boolean;
  };
  scroll: TraversalCoverage;
  mobile: TraversalCoverage & { pageHeight: number; sampledElements: number; truncated: boolean };
  screenshots: { coverage: number; horizontalCoverage: number };
  motion: { checkpoints: number; canvasRegions: number; visualSamples: number; limited: boolean };
}
export interface VisualState {
  id: string;
  type: 'canvas';
  checkpoint: number;
  scrollY: number;
  phase: 'arrival' | 'settled';
  rect: ElementSample['rect'];
  position: string;
  zIndex: string;
  opacity: string;
  transform: string;
  visualStateObserved: boolean;
  signature: number[] | null;
  sectionIds: string[];
}
