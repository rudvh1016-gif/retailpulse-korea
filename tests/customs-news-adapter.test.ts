import test from 'node:test';import assert from 'node:assert/strict';
import {customsPublishedAt,parseCustomsRss,customsTypeOneEvidence,prepareCustomsNews} from '../lib/customs-news-adapter';
import {mayPublishNews} from '../lib/airport-customs-news';
const item={id:'123',title:'Fixture 면세 안내',url:'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?mi=2891&nttSn=123',publishedAt:'2026-10-01T09:00:00.000Z'};
const fields='<input name="nttSn" value="123"><input name="nttSnUrl" value="0123456789abcdef0123456789abcdef">';
const licence='<div class="codeView01"><img src="/images/board/kogl/new_img_opentype01.png"><span>관세청</span><span>“Fixture 면세 안내”</span><a href="http://www.kogl.or.kr/info/licenseType1.do">출처표시</a></div>';
test('official local timestamps are explicitly KST; impossible dates are unavailable',()=>{
 assert.equal(customsPublishedAt('2026-10-02 18:06:28.0'),'2026-10-02T09:06:28.000Z');
 for(const value of ['2026-02-30 18:06:28.0','2026-10-02 24:06:28','2026-10-02',''])assert.equal(customsPublishedAt(value),null);
});
test('RSS normalizes official HTTPS links without inventing article permission or dates',()=>{
 const xml='<rss><item><title><![CDATA[Fixture 면세 안내]]></title><link>'+item.url.replace('https:','http:')+'</link><pubDate>bad date</pubDate></item></rss>';
 assert.deepEqual(parseCustomsRss(xml),[{...item,publishedAt:null}]);
 assert.deepEqual(parseCustomsRss(xml.replace('www.customs.go.kr','www.customs.go.kr.example.com')),[]);
 assert.throws(()=>parseCustomsRss('<!DOCTYPE rss>'+xml));assert.throws(()=>parseCustomsRss('x'.repeat(1024*1024+1)));
});
test('type 1 is item-specific: footer, wrong title/id, other licences and no mark cannot clear an article',()=>{
 assert.ok(customsTypeOneEvidence(item,fields+licence));
 assert.ok(customsTypeOneEvidence(item,'<!DOCTYPE html>'+fields+licence));
 assert.ok(customsTypeOneEvidence(item,fields+licence.replace('“','&ldquo;').replace('”','&rdquo;')));
 for(const html of [fields,licence,fields+licence.replace('codeView01','footer'),fields+licence.replace('Fixture 면세 안내','Different title'),fields+licence.replaceAll('opentype01','opentype03'),fields+licence.replace('licenseType1','licenseType2')])assert.equal(customsTypeOneEvidence(item,html),null);
});
test('normal deep-link verification is required; no effective date, deadline or retailer priority is guessed',async()=>{
 const privateItem=await prepareCustomsNews(item,fields+licence,'2026-10-10T01:00:00Z',{deepLinkVerified:false});assert.equal(mayPublishNews(privateItem),false);
 const cleared=await prepareCustomsNews(item,fields+licence,'2026-10-10T01:00:00Z',{deepLinkVerified:true});assert.equal(mayPublishNews(cleared),true);
 assert.match(cleared.clearance!.attribution,/관세청.*2026.*Fixture.*licenseType1/);
 assert.equal(cleared.effectiveDate,undefined);assert.equal(cleared.deadline,undefined);assert.equal(cleared.relevantToRetail,false);assert.equal(cleared.status,'review');assert.equal(cleared.attachmentNeedsReview,true);
});
