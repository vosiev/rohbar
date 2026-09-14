-- Historical Telegram credentials cannot prove that a placeholder is disposable.
ALTER TABLE users
    ADD COLUMN telegram_placeholder BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN password_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN telegram_session_version BIGINT NOT NULL DEFAULT 0;
UPDATE users SET password_login_enabled=FALSE WHERE email LIKE 'telegram-%@rohbar.local';

CREATE TABLE telegram_link_codes (
    digest BYTEA PRIMARY KEY CHECK (octet_length(digest)=32),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_by BIGINT,
    retired_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX telegram_link_codes_one_active ON telegram_link_codes(user_id) WHERE retired_at IS NULL;
CREATE INDEX telegram_link_codes_expiry ON telegram_link_codes(expires_at);

-- Any profile/credential edit permanently removes proof of disposability.
CREATE FUNCTION preserve_telegram_placeholder_proof() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW) - ARRAY['telegram_id','telegram_session_version','telegram_placeholder'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['telegram_id','telegram_session_version','telegram_placeholder']) THEN
        NEW.telegram_placeholder := FALSE;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER users_telegram_placeholder_proof BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION preserve_telegram_placeholder_proof();

-- Caller holds the user FOR UPDATE, blocking concurrent FK inserts. Inspect every
-- FK, including CASCADE/SET NULL and future tables; unknown composite FKs fail closed.
CREATE FUNCTION telegram_placeholder_has_references(candidate UUID) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE fk RECORD; found BOOLEAN;
BEGIN
    FOR fk IN
        SELECT c.conrelid, c.conkey, c.confkey, a.attname,
               format('%I.%I', n.nspname, t.relname) AS relation
        FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace
        LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
        WHERE c.contype='f' AND c.confrelid='users'::regclass
    LOOP
        IF cardinality(fk.conkey) <> 1 OR cardinality(fk.confkey) <> 1
           OR fk.confkey[1] <> (SELECT attnum FROM pg_attribute WHERE attrelid='users'::regclass AND attname='id')
        THEN RETURN TRUE; END IF;
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)', fk.relation, fk.attname)
        INTO found USING candidate;
        IF found THEN RETURN TRUE; END IF;
    END LOOP;
    RETURN FALSE;
END $$;
