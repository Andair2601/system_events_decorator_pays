# Infraestructura AWS

Definida como código en `infra/` (AWS CDK v2, TypeScript). Una sola app
parametrizada por ambiente (`dev` / `prod`), misma cuenta de AWS, región
`us-east-1`. Todo recurso sigue la convención de nombres
`deco-eventos-{ambiente}-*`.

## Arquitectura

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
   │  (sin VPC — internet público, SSL)
   ▼
Postgres administrado por Supabase (pooler de Supavisor, sesión, puerto 5432)
```

Además, un tercer Lambda `deco-eventos-{ambiente}-migrate` (sin exponerse
vía API Gateway) para aplicar migraciones — ver sección "Migraciones" más
abajo.

**Nota histórica**: hasta 2026-09-01 la base era RDS Postgres
(`deco-eventos-{ambiente}-db`, `db.t4g.micro`), con ambas Lambdas dentro
de una VPC de subredes aisladas (sin NAT/IGW) solo para poder alcanzarla
de forma privada. Se migró a Supabase para eliminar el costo fijo de RDS
mientras el proyecto sigue en fase de pruebas — ver "Migración a
Supabase" más abajo para el detalle completo, incluidos los problemas
reales que aparecieron en el proceso.

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

- **Sin VPC**: ninguna de las dos Lambdas necesita estar en una VPC —
  Supabase se alcanza por internet público. Esto también simplifica el
  stack (menos recursos EC2 que gestionar/pagar cuenta de errores) frente
  al diseño anterior con RDS.
- **Credenciales de base de datos**: el connection string de Supabase vive
  en **AWS Secrets Manager** (`deco-eventos-{ambiente}-database-url`),
  creado a mano fuera de CDK (no autogenerado, a diferencia de cuando era
  RDS). Se referencia con `secretsmanager.Secret.fromSecretNameV2(...)` y
  se inyecta como variable de entorno `DATABASE_URL` del Lambda vía
  `{{resolve:secretsmanager:...}}` en tiempo de deploy — el Lambda nunca
  llama a Secrets Manager en runtime.
- **Logs**: CloudWatch Logs con retención de 14 días
  (`/aws/lambda/deco-eventos-{ambiente}-api`).
- **Presupuesto**: un `AWS Budget` mensual por ambiente con alertas por
  email al 80% y 100% del gasto esperado.
- **SSL obligatorio**: Supabase exige conexiones cifradas igual que RDS.
  Los Lambdas se conectan con `DB_SSL=require` (ver
  `packages/core/src/db/client.ts`); el Postgres local de
  `docker-compose` no lo requiere, así que esa variable solo se setea en
  la stack de CDK, nunca en `.env` local.
- **`DB_PREPARE=false` en la Lambda de la API**: Supavisor (el pooler de
  Supabase) puede no preservar prepared statements entre reconexiones del
  pool. Se deshabilitan explícitamente en la Lambda que corre bajo
  invocaciones concurrentes reales (no en la de migraciones, que usa una
  sola conexión). Mismo patrón de env var que `DB_SSL`, ver
  `packages/core/src/db/client.ts`.

## Migraciones

`deco-eventos-{ambiente}-migrate` es un Lambda separado (sin ruta
pública) que corre `drizzle-orm/postgres-js/migrator` contra las
migraciones de `packages/core/src/db/migrations`. **No se invoca
automáticamente en cada
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

Al migrar a Supabase (2026-09-01) se intentó primero SSM Parameter Store
SecureString en vez de Secrets Manager, para ahorrar los ~$0.40/mes del
secreto (motivo: sin RDS ya no hay una integración nativa que lo
justifique). **No funciona**: CloudFormation no soporta referencias
dinámicas `{{resolve:ssm-secure:...}}` en variables de entorno de Lambda
— confirmado en un intento real de deploy (`ValidationError: SSM Secure
reference is not supported in: AWS::Lambda::Function/.../DATABASE_URL`).
Es una limitación documentada de AWS, no evitable con permisos ni config.
Secrets Manager sí soporta `{{resolve:secretsmanager:...}}` en env vars
de Lambda, así que se volvió a ese mecanismo. El costo (~$0.40/mes) es
negligible frente a los ~$15/mes que se ahorran al sacar RDS.

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

Desde la migración a Supabase (2026-09-01), ya no hay RDS en la cuenta de
AWS — la base vive en el free tier de Supabase (fuera de este cálculo de
AWS; ver "Migración a Supabase" abajo por sus propias limitaciones).

| Recurso | Estimado |
|---|---|
| Lambda (bajo volumen, dentro del free tier) | ~$0 |
| API Gateway HTTP API (bajo volumen) | ~$0-1 |
| CloudWatch Logs | ~$0-1 |
| Secrets Manager (1 secreto, connection string de Supabase) | ~$0.40 |
| Panel web (S3 + CloudFront) | ~$0-1 |
| **Total por ambiente** | **~$1-3/mes** |

El bucket S3 y el repo ECR que crea `cdk bootstrap` (una sola vez,
compartido entre ambientes) agregan centavos.

## Migración a Supabase (2026-09-01)

Se migró la base de `dev` de RDS a Supabase para eliminar el costo fijo
de RDS (~$14-15/mes) mientras el proyecto sigue en fase de pruebas —
`prod` nunca se había desplegado, así que no se vio afectado. Se decidió
descartar los datos de prueba que había en RDS (Supabase arrancó con el
schema limpio de Drizzle) en vez de exportar/importar, para agilizar.

**Problemas reales encontrados en la migración** (quedan documentados
por lo mismo que la sección de abajo — son costosos de re-diagnosticar):

1. **El `deco-eventos-deployer` no podía asumir los roles de bootstrap de
   CDK** (`sts:AssumeRole` denegado sobre `cdk-hnb659fds-deploy-role-*` y
   `cdk-hnb659fds-lookup-role-*`). Sin esto, `cdk diff`/`cdk deploy`
   caían a usar las credenciales directas del usuario, que no tienen
   permisos de EC2/RDS/IAM — síntoma engañoso, parecía que faltaban
   permisos sueltos por cada tipo de recurso cuando en realidad faltaba
   un solo permiso (`sts:AssumeRole` hacia los roles del bootstrap, que
   ya tienen todo lo necesario). **Pendiente**: agregar `sts:AssumeRole`
   hacia `cdk-hnb659fds-deploy-role-*`, `cdk-hnb659fds-lookup-role-*` y
   `cdk-hnb659fds-file-publishing-role-*` a la policy *permanente* del
   deployer (no solo a la temporal que se usó para esta migración), para
   que el próximo deploy no repita este diagnóstico.
2. **CloudFormation no soporta `{{resolve:ssm-secure:...}}` en env vars
   de Lambda** — ver "Por qué Secrets Manager y no SSM Parameter Store"
   arriba.
3. **ENIs huérfanas de Lambda bloquearon el borrado de la VPC** (el
   motivo real de que el deploy tardara ~1h50 en vez de minutos): al
   sacar el `VpcConfig` de ambas Lambdas, AWS debía liberar las ENIs que
   había creado en las subredes, pero dos de ellas (del Lambda de
   migraciones) quedaron en estado `available` (ya desconectadas) sin
   que la limpieza automática las borrara — un bug conocido de AWS
   Lambda+VPC. CloudFormation reintentó el borrado de subredes/security
   group en loop sin progresar. Fix: `aws ec2 describe-network-interfaces
   --filters "Name=vpc-id,Values=<vpc-id>"` para encontrarlas, confirmar
   `Status: available` (nunca borrar una `in-use`), y
   `aws ec2 delete-network-interface --network-interface-id <eni-id>` a
   mano — eso destrabó el borrado normal del resto. El CLI de CDK, después
   de reintentar internamente por un buen rato, terminó marcando el
   deploy como `UPDATE_COMPLETE` pero **saltándose** el borrado de la
   VPC/subredes/security group ("Some resources failed to delete but
   were skipped") — quedaron huérfanos, fuera del control de
   CloudFormation, y se borraron a mano por fuera de CDK
   (`aws ec2 delete-security-group` / `delete-subnet` / `delete-vpc`)
   una vez liberadas las ENIs. **Lección**: si un deploy que remueve una
   VPC con Lambdas se cuelga en `UPDATE_COMPLETE_CLEANUP_IN_PROGRESS`
   por más de ~45-60 min con el mismo error repitiéndose, revisar ENIs
   huérfanas en vez de asumir que se va a resolver solo.

## Modelo de permisos IAM

Dos capas:

1. **Usuario IAM `deco-eventos-deployer`** (credenciales que usa quien
   despliega): en teoría gestiona el stack `CDKToolkit` y stacks que
   empiecen con `deco-eventos-*` asumiendo los roles que crea
   `cdk bootstrap` (`cdk-hnb659fds-*-role-*`), sin permisos directos
   sobre EC2/RDS/IAM — esos los ejerce el rol de CloudFormation, no el
   usuario. **En la práctica (migración a Supabase, 2026-09-01) se
   descubrió que a la policy le faltaba `sts:AssumeRole` hacia esos
   mismos roles de bootstrap** — sin eso, el deployer no podía delegar
   nada y hacía falta ir agregando permisos de EC2/RDS/IAM directos uno
   por uno para poder operar. Queda como pendiente agregar
   `sts:AssumeRole` permanentemente (ver sección de la migración) en vez
   de depender de policies temporales cada vez que hay que desplegar un
   cambio de infraestructura real.

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

**El Lambda de la API nunca llama a S3 por red para subir/borrar
objetos** — firma la URL localmente (HMAC, sin llamada HTTP) y el
navegador sube el archivo directo. Este flujo se mantiene igual después
de sacar la Lambda de la VPC (ver migración a Supabase):

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
- Borrar la policy inline temporal `temp-migracion-supabase` del usuario
  `deco-eventos-deployer` (IAM console) — ya cumplió su propósito.
- Agregar `sts:AssumeRole` hacia los roles de bootstrap de CDK
  (`cdk-hnb659fds-deploy-role-*`, `cdk-hnb659fds-lookup-role-*`,
  `cdk-hnb659fds-file-publishing-role-*`) a la policy **permanente** del
  deployer — ver "Migración a Supabase" arriba. Sin esto, el próximo
  deploy de infraestructura real va a repetir el mismo diagnóstico de
  permisos sueltos.

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
