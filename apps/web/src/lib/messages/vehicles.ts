import type { VehicleBodyCode } from "@/types";

export const vehicleMessages = {
  curtain: { ru: { label: "Тент / штора", description: "Универсальная боковая и задняя погрузка." }, tg: { label: "Кузови чодарпӯш", description: "Боркунӣ аз паҳлу ва қафо барои борҳои гуногун." } },
  box: { ru: { label: "Фургон", description: "Закрытый кузов для защиты груза от погоды." }, tg: { label: "Фургон", description: "Кузови пӯшида барои ҳифзи бор аз таъсири обу ҳаво." } },
  reefer: { ru: { label: "Рефрижератор", description: "Кузов с поддержанием заданной температуры." }, tg: { label: "Рефрижератор", description: "Кузов бо нигоҳдории ҳарорати муқарраршуда." } },
  isotherm: { ru: { label: "Изотерм", description: "Термоизолированный кузов без активного охлаждения." }, tg: { label: "Кузови изотермӣ", description: "Кузови гарминигоҳдор бе низоми фаъоли хунуккунӣ." } },
  flatbed: { ru: { label: "Бортовой", description: "Открытая платформа с бортами для крупного груза." }, tg: { label: "Кузови кушодаи бортдор", description: "Платформаи кушода бо бортҳо барои борҳои калон." } },
  lowbed: { ru: { label: "Трал", description: "Низкорамная платформа для техники и негабарита." }, tg: { label: "Трал", description: "Платформаи паст барои техника ва борҳои аз меъёр калон." } },
  container: { ru: { label: "Контейнеровоз", description: "Шасси для стандартных грузовых контейнеров." }, tg: { label: "Контейнеркаш", description: "Шасси барои контейнерҳои стандартии бор." } },
  van: { ru: { label: "Малотоннажный фургон", description: "Для небольших и городских партий груза." }, tg: { label: "Фургони камбор", description: "Барои борҳои хурд ва боркашонии шаҳрӣ." } },
} as const satisfies Record<VehicleBodyCode, Record<"ru" | "tg", { label: string; description: string }>>;
