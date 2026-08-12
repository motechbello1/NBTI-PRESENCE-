import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell, PageHead, Stat, Spinner, Pill } from "../../components/UI";
import { listStaff, reportRows, listFlags } from "../../lib/db";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const iso = (d) => d.toISOString().slice(0, 10);
const TONE = { present: "#00A65A", late: "#E8A33D", absent: "#E5484D", excused: "#8298AC" };

export default function Overview() {
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = iso(new Date());
    const from = iso(new Date(Date.now() - 29 * 86400000));
    Promise.all([listStaff(), reportRows({ from, to }), listFlags({ resolved: false, limit: 50 })])
      .then(([s, r, f]) => { setStaff(s); setRows(r); setFlags(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = iso(new Date());
  const todayRows = useMemo(() => rows.filter((r) => r.work_date === today), [rows, today]);

  const activeStaff = staff.filter((s) => s.is_active);
  const inToday = todayRows.filter((r) => r.sign_in_at).length;
  const lateToday = todayRows.filter((r) => r.status === "late").length;
  const stillIn = todayRows.filter((r) => r.sign_in_at && !r.sign_out_at).length;
  const notEnrolled = activeStaff.filter((s) => !s.face_enrolled).length;

  const trend = useMemo(() => {
    const byDay = {};
    rows.forEach((r) => {
      byDay[r.work_date] ||= { day: r.work_date, present: 0, late: 0 };
      if (r.status === "late") byDay[r.work_date].late++;
      else if (r.sign_in_at) byDay[r.work_date].present++;
    });
    return Object.values(byDay)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) }));
  }, [rows]);

  const split = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0 };
    todayRows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    counts.absent = Math.max(0, activeStaff.length - inToday);
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [todayRows, activeStaff.length, inToday]);

  if (loading) return <Shell><Spinner label="Loading the board" /></Shell>;

  const rate = activeStaff.length ? Math.round((inToday / activeStaff.length) * 100) : 0;

  return (
    <Shell>
      <PageHead
        eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        title="Overview"
      >
        <Link to="/admin/reports" className="btn btn-ghost">Build a report</Link>
      </PageHead>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="On site today" value={inToday} sub={`of ${activeStaff.length} active staff`} tone="clear" />
        <Stat label="Turnout" value={`${rate}%`} tone={rate >= 85 ? "clear" : rate >= 60 ? "hold" : "deny"} />
        <Stat label="Late arrivals" value={lateToday} tone={lateToday ? "hold" : "paper"} />
        <Stat label="Still signed in" value={stillIn} />
        <Stat label="Open incidents" value={flags.length} tone={flags.length ? "deny" : "clear"} />
      </div>

      {notEnrolled > 0 && (
        <div className="panel border-l-2 border-l-hold p-4 mb-6">
          <div className="text-[14px]">
            <span className="text-hold font-medium">{notEnrolled}</span> active staff have not enrolled a face
            and cannot record attendance yet.{" "}
            <Link to="/admin/staff" className="text-beam hover:underline">See who</Link>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 mb-6">
        <div className="panel p-5">
          <div className="eyebrow mb-4">Arrivals over the last 30 days</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00A65A" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#00A65A" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gLate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E8A33D" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#E8A33D" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#22303F" vertical={false} />
              <XAxis dataKey="label" stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#17222E", border: "1px solid #22303F", borderRadius: 3, fontSize: 12 }} />
              <Area type="monotone" dataKey="present" stroke="#00A65A" fill="url(#gPresent)" strokeWidth={2} name="On time" />
              <Area type="monotone" dataKey="late" stroke="#E8A33D" fill="url(#gLate)" strokeWidth={2} name="Late" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel p-5">
          <div className="eyebrow mb-4">Today at a glance</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={split} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                {split.map((s) => <Cell key={s.name} fill={TONE[s.name]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11, textTransform: "capitalize" }} />
              <Tooltip contentStyle={{ background: "#17222E", border: "1px solid #22303F", borderRadius: 3, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {flags.length > 0 && (
        <div className="panel">
          <div className="p-5 pb-3 flex items-center justify-between">
            <div className="eyebrow">Latest incidents</div>
            <Link to="/admin/flags" className="mono text-[11px] text-beam uppercase tracking-wider hover:underline">
              All incidents
            </Link>
          </div>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>When</th><th>Staff</th><th>Type</th><th>Severity</th></tr></thead>
              <tbody>
                {flags.slice(0, 6).map((f) => (
                  <tr key={f.id}>
                    <td className="mono text-[12px] whitespace-nowrap">
                      {new Date(f.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="text-[13px]">{f.profiles?.full_name || "Unknown"}</td>
                    <td className="mono text-[12px] capitalize">{f.flag_type.replace(/_/g, " ")}</td>
                    <td><Pill tone={f.severity === "critical" ? "deny" : f.severity === "high" ? "hold" : "mute"}>{f.severity}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}
