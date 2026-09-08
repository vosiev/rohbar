export type Locale = "ru" | "tg";
export type Role = "customer" | "carrier" | "driver" | "admin";
export type ShipmentStatus = "published" | "offered" | "accepted" | "in_transit" | "delivered" | "completed";

export type Shipment = {
  id:string; from:string; to:string; date:string; cargo:string; weight:string; vehicle:string; price:string; status:ShipmentStatus; company:string;
};

export type User = { id:string; name:string; role:Role; phone?:string; avatar?:string };

export type ApiResult<T> = { data:T; error:null } | { data:null; error:{ code:string; message:string } };
