const fs=require('fs'),path=require('path');const HOME=process.env.HOME;
const INCIDENTS_FILE=path.join(HOME,'.megingjord','incidents.jsonl');
const DIR=path.dirname(INCIDENTS_FILE);const MAX_SIZE_MB=10;const MAX_AGE_DAYS=30;

function ensureDir(){if(!fs.existsSync(DIR))fs.mkdirSync(DIR,{recursive:true});}

function loadIndex(){const idx={},MAX_AGE=MAX_AGE_DAYS*864e5;
  if(!fs.existsSync(INCIDENTS_FILE))return idx;
  const lines=fs.readFileSync(INCIDENTS_FILE,'utf8').split('\n').filter(l=>l);
  for(const line of lines){try{const i=JSON.parse(line);const age=Date.now()-new Date(i.timestamp).getTime();
    if(age<MAX_AGE){if(!idx[i.pattern_id])idx[i.pattern_id]=[];idx[i.pattern_id].push(i.timestamp);}}catch(e){}}
  return idx;}

function isNotified(pattern_id,idx,WINDOW_MS){const events=idx[pattern_id]||[];
  for(const ts of events)if(Date.now()-new Date(ts).getTime()<WINDOW_MS)return true;return false;}

function append(record){ensureDir();const json=JSON.stringify(record);
  try{fs.appendFileSync(INCIDENTS_FILE,json+'\n');}catch(e){console.error(`Append fail: ${e.message}`);}}

function rotate(){ensureDir();try{const stat=fs.statSync(INCIDENTS_FILE);
    const sizeMB=stat.size/(1024*1024);const ageDays=(Date.now()-stat.mtimeMs)/(864e5);
    if(sizeMB>MAX_SIZE_MB||ageDays>MAX_AGE_DAYS){
      const now=new Date(),yyyymmdd=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const archive=`${INCIDENTS_FILE}.${yyyymmdd}`;fs.copyFileSync(INCIDENTS_FILE,archive);
      fs.writeFileSync(INCIDENTS_FILE,'');
      const archives=fs.readdirSync(DIR).filter(f=>f.startsWith(path.basename(INCIDENTS_FILE)+'.'));
      if(archives.length>3){archives.sort().slice(0,-3).forEach(f=>{fs.unlinkSync(path.join(DIR,f));});}}
  }catch(e){}}

module.exports={ensureDir,loadIndex,isNotified,append,rotate,INCIDENTS_FILE};
