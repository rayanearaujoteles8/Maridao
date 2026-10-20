import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { validateProvider, validCnpj, ProviderInputError } from '../src/provider-validation.ts';
import { protectDocument } from '../src/document-security.ts';
const sample={name:'Prestador de teste',email:'teste@example.com',phone:'(63) 99999-9999',password:'teste123',documentType:'CPF',document:'529.982.247-25',categories:['Montagem e desmontagem de móveis'],specialties:['Montagem de guarda-roupas'],neighborhoods:['JARDIM AURENY I'],availability:'Segunda a sexta'};
test('valida CPF e CNPJ numérico e alfanumérico',()=>{
 assert.equal(validateProvider(sample).document,'52998224725');
 assert.equal(validCnpj('11222333000181'),true);
 assert.equal(validCnpj('00000000E08G12'),true);
 assert.equal(validCnpj('11111111111111'),false);
 assert.equal(validCnpj('11222333000180'),false);
 for(const body of [{...sample,document:'11111111111'},{...sample,documentType:'OUTRO'},{...sample,categories:[]},{...sample,password:'curta'},{...sample,role:'admin'}])assert.throws(()=>validateProvider(body),ProviderInputError);
});
test('criptografa com IV aleatório e índice estável separado, sem documento legível',()=>{
 process.env.DOCUMENT_ENCRYPTION_KEY='11'.repeat(32);process.env.DOCUMENT_INDEX_KEY='22'.repeat(32);
 const first=protectDocument('CPF','52998224725');const second=protectDocument('CPF','52998224725');
 assert.notEqual(first.encrypted,second.encrypted);assert.equal(first.fingerprint,second.fingerprint);assert.ok(!first.encrypted.includes('52998224725'));
 const [,iv,tag,ciphertext]=first.encrypted.split('.');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY,'hex'),Buffer.from(iv,'base64'));decipher.setAAD(Buffer.from('maridao-provider-document-v1'));decipher.setAuthTag(Buffer.from(tag,'base64'));
 assert.equal(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64')),decipher.final()]).toString(),'CPF:52998224725');
 delete process.env.DOCUMENT_ENCRYPTION_KEY;delete process.env.DOCUMENT_INDEX_KEY;
 assert.throws(()=>protectDocument('CPF','52998224725'));
});
