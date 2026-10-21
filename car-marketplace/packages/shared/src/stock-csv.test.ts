import { describe, expect, it } from "vitest";
import {
  type CatalogueModel,
  MAX_STOCK_ROWS,
  createModelMatcher,
  matchCounty,
  matchPhotoFile,
  parseAmount,
  parseCsv,
  parseEngineCc,
  parseKilometres,
  parseStockCsv,
  stockCsvTemplate,
} from "./stock-csv";

const CATALOGUE: CatalogueModel[] = [
  { id: 1, name: "Corolla Axio", slug: "corolla-axio", makeName: "Toyota", makeSlug: "toyota", bodyType: "saloon" },
  { id: 2, name: "Corolla Fielder", slug: "corolla-fielder", makeName: "Toyota", makeSlug: "toyota", bodyType: "station_wagon" },
  { id: 3, name: "Land Cruiser Prado", slug: "land-cruiser-prado", makeName: "Toyota", makeSlug: "toyota", bodyType: "suv" },
  { id: 4, name: "Land Cruiser", slug: "land-cruiser", makeName: "Toyota", makeSlug: "toyota", bodyType: "suv" },
  { id: 5, name: "Vitz", slug: "vitz", makeName: "Toyota", makeSlug: "toyota", bodyType: "hatchback" },
  { id: 6, name: "Fit", slug: "fit", makeName: "Honda", makeSlug: "honda", bodyType: "hatchback" },
  { id: 7, name: "C-Class", slug: "c-class", makeName: "Mercedes-Benz", makeSlug: "mercedes-benz", bodyType: "saloon" },
  { id: 8, name: "Note", slug: "note", makeName: "Nissan", makeSlug: "nissan", bodyType: null },
];
const NOW = new Date("2026-12-14T09:00:00+03:00");

