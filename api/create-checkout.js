import Stripe from 'stripe';

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

const APP_ORIGIN='https://dropdigital-generator.vercel.app';
const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

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

async function getSite(slug){
  const url=new URL(`${SUPABASE_URL}/rest/v1/published_sites`);

  url.searchParams.set('slug',`eq.${slug}`);
  url.searchParams.set('is_published','eq.true');
  url.searchParams.set('select','title,stripe_account_id');
  url.searchParams.set('limit','1');

  const response=await fetch(url,{
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if(!response.ok)return null;

  const [site]=await response.json();
  return site||null;
}

export default async function handler(req,res){

  if(req.method==='OPTIONS'){
    return res.status(204).end();
  }

  if(req.method!=='POST'){
    return send(res,405,{error:'Méthode non autorisée.'});
  }

  try{

    const slug=clean(req.body?.slug,120);

    const type=
      req.body?.type==='upsell'
        ? 'upsell'
        : 'main';

    const withBump=Boolean(req.body?.withBump);

    let stripeAccountId=clean(
      req.body?.stripeAccountId,
      80
    );

    let productTitle=clean(
      req.body?.productTitle||
      'Accès au programme'
    );

    if(slug){

      const site=await getSite(slug);

      if(!site?.stripe_account_id){
        return send(res,404,{
          error:'Site ou paiement introuvable.'
        });
      }

      stripeAccountId=site.stripe_account_id;
      productTitle=site.title||productTitle;
    }

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
        error:'Le vendeur ne peut pas encore encaisser.'
      });
    }

    const parentSessionId=clean(
      req.body?.parentSessionId,
      200
    );

    if(type==='upsell'&&slug){

      if(!/^cs_/.test(parentSessionId)){
        return send(res,403,{
          error:'Achat principal requis.'
        });
      }

      const parent=
        await stripe.checkout.sessions.retrieve(
          parentSessionId,
          {},
          {stripeAccount:stripeAccountId}
        );

      if(
        parent.payment_status!=='paid'||
        parent.metadata?.type!=='main'||
        parent.metadata?.slug!==slug
      ){
        return send(res,403,{
          error:'Achat principal non confirmé.'
        });
      }
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
                      name:'Bonus complémentaire'
                    },
                    unit_amount:780
                  },
                  quantity:1
                }]
              : [])
          ];

    let successUrl;

    if(slug&&type==='main'){

      successUrl=
        `${APP_ORIGIN}/api/upsell`+
        `?slug=${encodeURIComponent(slug)}`+
        `&session_id={CHECKOUT_SESSION_ID}`;

    }else if(slug){

      successUrl=
        `${APP_ORIGIN}/thank-you.html`+
        `?slug=${encodeURIComponent(slug)}`+
        `&session_id={CHECKOUT_SESSION_ID}`;

    }else{

      successUrl=
        `${APP_ORIGIN}/thank-you.html`+
        `?account=${encodeURIComponent(stripeAccountId)}`+
        `&session_id={CHECKOUT_SESSION_ID}`;
    }

    let cancelUrl=APP_ORIGIN;

    if(slug&&type==='main'){
      cancelUrl=`${APP_ORIGIN}/p/${encodeURIComponent(slug)}`;
    }

    if(
      slug&&
      type==='upsell'&&
      /^cs_/.test(parentSessionId)
    ){
      cancelUrl=
        `${APP_ORIGIN}/api/upsell`+
        `?slug=${encodeURIComponent(slug)}`+
        `&session_id=${encodeURIComponent(parentSessionId)}`;
    }

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
            slug,
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

    console.error('[create-checkout]',error);

    return send(res,500,{
      error:'Impossible d’ouvrir Stripe.'
    });
  }
}
