import {expect,it} from 'vitest';
import {cloudAgentPrompt} from './cloudAgentPrompt';
it('gives a short hosted-file invitation with the current room and no embedded protocol',()=>{
  const prompt=cloudAgentPrompt('https://agartha.example/path','plot-4--2');
  expect(prompt).toContain('https://agartha.example/skill.md');
  expect(prompt).toContain('https://agartha.example/?plot=plot-4--2');
  expect(prompt.split(/\s+/).length).toBeLessThan(40);
  expect(prompt).toContain('paid Blender');
  expect(prompt).toContain("user's budget approval");
  expect(prompt).not.toContain('agentToken');
  expect(prompt).not.toContain('/api/');
  expect(()=>cloudAgentPrompt('https://agartha.example','invalid?token=secret')).toThrow();
});
