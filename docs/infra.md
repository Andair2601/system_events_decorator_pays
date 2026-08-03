# Infraestructura AWS

Definida como código en `infra/` (AWS CDK v2, TypeScript). Una sola app
parametrizada por ambiente (`dev` / `prod`), misma cuenta de AWS, región
`us-east-1`. Todo recurso sigue la convención de nombres
`deco-eventos-{ambiente}-*`.

## Arquitectura (Fase 1)

```
Navegador
   │
   ▼
CloudFront (deco-eventos-{ambiente}-panel)  ──sirve──  S3 privado (build de apps/web)
   │
   │ (llamadas fetch a la API)
   ▼
API Gateway HTTP API (deco-eventos-{ambiente}-api-gateway)
   │
   ▼
Lambda "deco-eventos-{ambiente}-api" (Node 24, ARM64, Hono vía hono/aws-lambda)
   │  (dentro de la VPC, subred aislada, sin acceso a internet, SSL)
   ▼
RDS Postgres "deco-eventos-{ambiente}-db" (db.t4g.micro, Single-AZ)
```

Además, un tercer Lambda `deco-eventos-{ambiente}-migrate` (misma VPC/SG,
sin exponerse vía API Gateway) para aplicar migraciones — ver sección
"Migraciones" más abajo.

## Panel web (S3 + CloudFront)

El build estático de `apps/web` (`vite build`) se sube a un bucket S3
privado (`deco-eventos-{ambiente}-panel-{accountId}`, bloqueado a acceso
público directo) y se sirve por una distribución de CloudFront que
accede al bucket vía Origin Access Control — nunca hay un bucket policy
público. CloudFront maneja el enrutamiento del lado del cliente de React
Router: los 403/404 de rutas que no existen como archivo en S3 (ej.
`/reservas`) se reescriben a `index.html` con status 200.

**Detalle importante del flujo de deploy**: Vite hornea la URL de la API
dentro del JS en tiempo de *build*, no es una variable de entorno de
runtime. Por eso el orden es:

1. `cdk deploy` (para tener/confirmar la URL de la API de ese ambiente).
2. `VITE_API_URL=<url-de-la-api> pnpm --filter @deco-eventos/web build`
   — genera `apps/web/dist`.
3. `cdk deploy` de nuevo — `BucketDeployment` sincroniza `dist/` al
   bucket e invalida la caché de CloudFront automáticamente.

Costo: prácticamente $0/mes a este volumen — CloudFront tiene un free
tier permanente de 1TB de transferencia + 10M requests/mes (no es solo
para cuentas nuevas), y S3 para unos cientos de KB de assets es
centavos.

- **VPC sin NAT Gateway ni Internet Gateway**: Lambda solo necesita hablar
  con RDS dentro de la misma VPC, así que alcanza con subredes
  `PRIVATE_ISOLATED`. Esto evita el costo fijo de un NAT Gateway
  (~$32+/mes) que no aporta nada acá.
- **Credenciales de base de datos**: autogeneradas por RDS y guardadas en
  **AWS Secrets Manager** (`deco-eventos-{ambiente}-db-credentials`), nunca
  en el repo. El connection string completo se arma con una referencia
  dinámica de CloudFormation (`{{resolve:secretsmanager:...}}`) y se
  inyecta como variable de entorno `DATABASE_URL` del Lambda en el momento
  del deploy. Esto significa que el Lambda **nunca llama a Secrets Manager
  en runtime**, por lo que tampoco necesita salida a internet ni un VPC
  endpoint (que también tiene costo).
- **Logs**: CloudWatch Logs con retención de 14 días
  (`/aws/lambda/deco-eventos-{ambiente}-api`).
- **Presupuesto**: un `AWS Budget` mensual por ambiente con alertas por
  email al 80% y 100% del gasto esperado.
