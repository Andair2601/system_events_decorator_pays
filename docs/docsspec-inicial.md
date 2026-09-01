# Prompt de inicialización — Sistema de Gestión para Negocio de Decoraciones de Eventos

Copia y pega este prompt completo en Claude Code para arrancar el proyecto.

---

## PROMPT

Quiero que me ayudes a construir, paso a paso, un sistema web para gestionar un negocio de decoración de eventos (cumpleaños, baby shower, gender reveal, decoración infantil, etc). Te doy el contexto completo del negocio y la arquitectura objetivo, y luego trabajamos por fases. Empezamos por la Fase 1, pero **quiero que el proyecto se estructure desde el inicio pensando en las fases futuras**, para no tener que reescribir cosas.

### Contexto del negocio

Soy dueño de un negocio de decoración de eventos. Hoy mi flujo de trabajo es 100% manual:

- Los clientes me escriben por WhatsApp pidiendo información y cotizaciones.
- Me mandan una imagen de la decoración que quieren, yo identifico "a ojo" los materiales que contiene y calculo un precio de memoria, sin un sistema de costeo consistente.
- Cuando se agenda un evento, la información (fecha, lugar, materiales, costo) queda perdida en el historial de WhatsApp, sin ningún registro estructurado.
- No tengo un catálogo de precios ni una forma de mostrar rápidamente mi portafolio de trabajos anteriores quesirvan de referencia (álbumes por categoría).

### Objetivo del sistema (visión completa a futuro)

Un sistema donde:
1. Tengo un **catálogo de materiales** con costos unitarios reales (globos, estructuras, telas, luces, letras, etc.).
2. Puedo generar **cotizaciones** de forma consistente, componiendo materiales + mano de obra + transporte + margen, en vez de calcular a ojo.
3. Puedo **agendar reservas** (fecha, lugar, cliente, decoración, estado de pago) y quedan con historial completo, sin depender de WhatsApp como base de datos.
4. Tengo **álbumes de fotos** organizados por categoría (cumpleaños infantil, baby shower, gender reveal, etc.) para poder compartir referencias rápido.
5. Eventualmente, un **agente conversacional (Claude con tool use)** conectado a WhatsApp Business Cloud API que puede: responder preguntas de clientes, analizar una imagen de referencia que envíe el cliente, armar una cotización automática usando el catálogo, consultar disponibilidad en Google Calendar, y agendar directamente — todo mientras yo reviso y apruebo antes de que se envíe (al menos en una primera etapa).
6. Notificaciones automáticas por email (confirmaciones, recordatorios) y opcionalmente una sincronización de solo-lectura hacia Notion como panel visual cómodo para mí.

### Arquitectura objetivo (referencia, no todo se construye ahora)

```
WhatsApp Business Cloud API (Meta)
        │
        ▼
Webhook / API Gateway ──▶ Agente Orquestador (Claude + tool use)
        │                          │
        ▼                          ├──▶ Motor de Cotización (catálogo + reglas de costeo)
   Web App (este proyecto)         ├──▶ Base de Datos (reservas, clientes, catálogo)
        │                          ├──▶ Google Calendar API (disponibilidad y agendado)
        ▼                          ├──▶ S3 + CloudFront (álbumes de fotos)
   Panel de administración         ├──▶ SES (emails de confirmación/recordatorio)
                                   └──▶ Sync opcional a Notion (panel visual)
```

### Fases del proyecto

**Fase 1 (empezamos AHORA):**
- Catálogo de materiales (CRUD): nombre, categoría, costo unitario, unidad de medida.
- Motor de cotización: composición de materiales + mano de obra + transporte + margen configurable → precio final con desglose.
- Registro de cotizaciones generadas (guardarlas, no solo calcularlas al vuelo).
- Módulo de reservas/eventos: fecha, lugar, cliente, decoración asociada, estado (cotizado / confirmado / pagado / completado), costo real vs. cotizado.
- Panel de administración web simple para gestionar todo lo anterior.

**Fase 2 (futuro cercano):**
- Álbum de fotos por categoría con carga y organización de imágenes (pensar ya el modelo de datos para que una decoración/cotización pueda referenciar imágenes).
- Autenticación básica (soy el único usuario admin por ahora, pero dejar la puerta abierta a multi-usuario).

