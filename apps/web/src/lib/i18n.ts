import type { Locale, ShipmentStatus } from "@/types";
import { errorMessages } from "@/lib/messages/errors";
import { vehicleMessages } from "@/lib/messages/vehicles";

export const dictionary = {
  ru:{brand:"RohBar", home:"Главная", shipments:"Перевозки", dashboard:"Кабинет", create:"Создать заявку", search:"Найти перевозку", profile:"Профиль", notifications:"Уведомления", carrier:"Перевозчик", customer:"Заказчик", route:"Маршрут", cargo:"Груз", date:"Дата", weight:"Вес", vehicle:"Транспорт", price:"Стоимость", status:"Статус", offers:"Предложения", active:"Активные", history:"История", fleet:"Автопарк", drivers:"Водители", settings:"Настройки", login:"Войти", register:"Регистрация", next:"Продолжить", publish:"Опубликовать", back:"Назад", from:"Откуда", to:"Куда", heroTitle:"Грузоперевозки без лишних звонков", heroText:"Находите подходящий транспорт, создавайте заявки и управляйте перевозками в одной системе.", heroPrimary:"Создать заявку", heroSecondary:"Найти перевозку", today:"Сегодня", upcoming:"Предстоящие", published:"Опубликована", offered:"Есть предложения", accepted:"Принята", in_transit:"В пути", delivered:"Доставлена", completed:"Завершена", all:"Все", filter:"Фильтры", clear:"Сбросить", noResults:"Ничего не найдено", telegram:"Открыть в Telegram"},
  tg:{brand:"RohBar", home:"Саҳифаи асосӣ", shipments:"Боркашониҳо", dashboard:"Ҳуҷраи шахсӣ", create:"Эҷоди дархост", search:"Ҷустуҷӯи боркашонӣ", profile:"Профил", notifications:"Огоҳиномаҳо", carrier:"Боркашон", customer:"Фармоишгар", route:"Масир", cargo:"Бор", date:"Сана", weight:"Вазн", vehicle:"Нақлиёт", price:"Нарх", status:"Ҳолат", offers:"Пешниҳодҳо", active:"Фаъол", history:"Таърих", fleet:"Автопарк", drivers:"Ронандагон", settings:"Танзимот", login:"Ворид шудан", register:"Бақайдгирӣ", next:"Идома додан", publish:"Интишор кардан", back:"Бозгашт", from:"Аз куҷо", to:"Ба куҷо", heroTitle:"Боркашонӣ бе зангҳои зиёдатӣ", heroText:"Нақлиёти мувофиқро ёбед, дархост эҷод кунед ва боркашониҳоро дар як система идора намоед.", heroPrimary:"Эҷоди дархост", heroSecondary:"Ҷустуҷӯи боркашонӣ", today:"Имрӯз", upcoming:"Оянда", published:"Интишоршуда", offered:"Пешниҳодҳо ҳастанд", accepted:"Қабул шуд", in_transit:"Дар роҳ", delivered:"Расонида шуд", completed:"Анҷом ёфт", all:"Ҳама", filter:"Филтрҳо", clear:"Тоза кардан", noResults:"Ҳеҷ чиз ёфт нашуд", telegram:"Кушодан дар Telegram"}
} as const;

export function t(locale:Locale,key:keyof typeof dictionary.ru){ return dictionary[locale][key]; }

export type MessageCatalog = Record<string, Record<Locale, string>>;
export function message<C extends MessageCatalog>(catalog: C, locale: Locale, key: keyof C, params?: Record<string, string | number>): string {
  return catalog[key][locale].replace(/\{(\w+)\}/g, (slot, name: string) => params?.[name] === undefined ? slot : String(params[name]));
}

export const intlLocale: Record<Locale, string> = { ru: "ru-RU", tg: "tg-TJ" };

/** Preserve the calendar day of API date-only values, and local time for timestamps. */
export function formatDate(value: string, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale[locale], {
    ...(options ?? { dateStyle: "medium" }),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: "UTC" } : {}),
  }).format(date);
}

/** Translate known product vocabulary only; free-form customer data stays intact. */
export function formatProductValue(value: string, locale: Locale): string {
  for (const body of Object.values(vehicleMessages)) {
    if (value === body.ru.label) return body[locale].label;
    // The API also composes vehicle descriptions from plate, model and body.
    const suffix = ` · ${body.ru.label}`;
    if (value.endsWith(suffix)) return value.slice(0, -suffix.length) + ` · ${body[locale].label}`;
  }
  if (value === "Любой подходящий автомобиль") return locale === "ru" ? value : "Ҳар автомобили мувофиқ";
  return value;
}

/** Keep canonical API failures in state and localize them at render time. */
export function formatError(error: { code: string; message: string } | string | null | undefined, locale: Locale): string {
  if (!error) return "";
  const rawMessage = typeof error === "string" ? error : error.message;
  if (Object.hasOwn(errorMessages, rawMessage)) return errorMessages[rawMessage as keyof typeof errorMessages][locale];
  const code = typeof error === "string" ? "" : error.code;
  if (code === "NETWORK_ERROR") return locale === "ru" ? "Не удалось связаться с сервером. Проверьте подключение и повторите попытку." : "Пайвастшавӣ ба сервер имконнопазир шуд. Пайвасти интернетро санҷида, дубора кӯшиш кунед.";
  if (code === "401") return errorMessages["Authentication required"][locale];
  if (code === "403") return errorMessages["Insufficient permissions"][locale];
  if (code === "404") return locale === "ru" ? "Запрошенные данные не найдены." : "Маълумоти дархостшуда ёфт нашуд.";
  if (code === "409") return locale === "ru" ? "Данные изменились. Обновите страницу и повторите действие." : "Маълумот тағйир ёфтааст. Саҳифаро нав карда, амалро такрор кунед.";
  if (code === "400" || code === "422") return locale === "ru" ? "Проверьте введённые данные и повторите попытку." : "Маълумоти воридшударо санҷида, дубора кӯшиш кунед.";
  if (code === "429") return locale === "ru" ? "Слишком много запросов. Подождите и повторите попытку." : "Дархостҳо аз ҳад зиёданд. Каме интизор шуда, дубора кӯшиш кунед.";
  return locale === "ru" ? "Не удалось выполнить запрос. Повторите попытку позже." : "Дархост иҷро нашуд. Баъдтар дубора кӯшиш кунед.";
}

export function statusLabel(status: string, locale: Locale): string {
  if (status === "cancelled") return locale === "ru" ? "Отменена" : "Бекор шудааст";
  if (["published", "offered", "accepted", "in_transit", "delivered", "completed"].includes(status)) {
    return t(locale, status as Exclude<ShipmentStatus, "cancelled">);
  }
  return status;
}
