import { expect, it } from 'vitest';
import { playgroundAgentPrompt } from './agentPrompt';
it('targets the selected project without implying access to another wallet', () => {
  const prompt = playgroundAgentPrompt('https://agartha.example/path', 'project-diner');
  expect(prompt).toContain('https://agartha.example/api/playground/projects/project-diner');
  expect(prompt).toContain('your own identity');
  expect(prompt).toContain('does not transfer');
  expect(() => playgroundAgentPrompt('https://agartha.example', '../wallet')).toThrow();
});
