/* Run after buyer-plans-engine.js, before loading any project data. */
(function(){
'use strict';
const E=window.EvoraEngine;
if(!E?.sacoc||!E?.buyerPlans)throw new Error('Não foi possível carregar o suporte a planos SACOC.');
E.sacoc.integratePlans();
})();
