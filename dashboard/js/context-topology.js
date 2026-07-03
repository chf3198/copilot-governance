// Context Topology — world-class redesign #378
const CF_TYPE_STYLE = {
  HW:    {rx:4,  sw:2,   stroke:'#6B7280', fill:'#1f2937'},
  SW:    {rx:8,  sw:1.5, stroke:'#3B82F6', fill:'#0d1e3d'},
  LLM:   {rx:10, sw:1.5, stroke:'#10B981', fill:'#052e22'},
  SVC:   {rx:6,  sw:1.5, stroke:'#F59E0B', fill:'#1e1507'},
  STORE: {rx:4,  sw:1,   stroke:'#4B5563', fill:'#111827'},
};
const CF_TYPE_LBL = {HW:'HW', SW:'SW', LLM:'LLM', SVC:'SVC', STORE:'DB'};
const FLOW_TYPE = {
  internal: {color:'#4B5563',head:'cfHd', dash:false,dur:0,     op:0.5, sw:1.5,cls:''},
  hosts:    {color:'#4B5563',head:'cfHd', dash:true, dur:0,     op:0.35,sw:1.5,cls:''},
  cloud:    {color:'#3B82F6',head:'cfHdB',dash:false,dur:'2s',  op:0.9, sw:2,  cls:'cf-cloud-path'},
  local:    {color:'#F59E0B',head:'cfHdY',dash:true, dur:'3s',  op:0.9, sw:2,  cls:''},
  inference:{color:'#10B981',head:'cfHdG',dash:false,dur:'1.8s',op:0.9, sw:2,  cls:'cf-infer-path'},
  github:   {color:'#8B5CF6',head:'cfHdP',dash:false,dur:'3.5s',op:0.8, sw:2,  cls:''},
};
function cfDefs() {
  const mk=(id,c)=>`<marker id="${id}" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><polygon points="0 0,7 2.5,0 5" fill="${c}"/></marker>`;
  const glow=(id,s)=>`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  return mk('cfHd','#4B5563')+mk('cfHdB','#3B82F6')+mk('cfHdY','#F59E0B')+mk('cfHdG','#10B981')+mk('cfHdP','#8B5CF6')
    +glow('cfGlowB','4')+glow('cfGlowG','3')
    +`<style>.cf-zone{stroke-width:2;stroke-dasharray:6,3}
.cf-zl{stroke:#3B82F6;fill:rgba(59,130,246,0.15)}.cf-zt{stroke:#8B5CF6;fill:rgba(139,92,246,0.12)}
.cf-zc{stroke:#F59E0B;fill:rgba(245,158,11,0.12)}.cf-sg{stroke:#4B5563;stroke-width:1.5;stroke-dasharray:4,2;fill:rgba(75,85,99,0.1)}
.cf-oc{stroke:#F59E0B;stroke-width:1.5;stroke-dasharray:4,2;fill:rgba(245,158,11,0.1)}
.cf-zlbl{font-size:11px;font-weight:700;pointer-events:none;paint-order:stroke;stroke:#0d1117;stroke-width:3px}
.cf-zlbl-l{fill:#3B82F6}.cf-zlbl-t{fill:#8B5CF6}.cf-zlbl-c{fill:#F59E0B}
.cf-sglbl{font-size:9px;font-weight:600;fill:#9CA3AF;pointer-events:none;paint-order:stroke;stroke:#0d1117;stroke-width:2px}
.cf-nm{font-size:13px;fill:#E6EDF3;font-weight:700;pointer-events:none}
.cf-sb{font-size:10px;fill:#A3AEBF;pointer-events:none}
.cf-tb{font-size:8px;font-weight:800;pointer-events:none}
.cf-lbl2{font-size:9px;fill:#9CA3AF;font-style:italic}.cf-lbl2-bg{fill:#0d1117}
.cf-cloud-path{filter:url(#cfGlowB)}.cf-infer-path{filter:url(#cfGlowG)}
.cf-ng{cursor:pointer}.cf-ng:hover rect{filter:brightness(1.5);transition:filter 0.15s}
@keyframes cfpulse{0%,100%{opacity:.3}50%{opacity:1}}
circle.cfp{animation:cfpulse 1.4s ease-in-out 4;animation-fill-mode:forwards}
.cfpkt{filter:drop-shadow(0 0 4px currentColor)}</style>`;
}
function cfZoneRects(zones) {
  return zones.map(z=>`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="8" class="cf-zone cf-z${z.k}"/>`).join('');
}
function cfZoneLabels(zones) {
  return zones.map(z=>`<text x="${z.x+6}" y="${z.y-4}" class="cf-zlbl cf-zlbl-${z.k}">${z.label}</text>`).join('');
}
function cfSubRects(groups) {
  return (groups||[]).map(g=>`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="6" class="${g.cls||'cf-sg'}"/>`).join('');
}
function cfSubLabels(groups) {
  return (groups||[]).map(g=>`<text x="${g.x+6}" y="${g.y+13}" class="cf-sglbl">${g.label}</text>`).join('');
}
function cfZones(z){return cfZoneRects(z)+cfZoneLabels(z);}
function cfSubGroups(g){return cfSubRects(g)+cfSubLabels(g);}
function cfNodes(nodes, liveMap) {
  const sc={healthy:'#22C55E',online:'#22C55E',degraded:'#EAB308',offline:'#EF4444',unknown:'#6B7280'};
  const NW=88,NH=50;
  return nodes.map(n=>{
    const st=(liveMap||{})[n.label]||'unknown';
    const ts=CF_TYPE_STYLE[n.type]||CF_TYPE_STYLE.SW;
    const sd=n.type==='STORE'?'stroke-dasharray="3,2"':'';
    const hp=st==='healthy'||st==='online'?' class="cfp"':'';
    return `<g class="cf-ng" onclick="this.parentNode.appendChild(this)"><title>${n.tip}</title>
    <rect x="${n.x-NW/2}" y="${n.y-NH/2}" width="${NW}" height="${NH}" rx="${ts.rx}" ${sd} fill="${ts.fill}" stroke="${ts.stroke}" stroke-width="${ts.sw}"/>
    <circle cx="${n.x+NW/2-8}" cy="${n.y-NH/2+9}" r="5" fill="${sc[st]||sc.unknown}"${hp}/>
    <text x="${n.x-NW/2+6}" y="${n.y-NH/2+12}" fill="${ts.stroke}" class="cf-tb">${CF_TYPE_LBL[n.type]||''}</text>
    <text x="${n.x}" y="${n.y}" text-anchor="middle" style="font-size:14px;pointer-events:none">${n.icon}</text>
    <text x="${n.x}" y="${n.y+13}" text-anchor="middle" class="cf-nm">${n.label}</text>
    <text x="${n.x}" y="${n.y+23}" text-anchor="middle" class="cf-sb">${n.sub}</text></g>`;
  }).join('');
}
/**
 * Render SVG arrow paths and animated packets between Context Flow nodes.
 * @param {Array} nodes - topology nodes with x,y coordinates
 * @param {Array} arrows - arrow definitions with from, to, type, label
 * @param {boolean} isActive - whether active baton tickets exist (enables animations)
 * @returns {string} SVG path and group elements
 */
function cfArrows(nodes,arrows,isActive){
  return arrows.map((a,i)=>{
    const f=nodes[a.from],t=nodes[a.to];
    const ft=FLOW_TYPE[a.type||'internal'];
    const dx=(t.x-f.x)*0.45;
    const d=ft.cls==='cf-cloud-path'
      ?`M${f.x},${f.y} C${f.x},26 ${t.x},26 ${t.x},${t.y}`
      :a.curve?`M${f.x},${f.y} C${f.x+dx},${f.y} ${t.x-dx},${t.y} ${t.x},${t.y}`:`M${f.x},${f.y} L${t.x},${t.y}`;
    const dk=ft.dash?'stroke-dasharray="6,3"':'';
    const pid=`cfp${i}`;
    const mx=(f.x+t.x)/2, my=a.curve?Math.min(f.y,t.y)-72:(f.y+t.y)/2-6;
    const pkt=(isActive&&ft.dur)?`<circle r="3" fill="${ft.color}" class="cfpkt" opacity="0.95"><animateMotion dur="${ft.dur}" repeatCount="3"><mpath href="#${pid}"/></animateMotion></circle>`:'';
    const gp=ft.cls==='cf-cloud-path'
      ?`<path d="${d}" fill="none" stroke="#3B82F6" stroke-width="8" opacity="0.25"/>`
      :ft.cls==='cf-infer-path'?`<path d="${d}" fill="none" stroke="#065F46" stroke-width="6" opacity="0.4"/>` :'';
    return `${gp}<path id="${pid}" d="${d}" fill="none" stroke="${ft.color}" stroke-width="${ft.sw}" ${dk} opacity="${ft.op}" marker-end="url(#${ft.head})"><title>${a.tip||''}</title></path>${pkt}
    ${a.label?`<rect x="${mx-20}" y="${my-8}" width="40" height="13" rx="3" fill="#0d1117" opacity="0.75"/><text x="${mx}" y="${my+3}" text-anchor="middle" class="cf-lbl2">${a.label}</text>`:''}`;
  }).join('');
}
