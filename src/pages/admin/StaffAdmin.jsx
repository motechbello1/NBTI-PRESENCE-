import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, PageHead, Pill, Spinner, Notice } from "../../components/UI";
import { listStaff, listDepartments, updateProfile, clearEnrolment, writeAudit } from "../../lib/db";

export default function StaffAdmin() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const load = () => {
    setLoading(true);
    listStaff({ departmentId: departmentId || null, search })
      .then(setStaff).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { listDepartments().then(setDepartments); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [search, departmentId]);

  async function patch(id, changes, label) {
    await updateProfile(id, changes);
    await writeAudit(profile.id, `staff.${label}`, id, changes);
    setMessage(`${label} updated.`);
    load();
  }

  async function resetFace(id, name) {
    if (!confirm(`Clear the stored face for ${name}? They will have to enrol again before their next sign in.`)) return;
    await clearEnrolment(id);
    await writeAudit(profile.id, "staff.face_reset", id, {});
    setMessage(`Face enrolment cleared for ${name}.`);
    load();
  }

  return (
    <Shell>
      <PageHead eyebrow={`${staff.length} records`} title="Staff" />

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search</label>
          <input className="field" placeholder="Name or staff number"
                 value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="min-w-[220px]">
          <label className="label">Department</label>
          <select className="field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {message && <div className="mb-4"><Notice tone="clear">{message}</Notice></div>}

      {loading ? <Spinner label="Loading staff" /> : (
        <div className="panel scroll-x">
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Staff no.</th><th>Department</th><th>Grade</th>
                  <th>Face</th><th>Role</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="text-[14px]">{s.full_name}</div>
                    <div className="mono text-[11px] text-muted">{s.email}</div>
                  </td>
                  <td className="mono text-[13px]">{s.staff_id || "—"}</td>
                  <td className="text-[13px] text-muted">{s.departments?.name || "Unassigned"}</td>
                  <td className="mono text-[13px]">{s.grade_level || "—"}</td>
                  <td><Pill tone={s.face_enrolled ? "clear" : "hold"}>{s.face_enrolled ? "Enrolled" : "None"}</Pill></td>
                  <td>
                    <select className="field !py-1 !text-[12px] w-28" value={s.role}
                            onChange={(e) => patch(s.id, { role: e.target.value }, "role")}>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className={`pill ${s.is_active ? "pill-clear" : "pill-deny"}`}
                      onClick={() => patch(s.id, { is_active: !s.is_active }, "status")}
                    >
                      {s.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {s.face_enrolled && (
                      <button className="mono text-[11px] text-deny uppercase tracking-wider hover:underline"
                              onClick={() => resetFace(s.id, s.full_name)}>
                        Reset face
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
