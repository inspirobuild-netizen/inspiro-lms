import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '1m',  target: 20 },  // hold
    { duration: '30s', target: 0  },  // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.05'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // send-otp
  const sendRes = http.post(
    `${BASE}/api/v1/auth/send-otp`,
    JSON.stringify({ phone: '919876543210' }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const ok = check(sendRes, {
    'send-otp status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    'send-otp responds < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(!ok);

  sleep(1);
}
