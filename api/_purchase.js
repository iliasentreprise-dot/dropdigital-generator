import Stripe from 'stripe';

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL=
  'https://iauypnxtakkqnjdrhivv.supabase.co';

const SUPABASE_ANON_KEY=
  'sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

export async function getPublishedProduct(slug){

  const url=new URL(
    `${SUPABASE_URL}/rest/v1/published_sites`
  );

  url.searchParams.set('slug',`eq.${slug}`);
  url.searchParams.set('is_published','eq.true');

  url.searchParams.set(
    'select',
    'title,stripe_account_id,ebook_ciphertext'
  );

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

export async function verifyPurchase(
  slug,
  sessionId,
  site
){

  if(
    !site?.stripe_account_id||
    !/^cs_/.test(sessionId)
  ){
    return null;
  }

  const session=
    await stripe.checkout.sessions.retrieve(
      sessionId,
      {},
      {
        stripeAccount:
          site.stripe_account_id
      }
    );

  if(
    session.payment_status!=='paid'||
    session.metadata?.slug!==slug
  ){
    return null;
  }

  if(session.metadata?.type==='main'){

    return {
      session,
      mainSession:session
    };
  }

  if(session.metadata?.type==='upsell'){

    const parentId=
      session.metadata?.parent_session_id;

    if(!/^cs_/.test(parentId||'')){
      return null;
    }

    const parent=
      await stripe.checkout.sessions.retrieve(
        parentId,
        {},
        {
          stripeAccount:
            site.stripe_account_id
        }
      );

    if(
      parent.payment_status!=='paid'||
      parent.metadata?.type!=='main'||
      parent.metadata?.slug!==slug
    ){
      return null;
    }

    return {
      session,
      mainSession:parent
    };
  }

  return null;
}

export {stripe};
