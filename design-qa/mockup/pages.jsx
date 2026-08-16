/* ============================================================
   SwarmBot — Dashboard & Nodes pages
   ============================================================ */

function DashboardPage({ openForm }) {
  const D = window.SBData;
  const [range, setRange] = useState("1h");

  const series = D.TIME_SERIES[range];

  const cpuData  = series.cpu;
  const memData  = series.mem;
  const diskData = series.disk;
  const labels   = series.labels;

  const managers = D.NODES.filter(n => n.role === "manager");
  const workers  = D.NODES.filter(n => n.role === "worker");

  return (
    <div data-screen-label="01 Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Cluster Overview</h1>
          <div className="page-header__subtitle">
            Live status of <strong style={{color:"var(--text-2)"}}>prod-eu-1</strong> · {D.NODES.length} nodes · {D.SERVICES.length} services · {D.TASKS.length} tasks
          </div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <span style={{fontSize:12, color:"var(--muted)"}}>
            Live · refreshed 4s ago
          </span>
          <button className="btn btn--secondary btn--sm">
            <Icon name="refresh" size={14}/> Refresh
          </button>
        </div>
      </div>

      {/* Summary counters */}
      <div className="dash-summary">
        <SummaryCard label="Stacks"    value={D.STACKS.length}  delta="+2"  />
        <SummaryCard label="Services"  value={D.SERVICES.length} delta="+1" />
        <SummaryCard label="Tasks"     value={`${D.TASKS.filter(t => t.status === "RUNNING" || t.status === "HEALTHY").length}`}
                     subtotal={`/ ${D.TASKS.length}`} delta="-3" deltaDown />
        <SummaryCard label="Nodes"     value={D.NODES.length}
                     subtotal={`${managers.length}M · ${workers.length}W`} />
      </div>

      {/* Donut tiles */}
      <div className="dash-grid">
        <ResourceTile
          label="CPU"
          value={D.CLUSTER.cpu}
          color="var(--primary-500)"
          subTop={`${D.CLUSTER.cpuUsed} / ${D.CLUSTER.cpuCores} cores`}
          spark={cpuData}
        />
        <ResourceTile
          label="Memory"
          value={D.CLUSTER.mem}
          color="#3b82f6"
          subTop={`${D.CLUSTER.memUsed} / ${D.CLUSTER.memTotal}`}
          spark={memData}
        />
        <ResourceTile
          label="Disk"
          value={D.CLUSTER.disk}
          color="#10b981"
          subTop={`${D.CLUSTER.diskUsed} / ${D.CLUSTER.diskTotal}`}
          spark={diskData}
        />
      </div>

      {/* Histogram */}
      <div className="card" style={{marginBottom: 16}}>
        <div className="card__header">
          <div>
            <div className="card__title">Resource Utilization</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>
              Time series from InfluxDB · live aggregation
            </div>
          </div>
          <div style={{display:"flex", gap:10, alignItems:"center"}}>
            <Segmented options={[
              {value:"15m", label:"15m"},
              {value:"1h",  label:"1h"},
              {value:"6h",  label:"6h"},
              {value:"24h", label:"24h"},
            ]} value={range} onChange={setRange}/>
          </div>
        </div>
        <div className="card__body" style={{paddingTop: 8}}>
          <div style={{display:"flex", gap:18, marginBottom: 6, fontSize: 12}}>
            <LegendItem color="var(--primary-500)" name="CPU" value={`${cpuData[cpuData.length-1]}%`}/>
            <LegendItem color="#3b82f6" name="Memory" value={`${memData[memData.length-1]}%`}/>
            <LegendItem color="#10b981" name="Disk" value={`${diskData[diskData.length-1]}%`}/>
          </div>
          <LineChart
            width={1000} height={260}
            labels={labels}
            series={[
              { name: "CPU",    data: cpuData,  color: "var(--primary-500)" },
              { name: "Memory", data: memData,  color: "#3b82f6" },
              { name: "Disk",  data: diskData,  color: "#10b981" },
            ]}
          />
        </div>
      </div>

      {/* Nodes summary split */}
      <div className="card">
        <div className="card__header">
          <div>
            <div className="card__title">Nodes</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>
              {D.NODES.length} nodes · {managers.length} managers · {workers.length} workers
            </div>
          </div>
        </div>
        <div className="card__body">
          <div className="nodes-summary">
            <div className="nodes-bucket">
              <div className="nodes-bucket__title">
                <Icon name="leader" size={14} style={{color:"var(--primary-500)"}}/>
                Managers <span className="nodes-bucket__count">{managers.length}</span>
              </div>
              {managers.map(n => <NodeRow key={n.id} node={n}/>)}
            </div>
            <div className="nodes-bucket">
              <div className="nodes-bucket__title">
                <Icon name="server" size={14} style={{color:"var(--text-2)"}}/>
                Workers <span className="nodes-bucket__count">{workers.length}</span>
              </div>
              {workers.map(n => <NodeRow key={n.id} node={n}/>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, subtotal, delta, deltaDown }) {
  return (
    <div className="summary-card">
      <div className="summary-card__label">{label}</div>
      <div className="summary-card__value">
        {value}
        {subtotal && <small>{subtotal}</small>}
      </div>
      {delta && (
        <div className={`summary-card__delta ${deltaDown ? "summary-card__delta--down" : ""}`}>
          {deltaDown ? "▼" : "▲"} {delta} <span style={{color:"var(--muted)", fontWeight:500}}>this week</span>
        </div>
      )}
    </div>
  );
}

function ResourceTile({ label, value, color, subTop, spark }) {
  return (
    <div className="dash-tile">
      <Donut value={value} size={96} stroke={14} color={color} label={label}/>
      <div style={{minWidth:0}}>
        <div className="dash-tile__label">{label}</div>
        <div className="dash-tile__value">{Math.round(value)}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
        <div className="dash-tile__sub"><strong>{subTop}</strong></div>
        {spark && (
          <div className="dash-tile__spark">
            <Sparkline data={spark} width={220} height={32} color={color} strokeWidth={1.5} fluid={true}/>
          </div>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, name, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }}/>
      <span style={{ color: "var(--muted)" }}>{name}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, marginLeft: 4 }}>{value}</span>
    </div>
  );
}

