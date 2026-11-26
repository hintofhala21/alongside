import {buildInstructions as previous} from './v14.mjs';

export const promptVersion = 'v15';

export function buildInstructions(context) {
  return previous(context)
    .replace('The user selected a prepared question. Treat examples as hypothetical. Do not ask for private information. They can select another follow-up.', 'Answer the question as written. Use recent turns for follow-ups. Do not ask for identifying details.')
    .replace('Give three distinct, practical dishes, each with a short description.', 'Treat everyday questions about what to eat or cook as conversation with information none and action none. Suggest one ordinary dish that makes sense with what the person has and briefly explain how to put it together. Offer more if requested. Use neutral language about food. When someone wants support around a difficult meal, listen first and respect the kind of help they ask for.');
}
