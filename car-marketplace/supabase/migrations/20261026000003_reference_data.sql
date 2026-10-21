-- =============================================================================
-- Reference data needed in every environment: counties, vehicle catalogue, plans.
-- (seed.sql is for local demo data only.)
-- =============================================================================

-- Counties ---------------------------------------------------------------------
insert into public.counties (code, name, slug) values
  (1, 'Mombasa', 'mombasa'), (2, 'Kwale', 'kwale'), (3, 'Kilifi', 'kilifi'),
  (4, 'Tana River', 'tana-river'), (5, 'Lamu', 'lamu'), (6, 'Taita-Taveta', 'taita-taveta'),
  (7, 'Garissa', 'garissa'), (8, 'Wajir', 'wajir'), (9, 'Mandera', 'mandera'),
  (10, 'Marsabit', 'marsabit'), (11, 'Isiolo', 'isiolo'), (12, 'Meru', 'meru'),
  (13, 'Tharaka-Nithi', 'tharaka-nithi'), (14, 'Embu', 'embu'), (15, 'Kitui', 'kitui'),
  (16, 'Machakos', 'machakos'), (17, 'Makueni', 'makueni'), (18, 'Nyandarua', 'nyandarua'),
  (19, 'Nyeri', 'nyeri'), (20, 'Kirinyaga', 'kirinyaga'), (21, 'Murang''a', 'muranga'),
  (22, 'Kiambu', 'kiambu'), (23, 'Turkana', 'turkana'), (24, 'West Pokot', 'west-pokot'),
  (25, 'Samburu', 'samburu'), (26, 'Trans-Nzoia', 'trans-nzoia'), (27, 'Uasin Gishu', 'uasin-gishu'),
  (28, 'Elgeyo-Marakwet', 'elgeyo-marakwet'), (29, 'Nandi', 'nandi'), (30, 'Baringo', 'baringo'),
  (31, 'Laikipia', 'laikipia'), (32, 'Nakuru', 'nakuru'), (33, 'Narok', 'narok'),
  (34, 'Kajiado', 'kajiado'), (35, 'Kericho', 'kericho'), (36, 'Bomet', 'bomet'),
  (37, 'Kakamega', 'kakamega'), (38, 'Vihiga', 'vihiga'), (39, 'Bungoma', 'bungoma'),
  (40, 'Busia', 'busia'), (41, 'Siaya', 'siaya'), (42, 'Kisumu', 'kisumu'),
  (43, 'Homa Bay', 'homa-bay'), (44, 'Migori', 'migori'), (45, 'Kisii', 'kisii'),
  (46, 'Nyamira', 'nyamira'), (47, 'Nairobi', 'nairobi');

-- Makes ------------------------------------------------------------------------
-- sort_order: popular makes first in pickers (Toyota dominates the Kenyan market).
insert into public.makes (name, slug, is_popular, sort_order)
select name, private.slugify(name), sort_order < 20, sort_order
from (values
  ('Toyota', 1), ('Nissan', 2), ('Mazda', 3), ('Subaru', 4), ('Mitsubishi', 5),
  ('Honda', 6), ('Isuzu', 7), ('Mercedes-Benz', 8), ('Volkswagen', 9), ('BMW', 10),
  ('Suzuki', 11), ('Land Rover', 12), ('Lexus', 13), ('Audi', 14), ('Ford', 15),
  ('Hyundai', 16), ('Kia', 17), ('Daihatsu', 18), ('Peugeot', 19),
  ('Volvo', 30), ('Jeep', 31), ('Porsche', 32), ('Mini', 33), ('Jaguar', 34),
  ('Renault', 35), ('BYD', 36), ('Haval', 37), ('Chery', 38),
  ('Mitsubishi Fuso', 50), ('Hino', 51), ('UD Trucks', 52), ('Scania', 53)
) as m(name, sort_order);

