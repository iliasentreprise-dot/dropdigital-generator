import Stripe from 'stripe';

import {
  getPublishedProduct
} from '../lib/purchase.js';

const stripe=
  new Stripe(
    process.env.STRIPE_SECRET_KEY
  );

const APP_ORIGIN=
  'https://dropdigital-generator.vercel.app';

export const config={
  api:{
    bodyParser:false
  }
};

async function rawBody(req){

  const chunks=[];

  for await(const chunk of req){
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

function send(res,status,body){
  res.status(status)
    .setHeader(
      'Content-Type',
      'application/json'
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

    if(!process.env.STRIPE_WEBHOOK_SECRET){
      throw new Error(
        'STRIPE_WEBHOOK_SECRET missing'
      );
    }

    const signature=
      req.headers['stripe-signature'];

    if(!signature){
      return send(res,400,{
        error:'Signature absente.'
      });
    }

    const body=
      await rawBody(req);

    const event=
      stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

    const accepted=[
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded'
    ];

    if(!accepted.includes(event.type)){
      return send(res,200,{
        received:true
      });
    }

    const webhookSession=
      event.data.object;

    /*
      Livraison du produit principal uniquement.
      L'upsell ne doit pas renvoyer l'ebook.
    */
    if(
      webhookSession.metadata?.type!=='main'
    ){
      return send(res,200,{
        received:true
      });
    }

    const slug=
      String(
        webhookSession.metadata?.slug||
        ''
      );

    const accountId=
      String(event.account||'');

    if(
      !slug||
      !/^acct_/.test(accountId)
    ){
      return send(res,200,{
        received:true
      });
    }

    const site=
      await getPublishedProduct(slug);

    if(
      !site||
      site.stripe_account_id!==accountId
    ){
      return send(res,200,{
        received:true
      });
    }

    /*
      On relit la session Stripe pour avoir
      son état le plus récent.
    */
    const session=
      await stripe.checkout.sessions.retrieve(
        webhookSession.id,
        {},
        {
          stripeAccount:accountId
        }
      );

    if(session.payment_status!=='paid'){
      return send(res,200,{
        received:true
      });
    }

    /*
      Empêche les doubles envois lors
      des retries Stripe.
    */
    if(
      session.metadata?.delivery_sent==='1'
    ){
      return send(res,200,{
        received:true,
        alreadySent:true
      });
    }

    const email=
      session.customer_details?.email||
      '';

    if(!email){
      return send(res,200,{
        received:true
      });
    }

    /*
      Sans Resend configuré :
      aucun crash du paiement.
    */
    if(
      !process.env.RESEND_API_KEY||
      !process.env.RESEND_FROM_EMAIL
    ){
      console.warn(
        '[stripe-webhook] Resend non configuré'
      );

      return send(res,200,{
        received:true,
        emailSent:false
      });
    }

    const deliveryUrl=
      `${APP_ORIGIN}/api/product`+
      `?slug=${encodeURIComponent(slug)}`+
      `&session_id=${encodeURIComponent(session.id)}`;

    const emailResponse=
      await fetch(
        'https://api.resend.com/emails',
        {
          method:'POST',

          headers:{
            Authorization:
              `Bearer ${process.env.RESEND_API_KEY}`,

            'Content-Type':
              'application/json'
          },

          body:JSON.stringify({

            from:
              process.env.RESEND_FROM_EMAIL,

            to:[email],

            subject:
              `Ton accès — ${site.title||'ta commande'}`,

            html:`
              <div style="
                font-family:Arial,sans-serif;
                max-width:560px;
                margin:auto;
                padding:32px;
              ">

                <h1>
                  Ton produit est prêt ✓
                </h1>

                <p>
                  Merci pour ta commande.
                </p>

                <p>
                  Ton accès est disponible immédiatement.
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
                      font-weight:700;
                    "
                  >
                    ACCÉDER À MON PRODUIT
                  </a>

                </p>

                <p style="
                  font-size:12px;
                  color:#777;
                ">
                  Conserve cet email pour retrouver ton accès.
                </p>

              </div>
            `
          })
        }
      );

    if(!emailResponse.ok){

      const errorText=
        await emailResponse.text();

      console.error(
        '[stripe-webhook] email failed',
        errorText
      );

      /*
        On renvoie 500 :
        Stripe retentera automatiquement.
      */
      return send(res,500,{
        error:'Email delivery failed'
      });
    }

    await stripe.checkout.sessions.update(
      session.id,
      {
        metadata:{
          ...session.metadata,
          delivery_sent:'1'
        }
      },
      {
        stripeAccount:accountId
      }
    );

    return send(res,200,{
      received:true,
      emailSent:true
    });

  }catch(error){

    console.error(
      '[stripe-webhook]',
      error
    );

    return send(res,400,{
      error:'Webhook invalide.'
    });
  }
}
