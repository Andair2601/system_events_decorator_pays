import { Decimal } from "decimal.js";
import PDFDocument from "pdfkit";
import { LOGO_PNG_BASE64 } from "./assets/logo-base64.js";
import type { CotizacionCompleta } from "./service.js";

export type VistaPdf = "interno" | "cliente";

const MONEDA = "S/";
const MARGEN = 50;

// Vista interna: 4 columnas (incluye costo unitario y subtotal — información
// de costos que no debe salir del negocio).
const COL_X_INTERNO = [MARGEN, MARGEN + 240, MARGEN + 330, MARGEN + 420] as const;
const COL_W_INTERNO = [230, 80, 80, 75] as const;
// Vista cliente: solo material + cantidad. No se muestra costo unitario ni
// subtotal por línea (evita que el cliente "cotice por partes" comparando
// precio por ítem); el total de materiales sigue apareciendo, pero como un
// solo monto en el resumen, no desglosado.
const COL_X_CLIENTE = [MARGEN, MARGEN + 400] as const;
const COL_W_CLIENTE = [400, 95] as const;

const TABLA_DERECHA = MARGEN + 470; // = COL_X_INTERNO[3]+COL_W_INTERNO[3] = COL_X_CLIENTE[1]+COL_W_CLIENTE[1]

function filaTabla(
  doc: PDFKit.PDFDocument,
  y: number,
  colX: readonly number[],
  colW: readonly number[],
  celdas: string[],
  opts: { negrita?: boolean; alinearDerechaDesde?: number } = {},
) {
  doc.font(opts.negrita ? "Helvetica-Bold" : "Helvetica").fontSize(10);
  celdas.forEach((texto, i) => {
    const align = i >= (opts.alinearDerechaDesde ?? 1) ? "right" : "left";
    doc.text(texto, colX[i]!, y, { width: colW[i], align });
  });
}

type RedSocial = "whatsapp" | "instagram" | "facebook";

// Sin acceso a los logos oficiales de cada red (y para no usarlos sin
// derechos): íconos vectoriales simplificados pero reconocibles, dibujados
// a mano con las primitivas de pdfkit en vez de imágenes.
function dibujarIconoRedSocial(
  doc: PDFKit.PDFDocument,
  tipo: RedSocial,
  cx: number,
  cy: number,
  r: number,
) {
  const colores: Record<RedSocial, string> = {
    whatsapp: "#25D366",
    instagram: "#C13584",
    facebook: "#1877F2",
  };
  doc.save();
  doc.circle(cx, cy, r).fill(colores[tipo]);
  if (tipo === "facebook") {
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(r * 1.3)
      .text("f", cx - r * 0.28, cy - r * 0.62, { lineBreak: false });
  } else if (tipo === "whatsapp") {
    const bw = r * 1.15;
    const bh = r * 0.9;
    doc
      .roundedRect(cx - bw / 2, cy - bh / 2 - r * 0.1, bw, bh, bh * 0.3)
      .fill("#ffffff");
    doc
      .polygon(
        [cx - bw * 0.18, cy + bh / 2 - r * 0.1],
        [cx + bw * 0.02, cy + bh / 2 - r * 0.1],
        [cx - bw * 0.18, cy + bh / 2 + r * 0.32],
      )
      .fill("#ffffff");
  } else {
    doc
      .roundedRect(cx - r * 0.55, cy - r * 0.55, r * 1.1, r * 1.1, r * 0.28)
      .lineWidth(1.2)
      .stroke("#ffffff");
    doc.circle(cx, cy, r * 0.28).lineWidth(1.2).stroke("#ffffff");
    doc.circle(cx + r * 0.35, cy - r * 0.35, r * 0.07).fill("#ffffff");
  }
  doc.restore();
}

