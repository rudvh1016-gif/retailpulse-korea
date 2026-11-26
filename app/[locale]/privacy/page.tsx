import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicPrivacyPolicy, publicPrivacyPath } from '../../../lib/public-privacy-policy';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '개인정보처리방침 | KORETAIL',
  alternates: { canonical: publicPrivacyPath, languages: { 'ko-KR': publicPrivacyPath } },
};

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  if ((await params).locale !== 'ko') notFound();
  const policy = await getPublicPrivacyPolicy();
  if (!policy) notFound();

  const sections = [
    ['처리하는 정보', policy.processing],
    ['저장과 삭제', policy.retention],
    ['제공과 위탁', policy.providers],
    ['국외 처리', policy.overseas],
    ['접속 기록과 쿠키', policy.logs],
    ['내 정보 확인과 삭제', policy.rights],
  ];

  return <main className="site-footer" style={{ margin: '0 auto', padding: '2rem 1rem', maxWidth: '48rem', textAlign: 'left', fontFamily: 'system-ui, sans-serif' }}>
    <Link href="/ko" prefetch={false}>코리테일 홈</Link>
    <h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>개인정보처리방침</h1>
    <p>시행일 <time dateTime={policy.effectiveDate}>{policy.effectiveDate}</time> · {policy.version}</p>
    <p>운영자 및 문의 {policy.operator} · <a href={`mailto:${policy.email}`}>{policy.email}</a></p>
    {sections.map(([title, body]) => <section key={title}>
      <h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{title}</h2>
      {body.split(/\r?\n/).filter(line => line.trim()).map((line, index) => <p key={index}>{line}</p>)}
    </section>)}
  </main>;
}
