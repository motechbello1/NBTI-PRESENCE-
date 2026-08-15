import { useEffect, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shell, Notice, Pill, StatusPill, Spinner, AuthorityBadge } from "../components/UI";
const VerifyFlow = lazy(() => import("../components/VerifyFlow"));
import { getTodayRecord, signIn, signOut } from "../lib/db";
import { decideAbsence, getReportCapabilities, requestAbsence } from "../lib/intelligence";
import { warmVerificationWhenIdle } from "../lib/verificationWarmup";

const timeOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function Today() {
  const { session, profile, settings, isAdmin } = useAuth();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(null);        // null | 'in' | 'out'
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [capabilities, setCapabilities] = useState(null);

  const load = () =>
    getTodayRecord(session.user.id)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  const loadCapabilities = () => getReportCapabilities().then(setCapabilities).catch(() => {});

  useEffect(() => {
    load();
    loadCapabilities();
    const cancelWarmup = warmVerificationWhenIdle();
    return cancelWarmup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const [wh, wm] = (settings?.work_start || "08:00").split(":").map(Number);
  const cutoff = new Date(now); cutoff.setHours(wh, wm + (settings?.grace_minutes || 0), 0, 0);
  const wouldBeLate = now > cutoff;

  const [eh, em] = (settings?.work_end || "16:00").split(":").map(Number);
  const endOfDay = new Date(now); endOfDay.setHours(eh, em, 0, 0);
  const wouldBeEarly = now < endOfDay;

  async function onVerified(payload) {
    setError(null);
    try {
      const row = mode === "in"
        ? await signIn(session.user.id, { ...payload, reason }, settings)
        : await signOut(session.user.id, { ...payload, reason }, settings);
      setRecord(row);
      setSaved(mode);
      setMode(null);
      setReason("");
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }

  if (loading) return <Shell><Spinner label="Loading today" /></Shell>;

  if (!profile?.face_enrolled) {
    return (
      <Shell>
        <section className="today-enrolment" aria-labelledby="enrolment-needed-title">
          <div className="mono today-reference">ATTENDANCE HOLD · ENROLMENT REQUIRED</div>
          <div className="eyebrow">One setup step remains</div>
          <h1 id="enrolment-needed-title" className="display">Create your face record before attendance begins.</h1>
          <p>
            The system cannot confirm identity until your account contains an enrolment.
            Four guided positions are captured as measurements; routine attendance video is not stored.
          </p>
          <div className="today-enrolment-actions">
            <Link to="/profile" className="btn btn-primary">Start face enrolment</Link>
            <span className="mono">Usually under one minute</span>
          </div>
        </section>
        <AbsenceDesk capabilities={capabilities} onChanged={loadCapabilities} />
        <ReportAccessCard access={capabilities?.access} />
      </Shell>
    );
  }

  const pageTitle = record?.sign_out_at ? "Today’s attendance is complete" : record?.sign_in_at ? "You are signed in" : "Sign in for attendance";
  const pageState = record?.sign_out_at ? "Closed" : record?.sign_in_at ? "On site" : "Action required";
  const actionTitle = record?.sign_out_at ? "Today’s register is complete" : record?.sign_in_at ? "Sign out before you leave" : "Sign in to start your workday";

  return (
    <Shell>
      <section className="today-page">
        <header className="today-head">
          <div>
            <div className="eyebrow">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            <h1 className="display">{pageTitle}</h1>
          </div>
          <div className="today-head-actions">
            <AuthorityBadge profile={profile} />
            <span className={`today-state ${record?.sign_in_at ? "is-clear" : "is-hold"}`}><i aria-hidden="true" />{pageState}</span>
            <Link to="/history" className="btn btn-ghost">My attendance records</Link>
            {isAdmin ? <Link to="/admin" className="btn btn-ghost">Administration</Link> : null}
          </div>
        </header>

        {!mode ? (
          <section className={`today-quick-action${record?.sign_out_at ? " is-complete" : ""}`} aria-label="Today's attendance action">
            <div>
              <span className="mono">TODAY’S ATTENDANCE</span>
              <strong>{!record?.sign_in_at ? "You have not signed in" : !record?.sign_out_at ? `Signed in at ${timeOf(record.sign_in_at)}` : `${timeOf(record.sign_in_at)} to ${timeOf(record.sign_out_at)}`}</strong>
              <small>{!record?.sign_in_at ? "Use the button to open the camera and record your arrival." : !record?.sign_out_at ? "Your arrival is saved. Sign out before leaving." : `${record.hours_worked || 0} hours recorded today.`}</small>
            </div>
            {!record?.sign_in_at ? (
              <button type="button" className="btn btn-primary" onClick={() => setMode("in")}>Sign in attendance</button>
            ) : !record?.sign_out_at ? (
              <button type="button" className="btn btn-primary" onClick={() => setMode("out")}>Sign out attendance</button>
            ) : (
              <Link to="/history" className="btn btn-ghost">Open attendance sheet</Link>
            )}
          </section>
        ) : null}

        <div className="today-layout">
          <aside className="today-record" aria-label="Staff credential and today's record">
            <div className="today-credential notched">
              <div className="today-credential-top">
                <span className="mono">STAFF CREDENTIAL</span>
                <span className="mono">P-03</span>
              </div>
              <div className="today-credential-name display">{profile.full_name}</div>
              <div className="today-credential-id mono">{profile.staff_id || "No staff number"}</div>

              <dl className="today-credential-details">
                <Row k="Department" v={profile.departments?.name || "Unassigned"} />
                <Row k="Grade" v={profile.grade_level || "—"} />
              </dl>

              <div className="today-machine-readings">
                <div><span className="mono">SIGN IN</span><strong className="mono">{timeOf(record?.sign_in_at)}</strong></div>
                <div><span className="mono">SIGN OUT</span><strong className="mono">{timeOf(record?.sign_out_at)}</strong></div>
                <div><span className="mono">HOURS</span><strong className="mono">{record?.hours_worked ? `${record.hours_worked}h` : "—"}</strong></div>
              </div>

              <div className="today-credential-status">
                <StatusPill status={record?.status} />
                {record?.early_departure ? <Pill tone="hold">Left early</Pill> : null}
                {record?.marked_by ? <Pill tone="mute">Marked by admin</Pill> : null}
              </div>
            </div>

            <div className="today-office-register">
              <div className="eyebrow">Official work period</div>
              <dl>
                <Row k="Start" v={`${settings.work_start} (+${settings.grace_minutes}m)`} />
                <Row k="End" v={settings.work_end} />
                <Row k="Minimum" v={`${settings.min_hours} hours`} />
              </dl>
            </div>
          </aside>

          <section className="today-action" aria-labelledby="today-action-title">
          {saved && (
            <Notice tone="clear" title={saved === "in" ? "Signed in" : "Signed out"}>
              {saved === "in"
                ? `Recorded at ${timeOf(record?.sign_in_at)}. Sign out before you leave so your hours are counted.`
                : `Recorded at ${timeOf(record?.sign_out_at)}. That is ${record?.hours_worked}h on site today.`}
            </Notice>
          )}

          {error && <Notice tone="deny" title="Could not save">{error}</Notice>}

          {mode ? (
            <div className="today-verification">
              {mode === "in" && wouldBeLate && (
                <div className="today-reason">
                  <label className="label" htmlFor="late-reason">You are past {settings.work_start}. Reason for lateness</label>
                  <textarea id="late-reason" className="field" rows={2} value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Traffic on Airport Road, hospital appointment, official assignment" />
                </div>
              )}
              {mode === "out" && wouldBeEarly && (
                <div className="today-reason">
                  <label className="label" htmlFor="early-reason">You are leaving before {settings.work_end}. Reason</label>
                  <textarea id="early-reason" className="field" rows={2} value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Approved permission, official duty off site, medical" />
                </div>
              )}
              <Suspense fallback={<div className="today-engine-loading"><Spinner label="Loading the verification engine" /></div>}>
                <VerifyFlow mode={mode} onVerified={onVerified} onCancel={() => { setMode(null); setReason(""); }} />
              </Suspense>
            </div>
          ) : (
            <div className="today-action-sheet">
              <div className="mono today-action-reference">ATTENDANCE ACTION · FORM P-03</div>
              <div className="eyebrow">Today’s required action</div>
              <h2 id="today-action-title" className="display">{actionTitle}</h2>
              <p>
                {!record?.sign_in_at
                  ? "Allow about fifteen seconds. Face a light source, hold your own device and keep everyone else outside the frame."
                  : !record?.sign_out_at
                    ? `Your arrival was recorded at ${timeOf(record.sign_in_at)}. Complete the same four checks before leaving.`
                    : `Arrival ${timeOf(record.sign_in_at)} · departure ${timeOf(record.sign_out_at)} · ${record.hours_worked}h recorded on site.`}
              </p>

              {!record?.sign_out_at ? (
                <ol className="today-gate-preview" aria-label="Checks required before attendance is recorded">
                  {["Location", "Liveness", "Surroundings", "Identity"].map((gate, index) => (
                    <li key={gate}><span className="mono">{String(index + 1).padStart(2, "0")}</span><strong>{gate}</strong><small>Will check</small></li>
                  ))}
                </ol>
              ) : null}

              <div className="today-action-footer">
                {!record?.sign_in_at ? (
                  <button className="btn btn-primary" onClick={() => setMode("in")}>Sign in attendance</button>
                ) : !record?.sign_out_at ? (
                  <button className="btn btn-primary" onClick={() => setMode("out")}>Sign out attendance</button>
                ) : (
                  <Link to="/history" className="btn btn-ghost">Open attendance sheet</Link>
                )}
                <span className="mono">Camera opens only during verification</span>
              </div>
            </div>
          )}
          </section>
        </div>

        <AbsenceDesk capabilities={capabilities} onChanged={loadCapabilities} />
        <ReportAccessCard access={capabilities?.access} />
      </section>
    </Shell>
  );
}

function ReportAccessCard({ access }) {
  return <section className={`today-report-access${access?.allowed ? " is-open" : " is-locked"}`} aria-labelledby="today-report-access-title"><div className="mono today-report-access-index">REPORT FUNCTION · A-04</div><div><span className="eyebrow">Department intelligence</span><h2 id="today-report-access-title" className="display">{access?.allowed ? "Your report desk is open." : "Report generation is visible, but locked."}</h2><p>{access?.allowed ? `Your ${access.kind === "board" ? "Board-wide" : "department"} authority lets you generate evidence reports, charts and AI management briefs.` : "A director, HOD or administrator must approve an appointment before department attendance can be opened."}</p></div><div className="today-report-access-actions"><Link to="/reports" className="btn btn-ghost">{access?.allowed ? "Open reports" : "Request access"}</Link><button type="button" className="btn btn-primary" disabled={!access?.allowed} onClick={() => window.location.assign("/reports")}>Generate report</button></div></section>;
}

function AbsenceDesk({ capabilities, onChanged }) {
  const access = capabilities?.access;
  const requests = capabilities?.absenceRequests || [];
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [category, setCategory] = useState("official_assignment");
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const pending = requests.filter((item) => item.status === "pending");
  const latest = requests[0];
  const selected = requests.find((item) => item.id === selectedId);

  if (!capabilities) return null;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const result = await requestAbsence({ from, to, category, reason }); setMessage({ tone: "clear", text: result.message }); setReason(""); await onChanged(); }
    catch (requestError) { setMessage({ tone: "deny", text: requestError.message }); }
    finally { setBusy(false); }
  }
  async function decide(decision) {
    setBusy(true); setMessage(null);
    try { const result = await decideAbsence({ absenceId: selected.id, decision, decisionNote }); setMessage({ tone: "clear", text: result.message }); setSelectedId(null); setDecisionNote(""); await onChanged(); }
    catch (requestError) { setMessage({ tone: "deny", text: requestError.message }); }
    finally { setBusy(false); }
  }

  return <section className={`today-absence-desk${open ? " is-open" : ""}`} aria-labelledby="today-absence-title">
    <button type="button" className="today-absence-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="mono">PERMISSION TO BE ABSENT · A-03</span><div><h2 id="today-absence-title" className="display">{access?.canApprove ? `${pending.length} requests need a decision.` : latest?.status === "pending" ? "Your request is awaiting a decision." : "Notify your department before you are away."}</h2><p>{access?.canApprove ? "Approve only requests within your authority. A decision writes the excused weekdays into the attendance register." : "Send the dates and reason to your director, HOD and administrators. Their decision will appear in Notifications."}</p></div><strong className="mono">{open ? "CLOSE" : access?.canApprove ? "REVIEW" : "OPEN FORM"}</strong>
    </button>
    {open ? <div className="today-absence-body">{message ? <Notice tone={message.tone}>{message.text}</Notice> : null}{access?.canApprove ? <div className="absence-review-grid"><div><span className="eyebrow">Pending department requests</span>{pending.length ? pending.map((item) => { const person = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return <button type="button" key={item.id} className={selectedId === item.id ? "is-selected" : ""} onClick={() => { setSelectedId(item.id); setDecisionNote(""); }}><span><strong>{person?.full_name}</strong><small className="mono">{person?.staff_id || "NO STAFF NUMBER"}</small></span><b className="mono">{item.from_date} / {item.to_date}</b><p>{item.reason}</p></button>; }) : <p className="absence-empty">No absence requests are waiting.</p>}</div>{selected ? <form onSubmit={(event) => event.preventDefault()}><span className="mono">DECISION RECORD</span><strong>{(Array.isArray(selected.profiles) ? selected.profiles[0] : selected.profiles)?.full_name}</strong><p>{selected.from_date} to {selected.to_date} · {selected.reason_category.replace(/_/g, " ")}</p><label className="label" htmlFor="absence-decision-note">Reason for the decision</label><textarea id="absence-decision-note" className="field" rows="4" minLength="6" required value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /><div><button type="button" className="btn btn-primary" onClick={() => decide("approved")} disabled={busy || decisionNote.trim().length < 6}>Approve absence</button><button type="button" className="btn btn-ghost" onClick={() => decide("refused")} disabled={busy || decisionNote.trim().length < 6}>Refuse request</button></div></form> : <aside><strong className="display">Select a request to decide it.</strong><p>Attendance with an actual sign-in is never overwritten by absence approval.</p></aside>}</div> : <div className="absence-request-grid"><div><span className="eyebrow">Your recent request</span>{latest ? <div className="absence-latest"><Pill tone={latest.status === "approved" ? "clear" : latest.status === "refused" ? "deny" : "hold"}>{latest.status}</Pill><strong className="mono">{latest.from_date} / {latest.to_date}</strong><p>{latest.decision_note || latest.reason}</p></div> : <p className="absence-empty">You have not submitted an absence request.</p>}</div><form onSubmit={submit}><div><label className="label" htmlFor="absence-from">From</label><input id="absence-from" type="date" className="field mono" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></div><div><label className="label" htmlFor="absence-to">To</label><input id="absence-to" type="date" className="field mono" min={from} value={to} onChange={(event) => setTo(event.target.value)} /></div><label><span className="label">Reason category</span><select className="field" value={category} onChange={(event) => setCategory(event.target.value)}><option value="official_assignment">Official assignment</option><option value="medical">Medical</option><option value="family">Family</option><option value="other">Other</option></select></label><label className="is-wide"><span className="label">Explain the request</span><textarea className="field" rows="4" minLength="12" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Give enough information for your director or HOD to make a decision" /></label><button className="btn btn-primary is-wide" disabled={busy || reason.trim().length < 12}>{busy ? "Sending request" : "Send absence request"}</button></form></div>}</div> : null}
  </section>;
}

function Row({ k, v }) {
  return (
    <div className="credential-row">
      <dt className="mono">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
