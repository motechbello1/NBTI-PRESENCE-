import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { listDepartments } from "../lib/db";
import { SecurityRail, Wordmark } from "../components/UI";

export default function CreateAccount() {
  const nav = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    full_name: "", staff_id: "", email: "", phone: "",
    department_id: "", password: "", confirm: "",
  });
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { listDepartments().then(setDepartments).catch(() => {}); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) { setError("The two passwords do not match."); return; }
    if (form.password.length < 8) { setError("Use at least 8 characters for your password."); return; }
    if (!form.department_id) { setError("Choose your department."); return; }

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          staff_id: form.staff_id,
          phone: form.phone,
          department_id: form.department_id,
        },
      },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setSent(true);
    setTimeout(() => nav("/"), 2500);
  }

  return (
    <main className="account-shell auth-stage">
      <aside className="account-brief" aria-labelledby="account-sequence-title">
        <Wordmark />

        <div className="account-brief-copy">
          <div className="eyebrow">Staff onboarding register</div>
          <h1 id="account-sequence-title" className="display">One record. Three steps.</h1>
          <p>Your official details establish the account. Face enrolment happens only after you sign in.</p>
        </div>

        <ol className="account-sequence">
          <li data-state="current">
            <span className="mono">01</span>
            <div><strong>Account details</strong><small>Enter your official staff information</small></div>
          </li>
          <li>
            <span className="mono">02</span>
            <div><strong>Face enrolment</strong><small>Capture four guided positions</small></div>
          </li>
          <li>
            <span className="mono">03</span>
            <div><strong>Attendance ready</strong><small>Sign in only from the approved site</small></div>
          </li>
        </ol>

        <div className="account-brief-note mono">FORM SERIES P · PERSONNEL RECORD</div>
      </aside>

      <section className="account-work" aria-labelledby="create-account-title">
        <SecurityRail className="account-security-rail" />
        <div className="account-mobile-brand"><Wordmark compact /></div>

        <div className="account-form-wrap">
          <div className="account-form-head">
            <div className="mono account-form-reference">FORM P-02 · STAFF REGISTRATION</div>
            <div className="eyebrow">New staff account</div>
            <h2 id="create-account-title" className="display">Create your staff record</h2>
            <p>Use the same details held by Human Resources. ICT must correct official fields after registration.</p>
          </div>

          {sent ? (
            <div className="account-complete" role="status" aria-live="polite">
              <div className="account-complete-mark" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <path d="M8 16.5l5.2 5.2L24.5 10" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <div className="eyebrow">Record created</div>
              <h3 className="display">Your account is ready.</h3>
              <p>Check your work email if confirmation is required. Then sign in and complete face enrolment.</p>
              <Link to="/sign-in" className="btn btn-primary">Continue to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="account-form">
              <fieldset className="account-fieldset">
                <legend><span className="mono">A</span> Official details</legend>
                <div className="account-field-grid">
                  <div>
                    <label className="label" htmlFor="full-name">Full name</label>
                    <input id="full-name" className="field" autoComplete="name" value={form.full_name} onChange={set("full_name")} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="staff-id">Staff number</label>
                    <input id="staff-id" className="field mono" value={form.staff_id} onChange={set("staff_id")}
                           placeholder="NBTI/00000" required />
                  </div>
                  <div className="account-field-wide">
                    <label className="label" htmlFor="department">Department</label>
                    <select id="department" className="field" value={form.department_id} onChange={set("department_id")} required>
                      <option value="">Select your department</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>

              <fieldset className="account-fieldset">
                <legend><span className="mono">B</span> Contact details</legend>
                <div className="account-field-grid">
                  <div>
                    <label className="label" htmlFor="work-email">Work email</label>
                    <input id="work-email" className="field" type="email" inputMode="email" autoComplete="email"
                           value={form.email} onChange={set("email")} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="phone">Phone</label>
                    <input id="phone" className="field" type="tel" inputMode="tel" autoComplete="tel"
                           value={form.phone} onChange={set("phone")} placeholder="0800 000 0000" />
                  </div>
                </div>
              </fieldset>

              <fieldset className="account-fieldset">
                <legend><span className="mono">C</span> Account security</legend>
                <div className="account-field-grid">
                  <div>
                    <label className="label" htmlFor="new-password">Password</label>
                    <input id="new-password" className="field" type="password" autoComplete="new-password"
                           aria-describedby="password-help" value={form.password} onChange={set("password")} required />
                    <small id="password-help" className="account-field-help">At least 8 characters.</small>
                  </div>
                  <div>
                    <label className="label" htmlFor="confirm-password">Repeat password</label>
                    <input id="confirm-password" className="field" type="password" autoComplete="new-password"
                           value={form.confirm} onChange={set("confirm")} required />
                  </div>
                </div>
              </fieldset>

              <div className="account-error" role="alert" aria-live="polite">
                {error || <span aria-hidden="true">&nbsp;</span>}
              </div>

              <div className="account-actions">
                <button type="submit" className="btn btn-primary account-submit" disabled={busy}>
                  <span>{busy ? "Creating staff record" : "Create account and continue"}</span>
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M3 9h11M10 5l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                <p>Already registered? <Link to="/sign-in">Return to sign in</Link></p>
              </div>
            </form>
          )}
        </div>

        <div className="auth-classification mono">NBTI INTERNAL SERVICE</div>
      </section>
    </main>
  );
}
