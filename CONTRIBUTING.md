# Contributing to Simple Invoicing

Thank you for your interest in contributing to Simple Invoicing.

We welcome all kinds of contributions:
- Bug reports
- Feature requests
- Documentation improvements
- Code contributions (backend, frontend, tests, dev tooling)

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Good First Issues](#good-first-issues)

## Code of Conduct

By participating in this project, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/simple_invoicing.git
   cd simple_invoicing
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/nikhilb2/simple_invoicing.git
   ```
4. Create a feature branch.

## Development Setup

### Option A: Docker (recommended)

```bash
cp .env.example .env
cp backend/.env.example backend/.env.development
cp frontend/.env.example frontend/.env.development

make dev
make seed
```

### Option B: Manual setup

Backend:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.development
uvicorn app_main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
cp .env.example .env.development
npm run dev
```

## Branch Naming

Use descriptive branch names:
- `feat/<short-description>`
- `fix/<short-description>`
- `docs/<short-description>`
- `test/<short-description>`
- `chore/<short-description>`

Examples:
- `feat/add-recurring-invoice-endpoint`
- `fix/ledger-statement-date-filter`
- `docs/update-docker-setup`

## Commit Messages

We follow Conventional Commits:

- `feat: add invoice email sending`
- `fix: prevent negative stock on sales voucher`
- `docs: improve setup instructions`
- `test: add e2e for payment flow`
- `chore: bump fastapi to 0.115.x`

## Testing

Run tests before opening a PR.

### Frontend E2E
```bash
cd frontend
npm run test:e2e
```

### Backend tests
API tests and the full suite require PostgreSQL. The shared `tests/conftest.py`
imports `app_main.py`, which connects to the configured database and applies
pending migrations during import.

From the repository root, start only the database service using the checked-in
development credentials:
```bash
docker compose --env-file .env.example up -d db
```

In a second terminal, install the backend dependencies and pytest, then run tests
from `backend/`. The matching database URL is
`postgresql://simple_user:simple_password@localhost:5432/simple_invoicing`.
Set it and a test secret before running the full suite, one file, or one test:
```bash
cd backend
python -m pip install -r requirements.txt pytest
export DATABASE_URL="postgresql://simple_user:simple_password@localhost:5432/simple_invoicing"
export SECRET_KEY="testing-secret-key"
python -m pytest tests/ -v
python -m pytest tests/api/test_products.py -v
python -m pytest tests/api/test_products.py::test_get_products -v
```

The tests under `tests/core` do not use PostgreSQL. A few service unit-test
files are similarly independent, including `test_marketplace_client.py`,
`test_series_format_number.py`, and `test_upi.py`. To run these without loading
the database-dependent `tests/conftest.py`, use `--confcutdir` and provide the
settings values those modules import:
```bash
DATABASE_URL=sqlite:// SECRET_KEY=testing-secret-key python -m pytest --confcutdir=tests/core tests/core
DATABASE_URL=sqlite:// SECRET_KEY=testing-secret-key python -m pytest --confcutdir=tests/services tests/services/test_marketplace_client.py tests/services/test_series_format_number.py tests/services/test_upi.py
```

Backend CI starts PostgreSQL 16 and runs the full suite with
`python -m pytest tests/ -v`.

### Lint/type checks
```bash
cd frontend && npm run build
cd backend && python -m compileall .
```

## Pull Request Process

1. Ensure your branch is up to date with `main`:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
2. Keep PRs focused and small when possible.
3. Fill out the PR template completely.
4. Include screenshots/videos for UI changes.
5. Add or update tests for behavior changes.
6. Update documentation when needed.
7. Wait for CI to pass.

## Good First Issues

New to the project? Here are some concrete, beginner-friendly tasks to get you started. Each one includes what you need to know and which files to touch.

### 🐛 Bug Fixes

| # | Task | Skill | Files |
|---|------|-------|-------|
| 1 | **Fix the IndentationError in `create_product`** — when product name has leading/trailing spaces, the PDF template renders misaligned | Beginner Python | `backend/app/services/invoice_generator.py` |
| 2 | **Extract the low-stock threshold magic number** — replace hardcoded `10` with a configurable env constant | Beginner Python / Refactor | `backend/app/services/inventory.py` |
| 3 | **Fix date filter off-by-one on ledger statement** — end date is currently exclusive, should be inclusive | Beginner Python | `backend/app/api/routes/ledger_routes.py` |

### ✨ Small Features

| # | Task | Skill | Files |
|---|------|-------|-------|
| 4 | **Add `isManager` flag to AuthContext** — expose user role in the frontend auth context so UI can conditionally show admin controls | Beginner React/TypeScript | `frontend/src/context/AuthContext.tsx` |
| 5 | **Expand `formatCurrency` locale map** — add support for INR (₹), EUR (€), GBP (£) symbols alongside USD ($) | Beginner TypeScript | `frontend/src/utils/format.ts` |
| 6 | **Add loading skeleton for invoice list** — show shimmer placeholders while invoices load instead of blank screen | Beginner React/CSS | `frontend/src/components/invoice/InvoiceList.tsx` |

### 📝 Documentation & Tests

| # | Task | Skill | Files |
|---|------|-------|-------|
| 7 | **Add a unit test for the products API** — write basic CRUD tests using pytest for GET/POST endpoints | Beginner Python / Testing | `backend/tests/test_products.py` (new) |
| 8 | **Add JSDoc comments to utility functions** — document params and return types for `formatCurrency`, `formatDate`, `truncateText` | Beginner TypeScript | `frontend/src/utils/*.ts` |

### How to claim a task

1. Check if there's already an open issue for it — if not, [create one](https://github.com/nikhilb2/simple_invoicing/issues/new)
2. Comment on the issue (or create it) saying you're working on it
3. Follow the [Development Setup](#development-setup) guide above
4. Open a PR referencing your issue

---

Don't see something that matches your skills? Look for issues labeled:
- `good first issue`
- `help wanted`
- `documentation`

Or open a discussion and ask for guidance!

## Questions

If you need help, please:
- Open a GitHub Discussion (recommended)
- Or open an issue with the `question` label

Thanks again for contributing.
