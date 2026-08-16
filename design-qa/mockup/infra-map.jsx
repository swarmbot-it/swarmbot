/* ============================================================
   INFRA MAP page — node & resource map (service placement)
   ============================================================ */

const INFRA_CATS = [
  { id: "ingress",  label: "Ingress",  color: "var(--info)",        stacks: ["api-gateway", "edge-cdn"] },
  { id: "apps",     label: "Apps",     color: "var(--primary-500)", stacks: ["frontend", "billing", "media-proc"] },
  { id: "data",     label: "Data",     color: "var(--success)",     stacks: ["databases", "messaging", "search", "analytics"] },
  { id: "identity", label: "Identity", color: "var(--warning)",     stacks: ["auth"] },
  { id: "ops",      label: "Ops",      color: "var(--neutral)",     stacks: ["monitoring", "logging"] },
];
const infraCat = (stack) => INFRA_CATS.find(c => c.stacks.includes(stack)) || INFRA_CATS[4];

function buildInfraPlacement() {
  const D = window.SBData;
  const byNode = {};
  D.TASKS.forEach(t => {
    const svcName = t.name.replace(/\.\d+$/, "");
    const node = (byNode[t.node] = byNode[t.node] || {});
    const e = (node[svcName] = node[svcName] || { name: svcName, count: 0, failed: false, pending: false, mem: 0 });
    e.count++;
    if (t.status === "FAILED") e.failed = true;
    if (t.status === "PENDING" || t.status === "STARTING") e.pending = true;
    e.mem = Math.max(e.mem, t.mem);
  });
  return byNode;
}

