import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

export const options = {
  // Leaderboard is expensive — smaller load, tighter latency target
  stages: [
    { duration: '30s', target: 30 },
    { duration: '1m',  target: 30 },
    { duration: '30s', target: 0  },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    errors: ['rate<0.02'],
  },
};

const BASE  = __ENV.BASE_URL  || 'http://localhost:3000';
const TOKEN = __ENV.TEST_TOKEN || '';
const BATCH = __ENV.TEST_BATCH_ID || '';

export default function () {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
  };

  const periods = ['weekly', 'monthly', 'all_time'];
  const period  = periods[Math.floor(Math.random() * periods.length)];

  const url = BATCH
    ? `${BASE}/api/v1/leaderboard/${BATCH}?period=${period}`
    : `${BASE}/api/v1/leaderboard?period=${period}`;

  const res = http.get(url, { headers });
  const ok = check(res, {
    'leaderboard 200': (r) => r.status === 200,
    'leaderboard < 1s': (r) => r.timings.duration < 1000,
  });
  errorRate.add(!ok);

  sleep(1);
}
