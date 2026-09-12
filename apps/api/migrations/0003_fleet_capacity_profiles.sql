ALTER TABLE users
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE fleet_vehicles
    ADD COLUMN IF NOT EXISTS body_code TEXT,
    ADD COLUMN IF NOT EXISTS capacity_kg INTEGER,
    ADD COLUMN IF NOT EXISTS volume_liters INTEGER,
    ADD COLUMN IF NOT EXISTS length_mm INTEGER,
    ADD COLUMN IF NOT EXISTS width_mm INTEGER,
    ADD COLUMN IF NOT EXISTS height_mm INTEGER,
    ADD COLUMN IF NOT EXISTS year SMALLINT,
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE fleet_vehicles
SET body_code = CASE
    WHEN lower(body) LIKE '%реф%' THEN 'reefer'
    WHEN lower(body) LIKE '%изотерм%' THEN 'isotherm'
    WHEN lower(body) LIKE '%борт%' THEN 'flatbed'
    WHEN lower(body) LIKE '%трал%' OR lower(body) LIKE '%низкорам%' THEN 'lowbed'
    WHEN lower(body) LIKE '%контейнер%' THEN 'container'
    WHEN lower(body) LIKE '%фургон%' OR lower(body) LIKE '%цельномет%' THEN 'box'
    WHEN lower(body) LIKE '%газел%' OR lower(body) LIKE '%малотон%' THEN 'van'
    ELSE 'curtain'
END
WHERE body_code IS NULL;

UPDATE fleet_vehicles
SET capacity_kg = CASE
    WHEN capacity ~ '[0-9]+([.,][0-9]+)?' THEN
        ROUND(
            REPLACE(SUBSTRING(capacity FROM '[0-9]+([.,][0-9]+)?'), ',', '.')::NUMERIC *
            CASE WHEN lower(capacity) LIKE '%кг%' THEN 1 ELSE 1000 END
        )::INTEGER
    ELSE NULL
END
WHERE capacity_kg IS NULL;

UPDATE fleet_vehicles
SET volume_liters = CASE
    WHEN volume ~ '[0-9]+([.,][0-9]+)?' THEN
        ROUND(REPLACE(SUBSTRING(volume FROM '[0-9]+([.,][0-9]+)?'), ',', '.')::NUMERIC * 1000)::INTEGER
    ELSE NULL
END
WHERE volume_liters IS NULL;

ALTER TABLE fleet_vehicles
    ADD CONSTRAINT fleet_capacity_kg_positive CHECK (capacity_kg IS NULL OR capacity_kg > 0),
    ADD CONSTRAINT fleet_volume_liters_positive CHECK (volume_liters IS NULL OR volume_liters > 0),
    ADD CONSTRAINT fleet_dimensions_positive CHECK (
        (length_mm IS NULL OR length_mm > 0) AND
        (width_mm IS NULL OR width_mm > 0) AND
        (height_mm IS NULL OR height_mm > 0)
    ),
    ADD CONSTRAINT fleet_year_reasonable CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
    ADD CONSTRAINT fleet_body_code_check CHECK (
        body_code IS NULL OR body_code IN (
            'curtain','box','reefer','isotherm','flatbed','lowbed','container','van'
        )
    );

ALTER TABLE shipments
    ADD COLUMN IF NOT EXISTS weight_kg INTEGER,
    ADD COLUMN IF NOT EXISTS volume_liters INTEGER,
    ADD COLUMN IF NOT EXISTS volume_estimated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS requested_body_code TEXT,
    ADD COLUMN IF NOT EXISTS selected_vehicle_id TEXT REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS selected_carrier_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE shipments
SET weight_kg = CASE
    WHEN weight ~ '[0-9]+([.,][0-9]+)?' THEN
        ROUND(
            REPLACE(SUBSTRING(weight FROM '[0-9]+([.,][0-9]+)?'), ',', '.')::NUMERIC *
            CASE WHEN lower(weight) LIKE '%кг%' THEN 1 ELSE 1000 END
        )::INTEGER
    ELSE NULL
END
WHERE weight_kg IS NULL;

