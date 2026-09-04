const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

function send(res,status,body){
  res.status(status)
    .setHeader('Content-Type','application/json; charset=utf-8')
    .end(JSON.stringify(body));
}

function slugify(value){
  return String(value||'produit')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,55)||'produit';
}

async function getUser(token){
  const response=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${token}`
    }
  });

  if(!response.ok)return null;
  return response.json();
}

export default async function handler(req,res){

  if(req.method!=='POST'){
    return send(res,405,{error:'Méthode non autorisée.'});
  }

  try{

    const token=String(
      req.headers.authorization||''
    ).replace(/^Bearer\s+/i,'');

    const user=await getUser(token);

    if(!user){
      return send(res,401,{error:'Connexion requise.'});
    }

    const title=String(req.body?.title||'Produit').trim();
    const salesHtml=String(req.body?.salesHtml||'');
    const upsellHtml=String(req.body?.upsellHtml||'');
    const generationId=String(req.body?.generationId||'');

    if(!/<html/i.test(salesHtml)){
      return send(res,400,{error:'Page invalide.'});
    }

    const profileUrl=new URL(
      `${SUPABASE_URL}/rest/v1/member_profiles`
    );

    profileUrl.searchParams.set('user_id',`eq.${user.id}`);
    profileUrl.searchParams.set('select','stripe_account_id');
    profileUrl.searchParams.set('limit','1');

    const profileResponse=await fetch(profileUrl,{
      headers:{
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${token}`
      }
    });

    const [profile]=await profileResponse.json();

    if(!profile?.stripe_account_id){
      return send(res,409,{
        error:'Connecte Stripe avant de publier.'
      });
    }

    const suffix=
      generationId.replace(/-/g,'').slice(0,6)||
      user.id.replace(/-/g,'').slice(0,6);

    const slug=`${slugify(title)}-${suffix}`;

    const existingUrl=new URL(
      `${SUPABASE_URL}/rest/v1/published_sites`
    );

    existingUrl.searchParams.set('user_id',`eq.${user.id}`);
    existingUrl.searchParams.set('slug',`eq.${slug}`);
    existingUrl.searchParams.set('select','id');
    existingUrl.searchParams.set('limit','1');

    const existingResponse=await fetch(existingUrl,{
      headers:{
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${token}`
      }
    });

    const [existing]=await existingResponse.json();

    const payload={
      user_id:user.id,
      generation_id:
        /^[0-9a-f-]{36}$/i.test(generationId)
          ? generationId
          : null,
      slug,
      title,
      sales_html:salesHtml,
      upsell_html:upsellHtml||null,
      stripe_account_id:profile.stripe_account_id,
      is_published:true,
      updated_at:new Date().toISOString()
    };

    const url=existing?.id
      ? `${SUPABASE_URL}/rest/v1/published_sites?id=eq.${existing.id}`
      : `${SUPABASE_URL}/rest/v1/published_sites`;

    const response=await fetch(url,{
      method:existing?.id?'PATCH':'POST',
      headers:{
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${token}`,
        'Content-Type':'application/json',
        Prefer:'return=representation'
      },
      body:JSON.stringify(payload)
    });

    if(!response.ok){
      console.error('[publish-site]',await response.text());

      return send(res,500,{
        error:'Publication impossible.'
      });
    }

    return send(res,200,{
      ok:true,
      slug,
      url:`https://dropdigital-generator.vercel.app/p/${slug}`
    });

  }catch(error){

    console.error('[publish-site]',error);

    return send(res,500,{
      error:'Publication impossible.'
    });
  }
}
