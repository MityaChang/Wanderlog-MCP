## Integration Tests

Integration tests are opt-in because they require a real Wanderlog account and
may create or edit trip data. Run them only with an explicit test account or a
disposable trip and a local `WANDERLOG_COOKIE` value.

Run read-only integration checks with:

```bash
RUN_WANDERLOG_INTEGRATION=1 \
WANDERLOG_COOKIE='s%3A...' \
npm run test:integration -- tests/integration/list-trips.integration.test.ts
```

Run the ShareDB live mutation smoke test only against a disposable trip:

```bash
RUN_WANDERLOG_INTEGRATION=1 \
WANDERLOG_COOKIE='s%3A...' \
WANDERLOG_TRIP_KEY='trip-key' \
npm run test:integration -- tests/integration/sharedb-smoke.test.ts
```

The ShareDB smoke test renames one day heading. Optional variables are
`WANDERLOG_SMOKE_DAY` and `WANDERLOG_SMOKE_HEADING`.
