// Minimal smoke-test specification for the first automated test suite.
// Run against a staging server after the test runner is selected.
//
// Expected:
// GET /api/v1/health -> HTTP 200 and { ok: true }
// GET /api/v1/catalog/categories -> HTTP 200
//
// Future tests must cover:
// 1. registration/login
// 2. role protection
// 3. product creation
// 4. stock reservation/concurrency
// 5. checkout totals
// 6. payment webhook verification
// 7. order status history
// 8. notification queueing
