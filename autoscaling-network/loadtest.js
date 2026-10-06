// Max-throughput load test for the fake-service frontend.
//
// Each VU sends requests back-to-back with no think time, so throughput is
// limited only by VU count, latency, and this machine. Ramps up gradually so
// you can watch the frontend autoscale in the Render dashboard.
//
//   k6 run autoscaling-network/loadtest.js
//   k6 run -e MAX_VUS=1000 -e HOLD=10m autoscaling-network/loadtest.js
//
// Env vars:
//   TARGET   URL to hit             (default: https://fake-frontend-l7ka.onrender.com/)
//   MAX_VUS  peak concurrent users  (default: 500)
//   RAMP     time to reach MAX_VUS  (default: 2m)
//   HOLD     time to stay at peak   (default: 5m)

import http from 'k6/http';
import { check } from 'k6';

const TARGET = __ENV.TARGET || 'https://fake-frontend-l7ka.onrender.com/';
const MAX_VUS = parseInt(__ENV.MAX_VUS || '500', 10);
const RAMP = __ENV.RAMP || '2m';
const HOLD = __ENV.HOLD || '5m';

export const options = {
  // Only the status code matters; skipping bodies saves local CPU and memory.
  discardResponseBodies: true,
  scenarios: {
    flood: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: Math.min(50, MAX_VUS) },
        { duration: RAMP, target: MAX_VUS },
        { duration: HOLD, target: MAX_VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  // Reported in the summary, but don't abort: the goal is to push past them.
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  // A 500 means a downstream tier (middleware/backend) failed.
  const res = http.get(TARGET, { timeout: '30s' });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'not rate limited': (r) => r.status !== 429,
  });
}
