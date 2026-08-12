import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, Notice, Pill, Spinner } from "../../components/UI";
import {
  createDepartment, deleteDepartment, listDepartments, listStaff,
  saveSettings, updateDepartment, writeAudit,
} from "../../lib/db";
import { readPosition, formatDistance, metresBetween } from "../../lib/geo";

export default function Settings() {
  const { profile, settings, setSettings } = useAuth();
  const [section, setSection] = useState("instrument");
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const loadDirectory = () => {
    setDirectoryLoading(true);
    Promise.all([listDepartments(), listStaff()])
      .then(([departmentRows, staffRows]) => { setDepartments(departmentRows); setStaff(staffRows); })
      .catch((error) => setMessage({ tone: "deny", text: error.message }))
      .finally(() => setDirectoryLoading(false));
  };
  useEffect(loadDirectory, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (event) => {
    const value = event.target.type === "number" || event.target.type === "range" ? Number(event.target.value) : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function useMyPosition() {
    setReading(true); setMessage(null);
    try {
      const position = await readPosition();
      const moved = metresBetween(position.lat, position.lng, form.site_lat, form.site_lng);
      setForm((current) => ({ ...current, site_lat: position.lat, site_lng: position.lng }));
      setMessage({ tone: "clear", text: `Centre point set to where you are standing, accurate to ${Math.round(position.accuracy)}m. That is ${formatDistance(moved)} from the previous point. Save to apply it.` });
    } catch (error) { setMessage({ tone: "deny", text: error.message }); }
    finally { setReading(false); }
  }

  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const patch = {
        site_lat: form.site_lat, site_lng: form.site_lng,
        geofence_radius_m: form.geofence_radius_m, max_gps_accuracy_m: form.max_gps_accuracy_m,
        work_start: form.work_start, work_end: form.work_end,
        grace_minutes: form.grace_minutes, min_hours: form.min_hours,
        face_match_threshold: form.face_match_threshold, liveness_threshold: form.liveness_threshold,
      };
      const saved = await saveSettings(patch);
      setSettings(saved);
      await writeAudit(profile.id, "settings.update", "settings", patch);
      setMessage({ tone: "clear", text: "Settings saved and applied to the next attendance check." });
    } catch (error) { setMessage({ tone: "deny", text: error.message }); }
    finally { setBusy(false); }
  }

  const selected = departments.find((item) => item.id === selectedId) || null;

  return (
    <Shell>
      <section className="settings-command" aria-labelledby="settings-title">
        <header className="settings-command-head">
          <div><div className="mono settings-reference">SYSTEM REGISTER · CONTROL FILE S-01</div><div className="eyebrow">Root configuration authority</div><h1 id="settings-title" className="display">The rules beneath the register.</h1><p>Define where attendance is valid, when work is measured and how the Board’s department structure appears throughout the platform.</p></div>
          <aside><span className="mono">CHANGE CONTROL</span><strong>Every saved decision is logged.</strong><small className="mono">DEVELOPER SUPER ADMIN</small></aside>
        </header>

        <nav className="settings-tabs reports-no-print" aria-label="Settings sections">
          <button type="button" className={section === "instrument" ? "is-active" : ""} onClick={() => setSection("instrument")}><span className="mono">01</span><strong>Attendance instrument</strong><small>Perimeter, time and verification</small></button>
          <button type="button" className={section === "departments" ? "is-active" : ""} onClick={() => setSection("departments")}><span className="mono">02</span><strong>Department registry</strong><small>Names, codes, functions and status</small></button>
        </nav>

        {message ? <div className="settings-message"><Notice tone={message.tone}>{message.text}</Notice></div> : null}

        {section === "instrument" ? (
          <form onSubmit={save} className="settings-instrument">
            <section className="settings-sheet is-perimeter">
              <header><span className="mono">01 / SITE PERIMETER</span><h2 className="display">Where attendance is accepted</h2><p>Stand near the centre of the premises and use the device reading. Typed coordinates remain available for surveyed values.</p></header>
              <div className="settings-coordinate-grid">
                <label><span className="label">Latitude</span><input type="number" step="0.000001" className="field mono" value={form.site_lat} onChange={set("site_lat")} /></label>
                <label><span className="label">Longitude</span><input type="number" step="0.000001" className="field mono" value={form.site_lng} onChange={set("site_lng")} /></label>
                <button type="button" className="btn btn-ghost" onClick={useMyPosition} disabled={reading}>{reading ? "Reading position" : "Use where I am standing"}</button>
              </div>
              <div className="settings-rule-grid">
                <label><span className="label">Perimeter radius</span><div><input type="number" className="field mono" min="20" value={form.geofence_radius_m} onChange={set("geofence_radius_m")} /><b className="mono">METRES</b></div><small>Distance from the centre point that counts as inside the site.</small></label>
                <label><span className="label">Maximum GPS uncertainty</span><div><input type="number" className="field mono" min="5" value={form.max_gps_accuracy_m} onChange={set("max_gps_accuracy_m")} /><b className="mono">METRES</b></div><small>A less precise reading is refused instead of being trusted.</small></label>
              </div>
            </section>

            <section className="settings-sheet is-hours">
              <header><span className="mono">02 / OFFICIAL HOURS</span><h2 className="display">How the working day is measured</h2><p>These values label late arrivals and early departures. They do not change a completed verification result.</p></header>
              <div className="settings-hours-grid">
                <label><span className="label">Day starts</span><input type="time" className="field mono" value={form.work_start} onChange={set("work_start")} /></label>
                <label><span className="label">Grace period</span><div><input type="number" className="field mono" min="0" value={form.grace_minutes} onChange={set("grace_minutes")} /><b className="mono">MIN</b></div></label>
                <label><span className="label">Day ends</span><input type="time" className="field mono" value={form.work_end} onChange={set("work_end")} /></label>
                <label><span className="label">Minimum duration</span><div><input type="number" step="0.5" className="field mono" min="0" value={form.min_hours} onChange={set("min_hours")} /><b className="mono">HOURS</b></div></label>
              </div>
            </section>

            <section className="settings-sheet is-thresholds">
              <header><span className="mono">03 / VERIFICATION CONTROL</span><h2 className="display">Thresholds under change control</h2><p>These are security values, not presentation controls. Change them only after a documented test and record the reason in the audit process.</p></header>
              <div className="settings-threshold-warning"><i /><div><strong>A looser threshold is not a usability fix.</strong><p>Repeated rejection should first lead to better enrolment, lighting checks and investigation.</p></div></div>
              <div className="settings-threshold-grid">
                <label><span><b>Face match distance</b><strong className="mono">{Number(form.face_match_threshold).toFixed(2)}</strong></span><input type="range" min="0.35" max="0.62" step="0.01" value={form.face_match_threshold} onChange={set("face_match_threshold")} /><small className="mono"><i>STRICT</i><i>LENIENT</i></small></label>
                <label><span><b>Liveness completion</b><strong className="mono">{Number(form.liveness_threshold).toFixed(2)}</strong></span><input type="range" min="0.5" max="0.95" step="0.05" value={form.liveness_threshold} onChange={set("liveness_threshold")} /><small className="mono"><i>LENIENT</i><i>STRICT</i></small></label>
              </div>
            </section>
            <footer className="settings-save"><div><span className="mono">PENDING CONFIGURATION</span><strong>Applies to the next verification run</strong></div><button className="btn btn-primary" disabled={busy}>{busy ? "Writing configuration" : "Save instrument settings"}</button></footer>
          </form>
        ) : (
          <DepartmentRegistry
            departments={departments}
            staff={staff}
            loading={directoryLoading}
            selected={selected}
            creating={creating}
            busy={busy}
            profile={profile}
            onSelect={(id) => { setSelectedId(id); setCreating(false); }}
            onCreate={() => { setCreating(true); setSelectedId(null); }}
            onClose={() => { setCreating(false); setSelectedId(null); }}
            onBusy={setBusy}
            onMessage={setMessage}
            onChanged={loadDirectory}
          />
        )}
      </section>
    </Shell>
  );
}

