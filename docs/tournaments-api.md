# Torneos de inversion

El modulo `tournaments` agrega competencias bursatiles aisladas sin modificar la
cuenta personal de practica. Todos los saldos, posiciones, ordenes y trades de un
torneo viven en colecciones propias y siempre incluyen `tournamentId` y `userId`.

## Roles y tipos de cuenta

- `investor`: participa en torneos.
- `teacher`: crea y administra sus propios torneos.
- `admin`: administra cualquier torneo y asigna roles.
- `accountType`: `ucn` o `external`; se deriva del dominio del correo y no concede
  permisos.

Un administrador puede promover una cuenta con `PUT /api/admin/users/:id/role`.

## Ciclo de vida

1. El profesor crea un torneo en `DRAFT`.
2. Lo publica; queda `OPEN` o `ACTIVE` si la fecha de inicio ya llego.
3. Los participantes se inscriben mientras el torneo esta `OPEN`. Los torneos
   privados exigen un codigo de ocho caracteres, almacenado solo como hash.
4. Al iniciar, cada participante opera con su cuenta aislada y el capital definido
   por el profesor.
   Un torneo `ACTIVE` es visible publicamente, pero ya no acepta inscripciones.
5. Al llegar `endAt`, el scheduler cierra el torneo, cancela ordenes pendientes,
   libera reservas y congela patrimonio, rentabilidad y puesto final.

Los cambios de reglas financieras se bloquean una vez iniciado el torneo.

## Endpoints de administracion

| Metodo   | Ruta                                        | Uso                               |
| -------- | ------------------------------------------- | --------------------------------- |
| `POST`   | `/api/tournaments`                          | Crear torneo (`teacher`, `admin`) |
| `PATCH`  | `/api/tournaments/:id`                      | Editar borrador o torneo abierto  |
| `POST`   | `/api/tournaments/:id/publish`              | Publicar                          |
| `POST`   | `/api/tournaments/:id/start`                | Iniciar inmediatamente            |
| `POST`   | `/api/tournaments/:id/finish`               | Finalizar y congelar ranking      |
| `POST`   | `/api/tournaments/:id/cancel`               | Cancelar y liberar reservas       |
| `POST`   | `/api/tournaments/:id/join-code/rotate`     | Rotar codigo privado              |
| `GET`    | `/api/tournaments/:id/participants`         | Supervisar inscritos              |
| `DELETE` | `/api/tournaments/:id/participants/:userId` | Retirar antes del inicio          |

El propietario puede consultar cartera, ordenes y trades de cada participante bajo
`/api/tournaments/:id/participants/:userId/...`.

## Endpoints de participantes

| Metodo  | Ruta                                          | Uso                                 |
| ------- | --------------------------------------------- | ----------------------------------- |
| `GET`   | `/api/tournaments`                            | Buscar torneos por alcance y estado |
| `POST`  | `/api/tournaments/:id/join`                   | Inscribirse                         |
| `GET`   | `/api/tournaments/:id/portfolio`              | Cartera del participante            |
| `POST`  | `/api/tournaments/:id/orders`                 | Orden `MARKET` o `LIMIT`            |
| `GET`   | `/api/tournaments/:id/orders`                 | Ordenes propias                     |
| `PATCH` | `/api/tournaments/:id/orders/:orderId/cancel` | Cancelar orden pendiente            |
| `GET`   | `/api/tournaments/:id/trades`                 | Operaciones ejecutadas              |
| `GET`   | `/api/tournaments/:id/leaderboard`            | Ranking filtrable                   |

El ranking acepta `sortBy`, `direction`, `search`, `page` y `limit`. Las metricas
disponibles son rentabilidad, patrimonio, acciones, operaciones, capital invertido
y efectivo disponible.

## Invariantes financieras

- Las compras reservan efectivo y las ventas reservan acciones.
- Cada ejecucion actualiza cuenta, posicion, orden y trade dentro de una transaccion
  MongoDB.
- Las ordenes solo se aceptan mientras el torneo y el mercado estan activos.
- Todos los torneos usan automaticamente el catalogo de acciones activo en el
  mercado. Si el proveedor o el administrador agrega una accion, queda
  disponible sin modificar cada torneo.
- La comision es una regla propia de cada torneo.
- El scheduler usa locks distribuidos para impedir ciclos duplicados entre replicas.
- Un stock con referencias personales o de torneo no se puede eliminar.

MongoDB debe ejecutarse como replica set para soportar estas transacciones.

## Errores y trazabilidad

Las respuestas de error incluyen `statusCode`, `code`, `message`, `path`,
`timestamp` y `requestId`. El encabezado `X-Request-Id` se devuelve al cliente y
permite correlacionar errores sin exponer detalles internos de MongoDB.
