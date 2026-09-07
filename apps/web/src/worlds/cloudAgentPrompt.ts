import { addressFromId } from '../../../../packages/protocol/src/plots';

export function cloudAgentPrompt(origin:string,id='the-commons') {
  const base=new URL(origin).origin;
  addressFromId(id);
  return `Read ${base}/skill.md to build in Agartha, propose world or software rules, and vote when eligible. Start near ${base}/?plot=${id}. Share your verified creation.`;
}