ALTER TABLE shipments
    ADD CONSTRAINT shipments_requested_body_code_check CHECK (
        requested_body_code IS NULL OR requested_body_code IN (
            'curtain','box','reefer','isotherm','flatbed','lowbed','container','van'
        )
    ),
    ADD CONSTRAINT shipments_weight_kg_positive CHECK (weight_kg IS NULL OR weight_kg > 0),
    ADD CONSTRAINT shipments_volume_liters_positive CHECK (volume_liters IS NULL OR volume_liters > 0);

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS vehicle_id TEXT REFERENCES fleet_vehicles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS vehicle_reservations (
    shipment_id TEXT PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
    requested_weight_kg INTEGER NOT NULL CHECK (requested_weight_kg > 0),
    requested_volume_liters INTEGER CHECK (requested_volume_liters IS NULL OR requested_volume_liters > 0),
    state TEXT NOT NULL CHECK (state IN ('pending','confirmed','released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vehicle_reservations_vehicle_idx
    ON vehicle_reservations(vehicle_id, state);

CREATE OR REPLACE FUNCTION validate_vehicle_reservation_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    vehicle_capacity INTEGER;
    vehicle_volume INTEGER;
    vehicle_status TEXT;
    used_weight BIGINT;
    used_volume BIGINT;
BEGIN
    SELECT capacity_kg, volume_liters, status
    INTO vehicle_capacity, vehicle_volume, vehicle_status
    FROM fleet_vehicles
    WHERE id=NEW.vehicle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'vehicle not found';
    END IF;
    IF vehicle_status = 'maintenance' THEN
        RAISE EXCEPTION 'vehicle is under maintenance';
    END IF;
    IF vehicle_capacity IS NULL THEN
        RAISE EXCEPTION 'vehicle capacity is not configured';
    END IF;

    SELECT
        COALESCE(SUM(requested_weight_kg),0),
        COALESCE(SUM(requested_volume_liters),0)
    INTO used_weight, used_volume
    FROM vehicle_reservations
    WHERE vehicle_id=NEW.vehicle_id
      AND shipment_id<>NEW.shipment_id
      AND state IN ('pending','confirmed');

    IF NEW.state IN ('pending','confirmed') THEN
        IF used_weight + NEW.requested_weight_kg > vehicle_capacity THEN
            RAISE EXCEPTION 'vehicle has insufficient remaining weight capacity';
        END IF;
        IF NEW.requested_volume_liters IS NOT NULL THEN
            IF vehicle_volume IS NULL THEN
                RAISE EXCEPTION 'vehicle volume is not configured';
            END IF;
            IF used_volume + NEW.requested_volume_liters > vehicle_volume THEN
                RAISE EXCEPTION 'vehicle has insufficient remaining volume';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vehicle_reservations_validate_capacity ON vehicle_reservations;
CREATE TRIGGER vehicle_reservations_validate_capacity
BEFORE INSERT OR UPDATE ON vehicle_reservations
FOR EACH ROW
EXECUTE FUNCTION validate_vehicle_reservation_capacity();

CREATE TABLE IF NOT EXISTS carrier_driver_memberships (
    carrier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(carrier_id, driver_id),
    CHECK (carrier_id <> driver_id)
);
CREATE INDEX IF NOT EXISTS carrier_driver_driver_idx
    ON carrier_driver_memberships(driver_id, status);

ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments
    ADD CONSTRAINT shipments_status_check
    CHECK (status IN ('published', 'offered', 'accepted', 'in_transit', 'delivered', 'completed', 'cancelled'));

CREATE OR REPLACE FUNCTION validate_shipment_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'published' AND NEW.status IN ('offered','cancelled')) OR
        (OLD.status = 'offered' AND NEW.status IN ('accepted','cancelled')) OR
        (OLD.status = 'accepted' AND NEW.status = 'in_transit') OR
        (OLD.status = 'in_transit' AND NEW.status = 'delivered') OR
        (OLD.status = 'delivered' AND NEW.status = 'completed')
    ) THEN
        RAISE EXCEPTION 'invalid shipment status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'offered' AND NOT EXISTS (
        SELECT 1 FROM offers WHERE shipment_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'shipment cannot enter offered state without an offer';
    END IF;

    IF NEW.status = 'accepted' AND NOT EXISTS (
        SELECT 1 FROM offers WHERE shipment_id = NEW.id AND status = 'accepted'
    ) THEN
        RAISE EXCEPTION 'shipment cannot enter accepted state without an accepted offer';
    END IF;

    IF NEW.status IN ('in_transit','delivered','completed') AND NOT EXISTS (
        SELECT 1 FROM driver_assignments WHERE shipment_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'shipment cannot advance without an assigned driver';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION release_vehicle_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('completed','cancelled') THEN
        UPDATE vehicle_reservations
        SET state='released', updated_at=NOW()
        WHERE shipment_id=NEW.id AND state <> 'released';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS shipments_release_vehicle_reservation ON shipments;
CREATE TRIGGER shipments_release_vehicle_reservation
AFTER UPDATE OF status ON shipments
FOR EACH ROW
EXECUTE FUNCTION release_vehicle_reservation();

CREATE OR REPLACE FUNCTION validate_carrier_driver_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.carrier_id AND role='carrier') THEN
        RAISE EXCEPTION 'membership owner must have carrier role';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.driver_id AND role='driver') THEN
        RAISE EXCEPTION 'membership member must have driver role';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS carrier_driver_memberships_validate ON carrier_driver_memberships;
