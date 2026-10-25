// Standalone prototype check. Run from the isolated review-tools directory.
import { launch } from 'file:///E:/CodexData/skills/jury/scripts/browser.mjs';
import fs from 'node:fs';
const out='D:/Desktop/Rad Extract Experimenting/radextract_platform/frontend/prototypes/verification';
fs.mkdirSync(out,{recursive:true});
const browser=await launch();
const results=[];
try {
  for(const [name,width,height,reduced] of [['desktop',1440,1000,false],['sidepanel',500,850,false],['mobile',390,844,false],['reduced',390,844,true]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5180/prototypes/motion-preview.html',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(1400);
    await page.screenshot({path:`${out}/${name}-hero.png`});
    const initial=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,motion:document.documentElement.classList.contains('motion-on'),h1:document.querySelector('h1').textContent}));
    await page.getByRole('button',{name:'Filters +',exact:true}).click();
    if(!await page.locator('#filters').isVisible())throw Error(`${name}: filters did not open`);
    await page.locator('#study-design').selectOption({label:'Systematic review'});
    await page.getByRole('button',{name:'Filters −',exact:true}).click();
    if(width<=800){await page.getByRole('button',{name:'Menu',exact:true}).click();if(!await page.locator('#mobile-navigation').isVisible())throw Error(`${name}: menu did not open`);await page.getByRole('button',{name:'Close',exact:true}).click()}
    await page.getByRole('button',{name:'Stroke imaging ↗',exact:true}).click();
    if(!(await page.locator('#question').inputValue()).includes('CT perfusion'))throw Error(`${name}: example did not update question`);
    const phases=[];
    if(!reduced){
      for(const phase of [0,1,2]){
        await page.evaluate(index=>{const track=document.querySelector('#journey-track'),stage=track.querySelector('.stage');const offset=innerWidth<=800?66:76;const range=track.offsetHeight-stage.getBoundingClientRect().height;window.scrollTo({top:scrollY+track.getBoundingClientRect().top-offset+range*[.05,.5,.93][index],behavior:'instant'})},phase);
        await page.waitForTimeout(1000);
        phases.push(await page.locator('.scene.active').getAttribute('data-scene'));
        const clipped=await page.locator('.scene.active').evaluate(el=>{const bottom=el.parentElement.getBoundingClientRect().bottom;return [...el.children].some(child=>child.getBoundingClientRect().bottom>bottom+1)});
        if(clipped)throw Error(`${name}: stage ${phase} clipped`);
        await page.screenshot({path:`${out}/${name}-stage-${phase}.png`});
      }
      await page.getByRole('button',{name:'Motion: on',exact:true}).click();
      if(await page.locator('.scene[aria-hidden="true"]').count())throw Error(`${name}: hidden scenes after motion disabled`);
    }
    const state={name,...initial,phases,errors};
    if(initial.overflow||errors.length||initial.motion===reduced||(!reduced&&phases.join('')!=='012'))throw Error(JSON.stringify(state));
    results.push(state);await context.close();
  }
  fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log('VERDICT: PASS',JSON.stringify(results));
}finally{await browser.close()}
