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
  if(req.method!=='POST'){
    return send(res,405,{error:'Méthode non autorisée.'});
  }

  try{
    const token=String(req.headers.authorization||'')
      .replace(/^Bearer\s+/i,'');

    if(!token)return send(res,401,{error:'Reconnecte-toi.'});

    const user=await getUser(token);

    if(!user){
      return send(res,401,{error:'Ta session a expiré.'});
    }

    const url=new URL(`${SUPABASE_URL}/rest/v1/member_profiles`);
    url.searchParams.set('user_id',`eq.${user.id}`);

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

    return send(res,200,{success:true});

  }catch(error){
    console.error('[stripe-disconnect]',error);

    return send(res,500,{
      error:'Impossible de modifier le compte Stripe.'
    });
  }
}
