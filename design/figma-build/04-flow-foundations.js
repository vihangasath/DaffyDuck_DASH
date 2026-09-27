const AF=Object.getPrototypeOf(async function(){}).constructor;const H=await (new AF('figma',(await figma.getNodeByIdAsync('4:2')).characters))(figma);const {P,T,A,ad,spacer,I,pill,brandPill,btn,card,bar,hr,dot,kv,field,seg,syncPill}=H;
const pg=figma.currentPage;
// ===== FLOW
const fw=figma.createFrame();fw.name='03 · Cross-role workflow';fw.resize(3140,1120);fw.fills=[P('bg/surface')];pg.appendChild(fw);fw.x=0;fw.y=2700;fw.clipsContent=true;
const hd=A('V',{gap:8});ad(hd,pill('03 · WORKFLOW','primary',{lg:true}),T('How a decision travels between roles',40,'b'),T('Solid: the daily workflow from the brief. Dashed: information flowing back — the connections that are missing today.',18,'r','text/secondary'));fw.appendChild(hd);hd.x=64;hd.y=48;
const top=210,LH=210,X0=260,CW=400;
const lanes=[['Store manager','store','Counter desktop + phone'],['Dispatcher','grid','Desktop, Peliyagoda'],['Loader','box','Dock tablet + phone'],['Driver','truck','Personal phone, offline']];
lanes.forEach(([l,ic,d],i)=>{const r=figma.createRectangle();r.resize(3140,LH);r.fills=[P(i%2?'bg/surface':'bg/canvas')];fw.appendChild(r);r.x=0;r.y=top+40+i*LH;const lb=A('V',{gap:6,w:200});const lh=A('H',{gap:8,ai:'CENTER'});ad(lh,I(ic,20,'accent/primary'),T(l,17,'b'));ad(lb,lh,T(d,13,'r','text/secondary'));fw.appendChild(lb);lb.x=40;lb.y=top+40+i*LH+70;});
['Before 16:00','16:00 cutoff','16:00 – 18:30','03:00 – 03:45','03:45 – 08:00','After delivery','Weekly'].forEach((t,c)=>{const x=T(t,13,'b','text/muted',{up:true,ls:6});fw.appendChild(x);x.x=X0+c*CW;x.y=top;});
const nodes={};
const node=(k,c,l,title,sub,scr)=>{const n=A('V',{n:'Step/'+title,w:310,bg:'bg/surface',st:'accent/primary',sw:2,r:14,p:16,gap:6,sh:1});ad(n,T(title,17,'b'),T(sub,13,'r','text/secondary',{w:278}),pill(scr,'primary'));fw.appendChild(n);n.x=X0+c*CW;n.y=top+40+l*LH+40;nodes[k]=n;};
const chip=(k,c,l,label,ic)=>{const n=A('H',{n:'Signal/'+label,bg:'tone/warning-soft',st:'tone/warning',r:999,p:[8,14],gap:8,ai:'CENTER'});ad(n,I(ic,16,'tone/warning'),T(label,13,'s','tone/warning'));fw.appendChild(n);n.x=X0+c*CW+20;n.y=top+40+l*LH+70;nodes[k]=n;};
node('n1',0,0,'1 · Place order','Captured and confirmed before the cutoff, dry and chilled separately','S1');
node('n2',1,1,'2 · Close orders','One confirmed queue; late orders roll to the next run','D1');
node('n3',2,1,'3 · Plan & allocate','Auto-plan + validated override; deferrals with reasons','D2 · D3');
node('n4',3,2,'4 · Load','Reverse stop order; flag shortfalls before departure','L1 – L3');
node('n5',4,3,'5 · Deliver','Offline-first run; POD with photo + signature','R1 – R5');
node('n6',5,0,'6 · Confirm receipt','Check against POD; report issues','S2 – S4');
node('n7',6,1,'7 · Plan capacity','Forecast → reefers, trucks, drivers','D5 · D6');
chip('c1',2,0,'Deferral notice + reason','alert');chip('c2',3,1,'Shortfall alert → re-plan','box');chip('c3',4,1,'Live status · sync','pulse');chip('c4',4,0,'ETA window + POD','clock');chip('c5',5,1,'Issue → exception','msg');chip('c6',3,3,'Load list · stop order','clip');
async function link(a,b,tok,dash){const A1=nodes[a],B1=nodes[b];let x1,y1,x2,y2;if(B1.x>A1.x+A1.width){x1=A1.x+A1.width;y1=A1.y+A1.height/2;x2=B1.x;y2=B1.y+B1.height/2;}else if(B1.y+B1.height<A1.y){x1=A1.x+A1.width/2;y1=A1.y;x2=B1.x+B1.width/2;y2=B1.y+B1.height;}else{x1=A1.x+A1.width/2;y1=A1.y+A1.height;x2=B1.x+B1.width/2;y2=B1.y;}
const mx=Math.min(x1,x2),my=Math.min(y1,y2);const v=figma.createVector();fw.appendChild(v);await v.setVectorNetworkAsync({vertices:[{x:x1-mx,y:y1-my},{x:x2-mx,y:y2-my,strokeCap:'ARROW_LINES'}],segments:[{start:0,end:1}],regions:[]});v.x=mx;v.y=my;v.strokes=[P(tok)];v.strokeWeight=2.5;if(dash)v.dashPattern=[7,6];v.name=(dash?'Feedback ':'Flow ')+a+'→'+b;return v;}
for(const [a,b] of [['n1','n2'],['n2','n3'],['n3','n4'],['n4','n5'],['n5','n6'],['n6','n7']])await link(a,b,'accent/primary',0);
for(const [a,b] of [['n3','c1'],['n4','c2'],['n5','c3'],['n5','c4'],['n6','c5'],['n4','c6']])await link(a,b,'tone/warning',1);
for(const k in nodes)fw.appendChild(nodes[k]);
// ===== FOUNDATIONS
const fd=A('V',{n:'04 · Foundations & style guide',bg:'bg/canvas',w:3140,p:64,gap:40});pg.appendChild(fd);fd.x=0;fd.y=3960;
const fh=A('V',{gap:8});ad(fh,pill('04 · FOUNDATIONS','primary',{lg:true}),T('One visual language across four very different devices',40,'b'),T('Status colours mean the same thing in every role. Brand colours only identify Fresh, Style and Tech — never status. All colours are Figma variables (Waypoint / Color).',18,'r','text/secondary',{w:1500}));ad(fd,fh);
const vars=await figma.variables.getLocalVariablesAsync('COLOR');const col=(await figma.variables.getLocalVariableCollectionsAsync())[0];const mode=col.modes[0].modeId;
const hx=c=>'#'+[c.r,c.g,c.b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('').toUpperCase();
const groups={};for(const v of vars){const g=v.name.split('/')[0];(groups[g]=groups[g]||[]).push(v);}
const cr=A('H',{gap:40,wrap:32});ad(fd,[cr,'w']);
for(const [g,list] of Object.entries(groups)){const gc=A('V',{gap:10});ad(gc,T(g,14,'b','text/secondary',{up:true,ls:6}));const sw=A('H',{gap:10});for(const v of list){const s=A('V',{gap:4,w:112});const r=figma.createRectangle();r.resize(112,64);r.cornerRadius=10;r.fills=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',v)];r.strokes=[P('border/default')];ad(s,r,T(v.name.split('/')[1],12,'s'),T(hx(v.valuesByMode[mode]),11,'r','text/muted'));ad(sw,s);}ad(gc,sw);ad(cr,gc);}
const two=A('H',{gap:32});ad(fd,[two,'w']);
const ty=card({gap:14,p:28,w:900});ad(ty,T('Type · Inter',16,'b'));for(const [n,z,w,s] of [['Display',40,'b','Delivery planning'],['Title',22,'b','Plan & allocate'],['Section',15,'b','Order queue'],['Body',14,'r','Swap with OUT012 on VEH009 · Trip 1'],['Mobile body',16,'r','Saved on this phone'],['Caption',12,'r','Chilled 186 m³ vs 166 m³'],['Label',11,'b','WINDOW']]){const r=A('H',{gap:20,ai:'CENTER'});const l=A('V',{w:150});ad(l,T(n+' · '+z,12,'m','text/muted'));ad(r,l,T(s,z,w));ad(ty,r);}ad(two,ty);
const cp=card({gap:18,p:28});ad(two,[cp,'w']);ad(cp,T('Components',16,'b'));
const r1=A('H',{gap:10,ai:'CENTER'});ad(r1,btn('Primary','primary'),btn('Secondary','secondary'),btn('Soft','soft'),btn('Warning','warn'),btn('Danger','danger'),btn('Ghost','ghost'));ad(cp,r1);
ad(cp,btn('Mobile primary · 56 px target','primary',{big:1,i:'check'}));
const r2=A('H',{gap:8,wrap:8});for(const t of ['success','warning','danger','info','chilled','neutral'])ad(r2,pill(t==='chilled'?'Chilled':t[0].toUpperCase()+t.slice(1),t,{dot:t!=='chilled',i:t==='chilled'?'snow':null}));ad(r2,brandPill('Fresh'),brandPill('Style'),brandPill('Tech'));ad(cp,[r2,'w']);
const r3=A('H',{gap:8});ad(r3,syncPill('ok'),syncPill('sync'),syncPill('off'));ad(cp,r3);
const r4=A('H',{gap:16});ad(r4,field('Default','Dilani Fernando'),field('Focus','9.4',{focus:1}),field('Error','9.4 °C',{err:1,help:'Above 5 °C limit'}));ad(cp,r4);
const r5=A('H',{gap:20,ai:'CENTER'});ad(r5,seg(['Deferred','Unassigned','All'],0),bar(64,'primary',160,8),bar(92,'warning',160,8),bar(100,'danger',160,8));ad(cp,r5);
const pr=A('H',{gap:16});ad(fd,[pr,'w']);
for(const [ic,t,d] of [['info','Explain every decision','Each deferral shows reason, priority score and consequence.'],['wifioff','Offline is a normal state','Driver and loader flows never block on the network.'],['layers','One record, many views','A decision made once reaches every role that needs it.'],['user','Design for the conditions','Gloves, sunlight, a stopped truck: 48 px+ targets, high contrast.'],['alert','Status colours are sacred','Green / amber / red mean the same thing on every screen.'],['check','Restraint','No feature the brief doesn’t need to close the loop.']]){const c=card({gap:8,p:20});const ib=A('H',{bg:'accent/primary-soft',r:8,p:8});ad(ib,I(ic,18,'accent/primary'));ad(c,ib,T(t,15,'b'),T(d,13,'r','text/secondary',{w:420}));ad(pr,[c,'w']);}
return {flow:fw.id,found:fd.id};
