import type { Role, ShipmentStatus } from "@/types";

export type CreateShipmentPayload={
  from:string;
  to:string;
  cargo:string;
  weight:string;
  vehicle:string;
  body:string;
  date:string;
  time:string;
};

export type ShipmentEvent={
  id:string;
  shipmentId:string;
  type:"created"|"published"|"offer_received"|"carrier_accepted"|"status_changed"|"delivered"|"completed";
  actorRole:Role;
  status?:ShipmentStatus;
  createdAt:string;
  metadata?:Record<string,unknown>;
};

export type ApiEnvelope<T>={data:T;meta?:{requestId?:string;cursor?:string|null}};
export type ApiError={code:string;message:string;fields?:Record<string,string[]>;requestId?:string};
