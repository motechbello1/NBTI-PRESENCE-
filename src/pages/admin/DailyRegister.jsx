import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, PageHead, StatusPill, Pill, Spinner, Notice } from "../../components/UI";
import { listStaff, listDepartments, reportRows, adminMarkAttendance, adminDeleteAttendance } from "../../lib/db";

const iso = (d) => d.toISOString().slice(0, 10);
const fmtTime = (t) => t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

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
    await adminDeleteAttendance(profile.id, recordId);
    setMessage({ tone: "clear", text: "Entry removed." });
    load();
  }

  return (
    <Shell>
      <PageHead eyebrow="Attendance register" title="Daily register" />

      <div className="flex flex-wrap gap-3 mb-5">
        <div>
          <label className="label">Date</label>
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="min-w-[220px]">
          <label className="label">Department</label>
          <select className="field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {message && <div className="mb-4"><Notice tone={message.tone}>{message.text}</Notice></div>}

      {loading ? <Spinner label="Loading the register" /> : (
        <div className="panel scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Staff</th><th>Department</th><th>In</th><th>Out</th>
                <th>Hours</th><th>Status</th><th>Note</th><th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const r = byUser[s.id];
                const isEditing = editing === s.id;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="text-[14px]">{s.full_name}</div>
                      <div className="mono text-[11px] text-muted">{s.staff_id || "—"}</div>
                    </td>
                    <td className="text-[13px] text-muted">{s.departments?.code || "—"}</td>
                    <td className="mono text-[13px]">{fmtTime(r?.sign_in_at)}</td>
                    <td className="mono text-[13px]">{fmtTime(r?.sign_out_at)}</td>
                    <td className="mono text-[13px]">{r?.hours_worked ? `${r.hours_worked}h` : "—"}</td>
                    <td className="whitespace-nowrap space-x-1.5">
                      <StatusPill status={r?.status} />
                      {r?.marked_by_admin && <Pill tone="mute">Manual</Pill>}
                    </td>
                    <td className="text-[13px] text-muted max-w-[200px]">
                      {r?.late_reason || r?.early_reason || "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      {isEditing ? (
                        <EditRow
                          record={r}
                          onCancel={() => setEditing(null)}
                          onSave={(patch) => save(s.id, patch)}
                        />
                      ) : (
                        <div className="flex gap-2 justify-end">
                          <button className="mono text-[11px] text-beam uppercase tracking-wider hover:underline"
                                  onClick={() => setEditing(s.id)}>
                            {r ? "Edit" : "Mark"}
                          </button>
                          {r && (
                            <button className="mono text-[11px] text-deny uppercase tracking-wider hover:underline"
                                    onClick={() => remove(r.id)}>Remove</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function EditRow({ record, onSave, onCancel }) {
  const [status, setStatus] = useState(record?.status || "present");
  const [inTime, setInTime] = useState(record?.sign_in_at ? new Date(record.sign_in_at).toTimeString().slice(0, 5) : "08:00");
  const [outTime, setOutTime] = useState(record?.sign_out_at ? new Date(record.sign_out_at).toTimeString().slice(0, 5) : "");
  const [note, setNote] = useState(record?.admin_note || "");

  function commit() {
    const day = record?.work_date || new Date().toISOString().slice(0, 10);
    const at = (t) => (t ? new Date(`${day}T${t}:00`).toISOString() : null);
    const patch = { status, sign_in_at: at(inTime), sign_out_at: at(outTime), admin_note: note };
    if (patch.sign_in_at && patch.sign_out_at) {
      patch.hours_worked = Number(((new Date(patch.sign_out_at) - new Date(patch.sign_in_at)) / 3600000).toFixed(2));
    }
    onSave(patch);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center justify-end min-w-[420px]">
      <select className="field !py-1.5 !text-[13px] w-28" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="present">Present</option>
        <option value="late">Late</option>
        <option value="absent">Absent</option>
        <option value="excused">Excused</option>
      </select>
      <input type="time" className="field !py-1.5 !text-[13px] w-24" value={inTime} onChange={(e) => setInTime(e.target.value)} />
      <input type="time" className="field !py-1.5 !text-[13px] w-24" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
      <input className="field !py-1.5 !text-[13px] w-36" placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="mono text-[11px] text-beam uppercase tracking-wider" onClick={commit}>Save</button>
      <button className="mono text-[11px] text-muted uppercase tracking-wider" onClick={onCancel}>Cancel</button>
    </div>
  );
}
