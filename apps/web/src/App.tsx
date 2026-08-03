import { Route, Routes } from "react-router-dom";
import AdminLayout from "./layouts/AdminLayout.js";
import AlbumPage from "./pages/AlbumPage.js";
import MaterialesPage from "./pages/MaterialesPage.js";
import ClientesPage from "./pages/ClientesPage.js";
import ConfiguracionPage from "./pages/ConfiguracionPage.js";
import CotizacionesPage from "./pages/CotizacionesPage.js";
import GaleriaPage from "./pages/GaleriaPage.js";
import ReservasPage from "./pages/ReservasPage.js";

export default function App() {
  return (
    <Routes>
      <Route path="/galeria" element={<GaleriaPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<CotizacionesPage />} />
        <Route path="/cotizaciones" element={<CotizacionesPage />} />
        <Route path="/reservas" element={<ReservasPage />} />
        <Route path="/materiales" element={<MaterialesPage />} />
        <Route path="/album" element={<AlbumPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/configuracion" element={<ConfiguracionPage />} />
      </Route>
    </Routes>
  );
}
