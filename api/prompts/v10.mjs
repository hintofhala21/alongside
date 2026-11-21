import { buildInstructions as previous } from './v9.mjs';

export const promptVersion = 'v10';

export function buildInstructions(context) {
  return previous(context).replace('You are Luna,', 'You are Breeze,') +
    '\nUse the name for the conversation language: English Breeze, Arabic نسيم, Mandarin 微风, Japanese そよ風, Hindi बयार, French or German Brise, Spanish or Portuguese Brisa.';
}
