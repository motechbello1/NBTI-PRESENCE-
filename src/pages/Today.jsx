import { useEffect, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shell, Notice, Pill, StatusPill, Spinner } from "../components/UI";
const VerifyFlow = lazy(() => import("../components/VerifyFlow"));
import { getTodayRecord, signIn, signOut } from "../lib/db";

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

  const load = () =>
    getTodayRecord(session.user.id)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

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
      </Shell>
    );
  }

  const pageTitle = record?.sign_out_at ? "Attendance complete" : record?.sign_in_at ? "You are signed in" : "Attendance not recorded";
  const pageState = record?.sign_out_at ? "Closed" : record?.sign_in_at ? "On site" : "Action required";
  const actionTitle = record?.sign_out_at ? "Today’s register is complete" : record?.sign_in_at ? "Record your departure" : "Record your arrival";

  return (
    <Shell>
      <section className="today-page">
        <header className="today-head">
          <div>
            <div className="eyebrow">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            <h1 className="display">{pageTitle}</h1>
          </div>
          <div className="today-head-actions">
            <span className={`today-state ${record?.sign_in_at ? "is-clear" : "is-hold"}`}><i aria-hidden="true" />{pageState}</span>
            {isAdmin ? <Link to="/admin" className="btn btn-ghost">Administration</Link> : null}
          </div>
        </header>

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
                  <button className="btn btn-primary" onClick={() => setMode("in")}>Begin sign in</button>
                ) : !record?.sign_out_at ? (
                  <button className="btn btn-primary" onClick={() => setMode("out")}>Begin sign out</button>
                ) : (
                  <Link to="/history" className="btn btn-ghost">View attendance history</Link>
                )}
                <span className="mono">Camera opens only during verification</span>
              </div>
            </div>
          )}
          </section>
        </div>
      </section>
    </Shell>
  );
}

function Row({ k, v }) {
  return (
    <div className="credential-row">
      <dt className="mono">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
