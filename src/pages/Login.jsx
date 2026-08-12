import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SecurityRail, Wordmark } from "../components/UI";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    nav("/");
  }

  return (
    <main className="auth-shell auth-stage">
      <section className="auth-brief" aria-labelledby="presence-thesis">
        <header className="auth-brand"><Wordmark /></header>

        <div className="auth-thesis">
          <div className="eyebrow">Attendance verification register</div>
          <h1 id="presence-thesis" className="display">Presence, established.</h1>
          <p>
            A record is written only after your location, liveness, surroundings
            and identity have been checked on this device.
          </p>
        </div>

        <ol className="auth-register" aria-label="Four verification gates">
          {[
            ["01", "Location", "Inside the approved site perimeter"],
            ["02", "Liveness", "A fresh head-turn order completed live"],
            ["03", "Surroundings", "No screen, print or second person detected"],
            ["04", "Identity", "Face matched to the account enrolment"],
          ].map(([n, gate, detail]) => (
            <li key={gate}>
              <span className="mono auth-register-number">{n}</span>
              <span className="auth-register-gate">{gate}</span>
              <span className="auth-register-detail">{detail}</span>
            </li>
          ))}
        </ol>

        <footer className="auth-footnote mono">
          ICT-managed attendance instrument · Abuja, Nigeria
        </footer>
      </section>

      <section className="auth-access" aria-labelledby="sign-in-title">
        <SecurityRail className="auth-security-rail" />
        <div className="auth-mobile-brand"><Wordmark compact /></div>

        <form onSubmit={submit} className="auth-form">
          <div className="auth-form-reference mono">FORM P-01 · STAFF ACCESS</div>
          <div className="eyebrow">Secure register access</div>
          <h2 id="sign-in-title" className="display">Sign in to your record</h2>
          <p className="auth-form-intro">Use the work email attached to your NBTI staff account.</p>

          <div className="auth-fields">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <input id="email" className="field" type="email" autoComplete="email"
                     inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <div className="auth-label-row">
                <label className="label" htmlFor="pw">Password</label>
                <button className="auth-reveal" type="button" onClick={() => setShowPassword((visible) => !visible)}
                        aria-controls="pw" aria-pressed={showPassword}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input id="pw" className="field" type={showPassword ? "text" : "password"} autoComplete="current-password"
                     value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>

          <div className="auth-error" role="alert" aria-live="polite">
            {error || <span aria-hidden="true">&nbsp;</span>}
          </div>

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            <span>{busy ? "Checking account" : "Open attendance record"}</span>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 9h11M10 5l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <p className="auth-create">
            First time here? <Link to="/create-account">Create a staff account</Link>
          </p>
        </form>

        <div className="auth-classification mono">NBTI INTERNAL SERVICE</div>
      </section>
    </main>
  );
}
