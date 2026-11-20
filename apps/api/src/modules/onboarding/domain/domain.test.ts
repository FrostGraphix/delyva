import { RIDER_STEPS } from '@delyva/contracts';
import { describe, expect, it } from 'vitest';
import {
  assertCanSaveStep,
  assertReviewable,
  assertSubmittable,
  currentStep,
  statusAfterEdit,
  withCompleted,
} from './application-steps.js';
import { businessNameMatches, last4, nameTokens, personNameMatches } from './bank-name.js';
import { menuCsvTemplate, nairaToKobo, parseCsv, parseMenuCsv } from './menu-csv.js';
import { publicQuiz, RIDER_QUIZ, scoreQuiz } from './quiz.js';
import { policyViolation, sniffMatches } from './upload-policy.js';

describe('step progression', () => {
  const s = (
    completed: (typeof RIDER_STEPS)[number][],
    status: 'in_progress' | 'pending_review' | 'approved' | 'rejected' = 'in_progress',
  ) => ({ status, completedSteps: completed });

  it('rejects skipping ahead and names the missing step', () => {
    expect(() => {
      assertCanSaveStep(RIDER_STEPS, s([]), 'vehicle');
    }).toThrow(/personal_details/);
    expect(() => {
      assertCanSaveStep(RIDER_STEPS, s(['personal_details']), 'identity');
    }).not.toThrow();
  });

  it('allows re-saving a completed step and resumes at the first incomplete one', () => {
    expect(() => {
      assertCanSaveStep(RIDER_STEPS, s(['personal_details', 'identity']), 'personal_details');
    }).not.toThrow();
    expect(currentStep(RIDER_STEPS, ['personal_details', 'identity'])).toBe('vehicle');
    expect(currentStep(RIDER_STEPS, [...RIDER_STEPS])).toBeNull();
  });

  it('locks pending/approved applications and reopens rejected ones', () => {
    expect(() => {
      assertCanSaveStep(RIDER_STEPS, s([], 'pending_review'), 'personal_details');
    }).toThrow(/pending_review/);
    expect(() => {
      assertCanSaveStep(RIDER_STEPS, s([], 'rejected'), 'personal_details');
    }).not.toThrow();
    expect(statusAfterEdit('rejected')).toBe('in_progress');
    expect(statusAfterEdit('in_progress')).toBe('in_progress');
  });

  it('keeps completed steps canonical and unique', () => {
    expect(withCompleted(RIDER_STEPS, ['identity', 'personal_details'], 'identity')).toEqual([
      'personal_details',
      'identity',
    ]);
  });

  it('only submits complete applications and only reviews pending ones', () => {
    expect(() => {
      assertSubmittable(RIDER_STEPS, s(['personal_details']));
    }).toThrow(/identity/);
    expect(() => {
      assertSubmittable(RIDER_STEPS, s([...RIDER_STEPS], 'approved'));
    }).toThrow(/already/);
    expect(() => {
      assertSubmittable(RIDER_STEPS, s([...RIDER_STEPS]));
    }).not.toThrow();
    expect(() => {
      assertReviewable('in_progress');
    }).toThrow();
    expect(() => {
      assertReviewable('pending_review');
    }).not.toThrow();
  });
});

describe('quiz scoring', () => {
  const all = RIDER_QUIZ.map((q) => ({ questionId: q.id, optionId: q.answer }));
  it('passes with all correct and hides the answer key', () => {
    expect(scoreQuiz(all)).toEqual({ correct: 5, total: 5, scorePercent: 100, passed: true });
    expect(JSON.stringify(publicQuiz())).not.toContain('answer');
  });
  it('passes at exactly the 80% mark and fails below it; missing answers count as wrong', () => {
    expect(scoreQuiz(all.slice(0, 4)).passed).toBe(true);
    const oneWrong = all.map((a, i) => (i < 2 ? { ...a, optionId: 'zzz' } : a));
    expect(scoreQuiz(oneWrong)).toMatchObject({ scorePercent: 60, passed: false });
  });
  it('rejects unknown and duplicate questions', () => {
    expect(() => scoreQuiz([{ questionId: 'nope', optionId: 'a' }])).toThrow(/Unknown/);
    expect(() => scoreQuiz([all[0], all[0]].filter((x) => x !== undefined))).toThrow(/twice/);
  });
});

