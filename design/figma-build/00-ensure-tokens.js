// Plugin set-up step (runs before 08–10). Idempotent: safe in the main file, the handoff file or a blank file.
// 1) Makes sure the logistics "Waypoint / Color" collection (34 tokens, values from packages/ui/src/theme.css)
//    exists, adding only the tokens that are missing and never changing ones already there.
// 2) Makes sure a "02 · Screens by role" page exists (a blank file gets one; the Starter plan allows 3 pages).
// 3) Removes the temporary helper text nodes left behind by earlier MCP runs.
const LOGISTICS={'text/primary':'#0f1b2a','text/secondary':'#4a5868','text/muted':'#64717f','text/inverse':'#ffffff','text/on-ink-muted':'#93a4b6','bg/canvas':'#f5f7f9','bg/surface':'#ffffff','bg/subtle':'#edf1f4','bg/ink':'#0c1e2b','bg/ink-2':'#1a3345','border/default':'#e1e6eb','border/strong':'#c6cfd8','accent/primary':'#0f766e','accent/primary-strong':'#0b5a54','accent/primary-soft':'#e3f3f1','accent/amber':'#f59e0b','tone/success':'#15803d','tone/success-soft':'#e6f5eb','tone/warning':'#b45309','tone/warning-soft':'#fdf1df','tone/danger':'#c0262d','tone/danger-soft':'#fce9ea','tone/info':'#0369a1','tone/info-soft':'#e3f0f8','tone/chilled':'#0e7490','tone/chilled-soft':'#dff3f7','tone/neutral':'#4a5868','tone/neutral-soft':'#edf1f4','brand/fresh':'#4d7c0f','brand/fresh-soft':'#eef5e1','brand/style':'#a21caf','brand/style-soft':'#f8e8f9','brand/tech':'#4338ca','brand/tech-soft':'#ecebfb'};
const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255,a:1});
const have=new Set((await figma.variables.getLocalVariablesAsync('COLOR')).map(v=>v.name));
let col=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name==='Waypoint / Color');
let added=0;
for(const [n,h] of Object.entries(LOGISTICS)){
  if(have.has(n))continue;
  if(!col)col=figma.variables.createVariableCollection('Waypoint / Color');
  const v=figma.variables.createVariable(n,col,'COLOR');
  v.scopes=n.startsWith('text/')?['TEXT_FILL']:['FRAME_FILL','SHAPE_FILL','STROKE_COLOR','EFFECT_COLOR'];
  v.setValueForMode(col.modes[0].modeId,rgb(h));added++;
}
let page=figma.root.children.find(p=>/Screens by role/i.test(p.name));
let createdPage=false;
if(!page){
  const blank=figma.root.children.length===1&&figma.currentPage.children.length===0;
  if(blank){page=figma.root.children[0];page.name='02 · Screens by role';}
  else{page=figma.createPage();page.name='02 · Screens by role';createdPage=true;}
}
let cleaned=0;
const first=figma.root.children[0];await first.loadAsync();
for(const n of first.findAll(n=>n.type==='TEXT'&&/^__(build|people)-helpers \(temporary, delete\)$/.test(n.name))){n.locked=false;n.remove();cleaned++;}
return {tokensAdded:added,page:page.name,createdPage,helperNodesRemoved:cleaned};
