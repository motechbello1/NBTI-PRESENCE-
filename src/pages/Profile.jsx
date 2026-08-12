import { useState, lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";
import { Shell, Notice, Pill, Spinner } from "../components/UI";
const EnrolFlow = lazy(() => import("../components/EnrolFlow"));
import { clearEnrolment, updateProfile } from "../lib/db";
import { deviceLabel } from "../lib/device";

export default function Profile() {
  const { session, profile, refresh } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [confirmingRedo, setConfirmingRedo] = useState(false);
  const [form, setForm] = useState({ phone: profile?.phone || "" });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    await updateProfile(session.user.id, form);
    await refresh();
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function redo() {
    await clearEnrolment(session.user.id);
    await refresh();
    setConfirmingRedo(false);
    setEnrolling(true);
  }

  const enrolled = Boolean(profile?.face_enrolled);

  return (
    <Shell>
      <section className="profile-page" aria-labelledby="profile-title">
        <header className="profile-head">
          <div>
            <div className="eyebrow">Personnel record · staff copy</div>
            <h1 id="profile-title" className="display">Identity and enrolment</h1>
          </div>
          <div className={`profile-record-state ${enrolled ? "is-clear" : "is-hold"}`}>
            <i aria-hidden="true" />
            <span className="mono">{enrolled ? "FACE RECORD ACTIVE" : "ENROLMENT REQUIRED"}</span>
          </div>
        </header>

        <div className="profile-layout">
          <section className="profile-personnel" aria-labelledby="personnel-title">
            <div className="profile-credential notched">
              <div className="profile-credential-top mono"><span>PERSONNEL FILE</span><span>P-01</span></div>
              <h2 id="personnel-title" className="display">{profile?.full_name}</h2>
              <div className="profile-staff-id mono">{profile?.staff_id || "NO STAFF NUMBER"}</div>
              <dl>
                <RecordRow label="Department" value={profile?.departments?.name || "Unassigned"} />
                <RecordRow label="Access" value="Staff register" />
                <RecordRow label="Record owner" value={session.user.email || "Authenticated account"} />
              </dl>
            </div>

            <form onSubmit={save} className="profile-form" aria-labelledby="details-title">
              <div className="profile-section-head">
                <div>
                  <div className="eyebrow">Account details</div>
                  <h2 id="details-title" className="display">Personnel information</h2>
                </div>
                <span className="mono">EDITABLE FIELDS MARKED</span>
              </div>

              <fieldset className="profile-fieldset">
                <legend className="mono">CONTROLLED BY ICT</legend>
                <div className="profile-field-grid">
                  <div className="profile-field is-locked profile-field-wide">
                    <label htmlFor="profile-full-name">Full name</label>
                    <input id="profile-full-name" value={profile?.full_name || ""} disabled />
                  </div>
                  <div className="profile-field is-locked">
                    <label htmlFor="profile-staff-number">Staff number</label>
                    <input id="profile-staff-number" value={profile?.staff_id || "—"} disabled />
                  </div>
                  <div className="profile-field is-locked">
                    <label htmlFor="profile-department">Department</label>
                    <input id="profile-department" value={profile?.departments?.name || "—"} disabled />
                  </div>
                  <div className="profile-field is-locked">
                    <label htmlFor="profile-grade">Grade level</label>
                    <input id="profile-grade" value={profile?.grade_level || "—"} disabled />
                  </div>
                </div>
                <p>Contact the ICT department to correct a controlled field.</p>
              </fieldset>

              <fieldset className="profile-fieldset is-editable">
                <legend className="mono">YOU MAY UPDATE</legend>
                <div className="profile-field-grid">
                  <div className="profile-field">
                    <label htmlFor="profile-phone">Phone number</label>
                    <input id="profile-phone" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  </div>
                </div>
              </fieldset>

              <div className="profile-form-actions">
                <button className="btn btn-primary" disabled={busy}>{busy ? "Saving changes" : "Save changes"}</button>
                <span className="mono" role="status" aria-live="polite">{saved ? "CHANGES SAVED" : ""}</span>
              </div>
            </form>
          </section>

          <aside className="profile-verification" aria-labelledby="face-record-title">
            <section className="profile-face-card">
              <div className="profile-face-head">
                <div>
                  <div className="mono">BIOMETRIC CONTROL · B-04</div>
                  <h2 id="face-record-title" className="display">Face record</h2>
                </div>
                <Pill tone={enrolled ? "clear" : "hold"}>{enrolled ? "Ready" : "Action needed"}</Pill>
              </div>

              {enrolling ? (
                <Suspense fallback={<div className="profile-engine-loading"><Spinner label="Loading the enrolment instrument" /></div>}>
                  <EnrolFlow onDone={() => setEnrolling(false)} onCancel={() => setEnrolling(false)} />
                </Suspense>
              ) : (
                <>
                  <div className="profile-face-seal" aria-hidden="true">
                    <svg viewBox="0 0 180 180">
                      <circle cx="90" cy="90" r="69" />
                      <circle cx="90" cy="76" r="24" />
                      <path d="M46 137c8-28 24-42 44-42s36 14 44 42" />
                      <path d="M90 8v13M90 159v13M8 90h13M159 90h13" />
                    </svg>
                    <span className="mono">{enrolled ? "ACTIVE" : "EMPTY"}</span>
                  </div>
                  <p>
                    The stored record is a set of face measurements, not a photograph.
                    Routine attendance video is not retained. A single frame is kept only when an attempt is refused as evidence.
                  </p>
                  <ol className="profile-capture-list">
                    {[
                      ["01", "Centre", "Straight reading"],
                      ["02", "Left", "Side reading"],
                      ["03", "Right", "Side reading"],
                      ["04", "Up", "Raised reading"],
                    ].map(([number, pose, detail]) => <li key={pose}><span className="mono">{number}</span><strong>{pose}</strong><small>{detail}</small></li>)}
                  </ol>

                  {confirmingRedo ? (
                    <div className="profile-confirm" role="alert">
                      <strong>Replace the active face record?</strong>
                      <p>Attendance will remain unavailable until all four positions are captured again.</p>
                      <div><button className="btn btn-danger" onClick={redo}>Clear and enrol again</button><button className="btn btn-ghost" onClick={() => setConfirmingRedo(false)}>Keep current record</button></div>
                    </div>
                  ) : (
                    <div className="profile-face-action">
                      {!enrolled
                        ? <button className="btn btn-primary" onClick={() => setEnrolling(true)}>Begin face enrolment</button>
                        : <button className="btn btn-ghost" onClick={() => setConfirmingRedo(true)}>Replace face record</button>}
                      <span className="mono">FOUR LIVE POSITIONS · UNDER ONE MINUTE</span>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="profile-device">
              <div className="eyebrow">This attendance device</div>
              <div className="profile-device-reading mono">{deviceLabel()}</div>
              <p>One handset recording attendance for multiple staff on the same day is raised automatically with ICT.</p>
            </section>
          </aside>
        </div>
      </section>
    </Shell>
  );
}

function RecordRow({ label, value }) {
  return <div><dt className="mono">{label}</dt><dd>{value}</dd></div>;
}