// Genera el PDF de una cotización. Dos vistas del mismo total:
// - "interno" (default): desglose real, incluye el % de margen y el costo
//   unitario/subtotal de cada material — para uso propio del negocio.
// - "cliente": no expone información de costos. El margen se presenta como
//   "Servicio de decoración" (monto, no %), y los materiales se listan sin
//   precio por ítem (solo el total de materiales en el resumen).
// Usa las fuentes estándar de pdfkit (no requiere archivos de fuente
// externos), pensado para correr también en un handler Lambda.
export async function generarCotizacionPdf(
  data: CotizacionCompleta,
  vista: VistaPdf = "interno",
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGEN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const logo = Buffer.from(LOGO_PNG_BASE64, "base64");

    // Marca de agua: se dibuja primero, a muy baja opacidad, para quedar
    // detrás de todo lo demás — pdfkit no tiene z-index, el orden de
    // dibujo es el orden de apilado.
    const marcaAguaTam = 320;
    doc.opacity(0.08);
    doc.image(logo, (doc.page.width - marcaAguaTam) / 2, (doc.page.height - marcaAguaTam) / 2, {
      width: marcaAguaTam,
      height: marcaAguaTam,
    });
    doc.opacity(1);

    // Header: logo chico + nombre del negocio, posicionados a mano (no en
    // flujo automático) para controlar dónde sigue el resto del contenido.
    const logoHeaderTam = 40;
    doc.image(logo, MARGEN, MARGEN, { width: logoHeaderTam, height: logoHeaderTam });
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("BANANA DECOPARTY", MARGEN + logoHeaderTam + 12, MARGEN + 4);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#555555")
      .text(
        `Cotización #${data.id} · emitida el ${new Date().toLocaleDateString("es-PE")}`,
        MARGEN + logoHeaderTam + 12,
        MARGEN + 26,
      );
    doc.fillColor("#000000");
    const filaClienteY = MARGEN + logoHeaderTam + 18;
    doc.x = MARGEN;
    doc.y = filaClienteY;

    const anchoColIzquierda = 250; // deja espacio libre a la derecha para las redes sociales
    doc.font("Helvetica-Bold").fontSize(12).text("Cliente", { width: anchoColIzquierda });
    doc.font("Helvetica").fontSize(10);
    doc.text(data.cliente.nombre, { width: anchoColIzquierda });
    doc.text(data.cliente.telefono, { width: anchoColIzquierda });
    if (data.cliente.email) doc.text(data.cliente.email, { width: anchoColIzquierda });
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Evento", { width: anchoColIzquierda });
    doc.font("Helvetica").fontSize(10);
    doc.text(data.nombreEvento, { width: anchoColIzquierda });
    doc.text(`Tipo: ${data.tipoEvento.replace(/_/g, " ")}`, { width: anchoColIzquierda });
    doc.moveDown(1.5);
    // doc.text con coordenadas explícitas igual actualiza doc.x/doc.y; se
    // guarda dónde quedó el flujo de la columna izquierda para restaurarlo
    // después de dibujar las redes sociales (columna derecha, posiciones
    // explícitas), y que "Materiales" no arranque en el lugar equivocado.
    const flujoXTrasEvento = doc.x;
    const flujoYTrasEvento = doc.y;

    // Redes sociales: aprovecha el espacio en blanco a la derecha de
    // Cliente/Evento, a la misma altura.
    const redSocialX = MARGEN + 300;
    const iconoR = 7;
    const redes: { tipo: RedSocial; texto: string }[] = [
      { tipo: "whatsapp", texto: "+51 961 323 186" },
      { tipo: "instagram", texto: "@banana.decoparty" },
      { tipo: "facebook", texto: "Banana Decoraciones - Trujillo" },
    ];
    let redY = filaClienteY + 4;
    for (const red of redes) {
      dibujarIconoRedSocial(doc, red.tipo, redSocialX + iconoR, redY + iconoR, iconoR);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#000000")
        .text(red.texto, redSocialX + iconoR * 2 + 8, redY + iconoR - 4.5, {
          width: TABLA_DERECHA - (redSocialX + iconoR * 2 + 8),
        });
      redY += iconoR * 2 + 12;
    }
    doc.x = flujoXTrasEvento;
    doc.y = flujoYTrasEvento;

    doc.font("Helvetica-Bold").fontSize(12).text("Materiales");
    doc.moveDown(0.5);

    const colX = vista === "cliente" ? COL_X_CLIENTE : COL_X_INTERNO;
    const colW = vista === "cliente" ? COL_W_CLIENTE : COL_W_INTERNO;
    const encabezados =
      vista === "cliente" ? ["Material", "Cantidad"] : ["Material", "Cantidad", "Costo unit.", "Subtotal"];

    let y = doc.y;
    filaTabla(doc, y, colX, colW, encabezados, { negrita: true });
    y += 16;
    doc
      .moveTo(MARGEN, y)
      .lineTo(TABLA_DERECHA, y)
      .strokeColor("#cccccc")
      .stroke();
    y += 8;

    for (const item of data.items) {
      const fila =
        vista === "cliente"
          ? [`${item.materialNombre} (${item.materialUnidad})`, item.cantidad]
          : [
              `${item.materialNombre} (${item.materialUnidad})`,
              item.cantidad,
              `${MONEDA} ${item.costoUnitarioSnapshot}`,
              `${MONEDA} ${item.subtotal}`,
            ];
      filaTabla(doc, y, colX, colW, fila);
      y += 18;
    }
    doc.x = MARGEN;
    doc.y = y;
    doc.moveDown(1.5);

    const resumenValorW = 100;
    const resumenValorX = TABLA_DERECHA - resumenValorW;
    const resumenLabelX = MARGEN + 150;
    const resumenLabelW = resumenValorX - resumenLabelX;

    // La altura de fila no es fija: alguna etiqueta larga puede partirse
    // en más de una línea, y con una altura fija la siguiente fila (Total)
    // quedaba superpuesta encima del texto.
    function lineaResumen(etiqueta: string, valor: string, negrita = false) {
      doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(negrita ? 13 : 10);
      const fila = doc.y;
      const alturaEtiqueta = doc.heightOfString(etiqueta, { width: resumenLabelW });
      doc.text(etiqueta, resumenLabelX, fila, { width: resumenLabelW });
      doc.text(valor, resumenValorX, fila, { width: resumenValorW, align: "right" });
      doc.y = fila + Math.max(alturaEtiqueta, 14) + (negrita ? 8 : 6);
    }

    const baseCosto = new Decimal(data.costoMaterialesTotal)
      .plus(data.costoManoObra)
      .plus(data.costoTransporte);
    const margenMonto = baseCosto.times(data.margenPctAplicado).dividedBy(100);
    const descuentoMonto = new Decimal(data.descuentoMonto);

    lineaResumen("Materiales", `${MONEDA} ${data.costoMaterialesTotal}`);
    lineaResumen(
      vista === "cliente" ? "Instalación y montaje" : `Mano de obra (${data.horasManoObraEstimadas} h)`,
      `${MONEDA} ${data.costoManoObra}`,
    );
    lineaResumen("Transporte", `${MONEDA} ${data.costoTransporte}`);
    if (vista === "cliente") {
      lineaResumen("Servicio de decoración", `${MONEDA} ${margenMonto.toFixed(2)}`);
    } else {
      lineaResumen("Margen aplicado", `${data.margenPctAplicado}%`);
    }
    if (descuentoMonto.greaterThan(0)) {
      lineaResumen("Descuento", `-${MONEDA} ${descuentoMonto.toFixed(2)}`);
    }
    doc.moveDown(0.5);
    lineaResumen("Total", `${MONEDA} ${data.precioFinal}`, true);

    doc.moveDown(2);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#777777")
      .text("Cotización válida por 15 días desde la fecha de emisión.", MARGEN, doc.y, {
        width: TABLA_DERECHA - MARGEN,
      })
      .text("Precios no incluyen IGV.", MARGEN, doc.y, { width: TABLA_DERECHA - MARGEN })
      .text(
        "Para reservar la fecha o aceptar la cotización se requiere un adelanto del 50% del total.",
        MARGEN,
        doc.y,
        { width: TABLA_DERECHA - MARGEN },
      );
    doc.fillColor("#000000");

    doc.end();
  });
}
