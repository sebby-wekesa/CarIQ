/**
 * Dealer stock upload: read a CSV (saved from Excel or Google Sheets), match each row to our
 * make/model catalogue and turn Kenyan ways of writing things ("1.35M", "Ex-Japan", "Auto",
 * "92,000 km") into listing values. Everything is checked in the browser so the dealer sees
 * every problem, row by row, before anything is saved.
 */
import { COUNTIES } from "./counties";
import { FEATURES, type FeatureKey } from "./listing";
import {
  type BodyType,
  type Condition,
  type Drivetrain,
  type FuelType,
  MIN_YEAR,
  type Transmission,
  maxYear,
} from "./vehicle";
import { normalizeKenyanPlate, parseChassis } from "./vehicle-ids";

export const MAX_STOCK_ROWS = 200;

/** Columns in the template, in order. Only the first nine are required. */
export const STOCK_COLUMNS = [
  { key: "make", label: "make", required: true, example: "Toyota" },
  { key: "model", label: "model", required: true, example: "Axio" },
  { key: "year", label: "year", required: true, example: "2016" },
  { key: "chassis_number", label: "chassis_number", required: true, example: "NZE161-7012345" },
  { key: "mileage_km", label: "mileage_km", required: true, example: "84,000" },
  { key: "price_kes", label: "price_kes", required: true, example: "1,350,000" },
  { key: "condition", label: "condition", required: true, example: "Foreign used" },
  { key: "fuel", label: "fuel", required: true, example: "Petrol" },
  { key: "transmission", label: "transmission", required: true, example: "Automatic" },
  { key: "body_type", label: "body_type", required: false, example: "Saloon" },
  { key: "registration_number", label: "registration_number", required: false, example: "" },
  { key: "negotiable", label: "negotiable", required: false, example: "Yes" },
  { key: "drivetrain", label: "drivetrain", required: false, example: "2WD" },
  { key: "engine_cc", label: "engine_cc", required: false, example: "1500" },
  { key: "colour", label: "colour", required: false, example: "Pearl white" },
  { key: "county", label: "county", required: false, example: "Mombasa" },
  { key: "town", label: "town", required: false, example: "Nyali" },
  { key: "features", label: "features", required: false, example: "Reverse camera; Push-button start; Alloy wheels" },
  { key: "description", label: "description", required: false, example: "One owner in Japan. Serviced at 80,000 km." },
] as const;

export type StockColumn = (typeof STOCK_COLUMNS)[number]["key"];

/** A blank template with one example row, for the "Download template" link. */
export function stockCsvTemplate(): string {
  const header = STOCK_COLUMNS.map((c) => c.label).join(",");
  const example = STOCK_COLUMNS.map((c) => csvCell(c.example)).join(",");
  return `${header}\r\n${example}\r\n`;
}

export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The make/model catalogue the matcher works against (from the makes and models tables). */
export type CatalogueModel = {
  id: number;
  name: string;
  slug: string;
  makeName: string;
  makeSlug: string;
  bodyType?: BodyType | null;
};

/** What import_dealer_stock() takes for one row. */
export type StockImportRow = {
  row: number;
  model_id: number;
  year: number;
  mileage_km: number;
  price_kes: number;
  negotiable: boolean;
  condition: Condition;
  body_type: BodyType;
  fuel_type: FuelType;
  transmission: Transmission;
  drivetrain: Drivetrain | null;
  engine_cc: number | null;
  colour: string | null;
  county_code: number | null;
  town: string | null;
  description: string | null;
  features: FeatureKey[];
  chassis: string;
  registration_number: string | null;
};

export type ParsedStockRow = {
  /** Line number in the spreadsheet (the header is row 1). */
  row: number;
  /** "2016 Toyota Axio" when we could read it. */
  title: string;
  /** Chassis key (letters and digits), for matching photo file names. */
  chassisKey: string | null;
  errors: string[];
  warnings: string[];
  value: StockImportRow | null;
};

