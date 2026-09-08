import type { ApiResult, Shipment, User } from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";

async function request<T>(path:string, init?:RequestInit):Promise<ApiResult<T>> {
  const response=await fetch(`${baseUrl}${path}`,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})},credentials:"include",cache:"no-store"});
  const body=await response.json().catch(()=>null);
  if(!response.ok)return {data:null,error:{code:String(body?.code||response.status),message:String(body?.message||"Request failed")}};
  return {data:body?.data ?? body,error:null};
}

export const api={
  auth:{me:()=>request<User>("/api/v1/auth/me")},
  shipments:{list:(query="")=>request<Shipment[]>(`/api/v1/shipments${query?`?${query}`:""}`),get:(id:string)=>request<Shipment>(`/api/v1/shipments/${id}`),create:(payload:unknown)=>request<Shipment>("/api/v1/shipments",{method:"POST",body:JSON.stringify(payload)}),accept:(id:string)=>request<Shipment>(`/api/v1/shipments/${id}/accept`,{method:"POST"})},
  health:()=>request<{status:string}>("/api/v1/health")
};
