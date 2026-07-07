# k6 Load Tests

## Prerequisites

Install k6: https://k6.io/docs/get-started/installation/

## Running

```bash
# Auth endpoint load test
k6 run k6/load-tests/auth.js -e BASE_URL=http://localhost:3000

# Courses/batches read path (requires auth token)
k6 run k6/load-tests/courses.js \
  -e BASE_URL=http://localhost:3000 \
  -e TEST_TOKEN=<admin_jwt>

# Leaderboard
k6 run k6/load-tests/leaderboard.js \
  -e BASE_URL=http://localhost:3000 \
  -e TEST_TOKEN=<student_jwt> \
  -e TEST_BATCH_ID=<uuid>
```

## Thresholds

| Script        | p95 target | Error rate |
|---------------|-----------|------------|
| auth.js       | < 500ms   | < 5%       |
| courses.js    | < 800ms   | < 1%       |
| leaderboard.js| < 1000ms  | < 2%       |