function NodeRow({ node }) {
  const overload = node.cpu > 75;
  return (
    <div className="node-row">
      <span className={`dot dot--${node.tags.includes("DRAIN") ? "warning" : overload ? "danger" : "success"}`}/>
      <span className="node-row__name">{node.host}</span>
      <span className="node-row__ip">{node.ip}</span>
      <span className="node-row__spacer"/>
      {node.tags.includes("LEADER") && <Tag>LEADER</Tag>}
      {node.tags.includes("DRAIN") && <Tag>DRAIN</Tag>}
      <span style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--font-mono)", minWidth: 38, textAlign:"right"}}>{node.cpu}%</span>
    </div>
  );
}

/* ============================================================
   NODES page
   ============================================================ */
function NodesPage() {
  const D = window.SBData;
  const [filter, setFilter] = useState("all"); // all|manager|worker
  const [query, setQuery] = useState("");

  const filtered = D.NODES.filter(n => {
    if (filter === "manager" && n.role !== "manager") return false;
    if (filter === "worker"  && n.role !== "worker") return false;
    if (query && !n.host.toLowerCase().includes(query.toLowerCase()) && !n.ip.includes(query)) return false;
    return true;
  });

  return (
    <div data-screen-label="07 Nodes">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Nodes</h1>
          <div className="page-header__count">
            <strong>{D.NODES.length}</strong> nodes — {D.NODES.filter(n => n.role === "manager").length} managers, {D.NODES.filter(n => n.role === "worker").length} workers
          </div>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-toolbar__left">
          <input className="input input--search" placeholder="Search hostname or IP…" value={query} onChange={(e) => setQuery(e.target.value)}/>
          <Segmented options={[
            {value:"all", label:"All"},
            {value:"manager", label:"Managers"},
            {value:"worker", label:"Workers"},
          ]} value={filter} onChange={setFilter}/>
        </div>
      </div>

      <div className="node-grid">
        {filtered.map(n => <NodeCard key={n.id} node={n}/>)}
        {filtered.length === 0 && (
          <div className="card" style={{gridColumn:"1/-1"}}>
            <div className="t-empty">No nodes match your filters.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeCard({ node }) {
  const hist = window.SBData.NODE_HISTORIES[node.id];
  const overload = node.cpu > 75;

  return (
    <div className="node-card">
      <div className="node-card__top">
        <div>
          <div className="node-card__hostname">
            <span className={`dot dot--${node.tags.includes("DRAIN") ? "warning" : overload ? "danger" : "success"}`}/>
            {node.host}
          </div>
          <div className="node-card__meta">{node.ip} · Docker {node.docker}</div>
        </div>
        <button className="btn btn--ghost btn--icon btn--sm" title="Actions">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
        </button>
      </div>
      <div className="node-card__tags">
        {node.tags.map(t => <Tag key={t}>{t}</Tag>)}
      </div>
      <div className="node-card__charts">
        <MiniMetric label="CPU"    value={`${node.cpu}%`}  data={hist.cpu}  color="var(--primary-500)"/>
        <MiniMetric label="Memory" value={`${node.mem}%`}  data={hist.mem}  color="#3b82f6"/>
        <MiniMetric label="Disk"   value={`${node.disk}%`} data={hist.disk} color="#10b981"/>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, data, color }) {
  return (
    <div className="node-mini">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
        <span className="node-mini__label">{label}</span>
        <span className="node-mini__value">{value}</span>
      </div>
      <div style={{marginTop:6}}>
        <Sparkline data={data} width={120} height={32} color={color} strokeWidth={1.5} fluid={true}/>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardPage, NodesPage });

/* ============================================================
   PROFILE page — current user
   ============================================================ */
function ProfilePage({ user, onSaved, onChangePassword }) {
  const initials = user.name.split(" ").map(p => p[0]).slice(0,2).join("").toUpperCase();
  const roleVariant = { "Administrator": "primary", "Editor": "info", "Read-only": "neutral" }[user.role] || "neutral";

  // Derive a username slug from email local-part
  const username = user.email.split("@")[0];

  const [name, setName]   = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || "");
  const [errors, setErrors] = useState({});
  const initial = { name: user.name, email: user.email, phone: user.phone || "" };
  const dirty = name !== initial.name || email !== initial.email || phone !== initial.phone;

  const save = () => {
    const e = {};
    if (!name.trim()) e.name = "Name is required.";
    if (!email.includes("@")) e.email = "Enter a valid email.";
    setErrors(e);
    if (Object.keys(e).length === 0) onSaved(`Profile saved`);
  };

  const reset = () => { setName(initial.name); setEmail(initial.email); setPhone(initial.phone); setErrors({}); };

  return (
    <div data-screen-label="14 Profile" className="profile">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">My profile</h1>
          <div className="page-header__subtitle">Manage your account details and security.</div>
        </div>
      </div>

      <div className="profile__grid">
        {/* Identity card */}
        <div className="card profile__identity">
          <div className="profile__avatar">{initials}</div>
          <div className="profile__name">{user.name}</div>
          <div className="profile__email">{user.email}</div>
          <span className={`tag tag--${roleVariant}`} style={{marginTop: 12}}>{user.role}</span>

          <div className="profile__stat">
            <div className="profile__stat-row">
              <span className="profile__stat-label">Account created</span>
              <span className="profile__stat-value">{user.created}</span>
            </div>
            <div className="profile__stat-row">
              <span className="profile__stat-label">Last login</span>
              <span className="profile__stat-value">{user.lastLogin}</span>
            </div>
            <div className="profile__stat-row">
              <span className="profile__stat-label">Username</span>
              <span className="profile__stat-value mono">{username}</span>
            </div>
          </div>
        </div>

        {/* Account details */}
        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Account details</div>
              <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>
                Update your personal information. Changes save immediately.
              </div>
            </div>
          </div>
          <div className="card__body" style={{display:"grid", gap:18}}>

            <Field label="Username" hint="Used to log in. Cannot be changed.">
              <input className="input" value={username} readOnly disabled
                     style={{fontFamily:"var(--font-mono)", color:"var(--muted)"}}/>
            </Field>

            <Field label="Password">
              <div className="profile__password">
                <input className="input" type="password" value="••••••••••••" readOnly disabled
                       style={{fontFamily:"var(--font-mono)", letterSpacing:"2px", color:"var(--muted)"}}/>
                <button className="btn btn--secondary" onClick={onChangePassword}>
                  <Icon name="keys" size={14}/> Change…
                </button>
              </div>
            </Field>

            <Field label="Full name" required error={errors.name}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}/>
            </Field>

            <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:14}}>
              <Field label="Email" required error={errors.email}>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}/>
              </Field>
              <Field label="Phone" hint="Optional">
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 ..."/>
              </Field>
            </div>

            <Field label="Role" hint="Set by an administrator.">
              <div className="profile__readonly">
                <span className={`tag tag--${roleVariant}`}>{user.role}</span>
              </div>
            </Field>

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
              <Field label="Account created" hint="Read only">
                <input className="input" value={user.created} readOnly disabled
                       style={{fontFamily:"var(--font-mono)", color:"var(--muted)"}}/>
              </Field>
              <Field label="Last login" hint="Read only">
                <input className="input" value={user.lastLogin} readOnly disabled
                       style={{color:"var(--muted)"}}/>
              </Field>
            </div>

            <div className="profile__footer">
              <button className="btn btn--ghost" disabled={!dirty} onClick={reset}>Reset</button>
              <button className="btn btn--primary" disabled={!dirty} onClick={save}>Save changes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ProfilePage });
