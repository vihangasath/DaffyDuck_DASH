// Same fixes as 01-fixes.js, but finds D2 / D5 / L2m by frame name, so it works on pasted copies (new node IDs).
// Run on the page that holds the frames (handoff file: page 6:2).
await Promise.all(['Regular','Medium','Semi Bold','Bold'].map(s=>figma.loadFontAsync({family:'Inter',style:s})));
const pg=await figma.getNodeByIdAsync('6:2');await figma.setCurrentPageAsync(pg);
const find=p=>pg.query(`FRAME[name^="${p} · "]`).first();
const d2=find('D2'),d5=find('D5'),l2m=find('L2m');const out={d2:!!d2,d5:!!d5,l2m:!!l2m,wrapped:0,labelMoved:false,stopRemoved:false};
if(d2)for(const t of d2.query('FRAME[name^="Trip "]').toArray()){const h=t.children[0];if(h&&h.type==='FRAME'&&h.layoutMode==='HORIZONTAL'){h.layoutWrap='WRAP';h.counterAxisSpacing=4;out.wrapped++;}}
if(d5){const lab=d5.query('TEXT').toArray().find(t=>t.characters.startsWith('Fleet capacity'));if(lab){lab.parent.x=250;out.labelMoved=true;}}
if(l2m){const s1=l2m.query('TEXT').toArray().find(t=>t.characters.startsWith('Stop 1 · OUT013'));if(s1){s1.parent.remove();out.stopRemoved=true;}}
if(d2){const v=d2.query('FRAME[name="Vehicle lanes"]').first();if(v)await v.screenshot({scale:0.6});}
if(l2m)await l2m.screenshot({scale:0.5});
if(d5){const pl=d5.query('FRAME[name=Plot]').first();if(pl)await pl.screenshot({scale:0.6});}
return out;
