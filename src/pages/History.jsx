import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Shell, PageHead, Stat, StatusPill, Pill, Spinner, Empty } from "../components/UI";
import { myHistory } from "../lib/db";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";

const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function History() {
  const { session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    myHistory(session.user.id, 90).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [session]);

  const stats = useMemo(() => {
    const present = rows.filter((r) => r.status === "present").length;
    const late = rows.filter((r) => r.status === "late").length;
    const early = rows.filter((r) => r.early_departure).length;
    const hours = rows.reduce((a, r) => a + (r.hours_worked || 0), 0);
    const rate = rows.length ? Math.round(((present + late) / rows.length) * 100) : 0;
    return { present, late, early, hours: hours.toFixed(1), rate, days: rows.length };
  }, [rows]);

  const chart = useMemo(
    () => [...rows].reverse().slice(-21).map((r) => ({
      day: fmtDate(r.work_date),
      hours: r.hours_worked || 0,
      status: r.status,
    })),
    [rows]
  );

  if (loading) return <Shell><Spinner label="Loading your record" /></Shell>;

  return (
    <Shell>
      <PageHead eyebrow="Last 90 days" title="My record" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Days recorded" value={stats.days} />
        <Stat label="Attendance" value={`${stats.rate}%`} tone={stats.rate >= 90 ? "clear" : stats.rate >= 75 ? "hold" : "deny"} />
        <Stat label="On time" value={stats.present} tone="clear" />
        <Stat label="Late" value={stats.late} tone={stats.late ? "hold" : "paper"} />
        <Stat label="Total hours" value={stats.hours} sub={`${stats.early} early departures`} />
      </div>

      {rows.length === 0 ? (
        <Empty title="Nothing recorded yet">
          Once you sign in on site, your days will build up here.
        </Empty>
      ) : (
        <>
          <div className="panel p-5 mb-6">
            <div className="eyebrow mb-4">Hours on site, last 21 days</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="#22303F" vertical={false} />
                <XAxis dataKey="day" stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#8298AC" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(61,220,151,0.06)" }}
                  contentStyle={{ background: "#17222E", border: "1px solid #22303F", borderRadius: 3, fontSize: 12 }}
                />
                <Bar dataKey="hours" radius={[2, 2, 0, 0]}>
                  {chart.map((d, i) => (
                    <Cell key={i} fill={d.status === "late" ? "#E8A33D" : "#00A65A"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel scroll-x">
            <table className="tbl">
              <thead>
                <tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono text-[13px]">{new Date(r.work_date).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}</td>
                    <td className="mono text-[13px]">{fmtTime(r.sign_in_at)}</td>
                    <td className="mono text-[13px]">{fmtTime(r.sign_out_at)}</td>
                    <td className="mono text-[13px]">{r.hours_worked ? `${r.hours_worked}h` : "—"}</td>
                    <td className="space-x-1.5 whitespace-nowrap">
                      <StatusPill status={r.status} />
                      {r.early_departure && <Pill tone="hold">Early</Pill>}
                    </td>
                    <td className="text-[13px] text-muted max-w-[260px]">
                      {r.late_reason || r.early_reason || r.admin_note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