/* ============================================================
   Split button (action button with dropdown)
   ============================================================ */
function SplitButton({ icon, label, onClick, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const click = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [open]);

  return (
    <div ref={ref} className="splitbtn">
      <button className="btn btn--primary splitbtn__main" onClick={onClick}>
        {icon && <Icon name={icon} size={14}/>} {label}
      </button>
      <button className="btn btn--primary splitbtn__caret" onClick={() => setOpen(!open)} aria-label="More actions">
        <Icon name="chevronDown" size={14}/>
      </button>
      {open && (
        <div className="splitbtn__menu">
          {options.map((opt, i) => opt === "-" ? (
            <div key={i} className="splitbtn__sep"/>
          ) : (
            <div key={i}
                 className={`splitbtn__item ${opt.danger ? "splitbtn__item--danger" : ""}`}
                 onClick={() => { setOpen(false); opt.onClick(); }}>
              {opt.icon && <Icon name={opt.icon} size={14} style={{color: opt.danger ? "var(--danger)" : "var(--muted)"}}/>}
              <span>{opt.label}</span>
              {opt.hint && <span className="splitbtn__hint">{opt.hint}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   STACK DETAIL page
   ============================================================ */
function StackDetailPage({ stackName, onBack, onAction }) {
  const D = window.SBData;
  const stack = D.STACKS.find(s => s.name === stackName);
  if (!stack) return null;

  const metrics = D.STACK_METRICS[stackName] || { cpu: 0, mem: 0, disk: 0, history: { cpu: [], mem: [], disk: [] } };
  const res = D.getStackResources(stackName);

  const [range, setRange] = useState("1h");
  const labels = Array.from({length: metrics.history.cpu.length}, (_, i) =>
    range === "15m" ? `${metrics.history.cpu.length - i}m`
    : range === "1h" ? `${metrics.history.cpu.length - i}m`
    : range === "6h" ? `${(metrics.history.cpu.length - i) * 5}m`
    : `${Math.floor((metrics.history.cpu.length - i) / 2)}h`
  );

  /* Mini service-table columns (reused look from ServicesPage) */
  const serviceCols = [
    { key:"name", label:"Service", render: r => (
      <div>
        <div style={{fontWeight:600}}>{r.name}</div>
        <div style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--font-mono)", marginTop:2}}>{r.image}</div>
      </div>
    )},
    { key:"replicas", label:"Replicas", width: 180,
      sortFn: r => r.replicas[0] / Math.max(1, r.replicas[1]),
      render: r => {
        const [running, total] = r.replicas;
        const pct = total === 0 ? 0 : (running / total) * 100;
        return (
          <div className="replica">
            <div className="replica__bar"><div className="replica__bar-fill" style={{width: `${pct}%`, background: running < total ? "var(--warning)" : "var(--success)"}}/></div>
            <span className="replica__text">{running}/{total}</span>
          </div>
        );
      }
    },
    { key:"ports", label:"Ports", render: r => (
      <div style={{display:"flex", flexWrap:"wrap", gap:4}}>
        {r.ports.map((p, i) => <span key={i} className="tag" style={{background:"var(--surface-2)", color:"var(--text-2)", textTransform:"none"}}>{p}</span>)}
      </div>
    )},
    { key:"status", label:"Status", render: r => <StatusBadge status={r.status}/> },
  ];

  const networkCols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:8}}>
        <Icon name="networks" size={13} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600}}>{r.name}</span>
      </div>
    )},
    { key:"driver", label:"Driver", render: r => <span className="badge badge--neutral" style={{textTransform:"uppercase", fontSize:10.5, letterSpacing:".06em"}}>{r.driver}</span> },
    { key:"subnet", label:"Subnet", render: r => <span className="mono">{r.subnet}</span> },
    { key:"gateway", label:"Gateway", render: r => <span className="mono">{r.gateway}</span> },
  ];

  const volumeCols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:8}}>
        <Icon name="volumes" size={13} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600}}>{r.name}</span>
      </div>
    )},
    { key:"driver", label:"Driver", render: r => <span className="badge badge--neutral" style={{textTransform:"uppercase", fontSize:10.5, letterSpacing:".06em"}}>{r.driver}</span> },
    { key:"size", label:"Size", align:"right", render: r => <span className="mono">{r.size}</span> },
  ];

  const secretCols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:8}}>
        <Icon name="secrets" size={13} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600, fontFamily:"var(--font-mono)", fontSize:12.5}}>{r.name}</span>
      </div>
    )},
    { key:"updated", label:"Last updated", render: r => <span className="mono">{r.updated}</span> },
  ];

  const configCols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:8}}>
        <Icon name="configs" size={13} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600, fontFamily:"var(--font-mono)", fontSize:12.5}}>{r.name}</span>
      </div>
    )},
    { key:"updated", label:"Last updated", render: r => <span className="mono">{r.updated}</span> },
  ];

  return (
    <div data-screen-label={`03 Stacks › ${stackName}`}>
      {/* Breadcrumb / header */}
      <div className="page-header" style={{alignItems:"center"}}>
        <div>
          <div className="stack-detail__crumb">
            <span onClick={onBack} className="stack-detail__crumb-link">
              <Icon name="stacks" size={14}/> Stacks
            </span>
            <Icon name="chevronRight" size={12} style={{color:"var(--muted-2)"}}/>
            <span>{stack.name}</span>
          </div>
          <div style={{display:"flex", alignItems:"center", gap:14, marginTop:8}}>
            <h1 className="page-header__title" style={{margin:0}}>{stack.name}</h1>
            <StatusBadge status={stack.status}/>
          </div>
          <div className="page-header__subtitle" style={{marginTop:6}}>
            {res.services.length} services · {res.networks.length} networks · {res.volumes.length} volumes · {res.configs.length} configs · {res.secrets.length} secrets
          </div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <button className="btn btn--secondary btn--sm" onClick={onBack}>
            <Icon name="chevronLeft" size={14}/> Back
          </button>
          <SplitButton
            icon="settings"
            label="Edit"
            onClick={() => onAction("edit", stack)}
            options={[
              { label: "Redeploy",   icon: "refresh", onClick: () => onAction("redeploy", stack), hint: "rolling" },
              { label: "Rollback",   icon: "chevronLeft", onClick: () => onAction("rollback", stack), hint: "prev. spec" },
              { label: "Deactivate", icon: "pause",   onClick: () => onAction("deactivate", stack) },
              "-",
              { label: "Delete",     icon: "trash",   onClick: () => onAction("delete", stack), danger: true },
            ]}
          />
        </div>
      </div>

      {/* Resource tiles */}
      <div className="dash-grid">
        <StackResourceTile label="CPU"    value={metrics.cpu}  color="var(--primary-500)" spark={metrics.history.cpu}/>
        <StackResourceTile label="Memory" value={metrics.mem}  color="#3b82f6"            spark={metrics.history.mem}/>
        <StackResourceTile label="Disk"   value={metrics.disk} color="#10b981"            spark={metrics.history.disk}/>
      </div>

      {/* Combined line chart */}
      <div className="card" style={{marginBottom: 16}}>
        <div className="card__header">
          <div>
            <div className="card__title">Stack utilization</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>
              Aggregated across {res.services.length} services
            </div>
          </div>
          <Segmented options={[
            {value:"15m", label:"15m"},
            {value:"1h",  label:"1h"},
            {value:"6h",  label:"6h"},
            {value:"24h", label:"24h"},
          ]} value={range} onChange={setRange}/>
        </div>
        <div className="card__body" style={{paddingTop: 8}}>
          <div style={{display:"flex", gap:18, marginBottom: 6, fontSize: 12}}>
            <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
              <span style={{width:10, height:10, borderRadius:3, background:"var(--primary-500)"}}/>
              <span style={{color:"var(--muted)"}}>CPU</span>
              <span style={{fontFamily:"var(--font-mono)", fontWeight:600, marginLeft:4}}>{metrics.cpu}%</span>
            </span>
            <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
              <span style={{width:10, height:10, borderRadius:3, background:"#3b82f6"}}/>
              <span style={{color:"var(--muted)"}}>Memory</span>
              <span style={{fontFamily:"var(--font-mono)", fontWeight:600, marginLeft:4}}>{metrics.mem}%</span>
            </span>
            <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
              <span style={{width:10, height:10, borderRadius:3, background:"#10b981"}}/>
              <span style={{color:"var(--muted)"}}>Disk</span>
              <span style={{fontFamily:"var(--font-mono)", fontWeight:600, marginLeft:4}}>{metrics.disk}%</span>
            </span>
          </div>
          <LineChart
            width={1000} height={220}
            labels={labels}
            series={[
              { name: "CPU",    data: metrics.history.cpu,  color: "var(--primary-500)" },
              { name: "Memory", data: metrics.history.mem,  color: "#3b82f6" },
              { name: "Disk",   data: metrics.history.disk, color: "#10b981" },
            ]}
          />
        </div>
      </div>

      {/* Services */}
      <DetailSection title="Services" count={res.services.length} icon="services">
        {res.services.length === 0
          ? <div className="t-empty">No services in this stack.</div>
          : <DataTable columns={serviceCols} rows={res.services} searchKeys={["name","image","status"]} pageSize={8}/>
        }
      </DetailSection>

      {/* Two-column grid for networks + volumes */}
      <div className="detail-grid">
        <DetailSection title="Networks" count={res.networks.length} icon="networks">
          {res.networks.length === 0
            ? <div className="t-empty">No networks attached.</div>
            : <DataTable columns={networkCols} rows={res.networks} searchKeys={["name","driver"]} pageSize={6}/>
          }
        </DetailSection>

        <DetailSection title="Volumes" count={res.volumes.length} icon="volumes">
          {res.volumes.length === 0
            ? <div className="t-empty">No volumes attached.</div>
            : <DataTable columns={volumeCols} rows={res.volumes} searchKeys={["name","driver"]} pageSize={6}/>
          }
        </DetailSection>
      </div>

      <div className="detail-grid">
        <DetailSection title="Configs" count={res.configs.length} icon="configs">
          {res.configs.length === 0
            ? <div className="t-empty">No configs mounted.</div>
            : <DataTable columns={configCols} rows={res.configs} searchKeys={["name"]} pageSize={6}/>
          }
        </DetailSection>

        <DetailSection title="Secrets" count={res.secrets.length} icon="secrets">
          {res.secrets.length === 0
            ? <div className="t-empty">No secrets granted.</div>
            : <DataTable columns={secretCols} rows={res.secrets} searchKeys={["name"]} pageSize={6}/>
          }
        </DetailSection>
      </div>
    </div>
  );
}

