import { useEffect, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shell, PageHead, Notice, Pill, StatusPill, Spinner } from "../components/UI";
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
        <PageHead eyebrow="Attendance" title="Enrol your face first" />
        <Notice tone="hold" title="One setup step remains">
          Attendance works by matching your face against a record you create once.
          Until that record exists there is nothing to match against.{" "}
          <Link to="/profile" className="text-beam hover:underline">Enrol your face</Link>, it takes under a minute.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHead
        eyebrow={now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        title={record?.sign_out_at ? "Day complete" : record?.sign_in_at ? "Signed in" : "Not signed in"}
      >
        {isAdmin && <Link to="/admin" className="btn btn-ghost">Administration</Link>}
      </PageHead>

      <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6">
        {/* ── CREDENTIAL CARD ─────────────────────────── */}
        <div className="space-y-4">
          <div className="panel-raised notched p-5">
            <div className="eyebrow mb-4">Staff credential</div>
            <div className="display text-[22px] leading-tight mb-1">{profile.full_name}</div>
            <div className="mono text-[12px] text-muted mb-5">{profile.staff_id || "No staff number"}</div>

            <dl className="space-y-2.5 border-t border-line pt-4">
              <Row k="Department" v={profile.departments?.name || "Unassigned"} />
              <Row k="Grade" v={profile.grade_level || "—"} />
              <Row k="Sign in" v={timeOf(record?.sign_in_at)} />
              <Row k="Sign out" v={timeOf(record?.sign_out_at)} />
              <Row k="Hours" v={record?.hours_worked ? `${record.hours_worked}h` : "—"} />
            </dl>

            <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-2">
              <StatusPill status={record?.status} />
              {record?.early_departure && <Pill tone="hold">Left early</Pill>}
              {record?.marked_by && <Pill tone="mute">Marked by admin</Pill>}
            </div>
          </div>

          <div className="panel p-4">
            <div className="eyebrow mb-3">Office hours</div>
            <dl className="space-y-2">
              <Row k="Start" v={`${settings.work_start} (+${settings.grace_minutes}m grace)`} />
              <Row k="End" v={settings.work_end} />
              <Row k="Minimum" v={`${settings.min_hours} hours`} />
            </dl>
          </div>
        </div>

        {/* ── ACTION SIDE ─────────────────────────────── */}
        <div className="space-y-5">
          {saved && (
            <Notice tone="clear" title={saved === "in" ? "Signed in" : "Signed out"}>
              {saved === "in"
                ? `Recorded at ${timeOf(record?.sign_in_at)}. Sign out before you leave so your hours are counted.`
                : `Recorded at ${timeOf(record?.sign_out_at)}. That is ${record?.hours_worked}h on site today.`}
            </Notice>
          )}

          {error && <Notice tone="deny" title="Could not save">{error}</Notice>}

          {mode ? (
            <>
              {mode === "in" && wouldBeLate && (
                <div className="panel p-4">
                  <label className="label">You are past {settings.work_start}. Reason for lateness</label>
                  <textarea className="field" rows={2} value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Traffic on Airport Road, hospital appointment, official assignment" />
                </div>
              )}
              {mode === "out" && wouldBeEarly && (
                <div className="panel p-4">
                  <label className="label">You are leaving before {settings.work_end}. Reason</label>
                  <textarea className="field" rows={2} value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Approved permission, official duty off site, medical" />
                </div>
              )}
              <Suspense fallback={<div className="panel p-8"><Spinner label="Loading the verification engine" /></div>}>
                <VerifyFlow mode={mode} onVerified={onVerified} onCancel={() => { setMode(null); setReason(""); }} />
              </Suspense>
            </>
          ) : (
            <div className="panel p-6">
              {!record?.sign_in_at && (
                <>
                  <h2 className="display text-[22px] mb-2">Record your arrival</h2>
                  <p className="text-[14px] text-muted leading-relaxed mb-5">
                    The check takes about fifteen seconds. Stand where there is light on
                    your face, hold your own device, and make sure nobody else is in frame.
                  </p>
                  <button className="btn btn-primary" onClick={() => setMode("in")}>Sign in</button>
                </>
              )}

              {record?.sign_in_at && !record?.sign_out_at && (
                <>
                  <h2 className="display text-[22px] mb-2">Record your departure</h2>
                  <p className="text-[14px] text-muted leading-relaxed mb-5">
                    You signed in at {timeOf(record.sign_in_at)}. Sign out when you leave so
                    your hours for the day are counted.
                  </p>
                  <button className="btn btn-primary" onClick={() => setMode("out")}>Sign out</button>
                </>
              )}

              {record?.sign_out_at && (
                <>
                  <h2 className="display text-[22px] mb-2">Nothing left to do today</h2>
                  <p className="text-[14px] text-muted leading-relaxed">
                    In at {timeOf(record.sign_in_at)}, out at {timeOf(record.sign_out_at)},
                    {" "}{record.hours_worked}h on site.{" "}
                    <Link to="/history" className="text-beam hover:underline">See your record</Link>.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4 items-baseline">
      <dt className="mono text-[10px] text-muted uppercase tracking-wider">{k}</dt>
      <dd className="mono text-[13px] text-right">{v}</dd>
    </div>
  );
}
