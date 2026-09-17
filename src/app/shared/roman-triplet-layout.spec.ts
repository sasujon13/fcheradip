import {
  canonicalizeRomanTripletMarkers,
  chooseRomanMcqPackLines,
} from './roman-mcq-pack';

describe('Roman triplet layout', () => {
  it('canonicalizes dotted, undotted, uppercase, and OCR-glued markers', () => {
    expect(canonicalizeRomanTripletMarkers('i first ii second iii third')).toBe(
      'i. first ii. second iii. third'
    );
    expect(canonicalizeRomanTripletMarkers('I first II second III third')).toBe(
      'I. first II. second III. third'
    );
    expect(canonicalizeRomanTripletMarkers('i. x/3ii. y/3iii. z')).toBe(
      'i. x/3ii. y/3iii. z'
    );
  });

  it('always places a complete i/ii/iii sequence on three separate lines', () => {
    const lines = chooseRomanMcqPackLines(
      [
        { marker: 'i', body: 'first' },
        { marker: 'ii', body: 'second' },
        { marker: 'iii', body: 'third' },
      ],
      1000,
      () => 1
    );
    expect(lines).toEqual([['i'], ['ii'], ['iii']]);
  });
});
