use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::test]
async fn operational_integrity_enforces_workflow() {
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
    let carrier_id = Uuid::new_v4();
    let other_carrier_id = Uuid::new_v4();
    let driver_id = Uuid::new_v4();
    let suffix = Uuid::new_v4().simple().to_string();
    let shipment_id = format!("TEST-{}", &suffix[..8]);
    let offer_id = format!("OF-{}", &suffix[8..14]);
    let other_offer_id = format!("OF-{}", &suffix[14..20]);
    let vehicle_id = format!("VH-{}", &suffix[20..26]);
    let foreign_vehicle_id = format!("VH-{}", &suffix[26..32]);

    for (id, email, name, role) in [
        (
            customer_id,
            format!("customer-{suffix}@example.test"),
            "Customer",
            "customer",
        ),
        (
            carrier_id,
            format!("carrier-{suffix}@example.test"),
            "Carrier",
            "carrier",
        ),
        (
            other_carrier_id,
            format!("carrier-other-{suffix}@example.test"),
            "Other Carrier",
            "carrier",
        ),
        (
            driver_id,
            format!("driver-{suffix}@example.test"),
            "Driver",
            "driver",
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
        "INSERT INTO shipments(id,customer_id,from_city,to_city,date,cargo,weight,vehicle,price,status,company) VALUES($1,$2,'A','B','2026-09-11','Cargo','10 t','Tent','100','published','Customer')",
    )
    .bind(&shipment_id)
    .bind(customer_id)
    .execute(&mut *tx)
    .await
    .expect("fixture shipment insert failed");

    sqlx::query(
        "INSERT INTO offers(id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status) VALUES($1,$2,$3,'Carrier','Tent','90','1 day','pending')",
    )
    .bind(&offer_id)
    .bind(&shipment_id)
    .bind(carrier_id)
    .execute(&mut *tx)
    .await
    .expect("fixture offer insert failed");

    sqlx::query(
        "INSERT INTO offers(id,shipment_id,carrier_id,carrier_name,vehicle,price,eta,status) VALUES($1,$2,$3,'Other Carrier','Box','95','2 days','pending')",
    )
    .bind(&other_offer_id)
    .bind(&shipment_id)
    .bind(other_carrier_id)
    .execute(&mut *tx)
    .await
    .expect("second fixture offer insert failed");

    sqlx::query("UPDATE shipments SET status='offered' WHERE id=$1")
        .bind(&shipment_id)
        .execute(&mut *tx)
        .await
        .expect("published to offered transition should succeed");

    let premature_accept = sqlx::query("UPDATE shipments SET status='accepted' WHERE id=$1")
        .bind(&shipment_id)
        .execute(&mut *tx)
        .await;
    assert!(
        premature_accept.is_err(),
        "shipment accepted without accepted offer"
    );

    sqlx::query("UPDATE offers SET status='accepted' WHERE id=$1")
        .bind(&offer_id)
        .execute(&mut *tx)
        .await
        .expect("offer acceptance should succeed");

    let shipment_status: String = sqlx::query_scalar("SELECT status FROM shipments WHERE id=$1")
        .bind(&shipment_id)
        .fetch_one(&mut *tx)
        .await
        .expect("shipment status query failed");
    assert_eq!(shipment_status, "accepted");

    let competing_offer_status: String =
        sqlx::query_scalar("SELECT status FROM offers WHERE id=$1")
            .bind(&other_offer_id)
            .fetch_one(&mut *tx)
            .await
            .expect("competing offer status query failed");
    assert_eq!(competing_offer_status, "rejected");

    sqlx::query(
        "INSERT INTO fleet_vehicles(id,owner_id,plate,model,body,capacity,volume,status) VALUES($1,$2,'A001AA','Truck','Tent','20 t','82 m3','available')",
    )
    .bind(&vehicle_id)
    .bind(carrier_id)
    .execute(&mut *tx)
    .await
    .expect("carrier vehicle insert failed");

    sqlx::query(
        "INSERT INTO fleet_vehicles(id,owner_id,plate,model,body,capacity,volume,status) VALUES($1,$2,'B002BB','Truck','Box','20 t','82 m3','available')",
    )
    .bind(&foreign_vehicle_id)
    .bind(other_carrier_id)
    .execute(&mut *tx)
    .await
    .expect("foreign vehicle insert failed");

    let invalid_assignment = sqlx::query(
        "INSERT INTO driver_assignments(shipment_id,driver_id,driver_name,vehicle_id) VALUES($1,$2,'Driver',$3)",
    )
    .bind(&shipment_id)
    .bind(driver_id)
    .bind(&foreign_vehicle_id)
    .execute(&mut *tx)
    .await;
    assert!(
        invalid_assignment.is_err(),
        "assignment must reject a vehicle owned by another carrier"
    );

    sqlx::query(
        "INSERT INTO driver_assignments(shipment_id,driver_id,driver_name,vehicle_id) VALUES($1,$2,'Driver',$3)",
    )
    .bind(&shipment_id)
    .bind(driver_id)
    .bind(&vehicle_id)
    .execute(&mut *tx)
    .await
    .expect("valid driver assignment should succeed");

    let assigned_plate: Option<String> =
        sqlx::query_scalar("SELECT vehicle_plate FROM driver_assignments WHERE shipment_id=$1")
            .bind(&shipment_id)
            .fetch_one(&mut *tx)
            .await
            .expect("assigned vehicle query failed");
    assert_eq!(assigned_plate.as_deref(), Some("A001AA"));

    for status in ["in_transit", "delivered", "completed"] {
        sqlx::query("UPDATE shipments SET status=$1 WHERE id=$2")
            .bind(status)
            .bind(&shipment_id)
            .execute(&mut *tx)
            .await
            .unwrap_or_else(|error| panic!("transition to {status} failed: {error}"));
    }

    let invalid_reset = sqlx::query("UPDATE shipments SET status='published' WHERE id=$1")
        .bind(&shipment_id)
        .execute(&mut *tx)
        .await;
    assert!(
        invalid_reset.is_err(),
        "completed shipment must not reset to published"
    );

    let notification_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM notifications WHERE user_id IN ($1,$2,$3)")
            .bind(customer_id)
            .bind(carrier_id)
            .bind(driver_id)
            .fetch_one(&mut *tx)
            .await
            .expect("notification count query failed");
    assert!(
        notification_count >= 5,
        "workflow should create operational notifications"
    );

    tx.rollback().await.expect("transaction rollback failed");
}
