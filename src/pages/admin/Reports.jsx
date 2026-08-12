import { useEffect, useMemo, useState } from "react";
import { Shell, PageHead, Stat, Spinner, Empty, Pill } from "../../components/UI";
import { listDepartments, listStaff, reportRows } from "../../lib/db";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, RadialBarChart, RadialBar,
} from "recharts";

const iso = (d) => d.toISOString().slice(0, 10);
const CHART_BG = { background: "#17222E", border: "1px solid #22303F", borderRadius: 3, fontSize: 12 };

/* Working days between two dates, Monday to Friday. Public holidays are not
   modelled, so an administrator reading a rate should treat it as an upper
   bound on the number of expected days. */
function workingDays(from, to) {
  let n = 0;
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

export default function Reports() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [scope, setScope] = useState("board");     // board | department | individual
  const [departmentId, setDepartmentId] = useState("");
  const [userId, setUserId] = useState("");

  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listDepartments(), listStaff()]).then(([d, s]) => {
      setDepartments(d);
      setStaff(s.filter((x) => x.is_active));
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    reportRows({
      from, to,
      departmentId: scope === "department" && departmentId ? departmentId : null,
      userId: scope === "individual" && userId ? userId : null,
    })
      .then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [from, to, scope, departmentId, userId]);

  const cohort = useMemo(() => {
    if (scope === "individual" && userId) return staff.filter((s) => s.id === userId);
    if (scope === "department" && departmentId) return staff.filter((s) => s.department_id === departmentId);
    return staff;
  }, [scope, departmentId, userId, staff]);

  const expectedDays = workingDays(from, to);
  const expectedTotal = expectedDays * cohort.length;

  /* ── HEADLINE NUMBERS ─────────────────────────────── */
  const summary = useMemo(() => {
    const present = rows.filter((r) => r.status === "present").length;
    const late = rows.filter((r) => r.status === "late").length;
    const excused = rows.filter((r) => r.status === "excused").length;
    const attended = present + late;
    const hours = rows.reduce((a, r) => a + (r.hours_worked || 0), 0);
    const early = rows.filter((r) => r.early_departure).length;
    const noSignOut = rows.filter((r) => r.sign_in_at && !r.sign_out_at).length;
    const manual = rows.filter((r) => r.marked_by_admin).length;

    return {
      present, late, excused, attended, early, noSignOut, manual,
      absent: Math.max(0, expectedTotal - attended - excused),
      hours: hours.toFixed(1),
      avgHours: attended ? (hours / attended).toFixed(2) : "0.00",
      rate: expectedTotal ? Math.round((attended / expectedTotal) * 100) : 0,
      punctuality: attended ? Math.round((present / attended) * 100) : 0,
    };
  }, [rows, expectedTotal]);

  /* ── DAILY TREND ──────────────────────────────────── */
  const daily = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      map[r.work_date] ||= { day: r.work_date, onTime: 0, late: 0, hours: 0 };
      if (r.status === "late") map[r.work_date].late++;
      else if (r.sign_in_at) map[r.work_date].onTime++;
      map[r.work_date].hours += r.hours_worked || 0;
    });
    return Object.values(map)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        ...d,
        hours: Number(d.hours.toFixed(1)),
        label: new Date(d.day).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      }));
  }, [rows]);

  /* ── ARRIVAL TIME DISTRIBUTION ────────────────────── */
  const arrivals = useMemo(() => {
    const buckets = {};
    rows.filter((r) => r.sign_in_at).forEach((r) => {
      const h = new Date(r.sign_in_at).getHours();
      const key = `${String(h).padStart(2, "0")}:00`;
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return Object.entries(buckets).sort().map(([hour, count]) => ({ hour, count }));
  }, [rows]);

  /* ── DEPARTMENT COMPARISON ────────────────────────── */
  const byDepartment = useMemo(() => {
    const map = {};
    staff.forEach((s) => {
      const name = s.departments?.code || s.departments?.name || "Unassigned";
      map[name] ||= { name, headcount: 0, attended: 0, late: 0, hours: 0 };
      map[name].headcount++;
    });
    rows.forEach((r) => {
      const name = r.department_code || r.department || "Unassigned";
      map[name] ||= { name, headcount: 0, attended: 0, late: 0, hours: 0 };
      if (r.sign_in_at) map[name].attended++;
      if (r.status === "late") map[name].late++;
      map[name].hours += r.hours_worked || 0;
    });
    return Object.values(map)
      .map((d) => ({
        ...d,
        hours: Number(d.hours.toFixed(1)),
        rate: d.headcount * expectedDays ? Math.round((d.attended / (d.headcount * expectedDays)) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [rows, staff, expectedDays]);

  /* ── PER-PERSON TABLE ─────────────────────────────── */
  const perPerson = useMemo(() => {
    const map = {};
    cohort.forEach((s) => {
      map[s.id] = {
        id: s.id, name: s.full_name, staffId: s.staff_id,
        department: s.departments?.code || "—",
        attended: 0, late: 0, early: 0, hours: 0,
      };
    });
    rows.forEach((r) => {
      const p = map[r.user_id];
      if (!p) return;
      if (r.sign_in_at) p.attended++;
      if (r.status === "late") p.late++;
      if (r.early_departure) p.early++;
      p.hours += r.hours_worked || 0;
    });
    return Object.values(map)
      .map((p) => ({
        ...p,
        hours: Number(p.hours.toFixed(1)),
        rate: expectedDays ? Math.round((p.attended / expectedDays) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [rows, cohort, expectedDays]);

  function exportCsv() {
    const head = ["Name", "Staff number", "Department", "Days attended", "Expected days", "Attendance rate %", "Late", "Early departures", "Total hours"];
    const body = perPerson.map((p) =>
      [p.name, p.staffId || "", p.department, p.attended, expectedDays, p.rate, p.late, p.early, p.hours]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const csv = [head.join(","), ...body].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nbti-attendance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const scopeName =
    scope === "board" ? "the Board as a whole"
    : scope === "department" ? (departments.find((d) => d.id === departmentId)?.name || "a department")
    : (staff.find((s) => s.id === userId)?.full_name || "one member of staff");

  return (
    <Shell>
      <PageHead eyebrow="Attendance analysis" title="Reports">
        <button className="btn btn-ghost" onClick={exportCsv} disabled={!perPerson.length}>
          Export CSV
        </button>
      </PageHead>

      {/* ── CONTROLS ──────────────────────────────────── */}
      <div className="panel p-4 mb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="label">From</label>
          <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Scope</label>
          <select className="field" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="board">Whole Board</option>
            <option value="department">One department</option>
            <option value="individual">One person</option>
          </select>
        </div>
        <div>
          {scope === "department" && (
            <>
              <label className="label">Department</label>
              <select className="field" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Choose a department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </>
          )}
          {scope === "individual" && (
            <>
              <label className="label">Member of staff</label>
              <select className="field" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Choose a person</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {loading ? <Spinner label="Building the report" /> : (
        <>
          {/* ── NARRATIVE ─────────────────────────────── */}
          <div className="panel p-5 mb-6 border-l-2 border-l-beam">
            <div className="eyebrow mb-3">What this report says</div>
            <p className="text-[15px] leading-relaxed">
              Across {expectedDays} working days covering {scopeName}, {cohort.length}{" "}
              {cohort.length === 1 ? "member of staff was" : "members of staff were"} expected
              on site, giving {expectedTotal.toLocaleString()} expected attendance days.
              {" "}<strong className="text-beam">{summary.attended.toLocaleString()}</strong> were
              recorded, an attendance rate of{" "}
              <strong className={summary.rate >= 85 ? "text-beam" : summary.rate >= 65 ? "text-hold" : "text-deny"}>
                {summary.rate}%
              </strong>.
              {" "}Of those who came in, {summary.punctuality}% arrived within the grace period
              and {summary.late} arrived late. Staff logged {summary.hours} hours in total,
              averaging {summary.avgHours} hours per attended day.
              {summary.early > 0 && ` ${summary.early} departures were before the end of the working day.`}
              {summary.noSignOut > 0 && ` ${summary.noSignOut} days were signed in but never signed out, so those hours are not counted.`}
              {summary.manual > 0 && ` ${summary.manual} entries were placed on the register manually by an administrator rather than through a face check.`}
            </p>
          </div>

          {/* ── HEADLINE NUMBERS ──────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
            <Stat label="Attendance rate" value={`${summary.rate}%`}
                  tone={summary.rate >= 85 ? "clear" : summary.rate >= 65 ? "hold" : "deny"}
                  sub={`${summary.attended} of ${expectedTotal}`} />
            <Stat label="Punctuality" value={`${summary.punctuality}%`}
                  tone={summary.punctuality >= 85 ? "clear" : "hold"} sub="arrived within grace" />
            <Stat label="Late arrivals" value={summary.late} tone={summary.late ? "hold" : "paper"} />
            <Stat label="Absences" value={summary.absent} tone={summary.absent ? "deny" : "clear"} />
            <Stat label="Total hours" value={summary.hours} sub={`avg ${summary.avgHours}/day`} />
            <Stat label="Early exits" value={summary.early} tone={summary.early ? "hold" : "paper"} />
          </div>

          {rows.length === 0 ? (
            <Empty title="No attendance in this range">
              Widen the dates, or check that staff in this scope have enrolled their faces.
            </Empty>
          ) : (
            <div className="space-y-6">
              {/* ── DAILY TREND ─────────────────────────── */}
              <div className="panel p-5">
                <div className="eyebrow mb-1">Arrivals by day</div>
                <p className="text-[13px] text-muted mb-4">
                  Green is arrival within the grace period, amber is late. A dip that repeats
                  on the same weekday usually points to a scheduling problem rather than individuals.
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={daily} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="#22303F" vertical={false} />
                    <XAxis dataKey="label" stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgba(61,220,151,0.05)" }} contentStyle={CHART_BG} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="onTime" stackId="a" fill="#00A65A" name="On time" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="late" stackId="a" fill="#E8A33D" name="Late" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* ── ARRIVAL TIMES ──────────────────────── */}
                <div className="panel p-5">
                  <div className="eyebrow mb-1">When people actually arrive</div>
                  <p className="text-[13px] text-muted mb-4">
                    Sign-ins grouped by the hour. A long tail past the official start time
                    is the shape of a commute problem, not a discipline problem.
                  </p>
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={arrivals} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="#22303F" vertical={false} />
                      <XAxis dataKey="hour" stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgba(61,220,151,0.05)" }} contentStyle={CHART_BG} />
                      <Bar dataKey="count" name="Sign-ins" radius={[2, 2, 0, 0]}>
                        {arrivals.map((a, i) => (
                          <Cell key={i} fill={Number(a.hour.slice(0, 2)) >= 9 ? "#E8A33D" : "#00A65A"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ── HOURS ON SITE ──────────────────────── */}
                <div className="panel p-5">
                  <div className="eyebrow mb-1">Hours on site per day</div>
                  <p className="text-[13px] text-muted mb-4">
                    Total hours across the scope. Sharp drops usually mean people signed in
                    but never signed out, which leaves their hours uncounted.
                  </p>
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={daily} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="#22303F" vertical={false} />
                      <XAxis dataKey="label" stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={CHART_BG} />
                      <Line type="monotone" dataKey="hours" stroke="#3DDC97" strokeWidth={2} dot={false} name="Hours" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── DEPARTMENTS ─────────────────────────── */}
              {scope === "board" && (
                <div className="panel p-5">
                  <div className="eyebrow mb-1">Departments compared</div>
                  <p className="text-[13px] text-muted mb-4">
                    Attendance rate against headcount, so a small unit is not flattered
                    or punished by its size.
                  </p>
                  <ResponsiveContainer width="100%" height={Math.max(240, byDepartment.length * 34)}>
                    <BarChart data={byDepartment} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="#22303F" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" stroke="#8298AC" fontSize={11} width={64} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgba(61,220,151,0.05)" }} contentStyle={CHART_BG}
                               formatter={(v, n) => n === "rate" ? [`${v}%`, "Attendance"] : [v, n]} />
                      <Bar dataKey="rate" radius={[0, 2, 2, 0]} name="rate">
                        {byDepartment.map((d, i) => (
                          <Cell key={i} fill={d.rate >= 85 ? "#00A65A" : d.rate >= 65 ? "#E8A33D" : "#E5484D"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── PER PERSON ──────────────────────────── */}
              <div className="panel">
                <div className="p-5 pb-3">
                  <div className="eyebrow mb-1">Every person in scope</div>
                  <p className="text-[13px] text-muted">
                    Sorted by attendance rate. Anyone below 65% is worth a conversation before
                    it becomes a formal matter.
                  </p>
                </div>
                <div className="scroll-x">
                  <table className="tbl">
                    <thead>
                      <tr><th>Name</th><th>Staff no.</th><th>Dept</th><th>Days</th>
                          <th>Rate</th><th>Late</th><th>Early</th><th>Hours</th></tr>
                    </thead>
                    <tbody>
                      {perPerson.map((p) => (
                        <tr key={p.id}>
                          <td className="text-[14px]">{p.name}</td>
                          <td className="mono text-[12px]">{p.staffId || "—"}</td>
                          <td className="mono text-[12px] text-muted">{p.department}</td>
                          <td className="mono text-[13px]">{p.attended}/{expectedDays}</td>
                          <td>
                            <Pill tone={p.rate >= 85 ? "clear" : p.rate >= 65 ? "hold" : "deny"}>{p.rate}%</Pill>
                          </td>
                          <td className="mono text-[13px]">{p.late || "—"}</td>
                          <td className="mono text-[13px]">{p.early || "—"}</td>
                          <td className="mono text-[13px]">{p.hours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="mono text-[11px] text-muted leading-relaxed">
                Expected days are Mondays to Fridays in the selected range. Public holidays are
                not deducted, so rates should be read as a floor rather than an exact figure.
              </p>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
