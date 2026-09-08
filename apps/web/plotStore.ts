import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { addressFromId, DIRECTIONS, neighborAddress, PLOT_SIZE, plotId, validateAddress, type PlotAddress } from '../../packages/protocol/src/plots';
import { generateBuild } from '../../packages/protocol/src/worldbuilding';
import { applyWorldEdit, createWorld, WorldError, type SharedWorld, type WorldEdit } from './src/worlds/world';
import type { PlotNeighbor, PlotNeighborhood } from './src/worlds/plotTypes';

export class PlotStore {
  private queues = new Map<string, Promise<unknown>>();
  private boot?: Promise<void>;
  constructor(private originFile: string,private validateScene?: (next:SharedWorld,previous:SharedWorld)=>Promise<void>, private installStarters?: () => Promise<SharedWorld[]>) {}
  private file(id: string) { addressFromId(id); return id === 'the-commons' ? this.originFile : join(dirname(this.originFile), 'plots', `${id}.json`); }
  private async read(id: string): Promise<SharedWorld | undefined> {
    try {
      const world = JSON.parse(await readFile(this.file(id), 'utf8')) as SharedWorld;
      if (world.schema !== 1 || world.id !== id || !Array.isArray(world.objects) || !Number.isSafeInteger(world.revision)) throw new Error('Unsupported plot file');
      return { ...world, placement: { ...addressFromId(id), size: PLOT_SIZE } };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  private async save(world: SharedWorld) {
    const file = this.file(world.id);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(world));
    await rename(`${file}.tmp`, file);
  }
  private serial<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    this.queues.set(id, current);
    void current.finally(() => { if (this.queues.get(id) === current) this.queues.delete(id); }).catch(() => {});
    return current;
  }
  private ready() {
    this.boot ??= this.seed().catch(error => { this.boot = undefined; throw error; });
    return this.boot;
  }
  private async seed() {
    if (this.installStarters) {
      const worlds = await this.installStarters();
      // Validate every candidate before creating any world file.
      for (const world of worlds) await this.validateScene?.(world, { ...world, objects: [] });
      for (const world of worlds) {
        const file = this.file(world.id);
        await mkdir(dirname(file), { recursive: true });
        try { await writeFile(file, JSON.stringify(world), { flag: 'wx' }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      }
      return;
    }

    const starters = [
      { x: 0, z: -1, name: 'Fern Hollow', tool: 'grove', palette: 'woodland' },
      { x: 1, z: 0, name: 'Sky Workshop', tool: 'pavilion', palette: 'moonlight' },
      { x: 0, z: 1, name: 'Ochre Court', tool: 'landmark', palette: 'sandstone' },
      { x: -1, z: 0, name: 'Rolling Meadow', tool: 'terrain', palette: 'woodland' },
      { x: -1, z: -1, name: 'A Quiet Beginning' },
      { x: 1, z: -1, name: 'The Next Chapter' },
      { x: -1, z: 1, name: 'Open Ground' },
      { x: 1, z: 1, name: 'Common Future' },
    ];
    if (!await this.read('the-commons')) await this.save({ ...createWorld(), placement: { x: 0, z: 0, size: PLOT_SIZE } });
    for (const starter of starters) {
      const id = plotId(starter);
      if (await this.read(id)) continue;
      const world = this.blank(starter, starter.name, 'World seed');
      if (starter.tool) {
        const build = generateBuild({ tool: starter.tool, palette: starter.palette, size: 5, seed: 17 }, `${id}-seed`);
        world.objects = build.objects.map(object => ({ ...object, author: 'World seed' }));
      }
      await this.save(world);
    }
  }
  private blank(address: PlotAddress, name: string, author: string): SharedWorld {
    return { schema: 1, id: plotId(address), name, brief: `Create a distinct place in ${name}. Build within this plot and leave its gateways open to neighboring worlds.`, placement: { ...address, size: PLOT_SIZE }, revision: 0, objects: [], events: [{ revision: 0, author, message: 'Opened a plot in the shared grid.', at: new Date().toISOString() }] };
  }
  async get(id: string) {
    await this.ready();
    return this.serial(id, async () => { const world = await this.read(id); if (!world) throw new WorldError('This plot has not been started yet.', 404); return world; });
  }
  async edit(id: string, input: unknown) {
    await this.ready();
    return this.serial(id, async () => {
      const world = await this.read(id); if (!world) throw new WorldError('Plot not found', 404);
      const next = applyWorldEdit(world, input);await this.validateScene?.(next,world); await this.save(next); return next;
    });
  }
  async build(id: string, input: { parameters: unknown; requestId: string; baseRevision: number; author: string; preview?: boolean }) {
    if (input.preview !== undefined && typeof input.preview !== 'boolean') throw new WorldError('Preview must be true or false.');
    let generated;try { generated = generateBuild(input.parameters, input.requestId); } catch (error) { throw new WorldError(error instanceof Error ? error.message : 'Invalid builder parameters.'); }
    if (input.preview) { const world = await this.get(id); return { ...generated, baseRevision: world.revision, plotId: id }; }
    return this.addObjects(id, generated.objects, input.baseRevision, input.author, generated.summary);
  }
  async addObjects(id: string, objects: NonNullable<WorldEdit['objects']>, baseRevision: number, author: string, message: string) {
    await this.ready();
    return this.serial(id, async () => {
      const world = await this.read(id); if (!world) throw new WorldError('Plot not found', 404);
      if (objects.some(o => world.objects.some(existing => existing.id === o.id))) throw new WorldError('These tool objects already exist. Inspect the plot before retrying.', 409);
      const next = applyWorldEdit(world, { baseRevision, author, message, objects });
      await this.validateScene?.(next,world);
      await this.save(next); return next;
    });
  }
  async create(address: PlotAddress, name: string, author: string) {
    try { validateAddress(address); } catch (error) { throw new WorldError(error instanceof Error ? error.message : 'Invalid plot address.'); }
    if (typeof name !== 'string' || !name.trim() || name.length > 80 || typeof author !== 'string' || !author.trim() || author.length > 60) throw new WorldError('Give the plot a name and author.');
    await this.ready();const id = plotId(address);
    return this.serial(id, async () => { if (await this.read(id)) throw new WorldError('This plot already exists.', 409); const world = this.blank(address, name.trim(), author.trim()); await this.save(world); return world; });
  }
  async neighborhood(center: PlotAddress): Promise<PlotNeighborhood> {
    try { validateAddress(center); } catch (error) { throw new WorldError(error instanceof Error ? error.message : 'Invalid plot address.'); }
    await this.ready();
    const addresses: PlotAddress[] = [];
    for (let x = center.x - 1; x <= center.x + 1; x++) for (let z = center.z - 1; z <= center.z + 1; z++) if (Math.abs(x) <= 10000 && Math.abs(z) <= 10000) addresses.push({ x, z });
    const values = await Promise.all(addresses.map(address => this.serial(plotId(address), () => this.read(plotId(address)))));
    return { center, plotSize: PLOT_SIZE, plots: values.filter((world): world is SharedWorld => Boolean(world)), empty: addresses.filter((_,i) => !values[i]).map(address => ({ ...address, id: plotId(address) })) };
  }
  async neighbors(id: string): Promise<PlotNeighbor[]> {
    const world = await this.get(id), address = world.placement!;
    const result: PlotNeighbor[] = [];
    for (const direction of DIRECTIONS) {
      let next: PlotAddress;try { next = neighborAddress(address, direction); } catch { continue; }
      const neighbor = await this.serial(plotId(next), () => this.read(plotId(next)));
      result.push({ ...next, direction, id: plotId(next), name: neighbor?.name, exists: Boolean(neighbor) });
    }
    return result;
  }
}
