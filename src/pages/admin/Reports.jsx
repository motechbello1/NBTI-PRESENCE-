import { useEffect, useMemo, useState } from "react";
import { Shell, Spinner, Empty, Pill } from "../../components/UI";
import { listDepartments, listStaff, reportRows } from "../../lib/db";
import { generateAttendanceBrief } from "../../lib/intelligence";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

const DAY = 86400000;
const iso = (date) => date.toISOString().slice(0, 10);
const today = iso(new Date());

function workingDays(from, to) {
  let total = 0;
  const cursor = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  while (cursor <= end) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) total += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

function ReportTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="report-tooltip">
      <span className="mono">{label}</span>
      {payload.map((item) => (
        <strong key={item.dataKey} style={{ color: item.color || item.stroke || item.fill }}>
          {item.name}: {item.value}
        </strong>
      ))}
    </div>
  );
}

function ReportMeasure({ index, label, value, note, tone }) {
  return (
    <div className={`report-measure${tone ? ` is-${tone}` : ""}`}>
      <dt><span className="mono">{index}</span>{label}</dt>
      <dd className="display">{value}</dd>
      <small className="mono">{note}</small>
    </div>
  );
}

function IntelligenceMark() {
  return (
    <svg className="intelligence-mark" viewBox="0 0 88 88" aria-hidden="true">
      <path d="M44 3v18M44 67v18M3 44h18M67 44h18" />
      <circle cx="44" cy="44" r="28" />
      <circle cx="44" cy="44" r="17" />
      <path d="M36 44h16M44 36v16" />
    </svg>
  );
}

function briefAsText(brief, scopeName, from, to) {
  return [
    brief.title,
    `${scopeName} | ${from} to ${to}`,
    "",
    brief.executiveSummary,
    "",
    "FINDINGS",
    ...brief.findings.flatMap((item, index) => [
      `${index + 1}. ${item.heading}`,
      item.detail,
      `Evidence: ${item.evidence}`,
      "",
    ]),
    "WATCH ITEMS",
    ...(brief.watchItems.length
      ? brief.watchItems.flatMap((item) => [`${item.heading}: ${item.detail}`, ""])
      : ["No additional watch items were identified from this evidence.", ""]),
    "RECOMMENDED FOLLOW-UP",
    ...brief.recommendations.flatMap((item, index) => [
      `${index + 1}. ${item.action}`,
      item.reason,
      "",
    ]),
    "NOTE",
    brief.closingNote,
  ].join("\n");
}