describe("parseCsv", () => {
  it("handles quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const text = '﻿make,description\r\nToyota,"Clean, one owner"\r\nHonda,"Line one\nline ""two"""\r\n';
    expect(parseCsv(text)).toEqual([
      ["make", "description"],
      ["Toyota", "Clean, one owner"],
      ["Honda", 'Line one\nline "two"'],
    ]);
  });

  it("reads semicolon and tab separated exports and skips blank lines", () => {
    expect(parseCsv("make;model\nToyota;Vitz\n\n;\n")).toEqual([["make", "model"], ["Toyota", "Vitz"]]);
    expect(parseCsv("make\tmodel\nToyota\tVitz")).toEqual([["make", "model"], ["Toyota", "Vitz"]]);
  });
});

describe("value parsing", () => {
  it("reads amounts the way dealers write them", () => {
    expect(parseAmount("1,350,000")).toBe(1_350_000);
    expect(parseAmount("KES 1.35M")).toBe(1_350_000);
    expect(parseAmount("Ksh 850k")).toBe(850_000);
    expect(parseAmount("1 350 000/=")).toBe(1_350_000);
    expect(parseAmount("2.1 million")).toBe(2_100_000);
    expect(parseAmount("call for price")).toBeNull();
  });

  it("reads kilometres and engine sizes", () => {
    expect(parseKilometres("92,000 km")).toBe(92_000);
    expect(parseKilometres("92k")).toBe(92_000);
    expect(parseKilometres("84000kms")).toBe(84_000);
    expect(parseEngineCc("1,500cc")).toBe(1500);
    expect(parseEngineCc("1.5L")).toBe(1500);
    expect(parseEngineCc("2800")).toBe(2800);
  });

  it("matches counties by name or code", () => {
    expect(matchCounty("Nairobi")).toBe(47);
    expect(matchCounty("mombasa county")).toBe(1);
    expect(matchCounty("047")).toBe(47);
    expect(matchCounty("Taita Taveta")).toBe(6);
    expect(matchCounty("Atlantis")).toBeNull();
  });
});

describe("createModelMatcher", () => {
  const match = createModelMatcher(CATALOGUE);
  const id = (make: string, model: string) => {
    const r = match(make, model);
    return "model" in r ? r.model.id : r.error;
  };

  it("matches full names, short names and slugs", () => {
    expect(id("Toyota", "Corolla Axio")).toBe(1);
    expect(id("TOYOTA", "axio")).toBe(1);
    expect(id("toyota", "Fielder")).toBe(2);
    expect(id("Toyota", "Prado")).toBe(3);
    expect(id("Toyota", "Land Cruiser")).toBe(4);
    expect(id("Mercedes", "C Class")).toBe(7);
    expect(id("Benz", "c-class")).toBe(7);
    expect(id("Toyota", "Toyota Vitz")).toBe(5);
  });

  it("explains what it couldn't match, with suggestions", () => {
    expect(id("Toyta", "Vitz")).toBe('We don\'t list the make "Toyta". Did you mean Toyota?');
    expect(id("Toyota", "Vits")).toBe('We don\'t list the Toyota "Vits". Did you mean Vitz?');
    expect(id("Toyota", "Corolla")).toBe('"Corolla" could be Corolla Axio or Corolla Fielder. Use the full model name.');
    expect(id("Lada", "Niva")).toBe('We don\'t list the make "Lada".');
  });
});

const HEADER = "make,model,year,chassis_number,mileage_km,price_kes,condition,fuel,transmission";

describe("parseStockCsv", () => {
  it("turns a good row into an import row", () => {
    const text = `Make,Model,YOM,Chassis No,Mileage,Price (KES),Condition,Fuel type,Gearbox,Reg No,Negotiable,Engine,County,Features,Colour,Stock ID
Toyota,Axio,2016,nze161-7012345,"84,000 km",1.35M,Ex-Japan,Petrol,Auto,kda 123a,No,1500cc,Nairobi,"Reverse camera; push start; AC; turbo",Pearl white,A-17`;
    const { rows, fileErrors, ignoredColumns } = parseStockCsv(text, CATALOGUE, { now: NOW });
    expect(fileErrors).toEqual([]);
    expect(ignoredColumns).toEqual(["Stock ID"]);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row!.errors).toEqual([]);
    expect(row!.title).toBe("2016 Toyota Corolla Axio");
    expect(row!.chassisKey).toBe("NZE1617012345");
    expect(row!.warnings).toEqual(["Features we don't list were left out: turbo. Mention them in the description."]);
    expect(row!.value).toEqual({
      row: 2,
      model_id: 1,
      year: 2016,
      mileage_km: 84_000,
      price_kes: 1_350_000,
      negotiable: false,
      condition: "foreign_used",
      body_type: "saloon",
      fuel_type: "petrol",
      transmission: "automatic",
      drivetrain: null,
      engine_cc: 1500,
      colour: "Pearl white",
      county_code: 47,
      town: null,
      description: null,
      features: ["reverse_camera", "push_start", "air_conditioning"],
      chassis: "NZE161-7012345",
      registration_number: "KDA 123A",
    });
  });

  it("reports every problem on a row, by spreadsheet row number", () => {
    const text = `${HEADER},body_type
Toyota,Corolla,1975,12,lots,500,Second hand,Petrol,Auto,
Honda,Fit,2015,GP5-3100001,92000,980000,Foreign used,Hybrid,CVT,Spaceship
Nissan,Note,2017,E12-5100001,61000,890000,Local,Petrol,Auto,`;
    const { rows } = parseStockCsv(text, CATALOGUE, { now: NOW });
    expect(rows.map((r) => r.row)).toEqual([2, 3, 4]);
    expect(rows[0]!.value).toBeNull();
    expect(rows[0]!.errors).toEqual([
      '"Corolla" could be Corolla Axio or Corolla Fielder. Use the full model name.',
      'The year "1975" isn\'t right. Use the model year, e.g. 2016.',
      'The chassis number "12" doesn\'t look right. Use the frame number (e.g. NZE161-7012345) or a 17-character VIN.',
      'The mileage "lots" isn\'t a number of km.',
      "The price 500 is too low. Write the full amount, e.g. 1,350,000 or 1.35M.",
      'We don\'t recognise the condition "Second hand". Use one of: foreign used, locally used, new.',
    ]);
    // An unknown body type falls back to the model's usual body.
    expect(rows[1]!.errors).toEqual([]);
    expect(rows[1]!.value?.body_type).toBe("hatchback");
    expect(rows[1]!.warnings[0]).toMatch(/body type "Spaceship" — left blank/);
    // No usual body type for this model and none given.
    expect(rows[2]!.errors).toEqual(["Add the body type (e.g. Saloon, SUV, Hatchback)."]);
  });

  it("catches the same chassis twice", () => {
    const text = `${HEADER}
Toyota,Vitz,2016,NSP130-2200001,70000,850000,Foreign used,Petrol,Automatic
Toyota,Vitz,2016,nsp130 2200001,70000,850000,Foreign used,Petrol,Automatic`;
    const { rows } = parseStockCsv(text, CATALOGUE, { now: NOW });
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.errors).toEqual(["This chassis number is already on row 2."]);
  });

  it("checks the header and the size of the file", () => {
    expect(parseStockCsv("", CATALOGUE).fileErrors).toEqual(["The file is empty."]);
    expect(parseStockCsv("make,model,year\nToyota,Vitz,2016", CATALOGUE).fileErrors[0]).toMatch(
      /Missing: chassis_number, mileage_km, price_kes, condition, fuel, transmission/,
    );
    expect(parseStockCsv(HEADER, CATALOGUE).fileErrors).toEqual(["There are no cars under the header row."]);
    const many = [HEADER, ...Array.from({ length: MAX_STOCK_ROWS + 1 }, () => "Toyota,Vitz")].join("\n");
    expect(parseStockCsv(many, CATALOGUE).fileErrors[0]).toMatch(/Upload up to 200 cars at a time. This file has 201/);
  });

  it("parses its own template", () => {
    const { rows, fileErrors } = parseStockCsv(stockCsvTemplate(), CATALOGUE, { now: NOW });
    expect(fileErrors).toEqual([]);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.value?.features).toEqual(["reverse_camera", "push_start", "alloy_wheels"]);
    expect(rows[0]!.value?.county_code).toBe(1);
  });
});

describe("matchPhotoFile", () => {
  const keys = ["NZE1617012345", "GP53100001", "NZE16170123"];

  it("matches photos to cars by chassis number in the file name", () => {
    expect(matchPhotoFile("NZE161-7012345_2.jpg", keys)).toEqual({ chassisKey: "NZE1617012345", isOdometer: false, order: 2 });
    expect(matchPhotoFile("nze1617012345 front 1.JPG", keys)).toEqual({ chassisKey: "NZE1617012345", isOdometer: false, order: 1 });
    expect(matchPhotoFile("GP5-3100001.webp", keys)).toEqual({ chassisKey: "GP53100001", isOdometer: false, order: 0 });
  });

  it("spots the dashboard photo for the Passport", () => {
    expect(matchPhotoFile("NZE161-7012345-dash.jpg", keys)?.isOdometer).toBe(true);
    expect(matchPhotoFile("GP5-3100001_odometer.png", keys)?.isOdometer).toBe(true);
    expect(matchPhotoFile("GP5-3100001_mileage 3.png", keys)).toEqual({ chassisKey: "GP53100001", isOdometer: true, order: 3 });
  });

  it("ignores files for cars that aren't in the upload", () => {
    expect(matchPhotoFile("IMG_2031.jpg", keys)).toBeNull();
    expect(matchPhotoFile("KDA123A.jpg", keys)).toBeNull();
  });
});
