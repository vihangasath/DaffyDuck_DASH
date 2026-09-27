const pg=await figma.getNodeByIdAsync('1:4');await figma.setCurrentPageAsync(pg);
const d2=await figma.getNodeByIdAsync('5:357');let n=0;
for(const t of d2.query('FRAME[name^="Trip "]').toArray()){const h=t.children[0];if(h&&h.type==='FRAME'&&h.layoutMode==='HORIZONTAL'){h.layoutWrap='WRAP';h.counterAxisSpacing=4;n++;}}
const d5=await figma.getNodeByIdAsync('8:2');const lab=d5.query('TEXT').toArray().find(t=>t.characters.startsWith('Fleet capacity'));if(lab)lab.parent.x=250;
const l2m=await figma.getNodeByIdAsync('10:344');const s1=l2m.query('TEXT').toArray().find(t=>t.characters.startsWith('Stop 1 · OUT013'));if(s1)s1.parent.remove();
await d2.query('FRAME[name="Vehicle lanes"]').first().screenshot({scale:0.6});await l2m.screenshot({scale:0.5});await d5.query('FRAME[name=Plot]').first().screenshot({scale:0.6});
return {n};
