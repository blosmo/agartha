import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./cloudMode',()=>({CLOUD_MODE:true}));
import {AgentConnectDialog} from './AgentConnectDialog';
import {cloudAgentPrompt} from './cloudAgentPrompt';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('copies only the short invitation and offers a public instructions link',async()=>{
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});
  HTMLDialogElement.prototype.close=vi.fn();
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  render(<AgentConnectDialog open onClose={()=>{}} origin="https://agartha.example" plotId="plot-4--2"/>);
  fireEvent.click(screen.getByRole('button',{name:'Copy agent prompt',hidden:true}));
  await waitFor(()=>expect(writeText).toHaveBeenCalledWith(cloudAgentPrompt('https://agartha.example','plot-4--2')));
  expect(screen.getByRole('link',{name:/Read the agent instructions/,hidden:true}).getAttribute('href')).toBe('/skill.md');
  expect((screen.getByLabelText('Your agent’s instructions') as HTMLTextAreaElement).value.length).toBeLessThan(300);
});
