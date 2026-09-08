# RohBar Automation Contract

## Назначение

Frontend не выполняет бизнес-автоматизацию напрямую. Все автоматические действия инициируются backend/domain events.

## События

- `shipment.created`
- `shipment.offer.created`
- `shipment.offer.accepted`
- `shipment.status.changed`
- `shipment.delivered`
- `user.registered`
- `document.status.changed`

## Архитектура

```text
Frontend
  ↓ HTTPS
Backend API
  ↓ domain event
Event / Job layer
  ├── Telegram Bot
  ├── Telegram Mini App
  ├── push / email / SMS
  ├── matching
  ├── geocoding
  └── analytics
```

## Требования к frontend

Frontend отправляет только валидные команды API и отображает состояние, возвращённое сервером. UI не должен самостоятельно менять бизнес-статус без серверного подтверждения.

Для долгих операций интерфейс поддерживает состояния `idle`, `loading`, `success`, `error` и может получать обновления через polling, SSE или WebSocket после подключения backend.

## Telegram

Telegram Mini App использует Telegram `initData`, которое должно передаваться backend для серверной проверки. Frontend не хранит bot token и другие секреты.

## Идемпотентность

Для команд, которые могут повториться из-за retry или сетевых проблем, backend должен поддерживать idempotency key. Frontend API layer должен позволять передавать такой ключ.

## Расширение

Новые automation workflows добавляются на backend/event layer без изменения компонентов интерфейса, если существующий API contract сохраняется.
