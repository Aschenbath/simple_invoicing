# Serial backfill before and after

The actual SerialBackfillModal component and production styles are rendered in a local Vite harness with synthetic API responses (2 units and 3 old serials).
Before uses main@aeca7bf; after uses the candidate. Chromium on Windows, 390x844 phone and1440x900 desktop, light and dark themes.
Original UI says nothing to enter. The candidate lets the shopkeeper choose the two retained units and explains the write-off.
The browser probe verifies the save count, transmitted selected codes, tap targets, no horizontal overflow and no page errors.
Screenshots are unedited; the full application and real PostgreSQL are tested separately.
