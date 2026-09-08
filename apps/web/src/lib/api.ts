import type { ApiResult, DriverAssignment, FleetVehicle, NotificationItem, Shipment, ShipmentOffer, User } from "@/types";

const baseUrl=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,"")||"";
const mode=process.env.NEXT_PUBLIC_API_MODE||"mock";

const mockUser:User={id:"usr_001",name:"Пользователь RohBar",role:"customer"};
const mockShipments:Shipment[]=[{id:"RH-10482",from:"Москва",to:"Казань",date:"10 сентября 2026",cargo:"Строительные материалы",weight:"20 т",vehicle:"Тент 20 т",price:"85 000 ₽",status:"in_transit",company:"ООО «СтройТранс»"},{id:"RH-10479",from:"Санкт-Петербург",to:"Москва",date:"11 сентября 2026",cargo:"Оборудование",weight:"12 т",vehicle:"Тент",price:"72 000 ₽",status:"accepted",company:"ООО «СеверЛогистик»"}];
const mockOffers:ShipmentOffer[]=[{id:"OF-291",shipmentId:"RH-10482",carrierId:"car_001",carrierName:"ООО «СтройТранс»",vehicle:"Тент 20 т · А123ВС",price:"85 000 ₽",eta:"2 дня",status:"pending"},{id:"OF-288",shipmentId:"RH-10482",carrierId:"car_002",carrierName:"ООО «СеверЛогистик»",vehicle:"Тент 20 т · М456КМ",price:"89 000 ₽",eta:"2 дня",status:"pending"},{id:"OF-284",shipmentId:"RH-10482",carrierId:"car_003",carrierName:"ИП Абдуллоев",vehicle:"Фура 20 т · Т789ОР",price:"92 000 ₽",eta:"3 дня",status:"pending"}];
const mockFleet:FleetVehicle[]=[{id:"VH-001",plate:"А123ВС",model:"КАМАЗ 54901",body:"Тент",capacity:"20 т",volume:"82 м³",status:"available"},{id:"VH-002",plate:"М456КМ",model:"MAN TGX",body:"Тент",capacity:"20 т",volume:"82 м³",status:"assigned",driverName:"Иван Петров"}];
const mockDrivers:DriverAssignment[]=[{shipmentId:"RH-10482",driverId:"drv_001",driverName:"Иван Петров",phone:"+7 900 000-00-01",vehicleId:"VH-002",vehiclePlate:"М456КМ"}];
const mockNotifications:NotificationItem[]=[{id:"NT-001",title:"Новое предложение",text:"По заявке RH-10482 получено новое предложение.",read:false,createdAt:"2026-09-08T10:42:00Z",type:"offer"},{id:"NT-002",title:"Перевозка в пути",text:"Перевозка RH-10482 переведена в статус «В пути».",read:false,createdAt:"2026-09-08T09:15:00Z",type:"shipment"}];

async function request<T>(path:string,init?:RequestInit):Promise<ApiResult<T>>{try{const response=await fetch(`${baseUrl}${path}`,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})},credentials:"include",cache:"no-store"});const body=await response.json().catch(()=>null);if(!response.ok)return{data:null,error:{code:String(body?.code||response.status),message:String(body?.message||"Request failed")}};return{data:body?.data??body,error:null}}catch(error){return{data:null,error:{code:"NETWORK_ERROR",message:error instanceof Error?error.message:"Network request failed"}}}}

export const api={
 auth:{me:async()=>mode==="mock"?{data:mockUser,error:null}:request<User>("/api/v1/auth/me")},
 shipments:{
  list:async(query="")=>mode==="mock"?{data:mockShipments,error:null}:request<Shipment[]>(`/api/v1/shipments${query?`?${query}`:""}`),
  get:async(id:string)=>mode==="mock"?{data:mockShipments.find(x=>x.id===id)||mockShipments[0],error:null}:request<Shipment>(`/api/v1/shipments/${id}`),
  create:async(payload:unknown)=>mode==="mock"?{data:{...mockShipments[0],id:`RH-${Date.now().toString().slice(-5)}`},error:null}:request<Shipment>("/api/v1/shipments",{method:"POST",body:JSON.stringify(payload)}),
  status:async(id:string,status:string)=>mode==="mock"?{data:mockShipments.find(x=>x.id===id)||mockShipments[0],error:null}:request<Shipment>(`/api/v1/shipments/${id}/status`,{method:"POST",body:JSON.stringify({status})}),
  events:async(id:string)=>mode==="mock"?{data:[],error:null}:request<unknown[]>(`/api/v1/shipments/${id}/events`)
 },
 offers:{
  list:async(shipmentId:string)=>mode==="mock"?{data:mockOffers.filter(x=>x.shipmentId===shipmentId),error:null}:request<ShipmentOffer[]>(`/api/v1/shipments/${shipmentId}/offers`),
  create:async(shipmentId:string,payload:unknown)=>mode==="mock"?{data:{...mockOffers[0],id:`OF-${Date.now().toString().slice(-4)}`,shipmentId},error:null}:request<ShipmentOffer>(`/api/v1/shipments/${shipmentId}/offers`,{method:"POST",body:JSON.stringify(payload)}),
  accept:async(id:string)=>mode==="mock"?{data:mockOffers.find(x=>x.id===id)||mockOffers[0],error:null}:request<ShipmentOffer>(`/api/v1/offers/${id}/accept`,{method:"POST"})
 },
 fleet:{
  list:async()=>mode==="mock"?{data:mockFleet,error:null}:request<FleetVehicle[]>("/api/v1/fleet"),
  create:async(payload:Record<string,unknown>)=>mode==="mock"?{data:{...mockFleet[0],...payload,id:`VH-${Date.now().toString().slice(-3)}`},error:null}:request<FleetVehicle>("/api/v1/fleet",{method:"POST",body:JSON.stringify(payload)})
 },
 drivers:{
  list:async()=>mode==="mock"?{data:mockDrivers,error:null}:request<DriverAssignment[]>("/api/v1/drivers/assignments"),
  assign:async(shipmentId:string,payload:Record<string,unknown>)=>mode==="mock"?{data:{shipmentId,...payload} as DriverAssignment,error:null}:request<DriverAssignment>(`/api/v1/shipments/${shipmentId}/driver`,{method:"POST",body:JSON.stringify(payload)})
 },
 notifications:{
  list:async()=>mode==="mock"?{data:mockNotifications,error:null}:request<NotificationItem[]>("/api/v1/notifications"),
  read:async(id:string)=>mode==="mock"?{data:mockNotifications.find(x=>x.id===id)||mockNotifications[0],error:null}:request<NotificationItem>(`/api/v1/notifications/${id}/read`,{method:"POST"}),
  readAll:async()=>mode==="mock"?{data:{ok:true},error:null}:request<{ok:boolean}>("/api/v1/notifications/read-all",{method:"POST"})
 },
 health:async()=>mode==="mock"?{data:{status:"ok"},error:null}:request<{status:string}>("/api/v1/health")
};
