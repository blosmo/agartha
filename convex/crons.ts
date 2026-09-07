import { cronJobs, anyApi } from 'convex/server';
const crons=cronJobs();
crons.interval('scene retention',{hours:1},anyApi.scene.maintenance.cleanup,{});
crons.interval('governance voting closes',{minutes:1},anyApi.governance.mutations.finalizeDue,{});
export default crons;
