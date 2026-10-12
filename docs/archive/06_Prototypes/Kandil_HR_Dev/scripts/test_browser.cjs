const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const credentials=JSON.parse(fs.readFileSync(path.join(root,'development/test-credentials.json')));
const out=path.join(root,'development/testing');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const results=[];
  const adminContext=await browser.newContext();
  await adminContext.request.post('http://localhost:8101/api/method/login',{form:{usr:'Administrator',pwd:fs.readFileSync(path.join(root,'.secrets/admin_password'),'utf8').trim()}});
  const languageChange=await adminContext.request.put('http://localhost:8101/api/resource/User/'+encodeURIComponent(credentials.manager2.email),{data:{language:'ar'}});
  if(!languageChange.ok())throw new Error('Could not configure the synthetic Arabic test user');
  await adminContext.close();
  for(const key of ['manager','manager2','employee_a']){
    const context=await browser.newContext({viewport:key!=='employee_a'?{width:1440,height:1000}:{width:390,height:844}});
    const account=credentials[key];
    const login=await context.request.post('http://localhost:8101/api/method/login',{form:{usr:account.email,pwd:account.password}});
    if(!login.ok())throw new Error('Test login failed: '+login.status());
    const page=await context.newPage();const errors=[];const failed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=500)failed.push({url:r.url(),status:r.status()});});
    await page.goto('http://localhost:8101'+(key!=='employee_a'?'/desk/employee':'/hrms'),{waitUntil:'networkidle'});
    await page.screenshot({path:path.join(out,key+'-screen.png'),fullPage:true});
    results.push({account:key,url:page.url(),title:await page.title(),text:(await page.locator('body').innerText()).slice(0,10000),pageErrors:errors,serverErrors:failed});
    if(key==='employee_a'){
      await page.getByText('Request Leave',{exact:true}).click();
      await page.waitForURL('**/leave-applications/new');
      await page.getByText('Leave Type',{exact:true}).waitFor();
      await page.waitForTimeout(800); // Let the Ionic page transition finish before the screenshot.
      await page.screenshot({path:path.join(out,'employee-leave-form.png'),fullPage:true});
      results.push({account:key,check:'Navigate to leave request form from mobile home',url:page.url(),text:(await page.locator('body').innerText()).slice(0,6000),pageErrors:errors,serverErrors:failed});
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e.message);process.exit(1);});
