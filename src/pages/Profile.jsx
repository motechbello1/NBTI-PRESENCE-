import { useState, lazy, Suspense } from "react";
import { useAuth } from "../context/AuthContext";
import { Shell, PageHead, Notice, Pill, Spinner } from "../components/UI";
const EnrolFlow = lazy(() => import("../components/EnrolFlow"));
import { clearEnrolment, updateProfile } from "../lib/db";
import { deviceLabel } from "../lib/device";

export default function Profile() {
  const { session, profile, refresh } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [form, setForm] = useState({ phone: profile?.phone || "", grade_level: profile?.grade_level || "" });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await updateProfile(session.user.id, form);
    await refresh();
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function redo() {
    if (!confirm("This clears your stored face and you will need to enrol again before your next sign in. Continue?")) return;
    await clearEnrolment(session.user.id);
    await refresh();
    setEnrolling(true);
  }

  return (
    <Shell>
      <PageHead eyebrow="Your account" title="Profile" />

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="eyebrow mb-2">Face enrolment</div>
                <div className="display text-[19px]">
                  {profile?.face_enrolled ? "Enrolled" : "Not enrolled"}
                </div>
              </div>
              <Pill tone={profile?.face_enrolled ? "clear" : "hold"}>
                {profile?.face_enrolled ? "Ready" : "Action needed"}
              </Pill>
            </div>

            <p className="text-[14px] text-muted leading-relaxed mb-4">
              Your face is stored as a set of numbers that describe its proportions.
              It cannot be turned back into a photograph, and it is readable only by
              your own account. No image of you is kept unless an attendance attempt
              is refused, in which case that single frame is held as evidence.
            </p>

            {enrolling ? (
              <Suspense fallback={<Spinner label="Loading the verification engine" />}>
                <EnrolFlow onDone={() => setEnrolling(false)} onCancel={() => setEnrolling(false)} />
              </Suspense>
            ) : (
              <div className="flex gap-3">
                {!profile?.face_enrolled
                  ? <button className="btn btn-primary" onClick={() => setEnrolling(true)}>Enrol my face</button>
                  : <button className="btn btn-ghost" onClick={redo}>Enrol again</button>}
              </div>
            )}
          </div>

          <div className="panel p-5">
            <div className="eyebrow mb-3">This device</div>
            <div className="mono text-[13px]">{deviceLabel()}</div>
            <p className="text-[13px] text-muted mt-3 leading-relaxed">
              The system notices when one handset records attendance for more than
              one person in a day and raises this with the ICT department.
            </p>
          </div>
        </div>

        <form onSubmit={save} className="panel p-5 h-fit">
          <div className="eyebrow mb-4">Your details</div>

          <div className="space-y-4">
            <div>
              <label className="label">Full name</label>
              <input className="field opacity-60" value={profile?.full_name || ""} disabled />
              <p className="text-[12px] text-muted mt-1.5">Contact ICT to change your name or staff number.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Staff number</label>
                <input className="field opacity-60" value={profile?.staff_id || "—"} disabled />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="field opacity-60" value={profile?.departments?.name || "—"} disabled />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Phone</label>
                <input className="field" value={form.phone}
                       onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Grade level</label>
                <input className="field" value={form.grade_level}
                       onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
                       placeholder="CONRAISS 09" />
              </div>
            </div>
          </div>

          <button className="btn btn-primary mt-6" disabled={busy}>
            {busy ? "Saving" : "Save changes"}
          </button>
          {saved && <span className="mono text-[11px] text-beam ml-4 uppercase tracking-wider">Saved</span>}
        </form>
      </div>
    </Shell>
  );
}
