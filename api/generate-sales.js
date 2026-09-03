const SUPABASE_URL = 'https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

function send(res,status,body){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
async function hasProAccess(token){
  const userResponse=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
  if(!userResponse.ok)return false;const user=await userResponse.json();
  const url=new URL(`${SUPABASE_URL}/rest/v1/member_subscriptions`);url.searchParams.set('user_id',`eq.${user.id}`);url.searchParams.set('select','plan,status,current_period_end');url.searchParams.set('limit','1');
  const response=await fetch(url,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});if(!response.ok)return false;
  const [sub]=await response.json();return Boolean(sub&&['discovery','pro','business'].includes(sub.plan)&&['active','trialing'].includes(sub.status)&&(!sub.current_period_end||new Date(sub.current_period_end)>new Date()));
}
function extractDocuments(text){const value=String(text||'').trim().replace(/^```html\s*/i,'').replace(/```\s*$/,'');const parts=value.split('<!-- UPSELL_DOCUMENT -->');return {html:String(parts[0]||'').trim(),upsellHtml:String(parts[1]||'').trim()};}

export default async function handler(req,res){
  if(req.method!=='POST')return send(res,405,{error:'Méthode non autorisée.'});
  try{
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    if(!token||!(await hasProAccess(token)))return send(res,403,{error:'Le plan Pro actif est requis.'});
    if(!process.env.ANTHROPIC_API_KEY)return send(res,503,{error:'La clé API Claude doit encore être connectée dans Vercel.'});
    const product=req.body?.product||{},brief=req.body?.brief||{},theme=req.body?.theme||{};
    const freeLovablePrompt=String(req.body?.lovablePrompt||product.prompt_lovable||'').trim();
    const prompt=`Tu es à la fois un copywriter de conversion francophone d'élite, un directeur artistique digital et un développeur front-end senior. Le brief ci-dessous était initialement destiné à Lovable dans l'offre gratuite. Utilise-le comme point de départ, enrichis-le fortement, puis réalise toi-même le site final. Tu ne dois reprendre aucun template HTML existant : invente une direction, une structure et une mise en page propres à ce produit précis.

PROMPT LOVABLE DE DÉPART (À AMÉLIORER, PAS À RECOPIER) :
${freeLovablePrompt||'Créer une page de vente complète, premium, responsive et connectée au lien de paiement.'}

QUESTIONNAIRE CLIENT :\n${JSON.stringify(brief)}
COULEUR CHOISIE ET PALETTE :\n${JSON.stringify(theme)}
EBOOK COMPLET GÉNÉRÉ :\n${JSON.stringify(product)}

 Retourne exactement DEUX documents HTML autonomes, sans markdown ni explication, dans cet ordre : la page de vente principale, puis le séparateur exact <!-- UPSELL_DOCUMENT -->, puis la page Upsell 1. Chaque document commence par <!doctype html> et contient son propre CSS et JavaScript.

MISSION COPYWRITING :
- Lis réellement tout l'ebook avant d'écrire. Le titre choisi par l'utilisateur est définitif et doit rester exactement « ${String(brief.offre||product.titre_produit||'')} ».
- Trouve l'angle de vente, le niveau de conscience de la cible, son problème concret, le mécanisme distinctif du produit et les objections à lever.
- Construis un parcours fluide : hero précis, identification au problème, aggravation mesurée, nouvelle opportunité/mécanisme, transformation attendue, contenu réel de la méthode, bénéfices, pour qui/pas pour qui, objections/FAQ, garantie si elle existe, puis CTA final.
- Écris des titres spécifiques, des transitions naturelles et des CTA adaptés au produit. Évite les formules génériques, le jargon marketing, les répétitions et les blocs interminables.
- Vends une méthode ou un programme, pas « un simple ebook ». Ne révèle pas tout le contenu, mais reste strictement fidèle aux chapitres.

MISSION DESIGN ET CODE :
- Commence par choisir une direction artistique propre à CE produit : clair ou sombre, duo typographique, composition, formes, textures et rythme des sections. Change réellement de direction d'un produit à l'autre. N'utilise jamais automatiquement un fond noir/vert, Bebas Neue, une bannière d'urgence ou le même ordre de sections.
- Crée un design premium original depuis une page blanche, très détaillé, responsive mobile/desktop, avec texture subtile, profondeur, typographie forte via Google Fonts, hiérarchie visuelle nette et une représentation sur mesure du produit. Inspire-toi du niveau de finition de Lovable, pas d'un template Dropdigital.
- Déduis toi-même motifs, typographie, composants et mise en page depuis la niche et la couleur choisie. Ne demande aucune personnalisation supplémentaire.
- Utilise les illustrations de l'ebook lorsqu'elles sont disponibles et pertinentes. Sinon crée des compositions CSS/SVG originales. Évite les photos stock génériques et les faux mockups répétitifs.
- Ajoute des animations sobres, de vrais états hover/focus, une navigation clavier correcte, du HTML sémantique et un chargement rapide.
- Relie tous les CTA au lien Stripe du questionnaire. Si le lien manque, utilise #checkout et rends-le facile à remplacer.
- Ajoute sur la page principale un order bump pertinent et peu coûteux, présenté par une case non cochée par défaut près de l'achat. Explique sa valeur en deux lignes et affiche clairement son prix. Le total doit se mettre à jour en JavaScript quand la case est cochée ou décochée.
- L'order bump doit être visible dans un véritable bloc de commande identifié par id="order-bump". Il doit contenir une checkbox utilisable, un prix, le total initial et le total avec bump. Tous les CTA principaux doivent mener à ce bloc de commande.
- N'invente aucune statistique, aucun résultat client, aucune fausse rareté ni aucun témoignage présenté comme réel. Lorsqu'une preuve manque, crée un emplacement éditable clairement signalé avant publication.
- La garantie de remboursement appartient à cette page de vente uniquement ; ne la présente pas comme du contenu de l'ebook.

PAGE UPSELL 1 :
- Génère une vraie seconde page après achat, cohérente avec le produit mais visuellement très épurée : fond entièrement blanc, texte presque noir, largeur de lecture proche de 640 px et une seule couleur d'accent forte dérivée de la couleur choisie.
- Reprends l'esprit de la référence fournie : bande de confirmation en haut, grand titre direct « Attends… », offre complémentaire unique, liste de bénéfices bordée par la couleur d'accent, ancien prix et nouveau prix très visible, gros bouton d'acceptation, lien discret « Non merci », puis FAQ courte.
- Imagine un upsell réellement complémentaire à l'ebook (accompagnement, plan avancé, outils ou pack pratique) sans inventer une prestation humaine que le vendeur n'a pas indiquée. Les prix et textes doivent être faciles à modifier dans le code.
- Préserve customerId et paymentMethodId depuis les paramètres d'URL dans les liens/actions. Ne simule pas de prélèvement : le bouton d'acceptation doit pointer vers #upsell-checkout tant que le backend de paiement one-click n'est pas configuré.
- N'utilise une urgence ou une exclusivité que si elle est vraie ; sinon, remplace-la par une formulation honnête d'offre post-achat.

CONTRÔLE OBLIGATOIRE AVANT DE RÉPONDRE :
- Le premier document contient bien id="order-bump", une checkbox et un total mis à jour par JavaScript.
- Le second document est une page Upsell 1 complète et autonome, pas une section du premier document.
- Les deux documents sont différents, valides, utilisables et ne contiennent aucun texte expliquant leur génération.

Le résultat doit ressembler à une création sur mesure de haut niveau, jamais à un template répétitif.`;
    const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-5',max_tokens:16000,messages:[{role:'user',content:prompt}]})});
    const payload=await response.json();if(!response.ok){console.error('Claude sales generation failed',response.status,payload?.error?.type||'unknown');return send(res,502,{error:'Claude n’a pas pu terminer la page de vente. Réessaie dans un instant.'});}
    const {html,upsellHtml}=extractDocuments((payload.content||[]).filter(x=>x.type==='text').map(x=>x.text).join(''));
    if(!/^<!doctype html>/i.test(html)||html.length<3000||!/^<!doctype html>/i.test(upsellHtml)||upsellHtml.length<1800)return send(res,502,{error:'Claude a renvoyé un tunnel incomplet. Réessaie.'});
    return send(res,200,{html,upsellHtml});
  }catch(error){console.error('Sales route failed',error);return send(res,500,{error:'Erreur temporaire du générateur de page de vente.'});}
}
