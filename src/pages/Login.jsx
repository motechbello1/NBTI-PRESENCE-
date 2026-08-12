import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Seal } from "../components/UI";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    nav("/");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: the thesis panel. States plainly what the system does. */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-line">
        <div className="flex items-center gap-3">
          <Seal size={26} />
          <span className="display text-[17px]">NBTI <span className="text-beam">PRESENCE</span></span>
        </div>

        <div className="max-w-md">
          <div className="eyebrow mb-4">Four checks, every sign in</div>
          <h1 className="display text-[52px] leading-[0.95] mb-6">
            Presence you<br />can prove.
          </h1>
          <p className="text-[15px] text-muted leading-relaxed">
            Attendance is recorded only when the system can confirm four things
            at once: that you are on NBTI premises, that a live person is in
            front of the camera, that nothing is being held up to it, and that
            the face belongs to your record.
          </p>

          <div className="mt-10 space-y-3">
            {[
              ["Location", "Inside the perimeter, checked by GPS"],
              ["Liveness", "A head-turn order drawn fresh each attempt"],
              ["Surroundings", "No phone, screen or printed photo in frame"],
              ["Identity", "The face matched against your enrolment"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-4 items-baseline border-t border-line pt-3">
                <span className="mono text-[11px] text-beam uppercase tracking-wider w-28 shrink-0">{k}</span>
                <span className="text-[13px] text-muted">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mono text-[10px] text-muted uppercase tracking-wider">
          National Board for Technology Incubation
        </div>
      </div>

      {/* Right: the form */}
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Seal size={26} />
            <span className="display text-[17px]">NBTI <span className="text-beam">PRESENCE</span></span>
          </div>

          <div className="eyebrow mb-2">Staff access</div>
          <h2 className="display text-[30px] mb-7">Sign in</h2>

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <input id="email" className="field" type="email" autoComplete="email"
                     value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="pw">Password</label>
              <input id="pw" className="field" type="password" autoComplete="current-password"
                     value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>

          {error && (
            <div className="mt-4 text-[13px] text-deny leading-relaxed">{error}</div>
          )}

          <button className="btn btn-primary w-full mt-6" disabled={busy}>
            {busy ? "Signing in" : "Sign in"}
          </button>

          <p className="text-[13px] text-muted mt-6">
            No account yet? <Link to="/create-account" className="text-beam hover:underline">Create one</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
