import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, AuthorityBadge, Pill, Spinner, Notice } from "../../components/UI";
import { authorityBadgeFor, gradeLevelNumber, isSuperAdmin } from "../../lib/authority";
import { listStaff, listDepartments, updateProfile, clearEnrolment, writeAudit } from "../../lib/db";

const gradeOptions = Array.from({ length: 17 }, (_, index) => `GL ${String(index + 1).padStart(2, "0")}`);

export default function StaffAdmin() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    listStaff({ departmentId: departmentId || null, search })
      .then(setStaff)
      .catch((error) => setMessage({ tone: "deny", text: error.message }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { listDepartments().then(setDepartments).catch((error) => setMessage({ tone: "deny", text: error.message })); }, []);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); /* eslint-disable-next-line */ }, [search, departmentId]);

  const selected = staff.find((person) => person.id === selectedId) || null;
  const counts = useMemo(() => ({
    active: staff.filter((person) => person.is_active).length,
    senior: staff.filter((person) => (gradeLevelNumber(person.grade_level) || 0) >= 7).length,
    unenrolled: staff.filter((person) => !person.face_enrolled).length,
    departments: new Set(staff.map((person) => person.departments?.id).filter(Boolean)).size,
  }), [staff]);

  async function patch(id, changes, label) {
    setSaving(true);
    try {
      await updateProfile(id, changes);
      await writeAudit(profile.id, `staff.${label}`, id, changes);
      setMessage({ tone: "clear", text: `${label} updated.` });
      load();
    } catch (error) {
      setMessage({ tone: "deny", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function resetFace(id, name) {
    if (!confirm(`Clear the stored face for ${name}? They will have to enrol again before their next sign in.`)) return;
    setSaving(true);
    try {
      await clearEnrolment(id);
      await writeAudit(profile.id, "staff.face_reset", id, {});
      setMessage({ tone: "clear", text: `Face enrolment cleared for ${name}.` });
      setSelectedId(null);
      load();
    } catch (error) {
      setMessage({ tone: "deny", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <section className="staff-command-page" aria-labelledby="staff-command-title">
        <header className="staff-command-head">
          <div>
            <div className="eyebrow">People and authority · sector 02</div>
            <h1 id="staff-command-title" className="display">Personnel command</h1>
            <p>Find a staff member, review their standing and open one focused record to change access, department, grade or face enrolment.</p>
          </div>
          <aside className="staff-command-clearance">
            <span className="mono">CONTROL SCOPE</span>
            <strong>Board-wide personnel</strong>
            <small className="mono">{isSuperAdmin(profile) ? "OMEGA AUTHORITY" : "ADMINISTRATOR"}</small>
          </aside>
        </header>

        <dl className="staff-command-summary" aria-label="Personnel summary">
          <StaffMeasure index="01" label="Records shown" value={staff.length} />
          <StaffMeasure index="02" label="Active staff" value={counts.active} tone="clear" />
          <StaffMeasure index="03" label="Senior staff" value={counts.senior} />
          <StaffMeasure index="04" label="No face record" value={counts.unenrolled} tone={counts.unenrolled ? "hold" : "clear"} />
          <StaffMeasure index="05" label="Departments" value={counts.departments} />
        </dl>

        <div className="staff-command-tools">
          <div className="staff-search-field">
            <label className="label" htmlFor="staff-search">Find personnel</label>
            <div>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg>
              <input id="staff-search" className="field" placeholder="Name, email or staff number" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="staff-department-filter">Department sector</label>
            <select id="staff-department-filter" className="field" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">All departments</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </div>
          <div className="staff-command-sync mono" aria-live="polite"><i />{loading ? "SYNCING DIRECTORY" : `${staff.length} RECORDS READY`}</div>
        </div>

        {message ? <div className="staff-command-notice"><Notice tone={message.tone}>{message.text}</Notice></div> : null}

        {loading ? <div className="staff-command-loading"><Spinner label="Loading personnel" /></div> : (
          <div className="staff-command-directory">
            <div className="staff-command-directory-head">
              <div><span className="mono">PERSONNEL DIRECTORY</span><strong>Authority and readiness</strong></div>
              <span className="mono">SELECT A RECORD TO MANAGE</span>
            </div>
            {staff.length ? (
              <div className="staff-command-list">
                {staff.map((person, index) => {
                  const badge = authorityBadgeFor(person);
                  return (
                    <button key={person.id} type="button" className={`staff-command-row${selectedId === person.id ? " is-selected" : ""}`} onClick={() => setSelectedId(person.id)} aria-pressed={selectedId === person.id}>
                      <span className="staff-command-index mono">{String(index + 1).padStart(2, "0")}</span>
                      <span className="staff-command-person">
                        <strong>{person.full_name}<AuthorityBadge badge={badge} compact /></strong>
                        <small className="mono">{person.staff_id || "NO STAFF ID"} · {person.email || "NO EMAIL"}</small>
                      </span>
                      <span className="staff-command-department"><small className="mono">DEPARTMENT</small><strong>{person.departments?.code || "UNASSIGNED"}</strong></span>
                      <span className="staff-command-grade"><small className="mono">GRADE</small><strong className="mono">{person.grade_level || "—"}</strong></span>
                      <span className="staff-command-tags">
                        <Pill tone={person.face_enrolled ? "clear" : "hold"}>{person.face_enrolled ? "Face ready" : "No face"}</Pill>
                        <Pill tone={person.is_active ? "clear" : "deny"}>{person.is_active ? "Active" : "Inactive"}</Pill>
                      </span>
                      <span className="staff-command-open mono">MANAGE <i aria-hidden="true">→</i></span>
                    </button>
                  );
                })}
              </div>
            ) : <div className="staff-command-empty"><strong>No personnel match this search.</strong><span>Clear the search or choose another department.</span></div>}
          </div>
        )}

        {selected ? (
          <PersonnelEditor
            key={selected.id}
            person={selected}
            departments={departments}
            saving={saving}
            currentUserId={profile.id}
            onClose={() => setSelectedId(null)}
            onPatch={patch}
            onResetFace={resetFace}
          />
        ) : null}
      </section>
    </Shell>
  );
}

function StaffMeasure({ index, label, value, tone }) {
  return <div className={tone ? `is-${tone}` : undefined}><span className="mono">NODE {index}</span><dt className="mono">{label}</dt><dd className="mono">{value}</dd></div>;
}

function PersonnelEditor({ person, departments, saving, currentUserId, onClose, onPatch, onResetFace }) {
  const [fullName, setFullName] = useState(person.full_name || "");
  const [staffId, setStaffId] = useState(person.staff_id || "");
  const [email, setEmail] = useState(person.email || "");
  const [phone, setPhone] = useState(person.phone || "");
  const [department, setDepartment] = useState(person.departments?.id || "");
  const [grade, setGrade] = useState(person.grade_level || "");
  const [role, setRole] = useState(person.role || "staff");
  const self = person.id === currentUserId;
  const badge = authorityBadgeFor(person);

  function saveIdentity(event) {
    event.preventDefault();
    onPatch(person.id, { full_name: fullName.trim(), staff_id: staffId.trim() || null, email: email.trim() || null, phone: phone.trim() || null }, "identity");
  }

  function saveStanding(event) {
    event.preventDefault();
    onPatch(person.id, { department_id: department || null, grade_level: grade || null, role }, "standing");
  }

  return (
    <section className="personnel-editor" aria-labelledby="personnel-editor-title">
      <header>
        <div className="personnel-editor-identity">
          <span className="eyebrow">Selected personnel record</span>
          <h2 id="personnel-editor-title" className="display">{person.full_name}<AuthorityBadge badge={badge} compact /></h2>
          <small className="mono">{person.staff_id || "NO STAFF ID"} · {person.email || "NO EMAIL"}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close personnel editor">×</button>
      </header>

      <div className="personnel-editor-body">
        <div className="personnel-editor-forms">
          <form onSubmit={saveIdentity}>
            <div className="personnel-editor-section-head"><span className="mono">01</span><div><strong>Identity details</strong><small>Name and staff directory information</small></div></div>
            <div className="personnel-identity-grid">
              <div>
                <label className="label" htmlFor="personnel-name">Full name</label>
                <input id="personnel-name" className="field" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="personnel-staff-id">Staff number</label>
                <input id="personnel-staff-id" className="field mono" value={staffId} onChange={(event) => setStaffId(event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="personnel-email">Directory email</label>
                <input id="personnel-email" type="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} />
                <small className="personnel-field-help">Directory only. This does not change the person’s sign-in email.</small>
              </div>
              <div>
                <label className="label" htmlFor="personnel-phone">Phone</label>
                <input id="personnel-phone" type="tel" className="field mono" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
            </div>
            <div className="personnel-editor-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>Save identity</button>
              <span className="mono">DIRECTORY RECORD</span>
            </div>
          </form>

          <form onSubmit={saveStanding}>
            <div className="personnel-editor-section-head"><span className="mono">02</span><div><strong>Organisational standing</strong><small>Department, grade and system access</small></div></div>
            <div className="personnel-editor-grid">
              <div>
                <label className="label" htmlFor="personnel-department">Department</label>
                <select id="personnel-department" className="field" value={department} onChange={(event) => setDepartment(event.target.value)}>
                  <option value="">Unassigned</option>
                  {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="personnel-grade">Grade level</label>
                <select id="personnel-grade" className="field mono" value={grade} onChange={(event) => setGrade(event.target.value)}>
                  <option value="">Not recorded</option>
                  {gradeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="personnel-role">System access</label>
                <select id="personnel-role" className="field" value={role} onChange={(event) => setRole(event.target.value)} disabled={self}>
                  <option value="staff">Staff account</option>
                  <option value="admin">Full administrator</option>
                </select>
                <small className="personnel-field-help">{self ? "Your own root access cannot be removed here." : "Full administrator can read and manage every Board record."}</small>
              </div>
            </div>
            <div className="personnel-editor-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>Save standing</button>
              <span className="mono">CHANGES ARE AUDITED</span>
            </div>
          </form>
        </div>

        <aside className="personnel-control-panel">
          <div className="personnel-editor-section-head"><span className="mono">03</span><div><strong>Account controls</strong><small>Readiness and availability</small></div></div>
          <dl>
            <div><dt>Account status</dt><dd><Pill tone={person.is_active ? "clear" : "deny"}>{person.is_active ? "Active" : "Inactive"}</Pill></dd></div>
            <div><dt>Face record</dt><dd><Pill tone={person.face_enrolled ? "clear" : "hold"}>{person.face_enrolled ? "Enrolled" : "Not enrolled"}</Pill></dd></div>
            <div><dt>Authority check</dt><dd>{badge ? <AuthorityBadge badge={badge} /> : <span className="mono personnel-none">STANDARD STAFF</span>}</dd></div>
          </dl>
          <div className="personnel-control-actions">
            <button type="button" className="btn btn-ghost" disabled={saving || self} onClick={() => onPatch(person.id, { is_active: !person.is_active }, "status")}>{person.is_active ? "Deactivate account" : "Reactivate account"}</button>
            {person.face_enrolled ? <button type="button" className="btn btn-danger" disabled={saving} onClick={() => onResetFace(person.id, person.full_name)}>Clear face enrolment</button> : null}
          </div>
          {self ? <p>Your own developer super-admin account is protected from accidental deactivation.</p> : null}
        </aside>
      </div>
      <footer className="mono"><i />HOD, DIRECTOR AND DEPARTMENT FUNCTION CONTROLS AWAIT THE SECURITY MIGRATION · ISSUE 01</footer>
    </section>
  );
}
