import {mkdir,writeFile} from 'node:fs/promises';
const url=process.env.AGARTHA_CLOUD_CONVEX_URL;
if(!url?.startsWith('https://')||!url.endsWith('.convex.cloud'))throw new Error('Expected the production Convex URL.');
await mkdir('.agartha',{recursive:true});
await writeFile('.agartha/cloud-target.json',JSON.stringify({convexUrl:url,siteUrl:url.replace('.convex.cloud','.convex.site')},null,2),{mode:0o600});
