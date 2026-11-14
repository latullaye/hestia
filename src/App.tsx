// Routes and layout. One app, two faces: the personal app (phone, computer) and the kiosk (the kitchen tablet).
// The kiosk's own account always lands on the kiosk; from there, the other screens stay one touch away and the kiosk
// comes back by itself after a few minutes without a touch.
import { CalendarDays, CookingPot, House, ListChecks, Menu, MonitorSmartphone, ShoppingCart } from "lucide-react";
import { useEffect } from "react";
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Wordmark } from "./components/icons";
import { InstallBanner } from "./components/InstallBanner";
import { IntercomFab } from "./components/Intercom";
import { Toaster } from "./components/ui";
import { useTable } from "./lib/hooks";
import { SessionProvider, useSession } from "./lib/session";
import { Birthdays } from "./pages/Birthdays";
import { Calendar } from "./pages/Calendar";
import { Chores } from "./pages/Chores";
import { Inbox, inboxOf } from "./pages/Inbox";
import { Kiosk } from "./pages/Kiosk";
import { Login, NotLinked } from "./pages/Login";
import { Meals } from "./pages/Meals";
import { Journal, More } from "./pages/More";
import { Settings } from "./pages/Settings";
import { Shopping } from "./pages/Shopping";
import { Today } from "./pages/Today";

const IDLE_BACK_TO_KIOSK = 3 * 60 * 1000;

function Shell() {
  const { me, isKiosk } = useSession();
  const navigate = useNavigate(), location = useLocation();
  const events = useTable("events"), notifications = useTable("notifications");
  const { badge } = inboxOf(events, notifications, me);
  // On the kitchen tablet, any screen other than the kiosk is a detour
  useEffect(() => {
    if (!isKiosk) return;
    let t = setTimeout(() => navigate("/kiosk"), IDLE_BACK_TO_KIOSK);
    const reset = () => { clearTimeout(t); t = setTimeout(() => navigate("/kiosk"), IDLE_BACK_TO_KIOSK); };
    window.addEventListener("pointerdown", reset); window.addEventListener("keydown", reset);
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", reset); window.removeEventListener("keydown", reset); };
  }, [isKiosk, navigate, location.pathname]);
  const tabs = [
    isKiosk ? { to: "/kiosk", icon: <MonitorSmartphone />, label: "Kiosque" } : { to: "/", icon: <House />, label: "Aujourd'hui" },
    { to: "/calendar", icon: <CalendarDays />, label: "Agenda" }, { to: "/meals", icon: <CookingPot />, label: "Repas" },
    { to: "/shopping", icon: <ShoppingCart />, label: "Courses" }, { to: "/chores", icon: <ListChecks />, label: "Tâches" }, { to: "/more", icon: <Menu />, label: "Plus" },
  ];
  return (
    <div className="app">
      <InstallBanner />
      <Outlet />
      <IntercomFab />
      <div className="tabbar"><nav>
        {tabs.map((t, i) => <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>{t.icon}{t.label}{i === 0 && badge > 0 && <span className="dot">{badge}</span>}</NavLink>)}
      </nav></div>
    </div>
  );
}

function Routed() {
  const { loading, signedIn, me, isKiosk, demo } = useSession();
  if (loading) return <div className="login"><div className="logo"><Wordmark /></div></div>;
  if (!signedIn) return <Login />;
  if (!me) return <NotLinked />;
  const home = isKiosk ? <Navigate to="/kiosk" replace /> : <Today />;
  return (
    <Routes>
      <Route path="/kiosk" element={<Kiosk />} />
      <Route element={<Shell />}>
        <Route path="/" element={home} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/event/:id" element={<Calendar />} />
        <Route path="/meals" element={<Meals />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/shopping/:listId" element={<Shopping />} />
        <Route path="/chores" element={<Chores />} />
        <Route path="/birthdays" element={<Birthdays />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/more" element={<More />} />
        <Route path="*" element={<Navigate to={demo && isKiosk ? "/kiosk" : "/"} replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <SessionProvider>
      <HashRouter><Routed /></HashRouter>
      <Toaster />
    </SessionProvider>
  );
}
