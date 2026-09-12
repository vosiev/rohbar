use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::test]
async fn concurrent_reservations_cannot_overbook_vehicle() {
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL is required for tests");
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&database_url)
        .await
        .expect("database connection failed");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("database migration failed");

    let suffix = Uuid::new_v4().simple().to_string();
    let carrier_id = Uuid::new_v4();
    let customer_a = Uuid::new_v4();
    let customer_b = Uuid::new_v4();
    let vehicle_id = format!("VH-{}", &suffix[..8]);
    let shipment_a = format!("RSV-{}A", &suffix[8..16]);
    let shipment_b = format!("RSV-{}B", &suffix[16..24]);
    sqlx::query(
        "INSERT INTO users(id,email,name,password_hash,role) VALUES
         ($1,$2,'Carrier','test-hash','carrier'),
         ($3,$4,'Customer A','test-hash','customer'),
         ($5,$6,'Customer B','test-hash','customer')",
    )
    .bind(carrier_id)
    .bind(format!("carrier-{suffix}@example.test"))
    .bind(customer_a)
    .bind(format!("customer-a-{suffix}@example.test"))
    .bind(customer_b)
    .bind(format!("customer-b-{suffix}@example.test"))
    .execute(&pool)
    .await
    .expect("fixture users insert failed");

    sqlx::query(
        "INSERT INTO fleet_vehicles(
            id,owner_id,plate,model,body,body_code,capacity,capacity_kg,volume,volume_liters,status
         ) VALUES($1,$2,$3,'Concurrency Truck','Tent','curtain','10 t',10000,'50 m3',50000,'available')",
    )
    .bind(&vehicle_id)
    .bind(carrier_id)
    .bind(format!("T{}", &suffix[..7]))
    .execute(&pool)
    .await
    .expect("fixture vehicle insert failed");

    for (shipment_id, customer_id) in [(&shipment_a, customer_a), (&shipment_b, customer_b)] {
        sqlx::query(
            "INSERT INTO shipments(
                id,customer_id,from_city,to_city,date,cargo,weight,weight_kg,volume_liters,
                vehicle,selected_vehicle_id,selected_carrier_id,price,status,company
             ) VALUES($1,$2,'A','B','2026-09-12','Cargo','6 t',6000,10000,
                'Tent',$3,$4,'100','published','Customer')",
        )
        .bind(shipment_id)
        .bind(customer_id)
        .bind(&vehicle_id)
        .bind(carrier_id)
        .execute(&pool)
        .await
        .expect("fixture shipment insert failed");
    }

    let reserve_a = sqlx::query(
        "INSERT INTO vehicle_reservations(
            shipment_id,vehicle_id,requested_weight_kg,requested_volume_liters,state
         ) VALUES($1,$2,6000,10000,'pending')",
    )
    .bind(&shipment_a)
    .bind(&vehicle_id)
    .execute(&pool);
    let reserve_b = sqlx::query(
        "INSERT INTO vehicle_reservations(
            shipment_id,vehicle_id,requested_weight_kg,requested_volume_liters,state
         ) VALUES($1,$2,6000,10000,'pending')",
    )
    .bind(&shipment_b)
    .bind(&vehicle_id)
    .execute(&pool);

    let (result_a, result_b) = tokio::join!(reserve_a, reserve_b);
    let success_count = usize::from(result_a.is_ok()) + usize::from(result_b.is_ok());
    assert_eq!(
        success_count, 1,
        "exactly one over-capacity reservation must succeed"
    );

    let reserved_weight: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(requested_weight_kg),0)::BIGINT
         FROM vehicle_reservations
         WHERE vehicle_id=$1 AND state IN ('pending','confirmed')",
    )
    .bind(&vehicle_id)
    .fetch_one(&pool)
    .await
    .expect("reserved weight query failed");
    assert_eq!(reserved_weight, 6000);
    sqlx::query("DELETE FROM shipments WHERE id IN ($1,$2)")
        .bind(&shipment_a)
        .bind(&shipment_b)
        .execute(&pool)
        .await
        .expect("shipment cleanup failed");
    sqlx::query("DELETE FROM fleet_vehicles WHERE id=$1")
        .bind(&vehicle_id)
        .execute(&pool)
        .await
        .expect("vehicle cleanup failed");
    sqlx::query("DELETE FROM users WHERE id IN ($1,$2,$3)")
        .bind(carrier_id)
        .bind(customer_a)
        .bind(customer_b)
        .execute(&pool)
        .await
        .expect("user cleanup failed");
}
