import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Spinner, Seal } from "./components/UI";

import Login from "./pages/Login";
import CreateAccount from "./pages/CreateAccount";
import Today from "./pages/Today";
import History from "./pages/History";
import Profile from "./pages/Profile";

import Overview from "./pages/admin/Overview";
import DailyRegister from "./pages/admin/DailyRegister";
import StaffAdmin from "./pages/admin/StaffAdmin";
import Flags from "./pages/admin/Flags";
import Reports from "./pages/admin/Reports";
import Settings from "./pages/admin/Settings";

function Booting() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <div className="flex justify-center mb-4"><Seal size={30} /></div>
        <Spinner label="Starting" />
      </div>
    </div>
  );
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

export default function App() {
  const { session, loading } = useAuth();

  return (
    <Routes>
      <Route path="/sign-in" element={
        loading ? <Booting /> : session ? <Navigate to="/" replace /> : <Login />
      } />
      <Route path="/create-account" element={
        loading ? <Booting /> : session ? <Navigate to="/" replace /> : <CreateAccount />
      } />

      <Route path="/" element={<RequireAuth><Today /></RequireAuth>} />
      <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />

      <Route path="/admin" element={<RequireAdmin><Overview /></RequireAdmin>} />
      <Route path="/admin/register" element={<RequireAdmin><DailyRegister /></RequireAdmin>} />
      <Route path="/admin/staff" element={<RequireAdmin><StaffAdmin /></RequireAdmin>} />
      <Route path="/admin/flags" element={<RequireAdmin><Flags /></RequireAdmin>} />
      <Route path="/admin/reports" element={<RequireAdmin><Reports /></RequireAdmin>} />
      <Route path="/admin/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
