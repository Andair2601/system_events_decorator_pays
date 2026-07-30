CREATE TABLE "album_fotos" (
	"id" serial PRIMARY KEY NOT NULL,
	"categoria" text NOT NULL,
	"reserva_id" integer,
	"s3_key" text NOT NULL,
	"url" text NOT NULL,
	"destacada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_fotos_categoria_check" CHECK ("album_fotos"."categoria" in ('cumpleanos_infantil','baby_shower','gender_reveal','otro'))
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	"email" text,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_telefono_unique" UNIQUE("telefono")
);
--> statement-breakpoint
CREATE TABLE "configuracion_costeo" (
	"id" serial PRIMARY KEY NOT NULL,
	"tarifa_mano_obra_hora" numeric(12, 2) NOT NULL,
	"margen_default_pct" numeric(5, 2) NOT NULL,
	"tarifa_transporte_default" numeric(12, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizacion_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cotizacion_id" integer NOT NULL,
	"material_id" integer NOT NULL,
	"cantidad" numeric(10, 2) NOT NULL,
	"costo_unitario_snapshot" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	CONSTRAINT "cotizacion_items_cantidad_check" CHECK ("cotizacion_items"."cantidad" > 0)
);
--> statement-breakpoint
CREATE TABLE "cotizaciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" integer NOT NULL,
	"nombre_evento" text NOT NULL,
	"tipo_evento" text NOT NULL,
	"imagen_referencia_url" text,
	"horas_mano_obra_estimadas" numeric(6, 2) DEFAULT '0' NOT NULL,
	"costo_mano_obra" numeric(12, 2) DEFAULT '0' NOT NULL,
	"costo_transporte" numeric(12, 2) DEFAULT '0' NOT NULL,
	"margen_pct_aplicado" numeric(5, 2) NOT NULL,
	"costo_materiales_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"precio_final" numeric(12, 2) DEFAULT '0' NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"origen" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cotizaciones_tipo_evento_check" CHECK ("cotizaciones"."tipo_evento" in ('cumpleanos_infantil','baby_shower','gender_reveal','otro')),
	CONSTRAINT "cotizaciones_estado_check" CHECK ("cotizaciones"."estado" in ('borrador','enviada','aceptada','rechazada')),
	CONSTRAINT "cotizaciones_origen_check" CHECK ("cotizaciones"."origen" in ('manual','whatsapp_agente'))
);
--> statement-breakpoint
CREATE TABLE "materiales" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"costo_unitario" numeric(12, 2) NOT NULL,
	"unidad" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materiales_categoria_check" CHECK ("materiales"."categoria" in ('globos','estructura','telas','iluminacion','letras','mobiliario','otros')),
	CONSTRAINT "materiales_unidad_check" CHECK ("materiales"."unidad" in ('pieza','metro','m2','hora','kit')),
	CONSTRAINT "materiales_costo_unitario_check" CHECK ("materiales"."costo_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" serial PRIMARY KEY NOT NULL,
	"cotizacion_id" integer,
	"cliente_id" integer NOT NULL,
	"fecha_evento" date NOT NULL,
	"hora_evento" time,
	"lugar" text NOT NULL,
	"estado" text DEFAULT 'confirmada' NOT NULL,
	"estado_pago" text DEFAULT 'pendiente' NOT NULL,
	"monto_pagado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"calendar_event_id" text,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservas_estado_check" CHECK ("reservas"."estado" in ('confirmada','en_progreso','completada','cancelada')),
	CONSTRAINT "reservas_estado_pago_check" CHECK ("reservas"."estado_pago" in ('pendiente','parcial','pagado'))
);
--> statement-breakpoint
ALTER TABLE "album_fotos" ADD CONSTRAINT "album_fotos_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_cotizacion_id_cotizaciones_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cotizacion_id_cotizaciones_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_album_categoria" ON "album_fotos" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "idx_cotizacion_items_cotizacion" ON "cotizacion_items" USING btree ("cotizacion_id");--> statement-breakpoint
CREATE INDEX "idx_cotizaciones_cliente" ON "cotizaciones" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "idx_cotizaciones_estado" ON "cotizaciones" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "idx_materiales_categoria" ON "materiales" USING btree ("categoria") WHERE "materiales"."activo";--> statement-breakpoint
CREATE INDEX "idx_reservas_fecha" ON "reservas" USING btree ("fecha_evento");--> statement-breakpoint
CREATE INDEX "idx_reservas_cliente" ON "reservas" USING btree ("cliente_id");