function InfraNodeCard({ node, placement }) {
  const D = window.SBData;
  const mono = "var(--font-mono)";
  const isMgr = node.role === "manager";
  const leader = node.tags.includes("LEADER");
  const roleColor = isMgr ? "var(--info)" : "var(--neutral)";
  const barColor = node.mem >= 70 ? "var(--primary-500)" : roleColor;
  const svcs = Object.values(placement[node.host] || {})
    .map(e => ({ ...e, svc: D.SERVICES.find(s => s.name === e.name) }))
    .sort((a, b) => b.mem - a.mem);

  return (
    <div className="card" data-testid={`infra-node-${node.host}`}
         style={{padding:"11px 12px", display:"flex", flexDirection:"column", gap:8, borderTop:`3px solid ${roleColor}`}}>
      <div style={{display:"flex", alignItems:"center", gap:7}}>
        <span style={{display:"inline-grid", placeItems:"center", width:19, height:19, borderRadius:6,
                      background: isMgr ? "var(--info-soft)" : "rgba(100,116,139,.14)", color: roleColor,
                      fontFamily:mono, fontSize:11, fontWeight:700, flex:"none"}}>{isMgr ? "M" : "W"}</span>
        <span style={{fontFamily:mono, fontSize:13.5, fontWeight:700}}>{node.host}</span>
        {leader && <span className="badge badge--primary" style={{fontSize:9, padding:"1px 6px"}}>LEADER</span>}
        <span style={{marginLeft:"auto", fontFamily:mono, fontSize:10, color:"var(--muted)", whiteSpace:"nowrap"}}>{node.ip}</span>
      </div>
      <div>
        <div style={{display:"flex", justifyContent:"space-between", fontFamily:mono, fontSize:10, color:"var(--muted)", marginBottom:3}}>
          <span>mem {node.mem}%</span>
          <span>cpu {node.cpu}% · disk {node.disk}%</span>
        </div>
        <div style={{height:5, borderRadius:3, background:"var(--border)", overflow:"hidden"}}>
          <div style={{width:`${node.mem}%`, height:"100%", background:barColor}}/>
        </div>
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:5}}>
        {svcs.map(e => {
          const stack = e.svc ? e.svc.stack : "monitoring";
          const cat = infraCat(stack);
          const short = e.name.includes("_") ? e.name.slice(e.name.indexOf("_") + 1) : e.name;
          return (
            <div key={e.name} title={`${e.name} — stack ${stack}`}
                 style={{display:"flex", alignItems:"center", gap:6, padding:"3px 8px",
                         background:"var(--surface-hover)", border:"1px solid var(--border)",
                         borderLeft:`3px solid ${cat.color}`, borderRadius:7}}>
              <span style={{fontFamily:mono, fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{short}</span>
              {e.count > 1 && <span style={{fontFamily:mono, fontSize:9.5, color:"var(--muted)", flex:"none"}}>×{e.count}</span>}
              <span data-testid="infra-svc-mem" style={{marginLeft:"auto", fontFamily:mono, fontSize:10, color:"var(--muted)", whiteSpace:"nowrap", flex:"none"}}>mem {e.mem}%</span>
              {e.failed && <span className="dot dot--danger" style={{boxShadow:"none", flex:"none"}}/>}
              {!e.failed && e.pending && <span className="dot dot--warning" style={{boxShadow:"none", flex:"none"}}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfraMapPage() {
  const D = window.SBData;
  const mono = "var(--font-mono)";
  const placement = React.useMemo(buildInfraPlacement, []);

  const managers = D.NODES.filter(n => n.role === "manager");
  const workers  = D.NODES.filter(n => n.role === "worker" && !n.tags.includes("DRAIN"));
  const drained  = D.NODES.filter(n => n.tags.includes("DRAIN"));
  const ready    = D.NODES.length - drained.length;
  const runningTasks = D.TASKS.filter(t => t.status === "RUNNING" || t.status === "HEALTHY" || t.status === "UPDATING").length;
  const peakNode = [...D.NODES].filter(n => !n.tags.includes("DRAIN")).sort((a, b) => b.cpu - a.cpu)[0];

  const svcSummary = D.SERVICES.map(s => {
    const nodes = new Set(D.TASKS.filter(t => t.name.startsWith(s.name + ".")).map(t => t.node));
    return { ...s, nodeCount: nodes.size };
  }).sort((a, b) => b.replicas[1] - a.replicas[1]);
  const colA = svcSummary.slice(0, Math.ceil(svcSummary.length / 2));
  const colB = svcSummary.slice(Math.ceil(svcSummary.length / 2));

  const sectionLabel = (color, text) => (
    <div style={{margin:"0 0 6px", fontFamily:mono, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", color, fontWeight:700}}>{text}</div>
  );

  const summaryCol = (rows) => (
    <div style={{flex:1, display:"flex", flexDirection:"column"}}>
      <div style={{display:"grid", gridTemplateColumns:"14px 1.6fr .6fr .5fr", gap:6, padding:"0 0 5px",
                   fontFamily:mono, fontSize:9.5, letterSpacing:".5px", textTransform:"uppercase", color:"var(--muted)",
                   borderBottom:"1px solid var(--border)"}}>
        <span/><span>Service</span><span style={{textAlign:"right"}}>Repl</span><span style={{textAlign:"right"}}>Nodes</span>
      </div>
      {rows.map(s => (
        <div key={s.name} style={{display:"grid", gridTemplateColumns:"14px 1.6fr .6fr .5fr", gap:6, padding:"5px 0",
                                  borderBottom:"1px solid var(--border)", fontFamily:mono, fontSize:10.5, alignItems:"center"}}>
          <span style={{width:10, height:10, borderRadius:3, background:infraCat(s.stack).color}}/>
          <span style={{fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} title={s.name}>{s.name}</span>
          <span style={{textAlign:"right", color: s.replicas[0] < s.replicas[1] ? "var(--warning)" : "var(--text)"}}>{s.replicas[0]}/{s.replicas[1]}</span>
          <span style={{textAlign:"right", color:"var(--muted)"}}>{s.nodeCount}</span>
        </div>
      ))}
    </div>
  );

  const totalTile = (value, label, color) => (
    <div style={{padding:"9px 10px", background:"var(--surface-hover)", border:"1px solid var(--border)", borderRadius:10}}>
      <div style={{fontFamily:mono, fontSize:19, fontWeight:800, color: color || "var(--text)", lineHeight:1}}>{value}</div>
      <div style={{fontSize:10.5, color:"var(--muted)", marginTop:3}}>{label}</div>
    </div>
  );

  const flow = (n, bg, title, text) => (
    <div style={{display:"flex", gap:9, alignItems:"flex-start", padding:"7px 0", borderTop:"1px solid var(--border)"}}>
      <span style={{flex:"none", display:"grid", placeItems:"center", width:19, height:19, borderRadius:999, background:bg, color:"#fff", fontFamily:mono, fontSize:10.5, fontWeight:700}}>{n}</span>
      <div style={{fontFamily:mono, fontSize:10.5, color:"var(--muted)", lineHeight:1.4}}>
        <strong style={{color:"var(--text)"}}>{title}</strong> — {text}
      </div>
    </div>
  );

  return (
    <div data-screen-label="06 Infra Map">
      <div className="page-header">
        <div>
          <h1 className="page-header__title">Infra Map</h1>
          <div className="page-header__count">
            Service placement across the swarm — live memory, replicas and roles
          </div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <span className="badge badge--success">{ready} / {D.NODES.length} nodes ready</span>
          <span className="badge badge--info">{runningTasks} / {D.TASKS.length} tasks running</span>
        </div>
      </div>

      {/* Legend */}
      <div className="card" style={{display:"flex", flexWrap:"wrap", alignItems:"center", gap:"10px 20px", padding:"10px 14px", marginBottom:14}}>
        <div style={{display:"flex", alignItems:"center", gap:9}}>
          <span style={{fontFamily:mono, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", color:"var(--muted)"}}>Nodes</span>
          <span style={{display:"inline-flex", alignItems:"center", gap:5, fontSize:12}}>
            <span style={{display:"inline-grid", placeItems:"center", width:19, height:19, borderRadius:6, background:"var(--info-soft)", color:"var(--info)", fontFamily:mono, fontSize:11, fontWeight:700}}>M</span>manager
          </span>
          <span style={{display:"inline-flex", alignItems:"center", gap:5, fontSize:12}}>
            <span style={{display:"inline-grid", placeItems:"center", width:19, height:19, borderRadius:6, background:"rgba(100,116,139,.14)", color:"var(--neutral)", fontFamily:mono, fontSize:11, fontWeight:700}}>W</span>worker
          </span>
        </div>
        <span style={{width:1, height:22, background:"var(--border)"}}/>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{fontFamily:mono, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", color:"var(--muted)"}}>Category</span>
          {INFRA_CATS.map(c => (
            <span key={c.id} style={{display:"inline-flex", alignItems:"center", gap:5, fontSize:12}}>
              <span style={{width:11, height:11, borderRadius:3, background:c.color}}/>{c.label}
            </span>
          ))}
        </div>
        <span style={{width:1, height:22, background:"var(--border)"}}/>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <span style={{fontFamily:mono, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", color:"var(--muted)"}}>Tasks</span>
          <span style={{display:"inline-flex", alignItems:"center", gap:5, fontSize:12}}><span className="dot dot--danger" style={{boxShadow:"none"}}/>failed</span>
          <span style={{display:"inline-flex", alignItems:"center", gap:5, fontSize:12}}><span className="dot dot--warning" style={{boxShadow:"none"}}/>pending / starting</span>
        </div>
      </div>

      {/* Managers */}
      {sectionLabel("var(--info)", `Managers · raft quorum ${managers.length} of ${managers.length} · ${managers.map(n => n.host.replace("swarm-", "")).join(" · ")}`)}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:14, alignItems:"start"}}>
        {managers.map(n => <InfraNodeCard key={n.id} node={n} placement={placement}/>)}
      </div>

      {/* Workers */}
      {sectionLabel("var(--text)", `Workers · active · ${workers.map(n => n.host.replace("swarm-", "")).join(" · ")}`)}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:14, alignItems:"start"}}>
        {workers.map(n => <InfraNodeCard key={n.id} node={n} placement={placement}/>)}
      </div>

      {/* Drained tray */}
      {drained.length > 0 && (
        <div style={{display:"flex", alignItems:"center", gap:12, padding:"10px 14px", border:"1.5px dashed var(--border)", borderRadius:"var(--r-md)", marginBottom:16}}>
          <span style={{fontFamily:mono, fontSize:11, letterSpacing:1.5, textTransform:"uppercase", color:"var(--muted)", fontWeight:700, flex:"none"}}>Drained</span>
          {drained.map(n => (
            <div key={n.id} style={{opacity:.72, display:"flex", alignItems:"center", gap:8, padding:"6px 11px", border:"1.5px dashed var(--border)", borderRadius:10}}>
              <span style={{fontFamily:mono, fontSize:12, fontWeight:700}}>{n.host}</span>
              <span style={{fontSize:11, color:"var(--muted)"}}>no tasks scheduled · docker {n.docker} · awaiting maintenance</span>
            </div>
          ))}
        </div>
      )}

      {/* Lower: summary + totals/flows */}
      <div style={{display:"grid", gridTemplateColumns:"1.55fr 1fr", gap:14, alignItems:"start"}}>
        <div className="card" style={{padding:"14px 15px", display:"flex", flexDirection:"column", gap:9}}>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <span style={{width:4, height:16, borderRadius:2, background:"var(--primary-500)"}}/>
            <span style={{fontFamily:mono, fontSize:12, letterSpacing:1.5, textTransform:"uppercase", fontWeight:700}}>Per-service placement summary</span>
          </div>
          <div style={{display:"flex", gap:18}}>
            {summaryCol(colA)}
            {summaryCol(colB)}
          </div>
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:14}}>
          <div className="card" style={{padding:"14px 15px"}}>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:11}}>
              <span style={{width:4, height:16, borderRadius:2, background:"var(--info)"}}/>
              <span style={{fontFamily:mono, fontSize:12, letterSpacing:1.5, textTransform:"uppercase", fontWeight:700}}>Cluster totals</span>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:9}}>
              {totalTile(`${ready}/${D.NODES.length}`, "nodes ready", "var(--success)")}
              {totalTile(`${runningTasks}`, "tasks running", "var(--primary-500)")}
              {totalTile(`${D.SERVICES.length}`, "services")}
              {totalTile(`${D.STACKS.length}`, "stacks")}
              {totalTile(`${D.NETWORKS.length}`, "overlay networks", "var(--info)")}
              {totalTile(`${peakNode.cpu}%`, `peak cpu · ${peakNode.host.replace("swarm-", "")}`, "var(--warning)")}
            </div>
            <div style={{marginTop:10, padding:"9px 11px", background:"var(--warning-soft)", border:"1px solid var(--warning)", borderRadius:10, fontSize:11, lineHeight:1.4}}>
              Workers carry the app load — highest CPU pressure on <strong>{peakNode.host} ({peakNode.cpu}%)</strong>; {drained[0] ? `${drained[0].host} is drained.` : "all nodes active."}
            </div>
          </div>

          <div className="card" style={{padding:"14px 15px 8px"}}>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6}}>
              <span style={{width:4, height:16, borderRadius:2, background:"var(--primary-500)"}}/>
              <span style={{fontFamily:mono, fontSize:12, letterSpacing:1.5, textTransform:"uppercase", fontWeight:700}}>Key flows</span>
            </div>
            {flow(1, "var(--primary-500)", "Public", "Internet → traefik (api-gateway) → ingress overlay · TLS")}
            {flow(2, "var(--info)", "Auth", "requests → auth service → api-gateway middleware")}
            {flow(3, "var(--neutral)", "App data", "apps → postgres / redis / rabbitmq · replica streaming")}
            {flow(4, "var(--neutral)", "Metrics", "node-exporter ×8 → prometheus → grafana")}
            {flow(5, "var(--neutral)", "Logs", "promtail ×8 → loki · retention 14d")}
          </div>
        </div>
      </div>
    </div>
  );
}
