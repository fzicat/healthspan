# Disposable native PostgreSQL training tests

Run from the repository root:

```sh
node --import tsx tests/native-training.mts
```

Prerequisites: project-local `embedded-postgres`, `pg`, `@types/pg`, and `tsx` dev dependencies. Run as an ordinary non-root user. No system PostgreSQL installation or `.env` file is used.

The suite starts the bundled native PostgreSQL executable on a freshly allocated `127.0.0.1` TCP port, with Unix sockets disabled and a random synthetic SCRAM password. `embedded-postgres` briefly writes the initdb password file inside the private `.training-test/native-temp` directory and deletes it; it is never logged or saved in the evidence. The suite restores the package's documented symlinks after `npm --ignore-scripts` using only its project-local postinstall script. It creates no system accounts and installs no system libraries.

The database is disposable `.training-test/native-postgres`. A `.training-test/native-run.lock` prevents overlapping test runs. An existing data directory is refused, not reused or deleted. The suite closes clients, stops the native server, removes its data and temporary files, and verifies that the loopback port and all tracked native process IDs are gone. Evidence remains at:

- `.training-test/evidence/native-postgres.log`: native startup/shutdown, observed backend lock waits, SQLSTATE evidence, and test results.
- `.training-test/evidence/native-postgres.json`: test outcomes, timestamps, native server version, exact SHA-256 hashes of the SQL files applied, and cleanup verification.

## Coverage

- Full `supabase/schema.sql`, including native `pg_trgm`, and all four real additive migrations.
- Migration execution by a disposable non-superuser database/schema owner with CREATEROLE, including actual function ownership transfer. If a migration is blocked, the test remains failed; the suite explicitly applies it as disposable native superuser solely to continue independent tests.
- Real independently authenticated PostgreSQL connections: same-key materialization replay, distinct-key version conflict, activation/materialization and activation/reconciliation in both lock-acquisition orders, and duplicate reconciliation credit prevention.
- Explicit cancelled-day reissue races with the same request key and with distinct keys; one replacement occurrence, one dated workout, no exposure, original snapshot retained.
- Barriers inspect `pg_stat_activity` and `pg_blocking_pids`; requests genuinely overlap in separate server backends, rather than being promises serialized by a one-connection mock.
- Raw evidence committed after a context read rejects stale mutations. Competing raw writers serialize evidence-version increments, rollback restores both row/version, and all seven legacy evidence triggers are exercised.
- A deliberately constructed real set-row/singleton lock inversion produces PostgreSQL `40P01`; the aborted operation leaves no receipt or partial owner clarification, and an explicit fresh-context retry yields one credit.
- Actual nonsuperuser login roles and ACLs: owner, other user, anon, service-role coach, role/JWT-claim mismatches, forbidden role escalation, helper execution, planning-table DML, owner-only coach actions, immutable history, and temporary-schema shadowing.

**Boundary:** JWT `request.jwt.claims` GUCs model trusted gateway inputs. These are native database/SQL authorization tests, not tests of JWT signatures, GoTrue, PostgREST, or a production Supabase deployment. The existing broad single-user legacy-table policies are not represented as multi-tenant isolation.

A nonzero result exits nonzero after cleanup. This is explicit because the transitive `async-exit-hook` otherwise hardcodes exit status zero on `beforeExit`, masking `process.exitCode` failures.
