/* ============================================================
   SwarmBot — All table-based pages
   (Stacks, Services, Tasks, Networks, Volumes, Secrets, Configs, Registries, Users)
   ============================================================ */

function TablePage({ screenLabel, title, count, countNoun, button, children }) {
  return (
    <div data-screen-label={screenLabel}>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">{title}</h1>
          <div className="page-header__count">
            <strong>{count}</strong> {countNoun}
          </div>
        </div>
        {button}
      </div>
      {children}
    </div>
  );
}

/* ----------------- STACKS ----------------- */
function StacksPage({ openForm, onOpenStack }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Stack", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Icon name="stacks" size={16} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600}}>{r.name}</span>
      </div>
    )},
    { key:"services",  label:"Services", align:"right", render: r => <span className="num">{r.services}</span> },
    { key:"networks",  label:"Networks", align:"right", render: r => <span className="num">{r.networks}</span> },
    { key:"volumes",   label:"Volumes",  align:"right", render: r => <span className="num">{r.volumes}</span> },
    { key:"configs",   label:"Configs",  align:"right", render: r => <span className="num">{r.configs}</span> },
    { key:"secrets",   label:"Secrets",  align:"right", render: r => <span className="num">{r.secrets}</span> },
    { key:"status",    label:"Status",   render: r => <StatusBadge status={r.status}/> },
    { key:"chev",      label:"", sortable:false, width: 28, align:"right",
      render: () => <Icon name="chevronRight" size={14} style={{color:"var(--muted-2)"}}/> },
  ];
  return (
    <TablePage
      screenLabel="03 Stacks"
      title="Stacks"
      count={D.STACKS.length}
      countNoun="stacks deployed"
      button={<button className="btn btn--primary" onClick={() => openForm("stack")}><Icon name="plus" size={16}/> New stack</button>}
    >
      <DataTable
        columns={cols}
        rows={D.STACKS}
        searchKeys={["name","status"]}
        onRowClick={(row) => onOpenStack(row.name)}
      />
    </TablePage>
  );
}

/* ----------------- SERVICES ----------------- */
function ServicesPage({ openForm, onOpenService }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Service", render: r => (
      <div style={{cursor:"pointer"}}>
        <div style={{fontWeight:600, color:"var(--primary-600)"}}>{r.name}</div>
        <div style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--font-mono)", marginTop:2}}>{r.image}</div>
      </div>
    )},
    { key:"replicas", label:"Replicas", width: 200,
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
  return (
    <TablePage
      screenLabel="04 Services"
      title="Services"
      count={D.SERVICES.length}
      countNoun="services running"
    >
      <DataTable columns={cols} rows={D.SERVICES} searchKeys={["name","image","status","stack"]}
                 onRowClick={(row) => onOpenService(row.name)}/>
    </TablePage>
  );
}

/* ----------------- TASKS ----------------- */
function TasksPage({ onOpenTask }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Task", render: r => (
      <div style={{cursor:"pointer"}}>
        <div style={{fontWeight:600, fontFamily:"var(--font-mono)", fontSize:12.5, color:"var(--primary-600)"}}>{r.name}</div>
        <div style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--font-mono)", marginTop:2}}>{r.image}</div>
      </div>
    )},
    { key:"node", label:"Node", render: r => <span className="mono">{r.node}</span> },
    { key:"cpu", label:"CPU", width: 160, sortFn: r => r.cpu, render: r => {
      const hist = D.TASK_HISTORIES[r.id];
      return (
        <div className="meter">
          <Sparkline data={hist.cpu} width={70} height={22} color="var(--primary-500)" strokeWidth={1.25}/>
          <span className="meter__value">{r.cpu}%</span>
        </div>
      );
    }},
    { key:"mem", label:"Memory", width: 160, sortFn: r => r.mem, render: r => {
      const hist = D.TASK_HISTORIES[r.id];
      return (
        <div className="meter">
          <Sparkline data={hist.mem} width={70} height={22} color="#3b82f6" strokeWidth={1.25}/>
          <span className="meter__value">{r.mem}%</span>
        </div>
      );
    }},
    { key:"updated", label:"Last updated", render: r => <span style={{color:"var(--muted)"}}>{r.updated}</span> },
    { key:"status", label:"Status", render: r => <StatusBadge status={r.status}/> },
  ];
  return (
    <TablePage
      screenLabel="05 Tasks"
      title="Tasks"
      count={D.TASKS.length}
      countNoun="tasks scheduled"
    >
      <DataTable columns={cols} rows={D.TASKS} searchKeys={["name","image","node","status"]} pageSize={12}
                 onRowClick={(row) => onOpenTask(row.id)}/>
    </TablePage>
  );
}

