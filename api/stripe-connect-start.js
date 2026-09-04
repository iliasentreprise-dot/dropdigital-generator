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

async function getProfile(userId,token){
  const url=new URL(`${SUPABASE_URL}/rest/v1/member_profiles`);
  url.searchParams.set('user_id',`eq.${userId}`);
  url.searchParams.set('select','stripe_account_id');
  url.searchParams.set('limit','1');

  const r=await fetch(url,{
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${token}`
    }
  });

  if(!r.ok)return null;

  const rows=await r.json();
  return rows[0]||null;
}

async function saveStripeAccount(userId,accountId,token,userEmail){
  const url=new URL(`${SUPABASE_URL}/rest/v1/member_profiles`);
  url.searchParams.set('on_conflict','user_id');

  const r=await fetch(url,{
    method:'POST',
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json',
      Prefer:'resolution=merge-duplicates,return=representation'
    },
    body:JSON.stringify({
      user_id:userId,
      email:userEmail,
      stripe_account_id:accountId,
      updated_at:new Date().toISOString()
    })
  });

  if(!r.ok){
    console.error(
      '[stripe-connect-start] Supabase save failed',
      r.status,
      await r.text()
    );
    return false;
  }

  const rows=await r.json();

  return Array.isArray(rows) &&
    rows.some(row=>row.stripe_account_id===accountId);
}

export default async function handler(req,res){
  if(req.method!=='POST'){
    return send(res,405,{error:'Méthode non autorisée.'});
  }

  try{
    if(!process.env.STRIPE_SECRET_KEY){
      return send(res,503,{
        error:'Stripe Connect n’est pas encore configuré.'
      });
    }

    const token=String(req.headers.authorization||'')
      .replace(/^Bearer\s+/i,'');

    if(!token){
      return send(res,401,{error:'Reconnecte-toi.'});
    }

    const user=await getUser(token);

    if(!user){
      return send(res,401,{
        error:'Ta session a expiré.'
      });
    }

    const profile=await getProfile(user.id,token);

    let accountId=profile?.stripe_account_id||'';

    if(accountId){
      try{
        await stripe.accounts.retrieve(accountId);
      }catch(_){
        accountId='';
      }
    }

    if(!accountId){
      const account=await stripe.accounts.create({
        type:'standard',
        email:user.email||undefined,
        metadata:{
          dropdigital_user_id:user.id
        }
      });

      accountId=account.id;

      const saved=await saveStripeAccount(
        user.id,
        accountId,
        token,
        user.email
      );

      if(!saved){
        throw new Error('Impossible de sauvegarder le compte Stripe.');
      }
    }

    const origin=
      req.headers.origin||
      'https://dropdigital-generator.vercel.app';

    const link=await stripe.accountLinks.create({
      account:accountId,
      refresh_url:
        `${origin}/generator.html?stripe_connect=refresh`,
      return_url:
        `${origin}/generator.html?stripe_connect=return`,
      type:'account_onboarding'
    });

    return send(res,200,{
      url:link.url
    });

  }catch(error){
    console.error('[stripe-connect-start]',error);

    return send(res,500,{
      error:'Impossible de connecter Stripe pour le moment.'
    });
  }
}