**Fase 3 (futuro):**
- Integración con Google Calendar (consulta de disponibilidad, creación de eventos).
- Notificaciones por email (SES o similar).

**Fase 4 (futuro):**
- Agente conversacional con Claude (tool use) conectado a WhatsApp Business Cloud API, usando como "tools" las funciones ya construidas en las fases anteriores (buscar precio, crear cotización, consultar disponibilidad, agendar, guardar cliente).
- Análisis de imágenes enviadas por clientes para pre-identificar materiales.

**Fase 5 (opcional):**
- Sincronización de solo lectura hacia Notion como panel visual alternativo.

### Esquema de base de datos (ya validado, úsalo como base)

Este es el esquema de Postgres que quiero que uses como punto de partida para la Fase 1 (algunos campos anticipan fases futuras a propósito, como `imagen_referencia_url`, `origen`, `calendar_event_id`; inclúyelos aunque no se usen todavía, para no requerir migraciones destructivas más adelante):

```
clientes
├── id (PK)
├── nombre
├── telefono (unique)
├── email
├── notas
├── created_at

materiales
├── id (PK)
├── nombre
├── categoria         -- globos, estructura, telas, iluminacion, letras, etc.
├── costo_unitario
├── unidad            -- pieza, metro, m2, hora
├── activo            -- soft delete
├── created_at, updated_at

configuracion_costeo
├── id (PK)
├── tarifa_mano_obra_hora
├── margen_default_pct
├── tarifa_transporte_default

cotizaciones
├── id (PK)
├── cliente_id (FK)
├── nombre_evento
├── tipo_evento             -- enum: cumpleanos_infantil, baby_shower, gender_reveal, etc.
├── imagen_referencia_url
├── horas_mano_obra_estimadas
├── costo_mano_obra
├── costo_transporte
├── margen_pct_aplicado
├── costo_materiales_total  -- calculado
├── precio_final            -- calculado
├── estado                  -- borrador, enviada, aceptada, rechazada
├── origen                  -- manual, whatsapp_agente
├── created_at, updated_at

cotizacion_items
├── id (PK)
├── cotizacion_id (FK)
├── material_id (FK)
├── cantidad
├── costo_unitario_snapshot  -- congela el precio al momento de cotizar
├── subtotal

reservas
├── id (PK)
├── cotizacion_id (FK)
├── cliente_id (FK)
├── fecha_evento
├── hora_evento
├── lugar
├── estado                  -- confirmada, en_progreso, completada, cancelada
├── estado_pago             -- pendiente, parcial, pagado
├── monto_pagado
├── calendar_event_id       -- Fase 3
├── notas
├── created_at, updated_at

album_fotos                 -- modelar ya, implementar en Fase 2
├── id (PK)
├── categoria
├── reserva_id (FK, nullable)
├── s3_key
├── url
├── destacada
├── created_at
```

### Infraestructura y despliegue en AWS

Quiero desplegar la base de datos y la infraestructura base en **AWS**, usando **AWS CDK** como herramienta de Infraestructura como Código (no Terraform: quiero quedarme dentro del ecosistema nativo de AWS, y que los roles/políticas IAM queden modelados como código dentro del propio CDK, versionados en el repo). Como parte del arranque del proyecto, necesito que hagas lo siguiente:

#### Selección de servicios (optimizar costo, negocio en etapa inicial)

Quiero que confirmes o ajustes esta selección de servicios, justificando brevemente, priorizando siempre la opción de menor costo que sea razonable para un negocio pequeño que recién está digitalizando su operación (evitar sobre-ingeniería y recursos "always-on" innecesarios):

- **Cómputo**: AWS Lambda + API Gateway (HTTP API, no REST API) para la capa de servicios/API. Evitar EC2 o ECS con instancias corriendo 24/7 mientras el volumen de uso sea bajo.
- **Base de datos**: RDS Postgres, instancia `db.t4g.micro`, Single-AZ (no Multi-AZ todavía), backups automáticos con retención corta (7 días). Evaluar si Aurora Serverless v2 conviene más solo si el patrón de uso es muy intermitente (verifica el pricing vigente antes de recomendarlo, ya que estos precios cambian).
- **Frontend**: S3 + CloudFront, o AWS Amplify Hosting si simplifica el CI/CD.
- **Álbum de fotos**: S3 Standard + CloudFront, con lifecycle rule que mueva a S3-IA las fotos de eventos ya completados hace más de X meses.
- **Secretos**: SSM Parameter Store (SecureString) en lugar de Secrets Manager, salvo que se necesite rotación automática de credenciales (en ese caso, justifícalo).
- **Email**: SES.
- **Logs**: CloudWatch Logs con política de retención de 14-30 días (no indefinida).
- **Presupuesto**: configura una alerta de AWS Budgets (ej. avisar si el gasto mensual supera un umbral que yo defina) como parte del despliegue inicial, para tener visibilidad temprana de cualquier desvío de costo.

