import { cronJobs, anyApi } from 'convex/server';
const crons=cronJobs();
crons.interval('scene retention',{hours:1},anyApi.scene.maintenance.cleanup,{});
export default crons;
