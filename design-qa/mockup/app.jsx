/* ============================================================
   SwarmBot — Main app shell, routing, theme, toasts, tweaks
   ============================================================ */

const NAV = [
  { id: "dashboard",  label: "Dashboard",  icon: "dashboard",  group: "overview" },
  { id: "load",       label: "Load",       icon: "load",       group: "resources" },
  { id: "stacks",     label: "Stacks",     icon: "stacks",     group: "resources", countKey: "STACKS"   },
  { id: "services",   label: "Services",   icon: "services",   group: "resources", countKey: "SERVICES" },
  { id: "tasks",      label: "Tasks",      icon: "tasks",      group: "resources", countKey: "TASKS"    },
  { id: "infra-map",  label: "Infra Map",  icon: "map",        group: "infra" },
  { id: "nodes",      label: "Nodes",      icon: "nodes",      group: "infra",     countKey: "NODES"    },
  { id: "networks",   label: "Networks",   icon: "networks",   group: "infra",     countKey: "NETWORKS" },
  { id: "volumes",    label: "Volumes",    icon: "volumes",    group: "infra",     countKey: "VOLUMES"  },
  { id: "secrets",    label: "Secrets",    icon: "secrets",    group: "store",     countKey: "SECRETS"  },
  { id: "configs",    label: "Configs",    icon: "configs",    group: "store",     countKey: "CONFIGS"  },
  { id: "registries", label: "Registries", icon: "registries", group: "store",     countKey: "REGISTRIES" },
  { id: "users",      label: "Users",      icon: "users",      group: "admin",     countKey: "USERS"    },
];

const LANGUAGES = [
  { code: "DE", name: "Deutsch",  english: "German"   },
  { code: "EN", name: "English",  english: "English"  },
  { code: "ES", name: "Español",  english: "Spanish"  },
  { code: "IT", name: "Italiano", english: "Italian"  },
  { code: "PL", name: "Polski",   english: "Polish"   },
  /* divider — non-Latin scripts */
  { code: "ZH", name: "中文",      english: "Chinese"  },
  { code: "JA", name: "日本語",    english: "Japanese" },
  { code: "KO", name: "한국어",    english: "Korean"   },
];

const GROUP_LABELS = {
  overview: "Overview",
  resources: "Resources",
  infra: "Infrastructure",
  store: "Storage & Config",
  admin: "Administration",
};

/* Demo mode — read-only public demo (demo.swarmbot.it) */
const DEMO_MODE = new URLSearchParams(location.search).has("demo");
const DEMO_TOAST = "Demo mode — changes are disabled";

