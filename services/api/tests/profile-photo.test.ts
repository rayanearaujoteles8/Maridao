import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizePhoto} from '../src/profile-photo.ts';
test('photo validates input and rejects documents, remote URLs and corrupt images',async()=>{
 for(const input of [null,{}, {image:'https://example.com/x.jpg'},{image:'data:image/svg+xml;base64,PHN2Zy8+'},{image:'data:image/jpeg;base64,YWJj'},{image:'data:image/jpeg;base64,YQ==',other:true}])await assert.rejects(normalizePhoto(input));
});
test('photo is resized to a square JPEG and metadata is stripped',async()=>{
 const original=await sharp({create:{width:800,height:600,channels:3,background:'#77aa22'}}).withMetadata({exif:{IFD0:{Artist:'Private author'}}}).png().toBuffer();
 const result=await normalizePhoto({image:'data:image/png;base64,'+original.toString('base64')});
 const meta=await sharp(result).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.format,'jpeg');assert.equal(meta.exif,undefined);
});
test('photo rejects oversized upload before image decoding',async()=>{await assert.rejects(normalizePhoto({image:'data:image/jpeg;base64,'+'A'.repeat(7000000)}));});
