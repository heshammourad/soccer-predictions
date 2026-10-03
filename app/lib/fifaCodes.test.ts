import { describe, expect, it } from 'vitest';
import { getFifaCode } from './fifaCodes';

describe('getFifaCode', () => {
  it("maps eloratings.net codes to FIFA's", () => {
    expect(getFifaCode('EN')).toBe('ENG');
    expect(getFifaCode('ZA')).toBe('RSA');
    expect(getFifaCode('GW')).toBe('GNB');
  });

  it("uses today's codes, not obsolete ones under the same name", () => {
    expect(getFifaCode('IE')).toBe('IRL'); // not EIR
    expect(getFifaCode('TW')).toBe('TPE'); // not TAI
  });

  it('keeps the eloratings.net code for a team with no FIFA code', () => {
    expect(getFifaCode('AH')).toBe('AH'); // Austria-Hungary
  });
});
