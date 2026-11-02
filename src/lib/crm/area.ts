// Ward and province/city for companies and leads, on Vietnam's administrative
// map after the 2025 merger (in force 2025-07-01): two tiers only, 34
// provinces/cities and 3,321 wards, communes and special zones, from the
// General Statistics Office list (src/data/vn-admin-units.json, docs/crm/STATS.md).
//
// Stored values are the official full names ("Phường Khánh Hội",
// "Thành phố Hồ Chí Minh"). Input is checked against the list: case, accents
// and the "Phường"/"Tỉnh"/"TP." prefix do not matter, but a name that is not
// on the list is refused. Pre-merger province names map to their new province
// (Nghị quyết 202/2025/QH15); pre-merger wards and districts are not guessed.
// The `district` column stays in the schema but is always empty.
import units from "../../data/vn-admin-units.json" with { type: "json" };

export interface Area { ward: string; district: string; city: string }
export interface Ward { code: string; fullName: string; name: string; province: string }
export interface Province { code: string; fullName: string; name: string; wards: Ward[] }
export const AREA_MAX = 80;

export const provinces: Province[] = (units.provinces as [string, string, string, [string, string, string][]][]).map(([code, fullName, name, wards]) => ({
  code, fullName, name, wards: wards.map(([wardCode, wardFull, wardName]) => ({ code: wardCode, fullName: wardFull, name: wardName, province: code })),
}));

/** Lower case, no accents, no punctuation, single spaces: "TP. Hồ Chí Minh" → "tp ho chi minh". */
export function areaKey(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase()
    .replace(/[.,;:()\-–—_/]+/g, " ").replace(/\s+/g, " ").trim();
}
const stripProvince = (key: string) => key.replace(/^(?:tinh|thanh pho|tp)\s+/, "");
const stripWard = (key: string) => key.replace(/^(?:phuong|xa|dac khu|p|x|thi tran|tt)\s+/, "");

// Pre-merger provinces (and common short forms) → the province that holds them now.
const FORMER: Record<string, string> = {
  "ha giang": "08", "yen bai": "15", "bac kan": "19", "vinh phuc": "25", "hoa binh": "25", "bac giang": "24", "thai binh": "33",
  "hai duong": "31", "ha nam": "37", "nam dinh": "37", "quang binh": "44", "quang nam": "48", "kon tum": "51", "binh dinh": "52",
  "ninh thuan": "56", "dak nong": "68", "binh thuan": "68", "phu yen": "66", "binh duong": "79", "ba ria vung tau": "79",
  "ba ria": "79", "vung tau": "79", "binh phuoc": "75", "long an": "80", "soc trang": "92", "hau giang": "92", "ben tre": "86",
  "tra vinh": "86", "tien giang": "82", "bac lieu": "96", "kien giang": "91",
  "hcm": "79", "tphcm": "79", "hcmc": "79", "sai gon": "79", "saigon": "79", "hn": "01", "thua thien hue": "46",
};

const byKey = new Map<string, Province>();
for (const province of provinces) {
  byKey.set(areaKey(province.fullName), province);
  byKey.set(stripProvince(areaKey(province.name)), province);
}
for (const [key, code] of Object.entries(FORMER)) { const province = provinces.find((item) => item.code === code); if (province) byKey.set(key, province); }

export function findProvince(text: string): Province | null {
  const key = areaKey(text);
  return key ? byKey.get(key) ?? byKey.get(stripProvince(key)) ?? null : null;
}

export function provinceByName(fullName: string): Province | null {
  return provinces.find((item) => item.fullName === fullName) ?? null;
}

/** A ward of `province` by its name, with or without "Phường"/"Xã"; null when unknown or ambiguous. */
export function findWard(province: Province, text: string): Ward | null {
  const key = areaKey(text);
  if (!key) return null;
  const exact = province.wards.filter((ward) => areaKey(ward.fullName) === key);
  if (exact.length === 1) return exact[0];
  const bare = stripWard(key);
  const named = province.wards.filter((ward) => areaKey(ward.name) === bare);
  return named.length === 1 ? named[0] : null;
}

