const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

export default async function handler(req,res){

  const slug=String(req.query?.slug||'').trim();

  const url=new URL(
    `${SUPABASE_URL}/rest/v1/published_sites`
  );

  url.searchParams.set('slug',`eq.${slug}`);
  url.searchParams.set('is_published','eq.true');
  url.searchParams.set('select','sales_html');
  url.searchParams.set('limit','1');

  const response=await fetch(url,{
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  const [site]=await response.json();

  if(!site?.sales_html){
    return res.status(404).send('Site introuvable');
  }

  const runtime=`
<script>
(function(){

const SLUG=${JSON.stringify(slug)};

window.dropdigitalCheckout=async function(event){

  if(event)event.preventDefault();

  const checkbox=
    document.getElementById('order-bump-checkbox');

  try{

    const response=await fetch('/api/create-checkout',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        slug:SLUG,
        type:'main',
        withBump:checkbox ? checkbox.checked : false
      })
    });

    const data=await response.json();

    if(!response.ok||!data.url){
      throw new Error(data.error||'Paiement indisponible.');
    }

    location.href=data.url;

  }catch(error){
    alert(error.message||'Paiement indisponible.');
  }

  return false;
};

const button=document.getElementById('checkout-button');

if(button){
  button.onclick=window.dropdigitalCheckout;
}

document.querySelectorAll('a').forEach(function(link){

  const href=link.getAttribute('href')||'';

  if(/STRIPE_CONNECT|STRIPE_LINK|STRIPE_LATER/i.test(href)){
    link.href='#';
    link.onclick=window.dropdigitalCheckout;
  }
});

})();
<\/script>`;

  const html=String(site.sales_html).replace(
    /<\/body>/i,
    runtime+'</body>'
  );

  res.status(200)
    .setHeader('Content-Type','text/html; charset=utf-8')
    .setHeader('Cache-Control','no-store')
    .send(html);
}
