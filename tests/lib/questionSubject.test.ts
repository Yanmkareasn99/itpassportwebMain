import { describe, expect, it } from 'vitest';
import {
  detectItPassportSubjectId,
  detectImportedSubjectId,
  FUNDAMENTAL_IT_SUBJECT_IDS,
  IT_PASSPORT_SUBJECT_IDS,
  resolveImportedSubjectId,
  validateItPassportSubjectRanges,
} from '../../src/lib/questionSubject';

describe('question subject detection', () => {
  it.each([
    [1, IT_PASSPORT_SUBJECT_IDS.strategy],
    [35, IT_PASSPORT_SUBJECT_IDS.strategy],
    [36, IT_PASSPORT_SUBJECT_IDS.management],
    [55, IT_PASSPORT_SUBJECT_IDS.management],
    [56, IT_PASSPORT_SUBJECT_IDS.technology],
    [100, IT_PASSPORT_SUBJECT_IDS.technology],
  ])('detects the official section for question %i', (number, expected) => {
    expect(detectItPassportSubjectId(number)).toBe(expected);
  });

  it.each([0, 101, 1.5, Number.NaN])('does not guess for nonstandard number %s', number => {
    expect(detectItPassportSubjectId(number)).toBeNull();
  });

  it('preserves an explicit valid subject instead of replacing it', () => {
    const available = Object.values(IT_PASSPORT_SUBJECT_IDS);
    expect(resolveImportedSubjectId(IT_PASSPORT_SUBJECT_IDS.technology, 1, available))
      .toBe(IT_PASSPORT_SUBJECT_IDS.technology);
  });

  it('uses admin-defined IT Passport subject ranges', () => {
    const ranges = [
      { subjectId: IT_PASSPORT_SUBJECT_IDS.strategy, from: 1, to: 29 },
      { subjectId: IT_PASSPORT_SUBJECT_IDS.management, from: 30, to: 53 },
      { subjectId: IT_PASSPORT_SUBJECT_IDS.technology, from: 54, to: 100 },
    ];

    expect(validateItPassportSubjectRanges(ranges)).toBe(true);
    expect(detectItPassportSubjectId(29, ranges)).toBe(IT_PASSPORT_SUBJECT_IDS.strategy);
    expect(detectItPassportSubjectId(30, ranges)).toBe(IT_PASSPORT_SUBJECT_IDS.management);
    expect(detectItPassportSubjectId(54, ranges)).toBe(IT_PASSPORT_SUBJECT_IDS.technology);
    expect(resolveImportedSubjectId(
      '',
      30,
      Object.values(IT_PASSPORT_SUBJECT_IDS),
      'it-passport',
      ranges,
    )).toBe(IT_PASSPORT_SUBJECT_IDS.management);
  });

  it('allows gaps as unassigned but rejects overlaps and invalid bounds', () => {
    const makeRanges = (managementFrom: number, technologyFrom: number) => [
      { subjectId: IT_PASSPORT_SUBJECT_IDS.strategy, from: 1, to: 35 },
      { subjectId: IT_PASSPORT_SUBJECT_IDS.management, from: managementFrom, to: 55 },
      { subjectId: IT_PASSPORT_SUBJECT_IDS.technology, from: technologyFrom, to: 100 },
    ];

    const rangesWithGap = makeRanges(37, 56);
    expect(validateItPassportSubjectRanges(rangesWithGap)).toBe(true);
    expect(detectItPassportSubjectId(36, rangesWithGap)).toBe(IT_PASSPORT_SUBJECT_IDS.unassigned);
    expect(validateItPassportSubjectRanges(makeRanges(35, 56))).toBe(false);
    expect(validateItPassportSubjectRanges(makeRanges(36, 55))).toBe(false);
    expect(validateItPassportSubjectRanges([
      { subjectId: IT_PASSPORT_SUBJECT_IDS.strategy, from: 0, to: 35 },
      ...makeRanges(36, 56).slice(1),
    ])).toBe(false);
  });

  it.each([
    ['fundamental-a', 1, FUNDAMENTAL_IT_SUBJECT_IDS.subjectA],
    ['fundamental-a', 60, FUNDAMENTAL_IT_SUBJECT_IDS.subjectA],
    ['fundamental-b', 1, FUNDAMENTAL_IT_SUBJECT_IDS.subjectB],
    ['fundamental-b', 20, FUNDAMENTAL_IT_SUBJECT_IDS.subjectB],
  ] as const)('assigns every %s question to its exam subject', (exam, number, expected) => {
    expect(detectImportedSubjectId(exam, number)).toBe(expected);
  });

  it('resolves Fundamental IT subjects only when they exist in the database', () => {
    expect(resolveImportedSubjectId(
      '',
      1,
      Object.values(FUNDAMENTAL_IT_SUBJECT_IDS),
      'fundamental-a',
    )).toBe(FUNDAMENTAL_IT_SUBJECT_IDS.subjectA);
    expect(resolveImportedSubjectId('', 1, [], 'fundamental-b')).toBeNull();
  });

  it('only returns subjects that exist in the current database', () => {
    expect(resolveImportedSubjectId('', 1, [IT_PASSPORT_SUBJECT_IDS.management])).toBeNull();
    expect(resolveImportedSubjectId('missing', 1, Object.values(IT_PASSPORT_SUBJECT_IDS))).toBeNull();
  });
});