function DepartmentRegistry({ departments, staff, loading, selected, creating, busy, profile, onSelect, onCreate, onClose, onBusy, onMessage, onChanged }) {
  const counts = useMemo(() => departments.reduce((result, department) => ({ ...result, [department.id]: staff.filter((person) => person.department_id === department.id).length }), {}), [departments, staff]);
  if (loading) return <div className="settings-directory-loading"><Spinner label="Reading department registry" /></div>;
  return <div className="department-registry">
    <header><div><span className="mono">BOARD STRUCTURE · LIVE DIRECTORY</span><h2 className="display">Departments and functions</h2><p>Names and codes appear on staff credentials, reports and the administration register. Deactivate a department to preserve history without offering it for new assignments.</p></div><button type="button" className="btn btn-primary" onClick={onCreate}>Add department</button></header>
    <div className="department-register"><div className="department-register-head mono"><span>CODE</span><span>DEPARTMENT</span><span>STAFF</span><span>STATUS</span><span /></div>{departments.map((department) => <button type="button" key={department.id} className={selected?.id === department.id ? "is-selected" : ""} onClick={() => onSelect(department.id)}><strong className="mono">{department.code || "—"}</strong><span><b>{department.name}</b><small>{department.description || "No department description has been recorded."}</small></span><strong className="mono">{counts[department.id]}</strong><span><Pill tone={department.is_active === false ? "deny" : "clear"}>{department.is_active === false ? "Inactive" : "Active"}</Pill></span><i aria-hidden="true">→</i></button>)}</div>
    {selected || creating ? <DepartmentEditor department={selected} staffCount={selected ? counts[selected.id] : 0} creating={creating} busy={busy} profile={profile} onClose={onClose} onBusy={onBusy} onMessage={onMessage} onChanged={onChanged} /> : null}
  </div>;
}