export type ParsedStock = {
  /** Problems with the file itself (no rows read). */
  fileErrors: string[];
  /** Columns we didn't recognise and ignored. */
  ignoredColumns: string[];
  rows: ParsedStockRow[];
};

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

/** RFC 4180 CSV with Excel's habits: BOM, CRLF, semicolons or tabs in some locales. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.slice(0, input.search(/\r?\n|$/));
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function detectDelimiter(line: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, line.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

// ---------------------------------------------------------------------------------------------
// Words → values
// ---------------------------------------------------------------------------------------------

/** Lowercase letters and digits only: "Land Cruiser Prado" → "landcruiserprado". */
export const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");

const HEADER_ALIASES: Record<string, StockColumn> = {
  make: "make",
  brand: "make",
  manufacturer: "make",
  model: "model",
  year: "year",
  yom: "year",
  yearofmanufacture: "year",
  modelyear: "year",
  chassisnumber: "chassis_number",
  chassisno: "chassis_number",
  chassis: "chassis_number",
  framenumber: "chassis_number",
  frameno: "chassis_number",
  frame: "chassis_number",
  vin: "chassis_number",
  mileagekm: "mileage_km",
  mileage: "mileage_km",
  km: "mileage_km",
  kms: "mileage_km",
  odometer: "mileage_km",
  pricekes: "price_kes",
  price: "price_kes",
  priceksh: "price_kes",
  askingprice: "price_kes",
  cashprice: "price_kes",
  condition: "condition",
  fuel: "fuel",
  fueltype: "fuel",
  transmission: "transmission",
  gearbox: "transmission",
  gear: "transmission",
  bodytype: "body_type",
  body: "body_type",
  registrationnumber: "registration_number",
  registration: "registration_number",
  regno: "registration_number",
  reg: "registration_number",
  numberplate: "registration_number",
  plate: "registration_number",
  negotiable: "negotiable",
  drivetrain: "drivetrain",
  drive: "drivetrain",
  enginecc: "engine_cc",
  engine: "engine_cc",
  enginesize: "engine_cc",
  cc: "engine_cc",
  colour: "colour",
  color: "colour",
  county: "county",
  location: "county",
  town: "town",
  area: "town",
  features: "features",
  extras: "features",
  description: "description",
  notes: "description",
  comments: "description",
};

const CONDITION_WORDS: Record<string, Condition> = {
  foreignused: "foreign_used",
  foreign: "foreign_used",
  exjapan: "foreign_used",
  exuk: "foreign_used",
  imported: "foreign_used",
  import: "foreign_used",
  fu: "foreign_used",
  locallyused: "locally_used",
  localused: "locally_used",
  local: "locally_used",
  kenyanused: "locally_used",
  usedlocally: "locally_used",
  lu: "locally_used",
  new: "new",
  brandnew: "new",
};

const FUEL_WORDS: Record<string, FuelType> = {
  petrol: "petrol",
  gasoline: "petrol",
  gas: "petrol",
  diesel: "diesel",
  hybrid: "hybrid",
  petrolhybrid: "hybrid",
  hev: "hybrid",
  phev: "hybrid",
  electric: "electric",
  ev: "electric",
  lpg: "lpg",
};

const TRANSMISSION_WORDS: Record<string, Transmission> = {
  automatic: "automatic",
  auto: "automatic",
  at: "automatic",
  manual: "manual",
  mt: "manual",
  cvt: "cvt",
  semiautomatic: "semi_automatic",
  semiauto: "semi_automatic",
  amt: "semi_automatic",
};

const BODY_WORDS: Record<string, BodyType> = {
  saloon: "saloon",
  sedan: "saloon",
  hatchback: "hatchback",
  hatch: "hatchback",
  stationwagon: "station_wagon",
  wagon: "station_wagon",
  estate: "station_wagon",
  suv: "suv",
  pickup: "pickup",
  doublecab: "pickup",
  singlecab: "pickup",
  van: "van",
  minibus: "minibus",
  matatu: "minibus",
  coupe: "coupe",
  convertible: "convertible",
  cabriolet: "convertible",
  truck: "truck",
  lorry: "truck",
  bus: "bus",
};

