/* Avisos rápidos no canto da tela. Uso: App.aviso.sucesso('Despesa salva.') */
(function () {
  'use strict';

  const ICONES = { sucesso: 'check_circle', erro: 'error', alerta: 'warning', info: 'info' };
  const DURACAO = { sucesso: 4000, info: 5000, alerta: 8000, erro: 10000 };
  let area = null;

  function obterArea() {
    if (!area) {
      area = document.createElement('div');
      area.className = 'avisos';
      area.setAttribute('role', 'status');
      area.setAttribute('aria-live', 'polite');
      document.body.appendChild(area);
    }
    return area;
  }

  function mostrar(tipo, mensagem) {
    const aviso = document.createElement('div');
    aviso.className = 'aviso aviso--' + tipo;
    aviso.innerHTML =
      '<span class="icone" aria-hidden="true">' + ICONES[tipo] + '</span>' +
      '<p>' + App.util.escaparHtml(mensagem) + '</p>' +
      '<button type="button" aria-label="Fechar aviso"><span class="icone" aria-hidden="true">close</span></button>';
    function fechar() {
      aviso.remove();
    }
    aviso.querySelector('button').addEventListener('click', fechar);
    obterArea().appendChild(aviso);
    setTimeout(fechar, DURACAO[tipo]);
  }

  App.aviso = {
    sucesso: function (m) {
      mostrar('sucesso', m);
    },
    erro: function (m) {
      mostrar('erro', m);
    },
    alerta: function (m) {
      mostrar('alerta', m);
    },
    info: function (m) {
      mostrar('info', m);
    },
  };
})();
