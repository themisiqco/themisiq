// lib/billReview/holidays.ts
//
// BR5: THE DAYS THE BILL REVIEW TEAM DOES NOT COUNT, per year, as dated entries. Data, not logic: a new year is one
// block added here, and lib/billReview/holidays.test.ts recomputes every date from its rule, so a mistyped date fails.
// A year with no block is refused by expectedBy (lib/billReview/businessDays.ts), never guessed.
//
// Ruled 10 Oct 2026 (docs/review/design-derived-figures.md section 10, "BR: business days (Q5)"):
//   - the nine Ontario public holidays (Employment Standards Act, 2000, s. 1(1), "public holiday");
//   - Easter Monday and the Civic Holiday (the first Monday of August), which the ESA does not make public holidays;
//   - a holiday that falls on a Saturday or Sunday is also taken on the next weekday that is not already a holiday,
//     listed as its own entry.
// Weekends are not listed: businessDays.ts skips them.

export type Holiday = { date: string; name: string; source: string }

const ESA = 'Employment Standards Act, 2000 (Ontario), s. 1(1) "public holiday"; ontario.ca, Your guide to the Employment Standards Act: Public holidays'
const RULED = 'Bill Review ruling, 10 Oct 2026 (Q5): observed by the team; not a public holiday under the ESA'
const SUBSTITUTE = 'Bill Review ruling, 10 Oct 2026 (Q5): a holiday on a weekend is also taken on the next weekday that is not already a holiday'

export const HOLIDAYS: Readonly<Record<number, readonly Holiday[]>> = {
  2026: [
    { date: '2026-01-01', name: 'New Year’s Day', source: ESA },
    { date: '2026-02-16', name: 'Family Day', source: ESA },
    { date: '2026-04-03', name: 'Good Friday', source: ESA },
    { date: '2026-04-06', name: 'Easter Monday', source: RULED },
    { date: '2026-05-18', name: 'Victoria Day', source: ESA },
    { date: '2026-07-01', name: 'Canada Day', source: ESA },
    { date: '2026-08-03', name: 'Civic Holiday', source: RULED },
    { date: '2026-09-07', name: 'Labour Day', source: ESA },
    { date: '2026-10-12', name: 'Thanksgiving Day', source: ESA },
    { date: '2026-12-25', name: 'Christmas Day', source: ESA },
    { date: '2026-12-26', name: 'Boxing Day', source: ESA },
    { date: '2026-12-28', name: 'Boxing Day (substitute)', source: SUBSTITUTE },
  ],
  2027: [
    { date: '2027-01-01', name: 'New Year’s Day', source: ESA },
    { date: '2027-02-15', name: 'Family Day', source: ESA },
    { date: '2027-03-26', name: 'Good Friday', source: ESA },
    { date: '2027-03-29', name: 'Easter Monday', source: RULED },
    { date: '2027-05-24', name: 'Victoria Day', source: ESA },
    { date: '2027-07-01', name: 'Canada Day', source: ESA },
    { date: '2027-08-02', name: 'Civic Holiday', source: RULED },
    { date: '2027-09-06', name: 'Labour Day', source: ESA },
    { date: '2027-10-11', name: 'Thanksgiving Day', source: ESA },
    { date: '2027-12-25', name: 'Christmas Day', source: ESA },
    { date: '2027-12-26', name: 'Boxing Day', source: ESA },
    { date: '2027-12-27', name: 'Christmas Day (substitute)', source: SUBSTITUTE },
    { date: '2027-12-28', name: 'Boxing Day (substitute)', source: SUBSTITUTE },
  ],
  2028: [
    { date: '2028-01-01', name: 'New Year’s Day', source: ESA },
    { date: '2028-01-03', name: 'New Year’s Day (substitute)', source: SUBSTITUTE },
    { date: '2028-02-21', name: 'Family Day', source: ESA },
    { date: '2028-04-14', name: 'Good Friday', source: ESA },
    { date: '2028-04-17', name: 'Easter Monday', source: RULED },
    { date: '2028-05-22', name: 'Victoria Day', source: ESA },
    { date: '2028-07-01', name: 'Canada Day', source: ESA },
    { date: '2028-07-03', name: 'Canada Day (substitute)', source: SUBSTITUTE },
    { date: '2028-08-07', name: 'Civic Holiday', source: RULED },
    { date: '2028-09-04', name: 'Labour Day', source: ESA },
    { date: '2028-10-09', name: 'Thanksgiving Day', source: ESA },
    { date: '2028-12-25', name: 'Christmas Day', source: ESA },
    { date: '2028-12-26', name: 'Boxing Day', source: ESA },
  ],
}
