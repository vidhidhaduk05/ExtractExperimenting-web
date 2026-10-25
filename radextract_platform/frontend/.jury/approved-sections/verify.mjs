import {launch} from 'file:///E:/CodexData/skills/jury/scripts/browser.mjs';
import fs from 'node:fs';
const out='D:/Desktop/Rad Extract Experimenting/radextract_platform/frontend/.jury/approved-sections';
const browser=await launch();const results=[];
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5180/.jury/approved-sections/landing-check.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(1000);
    if(await page.locator('#features').count()!==1||await page.locator('#process').count()!==1||await page.getByRole('heading',{name:'See where the literature stands.',exact:true}).count()!==1)throw Error('Existing sections missing');
    if(await page.locator('.approved-usecase').count()!==3)throw Error('Missing approved use cases');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`Overflow at ${width}`);
    await page.screenshot({path:`${out}/hero-${width}.png`});
    await page.locator('#use-cases').screenshot({path:`${out}/use-cases-${width}.png`});
    await page.locator('.approved-landing-collaboration').screenshot({path:`${out}/collaboration-${width}.png`});
    await page.locator('.approved-landing-footer').screenshot({path:`${out}/footer-${width}.png`});
    await page.getByRole('button',{name:'Explore this example: Breast imaging',exact:true}).click();
    const example=await page.getByTestId('navigation').textContent();if(!example.includes('/claimscape?claim=How%20does%20AI-assisted%20mammography'))throw Error('Example navigation failed');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Filters +',exact:true}).click();
    await page.getByLabel('Study Type').selectOption('systematic review');await page.getByLabel('Publication Date').selectOption('5');
    await page.getByLabel('Your research question').fill('Diagnostic imaging research');await page.getByRole('button',{name:'Search papers',exact:true}).click();
    const search=await page.getByTestId('navigation').textContent();const query=new URLSearchParams(search.split('?')[1]);
    if(query.get('claim')!=='Diagnostic imaging research'||!query.get('q').includes('systematic review')||!query.get('q').includes('last 5 years'))throw Error('Original search/filter navigation changed');
    if(errors.length)throw Error(JSON.stringify(errors));results.push({width,overflow:false,useCases:3,existingSections:true,exampleNavigation:true,originalFilteredSearch:true,errors});await context.close();
  }
  fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(results,null,2));console.log('VERDICT: PASS',JSON.stringify(results));
}finally{await browser.close()}
