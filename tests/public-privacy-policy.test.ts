import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as policy from '../lib/public-privacy-policy';

const approved = {
  version: 'account-v1',
  effectiveDate: '2026-11-23',
  operator: '예시 운영자',
  email: 'support@example.invalid',
  processing: '승인된 처리 항목과 목적',
  rights: '승인된 권리 행사 방법',
  retention: '승인된 보관 및 파기 설명',
  providers: '승인된 위탁 및 제공 설명',
  overseas: '승인된 국외 처리 설명',
  logs: '승인된 서버 로그 및 통계 설명',
};

test('show the policy only with a complete, valid publication record', () => {
  assert.equal(policy.parsePublicPrivacyPolicy(undefined), null);
  assert.equal(policy.parsePublicPrivacyPolicy('{'), null);
  for (const incomplete of [
    { ...approved, email: '' }, { ...approved, email: 'bad@' },
    { ...approved, effectiveDate: '2026-02-30' },
    { ...approved, overseas: '' }, { ...approved, logs: '' },
  ]) assert.equal(policy.parsePublicPrivacyPolicy(JSON.stringify(incomplete)), null);
  assert.deepEqual(policy.parsePublicPrivacyPolicy(JSON.stringify(approved)), approved);
});
