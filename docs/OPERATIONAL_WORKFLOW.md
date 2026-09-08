# RohBar — Operational Workflow

## End-to-end

```text
Customer
  │
  ├─ creates shipment
  ▼
Backend
  │
  ├─ shipment.created
  ├─ shipment.published
  ▼
Carrier marketplace
  │
  ├─ carrier creates offer
  ▼
Customer
  │
  ├─ accepts offer
  ▼
Backend
  │
  ├─ offer.accepted
  ├─ shipment → accepted
  ▼
Carrier
  │
  ├─ assigns driver + vehicle
  ▼
Backend
  │
  ├─ driver.assigned
  ▼
Driver
  │
  ├─ accepts assignment
  ├─ starts trip
  ├─ confirms delivery
  ├─ completes trip
  ▼
Backend
  │
  ├─ shipment.status_changed
  └─ shipment.completed
  ▼
Automation
  ├─ notifications
  ├─ Telegram Bot
  ├─ Telegram Mini App
  └─ external integrations
```

## State machine

```text
published
   ↓
offered
   ↓
accepted
   ↓
in_transit
   ↓
delivered
   ↓
completed
```

The backend remains the authoritative source for valid state transitions. The frontend submits commands and renders the server-confirmed state.

## Frontend boundaries

- `apps/web/src/lib/api.ts` — transport/API adapter;
- `apps/web/src/lib/automation.ts` — domain-event delivery boundary;
- `apps/web/src/types/index.ts` — shared frontend contracts;
- `apps/web/src/app/shipments/[id]` — customer shipment view;
- `apps/web/src/app/offers` — offer selection;
- `apps/web/src/app/carrier/shipments` — carrier marketplace;
- `apps/web/src/app/carrier/shipments/[id]` — carrier dispatch and driver assignment;
- `apps/web/src/app/carrier/active` — carrier operational board;
- `apps/web/src/app/driver` — driver operational board;
- `apps/web/src/app/driver/shipments/[id]` — driver trip control.

## Automation contract

Every important command may emit an idempotent automation envelope with:

- event id;
- event type;
- aggregate id;
- actor id;
- timestamp;
- event payload.

The frontend sends the event through `/api/v1/events` in live mode with `Idempotency-Key`. Business processing, persistence, retries and delivery guarantees belong to the backend/automation layer.

## Backend integration checklist

The backend should implement:

- authentication/session;
- role-based authorization;
- shipment CRUD and state transitions;
- offers and acceptance;
- driver assignment;
- shipment event history;
- notifications;
- `/api/v1/events` idempotency handling;
- Telegram authentication/launch validation;
- webhook/event processing;
- audit logging.

No database access or business-rule implementation should be added to the frontend.
