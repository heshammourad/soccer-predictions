// FIFA's three-letter codes (https://en.wikipedia.org/wiki/List_of_FIFA_country_codes)
// for eloratings.net's two-letter team codes, used where a full name is too
// long to fit (the results tooltip and the Matches tab). Matched by name
// against prisma/seed-data/teams.csv; teams with no FIFA code (mostly
// pre-independence sides like Austria-Hungary) keep their eloratings.net code.
// Renamed countries share their successor's code (e.g. Swaziland and Eswatini).
const FIFA_CODES: { [eloratingsCode: string]: string } = {
  AD: 'AND', // Andorra
  AE: 'UAE', // United Arab Emirates
  AF: 'AFG', // Afghanistan
  AG: 'ATG', // Antigua and Barbuda
  AI: 'AIA', // Anguilla
  AL: 'ALB', // Albania
  AM: 'ARM', // Armenia
  AN: 'ANT', // Netherlands Antilles
  AO: 'ANG', // Angola
  AR: 'ARG', // Argentina
  AS: 'ASA', // Eastern Samoa
  AT: 'AUT', // Austria
  AU: 'AUS', // Australia
  AW: 'ARU', // Aruba
  AY: 'MAL', // Malaya
  AZ: 'AZE', // Azerbaijan
  BA: 'BIH', // Bosnia and Herzegovina
  BB: 'BRB', // Barbados
  BD: 'BAN', // Bangladesh
  BE: 'BEL', // Belgium
  BF: 'BFA', // Burkina Faso
  BG: 'BUL', // Bulgaria
  BH: 'BHR', // Bahrain
  BI: 'BDI', // Burundi
  BJ: 'BEN', // Benin
  BL: 'BLM', // Saint Barthélemy
  BM: 'BER', // Bermuda
  BN: 'BRU', // Brunei
  BO: 'BOL', // Bolivia
  BQ: 'BES', // Bonaire
  BR: 'BRA', // Brazil
  BS: 'BAH', // Bahamas
  BT: 'BHU', // Bhutan
  BU: 'BUR', // Burma
  BW: 'BOT', // Botswana
  BY: 'BLR', // Belarus
  BZ: 'BLZ', // Belize
  CA: 'CAN', // Canada
  CD: 'COD', // DR Congo
  CE: 'CEY', // Ceylon
  CF: 'CTA', // Central African Republic
  CG: 'CGO', // Congo
  CH: 'SUI', // Switzerland
  CI: 'CIV', // Ivory Coast
  CJ: 'COD', // Congo-Leopoldville
  CK: 'COK', // Cook Islands
  CL: 'CHI', // Chile
  CM: 'CMR', // Cameroon
  CN: 'CHN', // China
  CO: 'COL', // Colombia
  CQ: 'COD', // Congo-Kinshasa
  CR: 'CRC', // Costa Rica
  CS: 'TCH', // Czechoslovakia
  CU: 'CUB', // Cuba
  CV: 'CPV', // Cape Verde
  CW: 'CUW', // Curaçao
  CY: 'CYP', // Cyprus
  CZ: 'CZE', // Czechia
  DD: 'GDR', // East Germany
  DE: 'GER', // Germany
  DH: 'DAH', // Dahomey
  DI: 'INH', // Dutch East Indies
  DJ: 'DJI', // Djibouti
  DK: 'DEN', // Denmark
  DM: 'DMA', // Dominica
  DO: 'DOM', // Dominican Republic
  DS: 'CIS', // Commonwealth of Independent States
  DY: 'YMD', // South Yemen
  DZ: 'ALG', // Algeria
  EC: 'ECU', // Ecuador
  EE: 'EST', // Estonia
  EG: 'EGY', // Egypt
  EH: 'ESH', // Western Sahara
  EI: 'NIR', // Northern Ireland
  EN: 'ENG', // England
  ER: 'ERI', // Eritrea
  ES: 'ESP', // Spain
  ET: 'ETH', // Ethiopia
  FI: 'FIN', // Finland
  FJ: 'FIJ', // Fiji
  FM: 'FSM', // Federated States of Micronesia
  FO: 'FRO', // Faroe Islands
  FR: 'FRA', // France
  GA: 'GAB', // Gabon
  GB: 'GBR', // Great Britain
  GC: 'GOC', // Gold Coast
  GD: 'GRN', // Grenada
  GE: 'GEO', // Georgia
  GF: 'GUF', // French Guiana
  GH: 'GHA', // Ghana
  GI: 'GIB', // Gibraltar
  GL: 'GRL', // Greenland
  GM: 'GAM', // Gambia
  GN: 'GUI', // Guinea
  GP: 'GLP', // Guadeloupe
  GQ: 'EQG', // Equatorial Guinea
  GR: 'GRE', // Greece
  GT: 'GUA', // Guatemala
  GU: 'GUM', // Guam
  GW: 'GNB', // Guinea-Bissau
  GY: 'GUY', // Guyana
  HA: 'BOH', // Bohemia
  HK: 'HKG', // Hong Kong
  HN: 'HON', // Honduras
  HR: 'CRO', // Croatia
  HT: 'HAI', // Haiti
  HU: 'HUN', // Hungary
  ID: 'IDN', // Indonesia
  IE: 'IRL', // Ireland
  IL: 'ISR', // Israel
  IN: 'IND', // India
  IQ: 'IRQ', // Iraq
  IR: 'IRN', // Iran
  IS: 'ISL', // Iceland
  IT: 'ITA', // Italy
  JM: 'JAM', // Jamaica
  JO: 'JOR', // Jordan
  JP: 'JPN', // Japan
  JS: 'SMD', // Somaliland
  KE: 'KEN', // Kenya
  KG: 'KGZ', // Kyrgyzstan
  KH: 'CAM', // Cambodia
  KI: 'KIR', // Kiribati
  KM: 'COM', // Comoros
  KN: 'SKN', // Saint Kitts and Nevis
  KO: 'KOS', // Kosovo
  KP: 'PRK', // North Korea
  KR: 'KOR', // South Korea
  KT: 'SKN', // Saint Kitts
  KW: 'KUW', // Kuwait
  KY: 'CAY', // Cayman Islands
  KZ: 'KAZ', // Kazakhstan
  LA: 'LAO', // Laos
  LB: 'LBN', // Lebanon
  LC: 'LCA', // Saint Lucia
  LI: 'LIE', // Liechtenstein
  LK: 'SRI', // Sri Lanka
  LR: 'LBR', // Liberia
  LS: 'LES', // Lesotho
  LT: 'LTU', // Lithuania
  LU: 'LUX', // Luxembourg
  LV: 'LVA', // Latvia
  LY: 'LBY', // Libya
  MA: 'MAR', // Morocco
  MC: 'MON', // Monaco
  MD: 'MDA', // Moldova
  ME: 'MNE', // Montenegro
  MF: 'MAF', // Saint Martin
  MG: 'MAD', // Madagascar
  MK: 'MKD', // Macedonia
  ML: 'MLI', // Mali
  MM: 'MYA', // Myanmar
  MN: 'MNG', // Mongolia
  MO: 'MAC', // Macao
  MP: 'MNP', // Northern Mariana Islands
  MQ: 'MTQ', // Martinique
  MR: 'MTN', // Mauritania
  MS: 'MSR', // Montserrat
  MT: 'MLT', // Malta
  MU: 'MRI', // Mauritius
  MV: 'MDV', // Maldives
  MW: 'MWI', // Malawi
  MX: 'MEX', // Mexico
  MY: 'MAS', // Malaysia
  MZ: 'MOZ', // Mozambique
  NA: 'NAM', // Namibia
  NC: 'NCL', // New Caledonia
  ND: 'NRH', // Northern Rhodesia
  NE: 'NIG', // Niger
  NG: 'NGA', // Nigeria
  NH: 'HEB', // New Hebrides
  NI: 'NCA', // Nicaragua
  NL: 'NED', // Netherlands
  NM: 'MKD', // North Macedonia
  NO: 'NOR', // Norway
  NP: 'NEP', // Nepal
  NS: 'NCY', // Northern Cyprus
  NU: 'NIU', // Niue
  NV: 'VNO', // North Vietnam
  NY: 'YAR', // North Yemen
  NZ: 'NZL', // New Zealand
  OM: 'OMA', // Oman
  PA: 'PAN', // Panama
  PE: 'PER', // Peru
  PG: 'PNG', // Papua New Guinea
  PH: 'PHI', // Philippines
  PK: 'PAK', // Pakistan
  PL: 'POL', // Poland
  PM: 'SPM', // Saint Pierre and Miquelon
  PR: 'PUR', // Puerto Rico
  PS: 'PLE', // Palestine
  PT: 'POR', // Portugal
  PW: 'PLW', // Palau
  PY: 'PAR', // Paraguay
  QA: 'QAT', // Qatar
  RE: 'REU', // Réunion
  RG: 'BGU', // British Guiana
  RH: 'RHO', // Rhodesia
  RI: 'BIN', // British India
  RM: 'SCG', // Serbia and Montenegro
  RO: 'ROU', // Romania
  RR: 'UAR', // United Arab Republic
  RS: 'SRB', // Serbia
  RU: 'RUS', // Russia
  RV: 'VSO', // South Vietnam
  RW: 'RWA', // Rwanda
  SA: 'KSA', // Saudi Arabia
  SB: 'SOL', // Solomon Islands
  SC: 'SEY', // Seychelles
  SD: 'SDN', // Sudan
  SE: 'SWE', // Sweden
  SG: 'SGP', // Singapore
  SI: 'SVN', // Slovenia
  SK: 'SVK', // Slovakia
  SL: 'SLE', // Sierra Leone
  SM: 'SMR', // San Marino
  SN: 'SEN', // Senegal
  SO: 'SOM', // Somalia
  SP: 'SAA', // Saar
  SQ: 'SCO', // Scotland
  SR: 'SUR', // Suriname
  SS: 'SSD', // South Sudan
  ST: 'STP', // São Tomé and Príncipe
  SU: 'URS', // Soviet Union
  SV: 'SLV', // El Salvador
  SW: 'SWZ', // Swatini
  SX: 'SXM', // Sint Maarten
  SY: 'SYR', // Syria
  SZ: 'SWZ', // Swaziland
  TC: 'TCA', // Turks and Caicos Islands
  TD: 'CHA', // Chad
  TG: 'TOG', // Togo
  TH: 'THA', // Thailand
  TI: 'TAH', // Tahiti
  TJ: 'TJK', // Tajikistan
  TL: 'TLS', // East Timor
  TM: 'TKM', // Turkmenistan
  TN: 'TUN', // Tunisia
  TO: 'TGA', // Tonga
  TR: 'TUR', // Turkey
  TT: 'TRI', // Trinidad and Tobago
  TV: 'TUV', // Tuvalu
  TW: 'TPE', // Taiwan
  TY: 'TAA', // Tanganyika
  TZ: 'TAN', // Tanzania
  UA: 'UKR', // Ukraine
  UG: 'UGA', // Uganda
  UK: 'GBR', // United Kingdom
  US: 'USA', // United States
  UV: 'UPV', // Upper Volta
  UY: 'URU', // Uruguay
  UZ: 'UZB', // Uzbekistan
  VA: 'VAT', // Vatican
  VC: 'VIN', // Saint Vincent and the Grenadines
  VE: 'VEN', // Venezuela
  VG: 'VGB', // British Virgin Islands
  VI: 'VIR', // US Virgin Islands
  VN: 'VIE', // Vietnam
  VU: 'VAN', // Vanuatu
  WA: 'WAL', // Wales
  WF: 'WLF', // Wallis and Futuna
  WG: 'FRG', // West Germany
  WM: 'WSM', // Western Samoa
  WS: 'SAM', // Samoa
  YE: 'YEM', // Yemen
  YT: 'MYT', // Mayotte
  YU: 'YUG', // Yugoslavia
  ZA: 'RSA', // South Africa
  ZD: 'SRH', // Southern Rhodesia
  ZM: 'ZAM', // Zambia
  ZN: 'ZAN', // Zanzibar
  ZR: 'ZAI', // Zaire
  ZW: 'ZIM', // Zimbabwe
};

export function getFifaCode(teamId: string): string {
  return FIFA_CODES[teamId.toUpperCase()] ?? teamId.toUpperCase();
}