export default function Reports() {
  const reducedMotion = useReducedMotion();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * DAY)));
  const [to, setTo] = useState(today);
  const [scope, setScope] = useState("board");
  const [departmentId, setDepartmentId] = useState("");
  const [userId, setUserId] = useState("");
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [brief, setBrief] = useState(null);
  const [briefMeta, setBriefMeta] = useState(null);
  const [briefError, setBriefError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([listDepartments(), listStaff()])
      .then(([departmentRows, staffRows]) => {
        setDepartments(departmentRows);
        setStaff(staffRows.filter((person) => person.is_active));
      })
      .catch(() => setLoadError("Staff and department records could not be read."));
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError("");
    reportRows({
      from,
      to,
      departmentId: scope === "department" && departmentId ? departmentId : null,
      userId: scope === "individual" && userId ? userId : null,
    })
      .then((data) => { if (current) setRows(data); })
      .catch(() => { if (current) { setRows([]); setLoadError("The attendance register could not be read for this range."); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [from, to, scope, departmentId, userId]);

  useEffect(() => {
    setBrief(null);
    setBriefMeta(null);
    setBriefError("");
    setCopied(false);
  }, [from, to, scope, departmentId, userId]);

  const cohort = useMemo(() => {
    if (scope === "individual") return userId ? staff.filter((person) => person.id === userId) : [];
    if (scope === "department") return departmentId ? staff.filter((person) => person.department_id === departmentId) : [];
    return staff;
  }, [scope, departmentId, userId, staff]);

  const cohortIds = useMemo(() => new Set(cohort.map((person) => person.id)), [cohort]);
  const scopedRows = useMemo(() => rows.filter((row) => cohortIds.has(row.user_id)), [rows, cohortIds]);
  const expectedDays = workingDays(from, to);
  const expectedTotal = expectedDays * cohort.length;
  const scopeReady = scope === "board" || (scope === "department" ? Boolean(departmentId) : Boolean(userId));

  const scopeName = scope === "board"
    ? "The Board as a whole"
    : scope === "department"
      ? (departments.find((department) => department.id === departmentId)?.name || "Selected department")
      : (staff.find((person) => person.id === userId)?.full_name || "Selected member of staff");

  const summary = useMemo(() => {
    const attended = scopedRows.filter((row) => row.sign_in_at).length;
    const present = scopedRows.filter((row) => row.status === "present").length;
    const late = scopedRows.filter((row) => row.status === "late").length;
    const excused = scopedRows.filter((row) => row.status === "excused").length;
    const hours = scopedRows.reduce((sum, row) => sum + Number(row.hours_worked || 0), 0);
    const early = scopedRows.filter((row) => row.early_departure).length;
    const noSignOut = scopedRows.filter((row) => row.sign_in_at && !row.sign_out_at).length;
    const manual = scopedRows.filter((row) => row.marked_by_admin).length;
    return {
      attended,
      present,
      late,
      excused,
      early,
      noSignOut,
      manual,
      absent: Math.max(0, expectedTotal - attended - excused),
      hours: Number(hours.toFixed(1)),
      averageHours: attended ? Number((hours / attended).toFixed(2)) : 0,
      rate: expectedTotal ? Math.round((attended / expectedTotal) * 100) : 0,
      punctuality: attended ? Math.round((present / attended) * 100) : 0,
    };
  }, [scopedRows, expectedTotal]);

  const daily = useMemo(() => {
    const map = {};
    scopedRows.forEach((row) => {
      map[row.work_date] ||= { day: row.work_date, onTime: 0, late: 0, excused: 0, hours: 0 };
      if (row.status === "present") map[row.work_date].onTime += 1;
      if (row.status === "late") map[row.work_date].late += 1;
      if (row.status === "excused") map[row.work_date].excused += 1;
      map[row.work_date].hours += Number(row.hours_worked || 0);
    });
    return Object.values(map)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((day) => ({
        ...day,
        hours: Number(day.hours.toFixed(1)),
        label: new Date(`${day.day}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      }));
  }, [scopedRows]);

  const arrivals = useMemo(() => {
    const buckets = {};
    scopedRows.filter((row) => row.sign_in_at).forEach((row) => {
      const hour = new Date(row.sign_in_at).getHours();
      const label = `${String(hour).padStart(2, "0")}:00`;
      buckets[label] = (buckets[label] || 0) + 1;
    });
    return Object.entries(buckets).sort().map(([hour, count]) => ({ hour, count }));
  }, [scopedRows]);

  const byDepartment = useMemo(() => {
    const map = {};
    staff.forEach((person) => {
      const key = person.department_id || "unassigned";
      map[key] ||= {
        name: person.departments?.name || "Unassigned",
        code: person.departments?.code || "—",
        headcount: 0,
        attended: 0,
        late: 0,
      };
      map[key].headcount += 1;
    });
    scopedRows.forEach((row) => {
      const person = staff.find((candidate) => candidate.id === row.user_id);
      const key = person?.department_id || "unassigned";
      if (!map[key]) return;
      if (row.sign_in_at) map[key].attended += 1;
      if (row.status === "late") map[key].late += 1;
    });
    return Object.values(map)
      .map((department) => ({
        ...department,
        rate: department.headcount * expectedDays
          ? Math.round((department.attended / (department.headcount * expectedDays)) * 100)
          : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [scopedRows, staff, expectedDays]);

  const perPerson = useMemo(() => {
    const map = {};
    cohort.forEach((person) => {
      map[person.id] = {
        id: person.id,
        name: person.full_name,
        staffId: person.staff_id,
        department: person.departments?.code || "—",
        attended: 0,
        late: 0,
        early: 0,
        hours: 0,
      };
    });
    scopedRows.forEach((row) => {
      const person = map[row.user_id];
      if (!person) return;
      if (row.sign_in_at) person.attended += 1;
      if (row.status === "late") person.late += 1;
      if (row.early_departure) person.early += 1;
      person.hours += Number(row.hours_worked || 0);
    });
    return Object.values(map)
      .map((person) => ({
        ...person,
        hours: Number(person.hours.toFixed(1)),
        rate: expectedDays ? Math.round((person.attended / expectedDays) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));
  }, [scopedRows, cohort, expectedDays]);

  const instrumentReading = useMemo(() => {
    const parts = [
      `${cohort.length} active ${cohort.length === 1 ? "person" : "people"} across ${expectedDays} expected weekdays produced ${summary.attended} recorded attendance ${summary.attended === 1 ? "day" : "days"}.`,
      `The measured attendance rate is ${summary.rate}%, with ${summary.punctuality}% of recorded arrivals inside the grace period.`,
      `${summary.late} late arrivals and ${summary.early} early departures require context before they are treated as exceptions.`,
    ];
    if (summary.noSignOut) parts.push(`${summary.noSignOut} incomplete sign-outs leave their working hours uncounted.`);
    if (summary.manual) parts.push(`${summary.manual} entries were placed manually and remain identifiable in the audit trail.`);
    return parts.join(" ");
  }, [cohort.length, expectedDays, summary]);

  async function createBrief() {
    if (!scopeReady) return;
    setGenerating(true);
    setBriefError("");
    setCopied(false);
    try {
      const result = await generateAttendanceBrief({ from, to, scope, departmentId, userId });
      setBrief(result.report);
      setBriefMeta({ model: result.model, generatedAt: result.generatedAt });
    } catch (error) {
      setBriefError(error.message);
    } finally {
      setGenerating(false);
    }
  }

  function exportCsv() {
    const heading = ["Name", "Staff number", "Department", "Days attended", "Expected days", "Attendance rate %", "Late", "Early departures", "Total hours"];
    const body = perPerson.map((person) =>
      [person.name, person.staffId || "", person.department, person.attended, expectedDays, person.rate, person.late, person.early, person.hours]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")
    );
    const url = URL.createObjectURL(new Blob([[heading.join(","), ...body].join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nbti-attendance-${from}-to-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyBrief() {
    if (!brief) return;
    await navigator.clipboard.writeText(briefAsText(brief, scopeName, from, to));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadBrief() {
    if (!brief) return;
    const url = URL.createObjectURL(new Blob([briefAsText(brief, scopeName, from, to)], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nbti-management-brief-${from}-to-${to}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      <section className="reports-page" aria-labelledby="reports-title">
        <header className="reports-head">
          <div className="reports-title-block">
            <div className="mono reports-reference">REPORT SERIES A-04 · ATTENDANCE EVIDENCE</div>
            <div className="eyebrow">Board performance register</div>
            <h1 id="reports-title" className="display">Attendance, without guesswork.</h1>
            <p>Read the pattern at agency, department or individual level. The charts are calculated from the register; the management brief is written by the intelligence service from those same figures.</p>
          </div>
          <div className="reports-head-actions reports-no-print">
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!perPerson.length}>Export register</button>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print report</button>
          </div>
        </header>

        <section className="report-query reports-no-print" aria-labelledby="report-parameters-title">
          <div className="report-query-index">
            <span className="mono">01</span>
            <div><h2 id="report-parameters-title">Set the evidence window</h2><p>All figures recalculate together.</p></div>
          </div>
          <div className="report-query-fields">
            <label><span className="label">From</span><input type="date" className="field mono" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
            <label><span className="label">To</span><input type="date" className="field mono" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></label>
            <label><span className="label">Scope</span><select className="field" value={scope} onChange={(event) => setScope(event.target.value)}><option value="board">Whole Board</option><option value="department">One department</option><option value="individual">One person</option></select></label>
            <label>
              <span className="label">{scope === "department" ? "Department" : scope === "individual" ? "Member of staff" : "Register"}</span>
              {scope === "department" ? (
                <select className="field" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">Choose department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
              ) : scope === "individual" ? (
                <select className="field" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Choose member of staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select>
              ) : <div className="report-query-fixed mono">ALL ACTIVE STAFF</div>}
            </label>
          </div>
        </section>

        {loadError ? <div className="report-error" role="alert">{loadError}</div> : null}
        {loading ? <div className="reports-loading"><Spinner label="Reading attendance evidence" /></div> : !scopeReady ? (
          <Empty title={scope === "department" ? "Choose a department" : "Choose a member of staff"}>The report will open once its scope is defined.</Empty>
        ) : (
          <div className="reports-body">
            <div className="report-period-line mono"><span>{scopeName.toUpperCase()}</span><span>{from} / {to}</span><span>{expectedDays} EXPECTED WEEKDAYS</span></div>

            <dl className="report-measures" aria-label="Attendance report summary">
              <ReportMeasure index="02" label="Attendance" value={`${summary.rate}%`} note={`${summary.attended} OF ${expectedTotal} DAYS`} tone={summary.rate >= 85 ? "clear" : summary.rate >= 65 ? "hold" : "deny"} />
              <ReportMeasure index="03" label="Punctuality" value={`${summary.punctuality}%`} note={`${summary.late} LATE ARRIVALS`} tone={summary.punctuality >= 85 ? "clear" : "hold"} />
              <ReportMeasure index="04" label="Approved away" value={summary.excused} note="EXCUSED DAYS" />
              <ReportMeasure index="05" label="Hours logged" value={summary.hours.toLocaleString()} note={`${summary.averageHours} AVG / ATTENDED DAY`} />
              <ReportMeasure index="06" label="Incomplete" value={summary.noSignOut} note="MISSING SIGN-OUT" tone={summary.noSignOut ? "deny" : "clear"} />
            </dl>

            <section className="report-intelligence" aria-labelledby="intelligence-brief-title">
              <aside className="report-intelligence-identity">
                <IntelligenceMark />
                <div className="mono">PRESENCE<br />INTELLIGENCE</div>
                <small className="mono">PERMISSION-SCOPED MODEL</small>
              </aside>
              <div className="report-intelligence-content">
                {!brief ? (
                  <div className="report-intelligence-prompt">
                    <div className="eyebrow">Management brief</div>
                    <h2 id="intelligence-brief-title" className="display">Ask the register to explain itself.</h2>
                    <p>The model receives aggregates for this scope, never face descriptors, incident photographs or hidden records. It will separate evidence from recommended follow-up and retain the report’s known limitations.</p>
                    <button type="button" className="btn btn-primary" onClick={createBrief} disabled={generating || !cohort.length}>
                      {generating ? "Drafting from evidence" : "Generate intelligence brief"}
                    </button>
                    {briefError ? <div className="report-ai-error" role="alert">{briefError}<small>ICT can enable this service by deploying the supplied Edge Function and setting the AI Gateway secret.</small></div> : null}
                  </div>
                ) : (
                  <article className="generated-brief">
                    <div className="generated-brief-head">
                      <div><div className="eyebrow">Model-generated management brief</div><h2 id="intelligence-brief-title" className="display">{brief.title}</h2></div>
                      <div className="generated-brief-actions reports-no-print"><button type="button" onClick={copyBrief}>{copied ? "Copied" : "Copy"}</button><button type="button" onClick={downloadBrief}>Download</button><button type="button" onClick={createBrief} disabled={generating}>{generating ? "Redrafting" : "Redraft"}</button></div>
                    </div>
                    <p className="generated-brief-summary">{brief.executiveSummary}</p>
                    <div className="generated-findings">
                      {brief.findings.map((finding, index) => (
                        <section key={`${finding.heading}-${index}`}><span className="mono">F-{String(index + 1).padStart(2, "0")}</span><div><h3>{finding.heading}</h3><p>{finding.detail}</p><small className="mono">EVIDENCE · {finding.evidence}</small></div></section>
                      ))}
                    </div>
                    <div className="generated-brief-grid">
                      <section><div className="eyebrow">Watch items</div>{brief.watchItems.length ? brief.watchItems.map((item) => <div className="generated-note" key={item.heading}><h3>{item.heading}</h3><p>{item.detail}</p></div>) : <p className="generated-none">No additional watch items were identified.</p>}</section>
                      <section><div className="eyebrow">Recommended follow-up</div>{brief.recommendations.map((item, index) => <div className="generated-action" key={item.action}><span className="mono">{String(index + 1).padStart(2, "0")}</span><div><h3>{item.action}</h3><p>{item.reason}</p></div></div>)}</section>
                    </div>
                    <footer className="generated-brief-foot"><p>{brief.closingNote}</p><span className="mono">{briefMeta?.model} · {briefMeta?.generatedAt ? new Date(briefMeta.generatedAt).toLocaleString("en-GB") : ""} · VERIFY AGAINST REGISTER</span></footer>
                  </article>
                )}
              </div>
            </section>

            <section className="instrument-reading" aria-labelledby="instrument-reading-title">
              <span className="mono">07 / REGISTER READING</span>
              <div><h2 id="instrument-reading-title" className="display">What the measured record says</h2><p>{instrumentReading}</p></div>
            </section>

            {!scopedRows.length ? (
              <Empty title="No attendance in this range">The cohort is valid, but no attendance action was recorded inside this date window.</Empty>
            ) : (
              <div className="report-visuals">
                <section className="report-chart report-chart-wide" aria-labelledby="daily-chart-title">
                  <div className="report-section-head"><div><span className="mono">08</span><div><div className="eyebrow">Daily register shape</div><h2 id="daily-chart-title" className="display">Arrivals across the period</h2></div></div><p>On-time and late entries share one column because they are both recorded attendance.</p></div>
                  <div className="report-chart-frame" role="img" aria-label="Stacked bar chart of on-time, late and excused attendance by day">
                    <ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} vertical={false} /><XAxis dataKey="label" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} minTickGap={20} /><YAxis stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip content={<ReportTooltip />} cursor={{ fill: "color-mix(in srgb, var(--bureau) 5%, transparent)" }} /><Bar dataKey="onTime" stackId="attendance" fill="var(--bureau)" name="On time" isAnimationActive={!reducedMotion} animationDuration={440} /><Bar dataKey="late" stackId="attendance" fill="var(--review)" name="Late" isAnimationActive={!reducedMotion} animationDuration={440} /><Bar dataKey="excused" stackId="attendance" fill="var(--rule)" name="Excused" isAnimationActive={!reducedMotion} animationDuration={440} /></BarChart></ResponsiveContainer>
                  </div>
                  <div className="report-legend mono"><span className="is-clear">On time</span><span className="is-hold">Late</span><span className="is-mute">Excused</span></div>
                </section>

                <section className="report-chart" aria-labelledby="arrival-chart-title">
                  <div className="report-section-head"><div><span className="mono">09</span><div><div className="eyebrow">Arrival distribution</div><h2 id="arrival-chart-title" className="display">When sign-ins occur</h2></div></div></div>
                  <p className="report-chart-note">Each bar is an hour of the day. Amber begins at 09:00 as a visual review cue, while the configured grace period remains authoritative.</p>
                  <div className="report-chart-frame is-compact" role="img" aria-label="Bar chart showing the number of sign-ins by hour"><ResponsiveContainer width="100%" height="100%"><BarChart data={arrivals} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} vertical={false} /><XAxis dataKey="hour" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} /><YAxis stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip content={<ReportTooltip />} cursor={{ fill: "transparent" }} /><Bar dataKey="count" name="Sign-ins" isAnimationActive={!reducedMotion} animationDuration={440}>{arrivals.map((arrival) => <Cell key={arrival.hour} fill={Number(arrival.hour.slice(0, 2)) >= 9 ? "var(--review)" : "var(--bureau)"} />)}</Bar></BarChart></ResponsiveContainer></div>
                </section>

                <section className="report-chart" aria-labelledby="hours-chart-title">
                  <div className="report-section-head"><div><span className="mono">10</span><div><div className="eyebrow">Recorded duration</div><h2 id="hours-chart-title" className="display">Hours completed</h2></div></div></div>
                  <p className="report-chart-note">Daily total across the selected scope. An unfinished sign-out contributes no completed hours.</p>
                  <div className="report-chart-frame is-compact" role="img" aria-label="Line chart showing total completed hours by day"><ResponsiveContainer width="100%" height="100%"><LineChart data={daily} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} vertical={false} /><XAxis dataKey="label" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} minTickGap={24} /><YAxis stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} /><Tooltip content={<ReportTooltip />} /><Line type="monotone" dataKey="hours" stroke="var(--bureau)" strokeWidth={2} dot={false} name="Hours" isAnimationActive={!reducedMotion} animationDuration={440} /></LineChart></ResponsiveContainer></div>
                </section>

                {scope === "board" ? (
                  <section className="report-chart report-chart-wide" aria-labelledby="department-chart-title">
                    <div className="report-section-head"><div><span className="mono">11</span><div><div className="eyebrow">Comparable units</div><h2 id="department-chart-title" className="display">Department attendance rate</h2></div></div><p>Each rate is measured against the department’s active headcount and the same expected weekdays.</p></div>
                    <div className="report-chart-frame is-departments" role="img" aria-label="Horizontal bar chart comparing attendance rate by department"><ResponsiveContainer width="100%" height="100%"><BarChart data={byDepartment} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} horizontal={false} /><XAxis type="number" domain={[0, 100]} stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} unit="%" /><YAxis type="category" dataKey="code" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={10} width={58} tickLine={false} axisLine={false} /><Tooltip content={<ReportTooltip />} cursor={{ fill: "color-mix(in srgb, var(--rule) 24%, transparent)" }} /><Bar dataKey="rate" name="Attendance rate" isAnimationActive={!reducedMotion} animationDuration={440}>{byDepartment.map((department) => <Cell key={department.code} fill={department.rate >= 85 ? "var(--bureau)" : department.rate >= 65 ? "var(--review)" : "var(--refusal)"} />)}</Bar></BarChart></ResponsiveContainer></div>
                  </section>
                ) : null}
              </div>
            )}

            <section className="report-roster" aria-labelledby="report-roster-title">
              <div className="report-section-head"><div><span className="mono">12</span><div><div className="eyebrow">Person-level register</div><h2 id="report-roster-title" className="display">Every person in scope</h2></div></div><p>Sorted by attendance rate. A low rate is a prompt for context, not a finding of misconduct.</p></div>
              <div className="scroll-x"><table className="tbl"><thead><tr><th>Name</th><th>Staff no.</th><th>Dept</th><th>Days</th><th>Rate</th><th>Late</th><th>Early</th><th>Hours</th></tr></thead><tbody>{perPerson.map((person) => <tr key={person.id}><td>{person.name}</td><td className="mono">{person.staffId || "—"}</td><td className="mono">{person.department}</td><td className="mono">{person.attended}/{expectedDays}</td><td><Pill tone={person.rate >= 85 ? "clear" : person.rate >= 65 ? "hold" : "deny"}>{person.rate}%</Pill></td><td className="mono">{person.late || "—"}</td><td className="mono">{person.early || "—"}</td><td className="mono">{person.hours}h</td></tr>)}</tbody></table></div>
            </section>

            <footer className="report-method mono"><span>METHODOLOGY</span><p>Expected days are Mondays to Fridays in the selected range. Public holidays are not deducted. Hours require a completed sign-out. Generated interpretation is advisory and must be checked against the register before a personnel decision.</p></footer>
          </div>
        )}
      </section>
    </Shell>
  );
}
