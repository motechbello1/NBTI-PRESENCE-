import { useEffect, useMemo, useState } from "react";
import { Shell, Spinner, Empty, Pill, Notice } from "../../components/UI";
import {
  decideReportAccess,
  generateAttendanceBrief,
  getReportCapabilities,
  getReportEvidence,
  requestReportAccess,
  revokeReportAccess,
} from "../../lib/intelligence";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";

const DAY = 86400000;
const iso = (date) => date.toISOString().slice(0, 10);
const today = iso(new Date());

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
  return <div className="report-tooltip"><span className="mono">{label}</span>{payload.map((item) => <strong key={item.dataKey} style={{ color: item.color || item.stroke || item.fill }}>{item.name}: {item.value}</strong>)}</div>;
}

function ReportMeasure({ index, label, value, note, tone }) {
  return <div className={`report-measure${tone ? ` is-${tone}` : ""}`}><dt><span className="mono">{index}</span>{label}</dt><dd className="display">{value}</dd><small className="mono">{note}</small></div>;
}

function IntelligenceMark() {
  return <svg className="intelligence-mark" viewBox="0 0 88 88" aria-hidden="true"><path d="M44 3v18M44 67v18M3 44h18M67 44h18" /><circle cx="44" cy="44" r="28" /><circle cx="44" cy="44" r="17" /><path d="M36 44h16M44 36v16" /></svg>;
}

function briefAsText(brief, scopeName, from, to) {
  return [brief.title, `${scopeName} | ${from} to ${to}`, "", brief.executiveSummary, "", "FINDINGS",
    ...brief.findings.flatMap((item, index) => [`${index + 1}. ${item.heading}`, item.detail, `Evidence: ${item.evidence}`, ""]),
    "WATCH ITEMS", ...(brief.watchItems.length ? brief.watchItems.flatMap((item) => [`${item.heading}: ${item.detail}`, ""]) : ["No additional watch items were identified.", ""]),
    "RECOMMENDED FOLLOW-UP", ...brief.recommendations.flatMap((item, index) => [`${index + 1}. ${item.action}`, item.reason, ""]),
    "NOTE", brief.closingNote].join("\n");
}