- **SSL obligatorio con RDS**: la instancia exige conexiones cifradas
  (`no pg_hba.conf entry ... no encryption` si no se usa). Los Lambdas se
  conectan con `DB_SSL=require` (ver `packages/core/src/db/client.ts`);
  el Postgres local de `docker-compose` no lo requiere, así que esa
  variable solo se setea en la stack de CDK, nunca en `.env` local.

## Migraciones

`deco-eventos-{ambiente}-migrate` es un Lambda separado (mismo acceso a
la VPC/RDS que la API, sin ruta pública) que corre
`drizzle-orm/postgres-js/migrator` contra las migraciones de
`packages/core/src/db/migrations`. **No se invoca automáticamente en cada
deploy** — decisión explícita: la alternativa (Custom Resource de CDK que
corra la migración dentro del propio deploy) es más cómoda pero más
frágil, porque una migración fallida puede trabar o hacer rollback de
todo el stack, no solo del cambio de esquema.

Se corre a mano después de un deploy con cambios de esquema:

```
aws lambda invoke --profile deco-eventos --function-name deco-eventos-{ambiente}-migrate --region us-east-1 out.json
cat out.json   # {"ok":true} si salió bien
```

Las migraciones (`.sql` + carpeta `meta/`) no son código JS, así que
esbuild no las empaqueta solo: `infra/lib/deco-eventos-stack.ts` las
copia al bundle con un `commandHook` que invoca
`infra/lib/copy-migrations.mjs` (un script propio, no `cp` ni `node -e`
inline, para no depender de cómo cada shell —cmd.exe en Windows vs sh en
Linux/Mac— maneja el anidamiento de comillas).

## Por qué Secrets Manager y no SSM Parameter Store

El plan original mencionaba SSM Parameter Store SecureString como opción;
se usó Secrets Manager en su lugar porque `rds.DatabaseInstance` lo
integra de forma nativa (genera y guarda la contraseña automáticamente, sin
código extra), y el requisito explícito del negocio permite cualquiera de
las dos ("Secrets Manager o variables de entorno seguras"). Si se prefiere
SSM en su lugar, es un cambio acotado a `infra/lib/deco-eventos-stack.ts`.

## Empaquetado del Lambda

El handler (`packages/api/src/lambda.ts`) se empaqueta con `esbuild` local
(no requiere Docker). `pdfkit` (usado para exportar cotizaciones a PDF)
trae archivos de datos de fuentes (`.afm`) que esbuild no sabe empaquetar
dentro de un bundle; por eso se instala como dependencia real del paquete
Lambda (`bundling.nodeModules: ["pdfkit"]`) en vez de compilarse inline,
preservando esos archivos. Verificado con `cdk synth` (bundle incluye
`node_modules/pdfkit` con sus 14 `.afm`) y contra el Lambda ya desplegado
en AWS (`GET /cotizaciones/:id/pdf` devolvió un PDF válido de verdad).

## Costo mensual estimado (por ambiente)

| Recurso | Estimado |
|---|---|
| RDS db.t4g.micro Single-AZ + 20GB gp3 + backups 7 días | ~$14-15 |
| Lambda (bajo volumen, dentro del free tier) | ~$0 |
| API Gateway HTTP API (bajo volumen) | ~$0-1 |
| CloudWatch Logs | ~$0-1 |
| Secrets Manager (1 secreto) | ~$0.40 |
| VPC (sin NAT/IGW) | $0 |
| Panel web (S3 + CloudFront) | ~$0-1 |
| **Total por ambiente** | **~$15-18/mes** |

Con `dev` y `prod` desplegados simultáneamente: **~$30-34/mes** en total.
El bucket S3 y el repo ECR que crea `cdk bootstrap` (una sola vez,
compartido entre ambientes) agregan centavos.

## Modelo de permisos IAM

Dos capas:

