import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, StatusPill, Pill, Spinner, Notice } from "../../components/UI";
import { listStaff, listDepartments, reportRows, adminMarkAttendance, adminDeleteAttendance } from "../../lib/db";

const iso = (d) => d.toISOString().slice(0, 10);
const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

/**
 * The daily register.
 * An administrator can mark someone present who was on official duty, correct
 * a wrong entry, or remove one entirely. Every one of those actions is written
 * to the audit log with the administrator's name against it.
 */
export default function DailyRegister() {
  const { profile } = useAuth();
  const [date, setDate] = useState(iso(new Date()));
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    const [s, r] = await Promise.all([
      listStaff({ departmentId: departmentId || null }),
      reportRows({ from: date, to: date, departmentId: departmentId || null }),
    ]);
    setStaff(s.filter((x) => x.is_active));
    setRecords(r);
    setLoading(false);
  };

  useEffect(() => { listDepartments().then(setDepartments); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date, departmentId]);

  const byUser = useMemo(() => Object.fromEntries(records.map((r) => [r.user_id, r])), [records]);
  const counts = useMemo(() => ({
    recorded: records.filter((r) => r.sign_in_at).length,
    excused: records.filter((r) => r.status === "excused").length,
    late: records.filter((r) => r.status === "late").length,
    missing: Math.max(0, staff.length - new Set(records.map((r) => r.user_id)).size),
  }), [records, staff.length]);
  const editingStaff = staff.find((person) => person.id === editing);

  async function save(userId, patch) {
    try {
      await adminMarkAttendance(profile.id, userId, date, patch);
      setMessage({ tone: "clear", text: "Register updated." });
      setEditing(null);
      load();
    } catch (e) {
      setMessage({ tone: "deny", text: e.message });
    }
  }

  async function remove(recordId) {
    if (!confirm("Remove this entry from the register? This cannot be undone.")) return;
    try {
      await adminDeleteAttendance(profile.id, recordId);
      setMessage({ tone: "clear", text: "Entry removed." });
      setEditing(null);
      load();
    } catch (e) {
      setMessage({ tone: "deny", text: e.message });
    }
  }

  return (
    <Shell>
      <section className="daily-register-page" aria-labelledby="daily-register-title">
        <header className="daily-register-head">
          <div className="daily-register-head-copy">
            <div className="eyebrow">Personnel evidence · sector 02</div>
            <h1 id="daily-register-title" className="display">Board attendance register</h1>
            <p>Review every staff position for the selected working day. Manual changes remain attributed to the administrator who made them.</p>
          </div>
          <div className="daily-register-date-stamp">
            <span className="mono">ACTIVE REGISTER</span>
            <strong>{fmtDate(date)}</strong>
            <small className="mono">{departmentId ? "DEPARTMENT FILTERED" : "BOARD-WIDE VIEW"}</small>
          </div>
        </header>

        <dl className="daily-register-summary" aria-label="Register summary">
          <RegisterMeasure index="01" label="Active staff" value={staff.length} />
          <RegisterMeasure index="02" label="Recorded in" value={counts.recorded} tone="clear" />
          <RegisterMeasure index="03" label="Late arrivals" value={counts.late} tone="hold" />
          <RegisterMeasure index="04" label="Approved away" value={counts.excused} />
          <RegisterMeasure index="05" label="No record" value={counts.missing} tone={counts.missing ? "deny" : "clear"} />
        </dl>

        <div className="daily-register-filters" aria-label="Register filters">
          <div>
            <label className="label" htmlFor="register-date">Working date</label>
            <input id="register-date" type="date" className="field mono" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="register-department">Department sector</label>
            <select id="register-department" className="field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="daily-register-filter-status mono" aria-live="polite">
            <i aria-hidden="true" />
            {loading ? "SYNCING REGISTER" : `${staff.length} PERSONNEL LOADED`}
          </div>
        </div>

        {message && <div className="daily-register-notice"><Notice tone={message.tone}>{message.text}</Notice></div>}

        {loading ? <div className="daily-register-loading"><Spinner label="Loading the register" /></div> : (
          <div className="daily-register-ledger">
            <div className="daily-register-ledger-head">
              <div><span className="mono">LIVE PERSONNEL LEDGER</span><strong>Position by staff member</strong></div>
              <span className="mono">{iso(new Date()) === date ? "TODAY" : date} · {staff.length} ROWS</span>
            </div>

            {staff.length ? (
              <table className="daily-register-table">
                <thead>
                  <tr>
                    <th scope="col">Staff member</th><th scope="col">Department</th><th scope="col">In</th><th scope="col">Out</th>
                    <th scope="col">Hours</th><th scope="col">Position</th><th scope="col">Administrative note</th><th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s, index) => {
                    const r = byUser[s.id];
                    return (
                      <tr key={s.id} data-position={r?.status || "unrecorded"} className={editing === s.id ? "is-selected" : undefined}>
                        <td data-label="Staff member">
                          <div className="daily-register-person"><span className="mono">{String(index + 1).padStart(2, "0")}</span><div><strong>{s.full_name}</strong><small className="mono">{s.staff_id || "NO STAFF ID"}</small></div></div>
                        </td>
                        <td data-label="Department"><span className="daily-register-department">{s.departments?.code || "—"}</span></td>
                        <td data-label="In" className="mono daily-register-reading">{fmtTime(r?.sign_in_at)}</td>
                        <td data-label="Out" className="mono daily-register-reading">{fmtTime(r?.sign_out_at)}</td>
                        <td data-label="Hours" className="mono daily-register-reading">{r?.hours_worked ? `${r.hours_worked}h` : "—"}</td>
                        <td data-label="Position" className="daily-register-position">
                          <StatusPill status={r?.status} />
                          {r?.marked_by_admin && <Pill tone="mute">Manual</Pill>}
                        </td>
                        <td data-label="Administrative note" className="daily-register-note">{r?.admin_note || r?.late_reason || r?.early_reason || "No note"}</td>
                        <td data-label="Actions">
                          <div className="daily-register-actions">
                            <button type="button" className="register-row-action mono" onClick={() => setEditing(s.id)} aria-label={`${r ? "Edit" : "Mark"} attendance for ${s.full_name}`}>
                              {r ? "EDIT" : "MARK"}<span aria-hidden="true">→</span>
                            </button>
                            {r && <button type="button" className="register-row-action is-danger mono" onClick={() => remove(r.id)} aria-label={`Remove attendance entry for ${s.full_name}`}>REMOVE</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <div className="daily-register-empty"><strong>No active staff in this sector.</strong><span>Choose another department to continue.</span></div>}
          </div>
        )}

        {editingStaff ? (
          <section className="daily-register-editor" aria-labelledby="register-editor-title">
            <header>
              <div>
                <span className="eyebrow">Record override · administrator attributed</span>
                <h2 id="register-editor-title" className="display">{editingStaff.full_name}</h2>
                <small className="mono">{editingStaff.staff_id || "NO STAFF ID"} · {fmtDate(date).toUpperCase()}</small>
              </div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close record editor">×</button>
            </header>
            <EditRow
              record={byUser[editingStaff.id]}
              workDate={date}
              onCancel={() => setEditing(null)}
              onSave={(patch) => save(editingStaff.id, patch)}
            />
            <div className="daily-register-editor-foot mono"><i /> EVERY OVERRIDE IS WRITTEN TO THE AUDIT LOG</div>
          </section>
        ) : null}
      </section>
    </Shell>
  );
}

function RegisterMeasure({ index, label, value, tone }) {
  return <div className={tone ? `is-${tone}` : undefined}><span className="mono">NODE {index}</span><dt className="mono">{label}</dt><dd className="mono">{value}</dd></div>;
}

function EditRow({ record, workDate, onSave, onCancel }) {
  const [status, setStatus] = useState(record?.status || "present");
  const [inTime, setInTime] = useState(record?.sign_in_at ? new Date(record.sign_in_at).toTimeString().slice(0, 5) : "08:00");
  const [outTime, setOutTime] = useState(record?.sign_out_at ? new Date(record.sign_out_at).toTimeString().slice(0, 5) : "");
  const [note, setNote] = useState(record?.admin_note || "");

  function commit() {
    const day = record?.work_date || workDate;
    const at = (t) => (t ? new Date(`${day}T${t}:00`).toISOString() : null);
    const patch = { status, sign_in_at: at(inTime), sign_out_at: at(outTime), admin_note: note };
    if (patch.sign_in_at && patch.sign_out_at) {
      patch.hours_worked = Number(((new Date(patch.sign_out_at) - new Date(patch.sign_in_at)) / 3600000).toFixed(2));
    }
    onSave(patch);
  }

  return (
    <form className="daily-register-edit-form" onSubmit={(event) => { event.preventDefault(); commit(); }}>
      <div className="daily-register-edit-grid">
        <div>
          <label className="label" htmlFor="record-status">Attendance position</label>
          <select id="record-status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="excused">Approved away</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="record-in-time">Arrival time</label>
          <input id="record-in-time" type="time" className="field mono" value={inTime} onChange={(e) => setInTime(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="record-out-time">Departure time</label>
          <input id="record-out-time" type="time" className="field mono" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
        </div>
        <div className="daily-register-reason">
          <label className="label" htmlFor="record-note">Administrative reason</label>
          <input id="record-note" className="field" placeholder="State why this change is required" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="daily-register-edit-actions">
        <button type="submit" className="btn btn-primary">Save to register</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
