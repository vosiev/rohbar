export type AutomationEvent = "shipment.created" | "shipment.published" | "offer.created" | "offer.accepted" | "driver.assigned" | "shipment.status_changed" | "shipment.completed";
export type AutomationEnvelope = { id:string; event:AutomationEvent; aggregateId:string; occurredAt:string; actorId:string; payload:Record<string,unknown> };

export function createAutomationEvent(event:AutomationEvent,aggregateId:string,actorId:string,payload:Record<string,unknown>):AutomationEnvelope{return{id:crypto.randomUUID(),event,aggregateId,actorId,occurredAt:new Date().toISOString(),payload}}

export async function dispatchAutomation(event:AutomationEnvelope):Promise<void>{
 if(process.env.NEXT_PUBLIC_API_MODE==="mock")return;
 const baseUrl=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,"");
 if(!baseUrl)throw new Error("NEXT_PUBLIC_API_URL is required in live mode");
 const response=await fetch(`${baseUrl}/api/v1/events`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":event.id},credentials:"include",body:JSON.stringify(event)});
 if(!response.ok)throw new Error(`Automation dispatch failed: ${response.status}`);
}
