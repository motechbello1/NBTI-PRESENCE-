import { Component, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { SplashScreen } from "./components/UI";

import Login from "./pages/Login";
import CreateAccount from "./pages/CreateAccount";
import Today from "./pages/Today";
import History from "./pages/History";
import Profile from "./pages/Profile";

import Overview from "./pages/admin/Overview";
import DailyRegister from "./pages/admin/DailyRegister";
import StaffAdmin from "./pages/admin/StaffAdmin";
import Flags from "./pages/admin/Flags";
import Settings from "./pages/admin/Settings";

const Reports = lazy(() => import("./pages/admin/Reports"));

function Booting() {
  return <SplashScreen />;
}

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <Booting />;
  if (!session) return <Navigate to="/sign-in" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { session, isAdmin, loading } = useAuth();
  if (loading) return <Booting />;
  if (!session) return <Navigate to="/sign-in" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

class RouteErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page rendering failed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="route-failure" role="alert">
        <span className="mono">PAGE RECOVERY</span>
        <h1 className="display">This page could not finish loading.</h1>
        <p>The rest of your attendance account is still available. Return to Attendance, or reload this page and try again.</p>
        <div>
          <a className="btn btn-primary" href="/">Return to attendance</a>
          <button className="btn btn-ghost" type="button" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </main>
    );
  }
}

export default function App() {
  const { session, loading } = useAuth();
  const location = useLocation();

  return (
    <RouteErrorBoundary key={location.key}>
    <Routes location={location}>
      <Route path="/sign-in" element={
        loading ? <Booting /> : session ? <Navigate to="/" replace /> : <Login />
      } />
      <Route path="/create-account" element={
        loading ? <Booting /> : session ? <Navigate to="/" replace /> : <CreateAccount />
      } />

      <Route path="/" element={<RequireAuth><Today /></RequireAuth>} />
      <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Suspense fallback={<Booting />}><Reports /></Suspense></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />

      <Route path="/admin" element={<RequireAdmin><Overview /></RequireAdmin>} />
      <Route path="/admin/register" element={<RequireAdmin><DailyRegister /></RequireAdmin>} />
      <Route path="/admin/staff" element={<RequireAdmin><StaffAdmin /></RequireAdmin>} />
      <Route path="/admin/flags" element={<RequireAdmin><Flags /></RequireAdmin>} />
      <Route path="/admin/reports" element={<Navigate to="/reports" replace />} />
      <Route path="/admin/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </RouteErrorBoundary>
  );
}
