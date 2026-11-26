/* This worker only handles the click on an account-page notification. */
self.addEventListener('notificationclick', event => {
  if (event.notification.tag !== 'koretail-departure' && event.notification.tag !== 'koretail-departure-test') return;
  event.notification.close();
  const accountUrl = new URL('/ko/account', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const account = windows.find(client => new URL(client.url).origin === self.location.origin &&
      new URL(client.url).pathname === '/ko/account');
    if (account) await account.focus();
    else await self.clients.openWindow(accountUrl);
  })());
});