CREATE TRIGGER carrier_driver_memberships_validate
BEFORE INSERT OR UPDATE ON carrier_driver_memberships
FOR EACH ROW
EXECUTE FUNCTION validate_carrier_driver_membership();

CREATE OR REPLACE FUNCTION finalize_accepted_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    shipment_row shipments%ROWTYPE;
    selected_vehicle TEXT;
    vehicle_owner UUID;
    vehicle_capacity INTEGER;
    vehicle_volume INTEGER;
    used_weight BIGINT;
    used_volume BIGINT;
BEGIN
    IF NEW.status <> 'accepted' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    SELECT * INTO shipment_row FROM shipments WHERE id=NEW.shipment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'shipment not found';
    END IF;

    selected_vehicle := COALESCE(NEW.vehicle_id, shipment_row.selected_vehicle_id);
    IF shipment_row.selected_vehicle_id IS NOT NULL
       AND NEW.vehicle_id IS NOT NULL
       AND NEW.vehicle_id <> shipment_row.selected_vehicle_id THEN
        RAISE EXCEPTION 'offer vehicle does not match selected vehicle';
    END IF;

    IF selected_vehicle IS NOT NULL AND shipment_row.weight_kg IS NOT NULL THEN
        SELECT owner_id, capacity_kg, volume_liters
        INTO vehicle_owner, vehicle_capacity, vehicle_volume
        FROM fleet_vehicles
        WHERE id=selected_vehicle AND status <> 'maintenance'
        FOR UPDATE;

        IF vehicle_owner IS NULL OR vehicle_owner <> NEW.carrier_id THEN
            RAISE EXCEPTION 'vehicle does not belong to accepted carrier';
        END IF;
        IF vehicle_capacity IS NULL THEN
            RAISE EXCEPTION 'vehicle capacity is not configured';
        END IF;

        SELECT
            COALESCE(SUM(requested_weight_kg),0),
            COALESCE(SUM(requested_volume_liters),0)
        INTO used_weight, used_volume
        FROM vehicle_reservations
        WHERE vehicle_id=selected_vehicle
          AND shipment_id <> NEW.shipment_id
          AND state IN ('pending','confirmed');

        IF used_weight + shipment_row.weight_kg > vehicle_capacity THEN
            RAISE EXCEPTION 'vehicle has insufficient remaining weight capacity';
        END IF;
        IF shipment_row.volume_liters IS NOT NULL AND vehicle_volume IS NOT NULL
           AND used_volume + shipment_row.volume_liters > vehicle_volume THEN
            RAISE EXCEPTION 'vehicle has insufficient remaining volume';
        END IF;

        INSERT INTO vehicle_reservations(
            shipment_id,vehicle_id,requested_weight_kg,requested_volume_liters,state
        ) VALUES(
            NEW.shipment_id,selected_vehicle,shipment_row.weight_kg,shipment_row.volume_liters,'confirmed'
        )
        ON CONFLICT(shipment_id) DO UPDATE SET
            vehicle_id=EXCLUDED.vehicle_id,
            requested_weight_kg=EXCLUDED.requested_weight_kg,
            requested_volume_liters=EXCLUDED.requested_volume_liters,
            state='confirmed',
            updated_at=NOW();

        UPDATE shipments
        SET selected_vehicle_id=selected_vehicle,
            selected_carrier_id=NEW.carrier_id
        WHERE id=NEW.shipment_id;
    END IF;

    UPDATE offers
    SET status='rejected'
    WHERE shipment_id=NEW.shipment_id AND id<>NEW.id AND status='pending';

    UPDATE shipments
    SET status='accepted', selected_carrier_id=NEW.carrier_id
    WHERE id=NEW.shipment_id AND status='offered';

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_driver_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    selected_plate TEXT;
    accepted_carrier UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.driver_id AND role='driver') THEN
        RAISE EXCEPTION 'assigned user must have driver role';
    END IF;

    SELECT carrier_id INTO accepted_carrier
    FROM offers
    WHERE shipment_id=NEW.shipment_id AND status='accepted';

    IF accepted_carrier IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM carrier_driver_memberships
        WHERE carrier_id=accepted_carrier AND driver_id=NEW.driver_id AND status='active'
    ) THEN
        RAISE EXCEPTION 'driver is not an active member of the carrier team';
    END IF;

    IF NEW.vehicle_id IS NOT NULL THEN
        SELECT v.plate INTO selected_plate
        FROM fleet_vehicles v
        WHERE v.id=NEW.vehicle_id
          AND (accepted_carrier IS NULL OR v.owner_id=accepted_carrier);
        IF selected_plate IS NULL THEN
            RAISE EXCEPTION 'vehicle does not belong to the accepted carrier';
        END IF;
        NEW.vehicle_plate := selected_plate;
    ELSE
        NEW.vehicle_plate := NULL;
    END IF;
    RETURN NEW;
END;
$$;
