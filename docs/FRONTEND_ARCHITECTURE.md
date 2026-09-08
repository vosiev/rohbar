# RohBar Frontend Architecture

## Цель

Frontend разделён на UI, feature-логику и API adapter. Backend можно подключить без изменения экранов.

## Слои

```text
app/routes
  ↓
components + features
  ↓
lib/api.ts
  ↓
HTTP API
  ↓
RohBar backend
```

`NEXT_PUBLIC_API_URL` задаёт базовый URL backend.

## Контракт API

Frontend ожидает REST endpoints:

- `GET /api/v1/auth/me`
- `GET /api/v1/shipments`
- `GET /api/v1/shipments/:id`
- `POST /api/v1/shipments`
- `POST /api/v1/shipments/:id/accept`
- `GET /api/v1/health`

Формат ошибок нормализуется в `ApiResult<T>`.

## Автоматизация

Все пользовательские действия должны проходить через service/API layer. Это позволяет подключить:

- workflow automation;
- уведомления;
- Telegram Bot;
- Telegram Mini App;
- webhooks;
- фоновые jobs;
- события заказа;
- интеграции карт и геокодинга.

Frontend не должен содержать секреты или напрямую обращаться к базам данных и приватным интеграциям.

## Telegram

Web и Telegram Mini App используют общие страницы и компоненты. Telegram-specific поведение изолируется в `lib/telegram.ts` и `components/telegram-runtime.ts`.

Backend должен валидировать Telegram `initData` на сервере; frontend не является доверенной стороной.
