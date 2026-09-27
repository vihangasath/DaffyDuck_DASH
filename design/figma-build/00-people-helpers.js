// Waypoint People (HR panel) helpers: the filing-cabinet world from apps/admin (see apps/admin/DESIGN.md).
// Body of an async function(figma, H) where H is the 00-helpers.js library. Returns the People kit.
// Creates the "Waypoint People / Color" variable collection on first run (idempotent), so the helpers'
// P() can bind every fill by name like the logistics tokens.
const HEX={ink:'#1d2621','ink-2':'#46544b',muted:'#5a665e',canvas:'#e6eae3',card:'#fffefa',subtle:'#eef1ec',well:'#dde2da',line:'#cfd6cc','line-strong':'#a9b4a7',cabinet:'#2e4a3e','cabinet-2':'#3a5b4c','cabinet-3':'#22382e','on-cabinet':'#edf2ee','on-cabinet-muted':'#a8bbaf',brass:'#a88542','brass-2':'#dcc58f','brass-ink':'#5b4516',manila:'#e6cc8f','manila-2':'#f2e4bf','manila-edge':'#c3a35b','manila-ink':'#5d4714','label-card':'#ece5d2','card-red':'#cf4a3c',feint:'#b9cbe6','stamp-leave':'#9a5d0c','stamp-left':'#b3261e',success:'#2f6b45',focus:'#1f5fbf','job-driver':'#2f63a8','job-loader':'#b85a14','job-dispatcher':'#2f7a4a','job-store':'#7b4aa0','job-hr':'#3c423e'};
const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255,a:1});
const cols=await figma.variables.getLocalVariableCollectionsAsync();
let col=cols.find(c=>c.name==='Waypoint People / Color');
if(!col)col=figma.variables.createVariableCollection('Waypoint People / Color');
const mode=col.modes[0].modeId;
const have=new Set((await figma.variables.getLocalVariablesAsync('COLOR')).map(v=>v.name));
for(const [k,h] of Object.entries(HEX)){const n='people/'+k;if(have.has(n))continue;const v=figma.variables.createVariable(n,col,'COLOR');v.scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR','EFFECT_COLOR'];v.setValueForMode(mode,rgb(h));}
// Re-read so H.P() can see the new variables.
const V={};for(const v of await figma.variables.getLocalVariablesAsync('COLOR'))V[v.name]=v;
const P=(t,o)=>{const v=V[t];if(!v)throw new Error('token '+t);const p=figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',v);return o==null?p:{...p,opacity:o};};
const {A,ad,spacer}=H;
const c=k=>k.includes('/')?k:'people/'+k;

// Type: Archivo for reading, Archivo Narrow for semi-condensed caps labels, Courier Prime for typed record data.
const FAM={sans:'Archivo',caps:'Archivo Narrow',type:'Courier Prime'};
const STY={r:'Regular',m:'Medium',s:'SemiBold',b:'Bold'};
const want=[['Archivo','Regular'],['Archivo','Medium'],['Archivo','SemiBold'],['Archivo','Bold'],['Archivo Narrow','SemiBold'],['Archivo Narrow','Bold'],['Courier Prime','Regular'],['Courier Prime','Bold']];
const ok=new Set();for(const [f,s] of want){try{await figma.loadFontAsync({family:f,style:s});ok.add(f+'|'+s);}catch(e){}}
await Promise.all(['Regular','Medium','Semi Bold','Bold'].map(s=>figma.loadFontAsync({family:'Inter',style:s})));
const font=(fam,w)=>{const f=FAM[fam],s=STY[w];if(ok.has(f+'|'+s))return {family:f,style:s};if(fam==='type')return {family:'Inter',style:w==='b'?'Bold':'Regular'};return {family:'Inter',style:{r:'Regular',m:'Medium',s:'Semi Bold',b:'Bold'}[w]};};
function T(s,z=14,w='r',k='ink',o={}){const t=figma.createText();const fam=o.f||'sans';t.fontName=font(fam,w);t.characters=String(s);t.fontSize=z;t.fills=[P(c(k))];t.lineHeight={unit:'PERCENT',value:z>=22?120:145};if(fam==='caps'){t.textCase='UPPER';t.letterSpacing={unit:'PERCENT',value:o.ls??6};}else if(o.ls!=null)t.letterSpacing={unit:'PERCENT',value:o.ls};if(o.w){t.resize(o.w,t.height);t.textAutoResize='HEIGHT';}if(o.al)t.textAlignHorizontal=o.al;if(o.u){t.textDecoration='UNDERLINE';}t.name=o.n||String(s).slice(0,30);return t;}
const caps=(s,z=11,k='ink-2',o={})=>T(s,z,'s',k,{...o,f:'caps'});
const typed=(s,z=13,k='ink',w='r')=>T(s,z,w,k,{f:'type'});
// Frames with People tokens (A() binds via the helper's own V map, so pass fills here instead).
function F(d='V',o={}){const {bg,st,...r}=o;const f=A(d,r);if(bg)f.fills=[P(c(bg),o.bgo)];if(st){f.strokes=[P(c(st))];f.strokeWeight=o.sw||1;f.strokeAlign='INSIDE';if(o.sides){f.strokeTopWeight=o.sides[0];f.strokeRightWeight=o.sides[1];f.strokeBottomWeight=o.sides[2];f.strokeLeftWeight=o.sides[3];}}return f;}
const shadow=(k=1)=>[{type:'DROP_SHADOW',color:{r:.13,g:.22,b:.18,a:k===2?.3:.12},offset:{x:0,y:k===2?10:2},radius:k===2?22:6,spread:k===2?-10:-2,visible:true,blendMode:'NORMAL'}];
function icon(n,z=16,k='ink-2'){const node=H.I(n,z,'text/secondary');for(const v of node.findAll(()=>true))if('strokes' in v&&v.strokes.length)v.strokes=[P(c(k))];return node;}
function rule(w,k='card-red'){const r=figma.createRectangle();r.name='Rule';r.resize(w,1);r.fills=[P(c(k))];return r;}

// Buttons: 3px corners, cabinet green with an inset lower edge.
function btn(l,k='primary',o={}){const s={primary:['cabinet','on-cabinet',null],secondary:['card','ink','line-strong'],ghost:[null,'cabinet',null],danger:['stamp-left','card',null]}[k];const f=F('H',{n:'Button/'+k,bg:s[0],st:s[2],p:o.sm?[7,12]:[10,16],r:3,gap:8,ai:'CENTER',jc:'CENTER'});if(k==='primary'||k==='danger')f.effects=[{type:'INNER_SHADOW',color:{r:0,g:0,b:0,a:.25},offset:{x:0,y:-2},radius:0,spread:0,visible:true,blendMode:'NORMAL'}];if(o.i)ad(f,icon(o.i,16,s[1]));ad(f,T(l,o.sm?13:14,'s',s[1]));return f;}
// Rubber stamp: double rule, -3deg, exceptions only.
function stamp(l,k='stamp-leave',z=11){const outer=F('H',{n:'Stamp/'+l,st:k,p:2,r:2});const inner=F('H',{st:k,sw:2,p:[1,6],r:1});ad(inner,T(l.toUpperCase(),z,'b',k,{f:'caps',ls:8}));ad(outer,inner);outer.rotation=3;outer.opacity=.92;return outer;}
const JOB={driver:['job-driver','Driver'],loader:['job-loader','Loader'],dispatcher:['job-dispatcher','Dispatcher'],store:['job-store','Store manager'],hr:['job-hr','HR officer']};
function jobTab(j,bare){const f=F('H',{n:'Job/'+j,gap:6,ai:'CENTER'});const t=figma.createRectangle();t.name='Signal tab';t.resize(10,14);t.topLeftRadius=2;t.topRightRadius=2;t.fills=[P(c(JOB[j][0]))];ad(f,t);if(!bare)ad(f,caps(JOB[j][1],11,JOB[j][0]));return f;}
// Index card: header on the printed line, red rule under it, content below.
function indexCard(title,o={}){const card=F('V',{n:'Index card/'+title,bg:'card',r:3,w:o.w,clip:true});card.effects=shadow(1);const h=F('H',{n:'Header',p:[0,16],h:44,ai:'CENTER',gap:8,st:'card-red',sides:[0,0,1,0]});ad(h,caps(title,12));if(o.aside){spacer(h);ad(h,o.aside);}ad(card,[h,'w']);const body=F('V',{n:'Body',p:[12,16,16,16],gap:12});ad(card,[body,'w']);return {card,body};}
// Field: caps label, input, and one feint line under the row.
function field(label,value,o={}){const f=F('V',{n:'Field/'+label,gap:4,p:[0,0,12,0],st:'feint',sides:[0,0,1,0]});ad(f,caps(label,11));const b=F('H',{n:'Input',bg:'card',st:o.focus?'focus':'line-strong',sw:o.focus?2:1,r:3,p:[10,12],gap:8,ai:'CENTER',h:40});ad(b,[o.typed?typed(value,13,o.ph?'muted':'ink'):T(value,14,'r',o.ph?'muted':'ink'),'g']);if(o.select){const ch=icon('chev',16,'ink-2');ch.rotation=-90;ad(b,ch);}if(o.date)ad(b,icon('cal',16,'ink-2'));ad(f,[b,'w']);if(o.help)ad(f,T(o.help,12,'r','muted'));return f;}
// Folder-tab list: manila tab names it, papers inside.
function folderList(title,n,rows,w){const s=F('V',{n:'Folder list/'+title,gap:0,w});const tab=F('H',{n:'Tab',bg:'manila',st:'manila-edge',sides:[1,1,0,1],r:0,p:[6,12],gap:8,ai:'CENTER'});tab.topLeftRadius=4;tab.topRightRadius=4;ad(tab,caps(title,11,'manila-ink'),T(String(n),12,'s','manila-ink'));const tw=F('H',{p:[0,0,0,16]});ad(tw,tab);ad(s,tw);const body=F('V',{n:'Folder',bg:'manila-2',st:'manila-edge',r:3,p:6,gap:1});body.effects=shadow(1);for(const r of rows){const row=F('H',{bg:'card',p:[7,10],gap:8,ai:'CENTER'});ad(row,...r.slice(0,-1));ad(row,[r[r.length-1],'g']);ad(body,[row,'w']);}ad(s,[body,'w']);return s;}
// Row helper for folder lists: [jobTab, name, trailing]
const fl=(j,name,trail)=>{const n=T(name,14,'r','ink');const t=F('H',{jc:'MAX',ai:'CENTER'});ad(t,trail);return [jobTab(j,true),n,t];};
// Index dividers: the chosen tab stands forward in manila.
function dividers(opts,act){const f=F('H',{n:'Dividers',gap:2,st:'line-strong',sides:[0,0,1,0],wrap:4});opts.forEach(([l,n,alert],i)=>{const on=i===act;const d=F('H',{bg:on?'manila':'well',st:on?'manila-edge':null,sides:on?[1,1,0,1]:undefined,p:[8,12,6,12],gap:6,ai:'CENTER'});d.topLeftRadius=4;d.topRightRadius=4;ad(d,T(l,13,'s',on?'manila-ink':'ink-2'));if(n!=null)ad(d,T(String(n),12,alert?'b':'r',on?'manila-ink':alert?'stamp-left':'muted'));ad(f,d);});return f;}
// Cabinet rail: drawer fronts with brass label holders and pulls.
function rail(active,counts={},user='Anjali Wickramasinghe'){const r=F('V',{n:'Cabinet rail',bg:'cabinet',w:248,p:[24,12,20,0],gap:8});const lg=F('H',{gap:12,ai:'CENTER',p:[0,0,20,20]});ad(lg,mark(36));const lt=F('V',{gap:2});ad(lt,T('Waypoint People',17,'b','on-cabinet'),caps('Human resources',10,'on-cabinet-muted'));ad(lg,lt);ad(r,lg);
for(const l of ['Front desk','Staff directory','Renewals','Sign-in access','Activity log']){const on=l===active;const d=F('H',{n:'Drawer/'+l,bg:on?'cabinet-2':'cabinet-3',p:[12,12,12,20],gap:12,ai:'CENTER'});d.topRightRadius=3;d.bottomRightRadius=3;d.effects=[{type:'INNER_SHADOW',color:{r:0,g:0,b:0,a:.22},offset:{x:0,y:-2},radius:0,spread:0,visible:true,blendMode:'NORMAL'}].concat(on?[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:.45},offset:{x:0,y:6},radius:14,spread:-6,visible:true,blendMode:'NORMAL'}]:[]);const holder=F('H',{n:'Brass holder',bg:on?'brass-2':'brass',p:3,r:2,st:'brass-ink',sides:[0,0,2,0]});const card=F('H',{bg:on?'manila-2':'label-card',p:[3,8],r:1,gap:8,ai:'CENTER'});ad(card,[caps(l,11.5,on?'manila-ink':'ink'),'g']);if(counts[l])ad(card,T(String(counts[l][0]),12,'b',counts[l][1]?'stamp-left':'ink-2'));ad(holder,[card,'g']);ad(d,[holder,'g']);const pull=F('H',{bg:on?'brass-2':'brass',w:28,h:8,r:3,st:'brass-ink'});pull.effects=[{type:'DROP_SHADOW',color:{r:0,g:0,b:0,a:.45},offset:{x:0,y:3},radius:3,spread:-1,visible:true,blendMode:'NORMAL'}];ad(d,pull);ad(r,[d,'w']);}
spacer(r);const s=F('V',{gap:12,p:[0,20]});ad(s,T('Settings',14,'m','on-cabinet-muted'));const u=F('H',{gap:10,ai:'CENTER',p:[16,0,0,0],st:'cabinet-2',sides:[1,0,0,0]});const ut=F('V',{gap:2});ad(ut,T(user,14,'s','on-cabinet'));const sub=F('H',{gap:4});ad(sub,T('HR officer ·',11,'r','on-cabinet-muted'),typed('admin',11,'on-cabinet-muted'));ad(ut,sub);ad(u,[ut,'g'],icon('arrowr',16,'on-cabinet-muted'));ad(s,[u,'w']);ad(r,[s,'w']);return r;}
// The People mark: a manila folder carrying the route S.
function mark(z=32){const n=figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M6 18a4 4 0 0 1 4-4h14l5 6h25a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#e6cc8f"/><path d="M6 27h52" stroke="#c3a35b" stroke-width="2"/><path d="M26 46h10a5 5 0 0 0 0-10h-6a5 5 0 0 1 0-10h9" fill="none" stroke="#2e4a3e" stroke-width="4" stroke-linecap="round"/></svg>');n.name='People mark';n.rescale(z/64);return n;}
function head(title,sub,act){const h=F('H',{n:'Page header',p:[36,32,20,32],gap:24,ai:'MAX'});const l=F('V',{gap:6});ad(l,T(title,28,'b','ink',{ls:-2}),T(sub,14,'r','ink-2',{w:560}));ad(h,l);spacer(h);if(act)ad(h,act);return h;}
function ledger(cols,rows){const t=F('V',{n:'Ledger',bg:'card',st:'line',r:3,clip:true});t.effects=shadow(1);const mk=(cells,hd)=>{const r=F('H',{n:hd?'Head':'Row',bg:hd?'well':null,p:[hd?9:10,16],gap:12,ai:'CENTER',st:hd?null:'line',sides:[hd?0:1,0,0,0]});cells.forEach((x,i)=>{const cell=F('H',{w:cols[i].w||10,gap:8,ai:'CENTER'});ad(cell,typeof x==='string'?(hd?caps(x,11):T(x,13,'r','ink-2')):x);ad(r,cell);if(!cols[i].w)cell.layoutGrow=1;});return r;};ad(t,[mk(cols.map(x=>x.l),1),'w']);for(const r of rows)ad(t,[mk(r,0),'w']);return t;}
return {P,T,F,caps,typed,shadow,icon,rule,btn,stamp,jobTab,indexCard,field,folderList,fl,dividers,rail,mark,head,ledger,JOB,c};