export default function Reports() {
  const reducedMotion = useReducedMotion();
  const [capabilities, setCapabilities] = useState(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * DAY)));
  const [to, setTo] = useState(today);
  const [scope, setScope] = useState("board");
  const [departmentId, setDepartmentId] = useState("");
  const [userId, setUserId] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [brief, setBrief] = useState(null);
  const [briefMeta, setBriefMeta] = useState(null);
  const [briefError, setBriefError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadCapabilities = async () => {
    try {
      const result = await getReportCapabilities();
      setCapabilities(result);
      setCapabilityError("");
      if (result.access.kind === "department") {
        setScope("department");
        setDepartmentId(result.access.departmentId || "");
      }
    } catch (error) {
      setCapabilityError(error.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadCapabilities(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const access = capabilities?.access;
  const departments = capabilities?.departments || [];
  const staff = capabilities?.staff || [];
  const scopeReady = scope === "board" || (scope === "department" ? Boolean(departmentId) : Boolean(userId));

  useEffect(() => {
    if (!access?.allowed || !scopeReady) return undefined;
    let current = true;
    setLoading(true);
    setLoadError("");
    getReportEvidence({ from, to, scope, departmentId, userId })
      .then((result) => { if (current) setEvidence(result.evidence); })
      .catch((error) => { if (current) { setEvidence(null); setLoadError(error.message); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [access?.allowed, from, to, scope, departmentId, userId, scopeReady]);

  useEffect(() => {
    setBrief(null); setBriefMeta(null); setBriefError(""); setCopied(false);
  }, [from, to, scope, departmentId, userId]);

  if (loading && !capabilities) return <Shell><div className="reports-loading"><Spinner label="Reading reporting authority" /></div></Shell>;
  if (capabilityError) return <Shell><div className="report-error" role="alert">{capabilityError}</div></Shell>;
  if (access && !access.allowed) return <Shell><ReportLocked capabilities={capabilities} onRequested={loadCapabilities} /></Shell>;

  const summary = evidence?.summary || {};
  const daily = (evidence?.daily || []).map((day) => ({ ...day, label: new Date(`${day.date}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) }));
  const arrivals = evidence?.arrivals || [];
  const byDepartment = evidence?.departments || [];
  const perPerson = evidence?.people || [];
  const scopeName = evidence?.scope?.label || (scope === "board" ? "The Board as a whole" : access?.departmentName || "Selected scope");

  const instrumentReading = useMemo(() => {
    if (!evidence) return "";
    const parts = [
      `${summary.headcount} active ${summary.headcount === 1 ? "person" : "people"} across ${summary.expectedWorkingDays} expected weekdays produced ${summary.attendedDays} recorded attendance ${summary.attendedDays === 1 ? "day" : "days"}.`,
      `The measured attendance rate is ${summary.attendanceRatePercent}%, with ${summary.punctualityPercent}% of recorded arrivals inside the grace period.`,
      `${summary.lateDays} late arrivals and ${summary.earlyDepartures} early departures require context before they are treated as exceptions.`,
    ];
    if (summary.incompleteSignOuts) parts.push(`${summary.incompleteSignOuts} incomplete sign-outs leave their working hours uncounted.`);
    if (summary.manualEntries) parts.push(`${summary.manualEntries} entries were placed manually and remain identifiable in the audit trail.`);
    return parts.join(" ");
  }, [evidence, summary]);

  async function createBrief() {
    setGenerating(true); setBriefError(""); setCopied(false);
    try {
      const result = await generateAttendanceBrief({ from, to, scope, departmentId, userId });
      setBrief(result.report); setBriefMeta({ model: result.model, generatedAt: result.generatedAt });
    } catch (error) { setBriefError(error.message); }
    finally { setGenerating(false); }
  }

  function exportCsv() {
    const heading = ["Name", "Staff number", "Department", "Days attended", "Expected days", "Attendance rate %", "Late", "Excused", "Early departures", "Total hours"];
    const body = perPerson.map((person) => [person.name, person.staffNumber || "", person.departmentCode, person.attendedDays, person.expectedDays, person.attendanceRatePercent, person.lateDays, person.excusedDays, person.earlyDepartures, person.totalHours].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([[heading.join(","), ...body].join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `nbti-attendance-${from}-to-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  async function copyBrief() {
    if (!brief) return;
    await navigator.clipboard.writeText(briefAsText(brief, scopeName, from, to)); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }
  function downloadBrief() {
    if (!brief) return;
    const url = URL.createObjectURL(new Blob([briefAsText(brief, scopeName, from, to)], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `nbti-management-brief-${from}-to-${to}.txt`; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      <section className="reports-page" aria-labelledby="reports-title">
        <header className="reports-head">
          <div className="reports-title-block"><div className="mono reports-reference">REPORT SERIES A-04 · ATTENDANCE EVIDENCE</div><div className="eyebrow">{access?.kind === "board" ? "Board performance register" : `${access?.departmentName} register`}</div><h1 id="reports-title" className="display">Attendance, without guesswork.</h1><p>Read the permitted pattern at agency, department or individual level. Charts are calculated from the protected register; the intelligence brief is written from the same evidence.</p></div>
          <div className="reports-head-actions reports-no-print"><button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={!perPerson.length}>Export register</button><button type="button" className="btn btn-ghost" onClick={() => window.print()}>Print report</button></div>
        </header>

        <div className="report-authority-line"><span className="mono">REPORT AUTHORITY</span><strong>{access?.source === "delegation" ? "Director-approved appointment" : access?.kind === "board" ? "Board-wide authority" : "Department leadership authority"}</strong><small className="mono">{access?.kind === "board" ? "AGENCY SCOPE" : `${access?.departmentName?.toUpperCase()} ONLY`}</small></div>

        {access?.canApprove ? <ApprovalDesk requests={capabilities?.requests || []} onChanged={loadCapabilities} departmentName={access.departmentName} /> : null}

        <section className="report-query reports-no-print" aria-labelledby="report-parameters-title">
          <div className="report-query-index"><span className="mono">01</span><div><h2 id="report-parameters-title">Set the evidence window</h2><p>All figures recalculate together.</p></div></div>
          <div className="report-query-fields">
            <label><span className="label">From</span><input type="date" className="field mono" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
            <label><span className="label">To</span><input type="date" className="field mono" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></label>
            <label><span className="label">Scope</span><select className="field" value={scope} onChange={(event) => { setScope(event.target.value); setUserId(""); if (event.target.value === "department" && access?.kind === "department") setDepartmentId(access.departmentId); }}>
              {access?.kind === "board" ? <option value="board">Whole Board</option> : null}<option value="department">One department</option><option value="individual">One person</option>
            </select></label>
            <label><span className="label">{scope === "department" ? "Department" : scope === "individual" ? "Member of staff" : "Register"}</span>
              {scope === "department" ? <select className="field" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} disabled={access?.kind === "department"}><option value="">Choose department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                : scope === "individual" ? <select className="field" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Choose member of staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select>
                  : <div className="report-query-fixed mono">ALL ACTIVE STAFF</div>}
            </label>
          </div>
        </section>

        {loadError ? <div className="report-error" role="alert">{loadError}</div> : null}
        {loading ? <div className="reports-loading"><Spinner label="Reading attendance evidence" /></div> : !scopeReady ? <Empty title={scope === "department" ? "Choose a department" : "Choose a member of staff"}>The report will open once its scope is defined.</Empty> : evidence ? (
          <div className="reports-body">
            <div className="report-period-line mono"><span>{scopeName.toUpperCase()}</span><span>{from} / {to}</span><span>{summary.expectedWorkingDays} EXPECTED WEEKDAYS</span></div>
            <dl className="report-measures" aria-label="Attendance report summary">
              <ReportMeasure index="02" label="Attendance" value={`${summary.attendanceRatePercent}%`} note={`${summary.attendedDays} OF ${summary.expectedAttendanceDays} DAYS`} tone={summary.attendanceRatePercent >= 85 ? "clear" : summary.attendanceRatePercent >= 65 ? "hold" : "deny"} />
              <ReportMeasure index="03" label="Punctuality" value={`${summary.punctualityPercent}%`} note={`${summary.lateDays} LATE ARRIVALS`} tone={summary.punctualityPercent >= 85 ? "clear" : "hold"} />
              <ReportMeasure index="04" label="Approved away" value={summary.excusedDays} note="EXCUSED DAYS" />
              <ReportMeasure index="05" label="Hours logged" value={summary.totalHours?.toLocaleString()} note={`${summary.averageHoursPerAttendedDay} AVG / ATTENDED DAY`} />
              <ReportMeasure index="06" label="Incomplete" value={summary.incompleteSignOuts} note="MISSING SIGN-OUT" tone={summary.incompleteSignOuts ? "deny" : "clear"} />
            </dl>

            <section className="report-intelligence" aria-labelledby="intelligence-brief-title">
              <aside className="report-intelligence-identity"><IntelligenceMark /><div className="mono">PRESENCE<br />INTELLIGENCE</div><small className="mono">PERMISSION-SCOPED MODEL</small></aside>
              <div className="report-intelligence-content">
                {!brief ? <div className="report-intelligence-prompt"><div className="eyebrow">Management brief</div><h2 id="intelligence-brief-title" className="display">Ask the register to explain itself.</h2><p>The model receives aggregates for this scope, never face descriptors, incident photographs or hidden records. It separates evidence from recommended follow-up and retains the report’s limitations.</p><button type="button" className="btn btn-primary" onClick={createBrief} disabled={generating || !summary.headcount}>{generating ? "Drafting from evidence" : "Generate intelligence brief"}</button>{briefError ? <div className="report-ai-error" role="alert">{briefError}<small>ICT must deploy the supplied Edge Function and configure the AI Gateway secret.</small></div> : null}</div>
                  : <article className="generated-brief"><div className="generated-brief-head"><div><div className="eyebrow">Model-generated management brief</div><h2 id="intelligence-brief-title" className="display">{brief.title}</h2></div><div className="generated-brief-actions reports-no-print"><button type="button" onClick={copyBrief}>{copied ? "Copied" : "Copy"}</button><button type="button" onClick={downloadBrief}>Download</button><button type="button" onClick={createBrief} disabled={generating}>{generating ? "Redrafting" : "Redraft"}</button></div></div><p className="generated-brief-summary">{brief.executiveSummary}</p><div className="generated-findings">{brief.findings.map((finding, index) => <section key={`${finding.heading}-${index}`}><span className="mono">F-{String(index + 1).padStart(2, "0")}</span><div><h3>{finding.heading}</h3><p>{finding.detail}</p><small className="mono">EVIDENCE · {finding.evidence}</small></div></section>)}</div><div className="generated-brief-grid"><section><div className="eyebrow">Watch items</div>{brief.watchItems.length ? brief.watchItems.map((item) => <div className="generated-note" key={item.heading}><h3>{item.heading}</h3><p>{item.detail}</p></div>) : <p className="generated-none">No additional watch items were identified.</p>}</section><section><div className="eyebrow">Recommended follow-up</div>{brief.recommendations.map((item, index) => <div className="generated-action" key={item.action}><span className="mono">{String(index + 1).padStart(2, "0")}</span><div><h3>{item.action}</h3><p>{item.reason}</p></div></div>)}</section></div><footer className="generated-brief-foot"><p>{brief.closingNote}</p><span className="mono">{briefMeta?.model} · {briefMeta?.generatedAt ? new Date(briefMeta.generatedAt).toLocaleString("en-GB") : ""} · VERIFY AGAINST REGISTER</span></footer></article>}
              </div>
            </section>

            <section className="instrument-reading" aria-labelledby="instrument-reading-title"><span className="mono">07 / REGISTER READING</span><div><h2 id="instrument-reading-title" className="display">What the measured record says</h2><p>{instrumentReading}</p></div></section>

            {!summary.attendedDays ? <Empty title="No attendance in this range">The authorised cohort is valid, but no attendance action was recorded inside this date window.</Empty> : <div className="report-visuals">
              <ReportChart index="08" eyebrow="Daily register shape" title="Arrivals across the period" note="On-time and late entries share one column because both are recorded attendance." wide>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} vertical={false} /><XAxis dataKey="label" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} minTickGap={20} /><YAxis stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip content={<ReportTooltip />} /><Bar dataKey="onTime" stackId="attendance" fill="var(--bureau)" name="On time" isAnimationActive={!reducedMotion} animationDuration={440} /><Bar dataKey="late" stackId="attendance" fill="var(--review)" name="Late" isAnimationActive={!reducedMotion} animationDuration={440} /><Bar dataKey="excused" stackId="attendance" fill="var(--rule)" name="Excused" isAnimationActive={!reducedMotion} animationDuration={440} /></BarChart></ResponsiveContainer>
              </ReportChart>
              <ReportChart index="09" eyebrow="Arrival distribution" title="When sign-ins occur" note="Each bar is an hour in West Africa Time. Amber begins at 09:00 as a visual review cue.">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={arrivals} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} vertical={false} /><XAxis dataKey="hour" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} /><YAxis stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip content={<ReportTooltip />} /><Bar dataKey="count" name="Sign-ins" isAnimationActive={!reducedMotion} animationDuration={440}>{arrivals.map((arrival) => <Cell key={arrival.hour} fill={Number(arrival.hour.slice(0, 2)) >= 9 ? "var(--review)" : "var(--bureau)"} />)}</Bar></BarChart></ResponsiveContainer>
              </ReportChart>
              <ReportChart index="10" eyebrow="Recorded duration" title="Hours completed" note="Daily total across the selected scope. An unfinished sign-out contributes no completed hours.">
                <ResponsiveContainer width="100%" height="100%"><LineChart data={daily} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} vertical={false} /><XAxis dataKey="label" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} minTickGap={24} /><YAxis stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} /><Tooltip content={<ReportTooltip />} /><Line type="monotone" dataKey="hours" stroke="var(--bureau)" strokeWidth={2} dot={false} name="Hours" isAnimationActive={!reducedMotion} animationDuration={440} /></LineChart></ResponsiveContainer>
              </ReportChart>
              {scope === "board" ? <ReportChart index="11" eyebrow="Comparable units" title="Department attendance rate" note="Each rate uses active headcount and the same expected weekdays." wide departments>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={byDepartment} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 0 }}><CartesianGrid stroke="var(--rule)" strokeOpacity={0.45} horizontal={false} /><XAxis type="number" domain={[0, 100]} stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={9} tickLine={false} axisLine={false} unit="%" /><YAxis type="category" dataKey="code" stroke="var(--muted)" fontFamily="IBM Plex Mono" fontSize={10} width={58} tickLine={false} axisLine={false} /><Tooltip content={<ReportTooltip />} /><Bar dataKey="attendanceRatePercent" name="Attendance rate" isAnimationActive={!reducedMotion} animationDuration={440}>{byDepartment.map((department) => <Cell key={department.code} fill={department.attendanceRatePercent >= 85 ? "var(--bureau)" : department.attendanceRatePercent >= 65 ? "var(--review)" : "var(--refusal)"} />)}</Bar></BarChart></ResponsiveContainer>
              </ReportChart> : null}
            </div>}

            <section className="report-roster" aria-labelledby="report-roster-title"><div className="report-section-head"><div><span className="mono">12</span><div><div className="eyebrow">Person-level register</div><h2 id="report-roster-title" className="display">Every person in scope</h2></div></div><p>Sorted by attendance rate. A low rate is a prompt for context, not a finding of misconduct.</p></div><div className="scroll-x"><table className="tbl"><thead><tr><th>Name</th><th>Staff no.</th><th>Dept</th><th>Days</th><th>Rate</th><th>Late</th><th>Excused</th><th>Hours</th></tr></thead><tbody>{perPerson.map((person) => <tr key={person.id}><td>{person.name}</td><td className="mono">{person.staffNumber || "—"}</td><td className="mono">{person.departmentCode}</td><td className="mono">{person.attendedDays}/{person.expectedDays}</td><td><Pill tone={person.attendanceRatePercent >= 85 ? "clear" : person.attendanceRatePercent >= 65 ? "hold" : "deny"}>{person.attendanceRatePercent}%</Pill></td><td className="mono">{person.lateDays || "—"}</td><td className="mono">{person.excusedDays || "—"}</td><td className="mono">{person.totalHours}h</td></tr>)}</tbody></table></div></section>
            <footer className="report-method mono"><span>METHODOLOGY</span><p>Expected days are Mondays to Fridays in the selected range. Public holidays are not deducted. Hours require a completed sign-out. Generated interpretation is advisory and must be checked against the register before a personnel decision.</p></footer>
          </div>
        ) : null}
      </section>
    </Shell>
  );
}

function ReportChart({ index, eyebrow, title, note, wide = false, departments = false, children }) {
  return <section className={`report-chart${wide ? " report-chart-wide" : ""}`}><div className="report-section-head"><div><span className="mono">{index}</span><div><div className="eyebrow">{eyebrow}</div><h2 className="display">{title}</h2></div></div>{note ? <p>{note}</p> : null}</div><div className={`report-chart-frame${wide ? "" : " is-compact"}${departments ? " is-departments" : ""}`} role="img" aria-label={`${title} chart`}>{children}</div></section>;
}

function ReportLocked({ capabilities, onRequested }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const existing = capabilities?.requests?.find((item) => item.user_id === capabilities.profile.id && item.status === "requested");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const result = await requestReportAccess(note); setMessage({ tone: "clear", text: result.message }); setNote(""); await onRequested(); }
    catch (error) { setMessage({ tone: "deny", text: error.message }); }
    finally { setBusy(false); }
  }
  return <section className="report-locked" aria-labelledby="report-locked-title"><header><span className="mono">REPORT SERIES A-04 · CONTROLLED FUNCTION</span><div className="report-lock-mark" aria-hidden="true"><i /><i /><i /></div></header><div className="report-locked-body"><div><div className="eyebrow">Visible to every member of staff</div><h1 id="report-locked-title" className="display">Report generation requires an appointment.</h1><p>You can see this function because reporting may be assigned to any member of staff. Until your director, HOD or an administrator approves you, no department attendance is opened and the controls remain locked.</p><ol><li><span className="mono">01</span><strong>State the work reason</strong></li><li><span className="mono">02</span><strong>Your department head reviews it</strong></li><li><span className="mono">03</span><strong>Approval opens only your department</strong></li><li><span className="mono">04</span><strong>Access expires and can be withdrawn</strong></li></ol></div><aside><span className="mono">CURRENT AUTHORITY</span><strong>{existing ? "Decision pending" : "Not appointed"}</strong><small>{capabilities?.access?.departmentName || "Department not assigned"}</small>{message ? <Notice tone={message.tone}>{message.text}</Notice> : null}{existing ? <p className="report-request-pending">Your request is already with the authorised reviewers. You will receive a notification when they decide.</p> : <form onSubmit={submit}><label className="label" htmlFor="report-request-note">Why do you need to generate reports?</label><textarea id="report-request-note" className="field" rows="5" minLength="12" required value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: I prepare the department’s monthly attendance return" /><button className="btn btn-primary" disabled={busy || note.trim().length < 12}>{busy ? "Sending request" : "Request report access"}</button></form>}</aside></div><footer className="mono">YOUR OWN ATTENDANCE REMAINS IN MY RECORD · REPORT ACCESS DOES NOT GRANT ADMINISTRATOR POWERS</footer></section>;
}

function ApprovalDesk({ requests, onChanged, departmentName }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState(iso(new Date(Date.now() + 90 * DAY)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const pending = requests.filter((item) => item.status === "requested");
  const active = requests.filter((item) => item.status === "approved" && (!item.expires_at || new Date(item.expires_at) > new Date()));
  const selected = requests.find((item) => item.id === selectedId);
  async function decide(decision) {
    setBusy(true); setMessage(null);
    try { const result = await decideReportAccess({ authorityId: selected.id, decision, decisionNote: note, expiresAt: decision === "approved" ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined }); setMessage({ tone: "clear", text: result.message }); setSelectedId(null); setNote(""); await onChanged(); }
    catch (error) { setMessage({ tone: "deny", text: error.message }); }
    finally { setBusy(false); }
  }
  async function revoke(id) {
    setBusy(true); setMessage(null);
    try { const result = await revokeReportAccess(id); setMessage({ tone: "clear", text: result.message }); await onChanged(); }
    catch (error) { setMessage({ tone: "deny", text: error.message }); }
    finally { setBusy(false); }
  }
  return <section className={`report-approvals reports-no-print${open ? " is-open" : ""}`}><button type="button" className="report-approvals-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span><small className="mono">REPORT APPOINTMENTS</small><strong>{departmentName ? `${departmentName} authority` : "Board authority"}</strong></span><span className="mono">{pending.length} PENDING · {active.length} ACTIVE</span></button>{open ? <div className="report-approvals-body">{message ? <Notice tone={message.tone}>{message.text}</Notice> : null}<div><span className="eyebrow">Awaiting your decision</span>{pending.length ? pending.map((item) => { const person = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return <button type="button" className={selectedId === item.id ? "is-selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setNote(""); }}><span><strong>{person?.full_name}</strong><small className="mono">{person?.staff_id || "NO STAFF NUMBER"}</small></span><p>{item.request_note}</p><i aria-hidden="true">→</i></button>; }) : <p className="report-approval-empty">No report requests are waiting.</p>}</div><div><span className="eyebrow">Active appointments</span>{active.length ? active.map((item) => { const person = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return <div className="report-active-appointment" key={item.id}><span><strong>{person?.full_name}</strong><small className="mono">EXPIRES {item.expires_at ? new Date(item.expires_at).toLocaleDateString("en-GB") : "WHEN REVOKED"}</small></span><button type="button" onClick={() => revoke(item.id)} disabled={busy}>Withdraw</button></div>; }) : <p className="report-approval-empty">No delegated appointments are active.</p>}</div>{selected ? <form className="report-decision" onSubmit={(event) => event.preventDefault()}><span className="mono">DECISION RECORD</span><label className="label" htmlFor="report-decision-note">Reason for the decision</label><textarea id="report-decision-note" className="field" rows="3" minLength="6" value={note} onChange={(event) => setNote(event.target.value)} required /><label className="label" htmlFor="report-expiry">Approval expires</label><input id="report-expiry" type="date" className="field mono" value={expiresAt} min={iso(new Date(Date.now() + DAY))} max={iso(new Date(Date.now() + 366 * DAY))} onChange={(event) => setExpiresAt(event.target.value)} /><div><button type="button" className="btn btn-primary" disabled={busy || note.trim().length < 6} onClick={() => decide("approved")}>Approve appointment</button><button type="button" className="btn btn-ghost" disabled={busy || note.trim().length < 6} onClick={() => decide("refused")}>Refuse request</button></div></form> : null}</div> : null}</section>;
}
