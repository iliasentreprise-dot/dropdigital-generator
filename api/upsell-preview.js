const SUPABASE_URL='https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

export default async function handler(req,res){

  try{

    const slug=String(
      req.query?.slug||''
    ).trim();

    if(!slug){
      return res
        .status(400)
        .send('Upsell invalide');
    }

    const url=new URL(
      `${SUPABASE_URL}/rest/v1/published_sites`
    );

    url.searchParams.set(
      'slug',
      `eq.${slug}`
    );

    url.searchParams.set(
      'is_published',
      'eq.true'
    );

    url.searchParams.set(
      'select',
      'title,upsell_html'
    );

    url.searchParams.set(
      'limit',
      '1'
    );

    const response=await fetch(
      url,
      {
        headers:{
          apikey:SUPABASE_ANON_KEY,
          Authorization:
            `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if(!response.ok){
      return res
        .status(500)
        .send('Upsell indisponible');
    }

    const [site]=await response.json();

    if(!site?.upsell_html){
      return res
        .status(404)
        .send('Aucune page upsell publiée.');
    }

    /*
      Preview web réelle :
      rendu identique à la page publiée,
      mais aucun achat possible depuis cette URL.
    */
    const previewRuntime=`
<script>
(function(){

  function blockPreviewAction(event){
    if(event){
      event.preventDefault();
      event.stopPropagation();
    }

    alert(
      'Mode aperçu — cette action sera disponible après le paiement principal.'
    );

    return false;
  }

  const accept=
    document.getElementById('upsell-accept');

  const decline=
    document.getElementById('upsell-decline');

  if(accept){
    accept.addEventListener(
      'click',
      blockPreviewAction,
      true
    );
  }

  if(decline){
    decline.addEventListener(
      'click',
      blockPreviewAction,
      true
    );
  }

})();
<\\/script>`;

    let html=
      String(site.upsell_html);

    if(/<\/body>/i.test(html)){
      html=html.replace(
        /<\/body>/i,
        previewRuntime+'</body>'
      );
    }else{
      html+=previewRuntime;
    }

    return res
      .status(200)
      .setHeader(
        'Content-Type',
        'text/html; charset=utf-8'
      )
      .setHeader(
        'Cache-Control',
        'no-store'
      )
      .send(html);

  }catch(error){

    console.error(
      '[upsell-preview]',
      error
    );

    return res
      .status(500)
      .send('Upsell indisponible');
  }
}
