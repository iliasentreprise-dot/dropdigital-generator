import {
  getPublishedProduct,
  verifyPurchase
} from './_purchase.js';

import {
  decryptProduct
} from './_delivery-crypto.js';

export default async function handler(req,res){

  try{

    const slug=String(
      req.query?.slug||''
    ).trim();

    const sessionId=String(
      req.query?.session_id||''
    ).trim();

    const site=
      await getPublishedProduct(slug);

    const purchase=
      await verifyPurchase(
        slug,
        sessionId,
        site
      );

    if(
      !purchase||
      !site?.ebook_ciphertext
    ){
      return res
        .status(403)
        .send('Accès au produit non autorisé.');
    }

    let html=
      decryptProduct(
        site.ebook_ciphertext
      );

    const toolbar=`
<style>
#dropdigital-delivery-toolbar{
position:fixed;
top:14px;
right:14px;
z-index:999999;
}
#dropdigital-delivery-toolbar button{
border:0;
border-radius:8px;
padding:12px 17px;
background:#111;
color:white;
font:700 13px Arial,sans-serif;
cursor:pointer;
box-shadow:0 8px 30px #0004;
}
@media print{
#dropdigital-delivery-toolbar{
display:none!important;
}
}
</style>

<div id="dropdigital-delivery-toolbar">
<button onclick="window.print()">
Télécharger / imprimer
</button>
</div>
`;

    if(/<body[^>]*>/i.test(html)){
      html=html.replace(
        /<body([^>]*)>/i,
        '<body$1>'+toolbar
      );
    }else{
      html=toolbar+html;
    }

    return res
      .status(200)
      .setHeader(
        'Content-Type',
        'text/html; charset=utf-8'
      )
      .setHeader(
        'Cache-Control',
        'private, no-store'
      )
      .setHeader(
        'X-Robots-Tag',
        'noindex, nofollow'
      )
      .setHeader(
        'Referrer-Policy',
        'no-referrer'
      )
      .send(html);

  }catch(error){

    console.error('[product-delivery]',error);

    return res
      .status(500)
      .send('Produit temporairement indisponible.');
  }
}
