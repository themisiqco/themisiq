// lib/billReview/queueOrder.ts
//
// BR8: the specialist queue's order. Pure. Overdue first (Q7: past its expected date in Toronto), then oldest first by
// when the bill was submitted. A bill with no expected date is never overdue; it sorts by submission among the rest.

export type QueueOrderable = { submitted_at: string; expected_by: string | null }

/** Late once Toronto's date (today, yyyy-mm-dd) is after the expected date; the expected day itself is on time. */
export const isOverdue = (b: QueueOrderable, today: string) => !!b.expected_by && today > b.expected_by

export function sortQueue<T extends QueueOrderable>(items: T[], today: string): T[] {
  return [...items].sort((a, b) => {
    const la = isOverdue(a, today), lb = isOverdue(b, today)
    if (la !== lb) return la ? -1 : 1
    return a.submitted_at.localeCompare(b.submitted_at)
  })
}
