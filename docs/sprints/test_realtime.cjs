const fs=require('fs');const path=require('path');
const {chromium}=require('/Users/ibrahimamir/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../sites/kandil-parity.localhost/private/kandil-review.json')));
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
  const ctx=await browser.newContext(); const p=await ctx.newPage(); const failures=[];const messages=[];
  p.on('requestfailed',r=>{const u=new URL(r.url());if(u.pathname.includes('socket.io'))failures.push({origin:u.origin,path:u.pathname,failure:r.failure()?.errorText});});
  p.on('response',r=>{const u=new URL(r.url());if(u.pathname.includes('socket.io')&&r.status()>=400)failures.push({origin:u.origin,path:u.pathname,status:r.status()});});
  p.on('console',m=>{if(m.text().includes('socket.io'))messages.push(m.text());});
  const credentials=fixture.credentials||fixture.users;
  const hr=credentials.hr;
  await p.goto('http://localhost:8102/login');
  await p.locator('#login_email').fill(hr.email||hr.user);
  await p.locator('#login_password').fill(hr.password);
  await p.locator('.for-login button[type="submit"]').click();
  await p.waitForURL(/\/desk/);
  await p.waitForFunction(()=>window.frappe?.boot?.sitename);
  await p.waitForTimeout(2500);
  const state=await p.evaluate(()=>({site:frappe.boot.sitename,port:frappe.boot.socketio_port,dev_server:window.dev_server,connected:frappe.realtime.socket?.connected,host:frappe.realtime.get_host()}));
  const result={checked_at:new Date().toISOString(),status:state.site==='kandil-parity.localhost' && state.connected && !failures.length && !messages.length?'PASS':'FAIL',state,failures,messages};
  fs.writeFileSync(path.join(__dirname,'evidence/realtime-browser-2026-10-12.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e.name+': '+e.message);process.exit(1)});
