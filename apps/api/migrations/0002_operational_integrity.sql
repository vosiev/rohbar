ALTER TABLE shipments
    ADD CONSTRAINT shipments_status_check
    CHECK (status IN ('published', 'offered', 'accepted', 'in_transit', 'delivered', 'completed'));

ALTER TABLE offers
    ADD CONSTRAINT offers_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected'));

ALTER TABLE fleet_vehicles
    ADD CONSTRAINT fleet_vehicles_status_check
    CHECK (status IN ('available', 'assigned', 'maintenance'));

CREATE UNIQUE INDEX offers_shipment_carrier_unique
    ON offers(shipment_id, carrier_id);

CREATE UNIQUE INDEX offers_one_accepted_per_shipment
    ON offers(shipment_id)
    WHERE status = 'accepted';

CREATE UNIQUE INDEX fleet_vehicles_owner_plate_unique
    ON fleet_vehicles(owner_id, plate);

CREATE OR REPLACE FUNCTION validate_shipment_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'published' AND NEW.status = 'offered') OR
        (OLD.status = 'offered' AND NEW.status = 'accepted') OR
        (OLD.status = 'accepted' AND NEW.status = 'in_transit') OR
        (OLD.status = 'in_transit' AND NEW.status = 'delivered') OR
        (OLD.status = 'delivered' AND NEW.status = 'completed')
    ) THEN
        RAISE EXCEPTION 'invalid shipment status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'offered' AND NOT EXISTS (
        SELECT 1 FROM offers
        WHERE shipment_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'shipment cannot enter offered state without an offer';
    END IF;

    IF NEW.status = 'accepted' AND NOT EXISTS (
        SELECT 1 FROM offers
        WHERE shipment_id = NEW.id
          AND status = 'accepted'
    ) THEN
        RAISE EXCEPTION 'shipment cannot enter accepted state without an accepted offer';
    END IF;

    IF NEW.status IN ('in_transit', 'delivered', 'completed') AND NOT EXISTS (
        SELECT 1 FROM driver_assignments
        WHERE shipment_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'shipment cannot advance without an assigned driver';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER shipments_validate_status_transition
BEFORE UPDATE OF status ON shipments
FOR EACH ROW
EXECUTE FUNCTION validate_shipment_status_transition();

CREATE OR REPLACE FUNCTION finalize_accepted_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE offers
        SET status = 'rejected'
        WHERE shipment_id = NEW.shipment_id
          AND id <> NEW.id
          AND status = 'pending';

        UPDATE shipments
        SET status = 'accepted'
        WHERE id = NEW.shipment_id
          AND status = 'offered';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER offers_finalize_acceptance
AFTER UPDATE OF status ON offers
FOR EACH ROW
EXECUTE FUNCTION finalize_accepted_offer();

CREATE OR REPLACE FUNCTION validate_driver_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    selected_plate TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users
        WHERE id = NEW.driver_id
          AND role = 'driver'
    ) THEN
        RAISE EXCEPTION 'assigned user must have driver role';
    END IF;

    IF NEW.vehicle_id IS NOT NULL THEN
        SELECT v.plate
        INTO selected_plate
        FROM fleet_vehicles v
        JOIN offers o
          ON o.shipment_id = NEW.shipment_id
         AND o.carrier_id = v.owner_id
         AND o.status = 'accepted'
        WHERE v.id = NEW.vehicle_id;

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

CREATE TRIGGER driver_assignments_validate
BEFORE INSERT OR UPDATE ON driver_assignments
FOR EACH ROW
EXECUTE FUNCTION validate_driver_assignment();

CREATE OR REPLACE FUNCTION notify_new_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO notifications(id, user_id, title, text, type)
    SELECT
        gen_random_uuid(),
        s.customer_id,
        'Новое предложение',
        'По заявке ' || NEW.shipment_id || ' получено предложение от ' || NEW.carrier_name || '.',
        'offer'
    FROM shipments s
    WHERE s.id = NEW.shipment_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER offers_notify_customer
AFTER INSERT ON offers
FOR EACH ROW
EXECUTE FUNCTION notify_new_offer();

CREATE OR REPLACE FUNCTION notify_offer_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO notifications(id, user_id, title, text, type)
        VALUES (
            gen_random_uuid(),
            NEW.carrier_id,
            'Предложение принято',
            'Ваше предложение по заявке ' || NEW.shipment_id || ' принято заказчиком.',
            'offer'
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER offers_notify_carrier
AFTER UPDATE OF status ON offers
FOR EACH ROW
EXECUTE FUNCTION notify_offer_accepted();

CREATE OR REPLACE FUNCTION notify_driver_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO notifications(id, user_id, title, text, type)
    VALUES (
        gen_random_uuid(),
        NEW.driver_id,
        'Назначен новый рейс',
        'Вы назначены водителем на перевозку ' || NEW.shipment_id || '.',
        'shipment'
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_assignments_notify_driver
AFTER INSERT ON driver_assignments
FOR EACH ROW
EXECUTE FUNCTION notify_driver_assignment();

CREATE OR REPLACE FUNCTION notify_shipment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO notifications(id, user_id, title, text, type)
        VALUES (
            gen_random_uuid(),
            NEW.customer_id,
            'Статус перевозки изменён',
            'Заявка ' || NEW.id || ' перешла в статус ' || NEW.status || '.',
            'shipment'
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER shipments_notify_customer
AFTER UPDATE OF status ON shipments
FOR EACH ROW
EXECUTE FUNCTION notify_shipment_status_change();
