import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m',  target: 50 },
    { duration: '30s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    errors: ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.TEST_TOKEN || '';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  };

  // List courses (most common read path)
  const listRes = http.get(`${BASE}/api/v1/courses?page=1&limit=20`, { headers });
  check(listRes, {
    'list courses 200': (r) => r.status === 200,
    'list courses < 800ms': (r) => r.timings.duration < 800,
  });
  errorRate.add(listRes.status !== 200);

  sleep(0.5);

  // List batches
  const batchRes = http.get(`${BASE}/api/v1/batches?page=1&limit=20`, { headers });
  check(batchRes, {
    'list batches 200': (r) => r.status === 200,
  });
  errorRate.add(batchRes.status !== 200);

  sleep(1);
}
