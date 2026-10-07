import type * as React from 'react'

/**
 * Chart chrome, shared by every recharts view.
 *
 * Recharts renders its tooltip into a plain div with inline styles, so it does
 * not pick up the theme on its own — left alone it is a white box on a dark
 * page. These are the popover tokens, so it follows the theme like everything
 * else. Kept out of the component file so a page can style a chart without
 * pulling recharts into its chunk.
 */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--popover-foreground)',
  fontSize: '12px',
}

/** Axis styling shared by every chart: small, muted, no spine. */
export const CHART_AXIS = {
  tick: { fontSize: 10, fill: 'var(--muted-foreground)' },
  tickLine: false,
  axisLine: false,
} as const

/** Grid styling: horizontal rules only — vertical ones fight the bars. */
export const CHART_GRID = {
  strokeDasharray: '3 3',
  stroke: 'var(--border)',
  vertical: false,
} as const

/** Left margin pulls the plot back over the Y-axis gutter recharts reserves. */
export const PLOT_MARGIN = { top: 4, right: 4, bottom: 0, left: -18 } as const
