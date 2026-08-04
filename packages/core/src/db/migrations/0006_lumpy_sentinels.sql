CREATE TABLE "reserva_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"reserva_id" integer NOT NULL,
	"material_id" integer,
	"descripcion" text NOT NULL,
	"cantidad" numeric(10, 2),
	"completado" boolean DEFAULT false NOT NULL,
	"origen" text DEFAULT 'adicional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reserva_items_origen_check" CHECK ("reserva_items"."origen" in ('cotizacion','adicional'))
);
--> statement-breakpoint
ALTER TABLE "reserva_items" ADD CONSTRAINT "reserva_items_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserva_items" ADD CONSTRAINT "reserva_items_material_id_materiales_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materiales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reserva_items_reserva" ON "reserva_items" USING btree ("reserva_id");