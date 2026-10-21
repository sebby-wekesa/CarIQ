/** Kenya's 47 counties with their official codes. Mirrors the `counties` table seed. */
export const COUNTIES = [
  { code: 1, name: "Mombasa", slug: "mombasa" },
  { code: 2, name: "Kwale", slug: "kwale" },
  { code: 3, name: "Kilifi", slug: "kilifi" },
  { code: 4, name: "Tana River", slug: "tana-river" },
  { code: 5, name: "Lamu", slug: "lamu" },
  { code: 6, name: "Taita-Taveta", slug: "taita-taveta" },
  { code: 7, name: "Garissa", slug: "garissa" },
  { code: 8, name: "Wajir", slug: "wajir" },
  { code: 9, name: "Mandera", slug: "mandera" },
  { code: 10, name: "Marsabit", slug: "marsabit" },
  { code: 11, name: "Isiolo", slug: "isiolo" },
  { code: 12, name: "Meru", slug: "meru" },
  { code: 13, name: "Tharaka-Nithi", slug: "tharaka-nithi" },
  { code: 14, name: "Embu", slug: "embu" },
  { code: 15, name: "Kitui", slug: "kitui" },
  { code: 16, name: "Machakos", slug: "machakos" },
  { code: 17, name: "Makueni", slug: "makueni" },
  { code: 18, name: "Nyandarua", slug: "nyandarua" },
  { code: 19, name: "Nyeri", slug: "nyeri" },
  { code: 20, name: "Kirinyaga", slug: "kirinyaga" },
  { code: 21, name: "Murang'a", slug: "muranga" },
  { code: 22, name: "Kiambu", slug: "kiambu" },
  { code: 23, name: "Turkana", slug: "turkana" },
  { code: 24, name: "West Pokot", slug: "west-pokot" },
  { code: 25, name: "Samburu", slug: "samburu" },
  { code: 26, name: "Trans-Nzoia", slug: "trans-nzoia" },
  { code: 27, name: "Uasin Gishu", slug: "uasin-gishu" },
  { code: 28, name: "Elgeyo-Marakwet", slug: "elgeyo-marakwet" },
  { code: 29, name: "Nandi", slug: "nandi" },
  { code: 30, name: "Baringo", slug: "baringo" },
  { code: 31, name: "Laikipia", slug: "laikipia" },
  { code: 32, name: "Nakuru", slug: "nakuru" },
  { code: 33, name: "Narok", slug: "narok" },
  { code: 34, name: "Kajiado", slug: "kajiado" },
  { code: 35, name: "Kericho", slug: "kericho" },
  { code: 36, name: "Bomet", slug: "bomet" },
  { code: 37, name: "Kakamega", slug: "kakamega" },
  { code: 38, name: "Vihiga", slug: "vihiga" },
  { code: 39, name: "Bungoma", slug: "bungoma" },
  { code: 40, name: "Busia", slug: "busia" },
  { code: 41, name: "Siaya", slug: "siaya" },
  { code: 42, name: "Kisumu", slug: "kisumu" },
  { code: 43, name: "Homa Bay", slug: "homa-bay" },
  { code: 44, name: "Migori", slug: "migori" },
  { code: 45, name: "Kisii", slug: "kisii" },
  { code: 46, name: "Nyamira", slug: "nyamira" },
  { code: 47, name: "Nairobi", slug: "nairobi" },
] as const;

export type County = (typeof COUNTIES)[number];
export type CountyCode = County["code"];

/** Launch counties get top billing in pickers. */
export const LAUNCH_COUNTY_CODES: readonly CountyCode[] = [1, 47];

export function countyByCode(code: number): County | undefined {
  return COUNTIES.find((c) => c.code === code);
}

export function countyBySlug(slug: string): County | undefined {
  return COUNTIES.find((c) => c.slug === slug);
}
