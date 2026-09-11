use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::test]
async fn carrier_visibility_becomes_private_after_offer_acceptance() {
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL is required for tests");
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .expect("database connection failed");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("database migration failed");

    let mut tx = pool.begin().await.expect("transaction failed");
    let customer_id = Uuid::new_v4();
    let accepted_carrier_id = Uuid::new_v4();
    let competing_carrier_id = Uuid::new_v4();
    let suffix = Uuid::new_v4().simple().to_string();
    let shipment_id = format!("SCOPE-{}", &suffix[..8]);
    let accepted_offer_id = format!("OF-{}", &suffix[8..14]);
    let competing_offer_id = format!("OF-{}", &suffix[14..20]);

    for (id, email, name, role) in [
        (
            customer_id,
            format!("scope-customer-{suffix}@example.test"),
            "Scope Customer",
            "customer",
        ),
        (
            accepted_carrier_id,
            format!("scope-carrier-a-{suffix}@example.test"),
            "Carrier A",
            "carrier",
        ),
        (
            competing_carrier_id,
            format!("scope-carrier-b-{suffix}@example.test"),
            "Carrier B",
            "carrier",
        ),
    ] {
        sqlx::query(
            "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,'test-hash',$4)",
        )
        .bind(id)
        .bind(email)
        .bind(name)
        .bind(role)
        .execute(&mut *tx)
        .await
        .expect("fixture user insert failed");
    }

    sqlx::query(
        "INSERT INTO shipments(id,customer_id,from_city,to_city,date,cargo,weight,vehicle,price,status,company) VALUES($1,$2,'Moscow','Kazan','2026-09-11','Cargo','10 t','Tent','100','published','Scope Customer')",
    )
    .bind(&shipment_id)
    .bind(customer_id)
    .execute(&mut *tx)
    .await
    .expect("fixture shipment insert failed");

    let marketplace_visible_before_acceptance: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM shipments WHERE id=$1 AND status IN ('published','offered'))",
    )
    .bind(&shipment_id)
    .fetch_one(&mut *tx)
    .await
    .expect("marketplace visibility query failed");
    assert!(
        marketplace_visible_before_acceptance,
        "published shipment must be visible in the carrier marketplace"
    );

    for (offer_id, carrier_id, carrier_name) in [
        (&accepted_offer_id, accepted_carrier_id, "Carrier A"),
        (&competing_offer_id, competing_carrier_id, "Carrier B"),
    ] {
        sqlx::query(
            "INSERT INTO offers(id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status) VALUES($1,$2,$3,$4,'Tent','90','1 day','pending')",
        )
        .bind(offer_id)
        .bind(&shipment_id)
        .bind(carrier_id)
        .bind(carrier_name)
        .execute(&mut *tx)
        .await
        .expect("fixture offer insert failed");
    }

    sqlx::query("UPDATE shipments SET status='offered' WHERE id=$1")
        .bind(&shipment_id)
        .execute(&mut *tx)
        .await
        .expect("published to offered transition should succeed");

    sqlx::query("UPDATE offers SET status='accepted' WHERE id=$1")
        .bind(&accepted_offer_id)
        .execute(&mut *tx)
        .await
        .expect("offer acceptance should succeed");

    let accepted_carrier_visible: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM shipments s WHERE s.id=$1 AND (s.status IN ('published','offered') OR EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=s.id AND o.carrier_id=$2 AND o.status='accepted')))",
    )
    .bind(&shipment_id)
    .bind(accepted_carrier_id)
    .fetch_one(&mut *tx)
    .await
    .expect("accepted carrier visibility query failed");
    assert!(
        accepted_carrier_visible,
        "accepted carrier must retain access to its managed shipment"
    );

    let competing_carrier_visible: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM shipments s WHERE s.id=$1 AND (s.status IN ('published','offered') OR EXISTS(SELECT 1 FROM offers o WHERE o.shipment_id=s.id AND o.carrier_id=$2 AND o.status='accepted')))",
    )
    .bind(&shipment_id)
    .bind(competing_carrier_id)
    .fetch_one(&mut *tx)
    .await
    .expect("competing carrier visibility query failed");
    assert!(
        !competing_carrier_visible,
        "non-selected carrier must lose access after another offer is accepted"
    );

    let competing_offer_status: String =
        sqlx::query_scalar("SELECT status FROM offers WHERE id=$1")
            .bind(&competing_offer_id)
            .fetch_one(&mut *tx)
            .await
            .expect("competing offer status query failed");
    assert_eq!(competing_offer_status, "rejected");

    tx.rollback().await.expect("transaction rollback failed");
}
