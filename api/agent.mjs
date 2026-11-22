import * as chatPrompt from './prompts/v13.mjs';
import library from '../shared/library.json' with { type: 'json' };

import { languagePacks } from '../shared/languages.mjs';

const support = {
  heard: 'I’m listening. You deserve space to talk about this.',
  hard: 'That sounds like a difficult moment. You don’t have to sort everything out at once.',
  thanks: 'Thank you for putting that into words. We can take this gently.',
  pace: 'We can slow down and choose one small next step together.',
  support: 'You deserve support, including on the days that feel complicated.',
  continue: 'I’m keeping what you shared in mind. Let’s build on that.',
  unsure: 'It’s okay not to have the right words yet. We can explore one thing at a time.',
  ready: 'We can make a little room for reflection, without judging the day.'
};
const questions = {
  support: 'What kind of support would feel most helpful right now?',
  moment: 'What part of this moment feels hardest to put into words?',
  before: 'What was happening just before this started to feel difficult?',
  trusted: 'Is there a trusted person you would feel comfortable reaching out to?',
  meals: 'How did your planned mealtimes fit into your day?',
  barrier: 'What got in the way, and what support might make the next step easier?',
  kind: 'What would a kind next step look like for you?',
  team: 'Is there a question you’d like to take to your care team?',
  routine: 'Which part of your routine would you like to talk through first?',
  choice: 'Would you rather talk a little more or open a practical support tool?',
  meaning: 'When you say that, what does it mean for you in this situation?',
  helped: 'Has anything helped you feel supported in a similar moment?',
  none: ''
};
const actions = ['none','checkin','routine','care','human'];
const information = ['none', ...Object.keys(library.medicalAnswers).filter(k => k !== 'plan')];
export const scenarios = {
  meal: 'Fictional scenario: Sam has just had a difficult mealtime and wants support.',
  routine: 'Fictional scenario: Sam has a busy day and wants help finding a regular routine.',
  support: 'Fictional scenario: Sam wants to ask a trusted person for support.'
};
export const starters = Object.freeze({
  after: 'What could help someone put a difficult mealtime into words?',
  team: 'How could someone ask a trusted person to sit with them at lunch?',
  checkin: 'How does a gentle meal check-in work?',
  routine: 'How can someone find their routine in Alongside?',
  arfid: 'What is ARFID?',
  assessment: 'Does one difficult meal tell someone whether they have an eating disorder?',
  note: 'Can you give one example sentence for someone who wanted lunch but found the texture hard?',
  shorter: 'Could you put that in one short sentence?'
});
const tool = {
  type:'function', name:'prepare_recovery_support', strict:true,
  description:'Choose a supportive response, a follow-up question, an approved library entry and an optional app action. The application retrieves reviewed facts and prepares the chosen action; it never changes a care plan automatically.',
  parameters:{type:'object',additionalProperties:false,properties:{
    acknowledgement:{type:'string',enum:Object.keys(support)},
    followup:{type:'string',enum:Object.keys(questions)},
    information:{type:'string',enum:information},
    action:{type:'string',enum:actions}
  },required:['acknowledgement','followup','information','action']}
};

const chatTool = {
  ...tool,
  name:'reply_to_visitor',
  description:'Answer the visitor in your own words or select a sourced health answer.',
  parameters:{type:'object',additionalProperties:false,properties:{
    reply:{type:'string',description:'The conversational answer itself, or empty for a server-rendered response.'},
    route:{type:'string',enum:['conversation','health','urgent','younger']},
    information:tool.parameters.properties.information,
    action:{type:'string',enum:[...actions,'meals']}
  },required:['reply','route','information','action']}
};

