/* ============================================================
   SwarmBot — All modal forms
   ============================================================ */

function FormFooter({ onCancel, onSubmit, submitLabel = "Create", disabled }) {
  return (
    <>
      <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
      <button className="btn btn--primary" onClick={onSubmit} disabled={disabled}>{submitLabel}</button>
    </>
  );
}

/* -------------- USER FORM -------------- */
function UserForm({ open, onClose, onCreate }) {
  const [data, setData] = useState({ username: "", password: "", email: "", phone: "", role: "Editor" });
  const [errors, setErrors] = useState({});
  useEffect(() => { if (open) { setData({ username:"", password:"", email:"", phone:"", role:"Editor" }); setErrors({}); } }, [open]);

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const submit = () => {
    const e = {};
    if (!data.username.trim()) e.username = "Username is required.";
    if (!data.password || data.password.length < 8) e.password = "Use at least 8 characters.";
    if (!data.email.includes("@")) e.email = "Enter a valid email.";
    setErrors(e);
    if (Object.keys(e).length === 0) { onCreate(data); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose}
      title="Add new user"
      subtitle="Create an account and assign access to this workspace."
      footer={<FormFooter onCancel={onClose} onSubmit={submit}/>}>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <Field label="Username" required error={errors.username}>
          <input className="input" placeholder="j.kowalski" value={data.username} onChange={(e) => set("username", e.target.value)}/>
        </Field>
        <Field label="Password" required error={errors.password} hint="At least 8 characters.">
          <input className="input" type="password" placeholder="••••••••" value={data.password} onChange={(e) => set("password", e.target.value)}/>
        </Field>
      </div>

      <Field label="Role" required>
        <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10}}>
          {[
            { v:"Read-only",     d:"View dashboards, services, logs." },
            { v:"Editor",        d:"Deploy & edit stacks, services." },
            { v:"Administrator", d:"Full control, users, secrets." },
          ].map(opt => (
            <div key={opt.v}
                 onClick={() => set("role", opt.v)}
                 style={{
                   padding: "12px",
                   border: `1.5px solid ${data.role === opt.v ? "var(--primary-500)" : "var(--border)"}`,
                   borderRadius: "var(--r-md)",
                   cursor: "pointer",
                   background: data.role === opt.v ? "rgba(249,115,22,0.05)" : "var(--surface)",
                   transition: "border-color .12s, background .12s",
                 }}>
              <div style={{fontWeight:700, fontSize:13, color: data.role === opt.v ? "var(--primary-600)" : "var(--text)"}}>
                {opt.v}
              </div>
              <div style={{fontSize:11.5, color:"var(--muted)", marginTop:4, lineHeight:1.35}}>{opt.d}</div>
            </div>
          ))}
        </div>
      </Field>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <Field label="Email" required error={errors.email}>
          <input className="input" type="email" placeholder="user@swarmbot.io" value={data.email} onChange={(e) => set("email", e.target.value)}/>
        </Field>
        <Field label="Phone" hint="Optional">
          <input className="input" placeholder="+48 ...." value={data.phone} onChange={(e) => set("phone", e.target.value)}/>
        </Field>
      </div>
    </Modal>
  );
}

/* -------------- CONFIG FORM -------------- */
function ConfigForm({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setName(""); setContent(""); setError(""); } }, [open]);

  const submit = () => {
    if (!name.trim()) return setError("Name is required.");
    onCreate({ name, content });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide
      title="New config"
      subtitle="Configs are read-only files mounted into your services at runtime."
      footer={<FormFooter onCancel={onClose} onSubmit={submit}/>}>
      <Field label="Name" required error={error}>
        <input className="input" placeholder="e.g. nginx_default_conf" value={name} onChange={(e) => setName(e.target.value)}/>
      </Field>
      <Field label="Content" hint="Plain text. Reach a service via /run/configs/<name>.">
        <textarea className="textarea" rows={12} placeholder={"# example\nserver {\n  listen 80;\n  server_name _;\n}"} value={content} onChange={(e) => setContent(e.target.value)}/>
      </Field>
    </Modal>
  );
}