function StackResourceTile({ label, value, color, spark }) {
  return (
    <div className="dash-tile">
      <Donut value={value} size={84} stroke={12} color={color} label={label}/>
      <div style={{minWidth:0}}>
        <div className="dash-tile__label">{label}</div>
        <div className="dash-tile__value">{Math.round(value)}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
        <div className="dash-tile__spark">
          <Sparkline data={spark} width={220} height={28} color={color} strokeWidth={1.5} fluid={true}/>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, count, icon, children, className }) {
  return (
    <div className={`detail-section ${className || ""}`}>
      <div className="detail-section__head">
        <div className="detail-section__title">
          <Icon name={icon} size={14} style={{color:"var(--primary-500)"}}/>
          {title}
          <span className="detail-section__count">{count}</span>
        </div>
      </div>
      <div className="detail-section__body">
        {children}
      </div>
    </div>
  );
}

Object.assign(window, { StackDetailPage, SplitButton, DetailSection, EmptyHint });

/* EmptyHint — used by detail pages when a section has no rows */
function EmptyHint({ icon, text }) {
  return (
    <div className="card" style={{padding: 0}}>
      <div className="t-empty" style={{display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"36px 20px"}}>
        <Icon name={icon} size={18} style={{color:"var(--muted-2)"}}/>
        <span>{text}</span>
      </div>
    </div>
  );
}

