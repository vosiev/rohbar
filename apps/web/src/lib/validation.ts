import type { Locale } from "@/types";
import { message } from "@/lib/i18n";
import { validationMessages } from "@/lib/messages/validation";

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isFormControl(target: EventTarget | null): target is FormControl {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Localize browser constraint messages without changing the validity rules. */
export function validationMessage(control: FormControl, locale: Locale): string {
  const validity = control.validity;
  const m = (key: keyof typeof validationMessages, params?: Record<string, string>) => message(validationMessages, locale, key, params);
  if (validity.valueMissing) return m("required");
  if (validity.typeMismatch) return m(control.type === "email" ? "email" : "url");
  if (validity.tooShort && "minLength" in control) return m("tooShort", { limit: String(control.minLength) });
  if (validity.tooLong && "maxLength" in control) return m("tooLong", { limit: String(control.maxLength) });
  if (validity.rangeUnderflow && "min" in control) return m("minimum", { limit: control.min });
  if (validity.rangeOverflow && "max" in control) return m("maximum", { limit: control.max });
  if (validity.badInput) return m("number");
  if (validity.stepMismatch && "step" in control) return m("step", { step: control.step || "1" });
  return validity.valid ? "" : m("invalid");
}

export function subscribeValidation(locale: Locale, controls: Set<FormControl>): () => void {
  const localize = (control: FormControl) => {
    // Remove our previous message before reading native validity flags.
    if (controls.has(control)) control.setCustomValidity("");
    const text = validationMessage(control, locale);
    control.setCustomValidity(text);
    if (text) controls.add(control);
    else controls.delete(control);
  };
  for (const control of controls) {
    if (control.isConnected) localize(control);
    else controls.delete(control);
  }
  const onInvalid = (event: Event) => {
    if (isFormControl(event.target)) localize(event.target);
  };
  const onInput = (event: Event) => {
    if (isFormControl(event.target) && controls.has(event.target)) {
      event.target.setCustomValidity("");
      controls.delete(event.target);
    }
  };
  document.addEventListener("invalid", onInvalid, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onInput, true);
  return () => {
    document.removeEventListener("invalid", onInvalid, true);
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("change", onInput, true);
  };
}
