import {test,expect} from '@playwright/test';
import {waitForRenderedRoute} from '../e2e-production/route-readiness';

for(const width of [390,1280,1440])test(`airport readiness waits beyond hydrated empty shell ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.setContent('<div class="app" data-hydrated="true"><main class="page-shell" style="min-height:100px"></main></div>');
 let ready=false;const pending=waitForRenderedRoute(page,'/ko/airport').then(()=>{ready=true;});
 // A complete shared shell must not satisfy readiness for an absent lazy screen.
 await expect.poll(()=>page.locator('main.page-shell').isVisible()).toBe(true);
 expect(ready).toBe(false);
 await page.evaluate(()=>{document.querySelector('main')!.innerHTML='<section class="airport-view"><header class="view-intro"><h1>Airport</h1></header><div class="airport-date-reserved"><nav class="date-nav-shortcuts"><button>Yesterday</button><button>Today</button><button>Tomorrow</button></nav></div></section>';});
 await pending;expect(ready).toBe(true);
 await expect(page.locator('.airport-view > .view-intro')).toBeVisible();
});

test('airport body alone does not bypass unfinished hydration',async({page})=>{
 await page.setContent('<div class="app" data-hydrated="false"><main class="page-shell"><section class="airport-view"><header class="view-intro"><h1>Airport</h1></header><div class="airport-date-reserved"><nav class="date-nav-shortcuts"><button>Yesterday</button><button>Today</button><button>Tomorrow</button></nav></div></section></main></div>');
 let ready=false;const pending=waitForRenderedRoute(page,'/ko/airport').then(()=>{ready=true;});
 await expect(page.locator('.airport-view > .view-intro')).toBeVisible();expect(ready).toBe(false);
 await page.locator('.app').evaluate(node=>node.setAttribute('data-hydrated','true'));
 await pending;expect(ready).toBe(true);
});
