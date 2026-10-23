# Quill

Plataforma educativa para simular compra y venta de acciones con capital ficticio. Ayuda a estudiantes y principiantes a entender portafolios, órdenes límite y dinámica del mercado.

## Stack

- **Frontend**: React, Vite, TypeScript, React Query, Recharts, Socket.IO Client
- **Backend**: NestJS, TypeScript, MongoDB + Mongoose, Redis (fallback en memoria), JWT, Socket.IO

## Empezar

```bash
npm install
cp .env.example .env
docker compose up -d          # Backend + MongoDB + Redis
```

El backend queda disponible en `http://localhost:3000/api`. Swagger queda
disponible en desarrollo en `http://localhost:3000/api/swagger`.

Para desarrollo local sin contenedor del backend, usa el mismo `.env`, levanta
MongoDB y Redis con `docker compose up -d mongodb redis`, y ejecuta
`npm run start:dev`.

## Docker

### Desarrollo

`docker-compose.yml` levanta el backend, MongoDB y Redis. Expone al host:

- Backend: `3000`
- MongoDB: `27017`
- Redis: `6379`

MongoDB y Redis se exponen en desarrollo para permitir herramientas locales y
ejecucion del backend con `npm run start:dev`. Los datos se guardan en volumenes
persistentes de Docker separados del entorno de produccion.

```bash
cp .env.example .env
docker compose up -d
docker compose ps
curl http://localhost:3000/api/system/health/ready
docker compose logs --tail=100
docker compose down
```

### Produccion o entrega

`docker-compose-prod.yml` levanta el backend con MongoDB y Redis en red interna.
Solo el backend queda expuesto al host en el puerto `3000`; MongoDB y Redis no
publican puertos. Sus datos usan volumenes persistentes separados de desarrollo.

Antes de levantarlo, ajusta `.env` con valores reales de despliegue. Como minimo:

- `JWT_SECRET`: secreto largo, aleatorio y privado.
- `FRONTEND_ORIGIN`: origenes permitidos para frontend web y mobile, separados
  por coma si hay mas de uno.
- Variables de proveedor externo si se usa `MARKET_PROVIDER=eodhd` o
  `CURRENCY_PROVIDER=exchangeRate`.

```bash
cp .env.example .env
docker compose -f docker-compose-prod.yml config
docker compose -f docker-compose-prod.yml up -d
docker compose -f docker-compose-prod.yml ps
curl http://localhost:3000/api/system/health/ready
docker compose -f docker-compose-prod.yml logs --tail=100
docker compose -f docker-compose-prod.yml down
```

El frontend web y la app mobile no son servicios obligatorios de este Compose.
Deben conectarse al backend mediante la URL publicada para el entorno.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run start:dev` | Desarrollo |
| `npm run build` | Build |
| `npm test` | Tests unitarios |
| `npm run test:e2e` | Tests e2e |
| `npm run lint` | Linter |

## Variables de entorno principales

| Variable | Descripción |
|----------|-------------|
| `MONGODB_URI` | Conexión MongoDB (requiere replica set) |
| `JWT_SECRET` | Secreto JWT largo, aleatorio y privado; reemplazar siempre el placeholder de `.env.example` |
| `INITIAL_BALANCE` | Saldo ficticio inicial |
| `COMMISSION_RATE` | Tasa de comisión |
| `MARKET_PROVIDER` | `mock` (entorno simulado), `yahoo` (datos indicativos sin clave) o `eodhd` |

El entorno local usa `mock` para simular acciones y USD/CLP sin depender de
servicios externos. La integracion con `yahoo` sigue disponible como opcion para
consultar precios indicativos y potencialmente retrasados sin una API key. Yahoo
Finance no ofrece una API publica con SLA: esa integracion es apropiada para
demostracion y pruebas, no para ejecutar operaciones financieras reales.

Ver `.env.example` para lista completa.

## Documentación

- [Arquitectura](./docs/architecture.md)
- [Backend](./docs/backend/README.md)
- [Flujo de datos](./docs/flow.md)

## Funcionalidades

- Registro/login con JWT
- Catálogo de acciones con precios dinámicos
- Órdenes límite de compra y venta
- Ejecución automática al cumplirse la condición
- Portafolio, órdenes abiertas y operaciones recientes
- WebSockets en tiempo real
- Tema claro/oscuro

## Limitaciones (MVP)

- Proveedor de mercado simulado por defecto (sin broker real)
- Sin panel administrativo, alertas, watchlists, stop loss/take profit
- Web responsive sin capa móvil nativa