/* -------------- SECRET FORM -------------- */
function SecretForm({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setName(""); setContent(""); setError(""); } }, [open]);

  const submit = () => {
    if (!name.trim()) return setError("Name is required.");
    onCreate({ name, content });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide
      title="New secret"
      subtitle="Secrets are encrypted at rest and mounted only into the services you grant access."
      footer={<FormFooter onCancel={onClose} onSubmit={submit}/>}>
      <Field label="Name" required error={error}>
        <input className="input" placeholder="e.g. postgres_password" value={name} onChange={(e) => setName(e.target.value)}/>
      </Field>
      <Field label="Content" hint="The contents are stored encrypted. Never echoed back.">
        <textarea className="textarea" rows={8} placeholder="•••••••••••••••••••••••••" value={content} onChange={(e) => setContent(e.target.value)} style={{ fontFamily:"var(--font-mono)" }}/>
      </Field>
    </Modal>
  );
}

/* -------------- VOLUME FORM -------------- */
function VolumeForm({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [driver, setDriver] = useState("local");
  const [labels, setLabels] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setName(""); setDriver("local"); setLabels([]); setError(""); } }, [open]);

  const submit = () => {
    if (!name.trim()) return setError("Name is required.");
    onCreate({ name, driver, labels });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose}
      title="New volume"
      subtitle="Provision a persistent volume in this swarm."
      footer={<FormFooter onCancel={onClose} onSubmit={submit}/>}>
      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:14}}>
        <Field label="Name" required error={error}>
          <input className="input" placeholder="postgres-data" value={name} onChange={(e) => setName(e.target.value)}/>
        </Field>
        <Field label="Driver" required>
          <select className="input select" value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="local">local</option>
            <option value="nfs">nfs</option>
            <option value="s3">s3</option>
            <option value="cifs">cifs</option>
            <option value="rexray">rexray</option>
          </select>
        </Field>
      </div>
      <Field label="Driver options" hint="Optional key/value pairs passed to the driver.">
        <KvEditor value={labels} onChange={setLabels}/>
      </Field>
    </Modal>
  );
}

/* -------------- NETWORK FORM -------------- */
function NetworkForm({ open, onClose, onCreate }) {
  const init = {
    name:"", subnet:"", gateway:"",
    driver:"overlay", attachable:true, internal:false, ingress:false,
    labels:[],
  };
  const [data, setData] = useState(init);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setData(init); setError(""); } }, [open]);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const submit = () => {
    if (!data.name.trim()) return setError("Name is required.");
    onCreate(data);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide
      title="New network"
      subtitle="Create an overlay or bridge network for your services."
      footer={<FormFooter onCancel={onClose} onSubmit={submit}/>}>
      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:14}}>
        <Field label="Name" required error={error}>
          <input className="input" placeholder="my_overlay_net" value={data.name} onChange={(e) => set("name", e.target.value)}/>
        </Field>
        <Field label="Driver" required>
          <select className="input select" value={data.driver} onChange={(e) => set("driver", e.target.value)}>
            <option value="overlay">overlay</option>
            <option value="bridge">bridge</option>
            <option value="macvlan">macvlan</option>
            <option value="ipvlan">ipvlan</option>
          </select>
        </Field>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <Field label="Subnet" hint="CIDR — leave empty to auto-assign.">
          <input className="input" placeholder="10.0.20.0/24" value={data.subnet} onChange={(e) => set("subnet", e.target.value)} style={{fontFamily:"var(--font-mono)"}}/>
        </Field>
        <Field label="Gateway">
          <input className="input" placeholder="10.0.20.1" value={data.gateway} onChange={(e) => set("gateway", e.target.value)} style={{fontFamily:"var(--font-mono)"}}/>
        </Field>
      </div>
      <Field label="Options">
        <div className="switch-grid">
          <SwitchRow label="Attachable" hint="Allow standalone containers to attach."
                     value={data.attachable} onChange={(v) => set("attachable", v)}/>
          <SwitchRow label="Internal" hint="Restrict external access."
                     value={data.internal} onChange={(v) => set("internal", v)}/>
          <SwitchRow label="Ingress" hint="Route swarm ingress traffic."
                     value={data.ingress} onChange={(v) => set("ingress", v)}/>
        </div>
      </Field>
      <Field label="Driver options" hint="Optional key/value pairs.">
        <KvEditor value={data.labels} onChange={(v) => set("labels", v)}/>
      </Field>
    </Modal>
  );
}