-- Models -----------------------------------------------------------------------
-- body_type is the usual body for that model in Kenya; sellers can override per listing.
insert into public.models (make_id, name, slug, body_type)
select mk.id, v.model, private.slugify(v.model), v.body::public.body_type
from (values
  -- Toyota
  ('Toyota', 'Corolla', 'saloon'), ('Toyota', 'Corolla Axio', 'saloon'),
  ('Toyota', 'Corolla Fielder', 'station_wagon'), ('Toyota', 'Corolla Cross', 'suv'),
  ('Toyota', 'Vitz', 'hatchback'), ('Toyota', 'Yaris', 'hatchback'), ('Toyota', 'Belta', 'saloon'),
  ('Toyota', 'Passo', 'hatchback'), ('Toyota', 'Aqua', 'hatchback'), ('Toyota', 'Prius', 'hatchback'),
  ('Toyota', 'Premio', 'saloon'), ('Toyota', 'Allion', 'saloon'), ('Toyota', 'Mark X', 'saloon'),
  ('Toyota', 'Crown', 'saloon'), ('Toyota', 'Camry', 'saloon'), ('Toyota', 'Auris', 'hatchback'),
  ('Toyota', 'Probox', 'station_wagon'), ('Toyota', 'Succeed', 'station_wagon'),
  ('Toyota', 'Wish', 'station_wagon'), ('Toyota', 'Isis', 'van'), ('Toyota', 'Sienta', 'van'),
  ('Toyota', 'Spade', 'hatchback'), ('Toyota', 'Porte', 'hatchback'), ('Toyota', 'Noah', 'van'),
  ('Toyota', 'Voxy', 'van'), ('Toyota', 'Alphard', 'van'), ('Toyota', 'Vellfire', 'van'),
  ('Toyota', 'Harrier', 'suv'), ('Toyota', 'RAV4', 'suv'), ('Toyota', 'Vanguard', 'suv'),
  ('Toyota', 'Rush', 'suv'), ('Toyota', 'C-HR', 'suv'), ('Toyota', 'Fortuner', 'suv'),
  ('Toyota', 'Kluger', 'suv'), ('Toyota', 'Land Cruiser Prado', 'suv'),
  ('Toyota', 'Land Cruiser', 'suv'), ('Toyota', 'Land Cruiser 70', 'pickup'),
  ('Toyota', 'Hilux', 'pickup'), ('Toyota', 'Hiace', 'minibus'), ('Toyota', 'Townace', 'van'),
  ('Toyota', 'Liteace', 'van'), ('Toyota', 'Dyna', 'truck'), ('Toyota', 'Coaster', 'bus'),
  -- Nissan
  ('Nissan', 'Note', 'hatchback'), ('Nissan', 'March', 'hatchback'), ('Nissan', 'Tiida', 'hatchback'),
  ('Nissan', 'Sylphy', 'saloon'), ('Nissan', 'Bluebird Sylphy', 'saloon'),
  ('Nissan', 'Wingroad', 'station_wagon'), ('Nissan', 'AD', 'station_wagon'),
  ('Nissan', 'Teana', 'saloon'), ('Nissan', 'Fuga', 'saloon'), ('Nissan', 'Cube', 'hatchback'),
  ('Nissan', 'Juke', 'suv'), ('Nissan', 'Kicks', 'suv'), ('Nissan', 'Dualis', 'suv'),
  ('Nissan', 'Qashqai', 'suv'), ('Nissan', 'X-Trail', 'suv'), ('Nissan', 'Murano', 'suv'),
  ('Nissan', 'Patrol', 'suv'), ('Nissan', 'Navara', 'pickup'), ('Nissan', 'NP300', 'pickup'),
  ('Nissan', 'Serena', 'van'), ('Nissan', 'Lafesta', 'van'), ('Nissan', 'Elgrand', 'van'),
  ('Nissan', 'Caravan', 'minibus'), ('Nissan', 'Leaf', 'hatchback'), ('Nissan', 'Atlas', 'truck'),
  -- Mazda
  ('Mazda', 'Demio', 'hatchback'), ('Mazda', 'Mazda2', 'hatchback'), ('Mazda', 'Axela', 'hatchback'),
  ('Mazda', 'Mazda3', 'hatchback'), ('Mazda', 'Atenza', 'saloon'), ('Mazda', 'Mazda6', 'saloon'),
  ('Mazda', 'Verisa', 'hatchback'), ('Mazda', 'Premacy', 'van'), ('Mazda', 'Biante', 'van'),
  ('Mazda', 'CX-3', 'suv'), ('Mazda', 'CX-5', 'suv'), ('Mazda', 'CX-7', 'suv'), ('Mazda', 'CX-8', 'suv'),
  ('Mazda', 'BT-50', 'pickup'), ('Mazda', 'Bongo', 'van'),
  -- Subaru
  ('Subaru', 'Impreza', 'hatchback'), ('Subaru', 'XV', 'suv'), ('Subaru', 'Forester', 'suv'),
  ('Subaru', 'Outback', 'station_wagon'), ('Subaru', 'Legacy', 'station_wagon'),
  ('Subaru', 'Levorg', 'station_wagon'), ('Subaru', 'WRX', 'saloon'), ('Subaru', 'Exiga', 'van'),
  -- Mitsubishi
  ('Mitsubishi', 'Mirage', 'hatchback'), ('Mitsubishi', 'Colt', 'hatchback'),
  ('Mitsubishi', 'Lancer', 'saloon'), ('Mitsubishi', 'Galant Fortis', 'saloon'),
  ('Mitsubishi', 'RVR', 'suv'), ('Mitsubishi', 'ASX', 'suv'), ('Mitsubishi', 'Eclipse Cross', 'suv'),
  ('Mitsubishi', 'Outlander', 'suv'), ('Mitsubishi', 'Pajero', 'suv'), ('Mitsubishi', 'Pajero Sport', 'suv'),
  ('Mitsubishi', 'L200', 'pickup'), ('Mitsubishi', 'Triton', 'pickup'), ('Mitsubishi', 'Delica', 'van'),
  -- Honda
  ('Honda', 'Fit', 'hatchback'), ('Honda', 'Fit Shuttle', 'station_wagon'), ('Honda', 'Insight', 'hatchback'),
  ('Honda', 'Grace', 'saloon'), ('Honda', 'Civic', 'saloon'), ('Honda', 'Accord', 'saloon'),
  ('Honda', 'Shuttle', 'station_wagon'), ('Honda', 'Airwave', 'station_wagon'),
  ('Honda', 'Stream', 'van'), ('Honda', 'Freed', 'van'), ('Honda', 'Stepwgn', 'van'),
  ('Honda', 'Odyssey', 'van'), ('Honda', 'Vezel', 'suv'), ('Honda', 'HR-V', 'suv'),
  ('Honda', 'CR-V', 'suv'), ('Honda', 'Crossroad', 'suv'),
  -- Isuzu
  ('Isuzu', 'D-Max', 'pickup'), ('Isuzu', 'MU-X', 'suv'), ('Isuzu', 'NKR', 'truck'),
  ('Isuzu', 'NPR', 'truck'), ('Isuzu', 'NQR', 'truck'), ('Isuzu', 'FRR', 'truck'),
  ('Isuzu', 'FVR', 'truck'), ('Isuzu', 'FVZ', 'truck'), ('Isuzu', 'Trooper', 'suv'),
  -- Mercedes-Benz
  ('Mercedes-Benz', 'A-Class', 'hatchback'), ('Mercedes-Benz', 'B-Class', 'hatchback'),
  ('Mercedes-Benz', 'C-Class', 'saloon'), ('Mercedes-Benz', 'E-Class', 'saloon'),
  ('Mercedes-Benz', 'S-Class', 'saloon'), ('Mercedes-Benz', 'CLA', 'saloon'),
  ('Mercedes-Benz', 'GLA', 'suv'), ('Mercedes-Benz', 'GLC', 'suv'), ('Mercedes-Benz', 'GLE', 'suv'),
  ('Mercedes-Benz', 'ML-Class', 'suv'), ('Mercedes-Benz', 'G-Class', 'suv'),
  ('Mercedes-Benz', 'Vito', 'van'), ('Mercedes-Benz', 'Sprinter', 'minibus'),
  ('Mercedes-Benz', 'Actros', 'truck'), ('Mercedes-Benz', 'Axor', 'truck'),
  -- Volkswagen
  ('Volkswagen', 'Polo', 'hatchback'), ('Volkswagen', 'Golf', 'hatchback'), ('Volkswagen', 'Jetta', 'saloon'),
  ('Volkswagen', 'Passat', 'saloon'), ('Volkswagen', 'Touran', 'van'), ('Volkswagen', 'Sharan', 'van'),
  ('Volkswagen', 'Tiguan', 'suv'), ('Volkswagen', 'Touareg', 'suv'), ('Volkswagen', 'Amarok', 'pickup'),
  ('Volkswagen', 'Caddy', 'van'), ('Volkswagen', 'Transporter', 'van'),
  -- BMW
  ('BMW', '1 Series', 'hatchback'), ('BMW', '3 Series', 'saloon'), ('BMW', '5 Series', 'saloon'),
  ('BMW', '7 Series', 'saloon'), ('BMW', 'X1', 'suv'), ('BMW', 'X3', 'suv'), ('BMW', 'X5', 'suv'),
  ('BMW', 'X6', 'suv'),
  -- Suzuki
  ('Suzuki', 'Alto', 'hatchback'), ('Suzuki', 'Swift', 'hatchback'), ('Suzuki', 'Dzire', 'saloon'),
  ('Suzuki', 'Solio', 'hatchback'), ('Suzuki', 'Wagon R', 'hatchback'), ('Suzuki', 'Hustler', 'hatchback'),
  ('Suzuki', 'Ertiga', 'van'), ('Suzuki', 'Every', 'van'), ('Suzuki', 'SX4', 'hatchback'),
  ('Suzuki', 'Vitara', 'suv'), ('Suzuki', 'Grand Vitara', 'suv'), ('Suzuki', 'Escudo', 'suv'),
  ('Suzuki', 'Jimny', 'suv'), ('Suzuki', 'Carry', 'pickup'),
  -- Land Rover
  ('Land Rover', 'Defender', 'suv'), ('Land Rover', 'Discovery', 'suv'),
  ('Land Rover', 'Discovery Sport', 'suv'), ('Land Rover', 'Freelander', 'suv'),
  ('Land Rover', 'Range Rover', 'suv'), ('Land Rover', 'Range Rover Sport', 'suv'),
  ('Land Rover', 'Range Rover Evoque', 'suv'), ('Land Rover', 'Range Rover Velar', 'suv'),
  -- Lexus
  ('Lexus', 'CT', 'hatchback'), ('Lexus', 'IS', 'saloon'), ('Lexus', 'ES', 'saloon'),
  ('Lexus', 'NX', 'suv'), ('Lexus', 'RX', 'suv'), ('Lexus', 'GX', 'suv'), ('Lexus', 'LX', 'suv'),
  -- Audi
  ('Audi', 'A3', 'hatchback'), ('Audi', 'A4', 'saloon'), ('Audi', 'A6', 'saloon'),
  ('Audi', 'Q3', 'suv'), ('Audi', 'Q5', 'suv'), ('Audi', 'Q7', 'suv'),
  -- Ford
  ('Ford', 'Fiesta', 'hatchback'), ('Ford', 'Focus', 'hatchback'), ('Ford', 'EcoSport', 'suv'),
  ('Ford', 'Kuga', 'suv'), ('Ford', 'Escape', 'suv'), ('Ford', 'Everest', 'suv'),
  ('Ford', 'Explorer', 'suv'), ('Ford', 'Ranger', 'pickup'), ('Ford', 'Transit', 'van'),
  -- Hyundai
  ('Hyundai', 'i10', 'hatchback'), ('Hyundai', 'i20', 'hatchback'), ('Hyundai', 'Accent', 'saloon'),
  ('Hyundai', 'Elantra', 'saloon'), ('Hyundai', 'Creta', 'suv'), ('Hyundai', 'Kona', 'suv'),
  ('Hyundai', 'Tucson', 'suv'), ('Hyundai', 'ix35', 'suv'), ('Hyundai', 'Santa Fe', 'suv'),
  -- Kia
  ('Kia', 'Picanto', 'hatchback'), ('Kia', 'Rio', 'hatchback'), ('Kia', 'Cerato', 'saloon'),
  ('Kia', 'Sonet', 'suv'), ('Kia', 'Seltos', 'suv'), ('Kia', 'Sportage', 'suv'), ('Kia', 'Sorento', 'suv'),
  -- Daihatsu
  ('Daihatsu', 'Mira', 'hatchback'), ('Daihatsu', 'Move', 'hatchback'), ('Daihatsu', 'Tanto', 'hatchback'),
  ('Daihatsu', 'Boon', 'hatchback'), ('Daihatsu', 'Terios', 'suv'), ('Daihatsu', 'Rocky', 'suv'),
  ('Daihatsu', 'Hijet', 'van'),
  -- Peugeot
  ('Peugeot', '208', 'hatchback'), ('Peugeot', '308', 'hatchback'), ('Peugeot', '508', 'saloon'),
  ('Peugeot', '2008', 'suv'), ('Peugeot', '3008', 'suv'), ('Peugeot', '5008', 'suv'),
  ('Peugeot', 'Landtrek', 'pickup'), ('Peugeot', 'Partner', 'van'),
  -- Others
  ('Volvo', 'V40', 'hatchback'), ('Volvo', 'S60', 'saloon'), ('Volvo', 'XC40', 'suv'),
  ('Volvo', 'XC60', 'suv'), ('Volvo', 'XC90', 'suv'), ('Volvo', 'FH', 'truck'),
  ('Jeep', 'Renegade', 'suv'), ('Jeep', 'Compass', 'suv'), ('Jeep', 'Cherokee', 'suv'),
  ('Jeep', 'Grand Cherokee', 'suv'), ('Jeep', 'Wrangler', 'suv'),
  ('Porsche', 'Macan', 'suv'), ('Porsche', 'Cayenne', 'suv'), ('Porsche', 'Panamera', 'saloon'),
  ('Porsche', '911', 'coupe'),
  ('Mini', 'Cooper', 'hatchback'), ('Mini', 'Countryman', 'suv'),
  ('Jaguar', 'XE', 'saloon'), ('Jaguar', 'XF', 'saloon'), ('Jaguar', 'F-Pace', 'suv'),
  ('Renault', 'Duster', 'suv'), ('Renault', 'Koleos', 'suv'),
  ('BYD', 'Dolphin', 'hatchback'), ('BYD', 'Atto 3', 'suv'), ('BYD', 'Seal', 'saloon'),
  ('Haval', 'Jolion', 'suv'), ('Haval', 'H6', 'suv'),
  ('Chery', 'Tiggo 4', 'suv'), ('Chery', 'Tiggo 7', 'suv'), ('Chery', 'Tiggo 8', 'suv'),
  -- Commercial
  ('Mitsubishi Fuso', 'Canter', 'truck'), ('Mitsubishi Fuso', 'Fighter', 'truck'),
  ('Hino', 'Dutro', 'truck'), ('Hino', '300 Series', 'truck'), ('Hino', '500 Series', 'truck'),
  ('Hino', '700 Series', 'truck'),
  ('UD Trucks', 'Condor', 'truck'), ('UD Trucks', 'Croner', 'truck'), ('UD Trucks', 'Quon', 'truck'),
  ('Scania', 'G-Series', 'truck'), ('Scania', 'P-Series', 'truck'), ('Scania', 'R-Series', 'truck')
) as v(make, model, body)
join public.makes mk on mk.name = v.make;

-- Dealer plans -------------------------------------------------------------------
-- Prices are launch hypotheses from the blueprint; test with 10–20 dealers before going live.
insert into public.plans (id, name, price_kes, period, listing_limit, featured_slots, sort_order) values
  ('dealer_starter', 'Starter', 5000, 'monthly', 25, 0, 1),
  ('dealer_growth', 'Growth', 12000, 'monthly', 100, 2, 2),
  ('dealer_pro', 'Pro', 25000, 'monthly', null, 5, 3);
