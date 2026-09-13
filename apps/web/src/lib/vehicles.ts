import { intlLocale } from "@/lib/i18n";
import { commonMessages } from "@/lib/messages/common";
import { vehicleMessages } from "@/lib/messages/vehicles";
import type { Locale, VehicleBodyCode } from "@/types";

export type VehicleBodyType = {
  code: VehicleBodyCode;
  label: string;
  description: string;
  image: string;
};

/** Canonical Russian labels are retained for API payload compatibility. */
export const vehicleBodyTypes: VehicleBodyType[] = getVehicleBodyTypes("ru");

export function getVehicleBodyTypes(locale: Locale): VehicleBodyType[] {
  return (Object.keys(vehicleMessages) as VehicleBodyCode[]).map(code => ({
    code, ...vehicleMessages[code][locale], image: `/vehicles/${code}.svg`,
  }));
}

export function bodyType(code?: VehicleBodyCode | null, locale: Locale = "ru") {
  const types = getVehicleBodyTypes(locale);
  return types.find(item => item.code === code) ?? types[0];
}

export function formatWeightKg(value?: number | null, locale: Locale = "ru") {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toLocaleString(intlLocale[locale], { maximumFractionDigits: 2 })} т`;
  return `${value.toLocaleString(intlLocale[locale])} кг`;
}

export function formatVolumeLiters(value?: number | null, locale: Locale = "ru") {
  if (value == null) return commonMessages.notSpecified[locale];
  return `${(value / 1000).toLocaleString(intlLocale[locale], { maximumFractionDigits: 2 })} м³`;
}

export function formatDimensions(lengthMm?: number | null, widthMm?: number | null, heightMm?: number | null, locale: Locale = "ru") {
  if (!lengthMm || !widthMm || !heightMm) return commonMessages.noDimensions[locale];
  return [lengthMm, widthMm, heightMm].map(value => (value / 1000).toLocaleString(intlLocale[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(" × ") + " м";
}

export function calculateVolumeLiters(lengthCm: number, widthCm: number, heightCm: number, quantity: number) {
  if ([lengthCm, widthCm, heightCm, quantity].some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return Math.round((lengthCm * widthCm * heightCm * quantity) / 1000);
}