#### Gestión de roles y permisos IAM

Quiero que los roles y políticas IAM que necesite el sistema (rol de ejecución de las Lambdas, permisos de acceso a RDS/S3/SES, etc.) se definan **como código dentro del propio proyecto CDK** (un stack o construct dedicado a IAM), de forma que:
- Cada rol y cada política queden versionados en el repo y sean revisables en un PR antes de aplicarse.
- Cada rol tenga el mínimo permiso necesario para su función específica (ej. el rol de la Lambda de cotizaciones solo puede leer/escribir en las tablas que le corresponden, no acceso amplio a todo RDS o todo S3).
- Documentes en `docs/infra.md` qué rol existe, para qué servicio es, y qué permisos tiene, cada vez que se cree uno nuevo.

Para el **usuario IAM inicial** que tú (Claude Code) vas a usar para hacer `cdk bootstrap` y los despliegues (este es el único que no puede gestionarse "como código" porque es el que arranca todo lo demás), yo lo voy a crear manualmente en la consola de AWS usando una política que ya tengo preparada. Cuando arranquemos, dime exactamente qué nombre de perfil de AWS CLI vas a usar para operar, y verifica que tengas los permisos necesarios antes de intentar el primer despliegue.

1. **Antes de ejecutar cualquier comando de despliegue, pídeme explícitamente los accesos de AWS que necesitas**, especificando con precisión:
   - Qué credenciales necesitas (Access Key + Secret Key de un usuario IAM específico para este proyecto, **nunca las credenciales root de la cuenta**).
   - Qué permisos/políticas IAM debo asignarle a ese usuario para que puedas trabajar (por ejemplo: permisos acotados sobre RDS, VPC, EC2 —solo lo necesario para las subredes y security groups—, IAM para crear roles de servicio, S3, Secrets Manager, y CloudWatch Logs). Quiero que me des la lista exacta de acciones/servicios necesarios para la Fase 1, siguiendo el **principio de mínimo privilegio** (no `AdministratorAccess`).
   - Si necesitas crear tú mismo roles o políticas IAM adicionales durante el despliegue (ej. un rol de ejecución para un servicio), dime cuáles antes de crearlos y para qué sirven cada uno.
2. Recomiéndame si conviene usar **RDS Postgres** (más robusto, con backups automáticos, Multi-AZ opcional) frente a alternativas más económicas para esta etapa temprana (ej. una instancia Postgres en un contenedor sobre un EC2 pequeño, o Aurora Serverless v2 si quiero pagar por uso). Justifica según costo esperado para un negocio pequeño en etapa inicial.
3. Las credenciales de conexión a la base de datos (host, usuario, password) deben guardarse en **AWS Secrets Manager** o variables de entorno seguras, nunca hardcodeadas en el repo.
4. Documenta en el propio repo (`docs/infra.md`) los recursos de AWS que se van creando, para qué sirve cada uno y cómo destruirlos si hiciera falta (`terraform destroy` o equivalente), para que yo mantenga control total y visibilidad de costos.
5. Antes de crear cualquier recurso que tenga costo (RDS, NAT Gateway, etc.), avísame y confirma conmigo, indicando el costo aproximado mensual esperado.

#### Ambientes: dev y prod

Voy a trabajar con dos ambientes separados, **dev** y **prod**, desde el día uno. Ten en cuenta:

- **Convención de nombres obligatoria**: todos los recursos (stacks de CDK, buckets S3, roles IAM, parámetros SSM, etc.) deben nombrarse con el patrón `deco-eventos-{env}-*` (ej. `deco-eventos-dev-db`, `deco-eventos-prod-db`, `deco-eventos-dev-fotos`, `deco-eventos-prod-fotos`). Esto es importante porque el usuario IAM que voy a usar para desplegar ya tiene permisos acotados al prefijo `deco-eventos-*`, así que ambos ambientes quedan cubiertos sin tener que pedir permisos adicionales — pero si te sales de esa convención, los despliegues van a fallar por falta de permisos.
- Estructura el proyecto CDK como una sola app parametrizada por ambiente (ej. un `Stage` de CDK o un parámetro de contexto `--context env=dev|prod`), reutilizando los mismos constructs para ambos, no dos proyectos separados ni código duplicado.
- **Bases de datos completamente separadas** (una instancia RDS para dev, otra para prod) — nunca compartir la misma instancia ni el mismo esquema entre ambientes.
- Dev puede quedar con la configuración mínima ya descrita (`db.t4g.micro`, Single-AZ, backups cortos). Para prod, aunque empecemos con el mismo tamaño de instancia por costo, quiero que actives **snapshot antes de cualquier cambio estructural (migración de esquema)** y que la retención de backups en prod sea de al menos 7 días.
- Configura **una alerta de AWS Budgets separada por ambiente** (o con tags que permitan diferenciar el gasto de dev vs. prod en Cost Explorer), para detectar rápido si dev se vuelve más caro de lo esperado.
- El flujo de despliegue debe diferenciar claramente los dos ambientes: dev se puede desplegar libremente mientras iteramos, pero **antes de desplegar a prod, muéstrame el diff/plan (`cdk diff`) y pide mi confirmación explícita** — nunca despliegues a prod de forma automática o silenciosa.
- Las variables de entorno y configuración (connection strings, etc.) deben mantenerse separadas por ambiente, nunca hardcodeadas ni compartidas entre dev y prod.

### Requisitos técnicos para la Fase 1

- Estructura de proyecto que permita crecer hacia una API + frontend separados (o full-stack framework que soporte ambos con claridad), pensando en que en el futuro un Lambda/webhook externo (el agente de WhatsApp) va a necesitar invocar la misma lógica de negocio (cotización, disponibilidad, registro de reservas) que usa el panel web. Por eso: **la lógica de negocio (cotizador, gestión de catálogo, gestión de reservas) debe vivir en una capa de servicios/API bien separada de la UI**, no mezclada en componentes de frontend.
- Base de datos relacional (prefiero Postgres) con un esquema claro para: `materiales`, `cotizaciones`, `cotizacion_items` (detalle de qué materiales y cantidades componen cada cotización), `clientes`, `reservas`.
- El motor de cotización debe calcular: costo de materiales (según cantidades) + mano de obra (tarifa configurable) + transporte (monto configurable por cotización) + margen (% configurable, aplicado sobre costo) = precio final, mostrando el desglose completo (no solo el total).
- Quiero poder editar el catálogo de materiales y sus costos sin tocar código.
- El panel debe ser simple, funcional, sin necesidad de diseño elaborado todavía — priorizamos que funcione y que el modelo de datos sea sólido.
- Sugiéreme el stack técnico concreto (framework frontend/backend, ORM, etc.) antes de empezar a generar código, justificando brevemente la elección pensando en las fases futuras (especialmente que la lógica de negocio sea reutilizable por un agente/webhook externo más adelante).

### Cómo quiero trabajar contigo en este proyecto

- Antes de escribir código, propón el esquema de base de datos completo para la Fase 1 (con los campos que anticipan las fases futuras, aunque no se usen todavía) y espera mi aprobación.
- Construye por partes verificables: primero el esquema y modelos, luego el motor de cotización con tests, luego el CRUD de catálogo, luego reservas, luego el panel.
- Explícame las decisiones técnicas relevantes a medida que avanzamos, soy ingeniero informático así que puedes ser técnico.

---

## Notas de uso

- Pega el bloque bajo "PROMPT" directamente en Claude Code al iniciar el proyecto (idealmente en una carpeta vacía nueva).
- Si Claude Code te pregunta por el stack antes de proponerlo, puedes orientarlo con: backend en Node/TypeScript (Express o Fastify) o Python (FastAPI), ORM Prisma o SQLAlchemy, frontend con React, base de datos Postgres. Pero es mejor dejar que primero te proponga y justifique, y tú decides.
- Guarda este archivo en el repo del proyecto (ej. `docs/spec-inicial.md`) para que sirva de referencia cuando retomes el desarrollo en otra sesión.