1. **Usuario IAM `deco-eventos-deployer`** (credenciales que usa quien
   despliega): gestiona el stack `CDKToolkit` y stacks que empiecen con
   `deco-eventos-*`, y asume los roles que crea `cdk bootstrap`
   (`cdk-hnb659fds-*-role-*`). No tiene permisos directos sobre EC2, RDS,
   etc. — esos los ejerce el rol de CloudFormation, no el usuario.
   Además de la política inicial, se agregaron dos statements de solo
   lectura/invocación necesarios para operar después del deploy (no para
   desplegar en sí):
   - `lambda:InvokeFunction` en `arn:...:function:deco-eventos-*` — para
     poder correr el Lambda de migraciones a mano.
   - `logs:GetLogEvents`, `logs:FilterLogEvents`,
     `logs:DescribeLogStreams`, `logs:DescribeLogGroups` en
     `arn:...:log-group:/aws/lambda/deco-eventos-*:*` — para poder
     diagnosticar errores de los Lambdas sin depender solo de lo que
     devuelve `aws lambda invoke`.
2. **Roles de CloudFormation** (creados por `cdk bootstrap`, solo
   asumibles por CloudFormation): estos sí tienen permisos amplios,
   porque son los que efectivamente crean VPC/RDS/Lambda/API Gateway
   durante el deploy. Es el modelo estándar de CDK.

## Proceso de deploy

1. `cdk bootstrap` (una sola vez por cuenta/región).
2. `cdk diff deco-eventos-dev` — revisar cambios.
3. `cdk deploy deco-eventos-dev` — solo con confirmación explícita.
4. Para `prod`: siempre `cdk diff deco-eventos-prod` primero, mostrado al
   usuario, y confirmación explícita antes de `cdk deploy
   deco-eventos-prod`. Nunca automático.

## Problemas reales encontrados en el primer deploy (y su fix)

Quedan documentados porque son errores concretos que costó diagnosticar,
no hipotéticos — útil si algo similar vuelve a pasar en `prod`:

1. **Descripción de security group con `>`**: `lambdaSg.connections
   .allowTo(dbSg, ec2.Port.tcp(5432), "Lambda -> Postgres")` — EC2
   rechaza `>` en descripciones de reglas (`InvalidRequest`). Fix: sin
   caracteres especiales en la descripción.
2. **Versión de Postgres retirada**: `PostgresEngineVersion.VER_16_4`
   dejó de estar disponible en RDS (`Cannot find version 16.4`). Fix: se
   usa `VER_16` (sin minor fijo) para que RDS tome el default vigente de
   la rama 16 y no se rompa de nuevo cuando retiren otro minor.
3. **Comillas anidadas en Windows**: el `commandHook` de bundling corre
   vía `cmd.exe /c ...`, y `node -e "...JSON.stringify..."` con comillas
   dobles anidadas rompía el parseo de `cmd.exe` (no de Node). Fix: un
   script propio (`copy-migrations.mjs`) invocado con rutas como
   argumentos, sin código inline entre comillas.
4. **RDS exige SSL**: el error real (`no pg_hba.conf entry for host ...,
   no encryption`) solo apareció al capturar explícitamente
   `err.cause.message` del `PostgresError` — por defecto esa propiedad no
   es enumerable y `Object.entries(err)` no la mostraba, así que el error
   se veía como un genérico `28000` sin explicación. Fix funcional:
   `DB_SSL=require` en los Lambdas. Fix de diagnóstico: capturar
   propiedades del error por nombre explícito, no con `Object.entries`.

## Álbum de fotos (Fase 2)

Bucket S3 privado adicional (`deco-eventos-{ambiente}-fotos-{accountId}`),
servido públicamente por la **misma** distribución de CloudFront del panel
(`additionalBehaviors["/fotos/*"]`, origin propio vía OAC) — no se crea una
segunda distribución.

**El Lambda de la API nunca llama a S3 por red.** Sigue en subred aislada
sin salida a internet; para subir/borrar objetos necesitaría alcanzar S3
por HTTP, y eso exigiría un VPC Gateway Endpoint + reglas de egress
nuevas. Se evitó ese costo/complejidad con este flujo:

1. El navegador pide `POST /album/upload-url` con el `contentType` del
   archivo.
