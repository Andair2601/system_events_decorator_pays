import { Decimal } from "decimal.js";
import PDFDocument from "pdfkit";
import type { CotizacionCompleta } from "./service.js";

export type VistaPdf = "interno" | "cliente";

const MONEDA = "S/";
const MARGEN = 50;
const COL_X = [MARGEN, MARGEN + 240, MARGEN + 330, MARGEN + 420] as const;
const COL_W = [230, 80, 80, 75] as const;
const TABLA_DERECHA = COL_X[3] + COL_W[3];

function filaTabla(
  doc: PDFKit.PDFDocument,
  y: number,
  celdas: [string, string, string, string],
  opts: { negrita?: boolean; alinearDerechaDesde?: number } = {},
) {
  doc.font(opts.negrita ? "Helvetica-Bold" : "Helvetica").fontSize(10);
  celdas.forEach((texto, i) => {
    const align = i >= (opts.alinearDerechaDesde ?? 1) ? "right" : "left";
    doc.text(texto, COL_X[i]!, y, { width: COL_W[i], align });
  });
}

// Genera el PDF de una cotización. Dos vistas del mismo total:
// - "interno" (default): desglose real, incluye el % de margen — para uso
//   propio del negocio.
// - "cliente": el margen no se muestra como porcentaje (revela cuánto se
//   gana); se presenta como una línea de servicio con su monto en soles,
//   enmarcada como valor entregado (diseño/producción) en vez de markup.
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

    doc.font("Helvetica-Bold").fontSize(18).text("BANANA DECOPARTY");
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#555555")
      .text(`Cotización #${data.id} · emitida el ${new Date().toLocaleDateString("es-PE")}`);
    doc.fillColor("#000000").moveDown(1.5);

    doc.font("Helvetica-Bold").fontSize(12).text("Cliente");
    doc.font("Helvetica").fontSize(10);
    doc.text(data.cliente.nombre);
    doc.text(data.cliente.telefono);
    if (data.cliente.email) doc.text(data.cliente.email);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Evento");
    doc.font("Helvetica").fontSize(10);
    doc.text(data.nombreEvento);
    doc.text(`Tipo: ${data.tipoEvento.replace(/_/g, " ")}`);
    doc.moveDown(1.5);

    doc.font("Helvetica-Bold").fontSize(12).text("Materiales");
    doc.moveDown(0.5);

    let y = doc.y;
    filaTabla(doc, y, ["Material", "Cantidad", "Costo unit.", "Subtotal"], { negrita: true });
    y += 16;
    doc
      .moveTo(MARGEN, y)
      .lineTo(TABLA_DERECHA, y)
      .strokeColor("#cccccc")
      .stroke();
    y += 8;

    for (const item of data.items) {
      filaTabla(doc, y, [
        `${item.materialNombre} (${item.materialUnidad})`,
        item.cantidad,
        `${MONEDA} ${item.costoUnitarioSnapshot}`,
        `${MONEDA} ${item.subtotal}`,
      ]);
      y += 18;
    }
    doc.x = MARGEN;
    doc.y = y;
    doc.moveDown(1.5);

    const resumenValorW = 100;
    const resumenValorX = TABLA_DERECHA - resumenValorW;
    const resumenLabelX = MARGEN + 150;
    const resumenLabelW = resumenValorX - resumenLabelX;

    // La altura de fila no es fija: etiquetas largas como "Servicio de
    // decoración (diseño y producción)" pueden partirse en más de una
    // línea, y con una altura fija la siguiente fila (Total) quedaba
    // superpuesta encima del texto.
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
      vista === "cliente"
        ? `Instalación y montaje (${data.horasManoObraEstimadas} h)`
        : `Mano de obra (${data.horasManoObraEstimadas} h)`,
      `${MONEDA} ${data.costoManoObra}`,
    );
    lineaResumen("Transporte", `${MONEDA} ${data.costoTransporte}`);
    if (vista === "cliente") {
      lineaResumen(
        "Servicio de decoración (diseño y producción)",
        `${MONEDA} ${margenMonto.toFixed(2)}`,
      );
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
