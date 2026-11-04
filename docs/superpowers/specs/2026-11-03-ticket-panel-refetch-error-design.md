# Ticket panel refetch errors

## Intent

Keep the ticket panel usable when a background refresh fails after ticket data has already loaded.

## Goals and non-goals

- Render cached tickets whenever data is available, even if the latest refresh errored.
- Keep the refresh failure visible with a non-blocking alert and retry action.
- Retain the blocking error state when no ticket data is available.
- Do not change the ticket API, query schema, or response contract.

## Approaches

- **Show cached tickets with a non-blocking refresh warning (selected):** preserves available data and surfaces the failed refresh.
- **Show cached tickets without a warning:** less UI, but hides a real refresh failure.

## Constraints and verification

Keep the change within `TicketPanel`; follow existing retry and accessibility patterns. Validate with focused frontend checks and the frontend test suite.
