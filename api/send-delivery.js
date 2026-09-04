import {
  getPublishedProduct,
  verifyPurchase,
  stripe
} from '../lib/purchase.js';

const APP_ORIGIN=
  'https://dropdigital-generator.vercel.app';

function send(res,status,body){
  res.status(status)
    .setHeader(
      'Content-Type',
      'application/json; charset=utf-8'
    )
    .end(JSON.stringify(body));
}

export default async function handler(req,res){

  if(req.method!=='POST'){
    return send(res,405,{
      error:'Méthode non autorisée.'
    });
  }

  try{

    const slug=String(
      req.body?.slug||''
    ).trim();

    const sessionId=String(
      req.body?.session_id||''
    ).trim();

    const site=
      await getPublishedProduct(slug);

    const purchase=
      await verifyPurchase(
        slug,
        sessionId,
        site
      );

    if(!purchase){
      return send(res,403,{
        error:'Paiement non confirmé.'
      });
    }

    const deliveryUrl=
      `${APP_ORIGIN}/api/product`+
      `?slug=${encodeURIComponent(slug)}`+
      `&session_id=${encodeURIComponent(sessionId)}`;

    const email=
      purchase.session.customer_details?.email||
      purchase.mainSession.customer_details?.email||
      '';

    if(
      purchase.mainSession.metadata?.delivery_sent==='1'
    ){
      return send(res,200,{
        ok:true,
        alreadySent:true,
        email,
        deliveryUrl
      });
    }

    if(
      !process.env.RESEND_API_KEY||
      !process.env.RESEND_FROM_EMAIL||
      !email
    ){
      return send(res,200,{
        ok:true,
        emailSent:false,
        email,
        deliveryUrl
      });
    }

    const response=await fetch(
      'https://api.resend.com/emails',
      {
        method:'POST',

        headers:{
          Authorization:
            `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type':'application/json'
        },

        body:JSON.stringify({

          from:
            process.env.RESEND_FROM_EMAIL,

          to:[email],

          subject:
            `Ton accès — ${site.title||'commande'}`,

          html:`
            <div style="
              font-family:Arial,sans-serif;
              max-width:560px;
              margin:auto;
              padding:35px;
            ">
              <h1>
                Ton produit est prêt ✓
              </h1>

              <p>
                Merci pour ta commande.
              </p>

              <p>
                Clique ci-dessous pour accéder à ton produit.
              </p>

              <p style="margin:30px 0;">
                <a
                  href="${deliveryUrl}"
                  style="
                    display:inline-block;
                    background:#111;
                    color:#fff;
                    text-decoration:none;
                    padding:15px 22px;
                    border-radius:8px;
                    font-weight:bold;
                  "
                >
                  ACCÉDER À MON PRODUIT
                </a>
              </p>

              <p style="
                color:#777;
                font-size:12px;
              ">
                Conserve cet email pour retrouver ton accès.
              </p>
            </div>
          `
        })
      }
    );

    if(!response.ok){

      console.error(
        '[delivery-email]',
        await response.text()
      );

      return send(res,200,{
        ok:true,
        emailSent:false,
        email,
        deliveryUrl
      });
    }

    await stripe.checkout.sessions.update(
      purchase.mainSession.id,
      {
        metadata:{
          ...purchase.mainSession.metadata,
          delivery_sent:'1'
        }
      },
      {
        stripeAccount:
          site.stripe_account_id
      }
    );

    return send(res,200,{
      ok:true,
      emailSent:true,
      email,
      deliveryUrl
    });

  }catch(error){

    console.error('[send-delivery]',error);

    return send(res,500,{
      error:'Livraison momentanément indisponible.'
    });
  }
}
