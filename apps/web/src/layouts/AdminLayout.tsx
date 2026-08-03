import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/cotizaciones", label: "Cotizaciones" },
  { to: "/reservas", label: "Reservas" },
  { to: "/materiales", label: "Materiales" },
  { to: "/album", label: "Álbum" },
  { to: "/clientes", label: "Clientes" },
  { to: "/configuracion", label: "Configuración" },
];

export default function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">BANANA DECOPARTY</span>
        <button
          type="button"
          className="menu-toggle"
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={menuOpen ? "nav nav-open" : "nav"}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
