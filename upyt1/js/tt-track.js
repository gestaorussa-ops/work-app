/* Google Analytics (G-0GXTZ26ZJ9) — mesma configuracao do funil otkdigitalacess.
   Carregado aqui porque este arquivo entra em todas as paginas: nas estaticas
   pela tag <script src="/tt-track.js">, e nas rotas do app pela injecao do bundle.
   Em /up1, /desbloquear-saque, /lp e /lp/ o pageview automatico fica desligado,
   igual ao projeto de referencia. */
(function () {
  if (window.__gaInstalled) return;
  window.__gaInstalled = true;

  var GA_ID = "G-0GXTZ26ZJ9";
  var SEM_PAGEVIEW = ["/up1", "/desbloquear-saque", "/lp", "/lp/"];

  var tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  (document.head || document.documentElement).appendChild(tag);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", GA_ID,
    SEM_PAGEVIEW.indexOf(window.location.pathname) === -1 ? {} : { send_page_view: false });
})();

/* tt-track.js — captura de atribuição do catálogo + ViewContent com content_id.
   Os links do catálogo TikTok chegam com ?product_id=<sku_id> (e ttclid).
   Este script:
   1. Persiste product_id e ttclid em cookies first-party (30 dias)
   2. Se a tag do script tiver data-tt-vc="1", dispara ViewContent no pixel
      com o content_id real — corrigindo o diagnóstico "Content ID is missing"
   3. Deduplica por sessão: 1 ViewContent por SKU por sessão de navegação   */
(function () {
  if (window.__ttTrackInstalled) return;
  window.__ttTrackInstalled = true;

  var MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

  function setCookie(name, value) {
    if (!value) return;
    document.cookie =
      name + "=" + encodeURIComponent(value) +
      "; max-age=" + MAX_AGE + "; path=/; SameSite=Lax; Secure";
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  var params = new URLSearchParams(window.location.search);

  // 1) Captura — nunca sobrescrever valor válido com vazio
  var productId = params.get("product_id") || "";
  var ttclid = params.get("ttclid") || "";
  if (productId) setCookie("tt_sku", productId);
  if (ttclid) setCookie("tt_ttclid", ttclid);

  // 2) InitiateCheckout com content_id, no clique de qualquer botão de compra.
  //    Todo checkout do funil monta a URL por window.forwardParamsToCheckout, então
  //    envolver essa função pega todos de uma vez, sem depender do texto do botão.
  //    A UTMify também dispara InitiateCheckout, mas o dela vai SEM content_id — é
  //    por isso que o TikTok acusa "eventos sem IDs de conteúdo". Desligue o da UTMify
  //    no painel para não contar duas vezes.
  var VALOR_POR_ROTA = {
    "/confirmar-saque": 37.12,
    "/back-redirect": 37.12
  };

  function dispararInitiateCheckout() {
    var s = productId || getCookie("tt_sku");
    if (!s) return; // sem SKU o evento nasceria sem content_id — que é o problema, não a solução
    if (!window.ttq || typeof window.ttq.track !== "function") return;

    var valor = VALOR_POR_ROTA[window.location.pathname];
    var item = { content_id: s, content_type: "product", quantity: 1 };
    var props = { contents: [item], content_type: "product" };
    if (valor) { item.price = valor; props.value = valor; props.currency = "USD"; }

    window.ttq.track("InitiateCheckout", props, {
      event_id: "ic_" + s + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8)
    });
  }

  var jaEnvolvido = false;
  function envolverCheckout() {
    if (jaEnvolvido || typeof window.forwardParamsToCheckout !== "function") return false;
    jaEnvolvido = true;
    var original = window.forwardParamsToCheckout;
    window.forwardParamsToCheckout = function () {
      try { dispararInitiateCheckout(); } catch (e) {}
      return original.apply(this, arguments);
    };
    return true;
  }
  // o param-forwarder pode ainda não ter carregado; tenta agora e reencaixa
  if (!envolverCheckout()) {
    var tentativas = 0;
    var relogio = setInterval(function () {
      if (envolverCheckout() || ++tentativas > 20) clearInterval(relogio);
    }, 500);
  }

  // 3) ViewContent apenas em páginas de produto (opt-in via data-tt-vc)
  var self = document.currentScript;
  var shouldFire = self && self.getAttribute("data-tt-vc") === "1";
  if (!shouldFire) return;

  var sku = productId || getCookie("tt_sku");
  if (!sku) return; // sem SKU não há o que enviar — evento vazio é o problema, não a solução

  // 4) Dedupe por sessão/SKU (re-render, back/forward, F5)
  var guard = "tt_vc_" + sku;
  try {
    if (sessionStorage.getItem(guard)) return;
  } catch (e) { /* storage bloqueado: dispara mesmo assim */ }

  var eventId = "vc_" + sku + "_" + Date.now().toString(36) +
    "_" + Math.random().toString(36).slice(2, 8);

  function fire() {
    if (!window.ttq || typeof window.ttq.track !== "function") return false;
    window.ttq.track("ViewContent", {
      contents: [{ content_id: sku, content_type: "product", quantity: 1 }],
      content_type: "product"
    }, { event_id: eventId });
    try { sessionStorage.setItem(guard, "1"); } catch (e) {}
    return true;
  }

  // ttq pode ainda não ter carregado; tenta agora e reencaixa no load
  if (!fire()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (fire() || ++tries > 20) clearInterval(timer); // ~10s de janela
    }, 500);
  }

  // GARANTE O param-forwarder.js NESTA PAGINA.
  //
  // As quatro paginas com link de checkout (/lp-page/, /up1/, /upsell-1/,
  // /upsell-4/) carregam este arquivo mas NAO carregavam o forwarder. Media-se
  // no IPN: o tt-track guardava o ttclid no cookie, o link de checkout saia
  // limpo, e toda venda chegava com "ttclid": false.
  //
  // Amarrado aqui, e nao numa tag <script> por pagina, porque a proxima pagina
  // de venda esqueceria a tag de novo. Quem tem tt-track tem forwarder.
  //
  // Carga dupla e inofensiva: o forwarder sai na primeira linha se
  // window.__paramForwarderInstalled ja estiver marcado.
  (function garanteForwarder() {
    if (window.__paramForwarderInstalled) return;
    if (document.querySelector('script[src*="param-forwarder"]')) return;

    var s = document.createElement("script");
    s.src = "/param-forwarder.js";
    s.async = false;   // ordem importa: o forwarder le os cookies que este arquivo grava
    (document.head || document.documentElement).appendChild(s);
  })();

})();
