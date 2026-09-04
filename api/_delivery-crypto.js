import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv
} from 'crypto';

function key(){
  const secret=
    process.env.DELIVERY_ENCRYPTION_KEY||
    process.env.STRIPE_SECRET_KEY;

  if(!secret){
    throw new Error('DELIVERY_SECRET_MISSING');
  }

  return createHash('sha256')
    .update('dropdigital-delivery-v1:'+secret)
    .digest();
}

export function encryptProduct(html){

  const iv=randomBytes(12);

  const cipher=createCipheriv(
    'aes-256-gcm',
    key(),
    iv
  );

  const encrypted=Buffer.concat([
    cipher.update(String(html||''),'utf8'),
    cipher.final()
  ]);

  const tag=cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join('.');
}

export function decryptProduct(value){

  const [version,iv64,tag64,data64]=
    String(value||'').split('.');

  if(version!=='v1'){
    throw new Error('INVALID_DELIVERY_DATA');
  }

  const decipher=createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv64,'base64url')
  );

  decipher.setAuthTag(
    Buffer.from(tag64,'base64url')
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(data64,'base64url')
    ),
    decipher.final()
  ]).toString('utf8');
}