/* -------------- SERVICE FORM -------------- */
function ServiceForm({ open, onClose, onCreate }) {
  const D = window.SBData;
  const [step, setStep] = useState(1);
  const [registry, setRegistry] = useState(D.REGISTRIES[0]?.name);
  const [image, setImage] = useState("");
  const [name, setName]   = useState("");
  const [replicas, setReplicas] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1); setRegistry(D.REGISTRIES[0]?.name); setImage(""); setName(""); setReplicas(1); setError("");
    }
  }, [open]);

  const next = () => {
    if (step === 1 && !registry) return setError("Select a registry.");
    if (step === 2 && (!image.trim() || !name.trim())) return setError("Service name and image are required.");
    setError("");
    if (step < 2) setStep(step + 1);
    else { onCreate({ registry, image, name, replicas }); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} wide
      title={step === 1 ? "New service — pick a registry" : "New service — details"}
      subtitle={step === 1
        ? "Choose where to pull the image from. Required to authorize the pull."
        : `Pulling from ${registry}.`}
      footer={
        <>
          {step > 1 && <button className="btn btn--ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={next}>{step < 2 ? "Continue" : "Create service"}</button>
        </>
      }>

      {step === 1 && (
        <>
          {error && <div className="field__error">{error}</div>}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
            {D.REGISTRIES.map(r => (
              <div key={r.name}
                   onClick={() => setRegistry(r.name)}
                   style={{
                     padding:14,
                     border:`1.5px solid ${registry === r.name ? "var(--primary-500)" : "var(--border)"}`,
                     borderRadius:"var(--r-md)",
                     cursor:"pointer",
                     background: registry === r.name ? "rgba(249,115,22,0.05)" : "var(--surface)",
                   }}>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <Icon name="registries" size={18} style={{color: registry === r.name ? "var(--primary-500)" : "var(--muted)"}}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:700, fontSize:13}}>
                      {r.name}
                      {r.default && <span className="tag tag--primary" style={{marginLeft:6}}>DEFAULT</span>}
                    </div>
                    <div style={{fontSize:11.5, color:"var(--muted)", fontFamily:"var(--font-mono)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.url}</div>
                  </div>
                </div>
                <div style={{marginTop:8, fontSize:11.5, color:"var(--muted)"}}>
                  Type: {r.type} · User: <span className="mono">{r.user}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {error && <div className="field__error">{error}</div>}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
            <Field label="Service name" required>
              <input className="input" placeholder="my_service" value={name} onChange={(e) => setName(e.target.value)}/>
            </Field>
            <Field label="Replicas" required>
              <input className="input" type="number" min="0" max="50" value={replicas} onChange={(e) => setReplicas(parseInt(e.target.value)||0)}/>
            </Field>
          </div>
          <Field label="Image" required hint={`Will be pulled from ${registry}.`}>
            <input className="input" placeholder="org/repo:tag" value={image} onChange={(e) => setImage(e.target.value)} style={{fontFamily:"var(--font-mono)"}}/>
          </Field>
          <Field label="Published ports" hint="Optional. Comma-separated host:container pairs, e.g. 80:8080, 443:8443.">
            <input className="input" placeholder="80:8080, 443:8443" style={{fontFamily:"var(--font-mono)"}}/>
          </Field>
          <Field label="Environment variables" hint="Optional key/value pairs.">
            <KvEditor value={[]} onChange={() => {}}/>
          </Field>
        </>
      )}
    </Modal>
  );
}

/* -------------- STACK FORM -------------- */
function StackForm({ open, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setName(""); setContent(""); setError(""); } }, [open]);

  const placeholder =
`version: "3.9"
services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
networks:
  default:
    driver: overlay
`;

  const submit = () => {
    if (!name.trim()) return setError("Stack name is required.");
    onCreate({ name, content });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} wide
      title="Deploy stack"
      subtitle="Provide the stack name and a Compose-style definition."
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit}>
            <Icon name="play" size={14}/> Deploy
          </button>
        </>
      }>
      <Field label="Name" required error={error}>
        <input className="input" placeholder="e.g. frontend" value={name} onChange={(e) => setName(e.target.value)}/>
      </Field>
      <Field label="Compose file" hint="YAML — supports v3.9 and v3 features used by Docker Swarm.">
        <textarea className="textarea" rows={14} placeholder={placeholder} value={content} onChange={(e) => setContent(e.target.value)}/>
      </Field>
    </Modal>
  );
}

