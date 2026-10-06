import type { Capture, VisualDNAV1 } from '../../types.js';
import type { VisualDNAV2 } from './types.js';
import { context } from './context.js';
import { analyzeColors } from './colors.js';
import { analyzeTypography } from './typography.js';
import { analyzeSpacing } from './spacing.js';
import { analyzeLayout } from './layout.js';
import { analyzeComponents } from './components.js';
import { analyzeResponsive } from './responsive.js';
import { analyzeMotion } from './motion.js';
import { styleTokens } from './tokens.js';
import { analyzeIdentity, summarize } from './identity.js';
export function analyzeSemantic(capture: Capture, raw: VisualDNAV1): VisualDNAV2 {
  const ctx = context(capture.desktop.elements);
  const colors = analyzeColors(capture.desktop, ctx),
    typography = analyzeTypography(ctx),
    spacing = analyzeSpacing(ctx),
    layout = analyzeLayout(capture.desktop, ctx),
    motion = analyzeMotion(capture);
  const tokens: VisualDNAV2['tokens'] = {
    colors: colors.roles,
    typography: typography.roles,
    spacing: spacing.tokens,
    radius: styleTokens(ctx, 'borderRadius', 'radius'),
    shadows: styleTokens(ctx, 'boxShadow', 'shadow'),
    motion: motion.tokens,
  };
  const componentFamilies = analyzeComponents(ctx, tokens, colors.palette),
    responsive = analyzeResponsive(capture);
  const identity = analyzeIdentity(ctx, { colors, spacing, layout, componentFamilies });
  const known = Object.values(colors.roles).filter((r) => r.value !== null).length;
  const base: Omit<VisualDNAV2, 'designSummary'> = {
    schemaVersion: '2.0',
    source: raw.source,
    methodology: {
      ...raw.methodology,
      frequencyUnit:
        'Color property occurrence frequency and coarse background coverage estimate are separate metrics',
      warnings: [
        ...raw.methodology.warnings,
        'Coverage is a 32 × 64 page-grid estimate of opaque background boxes, not pixel analysis; stacking, imagery and transparency may alter actual appearance.',
        'Semantic scoring is heuristic, not calibrated probability. Unclassified structures remain in RAW.',
      ],
    },
    identity,
    colors,
    typography,
    spacing,
    tokens,
    layout,
    componentFamilies,
    responsive,
    motion,
    confidence: {
      method:
        'Equal-weight independent signals × observation reliability; minimum support 0.55. See docs/VISUAL_DNA.md.',
      coverage: known / Object.keys(colors.roles).length,
      knownColorRoles: known,
      totalColorRoles: Object.keys(colors.roles).length,
    },
  };
  return { ...base, designSummary: summarize(base) };
}