function DepartmentEditor({ department, staffCount, creating, busy, profile, onClose, onBusy, onMessage, onChanged }) {
  const [name, setName] = useState(department?.name || "");
  const [code, setCode] = useState(department?.code || "");
  const [description, setDescription] = useState(department?.description || "");
  const [functions, setFunctions] = useState((department?.functions || []).join("\n"));
  async function save(event) {
    event.preventDefault(); onBusy(true); onMessage(null);
    const payload = { name: name.trim(), code: code.trim().toUpperCase() || null, description: description.trim() || null, functions: functions.split("\n").map((item) => item.trim()).filter(Boolean) };
    try {
      const saved = creating ? await createDepartment(payload) : await updateDepartment(department.id, payload);
      await writeAudit(profile.id, creating ? "department.create" : "department.update", saved.id, payload);
      onMessage({ tone: "clear", text: creating ? `${saved.name} was added to the Board registry.` : `${saved.name} was updated.` });
      onClose(); onChanged();
    } catch (error) { onMessage({ tone: "deny", text: error.message }); }
    finally { onBusy(false); }
  }
  async function toggle() {
    onBusy(true);
    try {
      const saved = await updateDepartment(department.id, { is_active: department.is_active === false });
      await writeAudit(profile.id, "department.status", department.id, { is_active: saved.is_active });
      onMessage({ tone: "clear", text: `${department.name} is now ${saved.is_active ? "active" : "inactive"}.` }); onClose(); onChanged();
    } catch (error) { onMessage({ tone: "deny", text: error.message }); }
    finally { onBusy(false); }
  }
  async function remove() {
    if (staffCount || !window.confirm(`Permanently remove ${department.name}? This cannot be recovered from the application.`)) return;
    onBusy(true);
    try { await deleteDepartment(department.id); await writeAudit(profile.id, "department.delete", department.id, { name: department.name }); onMessage({ tone: "clear", text: `${department.name} was permanently removed.` }); onClose(); onChanged(); }
    catch (error) { onMessage({ tone: "deny", text: error.message }); }
    finally { onBusy(false); }
  }
  return <section className="department-editor" aria-labelledby="department-editor-title"><header><div><span className="eyebrow">{creating ? "New structural record" : "Selected department"}</span><h2 id="department-editor-title" className="display">{creating ? "Add a department" : department.name}</h2><small className="mono">{creating ? "CODE AND FUNCTIONS REQUIRED" : `${staffCount} STAFF CURRENTLY ASSIGNED`}</small></div><button type="button" onClick={onClose} aria-label="Close department editor">×</button></header><form onSubmit={save}><div className="department-editor-grid"><label><span className="label">Official name</span><input className="field" required value={name} onChange={(event) => setName(event.target.value)} /></label><label><span className="label">Register code</span><input className="field mono" maxLength="10" value={code} onChange={(event) => setCode(event.target.value)} /></label><label className="is-wide"><span className="label">What this department is responsible for</span><textarea className="field" rows="3" value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="is-wide"><span className="label">Functions, one per line</span><textarea className="field" rows="6" value={functions} onChange={(event) => setFunctions(event.target.value)} placeholder="Coordinate ICT infrastructure\nSupport institutional data systems" /></label></div><div className="department-editor-actions"><button className="btn btn-primary" disabled={busy}>{busy ? "Writing record" : creating ? "Add department" : "Save department"}</button>{!creating ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={toggle}>{department.is_active === false ? "Reactivate department" : "Deactivate department"}</button> : null}{!creating ? <button type="button" className="btn btn-danger" disabled={busy || staffCount > 0} onClick={remove}>Delete empty department</button> : null}</div>{!creating && staffCount > 0 ? <p className="department-delete-note">Permanent deletion is disabled while staff are assigned. Move those records first, or deactivate this department to preserve history.</p> : null}</form></section>;
}
