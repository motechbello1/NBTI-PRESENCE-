import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Shell, StatusPill, Pill, Spinner } from "../components/UI";
import { myHistory } from "../lib/db";
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear } from "date-fns";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";

const localDate = (date) => new Date(`${date}T12:00:00`);
const fmtDate = (date) => localDate(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const fmtLongDate = (date) => localDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

function selectedRange(view, values) {
  if (view === "day") return { from: values.day, to: values.day };
  if (view === "month") {
    const [year, month] = values.month.split("-").map(Number);
    const date = new Date(year, month - 1, 1);
    return { from: format(startOfMonth(date), "yyyy-MM-dd"), to: format(endOfMonth(date), "yyyy-MM-dd") };
  }
  if (view === "year") {
    const date = new Date(Number(values.year), 0, 1);
    return { from: format(startOfYear(date), "yyyy-MM-dd"), to: format(endOfYear(date), "yyyy-MM-dd") };
  }
  return { from: values.customFrom, to: values.customTo };
}

function rangeLabel(view, range) {
  if (view === "day") return localDate(range.from).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "month") return localDate(range.from).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (view === "year") return localDate(range.from).getFullYear().toString();
  return `${fmtLongDate(range.from)} to ${fmtLongDate(range.to)}`;
}

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
  const [error, setError] = useState(null);
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState("month");
  const [day, setDay] = useState(format(now, "yyyy-MM-dd"));
  const [month, setMonth] = useState(format(now, "yyyy-MM"));
  const [year, setYear] = useState(format(now, "yyyy"));
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(now, "yyyy-MM-dd"));
  const range = useMemo(
    () => selectedRange(view, { day, month, year, customFrom, customTo }),
    [view, day, month, year, customFrom, customTo]
  );

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    setRows([]);
    myHistory(session.user.id, range)
      .then((data) => { if (current) setRows(data); })
      .catch((historyError) => { if (current) setError(historyError.message || "Your attendance record could not be loaded."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [session.user.id, range.from, range.to]);

  const stats = useMemo(() => {
    const present = rows.filter((row) => row.status === "present").length;
    const late = rows.filter((row) => row.status === "late").length;
    const early = rows.filter((row) => row.early_departure).length;
    const hours = rows.reduce((sum, row) => sum + (row.hours_worked || 0), 0);
    const rate = rows.length ? Math.round(((present + late) / rows.length) * 100) : 0;
    return { present, late, early, hours: hours.toFixed(1), rate, days: rows.length };
  }, [rows]);

  const chart = useMemo(
    () => [...rows].reverse().slice(-31).map((row) => ({
      day: fmtDate(row.work_date),
      hours: row.hours_worked || 0,
      status: row.status,
    })),
    [rows]
  );

  return (
    <Shell>
      <section className="history-page" aria-labelledby="history-title">
        <header className="history-head">
          <div>
            <div className="eyebrow">Personal attendance sheet · choose any period</div>
            <h1 id="history-title" className="display">My attendance records</h1>
          </div>
          <div className="history-reference mono">
            <span>{rangeLabel(view, range)}</span>
            <strong>{String(stats.days).padStart(2, "0")} ENTRIES</strong>
          </div>
        </header>

        <section className="history-controls" aria-labelledby="history-period-title">
          <div className="history-controls-head">
            <div><span className="eyebrow">Attendance period</span><h2 id="history-period-title" className="display">Choose what you want to see</h2></div>
            <span className="mono">{range.from} / {range.to}</span>
          </div>
          <div className="history-view-tabs" role="group" aria-label="Attendance period type">
            {[['day', 'Day'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom dates']].map(([value, label]) => (
              <button key={value} type="button" className={view === value ? "is-active" : ""} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
            ))}
          </div>
          <div className="history-date-fields">
            {view === "day" ? <label><span className="label">Select a day</span><input className="field mono" type="date" value={day} max={format(now, "yyyy-MM-dd")} onChange={(event) => { if (event.target.value) setDay(event.target.value); }} /></label> : null}
            {view === "month" ? <label><span className="label">Select a month</span><input className="field mono" type="month" value={month} max={format(now, "yyyy-MM")} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></label> : null}
            {view === "year" ? <label><span className="label">Select a year</span><select className="field mono" value={year} onChange={(event) => setYear(event.target.value)}>{Array.from({ length: 10 }, (_, index) => String(now.getFullYear() - index)).map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : null}
            {view === "custom" ? <><label><span className="label">From date</span><input className="field mono" type="date" value={customFrom} max={customTo} onChange={(event) => { if (event.target.value) setCustomFrom(event.target.value); }} /></label><label><span className="label">To date</span><input className="field mono" type="date" value={customTo} min={customFrom} max={format(now, "yyyy-MM-dd")} onChange={(event) => { if (event.target.value) setCustomTo(event.target.value); }} /></label></> : null}
            <div className="history-selection"><span className="mono">SHOWING</span><strong>{rangeLabel(view, range)}</strong><small>{loading ? "Loading attendance entries" : `${rows.length} daily ${rows.length === 1 ? "entry" : "entries"}`}</small></div>
          </div>
        </section>

        {error ? <div className="history-error" role="alert"><strong>Attendance sheet unavailable</strong><span>{error}</span></div> : null}

        <dl className="history-summary" aria-label={`Attendance summary for ${rangeLabel(view, range)}`} aria-busy={loading}>
          <Summary label="Days recorded" value={stats.days} />
          <Summary label="Attendance rate" value={`${stats.rate}%`} tone={stats.rate >= 90 ? "clear" : stats.rate >= 75 ? "hold" : "deny"} />
          <Summary label="On time" value={stats.present} tone="clear" />
          <Summary label="Late" value={stats.late} tone={stats.late ? "hold" : undefined} />
          <Summary label="Hours recorded" value={stats.hours} note={`${stats.early} early departure${stats.early === 1 ? "" : "s"}`} />
        </dl>

        {loading ? <div className="history-period-loading"><Spinner label="Loading attendance sheet" /></div> : rows.length === 0 ? (
          <div className="history-empty notched">
            <div className="mono history-empty-code">REGISTER · NO ENTRIES</div>
            <div>
              <h2 className="display">No attendance was recorded for this period.</h2>
              <p>Choose another day, month, year or custom range. A completed sign-in will appear here automatically.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="history-evidence">
              <section className="history-chart" aria-labelledby="hours-chart-title">
                <div className="history-section-head">
                  <div>
                    <div className="eyebrow">Measured time on site</div>
                    <h2 id="hours-chart-title" className="display">Recorded hours in this selection</h2>
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
