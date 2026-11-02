// Ward, district and city for companies and leads (stats filters).
//
// People still say "Quận 4" after the 2025 merger removed the district tier,
// so `district` is the familiar district or area name, not only an official
// unit. Values are normalised so "Q4", "q.4" and "Quận 4" group together.
// Blank fields are filled from the address or area text only when a part
// carries an explicit marker (Phường/P., Quận/Q., Huyện, a known city name);
// anything unclear stays blank rather than guessed.
import { foldText } from "../search";

export interface Area { ward: string; district: string; city: string }
export const areaKeys = ["ward", "district", "city"] as const;
export type AreaKey = typeof areaKeys[number];
export const AREA_MAX = 80;

const CITIES: [RegExp, string][] = [
  [/^(?:tp\.?\s*|thành phố\s+)?(?:hồ chí minh|ho chi minh|hcm|hcmc|sài gòn|sai gon|saigon)$|^tp\.?\s*hcm$|^tphcm$/u, "TP. Hồ Chí Minh"],
  [/^(?:tp\.?\s*|thành phố\s+)?(?:hà nội|ha noi|hn)$/u, "Hà Nội"],
  [/^(?:tp\.?\s*|thành phố\s+)?(?:đà nẵng|da nang)$/u, "Đà Nẵng"],
  [/^(?:tp\.?\s*|thành phố\s+)?(?:hải phòng|hai phong)$/u, "Hải Phòng"],
  [/^(?:tp\.?\s*|thành phố\s+)?(?:cần thơ|can tho)$/u, "Cần Thơ"],
  [/^(?:tp\.?\s*|thành phố\s+)?huế$/u, "Huế"],
];

const clean = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").trim().slice(0, AREA_MAX);
const capitalise = (value: string) => value.replace(/(^|\s)(\p{Ll})/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase("vi"));

function known(value: string): string | null {
  const folded = foldText(clean(value)).replace(/\.\s*/gu, ". ").replace(/\s+/gu, " ");
  for (const [pattern, name] of CITIES) if (pattern.test(folded) || pattern.test(folded.replace(/\.\s/gu, "."))) return name;
  return null;
}

/** Canonical spelling for one area value; "" stays "". */
export function normalizeArea(key: AreaKey, raw: string): string {
  const value = clean(raw);
  if (!value) return "";
  const folded = foldText(value);
  if (key === "city") {
    const city = known(value);
    if (city) return city;
    const named = /^(?:tỉnh|thành phố|tp\.?)\s*(.+)$/u.exec(folded);
    return named ? capitalise(named[1]) : capitalise(folded);
  }
  if (key === "district") {
    const numbered = /^(?:quận|q\.?)\s*(\d{1,2})$/u.exec(folded);
    if (numbered) return `Quận ${Number(numbered[1])}`;
    const named = /^(quận|q\.|huyện|h\.|thị xã|tx\.?|thành phố|tp\.?)\s*(.+)$/u.exec(folded);
    if (named) {
      const kind = { "q.": "quận", "h.": "huyện", "tx.": "thị xã", tx: "thị xã", "tp.": "thành phố", tp: "thành phố" }[named[1]] ?? named[1];
      return kind === "thành phố" ? `TP. ${capitalise(named[2])}` : capitalise(`${kind} ${named[2]}`);
    }
    return capitalise(folded);
  }
  const numbered = /^(?:phường|p\.?)\s*(\d{1,2})$/u.exec(folded);
  if (numbered) return `Phường ${Number(numbered[1])}`;
  const named = /^(phường|p\.|xã|x\.|thị trấn|tt\.?)\s*(.+)$/u.exec(folded);
  if (named) {
    const kind = { "p.": "phường", "x.": "xã", "tt.": "thị trấn", tt: "thị trấn" }[named[1]] ?? named[1];
    return capitalise(`${kind} ${named[2]}`);
  }
  return capitalise(folded);
}

/** Reads explicitly marked ward/district/city parts from free text such as an address. */
export function parseArea(...texts: string[]): Partial<Area> {
  const found: Partial<Area> = {};
  for (const text of texts) {
    for (const part of clean(text ?? "").split(/[,;\n–—-]+/u).map((item) => item.trim()).filter(Boolean)) {
      const folded = foldText(part);
      if (!found.city && known(part)) found.city = known(part)!;
      else if (!found.city && /^(?:tỉnh|thành phố|tp\.?)\s*\p{L}/u.test(folded) && !/thủ đức/u.test(folded)) found.city = normalizeArea("city", part);
      else if (!found.district && /^(?:quận|q\.?\s*\d|q\.\s*\p{L}|huyện|thị xã|(?:thành phố|tp\.?)\s*thủ đức)/u.test(folded)) found.district = normalizeArea("district", part);
      else if (!found.ward && /^(?:phường|p\.?\s*\d|p\.\s*\p{L}|xã|thị trấn)/u.test(folded)) found.ward = normalizeArea("ward", part);
    }
  }
  // Numbered districts (Quận 1–12) and Thủ Đức exist only in Ho Chi Minh City.
  if (!found.city && found.district && /^(?:Quận \d+|TP\. Thủ Đức)$/u.test(found.district)) found.city = "TP. Hồ Chí Minh";
  return found;
}

/** Normalised area from a form, with blanks filled from the given free text. */
export function completeArea(given: Partial<Record<AreaKey, string>>, ...texts: string[]): Area {
  const parsed = parseArea(...texts);
  const pick = (key: AreaKey) => normalizeArea(key, given[key] ?? "") || parsed[key] || "";
  const area = { ward: pick("ward"), district: pick("district"), city: pick("city") };
  if (!area.city && /^(?:Quận \d+|TP\. Thủ Đức)$/u.test(area.district)) area.city = "TP. Hồ Chí Minh";
  return area;
}

/** Area fields read from a form under an optional prefix (lengths checked by the caller). */
export function formArea(form: FormData, prefix = ""): Partial<Area> {
  const value = (key: AreaKey) => { const raw = form.get(`${prefix}${key}`); return typeof raw === "string" ? raw : ""; };
  return { ward: value("ward"), district: value("district"), city: value("city") };
}

export function areaLabel(area: Partial<Area>): string {
  return [area.ward, area.district, area.city].filter(Boolean).join(", ");
}

/** Validated, normalised area from a form; blanks filled from `texts`. */
export function readArea(errors: { text(form: FormData, key: string, max: number): string }, form: FormData, ...texts: string[]): Area {
  const given: Area = { ward: errors.text(form, "ward", AREA_MAX), district: errors.text(form, "district", AREA_MAX), city: errors.text(form, "city", AREA_MAX) };
  return completeArea(given, ...texts);
}
