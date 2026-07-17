// Maps eloratings.net team codes to flagcdn.com codes
// For standard ISO countries, the lowercased code works directly.
// Special cases: UK nations, dependencies, non-ISO territories, etc.
const flagMapping: { [code: string]: string } = {
  // UK nations
  EN: 'gb-eng',
  SQ: 'gb-sct',
  WA: 'gb-wls',
  EI: 'gb-nir',

  // Kosovo – uses XK (ISO 3166-1 alpha-2 user-assigned)
  KO: 'xk',

  // North Macedonia – ISO code is MK
  NM: 'mk',

  // Northern Cyprus – uses flag of Turkish Republic of Northern Cyprus (not on flagcdn; use TR as fallback)
  NS: 'tr',

  // Kurdistan – no official flag on flagcdn; use IQ as geographic reference
  KD: 'iq',

  // Zanzibar – part of Tanzania; use TZ
  ZN: 'tz',

  // Tahiti – French Polynesia (ISO: PF)
  TI: 'pf',

  // Eswatini/Swaziland – ISO code is SZ
  SW: 'sz',
  SZ: 'sz',

  // Ivory Coast – ISO code is CI
  CI: 'ci',

  // Curaçao – ISO code is CW
  CW: 'cw',

  // DR Congo – ISO code is CD
  CD: 'cd',

  // Sint Maarten – ISO code is SX
  SX: 'sx',

  // Bonaire – part of the Netherlands (BQ ISO)
  BQ: 'bq',

  // Reunion – French overseas region (RE ISO)
  RE: 're',

  // Guadeloupe – French overseas region (GP ISO)
  GP: 'gp',

  // Martinique – French overseas region (MQ ISO)
  MQ: 'mq',

  // French Guiana – French overseas region (GF ISO)
  GF: 'gf',

  // New Caledonia – French special collectivity (NC ISO)
  NC: 'nc',

  // Faroe Islands – ISO code is FO
  FO: 'fo',

  // Macau – ISO code is MO
  MO: 'mo',

  // Palestine – ISO code is PS
  PS: 'ps',

  // Somaliland – no ISO; use SO Somalia
  JS: 'so',

  // Chagos Islands/BIOT – no ISO; use IO (British Indian Ocean Territory)
  HG: 'io',

  // Greenland – ISO code is GL
  GL: 'gl',

  // Bermuda – ISO code is BM
  BM: 'bm',

  // Cayman Islands – ISO code is KY
  KY: 'ky',

  // Anguilla – ISO code is AI
  AI: 'ai',

  // Montserrat – ISO code is MS
  MS: 'ms',

  // Turks and Caicos – ISO code is TC
  TC: 'tc',

  // British Virgin Islands – ISO code is VG
  VG: 'vg',

  // US Virgin Islands – ISO code is VI
  VI: 'vi',

  // Saint Kitts and Nevis – ISO code is KN
  KN: 'kn',

  // Saint Lucia – ISO code is LC
  LC: 'lc',

  // Saint Vincent and Grenadines – ISO code is VC
  VC: 'vc',

  // Saint Martin – ISO code is MF
  MF: 'mf',

  // Saint Barthelemy – ISO code is BL
  BL: 'bl',

  // Sint Eustatius – part of BQ (Bonaire, Sint Eustatius and Saba)
  EU: 'bq',

  // Saba – part of BQ
  AB: 'bq',

  // Saint Pierre and Miquelon – ISO code is PM
  PM: 'pm',

  // Aruba – ISO code is AW
  AW: 'aw',

  // Cook Islands – ISO code is CK
  CK: 'ck',

  // Niue – ISO code is NU
  NU: 'nu',

  // Tuvalu – ISO code is TV
  TV: 'tv',

  // Kiribati – ISO code is KI
  KI: 'ki',

  // Nauru – ISO code is NR (code NR not in list but just in case)

  // Palau – ISO code is PW
  PW: 'pw',

  // Micronesia – ISO code is FM
  FM: 'fm',

  // Marshall Islands – ISO code is MH
  MH: 'mh',

  // Northern Mariana Islands – ISO code is MP
  MP: 'mp',

  // Guam – ISO code is GU
  GU: 'gu',

  // American Samoa – ISO code is AS
  AS: 'as',

  // Wallis and Futuna – ISO code is WF
  WF: 'wf',

  // Christmas Island – ISO code is CX
  CX: 'cx',

  // Cocos Islands – ISO code is CC
  CC: 'cc',

  // Vatican – ISO code is VA
  VA: 'va',

  // Gibraltar – ISO code is GI
  GI: 'gi',

  // Liechtenstein – ISO code is LI
  LI: 'li',

  // Monaco – ISO code is MC
  MC: 'mc',

  // Andorra – ISO code is AD
  AD: 'ad',

  // San Marino – ISO code is SM
  SM: 'sm',

  // Falkland Islands – ISO code is FK
  FK: 'fk',

  // Puerto Rico – ISO code is PR
  PR: 'pr',

  // Mayotte – ISO code is YT
  YT: 'yt',

  // Macao – ISO code is MO
  MK: 'mk',

  // Western Sahara – ISO code is EH
  EH: 'eh',

  // Tibet – No ISO; use CN as geographic reference
  TE: 'cn',

  // Kosovo node
  KP: 'kp', // North Korea
};

export function getFlagUrl(countryCode: string): string {
  const upper = countryCode.toUpperCase();
  const mapped = flagMapping[upper] ?? upper.toLowerCase();
  return `https://flagcdn.com/w40/${mapped}.png`;
}