/* ----------------- NETWORKS ----------------- */
function NetworksPage({ openForm }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Icon name="networks" size={14} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600}}>{r.name}</span>
      </div>
    )},
    { key:"driver", label:"Driver", render: r => <span className="badge badge--neutral" style={{textTransform:"uppercase", fontSize:10.5, letterSpacing:".06em"}}>{r.driver}</span> },
    { key:"subnet", label:"Subnet", render: r => <span className="mono">{r.subnet}</span> },
    { key:"gateway", label:"Gateway", render: r => <span className="mono">{r.gateway}</span> },
    { key:"scope", label:"Scope", render: r => <span className="mono" style={{color:"var(--muted)"}}>{r.scope}</span> },
  ];
  return (
    <TablePage
      screenLabel="08 Networks"
      title="Networks"
      count={D.NETWORKS.length}
      countNoun="networks available"
      button={<button className="btn btn--primary" onClick={() => openForm("network")}><Icon name="plus" size={16}/> New network</button>}
    >
      <DataTable columns={cols} rows={D.NETWORKS} searchKeys={["name","driver","subnet","gateway"]}/>
    </TablePage>
  );
}

/* ----------------- VOLUMES ----------------- */
function VolumesPage({ openForm }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Icon name="volumes" size={14} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600}}>{r.name}</span>
      </div>
    )},
    { key:"driver", label:"Driver", render: r => <span className="badge badge--neutral" style={{textTransform:"uppercase", fontSize:10.5, letterSpacing:".06em"}}>{r.driver}</span> },
    { key:"size", label:"Size", align:"right", render: r => <span className="mono">{r.size}</span> },
  ];
  return (
    <TablePage
      screenLabel="09 Volumes"
      title="Volumes"
      count={D.VOLUMES.length}
      countNoun="volumes provisioned"
      button={<button className="btn btn--primary" onClick={() => openForm("volume")}><Icon name="plus" size={16}/> New volume</button>}
    >
      <DataTable columns={cols} rows={D.VOLUMES} searchKeys={["name","driver"]}/>
    </TablePage>
  );
}

/* ----------------- SECRETS ----------------- */
function SecretsPage({ openForm }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Icon name="secrets" size={14} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600, fontFamily:"var(--font-mono)", fontSize:12.5}}>{r.name}</span>
      </div>
    )},
    { key:"created", label:"Created", render: r => <span className="mono" style={{color:"var(--muted)"}}>{r.created}</span> },
    { key:"updated", label:"Last updated", render: r => <span className="mono">{r.updated}</span> },
    { key:"actions", label:"", sortable:false, align:"right", width: 56, render: () => (
      <button className="btn btn--ghost btn--icon btn--sm" title="View">
        <Icon name="eye" size={14}/>
      </button>
    )},
  ];
  return (
    <TablePage
      screenLabel="10 Secrets"
      title="Secrets"
      count={D.SECRETS.length}
      countNoun="secrets stored"
      button={<button className="btn btn--primary" onClick={() => openForm("secret")}><Icon name="plus" size={16}/> New secret</button>}
    >
      <DataTable columns={cols} rows={D.SECRETS} searchKeys={["name"]}/>
    </TablePage>
  );
}

