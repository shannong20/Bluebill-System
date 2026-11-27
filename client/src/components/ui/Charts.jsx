/**
 * Dependency-free SVG charts.
 * The design only needs donuts and rings, so hand-rolling them keeps the
 * bundle small and gives exact control over the colours.
 */

/** Payment-method palette, matching the design's donut. */
export const CHART_COLORS = ['#14b8a6', '#1a8df0', '#f59e0b', '#ef4444', '#8b5cf6'];

const polar = (cx, cy, r, angleDeg) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

/**
 * Donut chart. `slices` = [{ label, value, color? }]
 * When `centerLabel`/`centerValue` are given they render inside the hole.
 */
export function Donut({
  slices = [],
  size = 168,
  thickness = 26,
  centerValue,
  centerLabel,
}) {
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Nothing to draw — render an empty track so the layout stays stable.
  if (total <= 0) {
    return (
      <svg width={size} height={size} role="img" aria-label="No data">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
        {centerValue != null && (
          <text x={cx} y={cy - 1} textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f1c2b">
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text x={cx} y={cy + 15} textAnchor="middle" fontSize="11" fill="#4e6174">
            {centerLabel}
          </text>
        )}
      </svg>
    );
  }

  // A single slice covering 100% would render as a full circle; an arc
  // path degenerates, so fall back to a stroked circle.
  const single = slices.filter((s) => (Number(s.value) || 0) > 0).length === 1;

  let angle = 0;
  const arcs = slices
    .filter((s) => (Number(s.value) || 0) > 0)
    .map((slice, i) => {
      const pct = (Number(slice.value) || 0) / total;
      const start = angle;
      const end = angle + pct * 360;
      angle = end;
      const color = slice.color || CHART_COLORS[i % CHART_COLORS.length];

      if (single) {
        return (
          <circle
            key={slice.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
          />
        );
      }

      const a = polar(cx, cy, r, start);
      const b = polar(cx, cy, r, end);
      const large = end - start > 180 ? 1 : 0;

      return (
        <path
          key={slice.label}
          d={`M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="butt"
        />
      );
    });

  return (
    <svg width={size} height={size} role="img" aria-label="Breakdown chart">
      {arcs}
      {centerValue != null && (
        <text x={cx} y={cy - 1} textAnchor="middle" fontSize="17" fontWeight="800" fill="#0f1c2b">
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize="11" fill="#4e6174">
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

/**
 * Circular progress ring used on the Employees page.
 * `tone` picks the track colour: success / info / danger.
 */
const TONE_COLORS = { success: '#047857', info: '#0275b8', danger: '#dc2626', warning: '#b45309' };

export function Ring({ value = 0, size = 84, thickness = 8, tone = 'info', children }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${pct}%`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={TONE_COLORS[tone] || TONE_COLORS.info}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 14,
        }}
      >
        {children ?? `${pct}%`}
      </div>
    </div>
  );
}

/** Donut + legend, the exact composition used on the Reports screen. */
export function DonutWithLegend({ slices, centerValue, centerLabel, formatValue = String }) {
  return (
    <div className="donut-wrap">
      <Donut slices={slices} centerValue={centerValue} centerLabel={centerLabel} />
      <div className="legend">
        {slices.map((slice, i) => (
          <div className="legend__row" key={slice.label}>
            <span
              className="legend__dot"
              style={{ background: slice.color || CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="legend__label">{slice.label}</span>
            <span className="legend__val">{formatValue(slice.value)}</span>
            <span className="legend__pct">
              {slice.percent != null ? `(${slice.percent}%)` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 * Period charts for the Reporting Engine (Daily / Weekly / Monthly / Yearly).
 * Still no chart library — plain SVG so the visuals stay on-spec and the
 * bundle stays tiny.
 * ------------------------------------------------------------------------ */

/** Shared plot frame: paddings for every period chart. */
const PLOT = { padTop: 10, padRight: 8, padBottom: 22, padLeft: 8 };

/** Evenly spaced tick labels; thinned so they never overlap. */
function AxisLabels({ labels, xFor, y }) {
  const step = Math.max(1, Math.ceil(labels.length / 12));
  return (
    <g>
      {labels.map((label, i) =>
        i % step === 0 || i === labels.length - 1 ? (
          <text
            key={`${label}-${i}`}
            x={xFor(i)}
            y={y}
            textAnchor="middle"
            fontSize="11"
            fill="#4e6174"
          >
            {label}
          </text>
        ) : null,
      )}
    </g>
  );
}

/**
 * Grouped bar chart. `series` = [{ label, data: [n…], color? }],
 * `labels` = x-axis captions. Bars scale to the tallest value.
 */
export function BarChart({
  labels = [],
  series = [],
  height = 180,
  width = 560,
  formatValue = String,
}) {
  const innerW = width - PLOT.padLeft - PLOT.padRight;
  const innerH = height - PLOT.padTop - PLOT.padBottom;
  const max = Math.max(1, ...series.flatMap((s) => s.data.map((v) => Number(v) || 0)));
  const groupW = innerW / Math.max(1, labels.length);
  const barW = Math.max(2, Math.min(14, (groupW - 4) / Math.max(1, series.length)));
  const yFor = (v) => PLOT.padTop + innerH - (Number(v || 0) / max) * innerH;
  const groupX = (i) => PLOT.padLeft + i * groupW;

  if (series.length === 0) return null;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Bar chart"
      style={{ display: 'block' }}
    >
      {/* faint gridlines + baseline */}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={PLOT.padLeft}
          x2={width - PLOT.padRight}
          y1={PLOT.padTop + innerH * (1 - f)}
          y2={PLOT.padTop + innerH * (1 - f)}
          stroke="#eef2f7"
          strokeWidth={1}
        />
      ))}
      <line
        x1={PLOT.padLeft}
        x2={width - PLOT.padRight}
        y1={PLOT.padTop + innerH}
        y2={PLOT.padTop + innerH}
        stroke="#d7e0ea"
        strokeWidth={1}
      />

      {labels.map((label, i) => {
        const gx = groupX(i);
        const clusterW = barW * series.length;
        return series.map((s, si) => {
          const value = Number(s.data[i]) || 0;
          const y = yFor(value);
          const color = s.color || CHART_COLORS[si % CHART_COLORS.length];
          return (
            <rect
              key={`${s.label}-${label}`}
              x={gx + (groupW - clusterW) / 2 + si * barW}
              y={value > 0 ? y : PLOT.padTop + innerH}
              width={Math.max(1, barW - 2)}
              height={value > 0 ? Math.max(1, PLOT.padTop + innerH - y) : 1}
              rx={2}
              fill={color}
            >
              <title>{`${label} · ${s.label}: ${formatValue(value)}`}</title>
            </rect>
          );
        });
      })}

      <AxisLabels labels={labels} xFor={(i) => groupX(i) + groupW / 2} y={height - 7} />
    </svg>
  );
}

/**
 * Multi-series line chart. `series` = [{ label, data: [n…], color?, area? }].
 * When `area` is true the space under the line is softly filled.
 */
export function LineChart({
  labels = [],
  series = [],
  height = 180,
  width = 560,
  formatValue = String,
}) {
  const innerW = width - PLOT.padLeft - PLOT.padRight;
  const innerH = height - PLOT.padTop - PLOT.padBottom;
  const max = Math.max(1, ...series.flatMap((s) => s.data.map((v) => Number(v) || 0)));
  const step = labels.length > 1 ? innerW / (labels.length - 1) : 0;
  const xFor = (i) => PLOT.padLeft + (labels.length > 1 ? i * step : innerW / 2);
  const yFor = (v) => PLOT.padTop + innerH - (Number(v || 0) / max) * innerH;

  if (series.length === 0) return null;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Line chart"
      style={{ display: 'block' }}
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={PLOT.padLeft}
          x2={width - PLOT.padRight}
          y1={PLOT.padTop + innerH * (1 - f)}
          y2={PLOT.padTop + innerH * (1 - f)}
          stroke="#eef2f7"
          strokeWidth={1}
        />
      ))}

      {series.map((s, si) => {
        const color = s.color || CHART_COLORS[si % CHART_COLORS.length];
        const points = s.data.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
        const areaPath =
          s.area && labels.length > 1
            ? `M ${xFor(0)} ${PLOT.padTop + innerH} L ${s.data
                .map((v, i) => `${xFor(i)},${yFor(v)}`)
                .join(' L ')} L ${xFor(labels.length - 1)} ${PLOT.padTop + innerH} Z`
            : null;
        return (
          <g key={s.label}>
            {areaPath && <path d={areaPath} fill={color} opacity={0.1} />}
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {s.data.map((v, i) => (
              <circle key={`${s.label}-${labels[i]}`} cx={xFor(i)} cy={yFor(v)} r={2.5} fill={color}>
                <title>{`${labels[i]} · ${s.label}: ${formatValue(v)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}

      <line
        x1={PLOT.padLeft}
        x2={width - PLOT.padRight}
        y1={PLOT.padTop + innerH}
        y2={PLOT.padTop + innerH}
        stroke="#d7e0ea"
        strokeWidth={1}
      />
      <AxisLabels labels={labels} xFor={xFor} y={height - 7} />
    </svg>
  );
}

/** Compact dot + label + value strip shown under the period charts. */
export function ChartLegend({ items = [] }) {
  return (
    <div className="chart-legend">
      {items.map((item, i) => (
        <div className="chart-legend__row" key={item.label}>
          <span
            className="legend__dot"
            style={{ background: item.color || CHART_COLORS[i % CHART_COLORS.length] }}
          />
          <span className="chart-legend__label">{item.label}</span>
          <span className="chart-legend__val">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
