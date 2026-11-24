import sharp from 'sharp';
import {WorkflowError} from './workflow-error.ts';
export const MAX_PHOTO_BYTES=5*1024*1024;
export async function normalizePhoto(input:unknown):Promise<Buffer>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='image'))throw new WorkflowError(400,'Escolha uma imagem para o perfil.');
 const value=(input as {image?:unknown}).image;
 if(typeof value!=='string'||value.length>Math.ceil(MAX_PHOTO_BYTES/3)*4+64)throw new WorkflowError(400,'Escolha uma imagem de até 5 MB.');
 const match=value.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match)throw new WorkflowError(400,'Use uma imagem JPG, PNG ou WebP.');
 const bytes=Buffer.from(match[1],'base64');
 if(bytes.length>MAX_PHOTO_BYTES||bytes.toString('base64')!==match[1])throw new WorkflowError(400,'Imagem inválida ou maior que 5 MB.');
 try{
  const image=sharp(bytes,{limitInputPixels:25000000,failOn:'warning'}),meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)>1)throw new Error('format');
  // Re-encode: strips EXIF/GPS and never stores the original upload.
  return await image.rotate().resize(512,512,{fit:'cover'}).jpeg({quality:82}).toBuffer();
 }catch{throw new WorkflowError(400,'Não foi possível ler a foto. Escolha outra imagem JPG, PNG ou WebP.');}
}
export const photoData=(bytes:Buffer)=>'data:image/jpeg;base64,'+bytes.toString('base64');
