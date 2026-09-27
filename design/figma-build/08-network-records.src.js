// 08 · Dispatch owns the network records (27 Sep 2026).
// 1) Every dispatcher sidebar (D1–D6) gets a "Today's run" label and a "Network records" group:
//    Vehicles, Branches, Depots, Products, Demo day (moved out of the old admin console).
// 2) New screen D7 · Vehicles: the fleet records, with the vehicle drawer where dispatch assigns the driver.
// Runs on the page that holds the dispatcher screens ("02 · Screens by role").
const {P,T,A,ad,spacer,I,pill,btn,card,dsb,dhead,screen,section,table,field}=H;
const pg=figma.root.children.find(p=>/Screens by role/i.test(p.name))||figma.currentPage;
await figma.setCurrentPageAsync(pg);await pg.loadAsync();
const out={sidebars:0,skipped:0};

function groupLabel(t){const f=A('H',{n:'Nav group/'+t,p:[14,12,4,12]});ad(f,T(t,11,'s','text/on-ink-muted',{}));return f;}
function navItem(ic,l,on){const it=A('H',{n:'Nav/'+l,p:[10,12],r:8,gap:10,ai:'CENTER',bg:on?'bg/ink-2':null});ad(it,I(ic,18,on?'text/inverse':'text/on-ink-muted'),T(l,14,on?'s':'m',on?'text/inverse':'text/on-ink-muted'));return it;}
function addNetwork(sb,active){
  if(sb.findOne(n=>n.name==='Nav/Vehicles'))return false;
  const today=sb.findOne(n=>n.name==='Nav/Today');const fleet=sb.findOne(n=>n.name==='Nav/Fleet & fuel');if(!today||!fleet)return false;
  const par=fleet.parent;
  const lt=groupLabel('Today’s run');par.insertChild(par.children.indexOf(today),lt);lt.layoutSizingHorizontal='FILL';
  let at=par.children.indexOf(fleet)+1;
  const add=n=>{par.insertChild(at++,n);n.layoutSizingHorizontal='FILL';};
  add(groupLabel('Network records'));
  for(const [ic,l] of [['layers','Vehicles'],['store','Branches'],['pin','Depots'],['box','Products'],['sync','Demo day']])add(navItem(ic,l,l===active));
  if(active){const t=sb.findOne(n=>n.name==='Nav/Today');if(t){t.fills=[];for(const x of t.findAll(n=>n.type==='TEXT'))x.fills=[P('text/on-ink-muted')];}}
  return true;
}
for(const sb of pg.findAll(n=>n.type==='FRAME'&&n.name==='Sidebar'&&!!n.findOne(x=>x.name==='Nav/Fleet & fuel'))){if(addNetwork(sb))out.sidebars++;else out.skipped++;}

// ── D7 · Vehicles (network records) ──
const bottom=Math.max(0,...pg.children.map(n=>n.y+n.height));
const sec=section(pg,'Dispatch · Network records (added 27 Sep)',0,bottom+400,1700,1400);
const fr=screen(sec,120,160,1440,900,'D7','Network records · Vehicles','Vehicles, branches, depots and products used to live in the admin console. They are logistics records, so they moved to dispatch when the admin console became the HR panel. Dispatch also decides which driver runs each vehicle; HR keeps the person’s record and licence.',{d:'H'});
const sb=dsb('');addNetwork(sb,'Vehicles');ad(fr,[sb,'h']);
const main=A('V',{n:'Main',gap:0});ad(fr,[main,'g']);main.layoutSizingVertical='FILL';
ad(main,[dhead('Vehicles','The fleet the planner allocates: capacities, refrigeration, fuel quotas and which driver runs each vehicle.',[],[btn('Add vehicle','primary',{i:'plus'})]),'w']);
const body=A('V',{n:'Body',p:[20,28],gap:14});ad(main,[body,'w']);
const chips=A('H',{gap:6,ai:'CENTER'});ad(chips,pill('All 60','neutral',{solid:true,lg:true}),pill('Peliyagoda 38','neutral',{lg:true}),pill('Kandy hub 22','neutral',{lg:true}),pill('Refrigerated 16','chilled',{lg:true}),pill('Vans 8','neutral',{lg:true}),pill('In workshop 10','danger',{lg:true}));ad(body,chips);
const V=[['VEH001','WP LK-1373','Refrigerated truck','26.4 m³','Chaminda Perera','Workshop'],['VEH002','WP LK-1746','Refrigerated truck','21.1 m³','Nuwan Fernando','Workshop'],['VEH006','WP LK-3238','Refrigerated truck','33.4 m³','Lasantha Gunawardena','Available'],['VEH008','WP LK-3984','Dry-box truck','22 m³','Kamal Dissanayake','Available'],['VEH011','WP LK-5103','Dry-box truck','38 m³','Ruwan Silva','Available'],['VEH018','WP PD-2871','Refrigerated van','9.6 m³','Isuru Fernando','Available']];
const tc=card({p:0,gap:0,clip:true});ad(body,[tc,'w']);
ad(tc,[table([{l:'Vehicle',w:170},{l:'Type',w:190},{l:'Capacity',w:110},{l:'Driver'},{l:'Status',w:120}],V.map(r=>[r[0]+'  ·  '+r[1],r[2],r[3],r[4],pill(r[5],r[5]==='Workshop'?'danger':'success',{dot:true})])),'w']);
// Vehicle drawer, open over the list.
const dr=A('V',{n:'Drawer · VEH006',bg:'bg/surface',w:440,h:900,sh:2});fr.appendChild(dr);dr.layoutPositioning='ABSOLUTE';dr.x=1000;dr.y=0;
const dh=A('V',{p:[18,20],gap:2,st:'border/default',sides:[0,0,1,0]});ad(dh,T('VEH006 · WP LK-3238',18,'b'),T('1 trip in today’s plan: depot, type and refrigeration are locked.',13,'r','text/secondary',{w:400}));ad(dr,[dh,'w']);
const df=A('V',{p:[18,20],gap:14});ad(dr,[df,'w']);
const g=A('H',{gap:12,wrap:14});ad(df,[g,'w']);
for(const [l,v] of [['Plate number','WP LK-3238'],['Depot','Peliyagoda DC'],['Volume capacity (m³)','33.4'],['Weekly fuel quota (L)','340']]){const f=field(l,v);f.resize(188,f.height);ad(g,f);}
ad(df,[field('Driver','Lasantha Gunawardena',{focus:true,trail:'chev',help:'The driver app opens on this vehicle for them. New drivers and licences are added by HR in Waypoint People.'}),'w']);
spacer(dr);const ft=A('H',{p:[14,20],gap:8,st:'border/default',sides:[1,0,0,0]});ad(ft,btn('Save changes'),btn('Cancel','secondary'));ad(dr,[ft,'w']);
out.d7=fr.id;
return out;