function renderChat(plan, language) {
  if (!plan || !['conversation','health','urgent','younger'].includes(plan.route) || !information.includes(plan.information) || ![...actions,'meals'].includes(plan.action)) throw Error('Invalid chat response');
  const localize = text => languagePacks[language]?.[text] || text;
  if (plan.route === 'urgent') return {text:localize('If you may be in immediate danger, contact local emergency services now. If you can, ask someone nearby to stay with you.'),sources:[],action:'human'};
  if (plan.route === 'younger') return {text:localize('You can keep using the library and check-ins on this device. A trusted adult can help you find more support.'),sources:[],action:'human',endLive:true};
  if (plan.route === 'health') {
    const entry = library.medicalAnswers[plan.information];
    const fallback = 'That question is outside the approved library. You can choose an information topic or bring it to your care team.';
    return {text:localize(entry?.text || fallback),sources:entry?.sources || [],action:plan.action};
  }
  if (typeof plan.reply !== 'string' || !plan.reply.trim() || plan.reply.length > 4000) throw Error('Invalid reply');
  return {text:plan.reply.trim(), sources:[], action:plan.action};
}

export function renderPlan(plan, language='en') {
  if(!plan || !Object.hasOwn(support,plan.acknowledgement) || !Object.hasOwn(questions,plan.followup) || !information.includes(plan.information) || !actions.includes(plan.action)) throw Error('Invalid model plan');
  const pack = Object.hasOwn(languagePacks, language) ? languagePacks[language] : null;
  const localize = value => pack?.[value] || value;
  const answer = library.medicalAnswers[plan.information];
  const parts = [support[plan.acknowledgement], answer?.text, questions[plan.followup]];
  const text = parts.filter(Boolean).map(localize).join('\n\n');
  const trace = [localize('Breeze selected support and a follow-up using the recent conversation.')];
  if (answer) trace.push(localize('Retrieved approved summary:') + ' ' + localize(answer.title));
  if (plan.action !== 'none') {
    const label = {checkin:'Check-in',routine:'My plan',care:'Find care',human:'Get human help'}[plan.action];
    trace.push(localize('Prepared an app action for you to open:') + ' ' + localize(label));
  }
  return {text,sources:answer?.sources||[],action:plan.action,trace,plan};
}

export async function runAgent(messages, env, language='en', requestFetch=fetch, mode='interactive', ageGroup='adult') {
  const responseTool = chatTool;
  const {buildInstructions, promptVersion} = chatPrompt;
  const topics=information.filter(id=>id!=='none').map(id=>({id,title:library.medicalAnswers[id].title}));
  const model=env.OPENAI_MODEL||'gpt-6-luna';
  const instructions = buildInstructions({topics, questions, support, language, mode, model, ageGroup});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  const started = Date.now();
  let outcome = 'network_error';
  let status = 0;
  try {
    const response=await requestFetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.OPENAI_API_KEY},body:JSON.stringify({model,store:false,instructions,input:messages.slice(-12).map(m=>({role:m.role,content:m.text.slice(0,6000)})),tools:[responseTool],tool_choice:{type:'function',name:responseTool.name},parallel_tool_calls:false,max_output_tokens:400,reasoning:{effort:'none'}}),signal:controller.signal});
    status = response.status;
    if (!response.ok) {
      outcome = ({401:'key_rejected',403:'access_denied',404:'model_unavailable',429:'quota_or_rate_limit'})[status] || 'provider_error';
      throw Error('AI provider unavailable');
    }
    outcome = 'invalid_reply';
    const result=await response.json();if(result.status!=='completed')throw Error('Incomplete model response');
    const calls=(result.output||[]).filter(o=>o.type==='function_call');
    if(calls.length!==1 || calls[0].name!==responseTool.name)throw Error('Missing support plan');
    const reply = renderChat(JSON.parse(calls[0].arguments),language);
    outcome = 'verified_reply';
    return {...reply, promptVersion};
  } catch (error) {
    if (controller.signal.aborted) outcome = 'timeout';
    throw Object.assign(new Error('Breeze could not respond. Please try again later.'), {status:502, diagnostic:outcome});
  } finally {
    clearTimeout(timeout);
    console.info(JSON.stringify({event:'alongside.chat', promptVersion, outcome, providerStatus:status, durationMs:Date.now()-started}));
  }
}