// Pre-merger urban districts (quận) and HCMC rural districts (huyện), each in
// exactly one centrally run city; written with their marker they identify the
// province. Pre-2025 district lists of those cities, compiled here (not part
// of the GSO unit list).
const FORMER_DISTRICTS: Record<string, string> = Object.fromEntries([
  ...["thu duc", "binh thanh", "go vap", "phu nhuan", "tan binh", "tan phu", "binh tan", "cu chi", "hoc mon", "binh chanh", "nha be", "can gio"].map((name) => [name, "79"]),
  ...["ba dinh", "hoan kiem", "hai ba trung", "dong da", "tay ho", "cau giay", "thanh xuan", "hoang mai", "long bien", "bac tu liem", "nam tu liem", "ha dong"].map((name) => [name, "01"]),
  ...["hai chau", "thanh khe", "son tra", "ngu hanh son", "lien chieu", "cam le"].map((name) => [name, "48"]),
  ...["hong bang", "ngo quyen", "le chan", "hai an", "kien an", "do son", "duong kinh"].map((name) => [name, "31"]),
  ...["ninh kieu", "binh thuy", "cai rang", "o mon", "thot not"].map((name) => [name, "92"]),
]);

/** The province a marked pre-merger district names: "Quận 4", "Q.4", "Quận Bình Thạnh", "Huyện Củ Chi", "TP Thủ Đức". */
function provinceOfFormerDistrict(text: string): Province | null {
  const key = areaKey(text);
  // Numbered urban districts (Quận 1–12) existed only in Ho Chi Minh City.
  if (/^(?:quan|q)\s*(?:[1-9]|1[0-2])$/.test(key)) return provinces.find((item) => item.code === "79") ?? null;
  const named = /^(?:quan|q|huyen|h|thanh pho|tp)\s+(.+)$/.exec(key);
  const code = named ? FORMER_DISTRICTS[named[1]] : undefined;
  return code ? provinces.find((item) => item.code === code) ?? null : null;
}

/**
 * Reads a province and a ward from free text such as an address. The province
 * comes from a part naming a current or pre-merger province, or else from a
 * marked pre-merger district; the ward only from a part written with its
 * "Phường"/"Xã"/"Đặc khu" marker that names a current ward of that province.
 * Anything else stays blank (pre-merger numbered wards are never guessed).
 */
export function parseArea(...texts: string[]): Area {
  const parts = texts.flatMap((text) => (text ?? "").split(/[,;\n]+/)).map((part) => part.trim()).filter(Boolean);
  const province = [...parts].reverse().map(findProvince).find(Boolean) ?? parts.map(provinceOfFormerDistrict).find(Boolean) ?? null;
  if (!province) return { ward: "", district: "", city: "" };
  const ward = parts.filter((part) => /^(?:phường|p\.|xã|x\.|đặc khu)\s*\S/iu.test(part.normalize("NFC"))).map((part) => findWard(province, part)).find(Boolean) ?? null;
  return { ward: ward?.fullName ?? "", district: "", city: province.fullName };
}

/**
 * Validated area from a form: `city` and `ward` must be on the official list
 * (returned in their official spelling). Both blank: read from `texts`.
 */
export function readArea(errors: { text(form: FormData, key: string, max: number): string; add(field: string, code: string): void }, form: FormData, ...texts: string[]): Area {
  const cityText = errors.text(form, "city", AREA_MAX);
  const wardText = errors.text(form, "ward", AREA_MAX);
  if (!cityText && !wardText) return parseArea(...texts);
  const province = cityText ? findProvince(cityText) : parseArea(...texts).city ? provinceByName(parseArea(...texts).city) : null;
  if (!province) { errors.add("city", cityText ? "invalid" : "required"); return { ward: "", district: "", city: "" }; }
  const ward = wardText ? findWard(province, wardText) : null;
  if (wardText && !ward) errors.add("ward", "invalid");
  return { ward: ward?.fullName ?? "", district: "", city: province.fullName };
}

/** Official names for a filter value, or "" when it is not on the list. */
export function areaFilter(city: string, ward: string): { city: string; ward: string } {
  const province = city ? findProvince(city) : null;
  const found = province && ward ? findWard(province, ward) : null;
  return { city: province?.fullName ?? "", ward: found?.fullName ?? "" };
}

export function areaLabel(area: Partial<Area>): string {
  return [area.ward, area.city].filter(Boolean).join(", ");
}
