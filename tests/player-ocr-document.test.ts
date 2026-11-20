import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'crypto';
import { inspectOcrDocument, prepareOcrDocument, previewOcrDocument, selectionOf, ocrCacheKey, inspectPreparedQuality } from '../src/services/playerOcr.document';

const asset = (bytes: Buffer, type = 'image/jpeg') => ({ bytes, type, sha256:createHash('sha256').update(bytes).digest('hex') });
const jpeg = () => sharp({create:{width:800,height:500,channels:3,background:'#dddddd'}}).jpeg().toBuffer();
it('recognizes a card-shaped image and a whole-paper image separately', async () => {
  expect(await inspectOcrDocument(asset(await jpeg()))).toMatchObject({width:800,height:500,pages:1,requiresPreparation:false});
  const paper=await sharp({create:{width:600,height:900,channels:3,background:'white'}}).jpeg().toBuffer();
  expect((await inspectOcrDocument(asset(paper))).requiresPreparation).toBe(true);
});
it('crops only server-side source bytes using normalized coordinates', async () => {
  const output=await prepareOcrDocument(asset(await jpeg()),{page:1,crop:{x:.25,y:.25,width:.5,height:.5}});
  expect(await sharp(output).metadata()).toMatchObject({width:400,height:250,format:'jpeg'});
});
it('honors image orientation before mapping a crop', async () => {
  const image=await sharp({create:{width:320,height:500,channels:3,background:'white'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  expect(await inspectOcrDocument(asset(image))).toMatchObject({width:500,height:320});
  expect(await sharp(await prepareOcrDocument(asset(image),{page:1})).metadata()).toMatchObject({width:500,height:320});
});
it.each([{page:0},{page:5},{page:1,crop:{x:-.1,y:0,width:1,height:1}},{page:1,crop:{x:.9,y:0,width:.2,height:1}},{page:1,crop:{x:0,y:0,width:NaN,height:1}},{page:1,url:'https://example.test'}])('rejects invalid preparation %j', value=>expect(()=>selectionOf(value)).toThrow());
it('refuses tiny selected regions instead of enlarging unreadable details',async()=>{
  await expect(prepareOcrDocument(asset(await jpeg()),{page:1,crop:{x:0,y:0,width:.1,height:.1}})).rejects.toThrow('เล็กเกินไป');
});
it('counts real PDF pages before any external request and requires preparation',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage([595,842]);pdf.addPage([595,842]);
  expect(await inspectOcrDocument(asset(Buffer.from(await pdf.save()),'application/pdf'))).toMatchObject({pages:2,requiresPreparation:true});
});
it('refuses over-limit PDFs and invalid page selection before any OCR call',async()=>{
  const pdf=await PDFDocument.create();for(let i=0;i<5;i++)pdf.addPage();
  await expect(inspectOcrDocument(asset(Buffer.from(await pdf.save()),'application/pdf'))).rejects.toThrow('4 หน้า');
  await expect(previewOcrDocument(asset(await jpeg()),2)).rejects.toThrow('ไม่มีในเอกสาร');
});
it('maps malformed documents to a safe error',async()=>{
  await expect(inspectOcrDocument(asset(Buffer.from('not a document'),'application/pdf'))).rejects.toThrow('อ่านเอกสารไม่ได้');
});
it('deduplicates by bytes/selection and provider preparation revision, not by filename or player data',()=>{
  const hash='a'.repeat(64),a=ocrCacheKey(hash,{page:1});
  expect(a).toBe(ocrCacheKey(hash,{page:1}));expect(a).not.toBe(ocrCacheKey(hash,{page:2}));
  expect(a).not.toBe(ocrCacheKey(hash,{page:1,crop:{x:0,y:0,width:.5,height:1}}));
});
it('includes image adjustments in the cache key while normalizing defaults',()=>{
  const hash='a'.repeat(64),base=ocrCacheKey(hash,{page:1});
  expect(ocrCacheKey(hash,{page:1,rotation:0,enhance:false})).toBe(base);
  expect(ocrCacheKey(hash,{page:1,rotation:1})).not.toBe(base);
  expect(ocrCacheKey(hash,{page:1,enhance:true})).not.toBe(base);
});
it.each([{page:1,rotation:16},{page:1,rotation:'2'},{page:1,enhance:'true'},
  {page:1,corners:[{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]},
  {page:1,corners:[{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:0,y:1}]},
  {page:1,corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],crop:{x:0,y:0,width:1,height:1}}
])('rejects unsafe or ambiguous geometry %j',input=>expect(()=>selectionOf(input)).toThrow());
it('rectifies a trapezoid and retains colored card regions in their correct corners',async()=>{
  const svg=Buffer.from('<svg width="800" height="500"><rect width="800" height="500" fill="white"/><rect x="150" y="100" width="120" height="100" fill="red"/><rect x="500" y="300" width="120" height="100" fill="blue"/></svg>');
  const source=await sharp(svg).png().toBuffer();
  const out=await prepareOcrDocument(asset(source,'image/png'),{page:1,corners:[{x:.1,y:.1},{x:.9,y:.15},{x:.85,y:.9},{x:.15,y:.85}]});
  const {data,info}=await sharp(out).raw().toBuffer({resolveWithObject:true});
  const sample=(x:number,y:number)=>[...data.subarray((Math.round(y*info.height)*info.width+Math.round(x*info.width))*3,(Math.round(y*info.height)*info.width+Math.round(x*info.width))*3+3)];
  const red=sample(.2,.25),blue=sample(.8,.75);expect(red[0]).toBeGreaterThan(200);expect(red[2]).toBeLessThan(50);expect(blue[2]).toBeGreaterThan(200);expect(blue[0]).toBeLessThan(50);
});
it('reports quality hints without treating them as confidence or rejecting a readable document',async()=>{
  const bytes=await prepareOcrDocument(asset(await jpeg()),{page:1,rotation:1,enhance:true});
  const q=await inspectPreparedQuality(bytes);expect(q.warnings.length).toBeGreaterThan(0);expect(q).not.toHaveProperty('confidence');expect(q.width).toBeGreaterThan(0);
});
