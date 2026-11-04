# Issue 545 browser evidence

Before: CompanyPage from upstream9eff5bd (current preview16characters, longest17characters, Save still enabled, no length shown).
After: code commit d25d87368c1a57c149475eb7e6cbbb03a0075009 (both lengths shown, clear error, Save disabled).

Captured from the actual Vite/React page in headless Chromium153 with Playwright. API responses were intercepted with deterministic company/series fixtures. This is browser interaction coverage, not a live end-to-end backend deployment. The browser checks covered16/17 boundaries, saved GSTIN in both directions despite unsaved field edits, a legacy invalid format's counter-only save, purchase/no-GST exemptions, and retention of the backend400 row error. Separately,144 outputs from the actual Python backend formatter matched the TypeScript helper.

These assets are on a separate evidence branch and are not part of the production pull request diff.
