import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('Breeze checks a real tool result before review and writes only the selected time',async()=>{
  const app=await readFile(new URL('../site/assets/app.js',import.meta.url),'utf8');
  const api=await readFile(new URL('../site/assets/apple-calendar.js',import.meta.url),'utf8');
  class Field {
    children=[];value='';hidden=false;
    append(...items){this.children.push(...items);}
    add(item){this.append(item);}
    replaceChildren(...items){this.children=items;}
    setAttribute(){} focus(){} closest(){return this;}
  }
  const panel=new Field(),day='2090-01-10';
  const utc=(day,time)=>new Date(day+'T'+time+':00Z');
  const block={start:+utc(day,'08:00'),end:+utc(day,'09:00')};
  const context=vm.createContext({location:{origin:'http://127.0.0.1:4175'},byId:()=>panel,element:(tag,text)=>Object.assign(new Field(),{tag,text}),Option:class{},profile:{id:'local'},hasAgeGroup:()=>true,weekDates:()=>[day],schedule:()=>[{name:'Breakfast',kind:'meals',time:'08:00',id:'breakfast'}],zone:()=>'UTC',zonedToUtc:utc,formatTime:x=>x,interfaceLocale:()=>'en',record:()=>({})});
  vm.runInContext(api,context);
  let reads=0;const saves=[];
  context.AlongsideAppleCalendar.readMacBusy=async()=>{reads++;return [block];};
  context.AlongsideAppleCalendar.addMeal=async(name,start)=>{saves.push([name,+start]);return true;};
  vm.runInContext(app.slice(app.indexOf('let calendarReview'),app.indexOf('function checkinAt')),context);
  context.location.origin='https://example.test';
  context.openWeek=()=>{};
  await context.calendarTools();
  assert.equal(reads,0);assert.equal(panel.children.find(n=>n.tag==='a').href,'./apple-calendar.html');
  context.location.origin='http://127.0.0.1:4175';
  await context.calendarTools();
  const select=panel.children.find(n=>n.tag==='fieldset').children[1].children.find(n=>n.tag==='select');
  const save=panel.children.find(n=>n.text==='Save to Mac Calendar');
  assert.equal(save.disabled,true);assert.equal(reads,1);assert.equal(saves.length,0);
  select.value='07:30';select.onchange();await save.onclick();
  assert.equal(reads,2);assert.deepEqual(saves,[['Breakfast',+utc(day,'07:30')]]);
});
