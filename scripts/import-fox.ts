import {readFile} from 'node:fs/promises';
const url=new URL('http://127.0.0.1:5174/api/models');
url.search=new URLSearchParams({name:'Fox',author:'Codex',description:'Khronos Fox sample with its embedded texture, skin and Survey, Walk and Run animation clips.',source:'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox',license:'CC0-1.0 / CC-BY-4.0',attribution:'Model: PixelMannen. Rigging/animation: tomkranis. glTF conversion: @AsoboStudio and @scurest. Imported without modification.'}).toString();
const bytes=await readFile(new URL('./fixtures/Fox.glb',import.meta.url));
const response=await fetch(url,{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:bytes});
if(!response.ok)throw new Error(await response.text());
console.log(JSON.stringify(await response.json()));
