import Stripe from 'stripe';

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

async function accountFromSlug(slug){
  const url=new URL(`${SUPABASE_URL}/rest/v1/published_sites`);
  url.searchParams.set('slug',`eq.${slug}`);
  url.searchParams.set('is_published','eq.true');
  url.searchParams.set('select','stripe_account_id');
  url.searchParams.set('limit','1');

  const response=await fetch(url,{
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if(!response.ok)return '';
  const [site]=await response.json();
  return site?.stripe_account_id||'';
}

function send(res,status,body){
  res.status(status)
    .setHeader('Content-Type','application/json; charset=utf-8')
    .end(JSON.stringify(body));
}

function clean(value,max=200){
  return String(value||'').trim().slice(0,max);
}

export default async function handler(req,res){

  if(req.method!=='GET'){
    return send(res,405,{
      error:'Méthode non autorisée.'
    });
  }

  try{

    const sessionId=clean(
      req.query?.session_id,
      200
    );

    const slug=clean(req.query?.slug,120);

    let accountId=clean(
      req.query?.account,
      100
    );

    if(slug){
      accountId=await accountFromSlug(slug);
    }

    if(
      !/^cs_/.test(sessionId) ||
      !/^acct_/.test(accountId)
    ){
      return send(res,400,{
        paid:false,
        error:'Session invalide.'
      });
    }

    const session=
      await stripe.checkout.sessions.retrieve(
        sessionId,
        {
          expand:['customer']
        },
        {
          stripeAccount:accountId
        }
      );

    const paid=
      session.payment_status==='paid';

    if(!paid){
      return send(res,200,{
        paid:false
      });
    }

    return send(res,200,{
      paid:true,

      product:
        session.metadata?.product||
        'Votre produit',

      type:
        session.metadata?.type||
        'main',

      email:
        session.customer_details?.email||
        session.customer?.email||
        '',

      amount:
        Number(session.amount_total||0)/100
    });

  }catch(error){

    console.error(
      '[checkout-status]',
      error
    );

    return send(res,400,{
      paid:false,
      error:'Paiement introuvable.'
    });
  }
}
