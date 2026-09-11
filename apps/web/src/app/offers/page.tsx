import { OffersClient } from "./offers-client";

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ shipment?: string }>;
}) {
  const { shipment } = await searchParams;
  return <OffersClient shipmentId={shipment?.trim() || null} />;
}
