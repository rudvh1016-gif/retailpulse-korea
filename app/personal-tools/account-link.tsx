'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function AccountToolsLink() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 5000);
    void fetch('/api/account/status', {
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: request.signal,
    }).then(response => response.ok ? response.json() : null).then(status => {
      if (!request.signal.aborted && status?.enabled === true && status.authenticated === false) setAvailable(true);
    }).catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); request.abort(); };
  }, []);
  return available ? <Link href="/ko/account" prefetch={false}>내 계정 · 개인 근무 도구</Link> : null;
}
