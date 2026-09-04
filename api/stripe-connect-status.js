import Stripe from 'stripe';

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

function send(res,status,body){
  res.status(status)
    .setHeader('Content-Type','application/json; charset=utf-8')
    .end(JSON.stringify(body));
}

async function getUser(token){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${token}`
    }
  });

  if(!r.ok)return null;
  return r.json();
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    return send(res,405,{error:'Méthode non autorisée.'});
  }

  try{
    const token=String(req.headers.authorization||'')
      .replace(/^Bearer\s+/i,'');

    if(!token)return send(res,401,{connected:false});

    const user=await getUser(token);

    if(!user)return send(res,401,{connected:false});

    const url=new URL(`${SUPABASE_URL}/rest/v1/member_profiles`);

    url.searchParams.set('user_id',`eq.${user.id}`);
    url.searchParams.set('select','stripe_account_id');
    url.searchParams.set('limit','1');

    const r=await fetch(url,{
      headers:{
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${token}`
      }
    });

    if(!r.ok){
      return send(res,200,{connected:false});
    }

    const [profile]=await r.json();

    if(!profile?.stripe_account_id){
      return send(res,200,{
        connected:false,
        started:false
      });
    }

    const account=await stripe.accounts.retrieve(
      profile.stripe_account_id
    );

    const onboardingCompleted=Boolean(
      account.details_submitted
    );

    return send(res,200,{
      connected:onboardingCompleted,
      started:true,
      onboardingCompleted,
      chargesEnabled:Boolean(account.charges_enabled),
      payoutsEnabled:Boolean(account.payouts_enabled)
    });

  }catch(error){
    console.error('[stripe-connect-status]',error);

    return send(res,200,{
      connected:false,
      started:false
    });
  }
}