2. El Lambda **firma** una URL de subida (`PutObjectCommand` +
   `getSignedUrl`) — esto es una operación criptográfica local (HMAC), no
   hace ninguna llamada de red a AWS. Solo necesita el permiso IAM
   (`fotosBucket.grantPut(apiFn)`, un policy attachment, no networking).
3. El navegador sube el archivo **directo a S3** con esa URL.
4. El navegador confirma con `POST /album` (categoria, s3Key, url,
   reservaId?, destacada?) — inserción de fila normal, sin tocar S3.

**CORS en el bucket**: el PUT desde el navegador dispara un preflight
CORS que S3 rechaza por defecto (403 en el `OPTIONS`) — a diferencia de
`curl`, que no hace preflight y por eso un test con `curl` contra la URL
firmada puede pasar sin que el flujo real del navegador funcione. El
bucket tiene `cors: [{ allowedMethods: ["PUT"], allowedOrigins: ["*"],
allowedHeaders: ["*"] }]`; el origen queda abierto a propósito porque la
seguridad real la da la firma/expiración de la URL prefirmada (5 min), no
el CORS.

**Prefijo de la key**: `buildFotoKey()` (`packages/api/src/s3.ts`) genera
keys como `fotos/<uuid>.<ext>` — el prefijo `fotos/` vive dentro de la key
misma, no se concatena aparte al construir la URL pública, porque el path
que CloudFront reenvía al origen tiene que calzar exactamente con el
objeto real en el bucket.

**Borrar una foto no borra el objeto de S3**, solo la fila en
`album_fotos` — decisión explícita para no necesitar que el Lambda
alcance S3 por red. El objeto queda huérfano (invisible para la app, ya
que nada referencia esa key) a un costo marginal de almacenamiento. Si
algún día hace falta reconciliar/limpiar objetos huérfanos, tendría que
ser un script corrido desde una máquina con internet normal, no desde
este Lambda.

**Limitación conocida (no resuelta)**: `errorResponses` (403/404 →
`index.html`) es a nivel de distribución completa, no por behavior. Una
foto realmente inexistente bajo `/fotos/*` también se reescribe a
`index.html` con 200 en vez de un 404 real — se ve como imagen rota en el
`<img>` de todas formas, así que se dejó así. Arreglarlo requeriría una
CloudFront Function o una segunda distribución.

## Pendiente

- Deploy a `prod`: siempre con `cdk diff deco-eventos-prod` mostrado y
  confirmación explícita antes de `cdk deploy deco-eventos-prod`.
- Fase 3/4: Google Calendar, SES, WhatsApp — no cubiertos por este stack
  todavía.
- Reconciliación de objetos huérfanos en `deco-eventos-{ambiente}-fotos`
  (ver sección de álbum de fotos arriba) — no implementado, no es
  urgente al volumen actual.

## Pines de versión de `@aws-sdk/*` (política de supply-chain de pnpm)

`pnpm-workspace.yaml` fija `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
y sus dependencias transitivas (`@aws-sdk/core`, `credential-provider-*`,
etc.) a versiones exactas publicadas hace unos días. Esto no es un
capricho: pnpm (desde esta versión) rechaza por política de
supply-chain (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`) instalar paquetes
publicados muy recientemente, y el SDK de AWS saca releases de sus
subpaquetes casi a diario. Fijar solo `client-s3`/`s3-request-presigner`
en `package.json` **no alcanza**, porque sus dependencias transitivas
tienen rangos semver propios (`^3.x`) que igual resuelven a lo último
publicado. El bundling del Lambda (`cdk deploy`/`cdk diff`) corre
`pnpm install` con el lockfile del repo, así que esta política se aplica
también ahí, no solo en desarrollo local.

Si en el futuro hace falta actualizar el SDK de AWS, hay que resolver
versiones nuevas que ya tengan unos días de publicadas (no
`^ultima-version`) y actualizar los `overrides` de `pnpm-workspace.yaml`
en conjunto — actualizar solo `package.json` vuelve a romper el bundling.
