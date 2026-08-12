import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Shell, StatusPill, Pill, Spinner } from "../components/UI";
import { myHistory } from "../lib/db";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";

const fmtDate = (date) => new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const fmtLongDate = (date) => new Date(date).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

function RegisterTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="history-tooltip">
      <span className="mono">{label}</span>
      <strong className="mono">{Number(payload[0].value).toFixed(1)} hours</strong>
    </div>
  );
}

export default function History() {
  const { session } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    myHistory(session.user.id, 90).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [session]);

  const stats = useMemo(() => {
    const present = rows.filter((row) => row.status === "present").length;
    const late = rows.filter((row) => row.status === "late").length;
    const early = rows.filter((row) => row.early_departure).length;
    const hours = rows.reduce((sum, row) => sum + (row.hours_worked || 0), 0);
    const rate = rows.length ? Math.round(((present + late) / rows.length) * 100) : 0;
    return { present, late, early, hours: hours.toFixed(1), rate, days: rows.length };
  }, [rows]);

  const chart = useMemo(
    () => [...rows].reverse().slice(-21).map((row) => ({
      day: fmtDate(row.work_date),
      hours: row.hours_worked || 0,
      status: row.status,
    })),
    [rows]
  );

  if (loading) return <Shell><Spinner label="Loading your record" /></Shell>;

  return (
    <Shell>
      <section className="history-page" aria-labelledby="history-title">
        <header className="history-head">
          <div>
            <div className="eyebrow">Personal attendance ledger · rolling 90 days</div>
            <h1 id="history-title" className="display">My attendance record</h1>
          </div>
          <div className="history-reference mono">
            <span>REGISTER COPY</span>
            <strong>{String(stats.days).padStart(2, "0")} ENTRIES</strong>
          </div>
        </header>

        <dl className="history-summary" aria-label="Attendance summary for the last 90 days">
          <Summary label="Days recorded" value={stats.days} />
          <Summary label="Attendance rate" value={`${stats.rate}%`} tone={stats.rate >= 90 ? "clear" : stats.rate >= 75 ? "hold" : "deny"} />
          <Summary label="On time" value={stats.present} tone="clear" />
          <Summary label="Late" value={stats.late} tone={stats.late ? "hold" : undefined} />
          <Summary label="Hours recorded" value={stats.hours} note={`${stats.early} early departure${stats.early === 1 ? "" : "s"}`} />
        </dl>

        {rows.length === 0 ? (
          <div className="history-empty notched">
            <div className="mono history-empty-code">REGISTER · NO ENTRIES</div>
            <div>
              <h2 className="display">Your record is ready to begin.</h2>
              <p>Once an on-site sign-in clears all four checks, that working day will appear here.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="history-evidence">
              <section className="history-chart" aria-labelledby="hours-chart-title">
                <div className="history-section-head">
                  <div>
                    <div className="eyebrow">Measured time on site</div>
                    <h2 id="hours-chart-title" className="display">Last 21 recorded days</h2>
                  </div>
                  <span className="mono">HOURS / DAY</span>
                </div>
                <div className="history-chart-frame" role="img" aria-label="Bar chart showing hours recorded on site for the last 21 attendance days">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 12, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="var(--rule)" strokeDasharray="1 5" vertical={false} />
                      <XAxis dataKey="day" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "color-mix(in srgb, var(--rule) 25%, transparent)" }} content={<RegisterTooltip />} />
                      <Bar dataKey="hours" maxBarSize={24}>
                        {chart.map((day, index) => (
                          <Cell key={`${day.day}-${index}`} fill={day.status === "late" ? "var(--review)" : "var(--bureau)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <aside className="history-key" aria-label="How to read this attendance record">
                <div className="eyebrow">Register key</div>
                <h2 className="display">What the record means</h2>
                <dl>
                  <div><dt><i className="is-clear" />Cleared</dt><dd>Arrival was within the approved window.</dd></div>
                  <div><dt><i className="is-hold" />Held</dt><dd>Arrival was late or departure was early.</dd></div>
                  <div><dt className="mono">—</dt><dd>The machine did not receive that reading.</dd></div>
                </dl>
                <p>Times and hours are system measurements. Any written reason appears exactly as recorded.</p>
              </aside>
            </div>

            <section className="history-register" aria-labelledby="register-title">
              <div className="history-register-head">
                <div>
                  <div className="eyebrow">Chronological register</div>
                  <h2 id="register-title" className="display">Daily entries</h2>
                </div>
                <span className="mono">NEWEST FIRST</span>
              </div>

              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr><th scope="col">Date</th><th scope="col">In</th><th scope="col">Out</th><th scope="col">Hours</th><th scope="col">Status</th><th scope="col">Recorded note</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Date" className="history-date mono">{fmtLongDate(row.work_date)}</td>
                        <td data-label="Sign in" className="mono">{fmtTime(row.sign_in_at)}</td>
                        <td data-label="Sign out" className="mono">{fmtTime(row.sign_out_at)}</td>
                        <td data-label="Hours" className="mono">{row.hours_worked ? `${row.hours_worked}h` : "—"}</td>
                        <td data-label="Status" className="history-status">
                          <StatusPill status={row.status} />
                          {row.early_departure ? <Pill tone="hold">Early</Pill> : null}
                        </td>
                        <td data-label="Note" className="history-note">{row.late_reason || row.early_reason || row.admin_note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </Shell>
  );
}

function Summary({ label, value, note, tone }) {
  return (
    <div className={tone ? `is-${tone}` : undefined}>
      <dt className="mono">{label}</dt>
      <dd className="mono">{value}</dd>
      {note ? <small>{note}</small> : null}
    </div>
  );
}
