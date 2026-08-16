/* ============================================================
   SwarmBot — Shared UI components
   ============================================================ */
const { useState, useEffect, useRef, useMemo, useLayoutEffect } = React;

/* -------- Icon set (inline SVG, currentColor) ------------- */
function Icon({ name, size = 18, stroke = 2, ...rest }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
    stacks:    <><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
    services:  <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    tasks:     <><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    nodes:     <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h8M6 8v8M18 8v8M8 18h8"/></>,
    networks:  <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    volumes:   <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></>,
    secrets:   <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
    configs:   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/></>,
    registries:<><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/><path d="M3 7l3-4h12l3 4"/><path d="M3 7h18M9 11h6"/></>,
    users:     <><circle cx="9" cy="8" r="4"/><path d="M3 21a6 6 0 0 1 12 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a6 6 0 0 0-4.5-5.8"/></>,
    plus:      <><path d="M12 5v14M5 12h14"/></>,
    search:    <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    bell:      <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    chevronDown:<><path d="M6 9l6 6 6-6"/></>,
    chevronUp: <><path d="M6 15l6-6 6 6"/></>,
    chevronRight:<><path d="M9 18l6-6-6-6"/></>,
    chevronLeft: <><path d="M15 18l-9-6 9-6" transform="translate(6 0)"/></>,
    close:     <><path d="M18 6L6 18M6 6l18 12" transform="scale(.86) translate(2 2)"/></>,
    sun:       <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon:      <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09c0 .69.4 1.31 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.6.82 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.69 0-1.31.4-1.51 1z"/></>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    keys:      <><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L19 4l2 2-2 2-2-2-1.5 1.5L17 9l-2 2-1.5-1.5"/></>,
    cpu:       <><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></>,
    memory:    <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 10v4M11 10v4M15 10v4M19 10v4"/></>,
    disk:      <><rect x="2" y="14" width="20" height="6" rx="2"/><path d="M6 17h.01M10 17h.01M2 14l3-9h14l3 9"/></>,
    refresh:   <><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>,
    filter:    <><path d="M3 4h18l-7 9v6l-4 2v-8z"/></>,
    download:  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></>,
    play:      <><path d="M6 4l14 8-14 8z"/></>,
    pause:     <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    trash:     <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>,
    server:    <><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></>,
    load:      <><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-7"/></>,
    leader:    <><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></>,
    check:     <><path d="M5 12l5 5L20 7"/></>,
    eye:       <><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/></>,
    star:      <><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></>,
    map:       <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></>,
  };
  const p = paths[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {p}
    </svg>
  );
}

/* -------- Logo --------- */
function Logo() {
  return (
    <div className="topbar__logo">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-label="swarmbot.it">
        <g className="sb-logo__link sb-logo__link--1" stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round">
          <line x1="12" y1="16" x2="15.7" y2="9.4"/>
        </g>
        <g className="sb-logo__link sb-logo__link--2" stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round">
          <line x1="12" y1="16" x2="15.7" y2="22.6"/>
        </g>
        <g className="sb-logo__link sb-logo__link--3" stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round">
          <line x1="20.3" y1="9.4" x2="23" y2="14"/>
        </g>
        <g className="sb-logo__link sb-logo__link--4" stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round">
          <line x1="20.3" y1="22.6" x2="23" y2="18"/>
        </g>
        <circle className="sb-logo__dot sb-logo__dot--center" cx="9"  cy="16" r="3.4" fill="var(--primary-500)"/>
        <circle className="sb-logo__dot sb-logo__dot--top"    cx="18" cy="9"  r="2.4" fill="var(--primary-400)"/>
        <circle className="sb-logo__dot sb-logo__dot--bottom" cx="18" cy="23" r="2.4" fill="var(--primary-400)"/>
        <circle className="sb-logo__dot sb-logo__dot--right"  cx="25" cy="16" r="2.8" fill="var(--primary-600)"/>
      </svg>
      <div style={{display:"flex", flexDirection:"column", lineHeight:1.1}}>
        <span style={{fontWeight:800, fontSize:16, letterSpacing:"-0.02em"}}>
          swarmbot<span style={{color:"var(--primary-500)"}}>.it</span>
        </span>
        <span style={{fontSize:9.5, color:"var(--muted)", fontFamily:"var(--font-mono)", letterSpacing:".08em"}}>
          v2.14.0 · prod-eu-1
        </span>
      </div>
    </div>
  );
}

/* -------- Status Badge --------- */
function StatusBadge({ status }) {
  const opts = window.SBData.STATUS_OPTS;
  const cfg = opts[status] || { label: status, variant: "neutral" };
  return (
    <span className={`badge badge--${cfg.variant}`}>
      <span className={`dot dot--${cfg.variant === "neutral" ? "warning" : cfg.variant}`} style={{boxShadow:"none"}}/>
      {cfg.label}
    </span>
  );
}

