## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Docker & Docker Compose (optional, for local database)
- [pnpm](https://pnpm.io/) package manager (install via `npm i -g pnpm`)

### Installation

```bash
$ pnpm install
```

### Running the application

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

### Running tests

```bash
# unit tests (required for CI/CD)
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## CI/CD Pipeline Checks

Before submitting a Pull Request, please ensure that your code passes the CI checks. The CI pipeline will automatically test and build your code.

To ensure your PR passes these checks locally, run:

```bash
# 1. Run unit tests - Must pass all tests
$ pnpm run test

# 2. Build the project - Must compile successfully
$ pnpm run build
```

## Database Migrations

This project enforces strict validation for all database schema migrations to guarantee stability across environments (especially production).

### Requirements

Every migration **must** be idempotent. This means all `up` methods must have a corresponding, flawless `down` method. Our CI pipeline enforces this programmatically and tests rollbacks on a transient database.

### Running & Reverting Migrations

We rely on TypeORM for migrations.

**Run Migrations:**
```bash
npx typeorm migration:run
```

**Rollback (Revert) the last Migration:**
```bash
npx typeorm migration:revert
```

### Rollback Testing

Before submitting a Pull Request, it is highly recommended to run the built-in rollback test script to verify that your `down` methods work perfectly.

1. Ensure your local database is running.
2. Execute the script:
```bash
bash scripts/test-rollback.sh
```
This script will build the backend, apply all pending migrations, and then recursively revert them one-by-one to ensure no schema residue is left behind.
