import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const APP_ORIGIN = 'https://dropdigital-generator.vercel.app';

function send(res,status,body){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.status(status)
    .setHeader('Content-Type','application/json; charset=utf-8')
    .end(JSON.stringify(body));
}

function clean(value,max=120){
  return String(value||'')
    .replace(/[\r\n]+/g,' ')
    .trim()
    .slice(0,max);
}

export default async function handler(req,res){

  if(req.method==='OPTIONS'){
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
    return res.status(204).end();
  }

  if(req.method!=='POST'){
    return send(res,405,{error:'Méthode non autorisée.'});
  }

  try{

    const stripeAccountId=clean(
      req.body?.stripeAccountId,
      80
    );

    const type=
      req.body?.type==='upsell'
        ? 'upsell'
        : 'main';

    const withBump=Boolean(
      req.body?.withBump
    );

    const productTitle=clean(
      req.body?.productTitle||
      'Accès au programme'
    );

    const bumpTitle=clean(
      req.body?.bumpTitle||
      'Bonus complémentaire'
    );

    if(!/^acct_[A-Za-z0-9]+$/.test(stripeAccountId)){
      return send(res,400,{
        error:'Compte Stripe invalide.'
      });
    }

    const account=await stripe.accounts.retrieve(
      stripeAccountId
    );

    if(
      !account||
      account.deleted||
      !account.details_submitted||
      !account.charges_enabled
    ){
      return send(res,409,{
        error:'Le compte Stripe ne peut pas encore encaisser.'
      });
    }

    const lineItems=
      type==='upsell'
        ? [{
            price_data:{
              currency:'eur',
              product_data:{
                name:'Offre complémentaire'
              },
              unit_amount:4700
            },
            quantity:1
          }]
        : [
            {
              price_data:{
                currency:'eur',
                product_data:{
                  name:productTitle
                },
                unit_amount:1780
              },
              quantity:1
            },
            ...(withBump
              ? [{
                  price_data:{
                    currency:'eur',
                    product_data:{
                      name:bumpTitle
                    },
                    unit_amount:780
                  },
                  quantity:1
                }]
              : [])
          ];

    const successUrl=
      `${APP_ORIGIN}/thank-you.html`+
      `?session_id={CHECKOUT_SESSION_ID}`+
      `&account=${encodeURIComponent(stripeAccountId)}`+
      `&type=${type}`+
      `&product=${encodeURIComponent(productTitle)}`;

    const cancelUrl=
      req.body?.cancelUrl &&
      /^https?:\/\//.test(req.body.cancelUrl)
        ? req.body.cancelUrl
        : APP_ORIGIN;

    const session=
      await stripe.checkout.sessions.create(
        {
          mode:'payment',

          locale:'fr',

          customer_creation:'always',

          line_items:lineItems,

          success_url:successUrl,

          cancel_url:cancelUrl,

          metadata:{
            dropdigital:'1',
            type,
            bump:withBump?'1':'0',
            product:productTitle
          }
        },
        {
          stripeAccount:stripeAccountId
        }
      );

    return send(res,200,{
      url:session.url
    });

  }catch(error){

    console.error(
      '[create-checkout]',
      error
    );

    return send(res,500,{
      error:'Impossible d’ouvrir Stripe pour le moment.'
    });
  }
}
