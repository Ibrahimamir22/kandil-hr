// Click a side-menu item like a user: open its group first (desktop) or the group sheet (phone).
async function navClick(p, v) {
  const sel = 'nav button[data-v="' + v + '"]';
  const b = await p.$(sel);
  if (!b && await p.$('nav button[data-v="settings"]')) {     // v0.46.0: administration screens sit behind the gear
    await p.click('nav button[data-v="settings"]'); await p.waitForSelector('#setList');
    return p.click('#setList [data-v="' + v + '"]');
  }
  if (b && await b.isVisible()) return p.click(sel);
  const gid = b ? await b.evaluate(x => { const k = x.closest('.navkids'); return k ? k.dataset.gk : ''; }) : '';
  if (!gid) return p.click(sel);
  await p.click('nav .navg[data-g="' + gid + '"]');
  if (await p.$('#navSheet')) return p.click('#navSheet [data-v="' + v + '"]');
  return p.click(sel);
}
module.exports = { navClick };
