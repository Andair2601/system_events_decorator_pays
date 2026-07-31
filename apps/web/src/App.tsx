import { NavLink, Route, Routes } from "react-router-dom";
import MaterialesPage from "./pages/MaterialesPage.js";
import ClientesPage from "./pages/ClientesPage.js";
import ConfiguracionPage from "./pages/ConfiguracionPage.js";
import CotizacionesPage from "./pages/CotizacionesPage.js";
import ReservasPage from "./pages/ReservasPage.js";

const NAV_ITEMS = [
  { to: "/cotizaciones", label: "Cotizaciones" },
  { to: "/reservas", label: "Reservas" },
  { to: "/materiales", label: "Materiales" },
  { to: "/clientes", label: "Clientes" },
  { to: "/configuracion", label: "Configuración" },
];

export default function App() {
  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">Decoración de Eventos</span>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<CotizacionesPage />} />
          <Route path="/cotizaciones" element={<CotizacionesPage />} />
          <Route path="/reservas" element={<ReservasPage />} />
          <Route path="/materiales" element={<MaterialesPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/configuracion" element={<ConfiguracionPage />} />
        </Routes>
      </main>
    </div>
  );
}
