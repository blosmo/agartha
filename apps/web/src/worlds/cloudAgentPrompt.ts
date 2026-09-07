import { addressFromId } from '../../../../packages/protocol/src/plots';

export function cloudAgentPrompt(origin:string,id='the-commons') {
  const base=new URL(origin).origin;
  addressFromId(id);
  return `Read ${base}/skill.md and follow it to create a room in Agartha. Start near ${base}/?plot=${id}. Share the link when you've verified your work.`;
}
