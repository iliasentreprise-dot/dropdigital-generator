import Stripe from 'stripe';

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

export default async function handler(req,res){

  try{

    const slug=String(req.query?.slug||'');
    const sessionId=String(req.query?.session_id||'');

    const url=new URL(
      `${SUPABASE_URL}/rest/v1/published_sites`
    );

    url.searchParams.set('slug',`eq.${slug}`);
    url.searchParams.set('is_published','eq.true');
    url.searchParams.set(
      'select',
      'upsell_html,stripe_account_id'
    );
    url.searchParams.set('limit','1');

    const response=await fetch(url,{
      headers:{
        apikey:SUPABASE_ANON_KEY,
        Authorization:`Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    const [site]=await response.json();

    if(!site?.stripe_account_id){
      return res.status(404).send('Site introuvable');
    }

    const session=
      await stripe.checkout.sessions.retrieve(
        sessionId,
        {},
        {stripeAccount:site.stripe_account_id}
      );

    if(
      session.payment_status!=='paid'||
      session.metadata?.type!=='main'||
      session.metadata?.slug!==slug
    ){
      return res.status(403).send(
        'Paiement principal non confirmé'
      );
    }

    if(!site.upsell_html){
      return res.redirect(
        302,
        `/thank-you.html?slug=${encodeURIComponent(slug)}&session_id=${encodeURIComponent(sessionId)}`
      );
    }

    const runtime=`
<script>
(function(){

const SLUG=${JSON.stringify(slug)};
const MAIN_SESSION=${JSON.stringify(sessionId)};

window.dropdigitalUpsellAccept=async function(event){

  if(event)event.preventDefault();

  try{

    const response=await fetch('/api/create-checkout',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        slug:SLUG,
        type:'upsell',
        parentSessionId:MAIN_SESSION
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
};

window.dropdigitalUpsellDecline=function(event){

  if(event)event.preventDefault();

  location.href=
    '/thank-you.html?slug='+
    encodeURIComponent(SLUG)+
    '&session_id='+
    encodeURIComponent(MAIN_SESSION);
};

const accept=document.getElementById('upsell-accept');
const decline=document.getElementById('upsell-decline');

if(accept)accept.onclick=window.dropdigitalUpsellAccept;
if(decline)decline.onclick=window.dropdigitalUpsellDecline;

})();
<\/script>`;

    const html=String(site.upsell_html).replace(
      /<\/body>/i,
      runtime+'</body>'
    );

    return res.status(200)
      .setHeader('Content-Type','text/html; charset=utf-8')
      .setHeader('Cache-Control','no-store')
      .send(html);

  }catch(error){

    console.error('[upsell]',error);

    return res.status(500).send('Upsell indisponible');
  }
}
