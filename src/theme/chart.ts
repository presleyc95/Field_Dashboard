/**
 * Chart colors. Hex values (not CSS variables) because Recharts draws SVG attributes.
 * Single-series charts use the brand accent; the categorical set is for charts with several
 * series and was checked with the dataviz palette validator against the panel color (#171717):
 * lightness band, chroma, colorblind (CVD) separation ≥ 8, normal-vision ≥ 15, contrast ≥ 3:1.
 * Assign categorical colors in this order and never cycle; past six, fold into "Other".
 */
export const CHART = {
  accent: "#f97316",
  /** De-emphasized marks: previous period, non-selected bars. */
  muted: "#525252",
  grid: "#262626",
  axis: "#404040",
  tick: "#737373",
  surface: "#171717",
  tooltipBg: "#0a0a0a",
} as const;

export const CATEGORICAL = ["#d95926", "#3987e5", "#199e70", "#c98500", "#d55181", "#9085e9"] as const;
export const OTHER_COLOR = "#525252";