/* -------------- REGISTRY FORM (small bonus) -------------- */
function RegistryForm({ open, onClose, onCreate }) {
  const [data, setData] = useState({ name:"", url:"", type:"Docker Hub", user:"", password:"" });
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setData({ name:"", url:"", type:"Docker Hub", user:"", password:"" }); setError(""); } }, [open]);
  const set = (k, v) => setData(d => ({...d, [k]: v}));

  const submit = () => {
    if (!data.name.trim() || !data.url.trim()) return setError("Name and URL are required.");
    onCreate(data); onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title="Connect registry"
      subtitle="Authorize image pulls from a container registry."
      footer={<FormFooter onCancel={onClose} onSubmit={submit} submitLabel="Connect"/>}>
      <Field label="Display name" required error={error}>
        <input className="input" placeholder="e.g. Internal Harbor" value={data.name} onChange={(e) => set("name", e.target.value)}/>
      </Field>
      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:14}}>
        <Field label="URL" required>
          <input className="input" placeholder="harbor.example.com" value={data.url} onChange={(e) => set("url", e.target.value)} style={{fontFamily:"var(--font-mono)"}}/>
        </Field>
        <Field label="Type" required>
          <select className="input select" value={data.type} onChange={(e) => set("type", e.target.value)}>
            <option>Docker Hub</option>
            <option>GHCR</option>
            <option>ECR</option>
            <option>Harbor</option>
            <option>Quay</option>
            <option>GitLab</option>
          </select>
        </Field>
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <Field label="Username">
          <input className="input" value={data.user} onChange={(e) => set("user", e.target.value)}/>
        </Field>
        <Field label="Password / token">
          <input className="input" type="password" value={data.password} onChange={(e) => set("password", e.target.value)}/>
        </Field>
      </div>
    </Modal>
  );
}

Object.assign(window, {
  UserForm, ConfigForm, SecretForm, VolumeForm, NetworkForm,
  ServiceForm, StackForm, RegistryForm, PasswordChangeForm,
});

/* -------------- PASSWORD CHANGE FORM -------------- */
function PasswordChangeForm({ open, onClose, onChange }) {
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors]   = useState({});
  useEffect(() => { if (open) { setCurrent(""); setNext(""); setConfirm(""); setErrors({}); } }, [open]);

  const strength = (() => {
    if (!next) return null;
    let s = 0;
    if (next.length >= 8) s++;
    if (next.length >= 12) s++;
    if (/[A-Z]/.test(next) && /[a-z]/.test(next)) s++;
    if (/[0-9]/.test(next)) s++;
    if (/[^A-Za-z0-9]/.test(next)) s++;
    return s;
  })();
  const strengthLabel = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"][strength ?? 0];
  const strengthColor = ["var(--danger)", "var(--danger)", "var(--warning)", "var(--warning)", "var(--success)", "var(--success)"][strength ?? 0];

  const submit = () => {
    const e = {};
    if (!current)              e.current = "Enter your current password.";
    if (!next || next.length < 8) e.next = "Use at least 8 characters.";
    if (next !== confirm)      e.confirm = "Passwords do not match.";
    setErrors(e);
    if (Object.keys(e).length === 0) { onChange(); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose}
      title="Change password"
      subtitle="You will need to log in again on other devices."
      footer={
        <>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit}>Update password</button>
        </>
      }>
      <Field label="Current password" required error={errors.current}>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus/>
      </Field>
      <Field label="New password" required error={errors.next} hint="At least 8 characters. Mix cases, numbers and symbols for a stronger password.">
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)}/>
      </Field>
      {strength != null && next.length > 0 && (
        <div className="pw-strength">
          <div className="pw-strength__bar">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="pw-strength__seg" style={{
                background: i < strength ? strengthColor : "var(--surface-2)",
              }}/>
            ))}
          </div>
          <div className="pw-strength__label" style={{color: strengthColor}}>{strengthLabel}</div>
        </div>
      )}
      <Field label="Confirm new password" required error={errors.confirm}>
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}/>
      </Field>
    </Modal>
  );
}