const DRIVE_WORDS: Record<string, Drivetrain | null> = {
  fwd: "fwd",
  frontwheeldrive: "fwd",
  ff: "fwd",
  rwd: "rwd",
  rearwheeldrive: "rwd",
  fr: "rwd",
  awd: "awd",
  allwheeldrive: "awd",
  "4wd": "four_wd",
  "4x4": "four_wd",
  fourwheeldrive: "four_wd",
  "2wd": null,
};

const YES = new Set(["yes", "y", "true", "1", "negotiable", "ono"]);
const NO = new Set(["no", "n", "false", "0", "fixed", "firm"]);

const MAKE_ALIASES: Record<string, string> = {
  mercedes: "mercedesbenz",
  benz: "mercedesbenz",
  merc: "mercedesbenz",
  vw: "volkswagen",
  landrover: "landrover",
  rangerover: "landrover",
  chevy: "chevrolet",
};

const FEATURE_LOOKUP = new Map<string, FeatureKey>(
  FEATURES.flatMap((f) => [
    [squash(f.key), f.key],
    [squash(f.label), f.key],
  ]),
);
FEATURE_LOOKUP.set("ac", "air_conditioning");
FEATURE_LOOKUP.set("aircon", "air_conditioning");
FEATURE_LOOKUP.set("carplay", "android_auto_carplay");
FEATURE_LOOKUP.set("androidauto", "android_auto_carplay");
FEATURE_LOOKUP.set("pushstart", "push_start");
FEATURE_LOOKUP.set("keyless", "keyless_entry");
FEATURE_LOOKUP.set("reversecam", "reverse_camera");
FEATURE_LOOKUP.set("backcamera", "reverse_camera");
FEATURE_LOOKUP.set("nav", "navigation");
FEATURE_LOOKUP.set("gps", "navigation");
FEATURE_LOOKUP.set("alloys", "alloy_wheels");
FEATURE_LOOKUP.set("leather", "leather_seats");
FEATURE_LOOKUP.set("7seater", "third_row");
FEATURE_LOOKUP.set("thirdrowseats", "third_row");

/**
 * Amounts as dealers write them: "1,350,000", "KES 1.35M", "Ksh 850k", "1 350 000/=".
 * Returns null when it isn't a number.
 */
export function parseAmount(input: string): number | null {
  let s = input.toLowerCase().replace(/kes|ksh|kshs|sh|\/=|=|\s/g, "");
  let factor = 1;
  if (/(m|mn|million)$/.test(s)) {
    factor = 1_000_000;
    s = s.replace(/(m|mn|million)$/, "");
  } else if (/k$/.test(s)) {
    factor = 1_000;
    s = s.replace(/k$/, "");
  }
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * factor);
}

/** "92,000 km", "92k", "92000" → 92000. */
export function parseKilometres(input: string): number | null {
  return parseAmount(input.toLowerCase().replace(/kms?|kilometres?|kilometers?/g, ""));
}