/* -------- Tag --------- */
function Tag({ children, variant }) {
  const variantMap = {
    LEADER: "primary",
    MANAGER: "info",
    WORKER: "info",
    READY: "success",
    ACTIVE: "success",
    REACHABLE: "success",
    DRAIN: "warning",
    DOWN: "danger",
  };
  const v = variant || variantMap[children] || "neutral";
  return <span className={`tag ${v && v !== "neutral" ? `tag--${v}` : ""}`}>{children}</span>;
}

/* -------- Donut chart --------- */
function Donut({ value = 0, size = 88, stroke = 12, color, label, valueLabel }) {
  const c = color || "var(--primary-500)";
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--surface-2)" strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r}
                stroke={c} strokeWidth={stroke} fill="none"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.4,1)" }}/>
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center",
      }}>
        <div style={{ fontSize: size > 80 ? 18 : 13, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {valueLabel ?? `${Math.round(value)}%`}
        </div>
        {label && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, fontWeight: 600 }}>{label}</div>}
      </div>
    </div>
  );
}

/* -------- Sparkline / mini line --------- */
function Sparkline({ data, width = 100, height = 28, color = "var(--primary-500)", area = true, strokeWidth = 1.5, fluid = false }) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg width={fluid ? "100%" : width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={fluid ? "none" : "xMidYMid meet"} style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {area && <path d={areaPath} fill={`url(#${id})`}/>}
      <path d={path} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* -------- Larger histogram chart (Dashboard) --------- */
function LineChart({ series, width = 800, height = 240, labels, legend }) {
  /* series: [{name, data, color}] */
  const padL = 36, padR = 12, padT = 12, padB = 28;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const allValues = series.flatMap(s => s.data);
  const min = 0;
  const max = Math.max(100, Math.ceil(Math.max(...allValues) / 10) * 10);
  const range = max - min;
  const n = series[0].data.length;
  const stepX = w / (n - 1);
  const yTicks = 5;

  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    if (x < 0 || x > w) { setHover(null); return; }
    const i = Math.max(0, Math.min(n - 1, Math.round(x / stepX)));
    setHover(i);
  };

  const xLabelStep = Math.max(1, Math.floor(n / 8));

  return (
    <div ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
         style={{ position: "relative", width: "100%", overflow: "hidden" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Y grid */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const y = padT + (h / yTicks) * i;
          const val = Math.round(max - (range / yTicks) * i);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--chart-grid)" strokeWidth="1"/>
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--chart-axis)" fontFamily="var(--font-mono)">
                {val}%
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {labels && labels.map((lab, i) => {
          if (i % xLabelStep !== 0 && i !== n - 1) return null;
          const x = padL + i * stepX;
          return <text key={i} x={x} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--chart-axis)" fontFamily="var(--font-mono)">{lab}</text>;
        })}

        {/* Series areas + lines */}
        {series.map((s, si) => {
          const id = `area-${si}`;
          const points = s.data.map((v, i) => [padL + i * stepX, padT + (1 - (v - min) / range) * h]);
          const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
          const areaPath = `${linePath} L ${padL + (n-1)*stepX} ${padT + h} L ${padL} ${padT + h} Z`;
          return (
            <g key={si}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.18"/>
                  <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#${id})`}/>
              <path d={linePath} stroke={s.color} strokeWidth="1.75" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
            </g>
          );
        })}

        {/* Hover line + dots */}
        {hover != null && (
          <g>
            <line x1={padL + hover * stepX} x2={padL + hover * stepX}
                  y1={padT} y2={padT + h}
                  stroke="var(--chart-axis)" strokeDasharray="3 3" strokeWidth="1"/>
            {series.map((s, si) => {
              const v = s.data[hover];
              const x = padL + hover * stepX;
              const y = padT + (1 - (v - min) / range) * h;
              return <circle key={si} cx={x} cy={y} r="3.5" fill={s.color} stroke="var(--surface)" strokeWidth="2"/>;
            })}
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hover != null && (
        <div style={{
          position: "absolute",
          left: `calc(${((padL + hover * stepX) / width) * 100}% + 8px)`,
          top: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          boxShadow: "var(--shadow-2)",
          fontSize: 12,
          pointerEvents: "none",
          minWidth: 110,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            {labels[hover]} ago
          </div>
          {series.map((s, si) => (
            <div key={si} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }}/>
                {s.name}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{s.data[hover]}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------- Generic data table with sort+filter+pagination ------- */
function DataTable({ columns, rows, searchKeys, pageSize = 10, emptyText = "No results", initialSort, onRowClick }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort || null); // {key, dir}
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [query]);

  const filtered = useMemo(() => {
    if (!query || !searchKeys || searchKeys.length === 0) return rows;
    const q = query.toLowerCase();
    return rows.filter(r => searchKeys.some(k => {
      const v = r[k];
      if (v == null) return false;
      return String(v).toLowerCase().includes(q);
    }));
  }, [rows, query, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find(c => c.key === sort.key);
    const sortFn = col?.sortFn;
    return [...filtered].sort((a, b) => {
      let av = sortFn ? sortFn(a) : a[sort.key];
      let bv = sortFn ? sortFn(b) : b[sort.key];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ?  1 : -1;
      return 0;
    });
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key) => {
    if (!sort || sort.key !== key) setSort({ key, dir: "asc" });
    else if (sort.dir === "asc") setSort({ key, dir: "desc" });
    else setSort(null);
  };

  return (
    <>
      <div className="table-toolbar">
        <div className="table-toolbar__left">
          <input
            type="text"
            className="input input--search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {filtered.length} of {rows.length}
            </span>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="dt">
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th key={col.key}
                      style={{ width: col.width, textAlign: col.align }}
                      onClick={() => col.sortable !== false && toggleSort(col.key)}
                      className={active ? "dt__sort-active" : ""}>
                    {col.label}
                    {col.sortable !== false && (
                      <span className="dt__sort-icon">
                        {active && sort.dir === "asc" ? "↑" : active && sort.dir === "desc" ? "↓" : "↕"}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr><td colSpan={columns.length} className="t-empty">{emptyText}</td></tr>
            )}
            {paged.map((row, i) => (
              <tr key={row.id || row.name || i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: "pointer" } : undefined}>
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > pageSize && (
          <div className="pagination">
            <div>
              Showing <strong style={{color:"var(--text)"}}>{(page-1)*pageSize + 1}–{Math.min(page*pageSize, sorted.length)}</strong> of {sorted.length}
            </div>
            <div className="pagination__pages">
              <span className="pagination__page" onClick={() => setPage(Math.max(1, page-1))}>‹</span>
              {Array.from({length: totalPages}, (_, i) => i + 1).map(p => (
                <span key={p} className={`pagination__page ${p === page ? "pagination__page--active" : ""}`}
                      onClick={() => setPage(p)}>{p}</span>
              ))}
              <span className="pagination__page" onClick={() => setPage(Math.min(totalPages, page+1))}>›</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* -------- Modal ----------- */
function Modal({ open, title, subtitle, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "modal--wide" : ""}`}>
        <div className="modal__header">
          <div>
            <div className="modal__title">{title}</div>
            {subtitle && <div className="modal__subtitle">{subtitle}</div>}
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

/* -------- Field wrappers ----------- */
function Field({ label, required, hint, error, children }) {
  return (
    <div className="field">
      {label && (
        <label className="field__label">
          {label}{required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <div className="field__hint">{hint}</div>}
      {error && <div className="field__error">{error}</div>}
    </div>
  );
}

/* -------- Switch row (for network booleans) ----------- */
function SwitchRow({ label, hint, value, onChange }) {
  return (
    <div className="switch-row" onClick={() => onChange(!value)} style={{cursor:"pointer"}}>
      <div>
        <div className="switch-row__label">{label}</div>
        {hint && <div className="switch-row__hint">{hint}</div>}
      </div>
      <div className={`toggle ${value ? "toggle--on" : ""}`}/>
    </div>
  );
}

/* -------- Segmented control ----------- */
function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(o => (
        <div key={o.value || o}
             className={`segmented__item ${(o.value || o) === value ? "segmented__item--active" : ""}`}
             onClick={() => onChange(o.value || o)}>
          {o.label || o}
        </div>
      ))}
    </div>
  );
}

/* -------- KV editor (for volumes / networks) ----------- */
function KvEditor({ value, onChange, keyPlaceholder = "Key", valPlaceholder = "Value" }) {
  const items = value || [];
  const updateAt = (i, patch) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const removeAt = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { k: "", v: "" }]);
  return (
    <div className="kv-list">
      {items.length === 0 && <div className="field__hint">No labels added yet.</div>}
      {items.map((it, i) => (
        <div className="kv-row" key={i}>
          <input className="input" placeholder={keyPlaceholder} value={it.k} onChange={(e) => updateAt(i, { k: e.target.value })}/>
          <input className="input" placeholder={valPlaceholder} value={it.v} onChange={(e) => updateAt(i, { v: e.target.value })}/>
          <button className="btn btn--ghost btn--icon" onClick={() => removeAt(i)} aria-label="Remove">
            <Icon name="trash" size={15}/>
          </button>
        </div>
      ))}
      <button className="kv-add" onClick={add}>+ Add label</button>
    </div>
  );
}

Object.assign(window, {
  Icon, Logo, StatusBadge, Tag,
  Donut, Sparkline, LineChart,
  DataTable, Modal, Field, SwitchRow, Segmented, KvEditor,
});