/* ----------------- Sidebar ----------------- */
function Sidebar({ current, onNavigate }) {
  const D = window.SBData;
  const grouped = NAV.reduce((acc, item) => {
    (acc[item.group] = acc[item.group] || []).push(item);
    return acc;
  }, {});

  return (
    <nav className="sidebar">
      {Object.entries(grouped).map(([group, items]) => (
        <React.Fragment key={group}>
          <div className="sidebar__group-label">{GROUP_LABELS[group]}</div>
          {items.map(item => (
            <div key={item.id}
                 className={`sidebar__item ${current === item.id ? "sidebar__item--active" : ""}`}
                 data-label={item.label}
                 onClick={() => onNavigate(item.id)}>
              <Icon name={item.icon} size={17}/>
              <span>{item.label}</span>
              {item.countKey && <span className="sidebar__count">{D[item.countKey].length}</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
      <div className="sidebar__footer">
        <div className="sidebar__cluster-status">
          <span className="dot dot--success"/>
          Cluster healthy
        </div>
        <div>Quorum: 3 of 3 managers</div>
        <div>API: <span style={{fontFamily:"var(--font-mono)"}}>v1.45</span></div>
      </div>
    </nav>
  );
}

/* ----------------- Topbar ----------------- */
function Topbar({ theme, onTheme, onLogout, language, onLanguage, onOpenProfile }) {
  const [menu, setMenu] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const ref = useRef();

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[1];

  useEffect(() => {
    const click = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setMenu(false);
        setLangOpen(false);
      }
    };
    if (menu) document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [menu]);

  useEffect(() => { if (!menu) setLangOpen(false); }, [menu]);

  return (
    <div className="topbar">
      <Logo/>
      <span style={{width:1, height:28, background:"var(--border)", marginLeft:8}}/>
      <div style={{display:"flex", alignItems:"center", gap:6, marginLeft:8}}>
        <span className="dot dot--success"/>
        <span style={{fontSize:13, fontWeight:600}}>prod-eu-1</span>
        <Icon name="chevronDown" size={14} style={{color:"var(--muted)"}}/>
      </div>
      {DEMO_MODE && (
        <span data-testid="demo-badge"
              style={{marginLeft:10, padding:"3px 9px", borderRadius:999, background:"var(--warning-soft)", color:"var(--warning)",
                      fontFamily:"var(--font-mono)", fontSize:10.5, fontWeight:700, letterSpacing:".06em", whiteSpace:"nowrap"}}>
          DEMO · READ-ONLY
        </span>
      )}

      <div className="topbar__spacer"/>

      {/* Theme switch — segmented icon toggle on the topbar */}
      <div className="theme-toggle" role="group" aria-label="Color theme">
        <button
          className={`theme-toggle__btn ${theme === "light" ? "theme-toggle__btn--active" : ""}`}
          onClick={() => onTheme("light")}
          aria-pressed={theme === "light"}
          aria-label="Light theme"
          title="Light theme">
          <Icon name="sun" size={16}/>
        </button>
        <button
          className={`theme-toggle__btn ${theme === "dark" ? "theme-toggle__btn--active" : ""}`}
          onClick={() => onTheme("dark")}
          aria-pressed={theme === "dark"}
          aria-label="Dark theme"
          title="Dark theme">
          <Icon name="moon" size={16}/>
        </button>
      </div>

      <button className="btn btn--ghost btn--icon" title="Notifications" style={{position:"relative"}}>
        <Icon name="bell" size={18}/>
        <span style={{
          position:"absolute", top:8, right:9,
          width:7, height:7, borderRadius:"50%", background:"var(--primary-500)",
          boxShadow:"0 0 0 2px var(--surface)",
        }}/>
      </button>

      <div ref={ref} style={{position:"relative"}}>
        <div className="topbar__user" onClick={() => setMenu(!menu)}>
          <div className="avatar">AN</div>
          <div style={{display:"flex", flexDirection:"column"}}>
            <span className="topbar__user-name">Aleksandra Nowak</span>
            <span className="topbar__user-role">Administrator</span>
          </div>
          <Icon name="chevronDown" size={14} style={{color:"var(--muted)", marginLeft:2}}/>
        </div>
        {menu && (
          <div className="popover">
            <div className="popover__header">
              <div className="popover__name">Aleksandra Nowak</div>
              <div className="popover__email">a.nowak@swarmbot.it</div>
            </div>

            <div className="popover__item" onClick={() => { setMenu(false); onOpenProfile(); }}>
              <Icon name="user" size={15} style={{color:"var(--muted)"}}/>
              <span>Profile</span>
            </div>
            <div className="popover__item">
              <Icon name="settings" size={15} style={{color:"var(--muted)"}}/>
              <span>Preferences</span>
            </div>
            <div className="popover__item">
              <Icon name="keys" size={15} style={{color:"var(--muted)"}}/>
              <span>API tokens</span>
            </div>

            <div className="popover__divider"/>
            <div className="popover__sub">Language</div>
            <div className="popover__item lang-trigger" onClick={() => setLangOpen(!langOpen)}>
              <span className="lang-code">{currentLang.code}</span>
              <span style={{flex:1}}>{currentLang.name}</span>
              <Icon name="chevronDown" size={14} style={{color:"var(--muted)", transform: langOpen ? "rotate(180deg)" : "none", transition:"transform .15s"}}/>
            </div>
            {langOpen && (
              <div className="lang-list">
                {LANGUAGES.slice(0, 5).map(l => (
                  <div key={l.code}
                       className={`popover__item lang-item ${l.code === language ? "lang-item--active" : ""}`}
                       onClick={() => { onLanguage(l.code); setLangOpen(false); }}>
                    <span className="lang-code">{l.code}</span>
                    <span style={{flex:1}}>{l.name}</span>
                    {l.code === language && <Icon name="check" size={14} stroke={3} style={{color:"var(--primary-500)"}}/>}
                  </div>
                ))}
                <div className="lang-divider"/>
                {LANGUAGES.slice(5).map(l => (
                  <div key={l.code}
                       className={`popover__item lang-item ${l.code === language ? "lang-item--active" : ""}`}
                       onClick={() => { onLanguage(l.code); setLangOpen(false); }}>
                    <span className="lang-code">{l.code}</span>
                    <span style={{flex:1}}>{l.name}</span>
                    {l.code === language && <Icon name="check" size={14} stroke={3} style={{color:"var(--primary-500)"}}/>}
                  </div>
                ))}
              </div>
            )}
            <div className="popover__divider"/>
            <div className="popover__item popover__item--danger" onClick={onLogout}>
              <Icon name="logout" size={15}/>
              <span>Log out</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------- Toast ----------------- */
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;

  return (
    <div data-testid="toast" style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", padding: "10px 14px 10px 12px",
      boxShadow: "var(--shadow-3)", fontSize: 13.5,
      display: "flex", alignItems: "center", gap: 10, zIndex: 200,
      animation: "pop .2s",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        background: "var(--success-soft)", color: "var(--success)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name="check" size={14} stroke={3}/>
      </div>
      <div style={{fontWeight: 600}}>{toast}</div>
      <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

function BootLoader({ leaving, steps, currentStep }) {
  const pct = Math.round(((currentStep + 1) / steps.length) * 100);
  return (
    <div className={`sb-boot ${leaving ? "sb-boot--leaving" : ""}`}>
      <div className="sb-boot__stage">
        <svg className="sb-boot__mark" viewBox="0 0 32 32" fill="none" aria-label="Loading">
          <line className="sb-blink sb-blink--1" x1="12" y1="16" x2="15.7" y2="9.4"  stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round"/>
          <line className="sb-blink sb-blink--2" x1="12" y1="16" x2="15.7" y2="22.6" stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round"/>
          <line className="sb-blink sb-blink--3" x1="20.3" y1="9.4"  x2="23" y2="14" stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round"/>
          <line className="sb-blink sb-blink--4" x1="20.3" y1="22.6" x2="23" y2="18" stroke="var(--primary-500)" strokeWidth="1.2" strokeLinecap="round"/>
          <circle className="sb-bdot sb-bdot--center" cx="9"  cy="16" r="3.4" fill="var(--primary-500)"/>
          <circle className="sb-bdot sb-bdot--top"    cx="18" cy="9"  r="2.4" fill="var(--primary-400)"/>
          <circle className="sb-bdot sb-bdot--bottom" cx="18" cy="23" r="2.4" fill="var(--primary-400)"/>
          <circle className="sb-bdot sb-bdot--right"  cx="25" cy="16" r="2.8" fill="var(--primary-600)"/>
        </svg>
        <div style={{textAlign:"center"}}>
          <div className="sb-boot__title">swarmbot<span style={{color:"var(--primary-500)"}}>.it</span></div>
        </div>
        <div className="sb-boot__progress">
          <div className="sb-boot__progress-bar" style={{width: `${pct}%`}}/>
        </div>
        <div className="sb-boot__sub">
          <span>{steps[currentStep]}</span>
          <span style={{color:"var(--muted-2)"}}>·</span>
          <span style={{color:"var(--text-2)"}}>{pct}%</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   App
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [theme, setTheme]  = useState(tweaks.theme || "light");
  const [page, setPage]    = useState("dashboard");
  const [stackName, setStackName] = useState(null);
  const [serviceName, setServiceName] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [form, setForm]    = useState(null);
  const [toast, setToast]  = useState(null);
  const [language, setLanguage] = useState("EN");

  /* Current user — first user from the Users dataset */
  const currentUser = window.SBData.USERS[0];

  /* Boot loader — simulates fetching cluster state from backend */
  const BOOT_STEPS = [
    "Connecting to swarm manager…",
    "Fetching node inventory…",
    "Loading stacks & services…",
    "Querying time-series (InfluxDB)…",
    "Almost there…",
  ];
  const [bootStep, setBootStep] = useState(0);
  const [booting, setBooting]   = useState(true);
  const [bootLeaving, setBootLeaving] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i < BOOT_STEPS.length) {
        setBootStep(i);
      } else {
        clearInterval(interval);
        setBootLeaving(true);
        setTimeout(() => setBooting(false), 350);
      }
    }, 380);
    return () => clearInterval(interval);
  }, []);

  /* Sync theme with tweaks */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    setTweak("theme", theme);
  }, [theme]);

  /* Honor incoming tweak changes (e.g. from Tweaks panel) */
  useEffect(() => {
    if (tweaks.theme && tweaks.theme !== theme) setTheme(tweaks.theme);
  }, [tweaks.theme]);

  const openForm  = (kind) => DEMO_MODE ? setToast(DEMO_TOAST) : setForm(kind);
  const closeForm = () => setForm(null);
  const onCreated = (entityLabel) => (data) => {
    setToast(`${entityLabel} "${data.name || data.username}" created`);
  };

  const handleLogout = () => {
    if (DEMO_MODE) { location.href = "demo-login.html"; return; }
    setToast("Logged out — see you soon.");
  };

  const openStack = (name) => { setStackName(name); setPage("stack-detail"); };
  const openService = (name) => { setServiceName(name); setPage("service-detail"); };
  const openTask = (id) => { setTaskId(id); setPage("task-detail"); };
  const handleStackAction = (action, stack) => {
    if (DEMO_MODE) { setToast(DEMO_TOAST); return; }
    if (action === "edit")        setToast(`Editing stack “${stack.name}”…`);
    if (action === "redeploy")    setToast(`Redeploying “${stack.name}”…`);
    if (action === "rollback")    setToast(`Rolled back “${stack.name}” to previous spec`);
    if (action === "deactivate")  setToast(`Stack “${stack.name}” deactivated`);
    if (action === "delete")      setToast(`Stack “${stack.name}” removed`);
  };

  const PageView = () => {
    switch (page) {
      case "dashboard":     return <DashboardPage  openForm={openForm}/>;
      case "load":          return <LoadPage/>;
      case "stacks":        return <StacksPage     openForm={openForm} onOpenStack={openStack}/>;
      case "stack-detail":  return <StackDetailPage stackName={stackName} onBack={() => setPage("stacks")} onAction={handleStackAction}/>;
      case "services":      return <ServicesPage   openForm={openForm} onOpenService={openService}/>;
      case "service-detail":return <ServiceDetailPage serviceName={serviceName} onBack={() => setPage("services")}/>;
      case "tasks":         return <TasksPage onOpenTask={openTask}/>;
      case "task-detail":   return <TaskDetailPage taskId={taskId} onBack={() => setPage("tasks")}/>;
      case "infra-map":     return <InfraMapPage/>;
      case "nodes":         return <NodesPage/>;
      case "networks":      return <NetworksPage   openForm={openForm}/>;
      case "volumes":       return <VolumesPage    openForm={openForm}/>;
      case "secrets":       return <SecretsPage    openForm={openForm}/>;
      case "configs":       return <ConfigsPage    openForm={openForm}/>;
      case "registries":    return <RegistriesPage openForm={openForm}/>;
      case "users":         return <UsersPage      openForm={openForm}/>;
      case "profile":       return <ProfilePage user={currentUser} onSaved={(msg) => setToast(DEMO_MODE ? DEMO_TOAST : msg)} onChangePassword={() => DEMO_MODE ? setToast(DEMO_TOAST) : setForm("password")}/>;
      default: return null;
    }
  };

  return (
    <div className="app">
      <div className="app__topbar">
        <Topbar theme={theme} onTheme={setTheme} onLogout={handleLogout}
                language={language} onLanguage={(c) => { setLanguage(c); setToast(`Language set to ${LANGUAGES.find(l => l.code === c).name}`); }}
                onOpenProfile={() => setPage("profile")}/>
      </div>
      <div className="app__sidebar">
        <Sidebar current={page} onNavigate={setPage}/>
      </div>
      <main className="app__main">
        {!booting && <PageView/>}
      </main>

      {booting && <BootLoader leaving={bootLeaving} steps={BOOT_STEPS} currentStep={bootStep}/>}

      {/* Modal forms — controlled at app level */}
      <UserForm    open={form === "user"}    onClose={closeForm} onCreate={onCreated("User")}/>
      <ConfigForm  open={form === "config"}  onClose={closeForm} onCreate={onCreated("Config")}/>
      <SecretForm  open={form === "secret"}  onClose={closeForm} onCreate={onCreated("Secret")}/>
      <VolumeForm  open={form === "volume"}  onClose={closeForm} onCreate={onCreated("Volume")}/>
      <NetworkForm open={form === "network"} onClose={closeForm} onCreate={onCreated("Network")}/>
      <ServiceForm open={form === "service"} onClose={closeForm} onCreate={(d) => setToast(`Service "${d.name}" created`)}/>
      <StackForm   open={form === "stack"}   onClose={closeForm} onCreate={(d) => setToast(`Stack "${d.name}" deployed`)}/>
      <RegistryForm open={form === "registry"} onClose={closeForm} onCreate={onCreated("Registry")}/>
      <PasswordChangeForm open={form === "password"} onClose={closeForm} onChange={() => setToast("Password updated")}/>

      <Toast toast={toast} onClose={() => setToast(null)}/>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Appearance">
          <TweakRadio
            label="Theme"
            value={theme}
            onChange={(v) => setTheme(v)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark",  label: "Dark"  },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
