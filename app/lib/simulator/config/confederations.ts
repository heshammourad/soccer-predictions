const flagMapping: { [code: string]: string } = {
  EN: 'gb-eng',
  SQ: 'gb-sct',
  WA: 'gb-wls',
  EI: 'gb-nir',
};

export function getFlagUrl(countryCode: string): string {
  const code = flagMapping[countryCode.toUpperCase()] || countryCode.toLowerCase();
  return `https://flagcdn.com/w40/${code}.png`;
}