describe('bank account name matching', () => {
  it('matches first and last name in any order, ignoring case and punctuation', () => {
    expect(
      personNameMatches({ firstName: 'Tunde', lastName: 'Bakare' }, 'BAKARE, TUNDE OLUWASEUN'),
    ).toBe(true);
    expect(
      personNameMatches({ firstName: 'Tunde', lastName: 'Bakare' }, 'FAKE ACCOUNT HOLDER'),
    ).toBe(false);
    expect(personNameMatches({ firstName: '', lastName: 'Bakare' }, 'BAKARE')).toBe(false);
  });
  it('matches businesses on a significant shared token', () => {
    expect(businessNameMatches('Mama Put Kitchen', 'MAMA PUT KITCHEN LTD')).toBe(true);
    expect(businessNameMatches('Global Ventures Ltd', 'GLOBAL VENTURES')).toBe(false);
    expect(nameTokens("O'Neil-Ade")).toEqual(['O', 'NEIL', 'ADE']);
    expect(last4('0123456789')).toBe('6789');
  });
});

describe('menu CSV import', () => {
  it('parses the template into categories with kobo prices', () => {
    const { menu, errors } = parseMenuCsv(menuCsvTemplate());
    expect(errors).toEqual([]);
    expect(menu.categories).toHaveLength(2);
    expect(menu.categories[0]?.items[0]).toEqual({
      name: 'Jollof rice',
      description: 'Smoky party jollof, with plantain',
      priceMinor: 250_000,
      available: true,
    });
    expect(menu.categories[1]?.items[0]?.priceMinor).toBe(300_050);
  });

  it('reports every bad row with its line number', () => {
    const csv = [
      'category,name,description,price_naira,available',
      'Rice,Jollof,,2500,yes',
      ',Missing category,,100,yes',
      'Rice,Bad price,,12.345,yes',
      'Rice,Jollof,,2600,yes',
      'Rice,Bad flag,,100,maybe',
      'Rice,Short row',
    ].join('\r\n');
    const { errors } = parseMenuCsv(csv);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
    expect(errors.find((e) => e.line === 5)?.message).toMatch(/duplicate/);
  });

  it('rejects a wrong header and an empty file', () => {
    expect(parseMenuCsv('a,b\n1,2').errors[0]).toMatchObject({ line: 1 });
    expect(
      parseMenuCsv('category,name,description,price_naira,available\n').errors[0]?.message,
    ).toMatch(/no menu items/);
  });

  it('handles quoted newlines, escaped quotes and a BOM', () => {
    const rows = parseCsv('﻿a,"b ""q""\nline",c\nd,e,f');
    expect(rows[0]).toEqual({ line: 1, cells: ['a', 'b "q"\nline', 'c'] });
    expect(rows[1]?.line).toBe(3);
  });

  it('converts naira to kobo without floats and caps the price', () => {
    expect(nairaToKobo('0.5')).toBe(50);
    expect(nairaToKobo('10000001')).toBeNull();
    expect(nairaToKobo('-1')).toBeNull();
  });
});

describe('upload policy', () => {
  it('enforces MIME and size per purpose', () => {
    expect(policyViolation('selfie', 'application/pdf', 10)).toMatch(/not allowed/);
    expect(policyViolation('menu_csv', 'text/csv', 2 * 1024 * 1024)).toMatch(/exceeds/);
    expect(policyViolation('owner_id', 'application/pdf', 1000)).toBeNull();
  });
  it('checks magic bytes', () => {
    expect(sniffMatches('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(sniffMatches('image/jpeg', Buffer.from('%PDF-1.7'))).toBe(false);
    expect(
      sniffMatches('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe(true);
    expect(sniffMatches('image/webp', Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
    expect(sniffMatches('application/pdf', Buffer.from('%PDF-1.7'))).toBe(true);
    expect(sniffMatches('text/csv', Buffer.from('a,b'))).toBe(true);
    expect(sniffMatches('text/csv', Buffer.from([0x61, 0x00]))).toBe(false);
    expect(sniffMatches('application/zip', Buffer.from('PK'))).toBe(false);
  });
});