/* ----------------- CONFIGS ----------------- */
function ConfigsPage({ openForm }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Name", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Icon name="configs" size={14} style={{color:"var(--primary-500)"}}/>
        <span style={{fontWeight:600, fontFamily:"var(--font-mono)", fontSize:12.5}}>{r.name}</span>
      </div>
    )},
    { key:"created", label:"Created", render: r => <span className="mono" style={{color:"var(--muted)"}}>{r.created}</span> },
    { key:"updated", label:"Last updated", render: r => <span className="mono">{r.updated}</span> },
    { key:"actions", label:"", sortable:false, align:"right", width: 56, render: () => (
      <button className="btn btn--ghost btn--icon btn--sm" title="View"><Icon name="eye" size={14}/></button>
    )},
  ];
  return (
    <TablePage
      screenLabel="11 Configs"
      title="Configs"
      count={D.CONFIGS.length}
      countNoun="configs stored"
      button={<button className="btn btn--primary" onClick={() => openForm("config")}><Icon name="plus" size={16}/> New config</button>}
    >
      <DataTable columns={cols} rows={D.CONFIGS} searchKeys={["name"]}/>
    </TablePage>
  );
}

/* ----------------- REGISTRIES ----------------- */
function RegistriesPage({ openForm }) {
  const D = window.SBData;
  const cols = [
    { key:"name", label:"Registry", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <Icon name="registries" size={14} style={{color:"var(--primary-500)"}}/>
        <span>
          <span style={{fontWeight:600}}>{r.name}</span>
          {r.default && <span className="tag tag--primary" style={{marginLeft:8}}>DEFAULT</span>}
          <div style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--font-mono)", marginTop:2}}>{r.url}</div>
        </span>
      </div>
    )},
    { key:"type", label:"Type", render: r => <span className="badge badge--neutral" style={{textTransform:"none", letterSpacing:0}}>{r.type}</span> },
    { key:"user", label:"Auth user", render: r => <span className="mono">{r.user}</span> },
    { key:"actions", label:"", sortable:false, align:"right", width: 56, render: () => (
      <button className="btn btn--ghost btn--icon btn--sm" title="Edit"><Icon name="settings" size={14}/></button>
    )},
  ];
  return (
    <TablePage
      screenLabel="12 Registries"
      title="Registries"
      count={D.REGISTRIES.length}
      countNoun="registries connected"
      button={<button className="btn btn--primary" onClick={() => openForm("registry")}><Icon name="plus" size={16}/> Connect registry</button>}
    >
      <DataTable columns={cols} rows={D.REGISTRIES} searchKeys={["name","url","type","user"]}/>
    </TablePage>
  );
}

/* ----------------- USERS ----------------- */
function UsersPage({ openForm }) {
  const D = window.SBData;
  const roleVariant = { "Administrator": "primary", "Editor": "info", "Read-only": "neutral" };
  const initials = name => name.split(" ").map(p => p[0]).slice(0,2).join("").toUpperCase();

  const cols = [
    { key:"name", label:"User", render: r => (
      <div style={{display:"flex", alignItems:"center", gap:10}}>
        <div className="avatar" style={{width:28, height:28, fontSize:11}}>{initials(r.name)}</div>
        <div>
          <div style={{fontWeight:600}}>{r.name}</div>
          <div style={{fontSize:11.5, color:"var(--muted)"}}>{r.email}</div>
        </div>
      </div>
    )},
    { key:"phone", label:"Phone", render: r => r.phone
        ? <span className="mono">{r.phone}</span>
        : <span style={{color:"var(--muted)"}}>—</span> },
    { key:"role", label:"Role", render: r => (
      <span className={`tag tag--${roleVariant[r.role] || "neutral"}`}>{r.role}</span>
    )},
    { key:"created", label:"Created", render: r => <span className="mono" style={{color:"var(--muted)"}}>{r.created}</span> },
    { key:"lastLogin", label:"Last login", render: r => <span style={{color: r.lastLogin === "never" ? "var(--muted)" : "var(--text-2)"}}>{r.lastLogin}</span> },
  ];
  return (
    <TablePage
      screenLabel="13 Users"
      title="Users"
      count={D.USERS.length}
      countNoun="users in workspace"
      button={<button className="btn btn--primary" onClick={() => openForm("user")}><Icon name="plus" size={16}/> Add user</button>}
    >
      <DataTable columns={cols} rows={D.USERS} searchKeys={["name","email","phone","role"]}/>
    </TablePage>
  );
}

Object.assign(window, {
  StacksPage, ServicesPage, TasksPage, NetworksPage,
  VolumesPage, SecretsPage, ConfigsPage, RegistriesPage, UsersPage,
});
