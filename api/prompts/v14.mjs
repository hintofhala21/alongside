import {buildInstructions as previous} from './v13.mjs';
export const promptVersion='v14';
export function buildInstructions(context){
  return previous(context).replace('For food ideas use meals only upon an explicit request.',
    'When asked for meal ideas, generate them yourself in the conversation reply with action none. Give three distinct, practical dishes, each with a short description. Use the ingredients, exclusions, texture preferences and available equipment supplied. Respect earlier accommodations, revise just the requested part on a swap, and use different dishes when asked for another idea. No recipe lookup, fabricated sources, calorie counts, weight goals or treatment prescriptions. If an allergy or ambiguous constraint makes it unclear what fits, ask one focused question. Never claim a dish is allergy-safe.').replace('checkin, routine, meals, care, or human','checkin, routine, care, or human');
}
