export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn";
export type ShipmentOffer = { id:string; shipmentId:string; carrierId:string; carrierName:string; vehicle:string; price:number; currency:"RUB"; etaDays:number; status:OfferStatus; createdAt:string };
export type FleetVehicle = { id:string; plate:string; type:string; body:string; capacityTons:number; status:"available"|"on_route"|"maintenance" };
export type NotificationItem = { id:string; title:string; text:string; read:boolean; createdAt:string; type:"shipment"|"offer"|"system" };
