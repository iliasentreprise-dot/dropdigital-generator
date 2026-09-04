import Stripe from 'stripe';

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';
const APP_ORIGIN='https://dropdigital-generator.vercel.app';

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

  const [profile]=await r.json();
  return profile||null;
}

async function saveAccount(user,accountId,token){
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
      user_id:user.id,
      email:user.email,
      stripe_account_id:accountId,
      updated_at:new Date().toISOString()
    })
  });

  if(!r.ok){
    console.error('[stripe-connect] save failed',await r.text());
    return false;
  }

  return true;
}

export default async function handler(req,res){

  const action=String(req.query?.action||'status');

  try{

    const token=String(req.headers.authorization||'')
      .replace(/^Bearer\s+/i,'');

    if(!token){
      return send(res,401,{
        connected:false,
        error:'Reconnecte-toi.'
      });
    }

    const user=await getUser(token);

    if(!user){
      return send(res,401,{
        connected:false,
        error:'Ta session a expiré.'
      });
    }

    if(action==='status'){

      if(req.method!=='GET'){
        return send(res,405,{error:'Méthode non autorisée.'});
      }

      const profile=await getProfile(user.id,token);

      if(!profile?.stripe_account_id){
        return send(res,200,{
          connected:false,
          started:false
        });
      }

      const account=await stripe.accounts.retrieve(
        profile.stripe_account_id
      );

      const onboardingCompleted=
        Boolean(account.details_submitted);

      return send(res,200,{
        connected:onboardingCompleted,
        started:true,
        onboardingCompleted,
        chargesEnabled:Boolean(account.charges_enabled),
        payoutsEnabled:Boolean(account.payouts_enabled),
        accountId:profile.stripe_account_id
      });
    }

    if(action==='start'){

      if(req.method!=='POST'){
        return send(res,405,{error:'Méthode non autorisée.'});
      }

      const profile=await getProfile(user.id,token);

      let accountId=
        profile?.stripe_account_id||'';

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

        const saved=await saveAccount(
          user,
          accountId,
          token
        );

        if(!saved){
          throw new Error('Compte Stripe non sauvegardé.');
        }
      }

      const link=await stripe.accountLinks.create({
        account:accountId,
        refresh_url:
          `${APP_ORIGIN}/generator.html?stripe_connect=refresh`,
        return_url:
          `${APP_ORIGIN}/generator.html?stripe_connect=return`,
        type:'account_onboarding'
      });

      return send(res,200,{
        url:link.url
      });
    }

    if(action==='disconnect'){

      if(req.method!=='POST'){
        return send(res,405,{error:'Méthode non autorisée.'});
      }

      const url=new URL(
        `${SUPABASE_URL}/rest/v1/member_profiles`
      );

      url.searchParams.set(
        'user_id',
        `eq.${user.id}`
      );

      const r=await fetch(url,{
        method:'PATCH',
        headers:{
          apikey:SUPABASE_ANON_KEY,
          Authorization:`Bearer ${token}`,
          'Content-Type':'application/json',
          Prefer:'return=minimal'
        },
        body:JSON.stringify({
          stripe_account_id:null,
          updated_at:new Date().toISOString()
        })
      });

      if(!r.ok){
        throw new Error('Supabase update failed');
      }

      return send(res,200,{
        success:true
      });
    }

    return send(res,400,{
      error:'Action Stripe inconnue.'
    });

  }catch(error){

    console.error(
      `[stripe-connect:${action}]`,
      error
    );

    if(action==='status'){
      return send(res,200,{
        connected:false,
        started:false
      });
    }

    return send(res,500,{
      error:'Impossible de gérer Stripe pour le moment.'
    });
  }
}
