"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Truck, WalletCards } from "lucide-react";
import { Button, Card, PageHeader, StatusBadge } from "@/components/rohbar-ui";
import { api } from "@/lib/api";
import { useMessages } from "@/lib/i18n-context";
import { shipmentMessages } from "@/lib/messages/shipments";
import { formatError, formatProductValue } from "@/lib/i18n";
import type { ApiError } from "@/types/api";
import type { ShipmentOffer } from "@/types";

export function OffersClient({ shipmentId }: { shipmentId: string | null }) {
  const { m, locale } = useMessages(shipmentMessages);

  const [offers, setOffers] = useState<ShipmentOffer[]>([]);
  const [loading, setLoading] = useState(Boolean(shipmentId));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | string>("");

  useEffect(() => {
    if (!shipmentId) return;
    let active = true;
    void api.offers.list(shipmentId).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error);
      else setOffers(result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [shipmentId]);

  const accepted = useMemo(
    () => offers.find((offer) => offer.status === "accepted"),
    [offers],
  );

  async function accept(id: string) {
    if (!shipmentId || busy) return;
    setBusy(id);
    setError("");

    const result = await api.offers.accept(id);
    if (result.error) {
      setError(result.error);
      setBusy(null);
      return;
    }

    const refreshed = await api.offers.list(shipmentId);
    if (refreshed.error) {
      setOffers((current) =>
        current.map((offer) =>
          offer.id === result.data.id ? result.data : offer,
        ),
      );
    } else {
      setOffers(refreshed.data);
    }
    setBusy(null);
  }

  if (!shipmentId) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <h1 className="text-xl font-black">{m("noShipmentSelected")}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {m("openShipmentOffers")}
          </p>
          <Button href="/shipments" variant="secondary" className="mt-5">
            {m("toShipments")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={m("offersEyebrow")}
        title={m("carrierOffers")}
        description={m("compareOffers", { id: shipmentId })}
      />

      {accepted && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {m("selectedCarrier", { name: accepted.carrierName })}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {formatError(error, locale)}
        </p>
      )}

      {loading ? (
        <Card>
          <p className="text-sm font-semibold text-slate-500">{m("loadingOffers")}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <Card
              key={offer.id}
              className={offer.status === "accepted" ? "border-teal-300 ring-2 ring-teal-600/10" : ""}
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700">
                    <Truck size={22} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-black">{offer.carrierName}</h2>
                      {offer.status === "accepted" && <StatusBadge status="accepted" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{formatProductValue(offer.vehicle, locale)}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={15} />
                        {offer.eta}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <WalletCards size={15} />
                        {offer.price}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  disabled={offer.status !== "pending" || busy !== null}
                  onClick={() => accept(offer.id)}
                >
                  {offer.status === "accepted" ? (
                    <>
                      <Check size={17} />
                      {m("carrierSelected")}
                    </>
                  ) : busy === offer.id ? (
                    m("selecting")
                  ) : offer.status === "rejected" ? (
                    m("rejected")
                  ) : (
                    m("selectCarrier")
                  )}
                </Button>
              </div>
            </Card>
          ))}

          {!offers.length && (
            <Card>
              <p className="font-bold">{m("noOffers")}</p>
              <p className="mt-1 text-sm text-slate-500">
                {m("noOffersDescription")}
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
