#!/usr/bin/env node
// D-1133-06: recurring_failure_rate sensor for Goal Health Score — Epic #1133
'use strict';
const fs=require('fs'),path=require('path');

const INCIDENTS_FILE=path.join(process.env.HOME,'.megingjord','incidents.jsonl');
const WINDOW_MS=7*24*60*60*1000; // 7 days
const OUT_FILE=path.join(__dirname,'../..','generated','anneal-sensor.json');

function loadRecent(){
  if(!fs.existsSync(INCIDENTS_FILE))return[];
  const cutoff=Date.now()-WINDOW_MS;
  return fs.readFileSync(INCIDENTS_FILE,'utf8')
    .split('\n').filter(l=>l)
    .map(l=>{try{return JSON.parse(l);}catch(e){return null;}})
    .filter(i=>i&&new Date(i.timestamp).getTime()>cutoff);
}

function computeScore(incidents){
  if(incidents.length===0)return 1.0;
  const resolved=incidents.filter(i=>i.status==='resolved'||i.status==='suppressed');
  // Score = fraction resolved; invert for failure rate
  const failureRate=1-(resolved.length/incidents.length);
  return Math.max(0,Math.round((1-failureRate)*100)/100);
}

function main(){
  const incidents=loadRecent();
  const score=computeScore(incidents);
  const total=incidents.length;
  const resolved=incidents.filter(i=>i.status==='resolved'||i.status==='suppressed').length;
  const result={
    sensor:'recurring_failure_rate',
    goal:'G2',
    score,
    window_days:7,
    total_incidents:total,
    resolved_incidents:resolved,
    open_incidents:total-resolved,
    generated_utc:new Date().toISOString(),
    source:'logs/anneal-incidents.jsonl'
  };
  const dir=path.dirname(OUT_FILE);
  if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(OUT_FILE,JSON.stringify(result,null,2)+'\n');
  console.log(`recurring_failure_rate: ${score} (${total} incidents, ${resolved} resolved)`);
  if(score<0.5){console.warn('⚠️  Score below 0.5 — quality goal at risk');process.exit(1);}
}

main();
