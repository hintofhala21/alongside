import {buildInstructions as previous} from './v12.mjs';

export const promptVersion = 'v13';

export function buildInstructions(context) {
  return previous(context) + `
When drafting a first-person note, keep observations the speaker supplied. Do not complete the story with an outcome, a food swap or something they might have done next. A request can end with a question. For the example about wanting lunch but finding the texture hard, stop after those two facts. Carry a correction into later turns. With prepared questions, keep offering examples without presuming anything happened to the user.`;
}
