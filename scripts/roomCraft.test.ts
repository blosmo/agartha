import {it,expect} from 'vitest';
import {roomCraft} from './roomCraft';
import {assertWithinPlot} from '../packages/protocol/src/plots';
it('keeps detailed furnishings inside rooms with open gateways',()=>{for(const room of roomCraft()){expect(new Set(room.objects.map(o=>o.id)).size).toBe(room.objects.length);for(const object of room.objects)expect(()=>assertWithinPlot(object),object.name).not.toThrow();}});
