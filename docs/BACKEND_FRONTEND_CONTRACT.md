# RohBar — Frontend ↔ Backend contract

## Purpose

Frontend работает через единый API adapter и не обращается напрямую к базе данных, очередям или внутренним automation-сервисам.

## Transport

- HTTPS
- JSON
- credentials: include
- UTF-8
- API versioning: `/api/v1`

## Core endpoints

```text
GET    /api/v1/health
GET    /api/v1/auth/me
POST   /api/v1/auth/login
POST   /api/v1/auth/register
POST   /api/v1/auth/logout
GET    /api/v1/shipments
POST   /api/v1/shipments
GET    /api/v1/shipments/:id
PATCH  /api/v1/shipments/:id
POST   /api/v1/shipments/:id/offers
POST   /api/v1/shipments/:id/accept
GET    /api/v1/shipments/:id/events
GET    /api/v1/fleet
POST   /api/v1/fleet
PATCH  /api/v1/fleet/:id
GET    /api/v1/notifications
POST   /api/v1/notifications/:id/read
```

## Envelope

Success response:

```json
{
  "data": {},
  "meta": {
    "requestId": "server-generated",
    "cursor": null
  }
}
```

Error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {}
  }
}
```

## Authentication

Browser authentication должна использовать HttpOnly secure cookie/session либо другой серверный механизм, согласованный с backend.

Telegram Mini App authentication должна передавать `Telegram.WebApp.initData` на backend для серверной валидации. `initDataUnsafe` не используется как источник доверенной авторизации.

## Roles

```text
customer
carrier
driver
admin
```

Backend является источником истины для разрешений. Frontend скрывает недоступные действия только как UX-оптимизацию и никогда не рассматривает это как security boundary.

## Shipment lifecycle

```text
published
  → offered
  → accepted
  → in_transit
  → delivered
  → completed
```

Backend определяет допустимые переходы. Frontend отображает состояние и вызывает соответствующие commands.

## Automation boundary

Frontend вызывает бизнес-команду. Backend создаёт доменное событие. Automation layer подписывается на событие и выполняет workflow.

Пример:

```text
POST /api/v1/shipments
        ↓
ShipmentCreated
        ↓
Automation
   ├── уведомление заказчику
   ├── уведомление подходящим перевозчикам
   └── Telegram Bot message
```

Frontend не должен напрямую запускать внутренние jobs, отправлять секретные webhook-запросы или хранить токены automation-системы.
