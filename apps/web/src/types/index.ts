export type Locale = "ru" | "tg";
export type Role = "customer" | "carrier" | "driver" | "admin";
export type ShipmentStatus =
  | "published"
  | "offered"
  | "accepted"
  | "in_transit"
  | "delivered"
  | "completed"
  | "cancelled";
export type OfferStatus = "pending" | "accepted" | "rejected";
export type VehicleStatus = "available" | "assigned" | "maintenance";
export type VehicleBodyCode =
  | "curtain"
  | "box"
  | "reefer"
  | "isotherm"
  | "flatbed"
  | "lowbed"
  | "container"
  | "van";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
};
export type Shipment = {
  id: string;
  from: string;
  to: string;
  date: string;
  cargo: string;
  weight: string;
  weightKg?: number | null;
  volumeLiters?: number | null;
  volumeEstimated: boolean;
  requestedBodyCode?: VehicleBodyCode | null;
  vehicle: string;
  selectedVehicleId?: string | null;
  selectedCarrierId?: string | null;
  price: string;
  status: ShipmentStatus;
  company: string;
};

export type ShipmentOffer = {
  id: string;
  shipmentId: string;
  carrierId: string;
  carrierName: string;
  vehicle: string;
  vehicleId?: string | null;
  price: string;
  eta: string;
  status: OfferStatus;
};
export type FleetVehicle = {
  id: string;
  ownerId: string;
  ownerName: string;
  plate: string;
  model: string;
  body: string;
  bodyCode?: VehicleBodyCode | null;
  capacity: string;
  capacityKg?: number | null;
  volume: string;
  volumeLiters?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  year?: number | null;
  photoUrl?: string | null;
  status: VehicleStatus;
  driverName?: string | null;
};

export type AvailableVehicle = {
  id: string;
  carrierId: string;
  carrierName: string;
  plate: string;
  model: string;
  body: string;
  bodyCode?: VehicleBodyCode | null;
  capacityKg: number;
  volumeLiters?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  year?: number | null;
  photoUrl?: string | null;
  status: VehicleStatus;
  reservedWeightKg: number;
  reservedVolumeLiters: number;
  remainingWeightKg: number;
  remainingVolumeLiters?: number | null;
  pendingReservations: number;
};

export type TeamDriver = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  busy: boolean;
  currentShipmentId?: string | null;
};

export type DriverAssignment = {
  shipmentId: string;
  driverId: string;
  driverName: string;
  phone?: string | null;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
};

export type NotificationItem = {
  id: string;
  title: string;
  text: string;
  createdAt: string;
  read: boolean;
  type: "offer" | "shipment" | "document" | "system";
};

export type ShipmentEvent = {
  id: string;
  shipmentId: string;
  event: string;
  occurredAt: string;
  actorId: string;
  payload: Record<string, unknown>;
};

export type HealthStatus = {
  status: "ok" | "degraded";
  database: boolean;
  redis: boolean;
};

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string } };
