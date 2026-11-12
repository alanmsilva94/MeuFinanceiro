/* Objeto global da aplicação. Todos os outros scripts registram suas funções aqui.
   Carregado primeiro, antes de qualquer outro arquivo .js. */
(function () {
  'use strict';

  function criarEventos() {
    const ouvintes = {};
    return {
      on(nome, funcao) {
        (ouvintes[nome] = ouvintes[nome] || []).push(funcao);
      },
      emit(nome, dados) {
        (ouvintes[nome] || []).forEach(function (funcao) {
          try {
            funcao(dados);
          } catch (erro) {
            console.error('Erro ao tratar o evento "' + nome + '":', erro);
          }
        });
      },
    };
  }

  window.App = {
    versao: '1.8.0 (novo visual)',
    eventos: criarEventos(),
    estado: {
      mes: null, // 'AAAA-MM' do seletor do cabeçalho
    },
  };
})();
