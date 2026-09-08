CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer','carrier','driver','admin')),
    phone TEXT,
    telegram_id BIGINT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

CREATE TABLE shipments (
    id TEXT PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES users(id),
    from_city TEXT NOT NULL,
    to_city TEXT NOT NULL,
    date TEXT NOT NULL,
    cargo TEXT NOT NULL,
    weight TEXT NOT NULL,
    vehicle TEXT NOT NULL,
    price TEXT NOT NULL,
    status TEXT NOT NULL,
    company TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE offers (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    carrier_id UUID NOT NULL REFERENCES users(id),
    carrier_name TEXT NOT NULL,
    vehicle TEXT NOT NULL,
    price TEXT NOT NULL,
    eta TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX offers_shipment_idx ON offers(shipment_id);

CREATE TABLE driver_assignments (
    shipment_id TEXT PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES users(id),
    driver_name TEXT NOT NULL,
    phone TEXT,
    vehicle_id TEXT,
    vehicle_plate TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fleet_vehicles (
    id TEXT PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES users(id),
    plate TEXT NOT NULL,
    model TEXT NOT NULL,
    body TEXT NOT NULL,
    capacity TEXT NOT NULL,
    volume TEXT NOT NULL,
    status TEXT NOT NULL,
    driver_name TEXT
);

CREATE TABLE shipment_events (
    id UUID PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id),
    payload JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shipment_id, id)
);
CREATE INDEX shipment_events_shipment_idx ON shipment_events(shipment_id, occurred_at);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    event_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id),
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);
CREATE INDEX outbox_pending_idx ON outbox_events(created_at) WHERE published_at IS NULL;
