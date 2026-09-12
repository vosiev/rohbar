import type { VehicleBodyCode } from "@/types";

export type VehicleBodyType = {
  code: VehicleBodyCode;
  label: string;
  description: string;
  image: string;
};

export const vehicleBodyTypes: VehicleBodyType[] = [
  { code: "curtain", label: "Тент / штора", description: "Универсальная боковая и задняя погрузка.", image: "/vehicles/curtain.svg" },
  { code: "box", label: "Фургон", description: "Закрытый кузов для защиты груза от погоды.", image: "/vehicles/box.svg" },
  { code: "reefer", label: "Рефрижератор", description: "Кузов с поддержанием заданной температуры.", image: "/vehicles/reefer.svg" },
  { code: "isotherm", label: "Изотерм", description: "Термоизолированный кузов без активного охлаждения.", image: "/vehicles/isotherm.svg" },
  { code: "flatbed", label: "Бортовой", description: "Открытая платформа с бортами для крупного груза.", image: "/vehicles/flatbed.svg" },
  { code: "lowbed", label: "Трал", description: "Низкорамная платформа для техники и негабарита.", image: "/vehicles/lowbed.svg" },
  { code: "container", label: "Контейнеровоз", description: "Шасси для стандартных грузовых контейнеров.", image: "/vehicles/container.svg" },
  { code: "van", label: "Малотоннажный фургон", description: "Для небольших и городских партий груза.", image: "/vehicles/van.svg" },
];

export function bodyType(code?: VehicleBodyCode | null) {
  return vehicleBodyTypes.find((item) => item.code === code) ?? vehicleBodyTypes[0];
}

export function formatWeightKg(value?: number | null) {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} т`;
  return `${value.toLocaleString("ru-RU")} кг`;
}

export function formatVolumeLiters(value?: number | null) {
  if (value == null) return "Не указан";
  return `${(value / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м³`;
}

export function formatDimensions(lengthMm?: number | null, widthMm?: number | null, heightMm?: number | null) {
  if (!lengthMm || !widthMm || !heightMm) return "Размеры не указаны";
  return `${(lengthMm / 1000).toFixed(2)} × ${(widthMm / 1000).toFixed(2)} × ${(heightMm / 1000).toFixed(2)} м`;
}

export function calculateVolumeLiters(lengthCm: number, widthCm: number, heightCm: number, quantity: number) {
  if ([lengthCm, widthCm, heightCm, quantity].some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return Math.round((lengthCm * widthCm * heightCm * quantity) / 1000);
}
