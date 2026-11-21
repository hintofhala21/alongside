"use strict";
(() => {
  const choices = {
    iron: {source:'ironNutrition',foods:['Lentils','Rice','Sweet peppers','Beans','Potatoes']},
    vitaminD: {source:'vitaminDNutrition',foods:['Salmon','Potatoes','Vitamin D-fortified plant drink','Fortified cereal','Rice']},
    zinc: {source:'zincNutrition',foods:['Beans','Bread','Egg','Rice','Lentils']}
  };
  const sourcesOf = {iron:['Lentils','Beans'], vitaminD:['Salmon','Vitamin D-fortified plant drink'], zinc:['Beans','Egg','Lentils']};
  const nutrients={iron:'Iron',vitaminD:'Vitamin D',zinc:'Zinc'};
  const dishes=[
    {foods:['Lentils','Rice','Sweet peppers'],name:'Lentils and rice with sweet peppers'},
    {foods:['Beans','Potatoes'],name:'Baked potato with beans'},
    {foods:['Salmon','Potatoes'],name:'Baked salmon with potatoes'},
    {foods:['Vitamin D-fortified plant drink','Fortified cereal'],name:'Cereal with a vitamin D-fortified plant drink'},
    {foods:['Beans','Rice'],name:'Rice with warm beans'},
    {foods:['Egg','Bread'],name:'Egg on toast'}
  ];
  dishes.push(
    {foods:['Spinach','Egg','Bread'],name:'Spinach and egg on toast'},
    {foods:['Broccoli','Rice'],name:'Rice with broccoli'},
    {foods:['Yogurt','Oats'],name:'Oats with yogurt'},
    {foods:['Sweet potatoes','Beans'],name:'Sweet potato with beans'},
    {foods:['Chickpeas','Rice'],name:'Rice with chickpeas'},
    {foods:['Whole-grain bread','Egg'],name:'Egg on whole-grain toast'},
    {foods:['Salmon','Rice'],name:'Salmon with rice'}
  );
  // Each row names the NIH fact sheet and the foods it supports. Other ingredients are pairings.
  const catalog=[
    ['Vitamin A','VitaminA','Spinach','Sweet potatoes','Egg'],
    ['Vitamin B1 (thiamin)','Thiamin','Whole-grain bread','Beans'],
    ['Vitamin B2 (riboflavin)','Riboflavin','Egg','Spinach'],
    ['Vitamin B3 (niacin)','Niacin','Salmon','Whole-grain bread'],
    ['Vitamin B5 (pantothenic acid)','PantothenicAcid','Egg','Broccoli'],
    ['Vitamin B6','VitaminB6','Chickpeas','Salmon'],
    ['Vitamin B7 (biotin)','Biotin','Egg','Sweet potatoes'],
    ['Vitamin B9 (folate)','Folate','Spinach','Beans'],
    ['Vitamin B12','VitaminB12','Egg','Salmon','Yogurt'],
    ['Vitamin C','VitaminC','Sweet peppers','Broccoli'],
    ['Vitamin E','VitaminE','Spinach','Broccoli'],
    ['Vitamin K','VitaminK','Spinach','Broccoli'],
    ['Calcium','Calcium','Yogurt','Broccoli'],
    ['Magnesium','Magnesium','Spinach','Beans'],
    ['Phosphorus','Phosphorus','Egg','Yogurt'],
    ['Potassium','Potassium','Potatoes','Lentils'],
    ['Iodine','Iodine','Egg','Yogurt'],
    ['Selenium','Selenium','Egg','Salmon'],
    ['Copper','Copper','Chickpeas','Potatoes'],
    ['Manganese','Manganese','Whole-grain bread','Oats'],
    ['Molybdenum','Molybdenum','Beans','Lentils'],
    ['Chromium','Chromium','Whole-grain bread'],
    ['Choline','Choline','Egg','Salmon'],
    ['Fluoride','Fluoride'],['Sodium',''],['Chloride',''],['Sulfur','']
  ];
  for(const [name,slug,...foods] of catalog){
    const key=slug || name;
    nutrients[key]=name;sourcesOf[key]=foods;
    const pairs=dishes.filter(d=>d.foods.some(f=>foods.includes(f))).flatMap(d=>d.foods);
    choices[key]={foods:[...new Set([...foods,...pairs])],url:slug?'https://ods.od.nih.gov/factsheets/'+slug+'-Consumer/':null};
  }
  function request(message) {
    const q=message.trim().toLowerCase().replace(/[?!.]+$/,'');
    // Match a direct invitation only. Mixed, declined or safety-sensitive requests use normal chat.
    const match=q.match(/^(?:(?:please |can you |could you |can i |could i )?(?:suggest|recommend|give me|share|have|get|offer)(?: me)? (?:some |a |an |any )?|any |some )?(meal ideas?|meal options?|meals?|lunch ideas?|dinner ideas?|breakfast ideas?|food ideas?)(?: (?:for|with) (.+))?$/);
    if(!match || (!match[2] && /^(meal|meals|lunch|dinner)$/.test(q)))return false;
    if(!match[2])return true;
    const topic=match[2].replace(/^low /,'');
    return ['my profile','my recovery','my eating disorder','arfid',...Object.values(nutrients).map(n=>n.toLowerCase().split(' (')[0])].includes(topic);
  }
  function open(host,options,message='') {
    host.replaceChildren();host.hidden=false;
    const tr=options.translateText;
    const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=tr(text);return n;};
    const profile=options.mealProfile?.()||{};
    const findTopic=value=>Object.keys(nutrients).sort((a,b)=>nutrients[b].length-nutrients[a].length).find(k=>[nutrients[k],tr(nutrients[k])].some(name=>value.toLowerCase().includes(name.toLowerCase().split(' (')[0])));
    const customTopic=value=>Object.keys(nutrients).find(k=>[nutrients[k],tr(nutrients[k]),nutrients[k].split(' (')[0]].some(n=>n.toLowerCase()===value.trim().toLowerCase()));
    const explicit=findTopic(message);
    const select=el('select'),label=el('label','Nutrient topic');label.className='field';label.append(select);
    const topics=['general',...Object.keys(choices),'other'];
    for(const key of topics){const item=el('option',nutrients[key]||(key==='other'?'Write your own':'Any meal idea'));item.value=key;select.append(item);}
    select.value=explicit || profile.needs?.find(k=>Object.hasOwn(choices,k)) || (profile.otherNeeds?'other':'general');
    const custom=el('label','Write your own');custom.className='field';
    const term=el('input');term.maxLength=120;term.value=profile.otherNeeds||'';custom.append(term);
    const foods=el('fieldset'),status=el('p');status.setAttribute('role','status');
    const results=el('div');results.setAttribute('aria-live','polite');
    function reset() {
      results.replaceChildren();status.textContent='';foods.replaceChildren(el('legend','Choose ingredients that work for you'));
      custom.hidden=select.value!=='other';
      const choice=select.value==='other'?choices[customTopic(term.value)]:choices[select.value];
      foods.hidden=select.value!=='general' && !choice?.foods.length;
      const available=choice?.foods || [...new Set(Object.values(choices).flatMap(v=>v.foods))];
      for(const name of available){const l=el('label'),check=el('input');check.type='checkbox';check.value=name;l.append(check,document.createTextNode(' '+tr(name)));foods.append(l,document.createTextNode(' '));}
    }
    term.oninput=reset;select.onchange=reset;foods.onchange=()=>{results.replaceChildren();status.textContent='';};reset();
    const show=el('button','Show a meal idea');show.className='action';show.type='button';
    show.onclick=()=>{
      const selected=[...foods.querySelectorAll('input:checked')].map(i=>i.value);
      const key=select.value==='other'?customTopic(term.value):select.value;results.replaceChildren();
      if(key!=='general' && !choices[key]?.foods.length){status.textContent=tr('Breeze has no reviewed meal idea for this topic yet. You can discuss it with your care team.');return;}
      const pool=choices[key]?.foods || [...new Set(dishes.flatMap(dish=>dish.foods))];
      const allowed=selected.length?selected:profile.allergies?[]:pool;
      const recipes=dishes.filter(dish=>dish.foods.every(f=>allowed.includes(f)) && (!choices[key]||dish.foods.some(f=>sourcesOf[key].includes(f))));
      if(!recipes.length && selected.length<2){status.textContent=tr('Choose ingredients you would like to pair.');return;}
      if(!recipes.length && choices[key]&&!selected.some(f=>sourcesOf[key].includes(f))){
        status.textContent=tr('For this nutrient, one option is')+' '+sourcesOf[key].map(tr).join(' / ')+'.';return;
      }
      status.textContent='';
      const format=new Intl.ListFormat(options.getLanguage(),{type:'conjunction',style:'long'});
      if(recipes.length){const list=el('ul');for(const dish of recipes.slice(0,2))list.append(el('li',dish.name));results.append(list);}
      else results.append(el('strong','One meal you could try'),document.createTextNode(' '+format.format(selected.map(tr))+'.'));
      if(['anorexia','bulimia','binge','osfed','ufed','rumination','pica','routine'].includes(profile.diagnosis))results.append(el('p','If you have a recovery routine, choose what fits the meal already in your plan.'));
      if(profile.diagnosis==='arfid')results.append(el('p','You can keep the foods separate or use a texture you already enjoy.'));
      const source=choices[key]?.url?{organization:'NIH Office of Dietary Supplements',url:choices[key].url}:options.sources[choices[key]?.source];
      if(source && choices[key]){const a=el('a',source.organization);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';results.append(el('br'),a);}
    };
    const close=el('button','Close');close.type='button';close.className='action outline';close.onclick=()=>{host.replaceChildren();host.hidden=true;options.onClose?.();};
    const body=el('section');body.className='panel stack';body.append(el('h3','Meal ideas'),el('p','Choose foods that suit your allergies, preferences and care plan. You can skip any idea.'));
    if(profile.allergies)body.append(el('p','Your profile includes an allergy. Check every ingredient and product label before choosing.'));
    body.append(label,custom,foods,show,status,results,close);host.append(body);select.focus();
  }
  globalThis.AlongsideMeals={open,request,nutrients};
})();