/** "1500", "1,500cc", "1.5L", "1.5" → 1500. */
export function parseEngineCc(input: string): number | null {
  const s = input.toLowerCase().replace(/cc|litres?|liters?|l$|\s|,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Math.round(n < 20 ? n * 1000 : n);
}

/** County by name ("Nairobi", "Nairobi County") or code ("047"). */
export function matchCounty(input: string): number | null {
  const s = squash(input).replace(/county$/, "");
  if (/^\d{1,3}$/.test(s)) {
    const code = Number(s);
    return COUNTIES.some((c) => c.code === code) ? code : null;
  }
  return COUNTIES.find((c) => squash(c.name) === s)?.code ?? null;
}

// ---------------------------------------------------------------------------------------------
// Make and model matching
// ---------------------------------------------------------------------------------------------

export type ModelMatch = { model: CatalogueModel } | { error: string };

export function createModelMatcher(catalogue: readonly CatalogueModel[]) {
  const makes = new Map<string, { name: string; models: CatalogueModel[] }>();
  for (const m of catalogue) {
    for (const key of [squash(m.makeName), squash(m.makeSlug)]) {
      const entry = makes.get(key) ?? { name: m.makeName, models: [] };
      if (!entry.models.includes(m)) entry.models.push(m);
      makes.set(key, entry);
    }
  }

  return function match(makeInput: string, modelInput: string): ModelMatch {
    const makeKey = squash(makeInput);
    const make = makes.get(makeKey) ?? makes.get(MAKE_ALIASES[makeKey] ?? "");
    if (!make) {
      const near = closest(makeKey, [...new Set([...makes.values()].map((m) => m.name))]);
      return { error: `We don't list the make "${makeInput}"${near.length ? `. Did you mean ${orList(near)}?` : "."}` };
    }

    // "Corolla Axio" or "Axio"; "Prado" or "Land Cruiser Prado"; "Fielder" or "Corolla Fielder".
    let modelKey = squash(modelInput);
    const makeName = squash(make.name);
    if (modelKey.startsWith(makeName) && modelKey.length > makeName.length) modelKey = modelKey.slice(makeName.length);
    const exact = make.models.filter((m) => squash(m.name) === modelKey || squash(m.slug) === modelKey);
    if (exact.length === 1) return { model: exact[0]! };

    const partial = make.models.filter((m) => {
      const name = squash(m.name);
      return modelKey.length >= 3 && (name.endsWith(modelKey) || name.startsWith(modelKey) || modelKey.endsWith(name));
    });
    if (partial.length === 1) return { model: partial[0]! };
    if (partial.length > 1) {
      return { error: `"${modelInput}" could be ${orList(partial.slice(0, 4).map((m) => m.name))}. Use the full model name.` };
    }

    const near = closest(modelKey, make.models.map((m) => m.name));
    return {
      error: `We don't list the ${make.name} "${modelInput}"${near.length ? `. Did you mean ${orList(near)}?` : "."}`,
    };
  };
}

function orList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** Up to three names within a small edit distance of the input. */
function closest(key: string, names: string[]): string[] {
  return names
    .map((name) => ({ name, d: editDistance(key, squash(name)) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(key.length / 3)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.name);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length]!;
}

// ---------------------------------------------------------------------------------------------
// The whole file
// ---------------------------------------------------------------------------------------------

export function parseStockCsv(
  text: string,
  catalogue: readonly CatalogueModel[],
  options: { now?: Date } = {},
): ParsedStock {
  const table = parseCsv(text);
  if (table.length === 0) return { fileErrors: ["The file is empty."], ignoredColumns: [], rows: [] };

  const header = table[0]!;
  const columns = new Map<StockColumn, number>();
  const ignoredColumns: string[] = [];
  header.forEach((name, i) => {
    const key = HEADER_ALIASES[squash(name)];
    if (key && !columns.has(key)) columns.set(key, i);
    else if (name.trim()) ignoredColumns.push(name.trim());
  });

  const missing = STOCK_COLUMNS.filter((c) => c.required && !columns.has(c.key)).map((c) => c.label);
  if (missing.length) {
    return {
      fileErrors: [
        `The first row must name the columns. Missing: ${missing.join(", ")}. Download the template to see the layout.`,
      ],
      ignoredColumns,
      rows: [],
    };
  }

  const body = table.slice(1);
  if (body.length === 0) return { fileErrors: ["There are no cars under the header row."], ignoredColumns, rows: [] };
  if (body.length > MAX_STOCK_ROWS) {
    return {
      fileErrors: [`Upload up to ${MAX_STOCK_ROWS} cars at a time. This file has ${body.length}. Split it into smaller files.`],
      ignoredColumns,
      rows: [],
    };
  }

  const match = createModelMatcher(catalogue);
  const seenChassis = new Map<string, number>();
  const latestYear = maxYear(options.now);

  const rows = body.map((cells, index): ParsedStockRow => {
    const row = index + 2;
    const get = (key: StockColumn) => {
      const i = columns.get(key);
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    // Make and model
    let model: CatalogueModel | null = null;
    if (!get("make") || !get("model")) errors.push("Add the make and model.");
    else {
      const result = match(get("make"), get("model"));
      if ("error" in result) errors.push(result.error);
      else model = result.model;
    }

    // Year
    const yearText = get("year");
    const year = /^\d{4}$/.test(yearText) ? Number(yearText) : NaN;
    if (!yearText) errors.push("Add the year.");
    else if (Number.isNaN(year) || year < MIN_YEAR || year > latestYear) {
      errors.push(`The year "${yearText}" isn't right. Use the model year, e.g. 2016.`);
    }

    // Chassis
    const chassisText = get("chassis_number");
    const chassis = chassisText ? parseChassis(chassisText) : null;
    if (!chassisText) errors.push("Add the chassis number. It links the car to its Vehicle Passport.");
    else if (!chassis) errors.push(`The chassis number "${chassisText}" doesn't look right. Use the frame number (e.g. NZE161-7012345) or a 17-character VIN.`);
    else if (seenChassis.has(chassis.key)) {
      errors.push(`This chassis number is already on row ${seenChassis.get(chassis.key)}.`);
    } else seenChassis.set(chassis.key, row);

    // Mileage and price
    const mileageText = get("mileage_km");
    const mileage = mileageText ? parseKilometres(mileageText) : null;
    if (!mileageText) errors.push("Add the mileage in km.");
    else if (mileage === null || mileage > 2_000_000) errors.push(`The mileage "${mileageText}" isn't a number of km.`);
    else if (mileage < 100 && get("condition") && squash(get("condition")) !== "new") {
      warnings.push(`Mileage of ${mileage} km is very low for a used car. Check it isn't in thousands.`);
    }

    const priceText = get("price_kes");
    const price = priceText ? parseAmount(priceText) : null;
    if (!priceText) errors.push("Add the price in KES.");
    else if (price === null) errors.push(`The price "${priceText}" isn't an amount in KES.`);
    else if (price < 10_000) errors.push(`The price ${price.toLocaleString("en-KE")} is too low. Write the full amount, e.g. 1,350,000 or 1.35M.`);
    else if (price > 1_000_000_000) errors.push(`The price "${priceText}" looks too high.`);

    // Words
    const word = <T>(key: StockColumn, table: Record<string, T>, what: string, required: boolean): T | null | undefined => {
      const text = get(key);
      if (!text) {
        if (required) errors.push(`Add the ${what}.`);
        return undefined;
      }
      const s = squash(text);
      if (s in table) return table[s];
      const options = [...new Set(Object.values(table).filter(Boolean) as string[])].map((v) => v.replace(/_/g, " "));
      (required ? errors : warnings).push(
        `We don't recognise the ${what} "${text}"${required ? "" : " — left blank"}. Use one of: ${options.join(", ")}.`,
      );
      return undefined;
    };
    const condition = word("condition", CONDITION_WORDS, "condition", true);
    const fuel = word("fuel", FUEL_WORDS, "fuel", true);
    const transmission = word("transmission", TRANSMISSION_WORDS, "transmission", true);
    let body = word("body_type", BODY_WORDS, "body type", false) ?? null;
    if (!body && model?.bodyType) body = model.bodyType;
    if (!body && model) errors.push("Add the body type (e.g. Saloon, SUV, Hatchback).");
    const drivetrain = word("drivetrain", DRIVE_WORDS, "drivetrain", false) ?? null;

    // Optional bits
    const plateText = get("registration_number");
    let plate: string | null = null;
    if (plateText) {
      plate = normalizeKenyanPlate(plateText);
      if (!plate) warnings.push(`The number plate "${plateText}" isn't a Kenyan plate — left blank.`);
    }

    const negText = squash(get("negotiable"));
    let negotiable = true;
    if (negText) {
      if (YES.has(negText)) negotiable = true;
      else if (NO.has(negText)) negotiable = false;
      else warnings.push(`"Negotiable" should be Yes or No — treated as Yes.`);
    }

    const engineText = get("engine_cc");
    let engineCc: number | null = null;
    if (engineText) {
      engineCc = parseEngineCc(engineText);
      if (engineCc === null || engineCc < 50 || engineCc > 20_000) {
        warnings.push(`The engine size "${engineText}" isn't in cc — left blank.`);
        engineCc = null;
      }
    }

    const countyText = get("county");
    let county: number | null = null;
    if (countyText) {
      county = matchCounty(countyText);
      if (county === null) warnings.push(`We don't know the county "${countyText}" — your dealership's county is used.`);
    }

    const features: FeatureKey[] = [];
    const unknownFeatures: string[] = [];
    for (const part of get("features").split(/[;|,\n]/)) {
      const name = part.trim();
      if (!name) continue;
      const key = FEATURE_LOOKUP.get(squash(name));
      if (key) {
        if (!features.includes(key)) features.push(key);
      } else unknownFeatures.push(name);
    }
    if (unknownFeatures.length) {
      warnings.push(`Features we don't list were left out: ${unknownFeatures.join(", ")}. Mention them in the description.`);
    }

    const clip = (key: StockColumn, max: number, what: string) => {
      const text = get(key);
      if (text.length > max) {
        warnings.push(`The ${what} was cut to ${max.toLocaleString("en-KE")} characters.`);
        return text.slice(0, max);
      }
      return text || null;
    };
    const colour = clip("colour", 40, "colour");
    const town = clip("town", 80, "town");
    const description = clip("description", 5000, "description");

    const title = model && !Number.isNaN(year) ? `${year} ${model.makeName} ${model.name}` : [get("year"), get("make"), get("model")].filter(Boolean).join(" ");

    const ok =
      errors.length === 0 &&
      model !== null &&
      chassis !== null &&
      mileage !== null &&
      price !== null &&
      condition &&
      fuel &&
      transmission &&
      body;

    return {
      row,
      title,
      chassisKey: chassis?.key ?? null,
      errors,
      warnings,
      value: ok
        ? {
            row,
            model_id: model!.id,
            year,
            mileage_km: mileage!,
            price_kes: price!,
            negotiable,
            condition: condition!,
            body_type: body!,
            fuel_type: fuel!,
            transmission: transmission!,
            drivetrain,
            engine_cc: engineCc,
            colour,
            county_code: county,
            town,
            description,
            features,
            chassis: chassis!.display,
            registration_number: plate,
          }
        : null,
    };
  });

  return { fileErrors: [], ignoredColumns, rows };
}

// ---------------------------------------------------------------------------------------------
// Photos named after the car
// ---------------------------------------------------------------------------------------------

export type PhotoFileMatch = {
  /** Chassis key of the car the file belongs to. */
  chassisKey: string;
  /** Dashboard/odometer pictures go to the Passport as the mileage photo. */
  isOdometer: boolean;
  /** For ordering: "NZE161-7012345_2.jpg" → 2. */
  order: number;
};

/**
 * Match photo file names to cars by chassis number: "NZE161-7012345_1.jpg",
 * "nze1617012345 front.jpg", "NZE161-7012345-dash.jpg" (odometer). Returns null when no car
 * in the list matches.
 */
export function matchPhotoFile(fileName: string, chassisKeys: readonly string[]): PhotoFileMatch | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "");
  const key = squash(base);
  // Longest key first, so NZE1617012345 wins over a shorter key it contains.
  const sorted = [...chassisKeys].sort((a, b) => b.length - a.length);
  const chassisKey = sorted.find((k) => k.length > 0 && key.startsWith(squash(k)));
  if (!chassisKey) return null;

  // Whatever follows the chassis number in the original name: "_2", " dash", "-front-1".
  const target = squash(chassisKey).length;
  let seen = 0;
  let i = 0;
  while (i < base.length && seen < target) {
    if (/[a-z0-9]/i.test(base[i]!)) seen++;
    i++;
  }
  const rest = base.slice(i);
  const isOdometer = /(dash|odo|mileage|cluster|meter|speedo)/i.test(rest);
  const num = rest.match(/(\d+)\s*$/);
  return { chassisKey, isOdometer, order: num ? Number(num[1]) : 0 };
}