/* ============================================================
   LOAD page — top 7 stacks across CPU / Memory / Disk
   ============================================================ */
function LoadPage() {
  const D = window.SBData;
  const [range, setRange] = useState("1h");

  const base = D.TIME_SERIES[range];
  const labels = base.labels;

  /* Per-stack time series — derived deterministically from stack name hash */
  const palette = ["#F97316", "#3b82f6", "#10b981", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4"];

  const stacks = D.STACKS.map(s => {
    const hash = s.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const factor = 0.4 + ((hash % 70) / 100);
    return {
      name: s.name,
      cpu:  base.cpu.map(v  => Math.round(Math.min(100, v * factor) * 10) / 10),
      mem:  base.mem.map(v  => Math.round(Math.min(100, v * (factor + 0.12)) * 10) / 10),
      disk: base.disk.map(v => Math.round(Math.min(100, v * (factor * 0.6 + 0.2)) * 10) / 10),
    };
  });

  /* Rank by current CPU usage, take top 7 */
  const top7 = [...stacks]
    .sort((a, b) => b.cpu[b.cpu.length - 1] - a.cpu[a.cpu.length - 1])
    .slice(0, 7)
    .map((s, i) => ({ ...s, color: palette[i] }));

  return (
    <div data-screen-label="02 Load">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Stack load</h1>
          <div className="page-header__subtitle">
            CPU, memory and disk utilization for the <strong style={{color:"var(--text-2)"}}>top 7 stacks</strong> by current usage
          </div>
        </div>
        <div style={{display:"flex", gap:10, alignItems:"center"}}>
          <Segmented options={[
            {value:"15m", label:"15m"}, {value:"1h",  label:"1h"},
            {value:"6h",  label:"6h"},  {value:"24h", label:"24h"},
          ]} value={range} onChange={setRange}/>
        </div>
      </div>

      {/* Shared legend */}
      <div className="load-legend">
        {top7.map(s => (
          <span key={s.name} className="load-legend__item">
            <span className="load-legend__swatch" style={{background: s.color}}/>
            <span className="load-legend__name">{s.name}</span>
          </span>
        ))}
      </div>

      <LoadChart title="CPU"    metric="cpu"  top={top7} labels={labels}/>
      <LoadChart title="Memory" metric="mem"  top={top7} labels={labels}/>
      <LoadChart title="Disk"   metric="disk" top={top7} labels={labels}/>
    </div>
  );
}

function LoadChart({ title, metric, top, labels }) {
  const series = top.map(s => ({ name: s.name, data: s[metric], color: s.color }));
  const current = top.map(s => s[metric][s[metric].length - 1]);
  const peak = Math.max(...current);

  return (
    <div className="card" style={{marginBottom: 16}}>
      <div className="card__header">
        <div>
          <div className="card__title">{title}</div>
          <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>
            Peak: <strong style={{color:"var(--text-2)", fontFamily:"var(--font-mono)"}}>{peak.toFixed(1)}%</strong> · across 7 stacks
          </div>
        </div>
      </div>
      <div className="card__body" style={{paddingTop: 8}}>
        <LineChart width={1100} height={220} labels={labels} series={series}/>
      </div>
    </div>
  );
}

Object.assign(window, { LoadPage, LoadChart });

/* ============================================================
   SERVICE DETAIL page
   ============================================================ */

/* Deterministic mock for service-level details, hashed off the name. */
function makeServiceDetail(service) {
  const D = window.SBData;
  const hash = service.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (n, seed) => {
    let s = seed;
    return Array.from({length: n}, (_, i) => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    });
  };

  const id = (() => {
    let s = hash;
    const out = [];
    for (let i = 0; i < 12; i++) {
      s = (s * 16807 + 1) % 2147483647;
      out.push((s % 36).toString(36));
    }
    return out.join("");
  })();

  /* Created / updated as relative times */
  const createdAgo = ["3 months ago", "5 months ago", "8 months ago", "1 year ago", "14 months ago", "2 years ago"][hash % 6];
  const updatedAgo = ["12 minutes ago", "1 hour ago", "3 hours ago", "yesterday", "2 days ago", "1 week ago"][hash % 6];

  /* Env vars — sensible per category */
  const envBase = [
    ["LOG_LEVEL", "info"],
    ["NODE_ENV", "production"],
    ["TZ", "UTC"],
  ];
  const envExtra = service.image.includes("postgres") ?
    [["POSTGRES_DB", service.stack], ["POSTGRES_USER", "swarm"], ["POSTGRES_MAX_CONNECTIONS", "200"]] :
    service.image.includes("redis") ?
    [["REDIS_MAXMEMORY", "2gb"], ["REDIS_APPENDONLY", "yes"]] :
    service.image.includes("nginx") ?
    [["NGINX_WORKER_PROCESSES", "auto"], ["NGINX_WORKER_CONNECTIONS", "1024"]] :
    service.image.includes("rabbitmq") ?
    [["RABBITMQ_DEFAULT_USER", "swarm"], ["RABBITMQ_ERLANG_COOKIE", "···"]] :
    service.image.includes("traefik") ?
    [["TRAEFIK_PROVIDERS_DOCKER", "true"], ["TRAEFIK_API_DASHBOARD", "true"]] :
    [["PORT", String(3000 + (hash % 100))], ["METRICS_ENABLED", "true"]];
  const env = [...envBase, ...envExtra];

  /* Labels */
  const labels = [
    ["com.docker.stack.namespace", service.stack],
    ["com.docker.stack.image",     service.image],
    ["traefik.enable",             service.ports.some(p => p.includes("80")) ? "true" : "false"],
    ["sb.team",                    ["platform", "data", "core", "edge"][hash % 4]],
    ["sb.tier",                    ["frontend", "backend", "data", "infra"][hash % 4]],
  ];

  /* Secrets & configs from stack pool */
  const stackResources = D.getStackResources(service.stack);
  const secretCount = 1 + (hash % 3);
  const configCount = 1 + ((hash + 2) % 3);
  const secrets = stackResources.secrets.slice(0, Math.min(secretCount, stackResources.secrets.length));
  const configs = stackResources.configs.slice(0, Math.min(configCount, stackResources.configs.length));

  /* Networks attached */
  const networks = stackResources.networks.slice(0, Math.max(1, Math.min(2, stackResources.networks.length)));

  /* Tasks specific to this service */
  const tasks = D.TASKS.filter(t => t.name.startsWith(service.name + "."));

  /* Published ports — parse from service.ports (e.g. "80→8080") */
  const ports = service.ports.filter(p => p !== "—").map((p, i) => {
    const m = p.match(/(\d+)\D+(\d+)/);
    if (!m) return null;
    const host = parseInt(m[1]);
    const container = parseInt(m[2]);
    return {
      container,
      host,
      protocol: "tcp",
      mode: i === 0 ? "ingress" : "host",
    };
  }).filter(Boolean);

  /* Mounts (bind) — small list */
  const isData = service.image.includes("postgres") || service.image.includes("redis") || service.image.includes("elasticsearch") || service.image.includes("clickhouse") || service.image.includes("loki") || service.image.includes("rabbitmq");
  const isProxy = service.image.includes("nginx") || service.image.includes("traefik") || service.image.includes("varnish");
  const mounts = [];
  if (isProxy) {
    mounts.push({ container: "/etc/" + (service.image.split(":")[0].split("/").pop()) + "/conf.d", host: "/srv/swarm/" + service.name + "/conf", ro: true });
    mounts.push({ container: "/var/log", host: "/srv/swarm/" + service.name + "/log", ro: false });
  } else if (!isData) {
    mounts.push({ container: "/etc/ssl/certs/ca.crt", host: "/etc/swarm/pki/ca.crt", ro: true });
  }

  /* Service volumes */
  const volumeNames = stackResources.volumes.filter(v =>
    v.name.includes(service.name.split("_").pop()) ||
    v.name.includes(service.stack)
  ).slice(0, isData ? 2 : 0);
  const volumes = volumeNames.map((v, i) => ({
    container: isData
      ? (service.image.includes("postgres") ? "/var/lib/postgresql/data" :
         service.image.includes("redis") ? "/data" :
         service.image.includes("loki") ? "/loki" :
         service.image.includes("elasticsearch") ? "/usr/share/elasticsearch/data" :
         "/data")
      : "/data",
    name: v.name,
    ro: false,
    driver: v.driver,
  }));

  return { id, createdAgo, updatedAgo, env, labels, secrets, configs, networks, tasks, ports, mounts, volumes };
}

