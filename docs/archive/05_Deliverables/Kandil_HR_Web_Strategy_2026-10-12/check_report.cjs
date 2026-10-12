const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const errors=[];
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1040},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(__dirname,'Kandil_HR_Web_Strategy.html')).href);
 await page.screenshot({path:path.join(__dirname,'report-desktop.png')});
 await page.locator('#section-04').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(__dirname,'report-comparison.png')});
 for(const img of await page.locator('figure img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());}
 const desktop=await page.evaluate(()=>({sections:document.querySelectorAll('article h2').length,figures:document.querySelectorAll('figure').length,loadedImages:[...document.images].every(i=>i.complete&&i.naturalWidth>0),tables:document.querySelectorAll('table').length,overflow:document.documentElement.scrollWidth>innerWidth,brokenAnchors:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.querySelector(a.getAttribute('href'))).length}));
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:path.join(__dirname,'report-mobile.png')});
 const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 const links=await page.locator('a').evaluateAll(els=>els.map(e=>e.getAttribute('href')).filter(u=>u&&!u.startsWith('#')&&!u.startsWith('http')));
 const missingFiles=links.filter(u=>!fs.existsSync(path.join(__dirname,u)));
 const proof={checked_at:new Date().toISOString(),desktop,mobile,missingFiles,errors,scope:'Report rendering only; no HR implementation tests were run.'};
 fs.writeFileSync(path.join(__dirname,'report-validation.json'),JSON.stringify(proof,null,2));
 await browser.close();
 if(desktop.sections!==18||desktop.figures!==3||!desktop.loadedImages||desktop.overflow||mobile.overflow||desktop.brokenAnchors||missingFiles.length||errors.length)throw new Error(JSON.stringify(proof));
 console.log(JSON.stringify(proof));
})().catch(e=>{console.error(e);process.exit(1)});
