"use strict";
(() => {
  const nutrients={"iron": "Iron", "vitaminD": "Vitamin D", "zinc": "Zinc", "VitaminA": "Vitamin A", "Thiamin": "Vitamin B1 (thiamin)", "Riboflavin": "Vitamin B2 (riboflavin)", "Niacin": "Vitamin B3 (niacin)", "PantothenicAcid": "Vitamin B5 (pantothenic acid)", "VitaminB6": "Vitamin B6", "Biotin": "Vitamin B7 (biotin)", "Folate": "Vitamin B9 (folate)", "VitaminB12": "Vitamin B12", "VitaminC": "Vitamin C", "VitaminE": "Vitamin E", "VitaminK": "Vitamin K", "Calcium": "Calcium", "Magnesium": "Magnesium", "Phosphorus": "Phosphorus", "Potassium": "Potassium", "Iodine": "Iodine", "Selenium": "Selenium", "Copper": "Copper", "Manganese": "Manganese", "Molybdenum": "Molybdenum", "Chromium": "Chromium", "Choline": "Choline", "Fluoride": "Fluoride", "Sodium": "Sodium", "Chloride": "Chloride", "Sulfur": "Sulfur"};
  const terms=globalThis.AlongsideLibrary?.mealTerms || [];
  const names=new Map();
  for(const term of terms){
    const word=term.toLowerCase();
    for(const alias of [word,word+'s',word.replace(/ies$/,'y'),word.replace(/oes$/,'o'),word.replace(/s$/,'')])names.set(alias,term);
  }
  for(const [alias,term] of Object.entries({eggs:'Egg',yoghurt:'Yogurt',toast:'Bread','chicken breast':'Chicken'}))names.set(alias,term);
  function parse(text){
    const parts=text.trim().toLowerCase().replace(/[.!?]+$/,'').split(/\s*(?:,|&|\band\b|\bwith\b)\s*/).filter(Boolean);
    const values=parts.map(p=>names.get(p.replace(/^(?:a |an |some )/,'')));
    return values.length && values.every(Boolean) ? [...new Set(values)] : null;
  }
  function request(text){
    return /^(?:(?:please |can you |could you )?(?:give me |suggest |recommend |i want |make me )?(?:a |an |some |any )?)(?:meal(?:s| ideas?)?|food ideas?|breakfast ideas?|lunch ideas?|dinner ideas?)(?:\s+(?:with|using|for)\s+.+)?[?!.]*$/i.test(text.trim());
  }
  globalThis.AlongsideMeals={nutrients,parse,request};
})();