function ServiceDetailPage({ serviceName, onBack }) {
  const D = window.SBData;
  const service = D.SERVICES.find(s => s.name === serviceName);
  if (!service) return <div>Service not found.</div>;

  const detail = useMemo(() => makeServiceDetail(service), [serviceName]);

  const [running, total] = service.replicas;
  const stopped = total - running;
  const pct = total === 0 ? 0 : (running / total) * 100;

  return (
    <div data-screen-label={`04 Services · ${serviceName}`}>
      <div className="page-header" style={{alignItems:"flex-start"}}>
        <div>
          <button className="btn btn--ghost btn--sm" onClick={onBack} style={{padding:"4px 8px", marginBottom: 6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back to Services
          </button>
          <h1 className="page-header__title" style={{display:"flex", alignItems:"center", gap:14}}>
            <Icon name="services" size={22} style={{color:"var(--primary-500)"}}/>
            {service.name}
            <StatusBadge status={service.status}/>
          </h1>
          <div className="page-header__subtitle" style={{fontFamily:"var(--font-mono)", fontSize: 12.5}}>
            {service.image}
          </div>
        </div>
        <SplitButton
          actions={[
            { id: "edit",       label: "Edit",       icon: "settings", primary: true },
            { id: "redeploy",   label: "Redeploy",   icon: "refresh" },
            { id: "rollback",   label: "Rollback",   icon: "chevronLeft" },
            { id: "scale",      label: "Scale…",     icon: "services" },
            { id: "delete",     label: "Remove",     icon: "trash", danger: true },
          ]}
          onAction={() => {}}
        />
      </div>

      {/* Summary row: pie chart + meta fields */}
      <div className="svc-summary">
        <div className="svc-summary__pie">
          <Donut value={pct} size={120} stroke={16} color="var(--success)"
                 valueLabel={`${running}/${total}`} label="replicas"/>
          <div className="svc-summary__legend">
            <div className="svc-summary__legend-row">
              <span className="dot dot--success"/>
              <span>Running</span>
              <strong>{running}</strong>
            </div>
            <div className="svc-summary__legend-row">
              <span className="dot dot--warning" style={{background:"var(--muted-2)", boxShadow:"none"}}/>
              <span>Stopped</span>
              <strong>{stopped}</strong>
            </div>
          </div>
        </div>

        <div className="svc-summary__meta">
          <SvcMeta label="Service ID" value={detail.id} mono/>
          <SvcMeta label="Image"      value={service.image} mono wrap/>
          <SvcMeta label="Created"    value={detail.createdAgo}/>
          <SvcMeta label="Last updated" value={detail.updatedAgo}/>
          <SvcMeta label="Stack"      value={service.stack}/>
          <SvcMeta label="Mode"       value={total === 1 ? "global" : "replicated"}/>
        </div>
      </div>

      {/* Two-column body: narrow tiles (30%) | wide tables (70%) */}
      <div className="svc-body">
        <aside className="svc-tiles">
          <KvTile title="Environment variables" icon="settings" entries={detail.env}/>
          <KvTile title="Labels"                 icon="filter"   entries={detail.labels}/>
          <ListTile title="Secrets" icon="secrets" empty="No secrets bound.">
            {detail.secrets.map(s => (
              <ListTile.Row key={s.name} primary={s.name} secondary={`Updated ${s.updated}`}/>
            ))}
          </ListTile>
          <ListTile title="Configs" icon="configs" empty="No configs bound.">
            {detail.configs.map(c => (
              <ListTile.Row key={c.name} primary={c.name} secondary={`Updated ${c.updated}`}/>
            ))}
          </ListTile>
        </aside>

        <section className="svc-tables">
          {/* Tasks */}
          <DetailSection title="Tasks" count={detail.tasks.length}
                         countNoun={`task${detail.tasks.length === 1 ? "" : "s"}`} icon="tasks"
                         className="detail-section--svc-tasks">
            {detail.tasks.length === 0 ? <EmptyHint icon="tasks" text="No active tasks."/> : (
              <DataTable
                columns={[
                  { key:"name", label:"Task", render: r => (
                    <div>
                      <div style={{fontWeight:600, fontFamily:"var(--font-mono)", fontSize:12.5}}>{r.name}</div>
                      <div style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--font-mono)", marginTop:2}}>{r.image}</div>
                    </div>
                  )},
                  { key:"node", label:"Node", render: r => <span className="mono">{r.node}</span> },
                  { key:"cpu", label:"CPU", width: 130, sortFn: r => r.cpu, render: r => {
                    const hist = D.TASK_HISTORIES[r.id];
                    return <div className="meter">
                      <Sparkline data={hist.cpu} width={60} height={20} color="var(--primary-500)" strokeWidth={1.25}/>
                      <span className="meter__value">{r.cpu}%</span>
                    </div>;
                  }},
                  { key:"mem", label:"Memory", width: 130, sortFn: r => r.mem, render: r => {
                    const hist = D.TASK_HISTORIES[r.id];
                    return <div className="meter">
                      <Sparkline data={hist.mem} width={60} height={20} color="#3b82f6" strokeWidth={1.25}/>
                      <span className="meter__value">{r.mem}%</span>
                    </div>;
                  }},
                  { key:"updated", label:"Updated", render: r => <span style={{color:"var(--muted)"}}>{r.updated}</span> },
                  { key:"status", label:"Status", render: r => <StatusBadge status={r.status}/> },
                ]}
                rows={detail.tasks}
                searchKeys={["name","node","status"]}
                pageSize={6}
              />
            )}
          </DetailSection>

          {/* Networks */}
          <DetailSection title="Networks" count={detail.networks.length}
                         countNoun={`network${detail.networks.length === 1 ? "" : "s"}`} icon="networks">
            <DataTable
              columns={[
                { key:"name", label:"Name", render: r => <span style={{fontWeight:600}}>{r.name}</span> },
                { key:"driver", label:"Driver", render: r => <span className="badge badge--neutral" style={{textTransform:"uppercase", fontSize:10.5, letterSpacing:".06em"}}>{r.driver}</span> },
                { key:"subnet", label:"Subnet", render: r => <span className="mono">{r.subnet}</span> },
                { key:"gateway", label:"Gateway", render: r => <span className="mono">{r.gateway}</span> },
              ]}
              rows={detail.networks}
              searchKeys={["name","driver","subnet"]}
              pageSize={5}
            />
          </DetailSection>

          {/* Ports */}
          <DetailSection title="Published ports" count={detail.ports.length}
                         countNoun={`port${detail.ports.length === 1 ? "" : "s"}`} icon="networks">
            {detail.ports.length === 0 ? <EmptyHint icon="networks" text="No ports published."/> : (
              <DataTable
                columns={[
                  { key:"container", label:"Container port", render: r => <span className="mono">{r.container}</span> },
                  { key:"protocol",  label:"Protocol", render: r => <span className="tag" style={{background:"var(--surface-2)", color:"var(--text-2)", textTransform:"uppercase"}}>{r.protocol}</span> },
                  { key:"mode",      label:"Mode", render: r => <span className="tag tag--info">{r.mode}</span> },
                  { key:"host",      label:"Host port", align:"right", render: r => <span className="mono" style={{fontWeight:600}}>{r.host}</span> },
                ]}
                rows={detail.ports}
                searchKeys={["protocol","mode"]}
                pageSize={5}
              />
            )}
          </DetailSection>

          {/* Bind mounts */}
          <DetailSection title="Bind mounts" count={detail.mounts.length}
                         countNoun={`mount${detail.mounts.length === 1 ? "" : "s"}`} icon="disk">
            {detail.mounts.length === 0 ? <EmptyHint icon="disk" text="No bind mounts."/> : (
              <DataTable
                columns={[
                  { key:"container", label:"Container path", render: r => <span className="mono">{r.container}</span> },
                  { key:"host",      label:"Host path",      render: r => <span className="mono" style={{color:"var(--muted)"}}>{r.host}</span> },
                  { key:"ro",        label:"Read-only", align:"right", render: r => r.ro
                      ? <span className="tag tag--warning">RO</span>
                      : <span className="tag tag--success">RW</span> },
                ]}
                rows={detail.mounts}
                searchKeys={["container","host"]}
                pageSize={5}
              />
            )}
          </DetailSection>

          {/* Volumes */}
          <DetailSection title="Volumes" count={detail.volumes.length}
                         countNoun={`volume${detail.volumes.length === 1 ? "" : "s"}`} icon="volumes">
            {detail.volumes.length === 0 ? <EmptyHint icon="volumes" text="No volumes mounted."/> : (
              <DataTable
                columns={[
                  { key:"container", label:"Container path", render: r => <span className="mono">{r.container}</span> },
                  { key:"name", label:"Volume name", render: r => <span style={{fontWeight:600}}>{r.name}</span> },
                  { key:"ro", label:"Read-only", render: r => r.ro
                      ? <span className="tag tag--warning">RO</span>
                      : <span className="tag tag--success">RW</span> },
                  { key:"driver", label:"Driver", render: r => <span className="badge badge--neutral" style={{textTransform:"uppercase", fontSize:10.5, letterSpacing:".06em"}}>{r.driver}</span> },
                ]}
                rows={detail.volumes}
                searchKeys={["container","name","driver"]}
                pageSize={5}
              />
            )}
          </DetailSection>
        </section>
      </div>
    </div>
  );
}

function SvcMeta({ label, value, mono, wrap }) {
  return (
    <div className="svc-meta">
      <div className="svc-meta__label">{label}</div>
      <div className={`svc-meta__value ${mono ? "mono" : ""}`} style={{
        wordBreak: wrap ? "break-all" : "normal",
      }}>{value}</div>
    </div>
  );
}

function KvTile({ title, icon, entries }) {
  return (
    <div className="card svc-tile">
      <div className="svc-tile__head">
        <Icon name={icon} size={14} style={{color:"var(--primary-500)"}}/>
        <span>{title}</span>
        <span className="svc-tile__count">{entries.length}</span>
      </div>
      <div className="svc-tile__body">
        {entries.length === 0 ? (
          <div style={{padding:"12px 16px", fontSize:12, color:"var(--muted)"}}>No entries.</div>
        ) : (
          <dl className="kv-grid">
            {entries.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function ListTile({ title, icon, empty, children }) {
  const items = React.Children.toArray(children);
  return (
    <div className="card svc-tile">
      <div className="svc-tile__head">
        <Icon name={icon} size={14} style={{color:"var(--primary-500)"}}/>
        <span>{title}</span>
        <span className="svc-tile__count">{items.length}</span>
      </div>
      <div className="svc-tile__body">
        {items.length === 0 ? (
          <div style={{padding:"12px 16px", fontSize:12, color:"var(--muted)"}}>{empty}</div>
        ) : (
          <ul className="svc-tile__list">{items}</ul>
        )}
      </div>
    </div>
  );
}
ListTile.Row = function Row({ primary, secondary }) {
  return (
    <li>
      <div className="svc-tile__primary">{primary}</div>
      {secondary && <div className="svc-tile__secondary">{secondary}</div>}
    </li>
  );
};

Object.assign(window, { ServiceDetailPage, KvTile, ListTile, SvcMeta });

/* ============================================================
   TASK DETAIL page
   ============================================================ */
function makeTaskDetail(task) {
  const hash = task.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  /* deterministic 64-char hex sha256 */
  const sha = (() => {
    let s = hash;
    const out = [];
    for (let i = 0; i < 64; i++) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      out.push((s % 16).toString(16));
    }
    return out.join("");
  })();

  const createdAgo = ["4 days ago", "1 week ago", "12 days ago", "3 weeks ago", "1 month ago", "6 weeks ago", "2 months ago"][hash % 7];

  /* extend short task spark to 40 points for a bigger chart */
  const D = window.SBData;
  const base = D.TASK_HISTORIES[task.id];
  const extend = (arr) => {
    const out = [...arr];
    let last = arr[arr.length - 1];
    for (let i = 0; i < 24; i++) {
      const jitter = (Math.sin(i * 1.7 + hash) * 6) + (Math.cos(i * 2.3 + hash) * 4);
      last = Math.max(2, Math.min(98, last + jitter * 0.4));
      out.push(Math.round(last * 10) / 10);
    }
    return out;
  };
  return {
    sha,
    createdAgo,
    cpu:  task.status === "RUNNING" || task.status === "HEALTHY" ? extend(base.cpu) : Array(40).fill(0),
    mem:  task.status === "RUNNING" || task.status === "HEALTHY" ? extend(base.mem) : Array(40).fill(0),
  };
}

function TaskDetailPage({ taskId, onBack }) {
  const D = window.SBData;
  const task = D.TASKS.find(t => t.id === taskId);
  if (!task) return <div>Task not found.</div>;
  const detail = useMemo(() => makeTaskDetail(task), [taskId]);

  const labels = Array.from({length: detail.cpu.length}, (_, i) => `${detail.cpu.length - i}m`);

  return (
    <div data-screen-label={`05 Tasks · ${task.id}`}>
      <div className="page-header" style={{alignItems:"flex-start"}}>
        <div>
          <button className="btn btn--ghost btn--sm" onClick={onBack} style={{padding:"4px 8px", marginBottom: 6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back to Tasks
          </button>
          <h1 className="page-header__title" style={{display:"flex", alignItems:"center", gap:14}}>
            <Icon name="tasks" size={22} style={{color:"var(--primary-500)"}}/>
            {task.name}
            <StatusBadge status={task.status}/>
          </h1>
          <div className="page-header__subtitle" style={{fontFamily:"var(--font-mono)", fontSize: 12.5}}>
            {task.image} · on <strong style={{color:"var(--text-2)"}}>{task.node}</strong>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="task-detail__hero">
        <SvcMeta label="Task ID" value={task.id} mono wrap/>
        <SvcMeta label="Status" value={<StatusBadge status={task.status}/>}/>
        <SvcMeta label="Image" value={task.image} mono wrap/>
        <SvcMeta label="Image digest" value={`sha256:${detail.sha}`} mono wrap/>
        <SvcMeta label="Created" value={detail.createdAgo}/>
        <SvcMeta label="Last updated" value={task.updated}/>
      </div>

      {/* CPU chart */}
      <div className="card" style={{marginBottom: 16}}>
        <div className="card__header">
          <div>
            <div className="card__title">CPU usage</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>
              Last hour · current <strong style={{color:"var(--text-2)", fontFamily:"var(--font-mono)"}}>{task.cpu}%</strong>
            </div>
          </div>
        </div>
        <div className="card__body" style={{paddingTop: 8}}>
          <LineChart width={1100} height={220} labels={labels}
                     series={[{ name: "CPU", data: detail.cpu, color: "var(--primary-500)" }]}/>
        </div>
      </div>

      {/* Memory chart */}
      <div className="card">
        <div className="card__header">
          <div>
            <div className="card__title">Memory usage</div>
            <div style={{fontSize:12, color:"var(--muted)", marginTop:2}}>
              Last hour · current <strong style={{color:"var(--text-2)", fontFamily:"var(--font-mono)"}}>{task.mem}%</strong>
            </div>
          </div>
        </div>
        <div className="card__body" style={{paddingTop: 8}}>
          <LineChart width={1100} height={220} labels={labels}
                     series={[{ name: "Memory", data: detail.mem, color: "#3b82f6" }]}/>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TaskDetailPage });
