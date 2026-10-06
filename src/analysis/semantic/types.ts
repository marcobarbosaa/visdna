import type { Capture, ElementSample, VisualDNAV1 } from '../../types.js';

export interface Finding<T> {
  value: T | null;
  confidence: number;
  evidence: string[];
}
export interface ColorFamily {
  value: string;
  members: string[];
  occurrenceFrequency: number;
  count: number;
  visualCoverageEstimate: number;
  luminance: number;
  chroma: number;
}
export interface TypeStyle {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  tracking: string;
}
export interface SpacingSystem {
  observed?: number[];
  sectionSpacing?: number[];
  baseUnit: Finding<number>;
  dominant: number[];
  tokens: Record<string, Finding<number>>;
  contexts: Record<string, { value: number; count: number }[]>;
}
export interface LayoutRegion {
  type: string;
  confidence: number;
  evidence: string[];
  width: number;
  height: number;
  columns: number | null;
  alignment: string;
}
export interface TokenReference {
  token: string | null;
  resolved: string | number;
}
export interface ComponentFamily {
  componentFamily: string;
  type: string;
  instances: number;
  confidence: number;
  evidence: string[];
  dimensions: { typicalWidth: number; typicalHeight: number };
  structure: {
    media: string | null;
    content: string;
    hasTitle: boolean;
    hasDescription: boolean;
    hasAction: boolean;
  };
  visualStyle: Record<string, TokenReference>;
  group: { count: number; layout: string };
}
export interface MotionPattern {
  type: string;
  instances: number;
  confidence: number;
  evidence: string[];
  duration: string | null;
  easing: string | null;
}
export interface VisualDNAV2 {
  schemaVersion: '2.0';
  source: VisualDNAV1['source'];
  methodology: VisualDNAV1['methodology'];
  identity: {
    theme: Finding<string>;
    density: Finding<string>;
    characteristics: Finding<string>[];
  };
  colors: { palette: ColorFamily[]; roles: Record<string, Finding<string>> };
  typography: {
    roles: Record<string, Finding<TypeStyle>>;
    personality: Record<string, Finding<string>>;
  };
  spacing: SpacingSystem;
  tokens: {
    colors: Record<string, Finding<string>>;
    typography: Record<string, Finding<TypeStyle>>;
    spacing: Record<string, Finding<number>>;
    radius: Record<string, Finding<string>>;
    shadows: Record<string, Finding<string>>;
    motion: Record<string, Finding<string>>;
  };
  layout: {
    regions: LayoutRegion[];
    desktopContainer: Finding<number>;
    viewportWidth?: number;
    pageShellWidth?: number;
    contentContainerWidth?: Finding<number>;
  };
  componentFamilies: ComponentFamily[];
  responsive: {
    observedViewports: number[];
    desktopContainer: Finding<number>;
    mobileContainer: Finding<number>;
    matchedElements: number;
    layoutChanges: Finding<string>[];
    typography: Record<string, Finding<string>>;
    limitation: string;
  };
  motion: {
    patterns: MotionPattern[];
    tokens: Record<string, Finding<string>>;
    limitation: string;
  };
  designSummary: Record<string, string>;
  confidence: {
    method: string;
    coverage: number;
    knownColorRoles: number;
    totalColorRoles: number;
  };
}
export interface RawAnalysis {
  schemaVersion: 'raw-2.0';
  capture: Capture;
  normalized: VisualDNAV1;
}
/** Optional future enrichment contract. No implementation, network call or automatic merge. */
export interface VisionAnalyzer {
  analyze(input: {
    screenshots: {
      desktop: string;
      mobile: string;
      segments?: { file: string; startY: number; endY: number }[];
    };
    visualStates?: Capture['visualStates'];
    captureCoverage?: Capture['captureCoverage'];
    raw: RawAnalysis;
    deterministic: VisualDNAV2;
  }): Promise<{ interpretations: Finding<string>[]; provenance: string }>;
}
export interface SemanticContext {
  elements: ElementSample[];
  byId: Map<string, ElementSample>;
  children: Map<string, ElementSample[]>;
  region: Map<string, string>;
  descendants: (element: ElementSample) => ElementSample[];
}
